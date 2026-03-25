# Telegram Dispatcher — Multi-Project Routing via Single Bot

HAL-O owns one Telegram bot. Today, that bot is wired to ONE Claude Code session (the HAL-O terminal). This design makes HAL-O the central dispatcher: every Telegram message (text or voice) arrives at HAL-O, gets analyzed, and is routed to the correct project's terminal session. Responses are captured and relayed back through the same bot. Zero extra bots, zero extra tokens for the user to manage.

---

## 1. The Problem

Current state:
- HAL-O spawns Claude Code sessions with `--channels plugin:telegram@claude-plugins-official`
- Every session gets the Telegram plugin, but only one can actually own the bot connection (the first one to claim the token wins)
- If the user sends "fix the auth bug in butler" from Telegram, it hits the HAL-O session -- which has no context about butler's codebase
- The user's only option: manually switch to the right terminal, paste their request, wait, copy the response, and send it back on Telegram
- This defeats the entire point of a voice/Telegram-first workflow

What we want:
- User sends ANY message on Telegram
- HAL-O figures out which project it's about
- Routes it to the right terminal session (or spawns one)
- Captures the response
- Relays it back to Telegram -- seamlessly, as if the target session had its own bot

---

## 2. Architecture Overview

```
                    TELEGRAM
                       │
                       ▼
        ┌──────────────────────────────┐
        │  HAL-O Main Process          │
        │  (the ONLY TG bot owner)     │
        │                              │
        │  src/main/tg-dispatcher.ts   │
        │  ┌────────────────────────┐  │
        │  │  1. Receive TG msg     │  │
        │  │  2. Transcribe (voice) │  │
        │  │  3. Detect project     │  │
        │  │  4. Route to PTY       │  │
        │  │  5. Capture response   │  │
        │  │  6. Relay to TG        │  │
        │  └──────────┬─────────────┘  │
        │             │                │
        │     ┌───────┼────────┐       │
        │     ▼       ▼        ▼       │
        │  ┌─────┐ ┌──────┐ ┌─────┐   │
        │  │hal-o│ │butler│ │myapp│   │
        │  │ PTY │ │ PTY  │ │ PTY │   │
        │  └─────┘ └──────┘ └─────┘   │
        │                              │
        │  terminal-manager.ts         │
        └──────────────────────────────┘
```

### Key Architectural Decisions

1. **HAL-O is the sole Telegram consumer.** No other terminal session gets `--channels plugin:telegram`. HAL-O's Claude Code instance owns the bot token exclusively.

2. **The dispatcher lives in the main process.** Not in the renderer, not in the HAL-O Claude session itself. The Electron main process intercepts, routes, and relays. This keeps the dispatcher alive even if the HAL-O terminal crashes or compacts.

3. **Sub-sessions are headless PTY targets.** They don't know about Telegram. They receive text input via `pty.write()` and produce text output via `pty.onData()`. The dispatcher bridges the gap.

4. **HAL-O Claude handles self-referencing messages.** If the dispatcher determines the message is about HAL-O itself (or is ambiguous), it passes through to the HAL-O session normally -- the existing Telegram plugin flow is preserved.

---

## 3. Project Detection — Three Tiers

### Tier 1: Explicit Prefix (< 1ms)

The user names the target directly. Stripped before forwarding.

| Pattern | Example | Routed To |
|---------|---------|-----------|
| `@project ...` | `@butler add a grocery list` | butler terminal |
| `project: ...` | `butler: check my reminders` | butler terminal |
| `/project ...` | `/myapp fix the login` | myapp terminal |
| `ask project ...` | `ask hal-o what's your status` | hal-o terminal |

**Matching logic:**
```typescript
const PREFIX_RE = /^(?:@|\/|ask\s+)?([\w-]+)[:\s]\s*/i
// Match against: project names, directory basenames, aliases
```

The prefix is matched against the **project registry** (see section 4). Both the full project name and short aliases match. Case-insensitive.

