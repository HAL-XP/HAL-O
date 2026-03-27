# HAL-O Module Architecture

> Brainstorm: What modules should users be able to activate?
> Created: 2026-03-26 session 8 | Source: voice discussion

## Core Principle

**Modules = task TYPE, not life domain.** "Work" and "Personal" are optional tags, not structural divisions.

A personal React side-project goes in DEV alongside your employer's backend. They're isolated by project memory, not by a work/personal wall.

## The Seven Modules

| Module | Type | Job | Default Model | Optional? |
|--------|------|-----|---------------|-----------|
| **DEV** | Core | Code projects. Terminal, git, model per project. | Claude Sonnet/Opus | Always on |
| **PLANNER** | Opt-in | Cross-project oversight. Roadmaps, dependencies. | Haiku / local 7B | Auto when >3 projects |
| **PERSONAL** | Opt-in | Life admin. Calendar, reminders, notes. Butler MCP. | Haiku / local 7B | Manual or Butler detected |
| **OPS** | Opt-in | Infrastructure. CI/CD, deploys, monitoring. | Haiku + Sonnet (incidents) | Manual or k8s/docker detected |
| **CREATIVE** | Opt-in | Writing, marketing, docs, social media. | Sonnet (quality matters) | Manual or docs-only project |
| **RESEARCH** | Power | Deep web research, competitive analysis, reports. | Sonnet + web search | Manual or "/research" trigger |
| **COMMS** | Power | Communication hub. Telegram, email, Slack routing. | Local dispatcher + Haiku | Auto when TG bot configured |

## Why Not Work vs Personal?

Real overlap examples:
- **Personal code project** → DEV module, "personal" tag
- **Work strategy doc** → CREATIVE module, "work" tag
- **Homelab k8s** → OPS module, "personal" tag
- **Client research** → RESEARCH module, "work" tag
- **Kids school** → PERSONAL module
- **Team roadmap** → PLANNER module, "work" tag

Tags are cosmetic (card border color, hub filter). Zero effect on memory/routing/behavior.

## Memory Isolation

```
~/.hal-o/modules/
  dev/           → per-project (hal-o/, my-app/, client-api/)
  planner/       → roadmap.md (cross-project, read-only access to DEV statuses)
  personal/      → per-area (calendar/, health/, boat/, kids/)
  ops/           → per-service (k8s-prod/, ci-pipelines/)
  creative/      → per-project (marketing/, blog/)
  research/      → per-topic (llm-landscape/, competitors/)
  universal/     → loaded ALWAYS (user-profile, voice-rules, channel-rules)
```

Golden rule: dispatcher picks module + area → ONLY that memory loads.
Exception: PLANNER gets read-only access to all DEV project statuses (not full memories).

## Dispatch Flow

```
Layer 0: Explicit prefix   (<1ms)  — @hal-o → DEV, @butler → PERSONAL
Layer 1: Regex patterns     (<2ms)  — push/test/nuke → DEV, remind/schedule → PERSONAL
Layer 2: Context sticky     (<1ms)  — already in DEV/myapp → stays there
Layer 3: Embedding match   (5-15ms) — BGE-M3 vs module signatures
Layer 4: LLM classify     (15-50ms) — Qwen3-1.7B structured JSON
Layer 5: Ask user                   — "Is this for your React app or marketing?"
```

80% resolved by Layer 0-3.

## User Profiles

| Profile | Active Modules |
|---------|---------------|
| Solo Dev | DEV, PERSONAL |
| Tech Lead | DEV, PLANNER, COMMS, PERSONAL |
| Freelancer | DEV, CREATIVE, PERSONAL, COMMS, RESEARCH |
| DevOps Eng | DEV, OPS, COMMS |
| Indie Hacker | All |
| Student | DEV, PERSONAL, RESEARCH |
| OSS Maintainer | DEV, PLANNER, OPS, CREATIVE, COMMS, RESEARCH |

## Implementation Status (2026-03-27)

### DONE
- `src/main/dispatcher.ts` — 5-layer dispatch cascade (Layers 0-2 implemented)
  - Layer 0: @prefix routing
  - Layer 1: keyword + project name, voice switch commands, natural name detection
  - Layer 2: context stickiness (5min window)
- `src/main/ipc-dispatcher.ts` — IPC bridge
- `src/main/telegram-handler.ts` — Own TG bot polling (replaces Claude's --channels)
- `src/main/model-providers.ts` — Ollama integration (list/pull/chat)
- `src/main/ipc-models.ts` — Model routing config (presets, per-role, persisted)
- Settings > Models tab — provider status, presets, per-role dropdowns
- Voice dispatch wired in HudTopbar (toast feedback)
- 33 dispatcher tests (clear + ambiguous)
- Ollama installed + Qwen3:1.7B working locally

### TODO
- Layer 3: BGE-M3 embedding classifier (Python sidecar)
- Layer 4: Qwen3 LLM classifier for ambiguous messages
- Layer 5: User clarification UI (inline picker)
- Module-specific UI (card types, sphere grouping)
- Personal module: Butler MCP wiring
- Planner module: cross-project status view

## [NEEDS USER DECISIONS]

1. Module cards on hub: mixed orbit vs separate rings vs sphere overlays?
2. Personal sub-areas: separate cards vs one card with tabs vs expandable fan?
3. Research → other modules: auto-feed (with approval) vs manual copy vs shared clipboard?
4. Alpha scope: all 7 (some coming-soon) vs DEV+PERSONAL only vs DEV+PERSONAL+COMMS?
5. Planner: separate module vs hub view-mode toggle vs both (starts as view, grows)?
