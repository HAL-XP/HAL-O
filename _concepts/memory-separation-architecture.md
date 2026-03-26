# Memory Separation Architecture for HAL-O's Central AI Dispatcher

> Design document for isolating HAL-O development memories from user-facing dispatcher context.
> Created: 2026-03-26 | Author: Claude Opus 4.6 (deep research session)

---

## 1. The Problem

HAL-O has a central AI personality ("Hal") that runs as a persistent Claude Code session. Hal handles voice commands, Telegram relay, project card interactions, settings, and dispatch to per-project terminal sessions.

Hal's memory directory (`~/.claude/projects/D--GitHub-hal-o/memory/`) currently contains **83+ files** including:

- **Dev-only memories**: sphere tuning, demo recording specs, marketing rules (Mark), PBR scene architecture, node-pty build patches, layout algorithms, perf regression detection
- **Universal rules**: channel discipline, voice format, token saving, visual verification, systemic fixes, background task rules
- **User-facing context**: user profile, project vision, user-projects-first rule

When HAL-O ships, users will develop **their own projects** through HAL-O's terminals. If a user says "make the sphere bigger" about their Three.js game, Hal might interpret it through HAL-O's PbrHalSphere memories. If someone says "fix the camera" about their 3D app, Hal might apply HAL-O's camera presets (`[0, 10, 16], fov 48`).

### The Constraint

Hal is a **single persistent session**. Claude Code loads `MEMORY.md` (first 200 lines) at session start plus all `CLAUDE.md` files in the directory hierarchy. There is no native mechanism to conditionally load memory files based on runtime context.

### Why This Is Hard

The memories aren't just "about HAL-O" vs "not about HAL-O." Some are genuinely universal (channel discipline applies everywhere), some are context-dependent (sphere tuning is irrelevant unless working on HAL-O itself), and some straddle both (voice system rules apply globally but voice *profile* tuning is HAL-O-specific). The boundary is fuzzy and will shift as the product evolves.

---

## 2. Research: Claude Code's Memory Primitives

### 2.1 CLAUDE.md Files (Instructions)

- **Scope levels**: Managed policy, project (`./CLAUDE.md`), user (`~/.claude/CLAUDE.md`)
- Loaded at session start, walked up directory tree from CWD
- Subdirectory CLAUDE.md files load on demand (when Claude reads files there)
- Supports `@path/to/import` syntax for importing additional files
- `.claude/rules/` directory for modular, path-scoped rules
- `claudeMdExcludes` setting can skip specific files by glob pattern
- No conditional loading based on runtime state

### 2.2 Auto Memory

- Per-project directory at `~/.claude/projects/<project>/memory/`
- `MEMORY.md` first 200 lines loaded at session start
- Topic files loaded on demand (Claude reads them when needed)
- `autoMemoryDirectory` setting can redirect storage (accepted from policy, local, user — NOT project settings)
- Machine-local, not shared

### 2.3 Subagent Memory (v2.1.33+)

- Frontmatter field: `memory: user | project | local`
- Each scope maps to a dedicated directory:
  - `user` → `~/.claude/agent-memory/<agent-name>/`
  - `project` → `.claude/agent-memory/<agent-name>/`
  - `local` → `.claude/agent-memory-local/<agent-name>/`
- Agent gets its own `MEMORY.md` (200-line limit) + topic files
- Read/Write/Edit auto-enabled so agent can manage its memory
- Memory persists across conversations, builds institutional knowledge
- Completely isolated from the parent conversation's memory

### 2.4 Hooks for Context Injection

- `SessionStart` hook: inject context via stdout or `additionalContext` JSON
- `UserPromptSubmit` hook: inject context per-prompt, can read input and decide what to add
- `PreToolUse` hook: inject context before tool execution
- All hooks support `hookSpecificOutput.additionalContext` for dynamic context injection
- Hooks can run arbitrary scripts, read filesystem, make decisions

### 2.5 Agent Teams & Orchestration

