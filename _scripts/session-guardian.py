#!/usr/bin/env python3
"""
HAL-O Session Guardian — Python daemon that ensures Claude session reliability.

Runs INDEPENDENTLY of Claude. Monitors the session, auto-relaunches on crash,
validates tokens, and enforces hard rules that Claude's memory can't.

Usage:
    python _scripts/session-guardian.py [--instance hal-o] [--interval 30]

Features:
    1. Monitors Claude PID — auto-relaunches with correct flags if it dies
    2. Validates TG token in .env matches expected instance token
    3. Writes/maintains session.lock for session-lifecycle protection
    4. Sends TG notification on crash + relaunch
    5. Prevents Electron app from killing the primary session (lock file)
"""

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────

HOME = Path(os.environ.get("USERPROFILE", os.environ.get("HOME", "~")))
CREDENTIALS = HOME / ".claude_credentials"
CHANNELS_DIR = HOME / ".claude" / "channels" / "telegram"
ENV_FILE = CHANNELS_DIR / ".env"

CHECK_INTERVAL = 30  # seconds between checks
MAX_RESTARTS = 10    # max restarts before giving up
RESTART_COOLDOWN = 5 # seconds between restart attempts


def load_credentials() -> dict:
    """Load credentials from ~/.claude_credentials."""
    creds = {}
    if not CREDENTIALS.exists():
        return creds
    for line in CREDENTIALS.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        if "=" in line:
            key, val = line.split("=", 1)
            creds[key.strip()] = val.strip().strip("'\"")
    return creds


def detect_instance(project_dir: Path) -> dict:
    """Detect instance config from instance.json or defaults."""
    instance_json = project_dir / "instance.json"
    if instance_json.exists():
        try:
            data = json.loads(instance_json.read_text())
            return {
                "id": data.get("id", "hal-o"),
                "name": data.get("name", "HAL-O"),
                "is_clone": True,
                "token_key": "TELEGRAM_MAIN_BOT_TOKEN",
            }
        except json.JSONDecodeError:
            pass
    return {
        "id": "hal-o",
        "name": "HAL-O",
        "is_clone": False,
        "token_key": "TELEGRAM_BOT_TOKEN",
    }


def get_data_dir(instance: dict) -> Path:
    """Get the data directory for this instance."""
    base = HOME / ".hal-o"
    if instance["is_clone"]:
        return base / "instances" / instance["id"]
    return base


def find_claude_process(instance_name: str) -> dict | None:
    """Find a Claude process matching this instance name."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             'Get-CimInstance Win32_Process -Filter "Name=\'claude.exe\'" | '
             'Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation'],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().split("\n")[1:]:
            match = re.match(r'"(\d+)","(.+)"', line)
            if not match:
                continue
            pid = int(match.group(1))
            cmd = match.group(2)
            # Match this instance name (Windows CSV escapes quotes as "")
            cmd_clean = cmd.replace('""', '"')
            if f'-n "{instance_name}"' in cmd_clean or f"-n {instance_name}" in cmd_clean:
                return {
                    "pid": pid,
                    "cmd": cmd,
                    "has_channels": "--channels" in cmd,
                    "has_skip_permissions": "--dangerously-skip-permissions" in cmd,
                }
    except Exception as e:
        log(f"Process scan failed: {e}")
    return None


def is_pid_alive(pid: int) -> bool:
    """Check if a PID is still running."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"Get-Process -Id {pid} -ErrorAction SilentlyContinue | Select-Object Id"],
            capture_output=True, text=True, timeout=5
        )
        return str(pid) in result.stdout
    except Exception:
        return False


def write_lock(lock_path: Path, pid: int, has_channels: bool, instance_name: str):
    """Write session lock file."""
    lock_data = {
        "pid": pid,
        "hasChannels": has_channels,
        "instanceName": instance_name,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "guardianPid": os.getpid(),
    }
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.write_text(json.dumps(lock_data, indent=2))
    log(f"Lock written: PID {pid}, channels={has_channels}")


def read_lock(lock_path: Path) -> dict | None:
    """Read session lock file."""
    if not lock_path.exists():
        return None
    try:
        return json.loads(lock_path.read_text())
    except Exception:
        return None


def validate_token(instance: dict, creds: dict) -> bool:
    """Check that .env has the correct token for this instance."""
    if not ENV_FILE.exists():
        log("WARNING: .env file missing!")
        return False

    env_content = ENV_FILE.read_text().strip()
    env_match = re.match(r"TELEGRAM_BOT_TOKEN=(.+)", env_content)
    if not env_match:
        log("WARNING: .env has no TELEGRAM_BOT_TOKEN!")
        return False

    env_token = env_match.group(1).strip()
    expected_token = creds.get(instance["token_key"], "")

    if not expected_token:
        log(f"WARNING: {instance['token_key']} not found in credentials!")
        return False

    if env_token == expected_token:
        return True
    else:
        log(f"TOKEN MISMATCH! .env has {env_token[:15]}..., expected {expected_token[:15]}...")
        # Auto-fix: write correct token
        ENV_FILE.write_text(f"TELEGRAM_BOT_TOKEN={expected_token}\n")
        log("AUTO-FIXED: Wrote correct token to .env")
        return True


