#!/usr/bin/env python3
"""
HAL-O Anthropic Watcher — Python daemon that monitors Claude Code releases
and sends an HTML diff report to Telegram when new versions are detected.

Runs INDEPENDENTLY of Claude (same pattern as session-guardian.py).

Usage:
    python _scripts/anthropic-watcher.py [--interval 86400] [--project-dir D:/GitHub/hal-o] [--once]

Features:
    1. Checks GitHub API for new claude-code releases every --interval seconds (default 24h)
    2. Compares against local state file (~/.hal-o/anthropic-watcher-state.json)
    3. Generates an HTML diff report with dark theme when new releases found
    4. Sends report as TG document attachment + brief text notification
    5. On no changes: logs and sends brief "no updates" message
    6. Instance-aware: reads instance.json for clone detection

State file: ~/.hal-o/anthropic-watcher-state.json (or instances/<id>/ for clones)
"""

import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Config ──────────────────────────────────────────────────────────────────

HOME = Path(os.environ.get("USERPROFILE", os.environ.get("HOME", "~")))
CREDENTIALS = HOME / ".claude_credentials"

GITHUB_API_URL = "https://api.github.com/repos/anthropics/claude-code/releases"
GITHUB_RELEASES_PER_PAGE = 10

# Also check the models page for new model announcements
MODELS_DOC_URL = "https://docs.anthropic.com/en/docs/about-claude/models"

DEFAULT_INTERVAL = 86400  # 24 hours in seconds
STATE_FILENAME = "anthropic-watcher-state.json"


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


def get_data_dir(instance: dict) -> Path:
    """Get the data directory for this instance."""
    base = HOME / ".hal-o"
    if instance["is_clone"]:
        return base / "instances" / instance["id"]
    return base


# ── State Management ────────────────────────────────────────────────────────

def load_state(state_path: Path) -> dict:
    """Load watcher state from disk."""
    if state_path.exists():
        try:
            return json.loads(state_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            log(f"WARNING: Could not read state file: {e}")
    return {
        "lastCheck": None,
        "lastVersion": None,
        "releases": [],
    }


def save_state(state_path: Path, state: dict):
    """Save watcher state to disk."""
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"State saved to {state_path}")


# ── GitHub API ──────────────────────────────────────────────────────────────

