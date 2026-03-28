<p align="center">
  <img src="resources/icon_256.png" alt="HAL-OS" width="120" />
</p>

<h1 align="center">HAL-OS</h1>

<p align="center">
  <b>An open platform for building AI dispatcher applications</b><br>
  <i>HAL-O is the reference 3D dispatcher. Halo Chat is the mobile dispatcher. Build yours.</i>
</p>

<p align="center">
  <img src="screenshots/readme-ember.jpg" alt="HAL-O holographic dispatcher" width="800" />
</p>

```bash
git clone https://github.com/HAL-XP/hal-o.git && cd hal-o && START_HERE.bat
```

---

## What is HAL-OS?

HAL-OS is a platform for building AI dispatcher applications. A dispatcher is a central hub that routes work to multiple AI agents, manages persistent sessions, and provides spatial memory across projects.

**HAL-O** (this repo) is our reference implementation — a beautiful 3D holographic dispatcher for managing AI coding sessions on the desktop. Your projects orbit a glowing sphere. You talk to them by voice. Terminals, agents, and remote control live in one spatial environment.

**Halo Chat** is the mobile PWA dispatcher — the same platform on your phone.

**You can build your own** dispatcher on HAL-OS with the platform's session management, HTTP API, multi-agent orchestration, and persistence layer.

---

## HAL-OS Platform

### Core Capabilities

| Feature | Purpose |
|---------|---------|
| **Session Management** | Sessions survive restarts, crashes, and reboots. Restore with one click. |
| **Multi-Instance Isolation** | Run multiple instances on the same machine. Each has isolated data, ports, and identity. |
| **Voice I/O Pipeline** | STT (faster-whisper GPU) + TTS (Chatterbox/Edge/ElevenLabs). Push-to-talk, Telegram, Halo Chat. |
| **HTTP API** | RESTful endpoints for multi-agent orchestration, feature flags, and remote dispatch. |
| **Multi-Agent Debate** | Route tasks to multiple LLM providers. Compare, vote, execute. |
| **Watchdog & Auto-Restart** | Monitor health. Auto-restart on crash with session preservation. |
| **Feature Flags** | Enable/disable features per instance, per deployment. |

### Architecture

```
HAL-OS (Platform)
- Session Management & Persistence
- Multi-Instance Isolation
- Voice I/O Pipeline
- HTTP API & Orchestration
- Watchdog & Auto-Restart
Products:
  - HAL-O (3D Desktop)
  - Halo Chat (Mobile PWA)
  - [Your Dispatcher]
```

---

## HAL-O Features

### See all your projects at once

Holographic dashboard with three renderers:
- **PBR Holographic** — Full physically-based rendering, bloom, chromatic aberration
- **Holographic** — Lightweight 3D wireframe
- **Classic** — CSS cards with 10 switchable layouts

Ten 3D layouts. Git stats pulse on every card.

### Talk to your code

Ctrl+Space push-to-talk. Two voices (Hal, Hallie) with mood detection. Telegram voice messages transcribed and routed. Voice replies sent back.

### Manage all sessions in one place

Split-pane terminal tabs. Drag tabs to organize. Session persistence across restarts. 50K character scrollback. Voice focus: click a tab to speak to that session.

### Remote control via Telegram

Voice message from your phone, transcribed, routed, and replied to by voice. Auto-AFK detection.

### Customize everything

8 sphere styles. 6 themes. 4 personality dials (humor, formality, verbosity, dramatic). Tweak in real time.

### One-click setup

START_HERE.bat installs everything. Wizard scans your stack. Import any project in seconds. Never overwrites CLAUDE.md.

---

## Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Electron 35, React 19, TypeScript |
| **Build** | electron-vite |
| **3D** | Three.js, @react-three/fiber, drei, postprocessing |
| **Terminal** | xterm.js + node-pty (native PTY) |
| **Voice STT** | faster-whisper (GPU-accelerated, local) |
| **Voice TTS** | Chatterbox / Edge TTS / ElevenLabs (priority chain) |
| **Tests** | Playwright E2E, Docker Compose, GitHub Actions |
| **i18n** | 16 languages |

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- Python 3.10+ (for voice, optional)

