<p align="center">
  <img src="resources/icon_256.png" alt="Claudeborn" width="120" />
</p>

<h1 align="center">Claudeborn</h1>

<p align="center">Electron wizard for bootstrapping Claude Code projects with best practices.</p>

<p align="center"><em>"FUS RO CLAUDE"</em> — shout a new project into existence.</p>

<p align="center">
  <img src="screenshots/stack.png" alt="LLM-powered stack analysis" width="700" />
</p>

## Quick Start

```bash
git clone https://github.com/HAL-XP/Claudeborn.git
cd Claudeborn

# Windows
_RUN_WIZARD.bat

# macOS / Linux
chmod +x _RUN_WIZARD.sh && ./_RUN_WIZARD.sh
```

That's it. The script auto-installs dependencies on first run.

**Only prerequisite:** Node.js 18+ (you already have it if you use Claude Code CLI).

## What it does

Claudeborn walks you through setting up a new Claude Code project via an assistant-style chat interface.

### First-Run Setup

Checks prerequisites and helps you set up anything missing — all in-app.

<p align="center">
  <img src="screenshots/init-screen.png" alt="Setup screen" width="500" />
</p>

### Smart Stack Analysis

Describe your project, and Claude Sonnet searches the web for the latest frameworks then suggests the best tech stack, languages, styling, database, and conventions. Accept in one click or adjust manually.

<p align="center">
  <img src="screenshots/stack.png" alt="Stack analysis" width="700" />
</p>

### 16 Languages

Switch languages on the fly — the entire UI translates instantly.

<p align="center">
  <img src="screenshots/languages.png" alt="16 languages" width="700" />
</p>

### Project Creation

Everything generated in seconds — CLAUDE.md, hooks, rules, agents, devlog, scripts, .gitignore, README. With confetti and a victory fanfare.

<p align="center">
  <img src="screenshots/project-created.png" alt="Project created" width="700" />
</p>

### Full Feature List

**25 Curated Stack Profiles**

Smart defaults tailored for solo developers — hooks, rules, extras, and cloud suggestions all adjust based on your stack:

| Category | Stacks |
|----------|--------|
| Web / Frontend | React, Next.js, SvelteKit, Astro, Nuxt, Remix |
| Full-Stack | React + Node, React + FastAPI, Python + HTMX |
| Backend | FastAPI, Express/NestJS, Go, Rust (Axum/Actix) |
| Desktop | Electron, Tauri |
| Mobile | React Native / Expo |
| Games | Pygame, Godot |
| CLI / Scripts | Node CLI, Python CLI, automation/scraping |
| Data / ML | Jupyter + pandas, ML training pipeline |
| Other | Static HTML/CSS/JS |

**Smart Context-Aware Defaults**
- Playwright MCP only suggested for frontend stacks (not for CLI, games, backends)
- Agent templates only for projects complex enough to need them
- Cloud integrations suggested per stack: Vercel, Cloudflare, GCP, AWS, Supabase, Docker, Railway, Fly.io
- Stack-specific rules: go-api, rust-api, game-loop, data-pipeline, mobile (alongside frontend, ux, python-api, node-api, banned-techniques)

**Project Setup**
- LLM-powered stack analysis (Sonnet + web search) with folder scanning
- GitHub repo creation via `gh` CLI (personal or org, public or private)
- Local `git init` fallback

**Claude Code Configuration**
- CLAUDE.md generation from [claude-cli-setup-tips](https://github.com/HAL-XP/claude-cli-setup-tips) best practices
- Stack-aware hooks (SessionStart, PostToolUse tsc/pycache/fmt)
- 10 rule templates: frontend, ux, python-api, node-api, go-api, rust-api, game-loop, data-pipeline, mobile, banned-techniques
- Agent templates (QA verifier, frontend, backend, gamedev, data-analyst)
- Playwright MCP (`.mcp.json`) for frontend stacks

**Project Structure**
- `_devlog/` — summaries, hours tracking, architecture decisions, experiments
- Launch scripts — `.bat` (Windows) and `.sh` (macOS/Linux)
- Stack-aware .gitignore (Python, Rust, Go, Tauri, games, data science, Playwright)
- README.md, MEMORY.md seed
- PID tracking (`.claude/.pids`) for safe process management

**UI**
- Typing animation with blinking cursor
- Staggered button entrance
- Phase progress bar with glow animations
- Confetti + JRPG victory fanfare on success
- Dark/light theme toggle
- Sound effects (Web Audio API, no files)
- 16 languages (EN, FR, ES, DE, PT, IT, NL, PL, RU, TR, AR, HI, JA, ZH, KO, VI)
- Custom Scroll/Blueprint logo

## Optional Extras

| Tool | What for | Without it |
|------|----------|------------|
| `gh` CLI (authenticated) | Create GitHub repos directly | Use "just git init locally" option |
| `ANTHROPIC_API_KEY` | LLM-powered stack analysis | Falls back to manual stack selection |

### API Key Lookup

Set your key in any of these (checked in order):

1. `ANTHROPIC_API_KEY` environment variable
2. `.env` / `.env.local` in project or wizard folder
3. `~/.env`
4. `~/.claude_credentials` (`export ANTHROPIC_API_KEY="sk-ant-..."`)

## Stack

- **Electron** + **React 19** + **TypeScript**
- **Anthropic SDK** (Sonnet + web search, 25 curated stack profiles)
- **electron-vite** for build tooling
- **Web Audio API** for sound effects (no audio files)
- **Canvas API** for confetti animation (no libraries)
