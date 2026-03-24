# Workspace Dispatcher — Multi-Workspace Routing for HAL-O

Design doc for routing user input (voice, text, Telegram) to the correct workspace without manual switching.

---

## 1. Architecture Overview

```
                          ┌─────────────────────────┐
                          │      INPUT SOURCES       │
                          │  Voice (MicButton/CTRL+  │
                          │  SPACE), Terminal text,   │
                          │  Telegram plugin          │
                          └────────────┬──────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────┐
                          │      DISPATCHER          │
                          │  (src/main/dispatcher.ts)│
                          │                          │
                          │  Tier 1: Regex/keywords  │
                          │  Tier 2: Local LLM       │
                          │  Tier 3: Ask user         │
                          └────────────┬──────────────┘
                                       │
                          ┌────────────┼──────────────┐
                          ▼            ▼              ▼
                   ┌──────────┐ ┌──────────┐  ┌──────────┐
                   │   DEV    │ │  BUTLER  │  │ FUTURE   │
                   │Workspace │ │Workspace │  │Workspace │
                   │          │ │          │  │          │
                   │ Projects │ │ Todos    │  │ ...      │
                   │ Terminals│ │ Notes    │  │          │
                   │ 3D Scene │ │ Calendar │  │          │
                   │ Git ops  │ │ Habits   │  │          │
                   └──────────┘ └──────────┘  └──────────┘
```

### Key Principle
The dispatcher lives in the **main process** (`src/main/dispatcher.ts`). All input — regardless of source — passes through it before reaching a workspace. The renderer never routes directly; it sends raw input to main via IPC, main routes it, main sends the routed command to the correct workspace handler.

---

## 2. Routing Flow

```
Input arrives (voice transcript / typed text / Telegram message)
  │
  ├─ 1. Check explicit prefix: "dev:", "butler:", "@dev", "@butler"
  │     → Route immediately, strip prefix
  │
  ├─ 2. Check active context (user is typing inside a dev terminal)
  │     → Route to that workspace (context-sticky)
  │
  ├─ 3. Tier 1: Regex/keyword match against workspace-routes.json
  │     ├─ Single workspace match with confidence ≥ 0.7 → route
  │     ├─ Multiple matches → pick highest score, or Tier 2 if tied
  │     └─ No match → Tier 2
  │
  ├─ 4. Tier 2: Local LLM classification (if enabled)
  │     ├─ Returns workspace ID → route
  │     └─ Returns "ambiguous" → Tier 3
  │
  └─ 5. Tier 3: Ask user
        → "Dev or personal?" inline prompt
        → Remember choice for similar future inputs (learning)
```

### Latency Budget
| Stage | Target | Method |
|---|---|---|
| Prefix check | <1ms | String startsWith |
| Context check | <1ms | In-memory state lookup |
| Tier 1 regex | <10ms | Pre-compiled RegExp array |
| Tier 2 LLM | <500ms | Local GPU inference (RTX 5090) |
| Tier 3 ask | User-dependent | Inline UI prompt / Telegram inline keyboard |

### Context Stickiness
- If the user is focused on a terminal tab → all text input routes to dev
- If the user is on the butler workspace → voice defaults to butler
- Explicit prefix always overrides context
- Telegram has no visual context → always runs full Tier 1/2/3

---

## 3. Workspace Registry

File: `~/.claude/workspace-registry.json`

```json
{
  "version": 1,
  "workspaces": [
    {
      "id": "dev",
      "name": "Development",
      "description": "Code projects, terminals, git, builds, deployments",
      "icon": "terminal",
      "enabled": true,
      "priority": 1,
      "agent": {
        "model": "claude-sonnet-4-20250514",
        "systemPrompt": "You are HAL-O's dev workspace agent...",
        "maxTokens": 200000
      }
    },
    {
      "id": "butler",
      "name": "Butler",
      "description": "Personal assistant: todos, notes, reminders, calendar, health, habits",
      "icon": "clipboard",
      "enabled": true,
      "priority": 2,
      "agent": {
        "model": "claude-sonnet-4-20250514",
        "systemPrompt": "You are HAL-O's butler workspace agent...",
        "maxTokens": 100000
      }
    }
  ]
}
```

