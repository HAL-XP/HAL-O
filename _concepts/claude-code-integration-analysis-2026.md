# HAL-O x Claude Code Integration Analysis — March 2026

> Comprehensive research report: latest Claude Code features, MCP ecosystem, competitive landscape, Anthropic developer relations, and prioritized integration roadmap.

---

## Table of Contents

1. [Claude Code Latest Features Deep Dive](#1-claude-code-latest-features-deep-dive)
2. [MCP Integration Opportunities](#2-mcp-integration-opportunities)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Anthropic Developer Relations](#4-anthropic-developer-relations)
5. [Prioritized Integration Recommendations](#5-prioritized-integration-recommendations)

---

## 1. Claude Code Latest Features Deep Dive

### 1.1 Auto Mode (March 24, 2026)

**What it is**: A new permission mode that uses a background AI classifier to evaluate each tool call before execution. Safe operations auto-approve; dangerous ones block. Available as research preview on Team plan, works with both Sonnet 4.6 and Opus 4.6.

**How it works with subagents**: Evaluates at spawn (task description), during execution (same block/allow rules as parent), and per tool call independently.

**HAL-O Integration**:
- **Visual auto-mode toggle** in the HUD topbar or Settings — let users switch between `default`, `acceptEdits`, `auto`, `bypassPermissions` with a single click, showing a real-time indicator of which mode is active.
- **Classifier feedback overlay** — show in the 3D scene when the classifier blocks vs. allows an action (brief particle flash: green = allowed, red = blocked). This gives the "mission control" operator feel.
- **Per-project permission profiles** — HAL-O already manages project cards. Attach a permission profile to each project card (e.g., "production = strict, playground = bypass").

| Impact | Effort | Priority |
|--------|--------|----------|
| HIGH | EASY | Quick Win |

### 1.2 Agent Teams (February 5, 2026)

**What it is**: Orchestrate 2-16 Claude Code sessions working together. One lead coordinates, teammates work independently in their own context windows and git worktrees. Shared task list, direct peer-to-peer messaging via SendMessage, and self-coordination.

**Key architecture**: Team lead + teammates + shared task list + mailbox system. Config stored at `~/.claude/teams/{team-name}/config.json`, tasks at `~/.claude/tasks/{team-name}/`.

**Enable**: Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.json `env` block.

**HAL-O Integration — THIS IS THE KILLER FEATURE**:
- **3D Team Visualization**: Render each teammate as a distinct satellite orbiting the HAL sphere. The lead stays at center. When teammates message each other, draw animated data streams (particle trails) between satellites. Task completion triggers a completion pulse on the teammate's satellite.
- **Live Task Board in 3D**: The shared task list rendered as floating HUD panels around the sphere, color-coded by status (pending = cyan, in-progress = amber, completed = green). Click a task to zoom to the teammate working on it.
- **Split-pane teammate terminals**: Each teammate gets its own embedded xterm.js terminal in HAL-O's terminal dock. The lead's terminal is primary; Shift+Down cycling maps to clicking teammate tabs.
- **Team spawn from HAL-O**: Button on a project card: "Deploy Team" — opens a wizard where you describe the task and pick roles. HAL-O writes the appropriate prompt and spawns the team.
- **TeammateIdle / TaskCompleted hooks**: Wire into HAL-O's existing hook system to trigger sphere visual effects (pulse on completion, amber glow on idle).

| Impact | Effort | Priority |
|--------|--------|----------|
| GAME-CHANGING | HARD | Major Feature |

### 1.3 Channels System (March 20, 2026 — Research Preview)

**What it is**: MCP servers that push events into Claude Code sessions. Currently supports Telegram, Discord, iMessage, and fakechat. Plugin architecture means anyone can build more.

**HAL-O already uses**: Telegram channel via `--channels plugin:telegram@claude-plugins-official`.

**HAL-O Integration**:
- **HAL-O AS a Channel**: Build HAL-O itself as a Claude Code channel plugin. Instead of wrapping the CLI in xterm.js, HAL-O becomes a first-class channel that receives Claude's output as structured events and renders them in the 3D scene. This would fundamentally change the architecture from "terminal wrapper" to "native Claude Code UI".
- **Multi-channel dashboard**: Show active channels (Telegram, Discord, etc.) as small icons on the HUD, with message counts. Click to see channel activity.
- **Custom webhook channel**: HAL-O could host a local webhook receiver (port 8788 pattern from docs) that receives CI/CD events and renders them as floating alerts in the 3D scene.
- **Permission relay through HAL-O**: Since HAL-O runs locally, it could implement `claude/channel/permission` to show permission prompts as 3D dialog boxes in the scene rather than terminal prompts.

| Impact | Effort | Priority |
|--------|--------|----------|
| HIGH | MEDIUM (webhook receiver) / HARD (full channel) | Medium-Term |

### 1.4 Hooks — 25 Lifecycle Events

**Complete event list (as of v2.1.83)**:

| Category | Events |
|----------|--------|
| Session | `SessionStart`, `SessionEnd`, `InstructionsLoaded` |
| User Input | `UserPromptSubmit` |
| Tool Execution | `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure` |
| Agent | `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure` |
| Notification | `Notification` |
| Team/Task | `TeammateIdle`, `TaskCompleted` |
| Config | `ConfigChange`, `CwdChanged`, `FileChanged` |
| MCP | `Elicitation`, `ElicitationResult` |
| Worktree | `WorktreeCreate`, `WorktreeRemove` |
| Compaction | `PreCompact`, `PostCompact` |

**New in March 2026**: `CwdChanged`, `FileChanged` (v2.1.83), `StopFailure` (v2.1.78), `PostCompact` (v2.1.76), `Elicitation`/`ElicitationResult` (v2.1.76).

**HAL-O Integration**:
- **Hook-driven sphere reactions**: Map hook events to visual effects:
  - `SubagentStart` → new particle swarm spawns from sphere
  - `SubagentStop` → particles return to sphere
  - `TaskCompleted` → completion pulse + sound
  - `StopFailure` → red flash + error badge on sphere
  - `PreCompact` → sphere compression animation
  - `FileChanged` → subtle ripple on affected project card
- **Hook configuration UI**: HAL-O Settings could expose a visual hook editor — drag events onto action templates instead of editing JSON. This would be unique among all Claude Code GUIs.
- **`PostToolUse` audit log**: Render a scrolling audit log in the 3D scene (like HudScrollText) showing every tool call in real-time.

| Impact | Effort | Priority |
|--------|--------|----------|
| HIGH | MEDIUM | Medium-Term |

### 1.5 /loop and Cron Scheduling (v2.1.71, March 7)

**What it is**: `/loop 5m check the deploy` — runs a prompt or slash command on a recurring interval. Cron-like scheduling within a session.

**HAL-O Integration**:
- **Loop status indicator**: Show active loops as pulsing rings around the sphere (one ring per loop). Tooltip shows interval and last result.
- **Loop management panel**: List all active loops with pause/resume/cancel controls. Currently loops are invisible — HAL-O can surface them.
- **Disable cron**: `CLAUDE_CODE_DISABLE_CRON=1` env var available for test isolation.

| Impact | Effort | Priority |
|--------|--------|----------|
| MEDIUM | EASY | Quick Win |

### 1.6 StatusLine Scripts (v2.1.80+)

**What it is**: A customizable status bar that runs any shell script. Receives JSON session data on stdin with: model info, context window usage (%), cost ($), duration, rate limits (5h/7d windows), git info, session/worktree/agent metadata.

**Key fields available**: `model.display_name`, `context_window.used_percentage`, `cost.total_cost_usd`, `cost.total_lines_added/removed`, `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage`, `session_id`, `agent.name`, `worktree.*`

**HAL-O Integration — PERFECT FIT**:
- **3D StatusLine overlay**: Instead of a terminal status bar, render status data as floating HUD elements in the 3D scene. Context usage as a ring around the sphere (fills up as context fills). Cost as a running counter. Rate limits as gauge arcs.
- **StatusLine data feed**: Write a HAL-O statusline script that outputs JSON to a file. HAL-O's Electron main process watches the file and pushes data to the renderer via IPC. The 3D scene updates in real-time.
- **Alert thresholds**: Sphere turns amber at 70% context, red at 90%. Cost alerts at configurable thresholds. Rate limit warnings trigger a visual warning.

| Impact | Effort | Priority |
|--------|--------|----------|
| HIGH | EASY | Quick Win |

### 1.7 Managed Settings (`managed-settings.d/`)

**What it is** (v2.1.83): Drop-in directory for policy fragments. Teams deploy independent `.json` files that merge alphabetically. Also: `sandbox.failIfUnavailable`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`.

**HAL-O Integration**:
- **HAL-O managed settings fragment**: Ship a `hal-o.json` in `managed-settings.d/` that configures: HAL-O's custom hooks, channel plugins, and default permission rules. This means installing HAL-O auto-configures Claude Code.
- **Settings visualization**: Show active managed settings as a stack in Settings, with source indicators (managed/project/user/local).

| Impact | Effort | Priority |
|--------|--------|----------|
| MEDIUM | EASY | Quick Win |

### 1.8 Auto Memory & Memory Directory

**What it is**: Claude saves notes to `~/.claude/projects/<project>/memory/MEMORY.md` plus topic files. First 200 lines loaded per session. `autoMemoryDirectory` setting configures storage location (accepted from policy/local/user settings, NOT project settings).

**HAL-O Integration**:
- **Memory viewer in 3D**: Click a project card → see its memory files as a mini file tree overlay. Quick-edit from HAL-O without opening a terminal.
- **Memory health indicator**: Show memory file size on each project card. Warn when MEMORY.md approaches 200-line limit.
- **Cross-project memory search**: HAL-O can index all project memories and provide a global search across all projects.

| Impact | Effort | Priority |
|--------|--------|----------|
| MEDIUM | MEDIUM | Medium-Term |

### 1.9 MCP Elicitation (v2.1.76, March 14)

**What it is**: MCP servers can request structured input mid-task via interactive dialog (form fields or browser URL). New `Elicitation` and `ElicitationResult` hooks allow intercepting/overriding responses.

**HAL-O Integration**:
- **3D elicitation dialogs**: Instead of CLI prompts, render elicitation requests as floating 3D form panels in the scene. Sci-fi styled input fields with the HAL-O aesthetic.
- **Auto-respond hook**: Configure common elicitation responses (e.g., always choose "staging" for deploy targets) via HAL-O Settings.

| Impact | Effort | Priority |
|--------|--------|----------|
| MEDIUM | HARD | Long-Term |

### 1.10 Model Capabilities: Opus 4.6 + 1M Context + 128K Output

**What it is**: Claude Opus 4.6 with 1M token context window (GA on Max/Team/Enterprise), 128K max output tokens, 4 adaptive thinking levels (low/medium/high/max), context compaction for sustained sessions. 78.3% retrieval accuracy at 1M tokens (best among frontier models).

**HAL-O Integration**:
- **Context window visualization**: A 3D ring or arc showing context usage, with markers for compaction events. Users see when they're burning through context.
- **Effort level selector**: Quick-switch between effort levels in the topbar or via a 3D radial menu near the sphere.
- **Compaction history**: Track and visualize compaction events over a session. Show what triggered each compaction.

| Impact | Effort | Priority |
|--------|--------|----------|
| MEDIUM | EASY | Quick Win |

### 1.11 Subagent Improvements (2026)

**New frontmatter fields**: `effort`, `maxTurns`, `disallowedTools`, `initialPrompt`, `memory` (user/project/local scope), `mcpServers` (inline or reference), `hooks`, `background`, `isolation: worktree`, `skills`, `permissionMode`.

**Key capabilities**: Up to 10 simultaneous subagents, auto-compaction at 95% capacity, persistent memory across conversations, foreground/background execution, Ctrl+B to background a running task.

**HAL-O Integration**:
- **Agent configuration UI**: Visual editor for `.claude/agents/*.md` frontmatter. Drag-and-drop tool selection, model picker, effort slider, memory scope selector.
- **Background agent indicators**: Show running background agents as small orbiting dots around the sphere with progress indicators.
- **Agent memory dashboard**: Browse and manage agent-specific memory directories from HAL-O's UI.

| Impact | Effort | Priority |
|--------|--------|----------|
| HIGH | MEDIUM | Medium-Term |

### 1.12 Voice Mode (Native, v2.1.71+)

**What it is**: Claude Code has native voice mode via `/voice`. Push-to-talk (space by default, rebindable). 20 languages supported. WSL2/Android/Windows compatible.

**HAL-O already has**: Custom voice system (Chatterbox/Voicebox/Edge TTS), CTRL+SPACE push-to-talk, 20 voice profiles, personality sliders. HAL-O's voice system is significantly more advanced.

**HAL-O Integration**:
- **Hybrid voice routing**: Detect if Claude Code's native voice is active. If so, route audio through HAL-O's sphere visualization (audio analyzer) for visual feedback.
- **Voice profile superiority**: HAL-O's 20 cloned voices + personality system is a major differentiator. Keep this as a premium feature.

| Impact | Effort | Priority |
|--------|--------|----------|
| LOW | EASY | Low Priority |

### 1.13 Plugin System & Marketplaces

**What it is**: Plugins are installable packages (skills + agents + rules + hooks) distributed through Git-based marketplaces. Over 9,000 plugins available. Official marketplace at `anthropics/claude-plugins-official`.

**HAL-O Integration — STRATEGIC**:
- **Publish HAL-O as a Claude Code plugin**: Package HAL-O's 5 skills (/hal, /ascii, /marketing, /critic) + 4 agents (3d-visual, terminal-core, audio-voice, qa-ux) as a Claude Code plugin. Users install with `/plugin install hal-o@hal-xp/hal-o`. This makes HAL-O's intelligence available even without the desktop app.
- **Plugin browser in HAL-O**: Browse and install Claude Code plugins from HAL-O's UI. Search the official marketplace, preview plugin details, one-click install.
- **Plugin source: 'settings'**: Declare HAL-O's plugin inline in settings.json using the new `source: 'settings'` option (v2.1.80).

| Impact | Effort | Priority |
|--------|--------|----------|
| HIGH | MEDIUM | Medium-Term |

### 1.14 Additional Notable Features

| Feature | Version | HAL-O Relevance |
|---------|---------|----------------|
| `--bare` flag for scripted calls | v2.1.81 | HAL-O could use this for fast, headless queries |
| `/effort` command | v2.1.76 | Expose as HUD control |
| `/context` suggestions | v2.1.74 | Show context optimization tips in HAL-O UI |
| `/color` session colors | v2.1.75 | Map to project card colors |
| `worktree.sparsePaths` | v2.1.76 | Configure sparse checkout from HAL-O for monorepos |
| `initialPrompt` in agents | v2.1.83 | Auto-start agents with predefined prompts |
| Session naming (`-n` flag) | v2.1.76 | Display session names on terminal tabs |
| Image pasting `[Image #N]` chips | v2.1.83 | Support drag-and-drop images to terminal |
| `modelOverrides` setting | v2.1.73 | Expose in Settings for custom model routing |

---

## 2. MCP Integration Opportunities

### 2.1 MCP Apps — Interactive UI in AI Clients

**What it is**: Launched January 2026 as the first official MCP extension. Tools return interactive UI components (HTML/JS/CSS in sandboxed iframes) that render directly in the conversation. Supported by Claude, Claude Desktop, VS Code Copilot, Goose, Postman.

**Key repository**: `ext-apps` includes SDK + examples: `threejs-server` (3D visualization), `map-server`, `pdf-server`, `system-monitor-server`, `sheet-music-server`.

**HAL-O Integration — MASSIVE OPPORTUNITY**:
- **HAL-O as an MCP App host**: Render MCP App UI components inside the 3D scene as floating panels. This means any MCP server that returns interactive UI gets rendered in HAL-O's holographic space.
- **HAL-O Scene as an MCP App**: Export HAL-O's 3D scene as an MCP App that other clients can embed. Your sphere + project cards rendered inside Claude Desktop or VS Code.
- **Three.js MCP server**: The existing `threejs-server` MCP server can already generate 3D visualizations. HAL-O could host these natively in its R3F scene.

| Impact | Effort | Priority |
|--------|--------|----------|
| GAME-CHANGING | HARD | Major Feature |

### 2.2 Recommended MCP Servers for HAL-O

**Development & Testing**:
| Server | Why HAL-O Should Integrate |
|--------|--------------------------|
| **Playwright MCP** | Browser testing directly from HAL-O terminals. Already in official plugins. |
| **GitHub MCP** | PR reviews, issue management, CI/CD — render GitHub data on project cards. |
| **Sentry MCP** | Error tracking data displayed as alerts in the 3D scene. |

**Monitoring & DevOps**:
| Server | Why HAL-O Should Integrate |
|--------|--------------------------|
| **Vercel MCP** | Deployment status on project cards. Green/red deploy indicators. |
| **Docker MCP** | Container status visualization. HAL-O already has Docker testing. |
| **Kubernetes MCP** | Pod status rendered as constellation clusters in the 3D scene. |

**Data & Knowledge**:
| Server | Why HAL-O Should Integrate |
|--------|--------------------------|
| **Memory MCP** | Knowledge graph visualization — render connections between concepts in 3D. |
| **PostgreSQL MCP** | Database queries with visual result rendering. |
| **Firecrawl MCP** | Web scraping results for research tasks. |

**Productivity**:
| Server | Why HAL-O Should Integrate |
|--------|--------------------------|
| **Linear MCP** | Project management data on cards. Sprint progress in the HUD. |
| **Notion MCP** | Documentation sync. |
| **Slack MCP** | Another channel for remote control (beyond Telegram/Discord). |

### 2.3 MCP Configuration for HAL-O

HAL-O should ship with a pre-configured `.mcp.json` that includes commonly useful servers:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-github"]
    }
  }
}
```

---

## 3. Competitive Landscape

### 3.1 Direct Competitors

| Tool | Stars | Stack | Key Differentiator | HAL-O Advantage |
|------|-------|-------|-------------------|----------------|
| **Opcode** (fka Claudia) | ~21K | Tauri 2 + React + Rust | Most popular, clean chat UI | HAL-O's 3D scene, voice system, and personality are in a completely different category |
| **Claude Code Desktop** | Official | Anthropic first-party | Official support | HAL-O is the "Iron Man suit" to Desktop's "corporate laptop" |
| **CodePilot** | ~3K | Electron + Next.js | Split-pane, Telegram/Discord | HAL-O has deeper terminal integration + 3D visualization |
| **CloudCLI** | ~1K | Web-based | Remote access, mobile | HAL-O is local-first with richer experience |
| **Nimbalyst** | ~2K | Custom | Multi-session kanban, diagramming, iOS app | HAL-O's 3D scene is unique; Nimbalyst has better multi-session mgmt |
| **Claude Workbench** | ~500 | Custom | Settings GUI, MCP management | HAL-O subsumes this with its Settings panel |

### 3.2 Competitive Analysis

**Where HAL-O is Unique (nobody else has this)**:
1. **3D holographic scene** — orbiting project cards, wireframe sphere, PBR rendering, bloom/post-processing
2. **Voice personality system** — 20 cloned voices, TARS personality sliders, V9 auto-selection
3. **Audio-reactive sphere** — syllable-level tracking of TTS output
4. **Photo Mode API** — camera presets, wireframe toggle, activity simulation for marketing
5. **Sci-fi mission control aesthetic** — no other tool looks like this

**Where HAL-O Lags**:
1. **Multi-session management** — Nimbalyst's kanban board for 6+ sessions. HAL-O shows one session per terminal.
2. **Plugin browser** — Opcode and Claude Workbench have plugin management UI. HAL-O has none.
3. **Mobile access** — CloudCLI works on phones. HAL-O is desktop-only.
4. **Agent Teams visualization** — nobody has this yet. First mover advantage.

**Strategic Positioning**:
HAL-O should NOT compete with Opcode/Claude Desktop on "simple clean wrapper." That's a race to the bottom. HAL-O should double down on:
- **The spectacle** — 3D, voice, personality, the "wow factor"
- **Agent Teams visualization** — first tool to visualize multi-agent coordination in 3D
- **StatusLine/Hook integration** — real-time visual feedback from Claude Code internals
- **Plugin as distribution** — even users who don't install HAL-O desktop get HAL-O's skills/agents

### 3.3 HAL-O's Position in the Ecosystem

```
Simple CLI Wrapper ──────────────────────────────────────────── Full Visual Platform
     │                                                              │
     Opcode          Claude Desktop        CodePilot      Nimbalyst       HAL-O
     (chat UI)       (official)            (split pane)   (kanban)        (3D holographic)
```

HAL-O occupies the far right: the most visually ambitious, the most experiential. This is a strength if leveraged correctly — it's the demo that makes people stop scrolling.

---

## 4. Anthropic Developer Relations

### 4.1 Programs Available

| Program | What It Offers | Relevance to HAL-O |
|---------|---------------|-------------------|
| **Claude Partner Network** | $100M fund, training, co-marketing, joint campaigns. Certification: "Claude Certified Architect." | HIGH — if HAL-O's creator applied as a partner, co-marketing could provide visibility. But this is enterprise-focused. |
| **Community Ambassadors** | Monthly API credits, host meetups, build demos. Global initiative. | HIGH — become an ambassador and demo HAL-O at meetups. API credits fund development. |
| **Accel + Anthropic Dev Day** | Showcase for enterprise agents. Top 50 get Anthropic roadmap access. | MEDIUM — HAL-O could submit to a future showcase event. |
| **Plugin Marketplace** | Official Anthropic-curated plugin directory. | HIGH — publishing HAL-O's skills/agents as a plugin puts it in front of every Claude Code user. |

### 4.2 How to Get Featured

1. **Publish to the official plugin marketplace** (`anthropics/claude-plugins-official`). The submission process includes security review, but approved plugins get massive distribution.

2. **Contribute to `awesome-claude-code`** lists:
   - `jmanhype/awesome-claude-code` (plugins, MCP servers, integrations)
   - `hesreallyhim/awesome-claude-code` (slash commands, CLI tools)
   - Anthropic's own docs link to community projects

3. **Create content that Anthropic can share**:
   - Write a blog post: "Building a 3D Holographic Interface for Claude Code"
   - Create a demo video showing Agent Teams visualization (this is content Anthropic would want to share)
   - Post on X/Twitter tagging @AnthropicAI, @alexalbert__ (head of developer relations)

4. **Apply to the Community Ambassadors program**:
   - HAL-O demos at local meetups
   - Tutorial content: "How to build a Claude Code wrapper with Electron + Three.js"
   - Monthly API credits would fund HAL-O development

5. **Submit a channel plugin during research preview**:
   - HAL-O as a channel plugin would require Anthropic security review
   - Direct interaction with the Claude Code team

### 4.3 Visibility Strategy

**Phase 1 (Immediate)**: Publish HAL-O skills/agents as a Claude Code plugin. Add to awesome lists. Create demo video.

**Phase 2 (1 month)**: Apply to Community Ambassadors. Submit channel plugin proposal. Blog post on integration architecture.

**Phase 3 (3 months)**: Agent Teams visualization demo. Apply to Dev Day showcase. Seek partner network involvement.

---

## 5. Prioritized Integration Recommendations

### TIER 1: Quick Wins (1-2 days each, HIGH impact)

#### QW-1: StatusLine Data Feed → 3D HUD
**What**: Write a StatusLine script that outputs session data. HAL-O watches the output and renders: context % as a ring around the sphere, cost as a running counter, rate limits as gauge arcs.

**Implementation**:
1. Create `~/.claude/hal-o-statusline.sh` — reads JSON stdin, writes to `~/.claude/hal-o-status.json`
2. In `src/main/index.ts`, watch `~/.claude/hal-o-status.json` with `fs.watch()`
3. Send data to renderer via IPC: `mainWindow.webContents.send('hal:status-update', data)`
4. In `PbrHoloScene.tsx`, add a `StatusRing` component that renders context usage as a glowing arc

**Why it matters**: This is the first tool to visualize Claude Code's internal state in 3D. Perfect demo material.

**Files**: `src/main/index.ts`, `src/renderer/src/components/three/PbrHoloScene.tsx` (new `StatusRing`), new script at `~/.claude/hal-o-statusline.sh`

#### QW-2: Auto Mode Toggle in HUD
**What**: Add a permission mode selector to the topbar. One-click switch between default/acceptEdits/auto/bypass. Show current mode as a colored badge.

**Implementation**:
1. In `HudTopbar.tsx`, add a dropdown or button group for permission modes
2. On change, write to `.claude/settings.local.json` `permissionMode` field
3. Show mode indicator: green shield (auto), yellow lock (default), red warning (bypass)

**Files**: `src/renderer/src/components/HudTopbar.tsx`, `src/main/ipc-hub.ts` (new IPC to write settings)

#### QW-3: Agent Teams Environment Variable
**What**: Add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to HAL-O's settings/env when user enables "Agent Teams" in Settings. This unlocks TeammateTool and SendMessage for all HAL-O terminal sessions.

**Implementation**:
1. Add toggle in `SettingsMenu.tsx`: "Enable Agent Teams (Experimental)"
2. When enabled, write to `.claude/settings.json`: `{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }`
3. Show a "Teams Ready" badge on the sphere

**Files**: `src/renderer/src/components/SettingsMenu.tsx`, `.claude/settings.json`

#### QW-4: Effort Level Quick-Switch
**What**: Add effort level control (low/medium/high) as a radial selector near the sphere or in the topbar. Maps to `/effort` command.

**Implementation**: Inject `/effort <level>` into the active terminal when user clicks.

**Files**: `src/renderer/src/components/HudTopbar.tsx`

#### QW-5: Session Naming on Terminal Tabs
**What**: Use the `-n` / `--name` CLI flag when spawning terminal sessions. Display session names on terminal tabs instead of generic "Terminal 1".

**Implementation**: When opening a new terminal, prompt for or auto-generate a session name. Pass `claude -n "HAL-O: <project>"` when launching.

**Files**: `src/main/terminal-manager.ts`, `src/renderer/src/components/TerminalView.tsx`

---

### TIER 2: Medium Effort (3-5 days each, transforms the product)

#### ME-1: Publish HAL-O as a Claude Code Plugin
**What**: Package HAL-O's skills (/hal, /ascii, /marketing, /critic) + agents (3d-visual, terminal-core, audio-voice, qa-ux) as a standalone Claude Code plugin.

**Implementation**:
1. Create `.claude-plugin/plugin.json` manifest
2. Organize skills/agents per plugin spec
3. Create a marketplace repo: `hal-xp/hal-o-plugin`
4. Submit to official marketplace for review
5. Users install with `/plugin install hal-o@hal-xp/hal-o-plugin`

**Why it matters**: This puts HAL-O's intelligence in front of every Claude Code user, even without the desktop app. It's the fastest path to Anthropic visibility.

**Files**: New `.claude-plugin/` directory, new GitHub repo for marketplace

#### ME-2: Hook-Driven Sphere Reactions
**What**: Wire Claude Code's 25 lifecycle hooks into the 3D sphere for real-time visual feedback.

**Implementation**:
1. In `.claude/settings.json`, add hooks that write events to a temp file
2. Main process watches the file, sends events to renderer via IPC
3. `PbrHalSphere` maps events to visual effects:
   - `SubagentStart` → satellite particle spawns
   - `TaskCompleted` → completion pulse
   - `StopFailure` → red flash
   - `PreCompact` → sphere compression
   - `FileChanged` → ripple on affected card

**Files**: `.claude/settings.json`, `src/main/index.ts`, `src/renderer/src/components/three/PbrHoloScene.tsx`

#### ME-3: Agent Teams 3D Visualization (Phase 1)
**What**: Read team config from `~/.claude/teams/*/config.json` and task list from `~/.claude/tasks/*/`. Render teammates as satellite orbs around the sphere. Show task status as color-coded indicators.

**Implementation**:
1. Main process polls `~/.claude/teams/` directory for active teams
2. Send team data to renderer via IPC
3. New `TeamVisualization` component in PbrHoloScene:
   - Lead = center sphere (larger)
   - Teammates = smaller orbiting spheres with labels
   - Tasks = floating status cards
   - Messages between teammates = animated particle trails

**Files**: New `src/renderer/src/components/three/TeamVisualization.tsx`, `src/main/ipc-hub.ts`

#### ME-4: Plugin Browser UI
**What**: Browse and install Claude Code plugins from HAL-O's Settings panel.

**Implementation**:
1. Use `gh` or HTTP to fetch plugin list from official marketplace
2. Render as a grid in Settings > Plugins
3. One-click install: run `/plugin install <name>` in active terminal
4. Show installed plugins with enabled/disabled toggles

**Files**: `src/renderer/src/components/SettingsMenu.tsx` (new Plugins tab), `src/main/ipc-hub.ts`

#### ME-5: Memory Viewer & Health Dashboard
**What**: Browse auto-memory files for each project. Show memory health (line count, freshness) on project cards.

**Implementation**:
1. Read `~/.claude/projects/*/memory/MEMORY.md` for all projects
2. Show line count / file count on project cards as a small indicator
3. Click card → memory detail panel with file tree and editor
4. Warn when MEMORY.md exceeds 200 lines

**Files**: `src/main/ipc-hub.ts`, `src/renderer/src/components/three/ScreenPanel.tsx`

---

### TIER 3: Major Features (1-2 weeks each, game-changing)

#### MF-1: HAL-O as a Claude Code Channel Plugin
**What**: Build HAL-O itself as an MCP-based channel plugin. Instead of wrapping xterm.js terminals, HAL-O receives Claude's output as structured channel events and renders them natively in the 3D scene. Permission prompts become 3D dialog boxes. Tool results become visual data.

**Architecture**:
1. HAL-O's main process runs an MCP server (using `@modelcontextprotocol/sdk`)
2. Declares `claude/channel` + `claude/channel/permission` capabilities
3. Claude Code spawns it with `--channels server:hal-o`
4. Events arrive as `notifications/claude/channel` → rendered in 3D
5. HAL-O exposes tools: `reply` (send user input), `display_3d` (show data in scene)

**Why it matters**: This transforms HAL-O from "terminal wrapper" to "native Claude Code visual interface." It's architecturally clean and follows Anthropic's official extension model.

**Effort**: ~2 weeks. Requires new MCP server in `src/main/`, new event routing system, refactoring terminal integration.

#### MF-2: Agent Teams Full Visualization
**What**: Complete 3D visualization of Agent Teams with live task boards, teammate communication trails, and interactive controls.

**Phase 1** (covered in ME-3): Static visualization from config files
**Phase 2**: Live updates via `TeammateIdle` and `TaskCompleted` hooks
**Phase 3**: Interactive controls — click teammate to open their terminal, click task to assign/reassign, drag to create dependencies
**Phase 4**: "Deploy Team" wizard — describe a task, HAL-O generates team config and spawns it

**Why it matters**: NOBODY else visualizes Agent Teams. This is HAL-O's "Jarvis moment" — multiple AI agents working in parallel, visible as satellites around the command sphere, with live data streams.

#### MF-3: MCP App Hosting in 3D Scene
**What**: Render MCP App UI components (interactive HTML/JS) as floating panels in the 3D scene. Any MCP server that returns UI gets rendered in HAL-O's holographic space.

**Implementation**:
1. Intercept MCP tool results containing UI resources
2. Render in sandboxed `<Html>` (drei) elements positioned in 3D space
3. User interaction forwarded back to MCP server

**Why it matters**: MCP Apps are the next frontier. Being the first desktop app to host them in a 3D environment is a major differentiator.

#### MF-4: Custom HAL-O Channel (Beyond Telegram)
**What**: Build a HAL-O-specific channel that runs as a local MCP server. Features: webhook receiver for CI/CD alerts, Slack bridge, GitHub event stream. All events rendered in the 3D scene as floating alerts.

**Implementation**: Follow the channel reference pattern — MCP server with `claude/channel` capability, HTTP listener for webhooks, and `notifications/claude/channel` events pushed to Claude Code.

---

## Implementation Priority Matrix

```
                    LOW EFFORT ──────────────────────── HIGH EFFORT
                    │                                      │
    HIGH IMPACT ─── │  QW-1 StatusLine 3D           ME-1 Plugin    │
                    │  QW-2 Auto Mode Toggle        ME-2 Hook FX   │
                    │  QW-3 Agent Teams Env         ME-3 Teams V1  │
                    │  QW-4 Effort Quick-Switch     MF-1 Channel   │
                    │  QW-5 Session Names           MF-2 Teams V2  │
                    │                               MF-3 MCP Apps  │
                    │                                              │
    MEDIUM IMPACT ──│  QW-4                         ME-4 Plugins   │
                    │                               ME-5 Memory    │
                    │                                              │
    LOW IMPACT ──── │  Voice routing                MF-4 Webhook   │
                    │                                              │
```

### Recommended Execution Order

**Week 1**: QW-1 through QW-5 (all quick wins)
**Week 2**: ME-1 (Plugin — strategic visibility)
**Week 3**: ME-2 + ME-3 (Hook effects + Teams Phase 1)
**Week 4**: ME-4 + ME-5 (Plugin browser + Memory viewer)
**Month 2**: MF-1 (Channel plugin architecture)
**Month 3**: MF-2 (Agent Teams full visualization)

---

## Key Technical Notes

### Configuration Changes for HAL-O

Add to `.claude/settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "statusLine": {
    "type": "command",
    "command": "~/.claude/hal-o-statusline.sh"
  }
}
```

### IPC Bridge for Status Data

New IPC channel needed in `src/main/index.ts`:
```typescript
// Watch statusline output file
const statusPath = path.join(os.homedir(), '.claude', 'hal-o-status.json');
fs.watchFile(statusPath, { interval: 1000 }, () => {
  const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
  mainWindow?.webContents.send('hal:status-update', data);
});
```

### Hook Event File Format

For hook-driven effects, use a shared temp file:
```json
{
  "event": "SubagentStart",
  "timestamp": 1711382400,
  "data": { "agent_id": "abc123", "agent_type": "code-reviewer" }
}
```

Watch in main process, dispatch to renderer.

---

## Sources

### Claude Code Documentation
- [Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Channels Reference](https://code.claude.com/docs/en/channels-reference)
- [StatusLine](https://code.claude.com/docs/en/statusline)
- [Memory](https://code.claude.com/docs/en/memory)
- [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- [Changelog](https://code.claude.com/docs/en/changelog)
- [MCP](https://code.claude.com/docs/en/mcp)
- [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

### Claude Code Features & Analysis
- [Claude Code Auto Mode Guide](https://claudefa.st/blog/guide/development/auto-mode)
- [Claude Code Agent Teams Guide](https://claudefa.st/blog/guide/agents/agent-teams)
- [Claude Code March 2026 Updates](https://pasqualepillitteri.it/en/news/381/claude-code-march-2026-updates)
- [Claude Code Channels — VentureBeat](https://venturebeat.com/orchestration/anthropic-just-shipped-an-openclaw-killer-called-claude-code-channels)
- [Claude Code Extensions Explained — Medium](https://muneebsa.medium.com/claude-code-extensions-explained-skills-mcp-hooks-subagents-agent-teams-plugins-9294907e84ff)
- [17 Claude Code Releases in 30 Days — DEV](https://dev.to/ji_ai/17-claude-code-releases-in-30-days-everything-that-changed-1ec8)
- [Claude Code Release Notes — Releasebot](https://releasebot.io/updates/anthropic/claude-code)

### Model & Context
- [Claude Opus 4.6 Introduction — Anthropic](https://www.anthropic.com/news/claude-opus-4-6)
- [Opus 4.6 Context Compaction — InfoQ](https://www.infoq.com/news/2026/03/opus-4-6-context-compaction/)
- [Opus 4.6 1M Context Guide](https://karangoyal.cc/blog/claude-opus-4-6-1m-context-window-guide)

### MCP Ecosystem
- [MCP Apps Blog Post](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [MCP Apps Overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [Hello3DMCP — Three.js Forum](https://discourse.threejs.org/t/hello3dmcp-ai-driven-3d-interactive-app/89133)
- [50+ Best MCP Servers](https://claudefa.st/blog/tools/mcp-extensions/best-addons)
- [Awesome MCP Servers](https://mcpservers.org/)

### Competitive Landscape
- [Best Claude Code GUI Tools 2026 — Nimbalyst](https://nimbalyst.com/blog/best-claude-code-gui-tools-2026/)
- [Opcode](https://opcode.sh/)
- [CodePilot — GitHub](https://github.com/op7418/CodePilot)
- [CloudCLI — GitHub](https://github.com/siteboon/claudecodeui)
- [Claude Workbench — GitHub](https://github.com/Norman-else/claude-workbench)

### Anthropic Developer Programs
- [Claude Partner Network — $100M](https://www.anthropic.com/news/claude-partner-network)
- [Development Partner Program](https://support.claude.com/en/articles/11174108-about-the-development-partner-program)
- [Community Ambassadors Program](https://www.globalsouthopportunities.com/2026/03/08/claude/)
- [Accel + Anthropic Dev Day Showcase](https://accel-anthropic-ai-dev-day.devpost.com/)
- [Plugins for Claude Code — Anthropic](https://claude.com/plugins)
- [Official Plugin Repository](https://github.com/anthropics/claude-plugins-official)