### Tier 2: Keyword + CWD Heuristic (< 10ms)

When no explicit prefix is found, the dispatcher scores the message against each open terminal session.

**Signals scored:**
| Signal | Weight | Example |
|--------|--------|---------|
| Project name appears in text | +3.0 | "the hal-o sphere is broken" |
| Directory basename in text | +2.5 | "check the butler repo" |
| File path mention matches a CWD | +2.0 | "src/auth/login.ts" → matches myapp if its CWD contains that file |
| Recent conversation context | +1.5 | User's last 3 TG messages were about butler → sticky |
| Keyword overlap with project CLAUDE.md | +1.0 | "training pipeline" matches ML project's keywords |
| Technology stack match | +0.5 | "React component" → matches projects with React |

**Decision thresholds:**
- Top score >= 3.0 AND gap to second place >= 1.5 → route confidently
- Top score >= 2.0 but gap < 1.5 → route with confirmation badge: `[Routing to butler — say "no, X" to redirect]`
- Top score < 2.0 → fall through to Tier 3

### Tier 3: Ask (via Telegram inline keyboard)

When detection is ambiguous, the dispatcher sends an inline keyboard:

```
Which project is this about?

[ hal-o ]  [ butler ]  [ myapp ]  [ HAL (general) ]
```

The user taps a button. The dispatcher routes the original message to that target. The choice is cached as a context hint for the next message (session stickiness).

### Context Stickiness

The dispatcher maintains a short-term memory of recent routing decisions per Telegram chat:

```typescript
interface TgRoutingContext {
  chatId: string
  lastProjectId: string       // most recent routing target
  lastRouteTime: number       // when
  recentProjects: string[]    // last 5 targets (for recency weighting)
  stickyUntil: number         // stay routed here until this timestamp
}
```

**Rules:**
- After routing to project X, the next ambiguous message defaults to X (30-minute sticky window)
- Explicit prefix always overrides stickiness
- `@hal` or `/hal` resets to HAL-O
- `/switch butler` sets sticky to butler until next explicit switch
- Saying "thanks" / "done" / "that's all" clears stickiness

---

## 4. Project Registry

The dispatcher needs a map of open projects and their metadata. This already exists in `terminal-manager.ts` via `getActiveSessions()` which returns `{ id, projectName, projectPath }`.

**Extended registry** (new: `src/main/tg-dispatcher.ts`):

```typescript
interface ProjectTarget {
  sessionId: string            // PTY session ID
  projectName: string          // display name ("butler", "hal-o")
  projectPath: string          // CWD ("/d/GitHub/butler")
  aliases: string[]            // short names ["butler", "b"]
  keywords: string[]           // from CLAUDE.md or project config
  isRunning: boolean           // PTY alive?
  lastActivity: number         // last PTY output timestamp
}
```

**Population:**
1. On terminal spawn: add entry from `terminalManager.spawn()` callback
2. On terminal exit: mark `isRunning = false` (keep for 10 minutes for "reopen" commands)
3. Keywords: extracted from `{projectPath}/.claude/CLAUDE.md` first 500 chars at spawn time (cheap, one-time read)
4. Aliases: auto-generated from project name (lowercase, hyphen-split first word) + user-configurable in settings

---

## 5. Message Injection — PTY Write Protocol

Once the dispatcher picks a target, it needs to inject the user's message into that terminal's Claude Code session as if the user typed it.

### The Simple Path: Raw PTY Write

```typescript
// In tg-dispatcher.ts
function injectMessage(sessionId: string, text: string): void {
  // Prefix with [tg] so the session's Claude can identify the source
  const payload = `[tg] ${text}\r`
  terminalManager.write(sessionId, payload)
}
```

This works because Claude Code sessions accept text input from stdin. The `[tg]` prefix tells the session that this came from Telegram (analogous to the existing `[voice]` prefix used for mic input).

