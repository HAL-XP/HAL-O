# HAL-OS Logging

## Log Categories

All logs are written to stdout/stderr via `console.log` / `console.error`.

| Tag | File | Description |
|-----|------|-------------|
| `[HAL-O]` | `index.ts` | App lifecycle: boot, quit, restart signals, TG token write |
| `[Session]` | `session-lifecycle.ts` | Session detection, auto-absorb, headless spawn |
| `[TerminalManager]` | `terminal-manager.ts` | PTY spawn, close, scrollback, credential injection |
| `[HTTP-API]` | `http-api.ts` | Server start, request routing, auth failures, rate limiting |
| `[Chat]` | `http-api.ts` | Halo Chat session bridge: inject, capture, TTS generation |
| `[DEBATE]` | `multi-agent-orchestrator.ts` | Debate sessions: create, run, score, consensus |
| `[Hub]` | `ipc-hub.ts` | Project scanning, favorites, opt-in mode |
| `[TG-Handler]` | `telegram-handler.ts` | Telegram dispatch routing, message forwarding |

## Viewing Logs

### In the app
Logs appear in the Electron app's DevTools console:
- Press `Ctrl+Shift+I` in the app → Console tab

### External terminal
When Claude runs inside the app's terminal, logs from the main process appear in the Electron console, not the terminal.

### Watchdog
The watchdog daemon logs to its own stdout:
```
node _scripts/watchdog.js
```

## Log Levels

Currently all logs use `console.log` (info) or `console.error` (errors). No debug/warn/trace levels yet.

**Planned**: structured logging with levels + optional file persistence.

## Key Log Messages

### App Boot
```
[HAL-O] TG token written to plugin .env (8777119587...)
[Session] Starting headless HAL-O session in D:\GitHub\hal-o
[Session] Headless HAL-O session started: hal-o-session-1774...
[HTTP-API] Server listening on 0.0.0.0:19400
```

### Auto-Absorb
```
[Session] Found external Claude session: PID 12345 (hal-o=true, continue=true)
[Session] AUTO-ABSORB: killing external PID 12345, then starting internal session
[Session] External session killed — starting internal with --continue
```

### Halo Chat Message
```
[Chat] Session bridge: injecting message into hal-session-1774...
[Chat] onDone msgId=sess_1774... textLen=245 text="Hello, I can help..."
[Chat] Generating TTS for 245 chars, voice=butler, lang=en
[Chat] TTS ready: 2 files
```

### Debate
```
[DEBATE] Created session d8e6b63d with 5 agents, mode=round-robin, rounds=3
[DEBATE] Running round 1/3...
[DEBATE] Agent critical-analyst responded (245 chars, 3.2s)
[DEBATE] Round 1 complete
```

### Rate Limiting
```
[HTTP-API] Rate limit exceeded for 192.168.1.100 (61/60 in window)
```

## Configuration

### Instance-specific
Each clone writes its own TG token at boot:
- Main (HAL-O): `TELEGRAM_BOT_TOKEN` from `~/.claude_credentials`
- Clone (Claudette): `TELEGRAM_MAIN_BOT_TOKEN` from `~/.claude_credentials`

### Watchdog
| Param | Default | Description |
|-------|---------|-------------|
| `CHECK_INTERVAL` | 60000ms | Health check frequency |
| `MAX_RESTART_ATTEMPTS` | 5 | Max consecutive restarts before giving up |
| `RESTART_COOLDOWN` | 30000ms | Minimum time between restarts |
| `HEALTH_URL` | `http://127.0.0.1:19400/health` | Endpoint to monitor |

Stop watchdog: `touch .hal-o-watchdog-stop` in project root.
