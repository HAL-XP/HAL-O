# Overnight Autonomous Work System

Status: Architecture Complete
Quality: AAA
Effort: 35-45 hours (4-5 sprints)
Target: Session 11

## Summary

HAL-O enters "overnight mode" when idle 60+ min. Autonomously picks top 3 safe tasks from BACKLOG.md, 
executes each in isolated Claude session + git worktree, validates with TSC + smoke tests, 
auto-merges pass/flags fail, sends HTML summary report to Telegram.

User wakes to shipped features: 5-15 hours of productive work, production-ready code.

## Key Components

1. idle-ticker.py enhancement: Trigger overnight mode on idle
2. OvernightOrchestrator agent: Task selection, session spawning
3. overnight-worker agent: Autonomous execution, validation
4. guardian.py enhancement: Monitor overnight sessions, auto-relaunch
5. overnight-reporter.py: Progress tracking, HTML reporting
6. _overnight_resume.bat: Isolated session launcher
7. Task file format: Standardized ~/.hal-o/overnight-tasks/task-N.md

## Flow

Idle 60+ min → parse BACKLOG.md → filter safe tasks (max 3) → 
spawn orchestrator → for each task: create worktree, write task.md, spawn session →
session reads task, creates branch, executes work, validates, commits →
guardian monitors, auto-relaunches on crash → collect results →
auto-merge (pass) or flag (fail) → generate HTML → send TG → done

## Safe for Autonomous

- No user interaction
- No Electron app needed
- Deterministic
- Testable (TSC + smoke test)
- < 2 hours
- Not [MANUAL] or [NEEDS QA]
- No security-critical

Examples: TypeScript defs, refactors, docs, tests
Not: OAuth, auth rewrites, new 3D, CLI changes

## Task Execution

1. Read task.md
2. git checkout -b overnight/{taskId}
3. Edit files, implement work
4. Run TSC + smoke tests
5. If fail: git reset --hard, exit 1
6. If pass: git commit + write progress JSON
7. Exit 0

## Validation

Pre-merge checks:
- npx tsc --noEmit ✓
- npx playwright test e2e/smoke.spec.ts ✓
- No conflicts ✓
- Clean history (1-2 commits) ✓
- No large files (> 5MB) ✓
- No eval/exec ✓

If any fail: DON'T merge, flag for review

## Monitoring

Guardian: Monitor [Overnight Worker] processes, auto-relaunch on crash
Progress: Each task writes to ~/.hal-o/overnight-progress/{taskId}.json
Updates: TG message every 15 min (status, progress %)
Timeout: Hard 2-hour limit per task

## Edge Cases

- User wakes: Detect input → pause → SIGTERM all → graceful exit
- Session crash: Dead PID → auto-relaunch → --continue resume
- Conflicts: Detect before merge → flag → leave branch
- Compaction: Wait → proceed → preserve state

## Implementation (4-5 sprints)

Sprint 1: Infrastructure (8h)
- idle-ticker enhancement
- OvernightOrchestrator agent
- Task format + parser
- _overnight_resume.bat

Sprint 2: Execution (10h)
- overnight-worker agent
- Branch + commit logic
- TSC + test validation
- Progress tracking

Sprint 3: Safety (8h)
- Guardian enhancement
- Auto-relaunch
- Timeout protection
- Wake-up detection
- Conflict detection

Sprint 4: Reporting (7h)
- HTML generator
- Diff synthesis
- Auto-merge logic
- TG delivery

Sprint 5: Polish (5h)
- E2E testing
- Edge cases
- Docs
- QA

Total: ~38 hours

## Success Criteria

- Trigger on 60+ min idle ✓
- Task selection filters correctly ✓
- Isolated worktrees ✓
- Tests block bad merges ✓
- 2-hour timeout enforced ✓
- User input pauses gracefully ✓
- HTML reports comprehensive ✓
- Zero unintended master commits ✓
- 95%+ success on safe tasks ✓

## Files

New:
- _scripts/overnight-orchestrator.py
- _scripts/overnight-reporter.py
- _scripts/_overnight_resume.bat
- .claude/agents/overnight-worker.md
- _design/OVERNIGHT_TASK_FORMAT.md
- _design/OVERNIGHT_SAFETY_RULES.md

Modified:
- _scripts/idle-ticker.py
- _scripts/session-guardian.py
- BACKLOG.md
- CLAUDE.md

## Outcome

User sleeps. HAL-O ships 5-15 hours of validated features. 
User wakes. Features on master ready for deployment.
Zero human intervention for safe tasks.
Production-ready code (TSC + tests enforced).

Game-changing productivity multiplier.

---
Version: 1.0
Date: 2026-03-29
Author: Research Agent
Status: Architecture complete, ready for Sprint 1