### Problem: Session Might Be Busy

If the target Claude session is mid-response (streaming output), injecting text would corrupt the interaction. Solutions:

**Option A: Queue + Wait (RECOMMENDED)**
```typescript
interface InjectionQueue {
  sessionId: string
  messages: Array<{
    text: string
    chatId: string
    messageId: string
    timestamp: number
  }>
  state: 'idle' | 'busy' | 'waiting-for-response'
}
```

The dispatcher monitors PTY output for idle indicators:
- Claude Code prompt character (e.g., `>` or `$` at start of line after a blank line)
- The statusline pattern that indicates Claude is waiting for input
- A 3-second silence after output (no new data from PTY)

When the session is detected as idle, the queued message is injected. If the queue has been waiting > 60 seconds, send a Telegram status update: `[butler is busy — your message is queued (position 1)]`

**Option B: Interrupt**
Not recommended for default behavior. Claude Code doesn't handle mid-stream interruption gracefully. Could be offered as a `/force` command for urgent cases.

### Busy Detection Heuristic

```typescript
const IDLE_PATTERNS = [
  /\n>\s*$/,                           // Claude Code prompt
  /\$ $/,                             // Shell prompt
  /waiting for input/i,               // Statusline text
]

const BUSY_INDICATORS = [
  /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,         // Spinner characters
  /\.\.\.\s*$/,                       // Trailing dots (thinking)
  /Generating|Searching|Reading/i,    // Claude Code status messages
]
```

The dispatcher subscribes to PTY output for each session and maintains a state machine:

```
        ┌──────────┐
        │          │
  ──────►   IDLE   ├──── inject message ──── ►  WAITING_RESPONSE
        │          │                              │
        └──────────┘                              │
             ▲                                    │
             │                                    ▼
             │                            ┌───────────────┐
             │                            │               │
             └──── idle detected ◄────────│    BUSY       │
                                          │               │
                                          └───────────────┘
```

---

## 6. Response Capture

The hardest part: knowing when the target session has finished responding, collecting that response, and sending it back to Telegram.

### Approach: PTY Output Windowing

When a message is injected into a session, the dispatcher starts capturing all PTY output from that session until it detects the response is complete.

```typescript
interface ResponseCapture {
  sessionId: string
  chatId: string              // TG chat to reply to
  messageId: string           // TG message to quote-reply
  outputBuffer: string        // accumulated PTY output
  startTime: number
  lastOutputTime: number      // timestamp of last PTY data
  state: 'capturing' | 'complete' | 'timeout'
}
```

**Completion detection:**
1. **Silence timeout**: 5 seconds with no new PTY output → response complete
2. **Prompt detection**: idle pattern appears in output → response complete
3. **Hard timeout**: 120 seconds → force-complete, send what we have + "[response truncated]"
4. **Abort signal**: user sends new TG message → complete current capture, send partial

**Output cleaning:**
The raw PTY output contains ANSI escape codes, spinner animations, progress bars, and tool-use noise. Before relaying to Telegram:

```typescript
function cleanPtyOutput(raw: string): string {
  let text = raw
  // Strip ANSI escape sequences
  text = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  text = text.replace(/\x1b\][^\x07]*\x07/g, '')
  // Remove spinner frames
  text = text.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/g, '')
  // Remove progress bars
  text = text.replace(/\[█▓░ ]+\]\s*\d+%/g, '')
  // Collapse blank lines
  text = text.replace(/\n{3,}/g, '\n\n')
  // Remove the injected prompt echo
  text = text.replace(/^\[tg\].*\n/m, '')
  // Trim Claude Code chrome (tool headers, etc.)
  text = text.replace(/^(Read|Edit|Write|Bash|Grep|Glob).*\n/gm, '')
  return text.trim()
}
```

### Output Size Limits

