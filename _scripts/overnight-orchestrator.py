#!/usr/bin/env python3
"""
HAL-O Overnight Orchestrator — Parses BACKLOG.md, selects safe tasks,
writes task briefs, and (in real mode) spawns Claude sessions in worktrees.

Runs standalone. No external API calls. No Claude spawning in current version
(prints what it WOULD do).

Usage:
    python _scripts/overnight-orchestrator.py [--dry-run] [--max-tasks 3] [--project-dir D:/GitHub/hal-o]

Modes:
    --dry-run   : Parse backlog, filter tasks, print plan. No file writes, no spawning.
    (default)   : Parse backlog, write task briefs to ~/.hal-o/overnight-tasks/, print spawn commands.
"""

import argparse
import io
import json
import os
import re
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

# Fix Windows console encoding — allow Unicode output without crashing
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Config ──────────────────────────────────────────────────────────────────

HOME = Path(os.environ.get("USERPROFILE", os.environ.get("HOME", "~")))
DATA_DIR = HOME / ".hal-o"
TASKS_DIR = DATA_DIR / "overnight-tasks"
PROGRESS_DIR = DATA_DIR / "overnight-progress"

# Safe task patterns — tasks matching these are candidates for autonomous work
SAFE_PATTERNS = [
    r"\[safe\]",                    # explicit [safe] tag
    r"(?i)\btypes?\b",             # TypeScript type definitions
    r"(?i)\brefactor",             # refactoring
    r"(?i)\b(?:add|write|update|fix)\s+docs?\b",  # writing/updating docs
    r"(?i)\bjsdoc\b",             # JSDoc documentation
    r"(?i)\breadme\b",            # README updates
    r"(?i)\b(?:add|write|fix|update|run)\s+test",  # writing/fixing/running tests
    r"(?i)\bunit\s*test",         # unit tests
    r"(?i)\be2e\s*test",          # e2e tests
    r"(?i)\btest\s+coverage\b",   # test coverage
    r"(?i)\bi18n\b",              # internationalization
    r"(?i)\blint",                # linting fixes
    r"(?i)\bcleanup\b",          # code cleanup
    r"(?i)\bremove\s+dead",      # remove dead code
    r"(?i)\bextract\b",          # extract component/function
    r"(?i)\brename\b",           # renaming
    r"(?i)\bmove\s+\w+\s+to\s+\w+",  # move file/function to location (structural)
    r"(?i)\badd\s+jsdoc\b",      # add documentation
    r"(?i)\bfix\s+typo",         # typo fixes
    r"(?i)\bupdate\s+dep",       # dependency updates
]

# Unsafe patterns — NEVER pick these even if tagged [safe]
UNSAFE_PATTERNS = [
    r"(?i)\[manual\]",
    r"(?i)\[needs\s*qa\]",
    r"(?i)\boauth\b",
    r"(?i)\bauth\b.*\brewrite\b",
    r"(?i)\bsecurity\b",
    r"(?i)\b3d\b",
    r"(?i)\bthree\.?js\b",
    r"(?i)\belectron\b.*\bentry\b",
    r"(?i)\bnode-pty\b",
    r"(?i)\bnative\b.*\bbuild\b",
    r"(?i)\bbreaking\b",
    r"(?i)\bmigrat",
    r"(?i)\bcli\b.*\bchange",
    r"(?i)\bnsis\b",
    r"(?i)\binstaller\b",
    r"(?i)\bvoice\b.*\bpipeline\b",
]

# Priority keywords (higher = more important)
PRIORITY_MAP = {
    "P0": 4,
    "P1": 3,
    "P2": 2,
    "P3": 1,
    "(Next)": 3,  # items in (Next) sections get high priority
}


# ── Logging ─────────────────────────────────────────────────────────────────

