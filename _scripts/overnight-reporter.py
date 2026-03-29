#!/usr/bin/env python3
"""
HAL-O Overnight Reporter — Reads overnight progress data and generates
a dark-themed HTML executive report.

Usage:
    python _scripts/overnight-reporter.py [--dry-run] [--output report.html]

Features:
    - Reads ~/.hal-o/overnight-progress/*.json for task results
    - Reads ~/.hal-o/overnight-manifest.json for session metadata
    - Generates interactive HTML report (dark theme, exec format)
    - Shows: tasks completed/failed, commits, test results, time taken
    - Sends to Telegram as attachment (mock in --dry-run)
"""

import argparse
import io
import json
import os
import subprocess
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

# Fix Windows console encoding
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Config ──────────────────────────────────────────────────────────────────

HOME = Path(os.environ.get("USERPROFILE", os.environ.get("HOME", "~")))
DATA_DIR = HOME / ".hal-o"
PROGRESS_DIR = DATA_DIR / "overnight-progress"
MANIFEST_FILE = DATA_DIR / "overnight-manifest.json"
CREDENTIALS = HOME / ".claude_credentials"

DEFAULT_OUTPUT = DATA_DIR / "overnight-report.html"


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


# ── Data Loading ────────────────────────────────────────────────────────────