Telegram messages max at 4096 characters. For longer responses:
1. If cleaned output <= 4096 chars → send as single message
2. If 4096 < output <= 12000 chars → split into 2-3 messages (split at paragraph boundaries)
3. If output > 12000 chars → send summary + save full output to a temp file, send file as attachment

---

## 7. Relay Back to Telegram

The dispatcher must send the response back to Telegram. Two approaches:

### Option A: HAL-O Claude Relays (Current Architecture)

The HAL-O Claude session owns the Telegram plugin. The dispatcher could inject a meta-command into the HAL-O session telling it to relay:

```
[relay-to-tg chat=123456 reply_to=789] The auth bug was in the JWT validation...
```

HAL-O Claude would parse this prefix and use its `reply` tool to send the message on Telegram.

**Pros:** Uses existing Telegram plugin infrastructure. HAL-O can add personality/formatting.
**Cons:** Depends on HAL-O Claude being responsive. Adds latency. HAL-O's context gets polluted with relay traffic.

### Option B: Direct Bot API from Main Process (RECOMMENDED)

The Electron main process calls the Telegram Bot API directly via HTTP, bypassing Claude entirely for the relay step.

```typescript
// src/main/tg-bot.ts
import https from 'https'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

async function sendTelegramMessage(chatId: string, text: string, replyTo?: string): Promise<void> {
  const body = {
    chat_id: chatId,
    text,
    reply_to_message_id: replyTo ? parseInt(replyTo) : undefined,
    parse_mode: 'Markdown',
  }
  // POST to https://api.telegram.org/bot{token}/sendMessage
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())
}

async function sendTelegramVoice(chatId: string, oggPath: string, replyTo?: string): Promise<void> {
  // Multipart form upload to /sendVoice
  // ...
}
```

**Pros:** Zero latency. No Claude involvement. Works even if HAL-O session is busy/crashed. Can send files, voice notes, inline keyboards.
**Cons:** Requires implementing a subset of the Bot API client. Must not conflict with the Claude Telegram plugin's polling (see section 8).

### Recommendation: Option B for sub-session relays, Option A for HAL-O's own responses

Messages routed to HAL-O itself continue to use the existing Telegram plugin flow (Claude replies naturally). Messages routed to sub-sessions use the direct Bot API relay.

---

## 8. Telegram Plugin Coexistence

Critical issue: the Claude Telegram plugin polls the Bot API for updates using long-polling (`getUpdates`). If the dispatcher ALSO polls, they'll steal messages from each other.

### Solution: Plugin Receives, Dispatcher Intercepts

```
Telegram Bot API
       │
       ▼  (getUpdates long-poll)
  Claude TG Plugin (in HAL-O session)
       │
       ▼  (message arrives in HAL-O Claude context)
  HAL-O Claude sees: "fix the auth bug in butler"
       │
       ▼  (HAL-O Claude uses a new tool: route_to_project)
  Dispatches to butler PTY
```

Wait -- this means HAL-O Claude IS the dispatcher, not the main process. Let's reconsider.

### Revised Architecture: HAL-O Claude as Intelligent Dispatcher

The Telegram plugin stays exactly as-is. HAL-O Claude receives every Telegram message. But instead of trying to handle all messages itself, it gains a new capability:

**New IPC tool: `dispatch-to-project`**

```typescript
// Exposed to renderer, which HAL-O Claude can invoke via tool use
ipcMain.handle('dispatch-to-project', async (_e, {
  projectName,    // target project
  message,        // text to inject
  chatId,         // for relay
  messageId,      // for quote-reply
  expectResponse, // true = capture and relay back
}: DispatchRequest) => {
  // 1. Find matching session
  // 2. Inject message
  // 3. If expectResponse, start capture
  // 4. Return capture handle
})
```

HAL-O Claude's system prompt instructs it:
> When you receive a Telegram message that is clearly about a specific project (not HAL-O itself), use the `dispatch-to-project` tool to route it. You are the dispatcher -- analyze the message, pick the target, and route. If the target session isn't open, tell the user to open it first (or auto-spawn it). After dispatching, relay the response back to Telegram.