### Install and run

```bash
git clone https://github.com/HAL-XP/hal-o.git
cd hal-o

# Windows
START_HERE.bat

# macOS / Linux
npm install && npm run dev
```

### Manual setup

```bash
npm install
npm run dev          # Dev mode with hot reload
npm run build        # Production bundle
npm run test         # Playwright E2E tests
```

### Import projects

1. Launch HAL-O
2. Click + ADD PROJECT
3. Select a folder — wizard scans your stack
4. Review and add what you need
5. HAL-O respects existing configurations

---

## Multi-Instance Setup

Run multiple independent instances on the same machine.

```bash
# Main instance
git clone https://github.com/HAL-XP/hal-o.git
npm install && npm start

# Clone instance
git clone https://github.com/HAL-XP/hal-o.git work-assistant
cd work-assistant
cp instance.example.json instance.json
# Edit: change id, name, port (e.g., 19410)
npm install && npm start
```

Each instance stores data in ~/.hal-o/instances/<id>/ and listens on a unique port. OneDrive can sync for backup.

---

## For Developers

### Build a dispatcher on HAL-OS

HAL-OS is a standard Node.js + Electron platform. No proprietary framework or plugin system.

1. **Session persistence**: Import session-manager.ts, call saveSession() / restoreSession()
2. **Multi-agent routing**: Import multi-agent-orchestrator.ts, pick a debate preset
3. **Voice I/O**: Use the voice pipeline for STT + TTS
4. **Feature flags**: Check feature-flags.ts at runtime
5. **HTTP API**: POST to http://localhost:19400/dispatch

See src/main/http-api.ts for endpoint details.

### Extend HAL-O

Standard React + Three.js patterns.

- **Add a layout**: Export from src/renderer/src/layouts3d.ts
- **Add a voice profile**: Drop samples in ~/.claude/voicebox/<name>/
- **Add a visual style**: CSS palette + Three.js color bridge
- **Add a renderer**: Create scene component, register in ProjectHub.tsx

### Key files

```
src/
  main/
    index.ts                     Window lifecycle
    terminal-manager.ts          PTY lifecycle
    ipc-handlers.ts              All IPC channels
    instance.ts                  Multi-instance isolation
    session-manager.ts           Session persistence
    multi-agent-orchestrator.ts  Debate + routing
    http-api.ts                  Dispatcher API
    feature-flags.ts             Feature control

  renderer/src/
    components/three/
      PbrHoloScene.tsx           Main PBR renderer
      ScreenPanel.tsx            Project card
      DataParticles.tsx          Particle system
    ProjectHub.tsx               Main hub
    TerminalView.tsx             Split-pane tabs
    SettingsMenu.tsx             Settings UI
    layouts3d.ts                 10 3D layouts
```

---

## Competitive Edge

| Aspect | HAL-OS | Cursor | Windsurf | Warp |
|--------|--------|--------|-----------|------|
| **Spatial memory** | 3D orbit | Tabs | Blocks | Linear |
| **Multi-agent** | Debate + voting | Single LLM | Single LLM | None |
| **Voice-first** | Push-to-talk + TTS | Chat | Chat | None |
| **Persistence** | Survives restarts | File-based | File-based | History |
| **Multi-instance** | Yes, isolated | Single | Single | Single |
| **Offline** | Yes | Partial | Partial | Yes |
| **Open source** | MIT | Proprietary | Proprietary | Rust |

---

## Contributing

HAL-OS is MIT licensed. Contributions welcome.

1. Fork the repo
2. Create a feature branch
3. Run tests: npm run test
4. Open a PR

Discuss major changes in an issue first.

---

## License

[MIT](LICENSE)

---

## Resources

- **GitHub**: https://github.com/HAL-XP/hal-o
- **CLAUDE.md**: Project rules, bug fixes, dev philosophy
- **Devlog**: _devlog/ — notes, architecture, perf data
