# HAL-O Backlog

## Simplification (Session 10)
One app = one dispatcher = one TG bot. Multi-workspace = multiple app instances (clones).
Projects are a flat list (opt-in). ManageProjects page removed (retrievable from git).
Layouts use pagination (cardsPerSector setting) — rings/layouts have max N cards.

### Fix: Terminal Session Restore Consolidation
- Two systems fighting: pending-sessions restore (old) + session-lifecycle auto-start (new)
- Closing a terminal then quitting app → terminal reopens on next launch (stale pending-sessions.json)
- Fix: session-lifecycle should be the ONLY system. Remove pending-sessions auto-restore for HAL-O.

### Cleanup: HudTopbar Deduplication
- HudTopbar is rendered 4 times (once per renderer mode) — should be rendered once above the renderer switch
- Refactor: extract topbar to render outside the renderer conditional

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

## Google API Integration (Research Done)
- Phase 1: Community MCP server (google_workspace_mcp or google-calendar-mcp) — 30-45 min
- Phase 2: Custom Python MCP server wrapping official APIs — 10-14 hours
- APIs: Calendar, Gmail, Tasks (replacing Google Keep)
- Token storage: OS keyring (NOT plain JSON)
- Pin community server to specific commit hash, audit first
