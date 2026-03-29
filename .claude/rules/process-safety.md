---
description: Process kill safety — PID only, verify own PID
alwaysApply: true
---
- Never kill electron.exe by name — always by PID
- NEVER use bulk process kill (Get-Process | Stop-Process, taskkill by name)
- Always: list PIDs → identify own PID → kill specific PIDs → verify alive
- NEVER launch Electron app from Claude session (triggers auto-absorb → self-kill)
- Before app restart: save terminal sessions, pop to external
- Clear vite cache before every build/dev: node_modules/.vite