def send_tg_notification(creds: dict, instance: dict, message: str):
    """Send a Telegram notification."""
    token = creds.get(instance["token_key"], creds.get("TELEGRAM_BOT_TOKEN", ""))
    chat_id = creds.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return
    try:
        subprocess.run(
            ["curl", "-s",
             f"https://api.telegram.org/bot{token}/sendMessage",
             "-d", f"chat_id={chat_id}",
             "--data-urlencode", f"text=[Guardian] {message}"],
            capture_output=True, timeout=10
        )
    except Exception:
        pass


def relaunch_session(project_dir: Path, instance: dict, creds: dict) -> int | None:
    """Relaunch Claude session using the BAT file (handles all setup correctly)."""
    instance_name = instance["name"]

    # Use the bat file — it handles token, .env, channels, everything
    bat_file = project_dir / "_scripts" / "_claude_cli_resume_NOPROMPT.bat"
    if not bat_file.exists():
        bat_file = project_dir / "_scripts" / "_claude_cli_resume.bat"
    if not bat_file.exists():
        log(f"ERROR: No bat file found at {project_dir / '_scripts'}")
        return None

    log(f"Relaunching via bat: {bat_file}")
    try:
        # Use Start-Process to launch the bat in its own window (detached)
        ps_cmd = (
            f'Start-Process -FilePath cmd.exe '
            f'-ArgumentList "/c `"{bat_file}`"" '
            f'-PassThru -WindowStyle Normal'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=15
        )

        # Wait for Claude to appear — bat file needs time to load creds + launch
        time.sleep(20)
        proc = find_claude_process(instance_name)
        if proc:
            log(f"Relaunch SUCCESS: PID {proc['pid']}, channels={proc['has_channels']}")
            return proc["pid"]
        else:
            log("Relaunch FAILED: Claude not found after launch")
            return None
    except Exception as e:
        log(f"Relaunch error: {e}")
        return None


def log(msg: str):
    """Log with timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="HAL-O Session Guardian")
    parser.add_argument("--project-dir", default="D:/GitHub/hal-o", help="Project directory")
    parser.add_argument("--interval", type=int, default=CHECK_INTERVAL, help="Check interval (seconds)")
    args = parser.parse_args()

    project_dir = Path(args.project_dir)
    instance = detect_instance(project_dir)
    data_dir = get_data_dir(instance)
    lock_path = data_dir / "session.lock"
    creds = load_credentials()
    restart_count = 0

    log(f"=== Session Guardian started ===")
    log(f"Instance: {instance['name']} ({'clone' if instance['is_clone'] else 'main'})")
    log(f"Project: {project_dir}")
    log(f"Lock: {lock_path}")
    log(f"Token key: {instance['token_key']}")
    log(f"Check interval: {args.interval}s")
    log(f"Guardian PID: {os.getpid()}")

    send_tg_notification(creds, instance, f"Guardian started for {instance['name']}. Monitoring session reliability.")

    while True:
        try:
            # 1. Find Claude process
            proc = find_claude_process(instance["name"])

            if proc:
                # Session alive
                pid = proc["pid"]
                has_channels = proc["has_channels"]

                # Update lock
                write_lock(lock_path, pid, has_channels, instance["name"])

                # Validate token
                validate_token(instance, creds)

                # Warn if no channels
                if not has_channels:
                    log(f"WARNING: Session PID {pid} has NO --channels flag!")
                    send_tg_notification(creds, instance,
                        f"⚠️ Session running WITHOUT --channels (PID {pid}). TG replies won't work!")

                # Reset restart counter on stable session
                restart_count = 0

            else:
                # Session DEAD
                log(f"SESSION DEAD! No Claude process found for {instance['name']}")

                if restart_count >= MAX_RESTARTS:
                    log(f"MAX RESTARTS ({MAX_RESTARTS}) reached. Giving up. User must intervene.")
                    send_tg_notification(creds, instance,
                        f"🔴 CRITICAL: Session crashed {MAX_RESTARTS} times. Guardian giving up. Manual relaunch needed.")
                    break

                restart_count += 1
                log(f"Restart attempt {restart_count}/{MAX_RESTARTS}")
                send_tg_notification(creds, instance,
                    f"🔄 Session crashed! Auto-relaunching (attempt {restart_count}/{MAX_RESTARTS})...")

                time.sleep(RESTART_COOLDOWN)
                new_pid = relaunch_session(project_dir, instance, creds)

                if new_pid:
                    write_lock(lock_path, new_pid, True, instance["name"])
                    send_tg_notification(creds, instance,
                        f"✅ Session relaunched (PID {new_pid}). Back online.")
                else:
                    send_tg_notification(creds, instance,
                        f"❌ Relaunch failed. Retrying in {args.interval}s...")

        except KeyboardInterrupt:
            log("Guardian stopped by user.")
            send_tg_notification(creds, instance, "Guardian stopped.")
            break
        except Exception as e:
            log(f"Guardian error: {e}")

        time.sleep(args.interval)

    # Cleanup
    if lock_path.exists():
        lock_path.unlink()
    log("=== Guardian exited ===")


if __name__ == "__main__":
    main()
