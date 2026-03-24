<p align="center">
  <img src="resources/icon_256.png" alt="HAL-O" width="120" />
</p>

<h1 align="center">HAL-O: Your Personal Jarvis for Code</h1>

<p align="center">
  <b>H</b>olographic <b>A</b>daptive <b>L</b>ayer — <b>O</b>pen Source<br>
  <i>The O is yours — fork it, extend it, make it your own.</i>
</p>

<p align="center">
  <img src="screenshots/readme-demo-default.png" alt="HAL-O — PBR Holographic view with demo projects" width="800" />
</p>

---

## Imagine this

You sit down to code. A holographic dashboard floats in front of you — every project you work on, arranged in a glowing 3D ring. Git stats pulse on each panel. You say *"open the API server"* and a terminal appears, already in the right directory. A small starship streaks across the scene as the session spins up. Your AI copilot speaks back in the voice you chose — calm narrator, sarcastic GLaDOS, or a loyal orc peon reporting for duty.

This is HAL-O. Not a theme. Not a plugin. A full cockpit for the way you already work, built to make writing code *feel* like something.

---

## Why HAL-O exists

Every developer tool optimizes for **speed** — faster builds, faster completions, faster deploys. HAL-O optimizes for something no one else is working on: **how it feels to write code.**

There is no rational reason your project dashboard needs a holographic sphere with bloom lighting. There is no productivity metric for a spaceship flyby when you open a terminal. But the moment you see your projects floating in 3D space, hear your AI copilot respond in a voice that fits the mood, and watch a starship bank through the scene as your session starts — you stop dreading the next task and start looking forward to it.

HAL-O is built on a simple thesis: **developers who enjoy their environment write better code.** Everything in here — the 3D renderer, the voice system, the cinematic moments — serves that thesis.

---

## Features

### Talk to your code
Twenty voice personalities. Push-to-talk with Ctrl+Space. Say something, hear something back — in a voice that matches the moment. Calm narrator for explanations. Drill sergeant for critical failures. A wizard for risky operations. GLaDOS when tests fail. Your AI copilot is no longer a text box.

### See your work in 3D
A holographic dashboard where every project is a glowing panel on a rotating ring. Git activity pulses on each screen. Health indicators show which projects need attention. Ten layouts — spiral helix, constellation map, arena, DNA strand — because your projects deserve more than a flat list.

### Work inside, not around
Embedded terminals with split panes, drag-to-dock tabs, and session persistence. Crash the renderer? Your terminals survive. Relaunch the app? Sessions restore with full scrollback. Voice output reads terminal responses aloud so you can listen while you think.

### Cinematic moments that earn their keep
A procedural starship streaks through the scene when you open a terminal. Sonar rings pulse from the central sphere when your AI comes online. Data particles drift through the holographic space. None of this is necessary. All of it makes you want to keep the app open.

### Zero friction onboarding
Point HAL-O at any project folder. The wizard scans your stack, shows what it found, and offers to generate best-practice configuration — CLAUDE.md, hooks, rules, devlog templates. It never overwrites what you already have. Existing projects import in seconds. New projects get a full scaffold.

### Demo mode
Thirty simulated projects with scripted terminal feeds. Show HAL-O to someone without exposing your real work. Perfect for presentations, streams, or just showing off.

---

## Screenshots

### Spiral Layout

<p align="center">
  <img src="screenshots/readme-demo-spiral.png" alt="Spiral layout — projects arranged in a rising helix" width="800" />
</p>

### Neon 3D Style

<p align="center">
  <img src="screenshots/readme-demo-neon.png" alt="Neon style — accent-colored sphere core with intensified bloom" width="800" />
</p>

---

## For Developers

### Three renderers, one app

| Renderer | What it is |
|----------|-----------|
| **PBR Holographic** | Full physically-based rendering — reflective floor, bloom, chromatic aberration, vignette. The flagship experience. |
| **Holographic** | Lightweight 3D — wireframe sphere, orbital rings. Lower GPU load, same spatial layout. |
| **Classic** | CSS cards over a Three.js background. Ten switchable layouts. Runs on anything. |

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 35, React 19, TypeScript |
| Build | electron-vite |
| 3D | Three.js via @react-three/fiber, drei, postprocessing |
| Terminal | xterm.js + node-pty (native PTY, not a web shell) |
| Voice STT | faster-whisper (GPU-accelerated, local) |
| Voice TTS | Chatterbox / Voicebox / Edge TTS / ElevenLabs (priority chain) |
| Tests | Playwright E2E, Docker Compose, GitHub Actions CI |
| i18n | 16 languages (EN, FR, ES, DE, PT, IT, NL, PL, RU, TR, AR, HI, JA, ZH, KO, VI) |

