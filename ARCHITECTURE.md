# HAL-OS Architecture


HAL-OS is a **platform** for building AI dispatcher applications. HAL-O (this repo) is the **reference product** — a 3D holographic dispatcher. You can build additional dispatchers on top of HAL-OS.

---

## Platform vs Product

```
    ┌─────────────────────────────────────────┐
    │         HAL-OS Platform Layer           │
    │   (Node.js + Electron core services)    │
    │                                         │
    │  ┌─────────────────────────────────┐   │
    │  │  Session Management & Routing   │   │
    │  │  Multi-Agent Orchestration      │   │
    │  │  Voice I/O Pipeline (STT + TTS) │   │
    │  │  HTTP API + WebSocket           │   │
    │  │  Feature Flags & Knowledge Base │   │
    │  │  Watchdog & Auto-Restart        │   │
    │  └─────────────────────────────────┘   │
    └─────────────────────────────────────────┘
                     △
        ┌────────────┼────────────┐
        │            │            │
    ┌───────┐   ┌──────────┐  ┌──────────┐
    │ HAL-O │   │Halo Chat │  │Your      │
    │(3D    │   │(Mobile   │  │Dispatcher│
    │Electron)  │PWA)      │  │(TBD)     │
    └───────┘   └──────────┘  └──────────┘
    Products built on HAL-OS
```

---

## Platform Layer: HAL-OS

### Session Management
- **Persistence**: Terminal sessions, aliases, favorites survive restarts and crashes
- **Externalize**: Sessions can be popped out of Electron to run independently
- **Guardian**: Auto-restart with session recovery
- **State**: Per-instance in ~/.hal-o/instances/<id>/

**Key files:**
- src/main/session-manager.ts — save/restore sessions
- src/main/session-externalize.ts — detach sessions from Electron process tree
- src/main/terminal-manager.ts — PTY lifecycle (xterm + node-pty)

### Multi-Instance Isolation
- Each instance (clone) has isolated data, ports, and identity
- Main instance: ~/.hal-o/
- Clone instance: ~/.hal-o/instances/<id>/
- Each listens on a unique port (19400, 19410, 19420, etc.)
- Configuration via instance.json

**Key file:**
- src/main/instance.ts — getDataDir(), getPort(), getInstanceId()

### Multi-Agent Orchestration
Route tasks to multiple LLM providers. Compare outputs. Execute.

**Debate system:**
- Multiple provider clients (Anthropic, OpenAI, Gemini, Groq, etc.)
- Preset debate modes (voting, consensus, sequential, panel)
- Rate limiting and Bearer token auth
- Per-provider knowledge cards

**Key files:**
- src/main/multi-agent-orchestrator.ts — debate engine
- src/main/debate-presets.ts — preset configurations
- src/main/provider-clients.ts — provider abstraction (HTTP, streaming)
- src/main/knowledge-base.ts — task routing + provider cards

### Voice I/O Pipeline
**STT:** faster-whisper (GPU-accelerated, local)
**TTS:** Chatterbox (GPU) → Edge TTS → ElevenLabs (priority chain)

- 2 voice profiles: Hal (butler) + Hallie (soft)
- Mood detection and tone adaptation
- Push-to-talk (CTRL+SPACE), Telegram voice messages, Halo Chat voice

**Key files:**
- src/renderer/src/components/MicButton.tsx — push-to-talk UI
- ~/.claude/scripts/transcribe.py — STT wrapper
- ~/.claude/scripts/tts.py — TTS wrapper

### HTTP API + WebSocket
**RESTful endpoints:**
- POST /dispatch — send message to terminal or agent
- GET /agents — list active agents
- POST /debate — create and run multi-agent debate
- GET /sessions — list terminal sessions
- POST /feature-flags — toggle features per instance

**WebSocket:**
- Real-time terminal output streaming
- Session state updates
- Agent responses

**Security:**
- Bearer token auth (auto-generated, stored in api-token.txt)
- Rate limiting (60 req/min per IP)

**Key file:**
- src/main/http-api.ts — server implementation

### Feature Flags & Knowledge Base
**Feature flags:** Enable/disable features per instance, per deployment

**Knowledge base:**
- Provider cards (markdown): how to use each LLM provider
- Task routing: which providers to recommend for a given task
- Shipped defaults in _knowledge/, user overrides in ~/.hal-o/instances/<id>/knowledge-base/

**Key files:**
- src/main/feature-flags.ts — flag system
- src/main/knowledge-base.ts — KB loader + router

---

## Product Layer 1: HAL-O (This Repo)

### User-Facing Features

**3D Dispatcher:**
- 3 renderer modes: Classic (CSS cards), Holographic (lightweight 3D), PBR Holographic (full rendering)
- 10 switchable 3D layouts (dual-ring, spiral, grid, etc.)
- Real-time git stats on every project card

**Terminal Management:**
- Split-pane tabs (drag to organize)
- 50K character scrollback per session
- Session persistence across restarts
- Voice focus: click a tab to speak to that session

**Voice-First Control:**
- Push-to-talk (CTRL+SPACE)
- Telegram voice message routing
- Voice responses with mood detection
- Settings: voice profile, tone, personality dials

**Remote Control:**
- Telegram bot integration
- Auto-AFK detection
- Voice message transcription

