# HAL-O Rename — Step 1: GitHub Rename + Local Clone

## Context
You are a disposable agent. Your only job is to rename the GitHub repo and clone it locally.
After you're done, the user will close you and start a new session from the new folder.

## Prerequisites
- The code changes (all `Claudeborn` → `HAL-O` renames in source) are ALREADY committed and pushed
- Current repo: `HAL-XP/Claudeborn` on branch `master`
- Current local folder: `D:\GitHub\ProjectCreator`

## Steps

### 1. Verify everything is pushed
```bash
cd D:/GitHub/ProjectCreator
git status
git log --oneline -3
```
Working tree must be clean. If not, STOP and tell the user.

### 2. Rename the GitHub repo
```bash
gh repo rename hal-o --repo HAL-XP/Claudeborn --yes
```
This preserves all branches, commits, PRs, and stars. GitHub auto-redirects the old URL.

### 3. Update the remote on the old local repo (as backup)
```bash
cd D:/GitHub/ProjectCreator
git remote set-url origin https://github.com/HAL-XP/hal-o.git
```

### 4. Clone fresh into the new folder
```bash
cd D:/GitHub
git clone https://github.com/HAL-XP/hal-o.git hal-o
```

### 5. Verify the clone
```bash
cd D:/GitHub/hal-o
git log --oneline -5
git branch -a
```
You should see all branches including `feat/3d-terminal-overhaul`.

### 6. Done — tell the user
Say: "Repo renamed to HAL-XP/hal-o, cloned to D:\GitHub\hal-o. You can close me now and start a new session from D:\GitHub\hal-o. The new agent should read _RENAME_MIGRATION.md to finish setup."

## If something goes wrong

### gh repo rename fails
- Check `gh auth status` — must be authenticated
- Check you have admin access to the repo
- Fallback: rename manually at https://github.com/HAL-XP/Claudeborn/settings

### Clone fails
- The rename may take a few seconds to propagate — wait 10s and retry
- Check: `gh repo view HAL-XP/hal-o` should return repo info

### Wrong branch cloned
Default branch is `master`. The feature branch exists remotely:
```bash
git checkout feat/3d-terminal-overhaul
```