Each workspace self-declares its routing keywords in `workspace-routes.json` (see Tier 1).

---

## 4. Tier 1: Keyword/Regex Routing

File: `~/.claude/workspace-routes.json`

```json
{
  "version": 1,
  "routes": {
    "dev": {
      "keywords": [
        "fix", "build", "commit", "test", "deploy", "merge", "branch",
        "refactor", "debug", "lint", "compile", "npm", "pip", "git",
        "push", "pull", "PR", "issue", "CI", "docker", "server",
        "error", "bug", "crash", "stack trace", "function", "class",
        "variable", "API", "endpoint", "database", "query", "migrate",
        "release", "version", "dependency", "package"
      ],
      "patterns": [
        "\\b(fix|debug|refactor)\\s+(the|this|that)\\b",
        "\\b(run|start|stop|restart)\\s+(the\\s+)?(server|app|build|test)",
        "\\bopen\\s+\\w+\\s+(project|repo|terminal)",
        "\\bgit\\s+\\w+",
        "\\bnpm\\s+\\w+",
        "\\bpip\\s+\\w+"
      ],
      "projectNames": "auto"
    },
    "butler": {
      "keywords": [
        "remind", "reminder", "todo", "to-do", "buy", "grocery",
        "appointment", "note", "habit", "health", "weight", "gym",
        "call", "birthday", "recipe", "schedule", "calendar",
        "meeting", "dentist", "doctor", "medication", "water",
        "sleep", "walk", "run", "exercise", "meal", "cook",
        "pick up", "drop off", "pay", "bill", "rent"
      ],
      "patterns": [
        "\\bremind\\s+me\\s+to\\b",
        "\\badd\\s+(a\\s+)?(todo|note|reminder|task)\\b",
        "\\b(buy|get|pick up)\\s+(some\\s+)?\\w+",
        "\\bschedule\\s+(a\\s+)?\\w+",
        "\\bwhat('s|\\s+is)\\s+(on\\s+)?my\\s+(schedule|calendar|todo)",
        "\\bhow\\s+(much|many)\\s+(water|sleep|steps|calories)"
      ],
      "personalNames": ["mom", "dad", "wife", "husband"]
    }
  },
  "customRules": []
}
```

### `projectNames: "auto"`
The dev workspace automatically imports all project names from the existing `scan-projects` IPC handler as additional keywords. If the user says "open hal-o" or "check hal-o tests", the project name match routes to dev.

### Scoring
- Exact keyword match: +1.0 per keyword
- Regex pattern match: +1.5 per pattern
- Project name match: +2.0 (strong signal)
- Personal name match: +1.5
- Score normalized by workspace: `total / maxPossible`
- Route to highest-scoring workspace if score >= 0.7 confidence threshold

### Custom Rules
Users add rules via Settings or by editing the JSON directly:
```json
{
  "customRules": [
    { "pattern": "\\btraining\\b", "workspace": "dev", "note": "ML training, not gym" },
    { "pattern": "\\bpull\\s+day\\b", "workspace": "butler", "note": "gym, not git pull" }
  ]
}
```
Custom rules are checked first and override keyword matches.

---

## 5. Tier 2: Local LLM Classification

### Model Selection
| Model | Size | RTX 5090 Speed | Accuracy (est.) |
|---|---|---|---|
| Qwen2-0.5B | 0.5B | ~50ms | Good for binary classify |
| TinyLlama-1.1B | 1.1B | ~100ms | Better for edge cases |
| Phi-3-mini (3.8B) | 3.8B | ~200ms | Best accuracy, still fast |

