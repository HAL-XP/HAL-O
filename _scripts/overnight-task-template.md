# Task: [title]

## Metadata
- **ID**: task-{N}
- **Priority**: P{0-3}
- **Safe**: yes
- **Source**: BACKLOG.md line {line_number}
- **Created**: {ISO timestamp}
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
- src/...
- (list all expected files)

## Files to NOT Touch
- src/renderer/src/components/three/* (3D — not safe for autonomous)
- src/main/index.ts (Electron entry — high risk)
- .claude/ (agent config)
- _scripts/*.bat (launcher scripts)

## Context
{brief extracted from BACKLOG.md — the WHY behind this task}

## Agent Template
code-builder

## Validation Commands
```bash
# Must all pass before committing
npx tsc --noEmit
npx playwright test e2e/smoke.spec.ts
git diff --stat  # verify only expected files changed
```

## Branch Name
overnight/{task-id}

## On Success
1. Commit with message: "feat: {title} [overnight]"
2. Write progress JSON to ~/.hal-o/overnight-progress/{task-id}.json
3. Exit 0

## On Failure
1. `git reset --hard`
2. Write failure JSON to ~/.hal-o/overnight-progress/{task-id}.json with error details
3. Exit 1