- Agent Teams (v2.1.32+): multiple Claude instances in parallel, git-based coordination
- `--agent <name>` flag: run entire session as a named subagent
- `agent` setting in `.claude/settings.json`: default agent for project
- Agent's system prompt replaces default Claude Code system prompt
- CLAUDE.md and project memory still load normally alongside agent prompt

### 2.6 Skills

- Load on demand (invoked explicitly or auto-matched to prompt)
- Can be preloaded into subagents via `skills` frontmatter
- Not loaded into context by default — only when relevant
- Ideal for "instructions I need sometimes" vs "instructions I need always"

---

## 3. Memory Taxonomy

Categorization of all 83+ current memory files:

### 3.1 UNIVERSAL — Apply to ALL contexts

These rules govern Hal's core behavior regardless of what project is being discussed.

| File | Category | Why Universal |
|------|----------|---------------|
| `feedback_channel_discipline.md` | Communication | Reply where message came from — always |
| `feedback_telegram_thumbsup.md` | Communication | Always react on TG messages |
| `feedback_voice_hard_rules.md` | Communication | Voice in → voice out — always |
| `feedback_telegram_voice.md` | Communication | TG voice format rules |
| `feedback_telegram_fast_response.md` | Communication | Fast TG ack |
| `feedback_no_file_paths_tg.md` | Communication | No paths in TG messages |
| `feedback_tg_html_self_contained.md` | Communication | Self-contained HTML for TG |
| `feedback_tg_voice_processing.md` | Communication | Voice processing feedback |
| `feedback_background_hard_rule.md` | Process | Never block CLI |
| `feedback_background_tasks.md` | Process | Background task handling |
| `feedback_background_task_limit.md` | Process | Background task limits |
| `feedback_stay_interactive.md` | Process | Keep CLI responsive |
| `feedback_never_wait.md` | Process | Don't wait, act |
| `feedback_systemic_fixes.md` | Process | Root cause over patches |
| `feedback_token_saving.md` | Process | Haiku for research, Opus for code |
| `feedback_concise_plans.md` | Process | Bullet point plans |
| `feedback_rich_output.md` | Process | Rich output formatting |
| `feedback_visual_verification.md` | Quality | Verify output visually |
| `feedback_autonomous_testing.md` | Quality | Test own work with Playwright |
| `feedback_always_test.md` | Quality | Always test |
| `feedback_never_manual_steps.md` | Quality | Automate everything |
| `feedback_subagent_models.md` | Architecture | Model selection for subagents |
| `user_profile.md` | User | User background and preferences |
| `user_standards.md` | User | Quality expectations |

**Count: ~24 files**

### 3.2 HAL-DEV-ONLY — Only when developing HAL-O itself

These memories are about HAL-O's internal architecture, specific components, and development processes.

