<p align="center">
  <img src="resources/icon_256.png" alt="HAL-O" width="120" />
</p>

<h1 align="center">HAL-O</h1>

<p align="center">
  <b>Holographic Adaptive Layer for Claude Code</b><br>
  A 3D command center that works with any project.
</p>

<p align="center">
  <img src="screenshots/readme-demo-default.png" alt="HAL-O — PBR Holographic view with demo projects" width="800" />
</p>

## What is HAL-O?

HAL-O is a desktop dashboard for [Claude Code](https://claude.ai/code) projects. It wraps your existing projects in a holographic 3D hub with embedded terminals, voice control, and multi-agent orchestration — without changing your code or workflow.

**It works with any project.** New or existing. Python, Node, Go, Rust, games, data science, or anything else. HAL-O detects what you have and adds just what's missing — it never overwrites your existing `CLAUDE.md`, rules, or configuration.

## Why HAL-O?

| | Without HAL-O | With HAL-O |
|---|---|---|
| **Project view** | File tree + terminal | 3D holographic dashboard with live git stats |
| **Multi-agent** | Separate terminal windows | Split panes in one app, coordinated via Telegram |
| **Voice** | None | 20 voice personalities, push-to-talk, auto-speak output |
| **Onboarding** | Manual CLAUDE.md + hooks setup | Wizard auto-detects stack, generates best practices |
| **Session resilience** | Lost on crash | Auto-save, restore, absorb external sessions |
| **Best practices** | Copy-paste from docs | Generated rules, hooks, and conventions per stack |

## Getting Started

### Use with existing projects (recommended)

1. Install and launch HAL-O
2. Click **+ ADD PROJECT** and select your project folder
3. HAL-O scans it, shows what it found, lets you pick what to add
4. Your existing config stays untouched — HAL-O only adds what's missing

### Create a new project

1. Click **+ NEW** in the hub
2. The wizard auto-detects your stack or lets you pick
3. It generates `CLAUDE.md`, hooks, rules, devlog templates, and launch scripts
4. Your project is ready with best-in-class Claude Code configuration

### Quick install

```bash
git clone https://github.com/HAL-XP/hal-o.git
cd hal-o

# Windows
_scripts\win\_RUN_WIZARD.bat

# macOS / Linux
chmod +x _scripts/unix/_RUN_WIZARD.sh && ./_scripts/unix/_RUN_WIZARD.sh
```

The script auto-installs dependencies on first run.

## Features

### 3D Holographic Dashboard
- **3 renderers** — Classic (CSS cards), Holographic, PBR Holographic (bloom, reflections, post-processing)
- **10 layouts** — Default ring, dual-ring, spiral, hemisphere, arena, grid-wall, DNA helix, cascade, constellation, stacked-rings
- **6 visual styles + 28 color palettes** — Tactical, holographic, neon, minimal, ember, arctic
- **Live project stats** — Git activity, file counts, health indicators on each screen panel

### Embedded Terminal
- **xterm.js + node-pty** with split panes, drag-to-dock tabs (bottom/right/left)
- **Session persistence** — Scrollback survives reloads, sessions restore across relaunches
- **Crash recovery** — Renderer crashes auto-reload without losing terminal state

### Voice System
- **20 voice profiles** — From calm narrator to drill sergeant, each with sentiment-aware sample selection
- **Push-to-talk** (Ctrl+Space) with live transcription via faster-whisper
- **Auto-speak** terminal output with configurable voice personality

### Project Wizard & Best Practices
- **Auto-detect** stack from project files (package.json, pyproject.toml, go.mod, Cargo.toml, etc.)
- **Smart defaults** per stack — generates CLAUDE.md, hooks, domain-specific rules, devlog templates
- **10+ rule files** — Frontend, UX, Python API, Node API, Go, Rust, game dev, data science, mobile, banned techniques
- **Hours tracking** with human-equivalent estimation methodology
- **Agent templates** — Frontend, backend, and QA verifier agents ready to use
- **Non-destructive import** — Never overwrites existing config, only adds what's missing

### Multi-Agent & Telegram
- Run multiple Claude agents in split terminal panes
- Telegram notifications for permission prompts and idle updates
- Session absorption — bring external Claude sessions back into the app

### Everything Else
- **Setup screen** — Auto-detect and one-click install git, Python, Claude CLI, ffmpeg, GitHub CLI
- **Custom project groups** — Color-coded groups with group-aware 3D layouts
- **Demo mode** — 30 simulated projects with scripted terminal feeds for presentations
- **16 languages** — EN, FR, ES, DE, PT, IT, NL, PL, RU, TR, AR, HI, JA, ZH, KO, VI
- **Docker testing** and **GitHub Actions CI** (Linux + Windows)

## Screenshots

### Spiral Layout

<p align="center">
  <img src="screenshots/readme-demo-spiral.png" alt="Spiral layout — projects arranged in a rising helix" width="800" />
</p>

### Neon 3D Style

<p align="center">
  <img src="screenshots/readme-demo-neon.png" alt="Neon style — accent-colored sphere core with intensified bloom" width="800" />
</p>

## Development

```bash
npm install
npm run dev          # Start in dev mode (hot reload)
npm run build        # Production build
npm run test         # Playwright E2E tests
npm run test:docker  # Run tests in Docker
```

## Architecture

```
src/
  main/              Electron main process — PTY management, IPC handlers, window lifecycle
  renderer/src/
    components/
      three/          Three.js scenes — PBR holo, classic, screen panels, sphere, starfield
      SettingsMenu    Renderer, layout, style, font, voice settings
      ProjectHub      Main hub — switches between renderers
      TerminalView    Split-pane terminal with drag-to-dock tabs
      MicButton       Push-to-talk voice input
    hooks/            useSettings, useTerminalSessions, useI18n
    layouts.ts        10 layout positioning functions
```

| Layer | Tech |
|-------|------|
| Framework | Electron 35, React 19, TypeScript |
| Build | electron-vite |
| 3D | Three.js via @react-three/fiber, drei, postprocessing |
| Terminal | xterm.js + node-pty |
| Voice | faster-whisper (STT), Chatterbox/Voicebox/Edge TTS (TTS) |
| Tests | Playwright, Docker Compose |

## Community Compatibility

HAL-O plays nicely with other Claude Code setups. If you already use:
- **Existing CLAUDE.md** — HAL-O won't overwrite it. Import adds alongside, not on top.
- **Custom rules** — Your `.claude/rules/` files are preserved. HAL-O only adds missing ones.
- **Other tools** (Cursor, aider, etc.) — HAL-O detects existing configs and skips over them.

## License

[MIT](LICENSE)