**Recommendation**: Start with **Qwen2-0.5B** for minimal VRAM/latency, upgrade to Phi-3-mini if accuracy is insufficient.

### Inference Setup
- Runtime: llama.cpp with CUDA backend (already on system for other tasks)
- Model loaded once at app start, stays resident (~500MB VRAM for Qwen2-0.5B)
- IPC: main process spawns llama.cpp server on startup, dispatcher queries via HTTP localhost

### Prompt Template
```
Classify this user message into one workspace. Reply with ONLY the workspace ID.

Workspaces:
- dev: software development, coding, git, builds, terminals, deployments
- butler: personal tasks, todos, reminders, calendar, health, habits, shopping

Message: "{user_input}"

Workspace:
```

### Config
```json
{
  "tier2": {
    "enabled": false,
    "model": "qwen2-0.5b-q4_k_m.gguf",
    "modelPath": "~/.claude/models/dispatcher/",
    "port": 8099,
    "maxTokens": 5,
    "temperature": 0.0
  }
}
```

Disabled by default — Tier 1 regex handles 80%+ of cases. Tier 2 is opt-in for users who want smarter routing on ambiguous inputs.

---

## 6. Dispatcher ↔ Workspace Communication

### IPC Architecture

```
Renderer                    Main Process                  Workspace Agent
────────                    ────────────                  ───────────────
                            dispatcher.ts
MicButton ──voice-input──►  route(text) ──►  workspace-dev:command ──► dev handler
Terminal  ──term-input───►  route(text) ──►  workspace-butler:cmd ──► butler handler
                            ▲
Telegram ──tg-message────►  route(text) ──►  workspace-*:command ──► routed handler
```

### New IPC Channels
| Channel | Direction | Purpose |
|---|---|---|
| `dispatch-input` | renderer → main | Raw user input + source metadata |
| `dispatch-result` | main → renderer | Routing decision + workspace ID |
| `workspace-command` | main → workspace handler | Routed command to execute |
| `workspace-response` | workspace handler → main → renderer | Response back to UI |
| `dispatch-ask-user` | main → renderer | Ambiguous input, show picker |
| `dispatch-user-choice` | renderer → main | User's workspace selection |

### Source Metadata
Every input carries metadata so the dispatcher can make context-aware decisions:
```typescript
interface DispatchInput {
  text: string
  source: 'voice' | 'terminal' | 'telegram' | 'hub-search'
  sourceId?: string        // terminal session ID, TG chat ID
  activeWorkspace: string  // currently visible workspace
  timestamp: number
}

interface DispatchResult {
  workspaceId: string
  confidence: number
  tier: 1 | 2 | 3         // which tier made the decision
  switchRequired: boolean  // does the UI need to change workspace?
}
```

---

## 7. Telegram: Single Bot with Routing

### Decision: One bot, one chat, dispatcher routes

**Why not multiple bots:**
- User already has one TG bot token configured globally
- Switching bots requires re-pairing, managing multiple tokens
- One bot = one conversation thread = simpler UX
- The dispatcher handles routing transparently

### How It Works
1. Telegram message arrives via plugin → main process
2. Dispatcher classifies the message
3. Routed to correct workspace handler
4. Response sent back through the same TG bot
5. Optional: prefix response with workspace badge `[DEV]` or `[BUTLER]`

### Telegram-Specific Routing Enhancements
- Inline keyboard for ambiguous: `[ Dev ] [ Personal ]` buttons
- `/dev` and `/butler` TG commands to force-route next message
- `/switch dev` / `/switch butler` to set default workspace for TG session
- Session stickiness: once routed to butler via TG, stay there until explicit switch or strong dev signal

---

## 8. Workspace UI — Tabs/Switcher

### Workspace Bar (top of app, above HudTopbar)

