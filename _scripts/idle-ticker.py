#!/usr/bin/env python3
"""
HAL-O Idle Ticker — Python daemon that monitors user activity and triggers
backlog work after a configurable idle period.

Runs INDEPENDENTLY of Claude (like session-guardian.py). Survives session
switches, compactions, and crashes.

Usage:
    python _scripts/idle-ticker.py [--project-dir D:/GitHub/hal-o] [--idle-minutes 60] [--check-interval 300]

How it works:
    1. Hooks in settings.json write epoch timestamp to /tmp/claude_last_user_input.txt
       on every UserPromptSubmit and SessionStart.
    2. This daemon polls that file every --check-interval seconds (default 5 min).
    3. If the timestamp is older than --idle-minutes (default 60), it:
       a. Reads BACKLOG.md and extracts the top pending items
       b. Writes a formatted message to /tmp/claude_telegram_msg.txt
          (the idle_prompt hook picks it up and sends via TG)
       c. Also sends a direct TG notification as backup
    4. Won't re-trigger until user input resets the timestamp (debounce).
    5. OVERNIGHT MODE: If ~/.hal-o/overnight-enabled exists and idle >= 60min,
       runs overnight-orchestrator.py in dry-run to queue tasks and notifies TG.
       Does NOT auto-start execution — user must approve.

Instance-aware: reads instance.json for clone detection (same as session-guardian.py).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────

HOME = Path(os.environ.get("USERPROFILE", os.environ.get("HOME", "~")))
CREDENTIALS = HOME / ".claude_credentials"

# On Windows Git Bash, /tmp maps to the Git install's tmp dir.
# Use the same /tmp path that the bash hooks use, resolved via MSYS.
TIMESTAMP_FILE = Path("/tmp/claude_last_user_input.txt")
TG_MSG_FILE = Path("/tmp/claude_telegram_msg.txt")

DEFAULT_IDLE_MINUTES = 60
DEFAULT_CHECK_INTERVAL = 300  # 5 minutes

# Overnight mode
OVERNIGHT_ENABLED_FLAG = HOME / ".hal-o" / "overnight-enabled"
OVERNIGHT_ORCHESTRATOR = Path("_scripts/overnight-orchestrator.py")


# ── Credential Loading ──────────────────────────────────────────────────────

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


# ── Instance Detection ──────────────────────────────────────────────────────

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


# ── Backlog Parsing ─────────────────────────────────────────────────────────

def parse_backlog(project_dir: Path, max_items: int = 3) -> list[str]:
    """Read BACKLOG.md and extract the top N pending items from the first 'Next' section."""
    backlog_path = project_dir / "BACKLOG.md"
    if not backlog_path.exists():
        return ["(BACKLOG.md not found)"]

    content = backlog_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    items = []
    in_next_section = False

    for line in lines:
        stripped = line.strip()

        # Look for a "### ... (Next)" header — there may be multiple
        if re.match(r"^###.*\(Next\)", stripped, re.IGNORECASE):
            in_next_section = True
            continue

        # Stop at non-"(Next)" section header (but allow consecutive Next sections)
        if in_next_section and stripped.startswith("##"):
            if re.match(r"^###.*\(Next\)", stripped, re.IGNORECASE):
                continue  # Another (Next) section, keep collecting
            else:
                in_next_section = False
                if len(items) >= max_items:
                    break
                continue

        # Collect bullet items (not done items)
        if in_next_section and stripped.startswith("- ") and not stripped.endswith(" ✓"):
            # Clean up the item text
            item_text = stripped[2:].strip()
            if item_text:
                items.append(item_text)
                if len(items) >= max_items:
                    break

    if not items:
        # Fallback: scan for any "### Future:" or "## Priority:" section
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("- ") and not stripped.endswith(" ✓"):
                item_text = stripped[2:].strip()
                if item_text and not item_text.startswith("("):
                    items.append(item_text)
                    if len(items) >= max_items:
                        break

    return items if items else ["(No pending backlog items found)"]


# ── Timestamp Reading ───────────────────────────────────────────────────────

def read_last_input_time() -> float | None:
    """Read the epoch timestamp from the user input file.

    Handles multiple possible /tmp locations on Windows:
    - Git Bash /tmp (C:/Users/<user>/AppData/Local/Temp or the MSYS tmp)
    - Direct path written by bash hooks
    """
    candidates = [
        TIMESTAMP_FILE,
        Path(os.environ.get("TEMP", "")) / "claude_last_user_input.txt",
        Path(os.environ.get("TMP", "")) / "claude_last_user_input.txt",
        HOME / "AppData" / "Local" / "Temp" / "claude_last_user_input.txt",
    ]

    for path in candidates:
        if path.exists():
            try:
                content = path.read_text().strip()
                if content:
                    return float(content)
            except (ValueError, OSError):
                continue

    return None


def get_idle_seconds() -> float | None:
    """Get how many seconds since last user input. None if no timestamp found."""
    last_input = read_last_input_time()
    if last_input is None:
        return None
    return time.time() - last_input


# ── Telegram ────────────────────────────────────────────────────────────────

def send_tg_notification(creds: dict, instance: dict, message: str):
    """Send a Telegram notification directly via curl."""
    token = creds.get(instance["token_key"], creds.get("TELEGRAM_BOT_TOKEN", ""))
    chat_id = creds.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        log("WARNING: Missing TG token or chat_id, cannot send notification")
        return
    try:
        subprocess.run(
            ["curl", "-s",
             f"https://api.telegram.org/bot{token}/sendMessage",
             "-d", f"chat_id={chat_id}",
             "--data-urlencode", f"text={message}"],
            capture_output=True, timeout=10
        )
        log("TG notification sent")
    except Exception as e:
        log(f"TG send failed: {e}")


def write_idle_prompt_file(message: str):
    """Write message to /tmp/claude_telegram_msg.txt for the idle_prompt hook to pick up."""
    candidates = [
        TIMESTAMP_FILE.parent / "claude_telegram_msg.txt",
        Path(os.environ.get("TEMP", "")) / "claude_telegram_msg.txt",
    ]

    for path in candidates:
        try:
            path.write_text(message, encoding="utf-8")
            log(f"Wrote idle prompt file: {path}")
            return
        except OSError:
            continue

    log("WARNING: Could not write idle prompt file to any /tmp location")


# ── Logging ─────────────────────────────────────────────────────────────────

def log(msg: str):
    """Log with timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Overnight Mode ──────────────────────────────────────────────────────────