def load_manifest() -> dict | None:
    """Load the overnight manifest."""
    if not MANIFEST_FILE.exists():
        return None
    try:
        return json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def load_progress_files() -> list[dict]:
    """Load all progress JSON files."""
    if not PROGRESS_DIR.exists():
        return []

    results = []
    for f in sorted(PROGRESS_DIR.glob("task-*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            results.append(data)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: Could not load {f}: {e}", file=sys.stderr)
    return results


# ── HTML Generation ─────────────────────────────────────────────────────────

def status_badge(status: str) -> str:
    """Generate HTML badge for a status."""
    colors = {
        "passed": ("#10b981", "#064e3b"),   # green
        "failed": ("#ef4444", "#7f1d1d"),   # red
        "running": ("#f59e0b", "#78350f"),  # amber
        "queued": ("#6b7280", "#374151"),   # gray
        "skipped": ("#8b5cf6", "#4c1d95"),  # purple
    }
    fg, bg = colors.get(status, ("#9ca3af", "#1f2937"))
    return f'<span style="background:{bg};color:{fg};padding:2px 10px;border-radius:12px;font-size:0.85em;font-weight:600;">{status.upper()}</span>'


def test_indicator(result: bool | None) -> str:
    """Generate pass/fail/pending indicator."""
    if result is True:
        return '<span style="color:#10b981;">PASS</span>'
    elif result is False:
        return '<span style="color:#ef4444;">FAIL</span>'
    else:
        return '<span style="color:#6b7280;">--</span>'


def duration_str(created: str | None, completed: str | None) -> str:
    """Calculate duration string from ISO timestamps."""
    if not created or not completed:
        return "--"
    try:
        t1 = datetime.fromisoformat(created.replace("Z", "+00:00"))
        t2 = datetime.fromisoformat(completed.replace("Z", "+00:00"))
        delta = t2 - t1
        minutes = int(delta.total_seconds() / 60)
        if minutes < 60:
            return f"{minutes}min"
        hours = minutes // 60
        mins = minutes % 60
        return f"{hours}h {mins}min"
    except Exception:
        return "--"


def generate_html(tasks: list[dict], manifest: dict | None) -> str:
    """Generate the full HTML report."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Compute stats
    total = len(tasks)
    passed = sum(1 for t in tasks if t.get("status") == "passed")
    failed = sum(1 for t in tasks if t.get("status") == "failed")
    running = sum(1 for t in tasks if t.get("status") == "running")
    queued = sum(1 for t in tasks if t.get("status") == "queued")

    all_commits = []
    for t in tasks:
        all_commits.extend(t.get("commits", []))

    manifest_time = ""
    if manifest and manifest.get("createdAt"):
        try:
            mt = datetime.fromisoformat(manifest["createdAt"].replace("Z", "+00:00"))
            manifest_time = mt.strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            manifest_time = manifest["createdAt"]

    # Build task rows
    task_rows = ""
    for t in tasks:
        task_id = t.get("taskId", "?")
        title = t.get("title", "Unknown")
        status = t.get("status", "queued")
        priority = t.get("priority", "?")
        branch = t.get("branch", "--")
        error = t.get("error", "")
        tests = t.get("testResults", {})
        dur = duration_str(t.get("startedAt"), t.get("completedAt"))
        commits = t.get("commits", [])

        # Error section (collapsible)
        error_html = ""
        if error:
            error_html = f"""
            <details style="margin-top:8px;">
                <summary style="color:#ef4444;cursor:pointer;font-size:0.9em;">Error Details</summary>
                <pre style="background:#1a1a2e;padding:10px;border-radius:6px;margin-top:4px;font-size:0.85em;overflow-x:auto;color:#fca5a5;">{error}</pre>
            </details>"""

        # Commits section
        commits_html = ""
        if commits:
            commit_lines = "".join(
                f'<div style="font-size:0.85em;color:#9ca3af;padding:2px 0;"><code>{c.get("hash", "?")[:7]}</code> {c.get("message", "")}</div>'
                for c in commits
            )
            commits_html = f"""
            <details style="margin-top:8px;">
                <summary style="color:#60a5fa;cursor:pointer;font-size:0.9em;">Commits ({len(commits)})</summary>
                <div style="padding:6px 0;">{commit_lines}</div>
            </details>"""

        task_rows += f"""
        <div style="background:#1e1e2e;border:1px solid #333;border-radius:10px;padding:18px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div>
                    <span style="color:#60a5fa;font-weight:600;font-size:0.9em;">{task_id}</span>
                    <span style="color:#e2e8f0;font-weight:500;margin-left:10px;">{title}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span style="color:#6b7280;font-size:0.85em;">P{priority}</span>
                    {status_badge(status)}
                </div>
            </div>
            <div style="display:flex;gap:20px;font-size:0.85em;color:#9ca3af;margin-top:6px;">
                <span>Branch: <code style="color:#a78bfa;">{branch}</code></span>
                <span>Duration: {dur}</span>
            </div>
            <div style="display:flex;gap:16px;font-size:0.85em;margin-top:8px;">
                <span>TSC: {test_indicator(tests.get("tsc"))}</span>
                <span>Smoke: {test_indicator(tests.get("smoke"))}</span>
                <span>Conflicts: {test_indicator(tests.get("conflicts"))}</span>
            </div>
            {error_html}
            {commits_html}
        </div>"""

    # If no tasks, show placeholder
    if not task_rows:
        task_rows = """
        <div style="background:#1e1e2e;border:1px solid #333;border-radius:10px;padding:30px;text-align:center;color:#6b7280;">
            <p style="font-size:1.1em;">No overnight tasks found.</p>
            <p style="font-size:0.9em;">Run the orchestrator first: <code>python _scripts/overnight-orchestrator.py</code></p>
        </div>"""

    html = textwrap.dedent(f"""\
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HAL-O Overnight Report</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                background: #0a0a1a;
                color: #e2e8f0;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                padding: 24px;
                max-width: 900px;
                margin: 0 auto;
                line-height: 1.5;
            }}
            code {{
                background: #1a1a2e;
                padding: 1px 6px;
                border-radius: 4px;
                font-family: 'Cascadia Code', 'Fira Code', monospace;
                font-size: 0.9em;
            }}
            details > summary {{
                list-style: none;
                user-select: none;
            }}
            details > summary::-webkit-details-marker {{
                display: none;
            }}
            details > summary::before {{
                content: "\\25B6  ";
                font-size: 0.7em;
            }}
            details[open] > summary::before {{
                content: "\\25BC  ";
            }}
            .stat-card {{
                background: #1e1e2e;
                border: 1px solid #333;
                border-radius: 10px;
                padding: 16px 20px;
                text-align: center;
                min-width: 120px;
            }}
            .stat-value {{
                font-size: 2em;
                font-weight: 700;
                line-height: 1.2;
            }}
            .stat-label {{
                font-size: 0.85em;
                color: #6b7280;
                margin-top: 4px;
            }}
            .feedback-box {{
                background: #1e1e2e;
                border: 1px solid #333;
                border-radius: 10px;
                padding: 20px;
                margin-top: 30px;
            }}
            .feedback-box textarea {{
                width: 100%;
                background: #0a0a1a;
                border: 1px solid #444;
                border-radius: 6px;
                color: #e2e8f0;
                padding: 10px;
                font-family: inherit;
                font-size: 0.95em;
                resize: vertical;
                min-height: 80px;
                margin-top: 8px;
            }}
            .feedback-box textarea:focus {{
                outline: none;
                border-color: #60a5fa;
            }}
        </style>
    </head>
    <body>
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
            <div style="width:48px;height:48px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="3"/>
                    <line x1="12" y1="2" x2="12" y2="6"/>
                    <line x1="12" y1="18" x2="12" y2="22"/>
                    <line x1="2" y1="12" x2="6" y2="12"/>
                    <line x1="18" y1="12" x2="22" y2="12"/>
                </svg>
            </div>
            <div>
                <h1 style="font-size:1.5em;font-weight:700;color:#f1f5f9;">Overnight Report</h1>
                <p style="color:#6b7280;font-size:0.9em;">Generated {now} | Session started {manifest_time or "N/A"}</p>
            </div>
        </div>

        <!-- Risk Alert (if any failures) -->
        {"" if failed == 0 else f'''
        <div style="background:#7f1d1d;border:1px solid #dc2626;border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3em;">!</span>
            <span style="color:#fca5a5;font-weight:500;">{failed} task(s) failed overnight. Review required before merging.</span>
        </div>
        '''}

        <!-- Stats Row -->
        <div style="display:flex;gap:14px;margin-bottom:24px;flex-wrap:wrap;">
            <div class="stat-card">
                <div class="stat-value" style="color:#e2e8f0;">{total}</div>
                <div class="stat-label">Total Tasks</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#10b981;">{passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#ef4444;">{failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#f59e0b;">{running}</div>
                <div class="stat-label">Running</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#6b7280;">{queued}</div>
                <div class="stat-label">Queued</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#a78bfa;">{len(all_commits)}</div>
                <div class="stat-label">Commits</div>
            </div>
        </div>

        <!-- Task Details -->
        <h2 style="font-size:1.1em;font-weight:600;margin-bottom:14px;color:#94a3b8;">Task Details</h2>
        {task_rows}

        <!-- Merge Instructions (collapsible) -->
        <details style="margin-top:24px;">
            <summary style="color:#60a5fa;cursor:pointer;font-weight:600;font-size:1em;">Merge Instructions</summary>
            <div style="background:#1e1e2e;border:1px solid #333;border-radius:10px;padding:18px;margin-top:10px;">
                <p style="font-size:0.9em;color:#9ca3af;margin-bottom:10px;">For each <strong>PASSED</strong> task:</p>
                <pre style="background:#0a0a1a;padding:12px;border-radius:6px;font-size:0.85em;color:#a78bfa;overflow-x:auto;">