This is elegant because:
- No separate polling — the existing plugin handles all Telegram I/O
- HAL-O Claude has full LLM intelligence for routing (no regex needed for Tier 1/2)
- HAL-O Claude can add context: "I'm forwarding this to your butler project..."
- HAL-O Claude can handle ambiguity conversationally: "Did you mean butler or the hal-o butler module?"
- The main process still handles the mechanical parts (PTY injection, output capture, relay)

### The Hybrid: Claude Brain + Main Process Muscle

```
┌─────────────────────────────────────────────────┐
│                  HAL-O Claude                     │
│         (Telegram plugin, full LLM brain)         │
│                                                   │
│  Receives TG msg → Analyzes → Decides target      │
│                         │                         │
│            ┌────────────┴────────────┐            │
│            ▼                         ▼            │
│     Self-handle               dispatch-to-project │
│  (msg is about HAL-O)         (msg is about X)    │
│     Normal reply                    │             │
│                                     │             │
└─────────────────────────────────────┼─────────────┘
                                      │ IPC
                              ┌───────▼───────┐
                              │ Main Process   │
                              │ tg-dispatcher  │
                              │                │
                              │ 1. Find PTY    │
                              │ 2. Wait idle   │
                              │ 3. Inject msg  │
                              │ 4. Capture out │
                              │ 5. Return text │
                              └───────┬───────┘
                                      │
                              ┌───────▼───────┐
                              │ HAL-O Claude   │
                              │ (receives      │
                              │  captured text) │
                              │                │
                              │ Formats +      │
                              │ relays via TG  │
                              │ reply tool     │
                              └───────────────┘
```

---

## 9. Full Message Flow — Step by Step

### Happy Path: Explicit prefix, target session idle

```
1. User sends TG voice: "ask butler to add milk to my grocery list"
2. TG plugin delivers message to HAL-O Claude
3. HAL-O transcribes voice (faster-whisper): "ask butler to add milk to my grocery list"
4. HAL-O detects prefix "ask butler" → target = butler
5. HAL-O calls dispatch-to-project:
   {
     projectName: "butler",
     message: "add milk to my grocery list",
     chatId: "123456",
     messageId: "789",
     expectResponse: true
   }
6. Main process finds butler PTY session (id = "D__GitHub_butler")
7. Checks state → idle (prompt visible)
8. Writes: "[tg] add milk to my grocery list\r"
9. Starts output capture on butler PTY
10. Butler Claude processes the request, outputs:
    "Added 'milk' to your grocery list. You now have 7 items."
11. 5s silence → capture complete
12. Main process cleans output, returns to renderer
13. HAL-O Claude receives: "Added 'milk' to your grocery list. You now have 7 items."
14. HAL-O replies on TG: "[butler] Added 'milk' to your grocery list. You now have 7 items."
15. Done. ~8-15 seconds end-to-end.
```

### Busy Path: Target session is mid-task

```
1. User sends TG: "butler, how many items on my list?"
2. HAL-O routes to butler
3. Main process checks butler PTY → BUSY (spinner visible, streaming output)
4. Message queued. Main returns: { status: 'queued', position: 1 }
5. HAL-O tells user on TG: "[butler] is busy — your message is queued. I'll relay when it's free."
6. 45 seconds later: butler goes idle
7. Queue pops → message injected → capture → relay
8. HAL-O on TG: "[butler] You have 7 items on your grocery list: ..."
```

### No Session Path: Target project not open

```
1. User sends TG: "@myapp check if CI passed"
2. HAL-O recognizes "myapp" but no terminal session exists
3. Two options:
   a. Auto-spawn: HAL-O calls openTerminal("D:/GitHub/myapp", "myapp", true)
      → waits for Claude to boot (~5-10s) → then injects message
   b. Ask user: "myapp isn't open. Want me to start a session?"
      → TG inline keyboard: [ Start myapp ] [ Cancel ]
4. After spawn + inject → normal capture → relay flow
```