def is_overnight_enabled() -> bool:
    """Check if overnight mode is enabled via flag file."""
    return OVERNIGHT_ENABLED_FLAG.exists()


def run_overnight_orchestrator(project_dir: Path) -> tuple[bool, str]:
    """Run the overnight orchestrator in dry-run mode to preview tasks.

    Returns (success, output_text).
    """
    orchestrator = project_dir / OVERNIGHT_ORCHESTRATOR
    if not orchestrator.exists():
        return False, f"Orchestrator not found: {orchestrator}"

    try:
        result = subprocess.run(
            [sys.executable, str(orchestrator), "--dry-run",
             "--project-dir", str(project_dir)],
            capture_output=True, text=True, timeout=30,
            cwd=str(project_dir),
        )
        output = result.stdout + result.stderr
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Orchestrator timed out (30s)"
    except Exception as e:
        return False, f"Orchestrator error: {e}"


def extract_task_summary_from_output(output: str) -> str:
    """Extract a concise task summary from orchestrator dry-run output."""
    lines = output.splitlines()
    summary_lines = []
    in_selected = False
    task_count = 0

    for line in lines:
        # Look for the SELECTED section
        if "SELECTED FOR OVERNIGHT" in line:
            in_selected = True
            continue
        # Stop at next section header
        if in_selected and ("====" in line or "SPAWN COMMANDS" in line):
            in_selected = False
            continue
        # Collect task lines
        if in_selected and line.strip():
            stripped = line.strip()
            if stripped and stripped[0].isdigit():
                summary_lines.append(stripped)
                task_count += 1

    if not summary_lines:
        # Fallback: count "Safe:" lines
        safe_count = sum(1 for l in lines if "SAFE" in l and "|" in l)
        return f"{safe_count} safe tasks identified (details in orchestrator output)"

    return "\n".join(summary_lines)


