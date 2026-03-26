# HAL-O Multi-Model Transition — Complete Plan

> Master document for the LLM-agnostic transition. All decisions, risks, and implementation details.
> Created: 2026-03-26 | Source: voice discussions throughout session 7

---

## 1. The Vision
HAL-O becomes model-agnostic: local LLM for dispatch, Claude/any cloud for coding, modular roles, per-project memory isolation. "Switzerland of AI terminals."

## 2. Five Roles (modular, opt-in)

| Role | Job | Default | Alternatives | Optional? |
|------|-----|---------|-------------|----------|
| Dispatcher | Classify & route messages | Qwen3-1.7B local | Any local LLM, Claude Haiku, embedding-only | Core if >1 project |
| Coder | Write/edit code | Claude Sonnet/Opus | GPT-4, Gemini, local Qwen3-32B, DeepSeek | Core |
| Assistant | Calendar, reminders, personal | Claude Haiku | Local 7B, any cheap cloud | Optional |
| QA | Run tests, validate | Claude Haiku | Local 7B | Optional |
| Voice Rewrite | Rewrite for spoken delivery | Qwen3-1.7B local | Claude Haiku | Optional (needs mic/TTS) |
| Wizard Assistant | Guide setup, detect providers | Local if available | Claude Haiku | Active during setup only |

**Modularity rule:** Core = terminal + 3D scene. Everything else activates based on what's installed.

## 3. Memory Architecture — Per-Module, Per-Project

```
Memory Scopes:
├── Universal (loaded always)
│   └── Channel discipline, voice rules, user profile
├── Dev Module
│   ├── HAL-O project → hal-o specific memories
│   ├── Butler project → butler specific memories
│   └── User's React app → its own memories
├── Personal Module
│   ├── Boat lessons → boat context
│   ├── School paperwork → school context
│   └── Health tracking → health context
└── Never mixed — dispatcher picks the active scope
```

**Key insight:** Claude Code already isolates per-project memory (`~/.claude/projects/<hash>/memory/`). For personal assistant topics, Butler MCP handles them without LLM memory (stateless tools). For personal "projects" (boat, school), each gets its own memory directory.

**Portability concern:** Claude's auto-memory (MEMORY.md + topic files) is Claude-specific. Other LLMs don't have this. **Devlogs** (`_devlog/`) become the portable alternative — plain markdown that any LLM can read. System prompts replace CLAUDE.md for non-Claude models.

## 4. The 5 Strategic Points

### 4.1 Memory/Hooks Transition
**Decision:** Option A — keep Claude Code as orchestrator, add local models as cheap workers.
- Hooks stay Claude-specific (UserPromptSubmit, SessionStart)
- Build equivalent hooks in Electron for non-Claude paths (intercept terminal I/O)
- Memory files are markdown — readable by any model via system prompt injection
- **Risk:** LOW. 90% of infrastructure stays the same.

### 4.2 Replicating Anthropic Tech
| Feature | Claude-specific? | Portable? | Alternative |
|---------|-----------------|-----------|-------------|
| Hooks | Yes (Claude Code) | Build in Electron | Intercept terminal stdin/stdout |
| Subagents | Yes (Claude Code) | Use LangGraph/CrewAI | Or simple subprocess spawning |
| Memory (MEMORY.md) | Yes (auto-memory) | Read as markdown | System prompt + file reading |
| Skills | Yes (Claude Code) | Prompt templates | Load on demand from files |
| CLAUDE.md | Yes (name) | Rename to SYSTEM.md | All LLMs support system prompts |
| Context compaction | Yes (Claude Code) | Conversation summarization | Local LLM summarize before handoff |

**Risk:** MEDIUM for subagents. HIGH if trying to fully replace Claude Code.

### 4.3 Real-Time Agent Transitions
**Decision:** Independent routing (approach 3). No handoff needed.
- Each message classified independently by dispatcher
- Each target has its own persistent context
- No mid-conversation model switching
- Context stickiness prevents unnecessary reclassification
- **Risk:** LOW.

### 4.4 Tips & Tricks Repo
**Decision:** Sections, not branches.
- Claude-specific tips (existing)
- Model-agnostic patterns (new section)
- Provider comparison table (new page)
- **Risk:** LOW. Documentation only.

### 4.5 Wizard
**Decision:** Add model detection step to existing wizard.
- Detect: Ollama installed? Models pulled? API keys?
- Guide user to pick preset (Full Local / Hybrid / Claude Only / Budget)
- "Download recommended model" button
- **Risk:** LOW. Natural extension, ~1 day work.

