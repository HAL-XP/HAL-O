# HAL-O Actions Reference

## yours
Set agent mode. Announce: "Agent owns instance. Free to kill electron, rebuild, relaunch. User is not using the app."

## mine
Set hands-off mode. Announce: "Hands off. Do NOT touch the running app instance. Do NOT kill electron. User is actively using it."

## wazzup
Report git status, latest CI run, running processes, top 5 backlog items from `project_todo_backlog.md`.

## ci
Check the latest GitHub Actions CI run status with `gh run list --limit 3` and report.

## board
Read `project_todo_backlog.md` + recent git log, generate an interactive HTML Kanban dashboard (dark theme, HAL-O aesthetic: cyan/green accents, monospace, sci-fi mission control). Save to `<project-root>/temp/board.html` and open in browser.

## push
Commit all staged changes and push to remote immediately.

## ship
Full pipeline: build (`npm run build`), smoke tests (`npx playwright test e2e/smoke.spec.ts`), commit all changes, push to remote.

## nuke
Kill all electron/node processes (by PID, never by name), clear ALL caches (node_modules/.vite, AppData Code Cache, GPUCache, DawnGraphiteCache, DawnWebGPUCache), rebuild from scratch.

## relaunch
Kill running app, clear caches, rebuild, relaunch.

## clean
Clear vite + Electron caches only. No rebuild.

## test
Run `npx playwright test e2e/smoke.spec.ts` and report results.

## qa
Spawn a dedicated QA agent to validate the last visual change against reference. Follow the QA ruleset in `qa_agent_ruleset.md`.

## perf
Run the orbit drag perf test and report frame timing stats.

## todo
Add the text after the command as a new item to `project_todo_backlog.md`. Assign next available ID based on existing patterns.

## queue
Add to backlog as in-progress, then begin implementation immediately.

## html
Create a standalone interactive HTML page for the description. Dark theme, HAL-O aesthetic (cyan #00e5ff / green #39ff14 accents, monospace). Save to `<project-root>/temp/` and open in browser automatically.

## save-state
Update MEMORY.md with current work state, commit all changes, push to remote.

## silent
Stop sending Telegram notifications. Write `1` to `/tmp/claude_silent_mode.txt`.

## loud
Resume Telegram notifications. Remove `/tmp/claude_silent_mode.txt`.

## zog-zog
Orc status report! Reply with voice using the `orc` profile directly (not auto). Speak as a loyal Orc peon reporting to the Warchief. Use speech patterns like "Work work", "Something need doing?", "Job's done!".

## marketing
Invoke the `/marketing` skill. Accepts optional variant: `landing` (default), `features`, `changelog`, `pitch`. Example: `/hal g pitch`. The marketing skill has the full brand guide and reads current project state automatically.

## rules
Generate the interactive rules organizer HTML page. Read ALL `feedback_*.md` files from project memory, extract rule names/descriptions/content, categorize them (Quality, Testing, Process, UX, Terminal, Telegram, Voice), and build a drag-and-drop two-column page (CLAUDE.md vs Memory). Include HARD RULE badges, search, category filters, token estimate, and export button. Save to `<project-root>/temp/rules-organizer.html` and open in browser.