### Ambiguous Path: No clear target

```
1. User sends TG: "how's the build doing?"
2. HAL-O can't determine which project (3 have recent builds)
3. HAL-O replies on TG:
   "Which project?
    [ hal-o ] [ butler ] [ myapp ]"
4. User taps "myapp"
5. HAL-O dispatches to myapp with context stickiness set
```

---

## 10. Voice Round-Trip

When the user sends a voice message and expects a voice response:

```
TG Voice In                                     TG Voice Out
    │                                                ▲
    ▼                                                │
Transcribe (faster-whisper)                    TTS (tts.py auto)
    │                                                ▲
    ▼                                                │
HAL-O Claude: detect target                    HAL-O Claude: format
    │                                          for speech + generate
    ▼                                                ▲
dispatch-to-project ──► PTY inject ──► capture ──► return text
```

The voice rewrite step happens in HAL-O Claude, not in the sub-session. This means:
- Sub-sessions output plain text (no voice awareness needed)
- HAL-O applies personality sliders and voice rewrite rules from CLAUDE.md
- HAL-O generates TTS with the appropriate mood
- The voice always sounds like HAL, regardless of which sub-session produced the content

---

## 11. Integration with Existing Systems

### AFK / Back Mode

The existing AFK mode (send updates to Telegram when user is away) works unchanged for HAL-O itself. For sub-sessions:
- The dispatcher monitors all PTY sessions for important output even when no message was dispatched
- If a sub-session outputs something matching alert patterns (build failed, test error, deployment complete), the dispatcher can proactively notify on Telegram: `[butler] Reminder: dentist appointment in 30 minutes`
- This is opt-in per project via project settings

### Voice System (V10 Mood)

The dispatcher doesn't affect voice identity. HAL-O is always the voice. When relaying sub-session responses, HAL-O rewrites the text for voice delivery using its own personality sliders. The sub-session's raw output is for text relay; HAL-O's voice rewrite is for voice relay.

### Workspace Dispatcher (workspace-dispatcher.md)

The workspace dispatcher design routes between Dev/Butler workspaces within the HAL-O UI. The Telegram dispatcher is complementary:
- **Workspace dispatcher**: routes local input (keyboard, mic) to the correct workspace tab
- **Telegram dispatcher**: routes remote input (TG messages) to the correct PTY session

They share the same project registry and keyword matching logic. The implementation should share the scoring engine:

```typescript
// src/main/routing-engine.ts — shared by both dispatchers
export function scoreMessage(
  text: string,
  targets: ProjectTarget[]
): ScoredTarget[] {
  // Prefix check, keyword scoring, CWD matching
  // Used by both tg-dispatcher.ts and workspace-dispatcher.ts
}
```

### HudTopbar Voice Input

Currently, HudTopbar sends voice transcripts to the focused terminal via `ptyInput(target, "[voice] ${text}\r")`. This is a local-only flow. The Telegram dispatcher handles remote voice separately. No conflict.

---

## 12. Security Considerations

### PTY Injection Safety

Writing arbitrary text to a PTY is inherently risky. Mitigations:
- The `[tg]` prefix is parsed by Claude Code, not by the shell. Claude sees it as user input, not as a command to execute blindly.
- The dispatcher never injects raw shell commands. It always wraps in the `[tg]` prefix so Claude Code handles interpretation.
- Rate limiting: max 5 dispatched messages per minute per session (prevents abuse if bot token is compromised).
- Telegram access control: the existing Claude plugin access system (`/telegram:access` skill) gates who can send messages. The dispatcher inherits this -- only approved users can trigger routing.

### Response Leakage