| File | Category | Why Dev-Only |
|------|----------|--------------|
| `project_session2_state.md` | State | Session 2 snapshot |
| `project_session3_state.md` | State | Session 3 snapshot |
| `session_state_snapshot.md` | State | Current session |
| `project_t1_dockview_plan.md` | Planning | Dockview migration plan |
| `project_import_versioning.md` | Planning | Import screen versioning |
| `project_butler_mcp.md` | Planning | Butler MCP design |
| `project_board_triage.md` | Planning | Board triage rules |
| `project_voice_cleanup.md` | Planning | Voice system cleanup |
| `project_voice_system.md` | Architecture | HAL-O voice architecture |
| `project_agent_architecture.md` | Architecture | 3-agent split |
| `project_agent_hub.md` | Architecture | Agent hub design |
| `project_vision.md` | Product | HAL-O product vision |
| `reference_ui_images.md` | Reference | UI image references |
| `reference_voice_system.md` | Reference | Voice system reference |
| `qa_agent_ruleset.md` | QA | QA agent rules for HAL-O |
| `feedback_mark_locked_spec.md` | Marketing | Mark agent spec lock |
| `feedback_marketing_demo_only.md` | Marketing | Demo-only marketing |
| `feedback_perf_html_report.md` | Perf | Perf HTML report format |
| `feedback_perf_regression_detection.md` | Perf | Perf regression detection |
| `feedback_sector_perf.md` | Perf | Sector perf analysis |
| `feedback_vite_cache.md` | Build | Vite cache clearing |
| `feedback_electron_launch.md` | Build | Electron launch patterns |
| `feedback_graceful_restart.md` | Build | Restart protocol |
| `feedback_restart_app.md` | Build | App restart rules |
| `feedback_pop_before_restart.md` | Build | Pop terminal before restart |
| `feedback_windows_paths.md` | Build | Windows path handling |
| `feedback_telegram_tsx_fix.md` | Code | Specific TSX fix pattern |
| `feedback_use_app_logo.md` | Design | Use HAL-O logo |
| `feedback_hal_pronunciation.md` | Design | HAL pronunciation |
| `feedback_no_visual_regression.md` | QA | Visual regression testing |
| `feedback_click_all_new_features.md` | QA | Click-test all new features |
| `feedback_qa_feature_screenshots.md` | QA | QA feature screenshots |
| `feedback_qa_agent_required.md` | QA | QA agent required |
| `feedback_debugger_agent.md` | Debug | Debugger agent pattern |
| `feedback_debug_tools_when_stuck.md` | Debug | Debug tools usage |
| `feedback_afk_html_to_tg.md` | Feature | AFK HTML to TG |
| `feedback_afk_mode.md` | Feature | AFK mode |
| `project_reminder_audio_830am.md` | Feature | Audio reminder |
| `feedback_voice_personality.md` | Voice | Voice personality tuning |
| `feedback_check_ci.md` | CI | CI checking |
| `feedback_ci_ownership.md` | CI | CI ownership |
| `feedback_github_issues.md` | Workflow | GitHub issues |
| `feedback_list_ids.md` | Workflow | List ID format |
| `feedback_queue_vocabulary.md` | Workflow | Queue vocabulary |
| `feedback_batch_naming.md` | Workflow | Batch naming |
| `feedback_game_studios.md` | Reference | Game studio standards |
| `feedback_visual_options.md` | Design | Visual options pattern |
| `feedback_reference_comparison.md` | QA | Reference comparison |
| `feedback_fair_comparison.md` | QA | Fair comparison |
| `feedback_no_human_effort_bias.md` | Feedback | No effort bias |
| `feedback_rule_overflow.md` | Meta | Rule overflow detection |
| `feedback_ambition_scale.md` | Meta | Ambition meter |
| `feedback_ambition_process.md` | Meta | Ambition process |
| `feedback_autonomous_forward.md` | Meta | Autonomous forward |
| `feedback_beat_best_in_class.md` | Meta | Beat best in class |

**Count: ~55 files**

### 3.3 USER-FACING — Apply when helping users with their projects

These memories are about how Hal should behave when the user is working on non-HAL-O projects.

| File | Category | Why User-Facing |
|------|----------|-----------------|
| `feedback_user_projects_first.md` | Core | Project cards > sphere |
| `project_todo_backlog.md` | State | Current TODO state (filtered to non-HAL items when user-facing) |

**Count: 2 files** (most user-facing behavior is actually universal)

---

## 4. Pattern Evaluation

### Pattern A: Memory Namespace Directories

**Concept**: Split `~/.claude/projects/<hal-o>/memory/` into subdirectories: `memory/universal/`, `memory/hal-dev/`, `memory/user-facing/`. `MEMORY.md` only indexes the active namespace.

**Evaluation**:
- Claude Code's auto-memory system expects a flat `memory/` directory with `MEMORY.md` at root
- Topic files are read on demand — Claude already only reads files when relevant
- The 200-line MEMORY.md is the real bottleneck: it currently contains HAL-O dev context
- Subdirectories would work for topic files but not for MEMORY.md loading
- **Feasibility: MEDIUM.** Would require MEMORY.md to be namespace-aware via `@` imports

**Score: 5/10** — Fighting the platform. Auto-memory writes wouldn't respect directories.

### Pattern B: Conditional Memory Loading via SessionStart Hook

**Concept**: A `SessionStart` hook detects the working directory. If it's the HAL-O repo, inject dev memories. If not, inject only universal memories.