class Logger:
    """Simple logger with color support."""

    COLORS = {
        "header": "\033[1;36m",   # bold cyan
        "ok": "\033[32m",         # green
        "warn": "\033[33m",       # yellow
        "error": "\033[31m",      # red
        "dim": "\033[90m",        # gray
        "reset": "\033[0m",
    }

    def __init__(self, quiet: bool = False):
        self.quiet = quiet
        # Disable colors if not a TTY
        if not sys.stdout.isatty():
            for key in self.COLORS:
                self.COLORS[key] = ""

    def _ts(self) -> str:
        return datetime.now().strftime("%H:%M:%S")

    def header(self, msg: str):
        print(f"\n{self.COLORS['header']}{'=' * 60}")
        print(f"  {msg}")
        print(f"{'=' * 60}{self.COLORS['reset']}")

    def info(self, msg: str):
        if not self.quiet:
            print(f"[{self._ts()}] {msg}")

    def ok(self, msg: str):
        print(f"[{self._ts()}] {self.COLORS['ok']}{msg}{self.COLORS['reset']}")

    def warn(self, msg: str):
        print(f"[{self._ts()}] {self.COLORS['warn']}WARN: {msg}{self.COLORS['reset']}")

    def error(self, msg: str):
        print(f"[{self._ts()}] {self.COLORS['error']}ERROR: {msg}{self.COLORS['reset']}")

    def dim(self, msg: str):
        if not self.quiet:
            print(f"[{self._ts()}] {self.COLORS['dim']}{msg}{self.COLORS['reset']}")

    def task(self, idx: int, title: str, safe: bool, priority: int, reason: str):
        status = f"{self.COLORS['ok']}SAFE{self.COLORS['reset']}" if safe else f"{self.COLORS['warn']}SKIP{self.COLORS['reset']}"
        print(f"  [{status}] P{4 - priority} | {title}")
        if reason:
            print(f"         {self.COLORS['dim']}{reason}{self.COLORS['reset']}")


log = Logger()


# ── Backlog Parsing ─────────────────────────────────────────────────────────

class BacklogItem:
    """A single item from BACKLOG.md."""

    def __init__(self, text: str, section: str, line_number: int):
        self.text = text
        self.section = section
        self.line_number = line_number
        self.priority = self._compute_priority()
        self.is_safe, self.safety_reason = self._check_safety()
        self.is_done = text.strip().endswith("✓")

    def _compute_priority(self) -> int:
        """Compute priority score (higher = more important)."""
        score = 0
        for pattern, value in PRIORITY_MAP.items():
            if pattern in self.section or pattern in self.text:
                score = max(score, value)
        # Default: P2 if no explicit priority
        if score == 0:
            score = 2
        return score

    def _check_safety(self) -> tuple[bool, str]:
        """Check if this task is safe for autonomous execution."""
        # Explicit [safe] tag always wins (unless also unsafe)
        has_safe_tag = bool(re.search(r"\[safe\]", self.text, re.IGNORECASE))

        # Check for unsafe patterns first — these override everything
        for pattern in UNSAFE_PATTERNS:
            if re.search(pattern, self.text):
                return False, f"Matched unsafe pattern: {pattern}"

        # Check for safe patterns
        if has_safe_tag:
            return True, "Explicit [safe] tag"

        for pattern in SAFE_PATTERNS:
            if re.search(pattern, self.text):
                return True, f"Matched safe pattern: {pattern}"

        return False, "No safe pattern matched"

    @property
    def title(self) -> str:
        """Clean title for display and file naming."""
        # Strip markdown formatting, tags, checkboxes
        title = self.text.strip()
        title = re.sub(r"^\s*-\s*", "", title)
        title = re.sub(r"\[.*?\]", "", title)
        title = re.sub(r"[✓✗]", "", title)
        title = title.strip(" -:")
        return title

    @property
    def slug(self) -> str:
        """URL/filename-safe slug."""
        slug = self.title.lower()
        slug = re.sub(r"[^a-z0-9]+", "-", slug)
        slug = slug.strip("-")
        return slug[:60]

    def __repr__(self):
        safe_str = "SAFE" if self.is_safe else "UNSAFE"
        return f"BacklogItem(P{4 - self.priority}, {safe_str}, {self.title[:50]})"