**Customization:**
- 8 sphere styles
- 6 color themes
- 4 personality dials (humor, formality, verbosity, dramatic)
- Font, dock position, renderer mode in real-time settings

**Project Onboarding:**
- One-click import wizard
- Stack detection
- Never overwrites existing CLAUDE.md

### Implementation

**Stack:**
- Electron 35 + React 19 + TypeScript + electron-vite
- Three.js via @react-three/fiber + drei + postprocessing
- xterm.js + node-pty (native PTY, compiled with VS 2022)
- Playwright E2E tests

**Key components:**
- src/renderer/src/components/three/PbrHoloScene.tsx — main PBR renderer (~3500 lines)
- src/renderer/src/components/ProjectHub.tsx — hub switching renderers
- src/renderer/src/components/TerminalView.tsx — split-pane terminal
- src/renderer/src/components/SettingsMenu.tsx — settings UI
- src/main/ipc-handlers.ts — all Electron IPC channels

---

## Product Layer 2: Halo Chat (Mobile PWA)

Dispatcher running on mobile via PWA. Connects to HAL-OS via HTTP API.

**Features:**
- Push-to-talk voice input
- Mobile-optimized UI
- External session routing (route messages to internal or external Claude sessions)
- Telegram sync

**Key file:**
- src/main/halochat-external.ts — session routing logic


---

## Data Flow

### Message → Terminal → Claude → Response

```
User (Telegram / Halo Chat / Terminal)
  ↓
[HTTP API / WebSocket]
  ↓
session-manager: find session by project/alias
  ↓
multi-agent-orchestrator: route to provider(s)
  ↓
provider-clients: HTTP call to Claude / OpenAI / etc.
  ↓
response-capture: inject response into terminal via PTY
  ↓
voice-out: TTS + Web Audio (if voice mode)
```

### Voice In → Transcribe → Process → TTS → Voice Out

```
User pushes CTRL+SPACE (or sends TG voice message)
  ↓
transcribe.py: faster-whisper (local GPU)
  ↓
MicButton: parse command or route to dispatcher
  ↓
multi-agent-orchestrator: route to Claude
  ↓
tts.py: Chatterbox → Edge TTS → ElevenLabs
  ↓
TerminalPanel: play audio via Web Audio API
  ↓
DataParticles: visualize spectrum
```

---

## Building a New Dispatcher on HAL-OS

### Minimal Example

1. **Import platform services:**
   ```typescript
   import { getPort, dataPath } from './src/main/instance'
   import { terminalManager } from './src/main/terminal-manager'
   import { dispatchMessage } from './src/main/dispatcher'
   import { loadKBIndex } from './src/main/knowledge-base'
   ```

2. **Start HTTP server:**
   ```typescript
   // Your dispatcher listens on getPort()
   // Use the HTTP API to route messages to agents
   ```

3. **Save sessions:**
   ```typescript
   // Sessions auto-persist to dataPath('sessions.json')
   ```

4. **Voice I/O:**
   ```typescript
   // Import MicButton and TerminalPanel for voice UI
   // Or use the HTTP API to transcribe/synthesize
   ```

### Key Extension Points

| Feature | File | How to extend |
|---------|------|---------------|
| New renderer | src/renderer/src/components/three/ | Create scene component, register in ProjectHub |
| New voice profile | ~/.claude/voicebox/<name>/ | Drop samples, update tts.py |
| New layout | src/renderer/src/layouts3d.ts | Export function, add to selector |
| New debate preset | src/main/debate-presets.ts | Add preset object |
| New provider | src/main/provider-clients.ts | Add client class + KB card |
| New IPC channel | src/main/ipc-handlers.ts | Add handler + call from renderer |

---

## Key IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| scan-projects | Renderer → Main | Discover projects in home directory |
| pty-new | Renderer → Main | Create terminal |
| pty-input | Renderer → Main | Send input to PTY |
| pty-output | Main → Renderer | PTY output (streamed) |
| voice-transcribe | Renderer → Main | Transcribe audio |
| voice-synthesize | Renderer → Main | TTS |
| get-settings | Renderer → Main | Load settings |
| set-settings | Renderer → Main | Save settings |
| dispatch | Renderer → Main | Route message to agent |

---

## For Developers

### Architecture Decisions

1. **Sessions survive restarts:** Using state files + fast recovery, not database. Keeps HAL-OS lightweight.
2. **Multi-instance isolation:** Each instance is a separate directory, port, and Electron window. No shared mutable state.
3. **Voice is local-first:** GPU-accelerated STT + priority TTS chain. Falls back to cloud services gracefully.
4. **HTTP API is simple:** RESTful endpoints, no GraphQL or complex query language. Easy to call from any client.
5. **Platform is Electron + Node:** Standard web stack. Dispatchers can be Electron apps, PWAs, CLI tools, etc.

### Testing

- npx tsc --noEmit — type check after every change
- npx playwright test e2e/smoke.spec.ts — UI smoke test
- npx playwright test e2e/isolation-test.spec.ts — multi-instance tests
- Launch both apps and verify end-to-end before shipping

### Contributing

Fork the repo, create a feature branch, run tests, open a PR. For major changes, open an issue first.

---

## Links

- **GitHub:** https://github.com/HAL-XP/hal-o
- **CLAUDE.md:** Project rules, bug history, dev philosophy
- **Devlog:** _devlog/ — session notes, architecture decisions, performance data
