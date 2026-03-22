# HAL-O Migration Guide

## What happened
The project was renamed from `Claudeborn` / `ProjectCreator` to **HAL-O**.
This repo was cloned fresh into `D:\GitHub\hal-o` from `HAL-XP/hal-o`.
The old folder `D:\GitHub\ProjectCreator` still exists as backup.

**If you are a new Claude Code agent reading this:** follow the steps below to
bootstrap this workspace. Once done, delete this file — it's a one-time migration.

## Path mapping

| What | Old | New |
|------|-----|-----|
| Repo folder | `D:\GitHub\ProjectCreator` | `D:\GitHub\hal-o` |
| GitHub repo | `HAL-XP/Claudeborn` | `HAL-XP/hal-o` |
| Claude memory | `~\.claude\projects\D--GitHub-ProjectCreator` | `~\.claude\projects\D--GitHub-hal-o` |
| Pending sessions | `~\.claudeborn-pending-sessions.json` | `~\.hal-o-pending-sessions.json` |

## Step 1: Copy Claude Code project memory

```bash
cp -r "C:/Users/dindo/.claude/projects/D--GitHub-ProjectCreator" "C:/Users/dindo/.claude/projects/D--GitHub-hal-o"
```

## Step 2: Update references in memory files

In `C:\Users\dindo\.claude\projects\D--GitHub-hal-o\memory\`:

| Find | Replace with | Notes |
|------|-------------|-------|
| `ProjectCreator` (in paths) | `hal-o` | Folder references |
| `Claudeborn` (as product name) | `HAL-O` | Branding |
| `HAL-XP/Claudeborn` (repo URL) | `HAL-XP/hal-o` | GitHub links |

**Keep** `Claudeborn` where it refers to the wizard module codename (that's intentional).

Apply to ALL `.md` files in the memory directory:
```bash
grep -rl "ProjectCreator\|Claudeborn" "C:/Users/dindo/.claude/projects/D--GitHub-hal-o/memory/"
```

## Step 3: Install dependencies

```bash
cd D:/GitHub/hal-o
npm install
```

## Step 4: Rebuild node-pty for Electron

node-pty requires native compilation with patches. See `_rebuild.ps1` but note the
paths inside reference the old folder — update them first:

```bash
# Fix paths in rebuild script
sed -i 's|D:\\GitHub\\ProjectCreator|D:\\GitHub\\hal-o|g' _rebuild.ps1
sed -i 's|D:/GitHub/ProjectCreator|D:/GitHub/hal-o|g' _rebuild.ps1
```

Then rebuild:
```powershell
powershell -ExecutionPolicy Bypass -File _rebuild.ps1
```

### node-pty patches (reapply after npm install)
These patches are in `node_modules/` and get wiped by `npm install`:
- `node_modules/node-pty/deps/winpty/src/shared/GetCommitHash.bat` → replace contents with:
  ```
  @echo off
  echo none
  exit /b 0
  ```
- `node_modules/node-pty/deps/winpty/src/winpty.gyp` line 13: `'WINPTY_COMMIT_HASH%': 'none'`
- `node_modules/node-pty/deps/winpty/src/winpty.gyp` line 25: `'gen'` (hardcoded include dir)
- Create `node_modules/node-pty/deps/winpty/src/gen/GenVersion.h`:
  ```c
  #define VERSION_MAJOR 0
  #define VERSION_MINOR 4
  #define VERSION_REVISION 3
  #define VERSION_BUILD 1
  ```
- Add `'SpectreMitigation': 'false'` in 3 locations:
  - `node_modules/node-pty/binding.gyp` (in msvs_settings)
  - `node_modules/node-pty/deps/winpty/src/winpty.gyp` (2 locations in msvs_settings)

## Step 5: Fix remaining path references in scripts

```bash
# PowerShell scripts
sed -i 's|D:\\GitHub\\ProjectCreator|D:\\GitHub\\hal-o|g' _create_shortcut.ps1 _screenshot.ps1 _screenshot_layouts.ps1

# JS utility scripts
sed -i 's|D:/GitHub/ProjectCreator|D:/GitHub/hal-o|g' _gen_platform_texture.js _capture_layouts.js
```

## Step 6: Verify the app launches

```bash
npx electron-vite dev
```

Check:
- Window title says "HAL-O"
- HUD shows `SYS://HAL-O`
- Settings, renderer, layout all preserved (localStorage migration runs automatically)
- Open a terminal — verify pty works

## Step 7: Verify HAL detection

Open a terminal for this project inside the app. The sphere should show "ONLINE".
`getHalSessionId()` matches paths containing `hal-o` (with `ProjectCreator` as fallback).

## Step 8: Create new desktop shortcut

```powershell
powershell -ExecutionPolicy Bypass -File _create_shortcut.ps1
```

## Step 9: Cleanup

Once everything works:
- Delete this file (`_RENAME_MIGRATION.md`) — it's a one-time guide
- Optionally delete old backup: `D:\GitHub\ProjectCreator` (keep for a week first)
- Optionally delete old memory: `~\.claude\projects\D--GitHub-ProjectCreator` (keep for a week)

## Troubleshooting

### "New session doesn't see old memory"
Claude Code derives the memory key from the folder path:
`D:\GitHub\hal-o` → `D--GitHub-hal-o`
(drive letter + `--` + path segments joined by `--`)

Verify: `ls "C:/Users/dindo/.claude/projects/D--GitHub-hal-o/memory/"`

### "node-pty build fails"
- Ensure VS 2022 Build Tools are installed with C++ desktop workload
- Ensure Python 3.11+ is in PATH (for node-gyp)
- The patches above must be applied BEFORE running `_rebuild.ps1`

### "App launches but terminals don't work"
node-pty wasn't rebuilt for Electron. Run the rebuild script again.
Check that `node_modules/node-pty/build/Release/pty.node` exists.

### "Telegram not working"
Check `.claude/settings.json` in the repo — should have telegram plugin enabled.
The config is path-independent, should work in the new folder.

### "Old ProjectCreator sessions still running"
Kill them or let them finish. They won't interfere with the new folder.
The old folder's `.claude/.pids` file may have stale entries — harmless.