def parse_backlog(project_dir: Path) -> list[BacklogItem]:
    """Parse BACKLOG.md into structured items."""
    backlog_path = project_dir / "BACKLOG.md"
    if not backlog_path.exists():
        log.error(f"BACKLOG.md not found at {backlog_path}")
        return []

    content = backlog_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    items: list[BacklogItem] = []
    current_section = ""

    for i, line in enumerate(lines, start=1):
        stripped = line.strip()

        # Track section headers
        if stripped.startswith("##"):
            current_section = stripped.lstrip("#").strip()
            continue

        # Skip done sections entirely
        if "DONE" in current_section.upper():
            continue

        # Collect bullet items (not done items)
        if stripped.startswith("- ") and not stripped.endswith("✓"):
            item = BacklogItem(stripped, current_section, i)
            if not item.is_done:
                items.append(item)

    return items


def select_tasks(items: list[BacklogItem], max_tasks: int = 3) -> list[BacklogItem]:
    """Select the top N safe tasks by priority."""
    safe_items = [item for item in items if item.is_safe]

    # Sort by priority (descending), then by line number (ascending = appears first)
    safe_items.sort(key=lambda x: (-x.priority, x.line_number))

    return safe_items[:max_tasks]


# ── Task Brief Generation ──────────────────────────────────────────────────

def generate_task_brief(item: BacklogItem, task_id: int) -> str:
    """Generate a task brief in the standard template format."""
    now = datetime.now(timezone.utc).isoformat()
    slug = item.slug

    brief = textwrap.dedent(f"""\
    # Task: {item.title}

    ## Metadata
    - **ID**: task-{task_id:03d}
    - **Priority**: P{4 - item.priority}
    - **Safe**: yes
    - **Source**: BACKLOG.md line {item.line_number}
    - **Section**: {item.section}
    - **Created**: {now}
    - **Timeout**: 2h

    ## Acceptance Criteria
    - [ ] TSC passes (`npx tsc --noEmit`)
    - [ ] Smoke tests pass (`npx playwright test e2e/smoke.spec.ts`)
    - [ ] No merge conflicts with master
    - [ ] Clean history (1-2 commits, descriptive messages)
    - [ ] No large files added (> 5MB)
    - [ ] No eval/exec introduced
    - [ ] No security-sensitive changes

    ## Files to Modify
    - (To be determined by the agent based on the task)

    ## Files to NOT Touch
    - src/renderer/src/components/three/* (3D — not safe for autonomous)
    - src/main/index.ts (Electron entry — high risk)
    - .claude/ (agent config)
    - _scripts/*.bat (launcher scripts)

    ## Context
    From BACKLOG.md section "{item.section}":
    > {item.text.strip()}

    Safety classification: {item.safety_reason}

    ## Agent Template
    code-builder

    ## Validation Commands
    ```bash
    npx tsc --noEmit
    npx playwright test e2e/smoke.spec.ts
    git diff --stat
    ```

    ## Branch Name
    overnight/{slug}

    ## On Success
    1. Commit with message: "feat: {item.title[:60]} [overnight]"
    2. Write progress JSON to ~/.hal-o/overnight-progress/task-{task_id:03d}.json
    3. Exit 0

    ## On Failure
    1. `git reset --hard`
    2. Write failure JSON to ~/.hal-o/overnight-progress/task-{task_id:03d}.json
    3. Exit 1
    """)

    return brief


def generate_progress_json(item: BacklogItem, task_id: int, status: str = "queued") -> dict:
    """Generate progress tracking JSON for a task."""
    return {
        "taskId": f"task-{task_id:03d}",
        "title": item.title,
        "slug": item.slug,
        "priority": 4 - item.priority,
        "status": status,  # queued, running, passed, failed
        "source": f"BACKLOG.md:{item.line_number}",
        "section": item.section,
        "safetyReason": item.safety_reason,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "startedAt": None,
        "completedAt": None,
        "branch": f"overnight/{item.slug}",
        "commits": [],
        "testResults": {
            "tsc": None,
            "smoke": None,
            "conflicts": None,
        },
        "error": None,
    }


# ── Spawn Command Generation ───────────────────────────────────────────────