def fetch_releases(per_page: int = GITHUB_RELEASES_PER_PAGE) -> Optional[list]:
    """Fetch recent releases from GitHub API using curl."""
    url = f"{GITHUB_API_URL}?per_page={per_page}"
    try:
        result = subprocess.run(
            ["curl", "-s", "-H", "Accept: application/vnd.github+json",
             "-H", "X-GitHub-Api-Version: 2022-11-28",
             url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            log(f"curl failed (exit {result.returncode}): {result.stderr[:200]}")
            return None

        data = json.loads(result.stdout)

        # GitHub may return an error object instead of a list
        if isinstance(data, dict) and "message" in data:
            log(f"GitHub API error: {data['message']}")
            return None

        return data
    except json.JSONDecodeError as e:
        log(f"JSON parse error: {e}")
        return None
    except subprocess.TimeoutExpired:
        log("curl timed out fetching releases")
        return None
    except Exception as e:
        log(f"Fetch error: {e}")
        return None


def parse_release(release: dict) -> dict:
    """Extract the fields we care about from a GitHub release object."""
    return {
        "tag": release.get("tag_name", "unknown"),
        "name": release.get("name", ""),
        "published_at": release.get("published_at", ""),
        "html_url": release.get("html_url", ""),
        "body": release.get("body", ""),
        "prerelease": release.get("prerelease", False),
        "draft": release.get("draft", False),
    }


def diff_releases(known_tags: set, fetched: list[dict]) -> list[dict]:
    """Return releases that are new (not in known_tags)."""
    new_releases = []
    for rel in fetched:
        parsed = parse_release(rel)
        if parsed["tag"] not in known_tags and not parsed["draft"]:
            new_releases.append(parsed)
    return new_releases


# ── HTML Report Generation ──────────────────────────────────────────────────

def markdown_to_html_basic(md_text: str) -> str:
    """Very basic markdown-to-HTML for release notes. Handles headers, lists, bold, code, links."""
    if not md_text:
        return "<p><em>No release notes provided.</em></p>"

    lines = md_text.split("\n")
    html_lines = []
    in_list = False

    for line in lines:
        stripped = line.strip()

        # Close list if we're not in a list item
        if in_list and not stripped.startswith("- ") and not stripped.startswith("* "):
            html_lines.append("</ul>")
            in_list = False

        if not stripped:
            html_lines.append("<br>")
            continue

        # Headers
        if stripped.startswith("### "):
            html_lines.append(f'<h4 style="color:#7dd3fc;margin:12px 0 4px 0;">{html.escape(stripped[4:])}</h4>')
            continue
        if stripped.startswith("## "):
            html_lines.append(f'<h3 style="color:#38bdf8;margin:14px 0 6px 0;">{html.escape(stripped[3:])}</h3>')
            continue
        if stripped.startswith("# "):
            html_lines.append(f'<h2 style="color:#0ea5e9;margin:16px 0 8px 0;">{html.escape(stripped[2:])}</h2>')
            continue

        # List items
        if stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                html_lines.append('<ul style="margin:4px 0;padding-left:20px;">')
                in_list = True
            item_text = stripped[2:]
            item_text = inline_format(item_text)
            html_lines.append(f"<li>{item_text}</li>")
            continue

        # Regular paragraph
        html_lines.append(f"<p style='margin:4px 0;'>{inline_format(stripped)}</p>")

    if in_list:
        html_lines.append("</ul>")

    return "\n".join(html_lines)


def inline_format(text: str) -> str:
    """Apply inline markdown formatting: bold, code, links."""
    escaped = html.escape(text)
    # Code blocks (backticks)
    escaped = re.sub(r'`([^`]+)`', r'<code style="background:#1e293b;padding:1px 4px;border-radius:3px;color:#fbbf24;">\1</code>', escaped)
    # Bold
    escaped = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', escaped)
    # Links [text](url)
    escaped = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" style="color:#60a5fa;">\1</a>', escaped)
    return escaped


def generate_html_report(new_releases: list[dict], all_known_count: int) -> str:
    """Generate a dark-themed HTML diff report for new releases."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    release_cards = []
    for rel in new_releases:
        tag = html.escape(rel["tag"])
        name = html.escape(rel["name"] or rel["tag"])
        url = html.escape(rel["html_url"])
        published = rel["published_at"][:10] if rel["published_at"] else "unknown"
        pre_badge = '<span style="background:#f59e0b;color:#000;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:8px;">PRE-RELEASE</span>' if rel["prerelease"] else ""
        body_html = markdown_to_html_basic(rel["body"])

        release_cards.append(f"""
        <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <span style="font-size:24px;font-weight:700;color:#22d3ee;">{tag}</span>
                {pre_badge}
            </div>
            <div style="font-size:13px;color:#94a3b8;margin-bottom:12px;">
                Published: {published} &middot; <a href="{url}" style="color:#60a5fa;">View on GitHub</a>
            </div>
            <div style="font-size:14px;color:#cbd5e1;line-height:1.6;">
                {body_html}
            </div>
        </div>
        """)

    cards_html = "\n".join(release_cards) if release_cards else '<p style="color:#94a3b8;">No new releases found.</p>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code Release Update</title>
<style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
        background: #0f172a;
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
        padding: 24px;
        max-width: 800px;
        margin: 0 auto;
    }}
    a {{ text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>

<div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:40px;margin-bottom:8px;">&#x1F916;</div>
    <h1 style="font-size:28px;font-weight:700;color:#22d3ee;margin-bottom:4px;">
        Claude Code Release Update
    </h1>
    <p style="font-size:13px;color:#64748b;">
        Generated {now} &middot; {len(new_releases)} new release(s) &middot; {all_known_count} tracked total
    </p>
</div>

<div style="margin-bottom:24px;">
    <h2 style="font-size:18px;color:#38bdf8;margin-bottom:12px;border-bottom:1px solid #334155;padding-bottom:8px;">
        New Releases
    </h2>
    {cards_html}
</div>

<div style="text-align:center;padding:16px;color:#475569;font-size:12px;border-top:1px solid #1e293b;">
    HAL-O Anthropic Watcher &middot; <a href="https://github.com/anthropics/claude-code/releases" style="color:#60a5fa;">All Releases</a>
</div>

</body>
</html>"""


# ── Telegram ────────────────────────────────────────────────────────────────

def send_tg_text(creds: dict, instance: dict, message: str):
    """Send a plain text Telegram notification."""
    token = creds.get(instance["token_key"], creds.get("TELEGRAM_BOT_TOKEN", ""))
    chat_id = creds.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        log("WARNING: Missing TG token or chat_id")
        return
    try:
        subprocess.run(
            ["curl", "-s",
             f"https://api.telegram.org/bot{token}/sendMessage",
             "-d", f"chat_id={chat_id}",
             "-d", "parse_mode=HTML",
             "--data-urlencode", f"text={message}"],
            capture_output=True, timeout=15,
        )
        log("TG text notification sent")
    except Exception as e:
        log(f"TG text send failed: {e}")


def send_tg_document(creds: dict, instance: dict, file_path: Path, caption: str = ""):
    """Send an HTML file as a Telegram document attachment."""
    token = creds.get(instance["token_key"], creds.get("TELEGRAM_BOT_TOKEN", ""))
    chat_id = creds.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        log("WARNING: Missing TG token or chat_id")
        return
    try:
        cmd = [
            "curl", "-s",
            f"https://api.telegram.org/bot{token}/sendDocument",
            "-F", f"chat_id={chat_id}",
            "-F", f"document=@{file_path}",
        ]
        if caption:
            cmd += ["-F", f"caption={caption}"]
        subprocess.run(cmd, capture_output=True, timeout=30)
        log(f"TG document sent: {file_path.name}")
    except Exception as e:
        log(f"TG document send failed: {e}")


# ── Logging ─────────────────────────────────────────────────────────────────

def log(msg: str):
    """Log with timestamp."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Core Check Logic ────────────────────────────────────────────────────────

def run_check(state_path: Path, creds: dict, instance: dict, dry_run: bool = False) -> dict:
    """
    Run a single check cycle. Returns the updated state dict.
    """
    state = load_state(state_path)
    now_iso = datetime.now(timezone.utc).isoformat()

    log("Fetching releases from GitHub API...")
    fetched = fetch_releases()

    if fetched is None:
        log("ERROR: Could not fetch releases. Will retry next cycle.")
        state["lastCheck"] = now_iso
        state["lastError"] = "fetch_failed"
        save_state(state_path, state)
        return state

    log(f"Fetched {len(fetched)} releases from GitHub")

    # Build set of known tags
    known_tags = set()
    for r in state.get("releases", []):
        known_tags.add(r.get("tag", ""))

    # Find new releases
    new_releases = diff_releases(known_tags, fetched)

    # Update state
    state["lastCheck"] = now_iso
    state.pop("lastError", None)

    if new_releases:
        log(f"FOUND {len(new_releases)} NEW RELEASE(S)!")
        for rel in new_releases:
            log(f"  NEW: {rel['tag']} — {rel['name'] or '(no title)'} — published {rel['published_at'][:10] if rel['published_at'] else 'unknown'}")

        # Add new releases to state
        for rel in new_releases:
            state["releases"].append({
                "tag": rel["tag"],
                "name": rel["name"],
                "published_at": rel["published_at"],
                "detected_at": now_iso,
                "prerelease": rel["prerelease"],
            })

        # Update latest version (non-prerelease)
        stable = [r for r in new_releases if not r["prerelease"]]
        if stable:
            state["lastVersion"] = stable[0]["tag"]
        elif not state.get("lastVersion"):
            state["lastVersion"] = new_releases[0]["tag"]

        # Generate HTML report
        report_html = generate_html_report(new_releases, len(state["releases"]))

        if dry_run:
            log("DRY RUN — would send report to TG")
            # Write report locally for inspection
            report_path = state_path.parent / "anthropic-watcher-latest-report.html"
            report_path.write_text(report_html, encoding="utf-8")
            log(f"Report written to {report_path}")
        else:
            # Write temp file and send
            with tempfile.NamedTemporaryFile(mode="w", suffix=".html", prefix="claude-code-update-",
                                              delete=False, encoding="utf-8") as f:
                f.write(report_html)
                report_path = Path(f.name)

            # Build summary text
            tags_str = ", ".join(r["tag"] for r in new_releases[:5])
            pre_count = sum(1 for r in new_releases if r["prerelease"])
            stable_count = len(new_releases) - pre_count

            summary = (
                f"[Anthropic Watcher] NEW Claude Code release(s) detected!\n\n"
                f"Tags: {tags_str}\n"
                f"Stable: {stable_count}, Pre-release: {pre_count}\n\n"
                f"Full report attached."
            )

            send_tg_text(creds, instance, summary)
            send_tg_document(creds, instance, report_path, caption=f"Claude Code update: {tags_str}")

            # Cleanup temp file
            try:
                report_path.unlink()
            except OSError:
                pass

    else:
        log("No new releases detected.")
        latest = state.get("lastVersion", "unknown")
        known_count = len(state.get("releases", []))
        msg = (
            f"[Anthropic Watcher] No new Claude Code releases.\n"
            f"Latest known: {latest}\n"
            f"Tracked: {known_count} release(s)\n"
            f"Next check in ~{DEFAULT_INTERVAL // 3600}h"
        )

        if dry_run:
            log(f"DRY RUN — would send: {msg}")
        else:
            send_tg_text(creds, instance, msg)

    save_state(state_path, state)
    return state


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="HAL-O Anthropic Watcher — monitors Claude Code releases and sends TG reports"
    )
    parser.add_argument("--project-dir", default="D:/GitHub/hal-o",
                        help="Project directory for instance detection (default: D:/GitHub/hal-o)")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL,
                        help=f"Check interval in seconds (default: {DEFAULT_INTERVAL} = 24h)")
    parser.add_argument("--once", action="store_true",
                        help="Run a single check and exit (no loop)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would happen without sending TG notifications")
    parser.add_argument("--seed", action="store_true",
                        help="Seed state with current releases (mark all as known, no notification)")
    args = parser.parse_args()

    project_dir = Path(args.project_dir)
    instance = detect_instance(project_dir)
    data_dir = get_data_dir(instance)
    state_path = data_dir / STATE_FILENAME
    creds = load_credentials()

    log("=" * 64)
    log("HAL-O Anthropic Watcher started")
    log(f"  Instance     : {instance['name']} ({'clone' if instance['is_clone'] else 'main'})")
    log(f"  Project dir  : {project_dir}")
    log(f"  State file   : {state_path}")
    log(f"  Check every  : {args.interval}s ({args.interval / 3600:.1f}h)")
    log(f"  Token key    : {instance['token_key']}")
    log(f"  Mode         : {'once' if args.once else 'daemon'}{' (dry-run)' if args.dry_run else ''}{' (seed)' if args.seed else ''}")
    log(f"  Daemon PID   : {os.getpid()}")
    log("=" * 64)

    # Seed mode: fetch all releases and mark them as known without notifying
    if args.seed:
        log("SEED MODE: Fetching current releases to establish baseline...")
        fetched = fetch_releases()
        if fetched is None:
            log("ERROR: Could not fetch releases for seeding.")
            sys.exit(1)

        state = load_state(state_path)
        known_tags = {r.get("tag", "") for r in state.get("releases", [])}
        now_iso = datetime.now(timezone.utc).isoformat()
        added = 0

        for rel in fetched:
            parsed = parse_release(rel)
            if parsed["tag"] not in known_tags and not parsed["draft"]:
                state["releases"].append({
                    "tag": parsed["tag"],
                    "name": parsed["name"],
                    "published_at": parsed["published_at"],
                    "detected_at": now_iso,
                    "prerelease": parsed["prerelease"],
                })
                known_tags.add(parsed["tag"])
                added += 1
                log(f"  Seeded: {parsed['tag']} ({parsed['published_at'][:10] if parsed['published_at'] else '?'})")

        # Set latest stable version
        stable = [parse_release(r) for r in fetched if not r.get("prerelease") and not r.get("draft")]
        if stable:
            state["lastVersion"] = stable[0]["tag"]

        state["lastCheck"] = now_iso
        save_state(state_path, state)
        log(f"Seed complete: {added} new, {len(state['releases'])} total tracked releases.")
        sys.exit(0)

    # Single run mode
    if args.once:
        run_check(state_path, creds, instance, dry_run=args.dry_run)
        log("Single check complete. Exiting.")
        sys.exit(0)

    # Daemon mode: startup notification
    if not args.dry_run:
        state = load_state(state_path)
        latest = state.get("lastVersion", "unknown")
        send_tg_text(creds, instance,
            f"[Anthropic Watcher] Daemon started.\n"
            f"Monitoring Claude Code releases every {args.interval // 3600}h.\n"
            f"Latest known: {latest}"
        )

    # Main daemon loop
    while True:
        try:
            run_check(state_path, creds, instance, dry_run=args.dry_run)
        except KeyboardInterrupt:
            log("Watcher stopped by user.")
            if not args.dry_run:
                send_tg_text(creds, instance, "[Anthropic Watcher] Daemon stopped.")
            break
        except Exception as e:
            log(f"Unhandled error in main loop: {e}")

        log(f"Next check in {args.interval}s ({args.interval / 3600:.1f}h). Sleeping...")
        try:
            time.sleep(args.interval)
        except KeyboardInterrupt:
            log("Watcher stopped during sleep.")
            if not args.dry_run:
                send_tg_text(creds, instance, "[Anthropic Watcher] Daemon stopped.")
            break

    log("=== Anthropic Watcher exited ===")


if __name__ == "__main__":
    main()