# Review the diff
git diff master...overnight/{{task-slug}}

# Merge (fast-forward preferred)
git merge --ff-only overnight/{{task-slug}}

# Or squash merge
git merge --squash overnight/{{task-slug}}
git commit -m "feat: {{title}} [overnight]"

# Clean up branch
git branch -d overnight/{{task-slug}}
                </pre>
                <p style="font-size:0.9em;color:#fca5a5;margin-top:12px;">For <strong>FAILED</strong> tasks: review the error, fix manually, or re-queue.</p>
            </div>
        </details>

        <!-- Feedback Box -->
        <div class="feedback-box">
            <h3 style="font-size:1em;font-weight:600;color:#94a3b8;">Notes / Feedback</h3>
            <p style="font-size:0.85em;color:#6b7280;">Leave notes about this overnight run for future reference.</p>
            <textarea placeholder="e.g., Task 2 needed manual fix for import path..."></textarea>
        </div>

        <!-- Footer -->
        <div style="margin-top:30px;padding-top:16px;border-top:1px solid #1e1e2e;text-align:center;color:#4b5563;font-size:0.8em;">
            HAL-O Overnight Autonomous System v1.0 | Generated by overnight-reporter.py
        </div>
    </body>
    </html>
    """)

    return html


# ── Telegram Delivery ───────────────────────────────────────────────────────

def send_tg_file(creds: dict, file_path: Path, caption: str):
    """Send an HTML file to Telegram as a document."""
    token = creds.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = creds.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        print("WARNING: Missing TG credentials, cannot send report", file=sys.stderr)
        return False

    try:
        result = subprocess.run(
            ["curl", "-s",
             f"https://api.telegram.org/bot{token}/sendDocument",
             "-F", f"chat_id={chat_id}",
             "-F", f"document=@{file_path}",
             "-F", f"caption={caption}"],
            capture_output=True, text=True, timeout=30,
        )
        if '"ok":true' in result.stdout:
            print(f"Report sent to Telegram successfully")
            return True
        else:
            print(f"TG send failed: {result.stdout[:200]}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"TG send error: {e}", file=sys.stderr)
        return False


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="HAL-O Overnight Reporter — generate HTML summary of overnight work",
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT),
                        help=f"Output HTML file path (default: {DEFAULT_OUTPUT})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Generate report but don't send to Telegram")
    parser.add_argument("--send-tg", action="store_true",
                        help="Send report to Telegram after generation")
    args = parser.parse_args()

    print("=" * 50)
    print("  HAL-O Overnight Reporter")
    print("=" * 50)
    print()

    # Load data
    manifest = load_manifest()
    tasks = load_progress_files()

    if manifest:
        print(f"Manifest: {MANIFEST_FILE}")
        print(f"  Created: {manifest.get('createdAt', 'N/A')}")
        print(f"  Tasks planned: {len(manifest.get('tasks', []))}")
    else:
        print("No manifest found. Generating report from progress files only.")

    print(f"Progress files: {len(tasks)}")

    if not tasks and not manifest:
        print()
        print("No overnight data found. Run the orchestrator first:")
        print("  python _scripts/overnight-orchestrator.py")
        print()

        # Still generate a report (empty state)
        tasks = []

    # Stats
    passed = sum(1 for t in tasks if t.get("status") == "passed")
    failed = sum(1 for t in tasks if t.get("status") == "failed")
    print(f"  Passed: {passed}")
    print(f"  Failed: {failed}")
    print(f"  Other: {len(tasks) - passed - failed}")
    print()

    # Generate HTML
    html = generate_html(tasks, manifest)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    print(f"Report written to: {output_path}")

    # Send to Telegram
    if args.send_tg and not args.dry_run:
        creds = load_credentials()
        caption = f"[Overnight] Report: {passed}/{len(tasks)} passed, {failed} failed"
        send_tg_file(creds, output_path, caption)
    elif args.dry_run:
        print("DRY RUN: Would send to Telegram with caption:")
        print(f"  [Overnight] Report: {passed}/{len(tasks)} passed, {failed} failed")
    else:
        print("Use --send-tg to deliver to Telegram.")

    print()
    print("Done.")


if __name__ == "__main__":
    main()