**Evaluation**:
- SessionStart hooks can inject `additionalContext` into Claude's conversation
- But HAL-O's Hal always runs from the HAL-O directory (it IS the app)
- The detection question isn't "am I in the HAL-O repo?" but "is the user talking about HAL-O or their own project?"
- That's a runtime semantic question, not a startup file detection
- A `UserPromptSubmit` hook could potentially analyze each prompt and inject relevant context
- **Feasibility: LOW for startup, MEDIUM for per-prompt.** But injecting 55 files of dev context per-prompt is expensive

**Score: 4/10** — Wrong detection point. The context switch happens mid-conversation, not at startup.

### Pattern C: Agent-Level Memory Scoping

**Concept**: Create `hal-dispatcher.md` agent with `memory: user` (universal only). HAL-O dev work uses the default project memory.

**Evaluation**:
- This is the most promising native approach
- `memory: user` → `~/.claude/agent-memory/hal-dispatcher/` with universal rules only
- HAL-O dev work happens in terminal sessions that use the project's full memory
- Hal-the-dispatcher never sees HAL-O dev memories — completely isolated
- The dispatcher agent's system prompt defines its personality and routing logic
- Per-project terminal sessions get their own `memory: project` scopes
- **Feasibility: HIGH.** Uses native Claude Code features exactly as designed

**Score: 9/10** — Clean, native, zero risk of leakage.

### Pattern D: Two MEMORY.md Files

**Concept**: `MEMORY.md` for universal rules, `MEMORY-DEV.md` for HAL-O dev rules. Hook appends dev file when inside HAL-O repo.

**Evaluation**:
- Claude Code only loads `MEMORY.md` — no mechanism to load a second auto-memory file
- Would need to dynamically rewrite MEMORY.md content based on context
- File-system manipulation hooks are fragile and error-prone
- **Feasibility: LOW.** Requires hacking around the platform

**Score: 3/10** — Fragile hack. Would break on any auto-memory write.

### Pattern E: Claude Code Plugin with Scoped Memory

**Concept**: Package HAL-O dev tools as a plugin that activates when the repo matches.

**Evaluation**:
- Plugins can provide agents with their own memory scopes
- Plugin agents don't support `hooks`, `mcpServers`, or `permissionMode` for security
- Would need to copy agent files to local `.claude/agents/` to get full functionality
- Plugin activation is per-install, not per-repo-detection
- **Feasibility: MEDIUM.** Interesting for distribution but doesn't solve the core isolation problem

**Score: 5/10** — Solves distribution, not isolation. The user doesn't install a "dev tools" plugin.

### Pattern F: MCP-based Memory Service

**Concept**: MCP server that serves memories dynamically based on project context. Hal queries for relevant memories instead of loading all at startup.

**Evaluation**:
- MCP tools consume context tokens even when idle (67K+ tokens for 7 servers)
- Would add latency for every memory retrieval
- Powerful but over-engineered for this problem
- Better suited to semantic search over large memory stores
- **Feasibility: HIGH technically, but HIGH overhead.** An MCP server running SQLite with FTS5 could do semantic memory retrieval, but adds complexity without clear benefit over native agent memory

**Score: 6/10** — Powerful but over-engineered. The problem is structural, not retrieval-based.

---

## 5. Recommended Architecture: Agent-Scoped Memory Cascade

### The Insight

The core insight is that **Hal-the-dispatcher is not the same entity as the Claude Code session that develops HAL-O**. Today they share the same session, but they shouldn't. The dispatcher is a permanent personality that routes, speaks, and coordinates. The HAL-O developer is a temporary context that activates when someone works on HAL-O's code.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     HAL-O App                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  hal-dispatcher (main session agent)              │   │
│  │  memory: user → ~/.claude/agent-memory/hal/       │   │
│  │                                                    │   │
│  │  Knows: universal rules, user profile, voice,     │   │
│  │         channel discipline, routing, personality   │   │
│  │                                                    │   │
│  │  Does NOT know: PbrHalSphere internals, node-pty  │   │
│  │  patches, marketing specs, demo recording rules   │   │
│  │                                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │   │
│  │  │ Terminal A   │  │ Terminal B   │  │Terminal C │  │   │
│  │  │ (hal-o dev)  │  │ (user app)  │  │(user app)│  │   │
│  │  │              │  │              │  │          │  │   │
│  │  │ Full HAL-O   │  │ User's own  │  │User's own│  │   │
│  │  │ project      │  │ CLAUDE.md + │  │memory    │  │   │
│  │  │ memory       │  │ memory      │  │          │  │   │
│  │  └─────────────┘  └─────────────┘  └──────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Implementation