### Architecture

```
src/
  main/                 Electron main process
    index.ts              Window lifecycle, PID tracking, screenshot capture
    terminal-manager.ts   PTY lifecycle, 50K char scrollback buffer
    ipc-handlers.ts       All IPC: project scanning, PTY, voice, app control
    platform.ts           Cross-platform helpers

  renderer/src/
    components/
      three/              3D scenes and objects
        PbrHoloScene.tsx     PBR renderer (reflective floor, textured ring, sphere, screens, particles, HUD, ship, post-FX)
        HolographicScene.tsx Basic holographic renderer
        ScreenPanel.tsx      Project panel — git stats, activity bars, file count, health indicators
        DataParticles.tsx    Ambient particle system (cyan/green data motes)
        HudScrollText.tsx    Edge-scrolling system text with scanline effect
        SpaceshipFlyby.tsx   Procedural ship on CatmullRom path with engine trail
        SceneRoot.tsx        Classic renderer scene
      ProjectHub.tsx       Main hub — renderer switching, project display
      TerminalView.tsx     Split-pane terminal with drag-to-dock tabs
      SettingsMenu.tsx     All settings: renderer, layout, style, voice, fonts, dock
      ImportScreen.tsx     Zero-friction project import wizard
      MicButton.tsx        Push-to-talk (Ctrl+Space)
    hooks/
      useSettings.ts       Persistent settings state
      useTerminalSessions.ts Terminal session management
      useI18n.ts           Internationalization hook
    layouts.ts             10 CSS layout functions (classic renderer)
    layouts3d.ts           10 3D layout functions (PBR/holo renderers)
```

### Extending HAL-O

HAL-O is a standard Electron + React + Three.js app. No proprietary framework, no plugin API to learn.

- **Add a layout**: Export a function from `layouts3d.ts` that returns `{position, rotation}` for N screens.
- **Add a voice profile**: Drop audio samples in `~/.claude/voicebox/samples/<name>/` and add the profile to the TTS script.
- **Add a visual style**: Define a palette in the theme system (CSS variables + Three.js color bridge).
- **Add a renderer**: Create a scene component, register it in `ProjectHub.tsx`.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Git**
- **Python 3.10+** (for voice features — optional)
- **Claude CLI** (for AI features — optional)

### Install and run

```bash
git clone https://github.com/HAL-XP/hal-o.git
cd hal-o

# Windows (recommended — runs the full setup wizard)
_scripts\win\_RUN_WIZARD.bat

# macOS / Linux
chmod +x _scripts/unix/_RUN_WIZARD.sh && ./_scripts/unix/_RUN_WIZARD.sh
```

The wizard script handles dependency installation, native module compilation, and first-run setup.

### Manual install

```bash
npm install
npm run dev          # Start in dev mode (hot reload)
npm run build        # Production build
npm run test         # Playwright E2E tests
```

### Import your projects

1. Launch HAL-O
2. Click **+ ADD PROJECT** and select any project folder
3. The wizard scans your stack and shows what it found
4. Pick what to add — HAL-O never overwrites existing configuration

---

## The O stands for Open Source

HAL-O is MIT licensed. The **O** in the name is deliberate — this is an open platform meant to be forked, extended, and made your own.

**Ideas for your fork:**
- Swap the holographic theme for something that matches your aesthetic
- Add voice profiles in your language
- Build project-type-specific screen panels (Kubernetes cluster view, database dashboard, CI pipeline)
- Create new 3D layouts that make sense for how you organize work
- Wire up different AI backends beyond Claude

The architecture is intentionally simple. One Electron app, one React tree, one Three.js scene graph. No microservices, no cloud dependencies, no accounts. Everything runs on your machine.

**Community compatibility:** HAL-O plays nicely with existing setups. If you already have a `CLAUDE.md`, custom rules in `.claude/rules/`, or configs from other tools (Cursor, aider, etc.) — HAL-O detects them and works alongside, never on top.

---

## License

[MIT](LICENSE)