```
┌──────────────────────────────────────────────────┐
│  [◆ DEV]  [◆ BUTLER]  [+ Add Workspace]         │
├──────────────────────────────────────────────────┤
│  HudTopbar (existing, scoped to active workspace)│
├──────────────────────────────────────────────────┤
│                                                  │
│  Workspace content area                          │
│  (ProjectHub / ButlerHub / etc.)                 │
│                                                  │
├──────────────────────────────────────────────────┤
│  Terminal dock (shared across workspaces)         │
└──────────────────────────────────────────────────┘
```

### Behavior
- Workspace bar: always visible, ~32px height, minimal chrome
- Active workspace highlighted with accent color
- Badge on inactive workspace if it has pending notifications (new todo due, build failed)
- Click to switch, keyboard shortcut Ctrl+1/2/3
- Terminal dock is shared — terminals don't belong to workspaces (a dev terminal stays open when switching to butler)
- 3D scene transitions: workspace switch triggers a smooth camera pivot/dissolve, not a hard cut
- The sphere is shared — its meaning changes per workspace (see section 10)

### App.tsx Changes
```typescript
type ViewMode = 'loading' | 'setup' | 'hub' | 'wizard' | 'creating' | 'configure'
// Becomes:
type ViewMode = 'loading' | 'setup' | 'workspace' | 'wizard' | 'creating' | 'configure'
// 'workspace' replaces 'hub', renders WorkspaceContainer which switches sub-views
```

New component tree:
```
App
└── WorkspaceContainer
    ├── WorkspaceBar          (tab strip)
    ├── DevWorkspace          (current ProjectHub, renamed)
    ├── ButlerWorkspace       (new: todo/note/calendar hub)
    └── [future workspaces]
```

---

## 9. Card Types per Workspace

### Dev Workspace (existing ProjectHub)
- **Project cards**: git stats, activity bars, file count, last commit
- **Active terminal indicator**: glowing border when terminal is open
- **CI status badge**: green/red/yellow from GitHub Actions

### Butler Workspace (new)
| Card Type | Content | 3D Representation |
|---|---|---|
| **Todo** | Title, due date, priority, checkbox | Flat panel, red edge = overdue, green = done |
| **Note** | Title, preview text, tags | Panel with memo icon, tag-colored edge |
| **Habit** | Name, streak count, today's status | Panel with progress ring, streak glow |
| **Calendar** | Event name, time, location | Panel with clock icon, time-sorted |
| **Health** | Metric name, today's value, trend | Panel with chart mini-viz |
| **Reminder** | Text, trigger time | Panel with alarm icon, pulses when due |

### Card Rendering in 3D
Both workspaces use the same `ScreenPanel.tsx` component — card type just changes the HTML content rendered inside the panel's `<Html>` drei element. No new 3D infrastructure needed.

Butler cards use the same layout system (`layouts3d.ts`) — todo cards orbit the sphere like project cards do.

---

## 10. Sphere Meaning per Workspace

The HAL sphere is the central visual element. Its state reflects the active workspace.

| Aspect | Dev Workspace | Butler Workspace |
|---|---|---|
| **Status text** | "ONLINE" / "AWAITING CONNECTION" | "READY" / "TRACKING" |
| **Core color** | Cyan (current) | Warm amber |
| **Pulse trigger** | Git push, build complete, CI result | Habit completed, reminder due, all todos done |
| **Sonar rings** | On HAL terminal connect | On daily review completion |
| **Audio reaction** | Terminal voice output | Butler voice responses |
| **Equatorial band** | Shows active project count | Shows today's completion % |
| **Inner glow** | Brighter = more active terminals | Brighter = more habits completed today |

### Implementation
`PbrHalSphere` gets a `workspaceId` prop. The component reads workspace-specific colors and behaviors from a config map. No separate sphere components — just parameterized rendering.