def generate_spawn_command(item: BacklogItem, task_id: int, project_dir: Path) -> str:
    """Generate the command that WOULD spawn a Claude session for this task.

    NOTE: This is NOT executed. It's printed for future implementation.
    """
    task_file = TASKS_DIR / f"task-{task_id:03d}.md"
    worktree_dir = project_dir.parent / f"hal-o-overnight-{item.slug[:30]}"
    branch = f"overnight/{item.slug}"

    lines = [
        f"# Task {task_id:03d}: {item.title}",
        f"# Priority: P{4 - item.priority}",
        f"",
        f"# Step 1: Create git worktree",
        f"git worktree add -b {branch} \"{worktree_dir}\" master",
        f"",
        f"# Step 2: Spawn Claude session in worktree",
        f"cd \"{worktree_dir}\"",
        f"claude --dangerously-skip-permissions \\",
        f"  -p \"Read the task brief at {task_file} and execute it. \" \\",
        f"  --agent code-builder \\",
        f"  --max-turns 50 \\",
        f"  --timeout 7200",
        f"",
        f"# Step 3: On exit, check result",
        f"# If exit 0: merge branch to master",
        f"# If exit 1: flag for review, leave branch",
        f"",
        f"# Step 4: Cleanup worktree",
        f"git worktree remove \"{worktree_dir}\"",
    ]
    return "\n".join(lines)


# ── Orchestration ───────────────────────────────────────────────────────────

def run_dry(project_dir: Path, max_tasks: int):
    """Dry run: parse backlog, show what would happen."""
    log.header("OVERNIGHT ORCHESTRATOR — DRY RUN")

    log.info(f"Project: {project_dir}")
    log.info(f"Max tasks: {max_tasks}")
    log.info("")

    # Parse backlog
    log.info("Parsing BACKLOG.md...")
    items = parse_backlog(project_dir)
    log.info(f"Found {len(items)} pending items")
    log.info("")

    # Show all items with safety classification
    log.header("ALL BACKLOG ITEMS (safety analysis)")
    safe_count = 0
    unsafe_count = 0
    for i, item in enumerate(items):
        log.task(i, item.title, item.is_safe, item.priority, item.safety_reason)
        if item.is_safe:
            safe_count += 1
        else:
            unsafe_count += 1

    log.info("")
    log.info(f"Total: {len(items)} | Safe: {safe_count} | Unsafe: {unsafe_count}")

    # Select tasks
    selected = select_tasks(items, max_tasks)
    if not selected:
        log.warn("No safe tasks found! Nothing to do overnight.")
        return

    log.header(f"SELECTED FOR OVERNIGHT ({len(selected)} tasks)")
    for i, item in enumerate(selected, 1):
        print(f"  {i}. [P{4 - item.priority}] {item.title}")
        print(f"     Section: {item.section}")
        print(f"     Line: {item.line_number}")
        print(f"     Safe because: {item.safety_reason}")
        print()

    # Show what commands would be generated
    log.header("SPAWN COMMANDS (would execute in real mode)")
    for i, item in enumerate(selected, 1):
        cmd = generate_spawn_command(item, i, project_dir)
        print(cmd)
        print()

    # Show task briefs (abbreviated)
    log.header("TASK BRIEFS (would write to ~/.hal-o/overnight-tasks/)")
    for i, item in enumerate(selected, 1):
        brief = generate_task_brief(item, i)
        # Show first 10 lines
        lines = brief.splitlines()
        for line in lines[:10]:
            print(f"  {line}")
        print(f"  ... ({len(lines) - 10} more lines)")
        print()

    log.ok(f"Dry run complete. {len(selected)} tasks ready for overnight execution.")