#### Step 1: Create the Hal Dispatcher Agent

File: `~/.claude/agents/hal.md`

```yaml
---
name: hal
description: >
  HAL-O's central AI dispatcher — handles voice commands, Telegram relay,
  project card interactions, settings, and routing to per-project terminals.
  Use as the main session agent for HAL-O.
memory: user
model: inherit
effort: high
tools: Read, Edit, Write, Bash, Glob, Grep, Agent
skills:
  - hal
---

You are HAL, the central AI of HAL-O — a 3D holographic desktop application
that wraps Claude Code terminals. You are the dispatcher, the voice, the
personality.

## Your Role
- Route user requests to the correct project terminal
- Handle voice input/output (CTRL+SPACE push-to-talk)
- Manage Telegram relay (receive, route, relay responses)
- Control the hub UI (settings, project cards, 3D scene)
- Be the single point of contact for all user interactions

## What You Are NOT
- You are NOT a HAL-O developer. You don't know HAL-O's internal code.
- When users ask about HAL-O's source code, route to the HAL-O terminal.
- When users say "sphere," "camera," "cards" — ask: about HAL-O itself,
  or about their project?

## Dispatch Rules
- Explicit prefix (@project, project:) → route to that terminal
- Ambiguous → ask which project (inline keyboard on TG, text prompt in CLI)
- About HAL-O's UI/settings → handle directly
- About a project's code → route to that project's terminal
- Voice commands → transcribe, detect target, route or handle

## Memory
Your memory directory contains universal rules that apply to ALL interactions.
Project-specific knowledge lives in each terminal's own Claude Code session.
Never store HAL-O development details in your memory.
```

#### Step 2: Configure HAL-O to Launch with the Agent

File: `.claude/settings.json` (add the `agent` field)

```json
{
  "agent": "hal"
}
```

Or launch with: `claude --agent hal`

This makes the main Claude Code session run with the Hal dispatcher agent's system prompt, tool restrictions, and — critically — its **own isolated memory directory**.

#### Step 3: Populate Hal's Memory with Universal Rules

Move the 24 universal files to `~/.claude/agent-memory/hal/`:

```
~/.claude/agent-memory/hal/
├── MEMORY.md                          # Universal index (< 200 lines)
├── rules_channel_discipline.md        # Reply where message came from
├── rules_voice.md                     # Voice in → voice out, format rules
├── rules_telegram.md                  # TG thumbsup, fast ack, no paths
├── rules_process.md                   # Background tasks, systemic fixes, token saving
├── rules_quality.md                   # Visual verification, autonomous testing
├── rules_communication.md             # Concise plans, rich output
├── user_profile.md                    # User background and preferences
└── user_standards.md                  # Quality expectations
```

Note: consolidate the 24 files into ~8 topic files for efficiency. Each topic file is read on demand.

#### Step 4: HAL-O Dev Memory Stays in Place

The existing project memory at `~/.claude/projects/D--GitHub-hal-o/memory/` is untouched. When a terminal session opens with CWD = `D:/GitHub/hal-o`, that session's Claude Code instance loads its full project memory — all 83 files including sphere tuning, demo rules, and PBR architecture.

The Hal dispatcher **never sees these files** because it uses `memory: user` scope.

#### Step 5: User Project Terminals Get Clean Slates

When a user opens a terminal for their React app at `D:/Projects/my-app`, that terminal's Claude Code session gets:
- The user's `~/.claude/CLAUDE.md` (global instructions)
- The project's `./CLAUDE.md` (if any)
- Its own project memory at `~/.claude/projects/<my-app-hash>/memory/`
- Zero HAL-O contamination