```typescript
const SPHERE_CONFIGS: Record<string, SphereConfig> = {
  dev: {
    coreColor: '#00ffff',
    statusOnline: 'ONLINE',
    statusOffline: 'AWAITING CONNECTION',
    pulseEvents: ['git-push', 'build-complete', 'ci-result'],
  },
  butler: {
    coreColor: '#ffaa00',
    statusOnline: 'READY',
    statusOffline: 'TRACKING',
    pulseEvents: ['habit-complete', 'reminder-due', 'todos-cleared'],
  },
}
```

---

## 11. Token Cost Analysis

### Option A: Shared Claude Session (single agent, all workspaces)
- **Pros**: Full context across workspaces ("the build I just fixed" + "the meeting I scheduled"), single session cost
- **Cons**: Context window fills faster, workspace bleed (dev context pollutes butler reasoning), harder to scope system prompts
- **Cost**: 1 session x ~200K tokens = baseline

### Option B: Separate Claude Sessions (one per workspace)
- **Pros**: Clean context per workspace, independent system prompts, workspaces can use different models (Sonnet for dev, Haiku for butler), no cross-contamination
- **Cons**: No cross-workspace awareness, higher base token cost, more processes
- **Cost**: 2+ sessions x ~100K tokens each

### Option C: Hub + Spokes (RECOMMENDED)
- **Hub agent**: Lightweight coordinator in the main process. Handles routing, cross-workspace queries ("what did I work on today?" pulls from both). Uses Haiku for cheap coordination.
- **Spoke agents**: One Claude session per workspace with scoped system prompts and context. Dev gets a dev-focused prompt, butler gets a personal-assistant prompt.
- **Cross-workspace**: Hub agent can query spoke agents via tool calls: `ask_workspace("dev", "what's the build status?")` or `ask_workspace("butler", "what's on my calendar?")`
- **Cost**: 1 hub (Haiku, ~10K tokens/request) + N spokes (Sonnet/Haiku, ~100K each)

```
                    ┌─────────────┐
                    │  Hub Agent   │
                    │  (Haiku)     │
                    │  Routes +    │
                    │  Coordinates │
                    └──────┬──────┘
                    ┌──────┴──────┐
              ┌─────┴─────┐ ┌────┴──────┐
              │ Dev Agent  │ │Butler Agent│
              │ (Sonnet)   │ │ (Haiku)   │
              │ 200K ctx   │ │ 100K ctx  │
              └────────────┘ └───────────┘
```

### Model Recommendations per Workspace
| Workspace | Recommended Model | Reasoning |
|---|---|---|
| Dev | claude-sonnet-4-20250514 | Needs code reasoning, complex tasks |
| Butler | claude-haiku-3-5 | Simple CRUD: add todo, set reminder, log habit |
| Hub/Dispatcher | claude-haiku-3-5 | Just routing + coordination, minimal reasoning |

---

## 12. Implementation Phases

### Phase 1: Dispatcher Core (1 day)
- [ ] Create `src/main/dispatcher.ts` with Tier 1 regex engine
- [ ] Create `~/.claude/workspace-routes.json` with dev + butler keywords
- [ ] Create `~/.claude/workspace-registry.json` with workspace definitions
- [ ] Add `dispatch-input` / `dispatch-result` IPC channels
- [ ] Wire voice input (MicButton → transcribe → dispatch) through dispatcher
- [ ] Wire Telegram input through dispatcher
- [ ] Unit tests for keyword scoring

### Phase 2: Workspace Abstraction (1 day)
- [ ] Create `WorkspaceContainer.tsx` parent component
- [ ] Rename `ProjectHub` to `DevWorkspace`
- [ ] Add workspace bar (tab strip) at top of app
- [ ] Keyboard shortcuts Ctrl+1/2 for workspace switching
- [ ] Parameterize sphere colors/status per workspace
- [ ] Workspace switch animation (camera pivot)