def run_real(project_dir: Path, max_tasks: int):
    """Real run: parse backlog, write task briefs, print spawn commands."""
    log.header("OVERNIGHT ORCHESTRATOR — REAL MODE")

    log.info(f"Project: {project_dir}")
    log.info(f"Max tasks: {max_tasks}")
    log.info(f"Tasks dir: {TASKS_DIR}")
    log.info(f"Progress dir: {PROGRESS_DIR}")
    log.info("")

    # Ensure directories exist
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)

    # Parse backlog
    log.info("Parsing BACKLOG.md...")
    items = parse_backlog(project_dir)
    log.info(f"Found {len(items)} pending items")

    # Select tasks
    selected = select_tasks(items, max_tasks)
    if not selected:
        log.warn("No safe tasks found! Nothing to do overnight.")
        return

    log.header(f"SELECTED {len(selected)} TASKS")
    for i, item in enumerate(selected, 1):
        print(f"  {i}. [P{4 - item.priority}] {item.title}")

    # Clean old task files
    if TASKS_DIR.exists():
        for old_file in TASKS_DIR.glob("task-*.md"):
            old_file.unlink()
            log.dim(f"Cleaned old task file: {old_file.name}")

    # Write task briefs
    log.header("WRITING TASK BRIEFS")
    task_files = []
    for i, item in enumerate(selected, 1):
        brief = generate_task_brief(item, i)
        task_file = TASKS_DIR / f"task-{i:03d}.md"
        task_file.write_text(brief, encoding="utf-8")
        task_files.append(task_file)
        log.ok(f"Wrote: {task_file}")

        # Write initial progress JSON
        progress = generate_progress_json(item, i, status="queued")
        progress_file = PROGRESS_DIR / f"task-{i:03d}.json"
        progress_file.write_text(json.dumps(progress, indent=2), encoding="utf-8")
        log.ok(f"Wrote: {progress_file}")

    # Print spawn commands (NOT executed)
    log.header("SPAWN COMMANDS (print only — NOT executed)")
    log.warn("Spawning Claude sessions is NOT YET IMPLEMENTED.")
    log.warn("The commands below show what WOULD run when enabled.")
    print()

    for i, item in enumerate(selected, 1):
        cmd = generate_spawn_command(item, i, project_dir)
        print(cmd)
        print()

    # Write manifest
    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "projectDir": str(project_dir),
        "maxTasks": max_tasks,
        "tasks": [
            {
                "id": f"task-{i:03d}",
                "title": item.title,
                "priority": 4 - item.priority,
                "brief": str(TASKS_DIR / f"task-{i:03d}.md"),
                "progress": str(PROGRESS_DIR / f"task-{i:03d}.json"),
                "branch": f"overnight/{item.slug}",
            }
            for i, item in enumerate(selected, 1)
        ],
    }
    manifest_file = DATA_DIR / "overnight-manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    log.ok(f"Wrote manifest: {manifest_file}")

    # Summary
    log.header("OVERNIGHT ORCHESTRATION COMPLETE")
    log.ok(f"Tasks queued: {len(selected)}")
    log.ok(f"Task briefs: {TASKS_DIR}")
    log.ok(f"Progress tracking: {PROGRESS_DIR}")
    log.ok(f"Manifest: {manifest_file}")
    log.info("")
    log.info("To start overnight execution (when implemented):")
    log.info(f"  python _scripts/overnight-orchestrator.py --execute")
    log.info("")
    log.info("To generate the morning report:")
    log.info(f"  python _scripts/overnight-reporter.py")


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="HAL-O Overnight Orchestrator — autonomous task selection and execution",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              %(prog)s --dry-run                  # Show what would happen
              %(prog)s                            # Write task briefs (no spawning)
              %(prog)s --max-tasks 5              # Select up to 5 tasks
              %(prog)s --project-dir /path/to/repo
        """),
    )
    parser.add_argument("--project-dir", default="D:/GitHub/hal-o",
                        help="Project directory (default: D:/GitHub/hal-o)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print plan without writing files or spawning")
    parser.add_argument("--max-tasks", type=int, default=3,
                        help="Maximum tasks to select (default: 3)")
    parser.add_argument("--quiet", action="store_true",
                        help="Suppress verbose output")
    args = parser.parse_args()

    global log
    log = Logger(quiet=args.quiet)

    project_dir = Path(args.project_dir)
    if not project_dir.exists():
        log.error(f"Project directory does not exist: {project_dir}")
        sys.exit(1)

    if not (project_dir / "BACKLOG.md").exists():
        log.error(f"BACKLOG.md not found in {project_dir}")
        sys.exit(1)

    if args.dry_run:
        run_dry(project_dir, args.max_tasks)
    else:
        run_real(project_dir, args.max_tasks)


if __name__ == "__main__":
    main()
