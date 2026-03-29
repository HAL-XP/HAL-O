# HAL-O Backlog

## Simplification (Session 10)
One app = one dispatcher = one TG bot. Multi-workspace = multiple app instances (clones).
Projects are a flat list (opt-in). ManageProjects page removed (retrievable from git).
Layouts use pagination (cardsPerSector setting) — rings/layouts have max N cards.

### DONE (Session 10)
- Terminal session restore consolidation ✓
- HudTopbar deduplication (4→1) ✓
- Bearer token auth on HTTP API ✓
- Rate limiting (60 req/min) ✓
- Feature flags system (7 flags) ✓
- Multi-agent debate/brainstorm backend (provider-clients + presets + orchestrator) ✓
- Instance system for clones ✓
- Claudette clone (French PA, TG bot, Edge TTS Vivienne) ✓
- Pagination bar redesign (bold, always-visible) ✓
- Response-capture rewrite (@xterm/headless) ✓
- Restart orchestrator (externalize → relaunch) ✓
- Auto-absorb external sessions on app boot ✓
- 3D Amethyst theme ✓
- TG token conflict fix (per-instance .env write) ✓
- HAL 9000 easter egg audio ✓
- HTML reports hub endpoint ✓
- Tailscale installed ✓

### DONE: Install Wizard Phase 1 (Session 10b)
- 5-step wizard: intro → persona → AI provider → voice → projects → ready ✓
- Quick Setup bypass for experts ✓
- "Change later in Settings" on every step ✓
- No Telegram in wizard, no unexplained agents ✓
- QA reviewed + approved ✓

### Wizard Phase 2 (Next)
- "I'm not sure" / "Help me decide" button on every step
- Help/documentation links per option
- Pre-recorded welcome voice lines (small ogg, bundled in app)
- Personality sliders in wizard (humor/formality/verbosity/dramatic)
- Don't auto-pick tech stack — offer 2-3 options with pros/cons
- Ask clarifying questions before suggesting frameworks
- NSIS installer for Windows (bundles Node.js + pre-built node-pty)
- OAuth port conflict resolution (each MCP needs unique port)

### UX Persona Fixes (from playtest — P0)
- Add pricing/cost transparency to wizard Step 2 (Maya blocked)
- Add voice profile audio samples to Step 3 (users pick blind)
- i18n infrastructure + French wizard (Pierre blocked entirely)
- Expand Step 1 to 5 personas: Developer Brain, Personal Assistant, Work Hub, Creator, AI Research
- Add glossary/tooltip for jargon (API key, Ollama, Anthropic)
- Step 4: non-coder path (skip projects, show assistant features instead)

### DevGate Process (Named!)
- Development methodology formalized as "DevGate"
- Challenge → Brainstorm → Brief → Test → Playtest → Meta-check
- Applied to every feature, enforced via hooks + agent constitution

### Adaptive Tips Engine
- Progressive disclosure: track used-features in JSON
- Only show tips for undiscovered features
- Skip basics after 40h of use
- Personality-matched delivery (matches butler/casual/formal)
- "Don't show tips" toggle
- Pre-cooked status messages on timer (no LLM cost)

### Dockview Pane System (Design Ready)
- Everything = a pane (3D scene, terminals, debate chat, stats, settings)
- VS Code-style docking, drag, split
- Design doc: _design/DOCKVIEW_PANE_SYSTEM.md (5 sprints, ~34h)

### 3D Debate Visualization (Design Ready)
- Glowing orbs inside ring platform, color-coded agents
- Text-first speech bubbles, optional pipelined TTS audio
- Sphere styles = user customization (debate presets → Settings)
- Design doc: _design/DEBATE_3D_VISUALIZATION.md (~15h)

### Anthropic Gap Tracker
- Document our workarounds as feature requests (session persistence, token isolation, voice enforcement, process safety)
- Watcher checks every 6h: did Anthropic ship something that makes our hack unnecessary?
- When they don't address a gap → write proposal with real use case
- Track patents/white papers for competitive intelligence

### Per-Project Config
- project.config.json next to CLAUDE.md: mood, model preference, DevGate rules, context
- Wizard sets initial config on project create/import
- Chief of Staff reads config before task selection