### Phase 3: Butler Workspace MVP (2 days)
- [ ] Butler data model: todos, notes, reminders (stored in `~/.claude/butler/`)
- [ ] Butler card components (reusing ScreenPanel HTML content)
- [ ] Butler IPC handlers (`ipc-butler.ts`: CRUD for todos/notes/reminders)
- [ ] Butler 3D scene (same PBR scene, amber sphere, butler cards as panels)
- [ ] Basic voice commands: "add todo", "remind me", "what's on my list"

### Phase 4: Tier 2 LLM + Learning (1 day)
- [ ] Download Qwen2-0.5B GGUF to `~/.claude/models/dispatcher/`
- [ ] llama.cpp server integration (spawn on app start if enabled)
- [ ] Tier 2 classification prompt + response parsing
- [ ] Settings toggle: "Enable AI routing (uses ~500MB VRAM)"
- [ ] Learning: log Tier 3 user choices → auto-add to custom rules

### Phase 5: Polish + Telegram (1 day)
- [ ] Telegram inline keyboard for ambiguous routing
- [ ] `/dev` and `/butler` TG commands
- [ ] Workspace badge in TG responses `[DEV]` / `[BUTLER]`
- [ ] Cross-workspace queries via hub agent
- [ ] Settings UI for custom routing rules
- [ ] Notification badges on workspace tabs

---

## 13. File Structure (New/Modified)

```
src/main/
  dispatcher.ts              NEW — routing engine (Tier 1 + 2 + 3)
  dispatcher-llm.ts          NEW — Tier 2 llama.cpp client
  ipc-butler.ts              NEW — butler CRUD handlers
  ipc-handlers.ts            MOD — register butler + dispatcher handlers
  workspace-registry.ts      NEW — load/manage workspace definitions

src/renderer/src/
  components/
    WorkspaceContainer.tsx   NEW — workspace switcher parent
    WorkspaceBar.tsx         NEW — tab strip UI
    DevWorkspace.tsx         RENAME from ProjectHub.tsx (+ minor adapter)
    ButlerWorkspace.tsx      NEW — butler hub component
    butler/
      TodoCard.tsx           NEW — todo card content for ScreenPanel
      NoteCard.tsx           NEW — note card content
      HabitCard.tsx          NEW — habit tracker card
      ReminderCard.tsx       NEW — reminder card
      CalendarCard.tsx       NEW — calendar event card
  hooks/
    useDispatcher.ts         NEW — dispatch input + receive routing result
    useButlerData.ts         NEW — butler data state management

~/.claude/
  workspace-registry.json   NEW — workspace definitions
  workspace-routes.json     NEW — keyword/regex routing rules
  butler/
    todos.json              NEW — todo items
    notes.json              NEW — notes
    reminders.json          NEW — reminders
    habits.json             NEW — habit definitions + log
    config.json             NEW — butler workspace settings
```

---

## 14. Open Questions

1. **Shared terminal dock or per-workspace?** Current recommendation: shared. A dev terminal is still useful when glancing at butler. But butler might want its own "quick note" input area that isn't a full terminal.

2. **Voice identity per workspace?** Both workspaces use the same HAL voice (V10 mood system). Butler might default to `gentle`/`calm` moods more often, dev to `authoritative`/`urgent`. This is handled by mood detection, no special logic needed.

3. **Butler data persistence**: JSON files in `~/.claude/butler/` vs SQLite vs cloud sync? Start with JSON (simplest, greppable, git-friendly). Migrate to SQLite if performance degrades past ~1000 items.

4. **Cross-workspace voice**: "Remind me to deploy hal-o tomorrow" — is this butler (reminder) or dev (deploy)? Answer: butler creates the reminder, reminder text references dev. The dispatcher routes to butler because "remind me" is a strong butler signal.

5. **Future workspaces**: Media (video editing pipeline), Finance (budget tracking), Learning (study cards). The registry/dispatcher pattern supports N workspaces without code changes — just add entries to the JSON files.

---

*Design created 2025-03-24. Based on HAL-O architecture as of commit c899185 (master).*