Sub-session responses may contain sensitive data (API keys in error messages, private file paths). The dispatcher should:
- Never log full response text to disk
- Apply the same cleaning that strips ANSI codes to also strip patterns matching `sk-*`, `ghp_*`, `AKIA*`, etc.
- Respect a per-project `tg-relay: false` setting that blocks Telegram relay entirely

---

## 13. New Files + Modified Files

```
NEW FILES:
  src/main/tg-dispatcher.ts       — dispatch orchestrator (inject, capture, queue)
  src/main/tg-bot.ts              — direct Telegram Bot API client (for proactive alerts)
  src/main/routing-engine.ts      — shared message→project scoring (used by TG + workspace)

MODIFIED FILES:
  src/main/terminal-manager.ts    — add onData subscriber API, idle detection, session state
  src/main/ipc-handlers.ts        — register dispatcher IPC handlers
  src/main/ipc-terminal.ts        — add dispatch-to-project handler
  src/renderer/src/hooks/
    useTerminalSessions.ts        — expose dispatch API to renderer (for Claude tool use)
  src/renderer/src/preload/       — add dispatch-to-project to exposed API
```

### terminal-manager.ts Changes

```typescript
// New: subscriber API for PTY output (dispatcher listens to target sessions)
addOutputSubscriber(sessionId: string, callback: (data: string) => void): () => void {
  // Returns unsubscribe function
}

// New: session state tracking
getSessionState(sessionId: string): 'idle' | 'busy' | 'unknown' {
  // Based on last output analysis
}

// New: get session by project name (fuzzy match)
findSessionByProject(name: string): PtySession | undefined {
  // Case-insensitive, supports aliases
}
```

---

## 14. Implementation Phases

### Phase 1: PTY Output Subscriber + Idle Detection (0.5 day)
- [ ] Add `addOutputSubscriber()` to `TerminalManager`
- [ ] Implement idle/busy state machine per session (pattern matching on PTY output)
- [ ] Add `getSessionState()` API
- [ ] Unit test: spawn PTY, detect idle after prompt, detect busy during output

### Phase 2: Dispatch IPC + Injection (0.5 day)
- [ ] Create `src/main/tg-dispatcher.ts` with `injectMessage()` and message queue
- [ ] Add `dispatch-to-project` IPC handler in `ipc-terminal.ts`
- [ ] Wire into `terminal-manager.write()` with `[tg]` prefix
- [ ] Expose via preload API
- [ ] Test: inject message into idle PTY, verify it appears as input

### Phase 3: Response Capture (1 day)
- [ ] Implement `ResponseCapture` class with output windowing
- [ ] Silence timeout (5s), prompt detection, hard timeout (120s)
- [ ] Output cleaning pipeline (ANSI strip, spinner strip, collapse blanks)
- [ ] Telegram message size handling (split, truncate, file attachment)
- [ ] Test: inject message, capture response, verify cleaned output matches expected

### Phase 4: HAL-O Claude Integration (0.5 day)
- [ ] Update HAL-O system prompt: routing instructions, `dispatch-to-project` tool description
- [ ] Add `[tg]` prefix handling documentation to sub-session CLAUDE.md templates
- [ ] Test end-to-end: TG message → HAL-O Claude → dispatch → capture → TG reply

### Phase 5: Routing Engine (1 day)
- [ ] Create `src/main/routing-engine.ts` with `scoreMessage()`
- [ ] Implement prefix matching, keyword scoring, CWD matching
- [ ] Context stickiness state management
- [ ] Inline keyboard for ambiguous routing (Telegram)
- [ ] Share engine with workspace dispatcher
- [ ] Test: 20 sample messages → verify correct routing

### Phase 6: Auto-Spawn + Voice Round-Trip (0.5 day)
- [ ] Auto-spawn terminal when target project isn't open (with user confirmation option)
- [ ] Voice message handling: transcribe → dispatch → capture → TTS → voice reply
- [ ] Proactive notifications: monitor sub-sessions for alert patterns
- [ ] Per-project `tg-relay` setting