### Systemic Reliability (Next)
- Idle ticker daemon (Python, external, survives session switches)
- Scheduled Anthropic watcher (daily, HTML diff report to TG)
- Fix tts-stream-tg.sh TG API call (0 chunks sent issue)
- PostToolUse hook to enforce voice replies in AFK mode

### Future: Identity Unification
- HAL in Halo Chat routes to terminal session (same brain everywhere)
- Telegram + Halo Chat + Terminal = same session
- Fallback to API-based HAL when app not running

### Future: Agent-to-Agent Communication
- Message bus via HTTP API between separate HAL-O instances
- User can observe agent conversations

## DONE (Session 9)
- HTTP Control API (localhost:19400) — 10+ endpoints
- WebSocket real-time streaming
- PWA served from API (mobile browser access)
- Alias system (aliases.json: bob→work-assistant, karen→personal-assistant, hal→hal-o)
- Voice per agent (butler/soft)
- Direct Anthropic API backend for agents (no terminal parsing)
- Streaming responses via WebSocket
- Per-agent conversation memory (separate histories)
- Tabbed UI (ALL / HAL / BOB / KAREN)
- Markdown stripping + conversational mode
- Smart resume (--continue if prior conversation exists)
- localStorage chat history persistence
- Node.js proxy (port 19401) to bypass Electron firewall block
- Dispatcher default fallback prefers HAL-O terminal
- Security audit completed (13 findings documented)

## Priority: Security Hardening (Before Tailscale)
- Command injection fix: use array args in terminal spawn, not shell strings
- Add Bearer token auth to HTTP API
- Rate limiting on terminal/open endpoint
- Path traversal validation
- Input size limits (max 1MB body)
- Environment variable whitelisting for subprocesses
- Audit logging

## Agent Names (Deferred)
- Bob/Karen moved to separate HAL-O clones (work-assistant, personal-assistant)
- Rename happens per-clone when they're set up

## Private Social Network UX
- Each agent = a "friend" you can DM (separate threads)
- Group chat where agents talk to each other
- User can observe agent-to-agent discussions in real-time
- Sidebar with agent avatars, DM threads, group rooms
- Agent-to-agent messaging (one agent's output → another's input)

## Mobile 3D Layout
- Top 1/3: HAL sphere with 3D lighting + voice reactions
- Bottom 2/3: Project list, chat, terminal management
- Specific mobile-optimized graphics and layout
- Portrait-mode optimized

## Mic Button Fix (PWA)
- Hold-to-record not working on phone — needs debugging
- Move to Telegram-like bottom-right position (done in layout)
- Test with actual phone mic permissions

## Audio Streaming (PWA)
- Stream TTS chunks as they generate (3-5s per chunk)
- User hears response starting immediately instead of waiting 30s
- WebSocket audio binary frames or chunked audio URLs

## LAN vs Tailscale Auto-Detection
- PWA tries local IP first (fast, no tunnel)
- Falls back to Tailscale if unreachable
- Seamless switching based on network

## Mistral Local Voice AI (Phone-Side)
- Run lightweight model on phone for transcription + dispatch
- Local receptionist: routes to right agent before hitting PC
- Instant feedback, no round-trip for routing

## Native Mobile App
- React Native or PWA-based
- Specific mobile layout with 3D sphere
- Offline capabilities with local model
- 3G/cellular connectivity support

## Inter-Agent Communication
- Message bus via HTTP API: POST /message to inbox, GET /messages to poll
- Agents post tasks/results to each other
- Async, clean, each agent stays independent

## Low Priority: Trademark Registration (INPI France)
- Register "HAL-OS" and "HAL-O" as trademarks with INPI (Institut National de la Propriété Industrielle)
- Cost: ~€190 online per class
- Timeline: 3-6 months
- Link: https://www.inpi.fr/proteger-vos-creations/les-marques
- Not urgent but smart to do before public alpha launch

## Google API Integration (Research Done)
- Phase 1: Community MCP server (google_workspace_mcp or google-calendar-mcp) — 30-45 min
- Phase 2: Custom Python MCP server wrapping official APIs — 10-14 hours
- APIs: Calendar, Gmail, Tasks (replacing Google Keep)
- Token storage: OS keyring (NOT plain JSON)
- Pin community server to specific commit hash, audit first