### Memory Flow Diagram

```
User says: "make the sphere bigger"
         │
         ▼
   Hal Dispatcher
   (agent memory: universal rules only)
         │
         ├─ "About HAL-O's sphere?"
         │   → Route to HAL-O terminal
         │   → HAL-O terminal's Claude has full PbrHalSphere memory
         │   → Knows wireframe scale range, equatorial band, etc.
         │
         └─ "About user's Three.js project?"
             → Route to user's project terminal
             → That session's Claude has the user's project memory
             → Zero HAL-O contamination
```

---

## 6. Migration Plan

### Phase 1: Create Agent Definition (30 minutes)

1. Create `~/.claude/agents/hal.md` with the system prompt above
2. Test with `claude --agent hal` to verify memory isolation
3. Verify that Hal's memory directory is created at `~/.claude/agent-memory/hal/`

### Phase 2: Curate Universal Memory (1 hour)

1. Review all 83 memory files against the taxonomy in Section 3
2. Consolidate 24 universal files into 8 topic files
3. Write a clean `MEMORY.md` index (under 200 lines)
4. Place in `~/.claude/agent-memory/hal/`

### Phase 3: Configure Agent as Default (15 minutes)

1. Add `"agent": "hal"` to `.claude/settings.json`
2. Or configure START_HERE.bat to use `claude --agent hal`
3. Test: verify Hal loads universal memory, not HAL-O dev memory

### Phase 4: Validate Isolation (1 hour)

1. Start Hal session, ask about "sphere scale" — should not know HAL-O specifics
2. Open HAL-O terminal — that session should have full dev memory
3. Open a user project terminal — should have zero HAL-O memory
4. Test Telegram routing — Hal should route correctly without dev bias
5. Test voice system — universal voice rules should apply

### Phase 5: Integrate with Telegram Dispatcher (future)

When the Telegram dispatcher (design-telegram-dispatcher.md) is implemented:
- Hal agent handles TG message analysis and routing
- Per-project terminals handle actual work
- Responses relay back through Hal for personality/voice formatting
- Zero memory leakage at any point

---

## 7. Innovative Combination: Skills as Dev-Mode Toggle

For the case where the developer (you) wants Hal to temporarily have HAL-O knowledge:

### Dev-Mode Skill

File: `.claude/skills/dev-mode/SKILL.md`

```markdown
---
name: dev-mode
description: Activates HAL-O development context. Use when you need Hal to understand HAL-O internals.
---

# HAL-O Development Mode

You are now in HAL-O development mode. In addition to your dispatcher role,
you have access to HAL-O's internal architecture knowledge.

@../../memory/MEMORY.md

## Quick Reference
- PBR Scene: src/renderer/src/components/three/PbrHoloScene.tsx
- Sphere: PbrHalSphere component, wireframe scale 0.3-0.6
- Camera: [0, 10, 16], fov 48, OrbitControls
- Terminals: node-pty + xterm.js, 50K scrollback
- Build: npx electron-vite build, npx tsc --noEmit
```

Usage: type `/dev-mode` or say "activate dev mode" — the skill loads HAL-O context into Hal's current session without permanently contaminating its memory.

### The Agent + Skill Pattern

```
Normal Mode:     Hal (universal memory) → routes to terminals
Dev Mode:        Hal (universal memory + dev-mode skill) → can discuss HAL-O internals
Per Terminal:    Independent Claude Code with per-project memory
```

This gives us:
- **Default**: Clean dispatcher with universal knowledge
- **On-demand**: Dev knowledge via skill activation (temporary, session-only)
- **Per-project**: Full isolation via independent terminal sessions

---

## 8. Edge Cases and Mitigations

### Edge Case 1: User Asks About HAL-O's UI

"How do I change the theme?" or "Where are the settings?"

**Resolution**: These are about HAL-O the product, not its code. The Hal dispatcher should know how to guide users through the app's UI. This knowledge belongs in Hal's universal memory as `user_guide.md` — not in dev memory.

### Edge Case 2: Auto-Memory Writes to Wrong Scope