## 5. Dispatcher Architecture — 5-Layer Cascade

```
Layer 0: Explicit Prefix (<1ms) — @hal-o, @butler, /mute
Layer 1: Voice Command Regex (<2ms) — 30 compiled patterns
Layer 2: Context Stickiness (<1ms) — session window reuse
Layer 3: Embedding Classifier (5-15ms) — BGE-M3 multilingual
Layer 4: LLM Classifier (15-50ms) — Qwen3-1.7B structured JSON
Layer 5: User Clarification — inline picker, answer becomes training data
```

80% of messages resolved by Layer 0-3 (no LLM needed). Average latency: ~15ms.

**Best-plus-one innovation:** Auto-learning loop from Layer 5 corrections.

## 6. Model Recommendations

- **Layer 3 embedding:** BGE-M3 (568M, 2.2GB, multilingual, French native)
- **Layer 4 LLM:** Qwen3-1.7B Q4 (1.2GB VRAM, 15ms on RTX 5090)
- **Total dispatcher VRAM:** 3.4GB on 32GB GPU
- **Implementation:** Ollama (easiest cross-platform setup)

## 7. Butler as MCP Server

Separate repo (HAL-XP/claude-butler). Exposes tools:
- check_calendar, add_reminder, search_notes, send_sms, get_weather
- Credentials in `~/.butler/config.json` (never sent to API)
- Token cost: ~150 tokens for 5 tool signatures vs ~2000+ for a full agent
- Works with ANY Claude session, not just HAL-O

## 8. Telegram Bot — Own Handler

Currently: Claude's channel plugin handles TG.
Future: Own Python handler (`python-telegram-bot`) → dispatches to local LLM → routes to Claude terminals.
- Full control over message routing
- Works with local dispatcher (zero API cost for routing)
- Voice messages: download → faster-whisper → classify → route

## 9. Competitive Landscape

30+ competitors analyzed. HAL-O's unique moat:
- **3D holographic cockpit** (nobody else has this)
- **Voice I/O** integrated into the environment
- **Project hub** with 3D visualization
- **Embedded terminals** with session persistence

Closest: Squadron (multi-agent), Tide Commander (3D agents), cmux (terminal multiplexer). None combine all four.

## 10. Cost Presets

| Preset | Monthly Est. | Description |
|--------|-------------|-------------|
| Full Local | $0 | Everything local. Needs GPU. |
| Budget | ~$15 | Local dispatch, Haiku for coding |
| Hybrid | ~$48 | Local dispatch, Sonnet for coding |
| Claude Only | ~$58 | All Claude. No local setup. |

## 11. Implementation Phases

### Phase 1: Foundation (can do now) ✓
- model-providers.ts with role routing + presets — DONE
- Implementation plan doc — DONE
- StatusLine sidecar for context % — DONE

### Phase 2: Dispatcher Sidecar
- Python embed service (BGE-M3)
- Ollama integration for Qwen3
- 5-layer pipeline in TypeScript
- ~2 days

### Phase 3: Settings UI
- Models tab with dropdowns per role
- Preset buttons
- Provider status indicators
- ~1 day

### Phase 4: Wizard Enhancement
- Model detection step
- Download recommended model button
- ~1 day

### Phase 5: Telegram Own Handler
- Python bot with dispatcher routing
- Voice message handling
- ~1 day

### Phase 6: Butler MCP (separate repo)
- FastAPI server with Google Calendar
- MCP tool definitions
- ~2 days

**Total: ~40 hours focused work.**

## 12. [NEEDS USER DECISIONS]

1. Ollama vs llama.cpp vs vLLM for local inference?
2. Default dispatcher model: Qwen3-1.7B vs alternative?
3. Non-Claude coding support in alpha?
4. TG bot: own handler now or keep Claude plugin for alpha?
5. Auto-download BGE-M3 (2.2GB) in wizard?
6. Butler MCP: separate repo or monorepo?

## 13. Risks

| Risk | Severity | Mitigation |
|------|---------|-----------|
| Over-engineering the agent framework | HIGH | Keep Claude Code as orchestrator (option A) |
| Memory format not portable | MEDIUM | Devlogs as portable alternative, system prompts |
| Subagent replication scope creep | MEDIUM | Use LangGraph, don't build from scratch |
| VRAM constraints on smaller GPUs | LOW | Tier system (CPU fallback for Tier 0-1) |
| Ollama not installed by users | LOW | Graceful fallback to Claude-only |