# ── Main Loop ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HAL-O Idle Ticker Daemon")
    parser.add_argument("--project-dir", default="D:/GitHub/hal-o",
                        help="Project directory (default: D:/GitHub/hal-o)")
    parser.add_argument("--idle-minutes", type=int, default=DEFAULT_IDLE_MINUTES,
                        help=f"Minutes of silence before triggering (default: {DEFAULT_IDLE_MINUTES})")
    parser.add_argument("--check-interval", type=int, default=DEFAULT_CHECK_INTERVAL,
                        help=f"Seconds between checks (default: {DEFAULT_CHECK_INTERVAL})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would happen without sending notifications")
    args = parser.parse_args()

    project_dir = Path(args.project_dir)
    instance = detect_instance(project_dir)
    creds = load_credentials()
    idle_threshold = args.idle_minutes * 60  # convert to seconds

    # State: tracks whether we already triggered for the current idle period
    has_triggered = False
    overnight_triggered = False  # separate flag for overnight mode
    last_known_input_time = read_last_input_time()

    log("=" * 60)
    log("HAL-O Idle Ticker started")
    log(f"  Instance    : {instance['name']} ({'clone' if instance['is_clone'] else 'main'})")
    log(f"  Project dir : {project_dir}")
    log(f"  Idle trigger: {args.idle_minutes} min ({idle_threshold}s)")
    log(f"  Check every : {args.check_interval}s")
    log(f"  Token key   : {instance['token_key']}")
    log(f"  Dry run     : {args.dry_run}")
    log(f"  Overnight   : {'ENABLED' if is_overnight_enabled() else 'disabled'}")
    log(f"  Daemon PID  : {os.getpid()}")
    log("=" * 60)

    if not args.dry_run:
        send_tg_notification(
            creds, instance,
            f"[Idle Ticker] Daemon started for {instance['name']}. "
            f"Will trigger backlog after {args.idle_minutes}min idle."
        )

    while True:
        try:
            current_input_time = read_last_input_time()
            idle_seconds = get_idle_seconds()

            # Detect new user input (timestamp advanced) — reset trigger state
            if current_input_time is not None and current_input_time != last_known_input_time:
                if has_triggered or overnight_triggered:
                    log("User input detected — resetting idle + overnight triggers")
                    has_triggered = False
                    overnight_triggered = False
                last_known_input_time = current_input_time

            if idle_seconds is None:
                log("No timestamp file found — waiting for first user input")
            else:
                idle_min = idle_seconds / 60
                log(f"Idle: {idle_min:.1f} min (threshold: {args.idle_minutes} min) "
                    f"| triggered={has_triggered}")

                if idle_seconds >= idle_threshold and not has_triggered:
                    # Time to trigger!
                    log("IDLE THRESHOLD REACHED — triggering backlog notification")

                    backlog_items = parse_backlog(project_dir)
                    items_text = "\n".join(f"  {i+1}. {item}" for i, item in enumerate(backlog_items))

                    message = (
                        f"[Idle Ticker] No user input for {args.idle_minutes} min. "
                        f"Starting backlog work.\n\n"
                        f"Top items from BACKLOG.md:\n{items_text}\n\n"
                        f"Pick the highest-priority item and begin."
                    )

                    if args.dry_run:
                        log(f"DRY RUN — would send:\n{message}")
                    else:
                        # Method 1: Write to idle_prompt hook file
                        write_idle_prompt_file(message)

                        # Method 2: Direct TG notification as backup
                        send_tg_notification(creds, instance, message)

                    has_triggered = True
                    log("Trigger sent. Will not re-trigger until user input resets timestamp.")

                # Overnight mode: trigger orchestrator after same idle period
                if idle_seconds >= idle_threshold and not overnight_triggered and is_overnight_enabled():
                    log("OVERNIGHT MODE: Flag detected + idle threshold reached")

                    success, output = run_overnight_orchestrator(project_dir)
                    task_summary = extract_task_summary_from_output(output)

                    if success:
                        overnight_msg = (
                            f"[Overnight] Autonomous mode ready. "
                            f"Idle {args.idle_minutes}+ min.\n\n"
                            f"Queued tasks:\n{task_summary}\n\n"
                            f"Reply 'go' to approve overnight execution.\n"
                            f"Reply 'skip' to cancel.\n"
                            f"(Auto-start is disabled — user approval required)"
                        )
                    else:
                        overnight_msg = (
                            f"[Overnight] Orchestrator failed:\n{output[:500]}"
                        )

                    if args.dry_run:
                        log(f"DRY RUN — overnight notification:\n{overnight_msg}")
                    else:
                        send_tg_notification(creds, instance, overnight_msg)

                    overnight_triggered = True
                    log("Overnight notification sent. Awaiting user approval.")

        except KeyboardInterrupt:
            log("Idle Ticker stopped by user.")
            if not args.dry_run:
                send_tg_notification(creds, instance, "[Idle Ticker] Daemon stopped.")
            break
        except Exception as e:
            log(f"Error in main loop: {e}")

        time.sleep(args.check_interval)

    log("=== Idle Ticker exited ===")


if __name__ == "__main__":
    main()