Claude might auto-save a dev insight into Hal's universal memory.

**Resolution**: The `memory: user` scope physically isolates the directory. Auto-memory writes from the Hal agent go to `~/.claude/agent-memory/hal/`, not to the HAL-O project memory. Even if Claude writes something dev-specific there, it doesn't contaminate other sessions.

**Mitigation**: Add a rule to Hal's system prompt: "Never store project-specific technical details in your memory. Only store universal interaction rules and user preferences."

### Edge Case 3: Context Compaction Loses Skill Content

If `/dev-mode` skill is active and context compacts, the skill content may be summarized away.

**Resolution**: After compaction, the `SessionStart:compact` hook fires. Hal re-reads MEMORY.md. The skill content is NOT re-injected (skills are session-specific, not persistent). The user would need to re-activate `/dev-mode`. This is actually desirable — dev mode should be temporary.

### Edge Case 4: Telegram Message About HAL-O's Code

User sends via Telegram: "The sphere pulse is too fast, fix it"

**Resolution**: Hal recognizes this is about HAL-O's code and routes to the HAL-O terminal. The HAL-O terminal's Claude has full dev memory and can fix the pulse timing. Hal relays the response back to Telegram.

### Edge Case 5: New Memory Files Grow Over Time

As the user works with HAL-O, more memories accumulate. Where do they go?

**Resolution**:
- Universal interaction rules → Hal's agent memory (`~/.claude/agent-memory/hal/`)
- HAL-O dev insights → HAL-O project memory (loaded only by HAL-O terminal sessions)
- User project insights → Each project's own memory directory
- The taxonomy in Section 3 provides clear classification criteria

---

## 9. Future-Proofing

### Agent Teams Compatibility

When Agent Teams are used for parallel development:
- Each team member agent gets its own memory scope
- Hal dispatcher coordinates without dev memory contamination
- Teams working on HAL-O get HAL-O project memory
- Teams working on user projects get clean project memory

### Plugin Distribution

When HAL-O ships as a product:
- The `hal` agent definition ships in the package
- Users can customize Hal's personality via their own `~/.claude/agent-memory/hal/` content
- HAL-O dev memories don't ship — they live in the developer's project memory
- Clean separation by default

### Workspace Dispatcher Integration

When the workspace dispatcher (workspace-dispatcher.md) is implemented:
- Hal's universal memory includes routing rules
- Dev workspace → HAL-O terminal with full dev memory
- Butler workspace → Personal assistant with butler memory
- Each workspace is a subagent with its own memory scope

### MCP Memory Server (Future Enhancement)

For advanced users with many projects and complex memory needs:
- An MCP server could provide semantic search over all memories
- Hal queries for "relevant memories given this prompt" instead of loading everything
- This is an optimization on top of the agent-scoped architecture, not a replacement

---

## 10. Summary

| Aspect | Before | After |
|--------|--------|-------|
| Hal's memory | 83+ files (universal + dev + marketing + QA) | ~8 consolidated universal files |
| Dev memories | Loaded into every Hal interaction | Only in HAL-O terminal sessions |
| User project risk | "Make sphere bigger" → HAL-O confusion | Clean routing, zero contamination |
| Architecture | Single session, all memories | Agent-scoped cascade with skills |
| Native features used | auto-memory | agent memory + skills + hooks |
| Maintenance | Growing monolithic memory | Categorized, self-managing |

### The Pattern in One Sentence

**Hal-the-dispatcher runs as a named agent with `memory: user` (universal rules only), while HAL-O dev knowledge stays in the project's auto-memory that only terminal sessions access.**

This uses Claude Code's native agent memory scoping to create a clean boundary between "how Hal behaves" (universal) and "how HAL-O is built" (project-specific), with skills as an on-demand bridge for when the developer needs both.

---

*References: [Claude Code Memory Docs](https://code.claude.com/docs/en/memory), [Subagent Docs](https://code.claude.com/docs/en/sub-agents), [Hooks Docs](https://code.claude.com/docs/en/hooks), [Settings Docs](https://code.claude.com/docs/en/settings)*