### Phase 7: Polish + Edge Cases (0.5 day)
- [ ] Rate limiting (5 msg/min/session)
- [ ] Secret stripping in relay output
- [ ] Queue status messages ("butler is busy, queued at position 2")
- [ ] `/switch` and `/status` TG commands
- [ ] Timeout handling and graceful degradation

**Total estimate: ~4.5 days**

---

## 15. Future Extensions

### Smart Spawn-on-Demand

If the user asks about a project that has no open terminal, the dispatcher could:
1. Look up the project path from the HAL-O project registry (`scan-projects`)
2. Auto-spawn a Claude Code session for it
3. Wait for initialization (~5-10s)
4. Inject the message
5. Capture and relay
6. Optionally auto-close the session after 5 minutes of inactivity (save resources)

This turns HAL-O into a true project multiplexer -- the user never needs to manually open terminals.

### Multi-Turn Conversations

The current design handles single request-response pairs. For multi-turn:
- Track conversation threads per project per Telegram chat
- When the user sends a follow-up (within sticky window), route to the same session
- The sub-session's Claude maintains its own conversation context naturally (it's a persistent PTY)
- The dispatcher just needs to correctly route consecutive messages to the same target

### Parallel Dispatch

User sends: "ask butler for my todo count and ask myapp for CI status"
- HAL-O parses this as two separate dispatches
- Injects both in parallel (to different sessions)
- Captures both responses
- Combines into a single Telegram reply: `[butler] 7 items | [myapp] CI green, all 23 tests passing`

### Response Streaming

Instead of waiting for the full response, stream partial output to Telegram using `editMessage`:
1. Inject message, start capture
2. Every 3 seconds, if buffer has new content, edit the Telegram message with current output
3. On completion, send final message (new message, not edit, so it triggers notification)

This gives the user real-time feedback for long-running tasks.

---

## 16. Open Questions

1. **Plugin conflict**: Does the Claude Telegram plugin use `getUpdates` (long-polling) or webhooks? If long-polling, the main process CANNOT also poll -- they'd steal messages from each other. The hybrid architecture (section 8) avoids this by having HAL-O Claude remain the sole Telegram consumer, but this means dispatch latency includes Claude's processing time. Worth benchmarking.

2. **Sub-session prompt format**: Should sub-sessions be told they're receiving dispatched Telegram messages? If yes, their CLAUDE.md should include: "Messages prefixed with `[tg]` come from the user via Telegram, relayed by HAL-O. Respond concisely -- your output will be forwarded back to Telegram." This improves response quality but requires modifying project configs.

3. **Token cost**: Every dispatched message consumes tokens in TWO Claude sessions: HAL-O (for routing) and the target (for handling). For simple questions, this is ~2x cost vs. direct. Acceptable? Could optimize with a fast-path: if Tier 1 prefix match is confident, skip HAL-O Claude entirely and dispatch from the main process, relay via direct Bot API.

4. **Concurrent dispatch limit**: If 3 sub-sessions are all busy, and the user sends 3 messages in quick succession, all get queued. What's the UX? Probably: send one status message listing all queued items, update it as each completes.

5. **Session identity in responses**: Should sub-session responses always be prefixed with `[project-name]`? Probably yes for text, but for voice it should be invisible (HAL speaks as one entity, not as "butler says..."). Unless the user has context stickiness active, in which case even the prefix is redundant.

6. **HAL-O session compaction**: When HAL-O Claude compacts context, it loses routing history. The dispatcher's routing context should be persisted in the main process (not in Claude's context), so compaction doesn't break stickiness. This is already handled by the `TgRoutingContext` living in `tg-dispatcher.ts`.

---

*Design created 2026-03-25. Builds on workspace-dispatcher.md and the existing terminal-manager.ts / ipc-terminal.ts architecture. Target: HAL-O master branch.*
