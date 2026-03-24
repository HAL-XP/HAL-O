# HAL-O Performance Diagnosis Report

**Date**: 2026-03-24
**Bundle**: 5,149,852 bytes (4.91 MB) — `out/renderer/assets/index-BSKMpqW8.js`
**Key files analyzed**: useSettings.ts, App.tsx, ProjectHub.tsx, SettingsMenu.tsx, ScreenPanel.tsx, PbrHoloScene.tsx, MergeGraph.tsx, useMergeDetection.ts, terminal-manager.ts, terminalActivity.ts

---

## TOP 3 BOTTLENECKS (ranked by impact)

### #1: CRITICAL — useSettings causes full-tree cascade re-renders

**21 independent useState calls** in `useSettings()`. Every settings change (e.g. moving a slider) triggers a state update in App.tsx, which causes:

1. **App re-renders** (owns all 21 state values + 25 useCallback updaters)
2. **56 props** drilled from App -> ProjectHub -> PbrHoloScene -> PbrSceneInner -> each ScreenPanel
3. ProjectHub (1005 lines, 20 useState, 17 useCallback, 11 useEffect) re-renders
4. PbrSceneInner (props: 50+ fields) re-renders
5. Every ScreenPanel re-renders (the React.memo comparator helps, but the parent still runs)

**The settings menu specifically**: Opening it calls `setOpen(true)` inside SettingsMenu (a portal), but changing ANY setting calls back up to App via `updateXxx()` -> `setXxx()` in useSettings -> App re-renders -> entire tree re-renders. A single slider drag (e.g. screen opacity) fires this cascade ~30 times/second.

**Fix**: Consolidate all 21 useState into a single `useReducer` with one state object. Or use Zustand/Jotai. This is THE highest-impact fix — one change eliminates 20 unnecessary state update batches.

### #2: HIGH — Inline arrow callbacks on ScreenPanel defeat React.memo

In PbrSceneInner (line ~2152-2200), each ScreenPanel receives **8 inline arrow functions** that are recreated every render:

```
onHover={(h) => setHoveredId(h ? project.path : null)}
onResume={() => onOpenTerminal?.(project.path, project.name, true)}
onNewSession={() => onOpenTerminal?.(project.path, project.name, false)}
onFiles={() => window.api.openFolder(project.path)}
onRunApp={project.runCmd ? () => window.api.runApp(project.path, project.runCmd) : undefined}
onAbsorb={extSession && onAbsorb ? () => onAbsorb(extSession, project) : undefined}
onContextMenu={...inline arrow...}
onOpenIde={onOpenIde ? () => onOpenIde(project.path) : undefined}
onOpenIdeMenu={onOpenIdeMenu ? (e) => onOpenIdeMenu(project.path, e) : undefined}
onOpenTerminal={...inline arrow...}
onOpenBrowser={...inline arrow...}
```

The React.memo comparator on ScreenPanel **skips** callback props (the `CALLBACK_PROPS` set), which is correct. However, the parent PbrSceneInner itself still runs all the `.map()` logic + creates all these closures + allocates props objects for every panel on every frame where any parent state changes. With 15-30 projects, this is 15-30 object allocations per parent re-render.

**Fix**: Move `hoveredId` management out of PbrSceneInner. Use refs or Zustand for hover state so parent doesn't re-render just because hover changed.

### #3: HIGH — 3 independent 10-second polling loops + 500ms activity tick

**Active timers at all times:**

| Timer | Interval | Source | Impact |
|-------|----------|--------|--------|
| External session detection | 10s | ProjectHub.tsx:335 | IPC: `detectExternalSessions()` — spawns `wmic`/`tasklist` on Windows |
| Merge conflict batch check | 10s | useMergeDetection.ts:109 | IPC: `batchCheckMergeState()` for ALL projects — file existence checks per project |
| Terminal activity metering | 500ms | terminal-manager.ts:78 | IPC: `terminal-activity` event per session with changed level |

The external session detector is the worst — on Windows, `detectExternalSessions` likely shells out to find Claude CLI processes. This runs regardless of whether any external sessions exist. The merge detector calls `batchCheckMergeState` with ALL project paths every 10 seconds — each path requires checking for `.git/MERGE_HEAD` file existence.

Both the merge detector and external session detector **do** have "only update if changed" guards, which is good. But the IPC round-trip + file I/O still occurs every 10s regardless.

**Fix**:
- Increase poll intervals to 30s (10s is excessive for merge/session detection)
- Use filesystem watchers instead of polling for merge state
- Add a visibility check — skip polls when window is not focused/visible

---

## ADDITIONAL FINDINGS (Medium/Low impact)

### #4: MEDIUM — IDE resolution serializes N IPC calls on every project/defaultIde change

ProjectHub lines 223-238: When `projects` or `defaultIde` changes, it runs a **sequential** `for` loop calling `window.api.resolveIde()` for every project. With 20 projects, that's 20 sequential IPC calls. Each IPC call has ~1-2ms overhead on Electron.

```typescript
const resolveAll = async () => {
  for (const project of projects) {
    const resolved = await window.api.resolveIde(project.path, perProject, defaultIde)
    // ^ AWAITS each one sequentially
  }
}
```

**Fix**: Use `Promise.all()` for parallel resolution, or create a batch IPC endpoint.

### #5: MEDIUM — useFrame callback count in PBR scene

**17 useFrame hooks** registered in PbrHoloScene.tsx alone, plus 1 per ScreenPanel instance (N panels), plus MergeGraph (6 useFrame), DataParticles (1), HudScrollText (1), SpaceshipFlyby (1), CinematicSequence (1), IntroSequence (1). With 20 projects:

**Total useFrame callbacks per RAF tick: ~50+**

The ScreenPanel useFrame (lines 333-448) does position lerping, dim fade, activity glow, hover scale, and back-face detection per panel. The B22 optimization (ScreenPanelUpdater + camera-move skip) helps, but when camera IS moving (orbit), all panels run full useFrame logic every frame.

**Fix**: The back-face detection is already well-optimized with the 3-frame throttle. Consider batching position/dim updates into a single system that operates on a TypedArray rather than N individual useFrame callbacks.

### #6: MEDIUM — PbrHoloScene is 2,413 lines in a single file

This file contains ~15 components (ReflectiveFloor, FloorEdgeMist, GridOverlay, TexturedPlatform, PbrRingPlatform, PbrHalSphere, SonarPulse, SceneBackground, SceneLights, GroupTrails, AutoRotateManager, CameraDriver, CameraSync, SceneReadyGate, ScenePhaseManager, PerfStatsExporter, PbrSceneInner, PbrHoloScene). They're all in one file, meaning any change to any component forces all of them through the module system.

**Fix**: Split into separate files. Won't improve runtime perf directly but improves HMR speed and maintainability.

### #7: LOW — SettingsMenu portal creates/destroys React tree on open/close

SettingsMenu uses `{open && createPortal(...)}` — the entire settings panel DOM tree is created fresh every time the settings button is clicked. With 16 useState hooks inside, 10 section collapse states, preset loading, and search — the initial render of the settings panel is non-trivial.

**Fix**: Keep the portal always mounted but hide with CSS (`display: none` or `visibility: hidden + pointer-events: none`). This way the second open is instant because React tree already exists.

### #8: LOW — Bundle size (4.91 MB)

The bundle grew from ~4.4MB to 4.91MB over session 3. Main contributors:
- `dockview` library (dock mode)
- MergeGraph (910 lines) + CinematicSequence (915 lines) + ConflictViewer
- Additional icons, constants, preset data

This is moderate for an Electron app (no network transfer), but it increases parse time on startup.

**Fix**: Code-split dockview and cinematic features behind dynamic imports since they're not needed at startup.

---

## SUMMARY: Recommended Fix Priority

| Priority | Fix | Expected Impact | Effort |
|----------|-----|-----------------|--------|
| P0 | Consolidate useSettings into useReducer (single state) | Eliminate cascade re-renders on every settings change | Medium |
| P1 | Lift hoveredId out of PbrSceneInner (use ref/store) | Stop re-rendering all ScreenPanel map logic on hover | Low |
| P1 | Always-mount SettingsMenu portal (CSS hide) | Instant settings open | Low |
| P2 | Increase poll intervals to 30s + visibility guard | Reduce background CPU/IPC 3x | Low |
| P2 | Parallelize IDE resolution (Promise.all) | Fix 20x sequential IPC bottleneck | Low |
| P3 | Code-split dockview + cinematic behind lazy import | Faster startup parse | Medium |
| P3 | Split PbrHoloScene into separate files | Better HMR, no runtime impact | Medium |

**The single highest-impact change is P0: consolidating useSettings into useReducer.** This eliminates the root cause — every settings interaction currently triggers a cascade through the entire component tree (App -> ProjectHub -> PbrHoloScene -> PbrSceneInner -> N ScreenPanels), and React processes 21 independent state updates where 1 would suffice.

---

## TOKEN COST AUDIT — Features That Consume Claude Code Tokens

**Date**: 2026-03-24
**Scope**: Every HAL-O feature that either directly costs API tokens or indirectly bloats the context window that Claude Code reads.

**Key insight**: HAL-O is a *management shell* for Claude Code projects. The token costs below apply to the *target projects* that HAL-O configures, not to HAL-O's own development sessions — except where HAL-O's own MEMORY.md/CLAUDE.md is concerned.

---

### DIRECT TOKEN COSTS (API calls or context loaded per Claude Code turn)

#### 1. Generated CLAUDE.md content — loaded every API call in target projects

**Source**: `src/main/generators.ts` — `generateClaudeMd()`

The generated CLAUDE.md has 6 versioned sections (header, stack, conventions, performance, key-files, footer). Size varies by project config:

| Section | Lines (minimal config) | Lines (full config, all options) | Purpose |
|---------|----------------------|--------------------------------|---------|
| Header + description | 3-5 | 3-5 | Project name, description |
| Stack | 3-5 | 5-7 | Primary tech, languages, styling, DB |
| Key Conventions | 8-10 | 14-18 | API keys, voice prefix, kill-by-PID, background tasks, React hooks rule |
| LLM-suggested conventions | 0 | 3-5 | Custom conventions from `analyze-project` Anthropic API call |
| Sticky AFK pattern | 0 | 2 | Only when telegram-notify hooks enabled |
| Performance | 2 | 2 | Compaction threshold, MEMORY.md tip |
| Session Start Protocol | 0 | 5-7 | Only in `claudeMd: 'full'` mode |
| What NOT To Do | 0 | 4-6 | Only in `claudeMd: 'full'` mode |
| Devlog sections | 0 | 15-30 | Summaries, hours, decisions, experiments, perf — only if enabled |
| Key Files table | 3-4 | 4-5 | .claude/rules/, _devlog/ |

**Token estimate**: ~120-180 tokens (minimal) to ~400-550 tokens (full config with all devlog formats).

**Token cost**: DIRECT — loaded every single Claude Code API call in the target project.

**Can be disabled?**: Partially. User can choose `claudeMd: 'minimal'` during project setup to skip Session Start Protocol, What NOT To Do, and Devlog sections. But the core (stack + conventions + performance) always generates.

**Saver mode recommendation**:
- Move devlog format templates to `.claude/rules/devlog.md` (loaded only when needed, not every call).
- Move "What NOT To Do" to a rules file.
- Trim the conventions section: "Kill by PID" and "background tasks" are already in the global CLAUDE.md.

#### 2. Generated rules files — loaded every API call in target projects

**Source**: `src/main/generators.ts` — `generateRuleFiles()`

Files placed in `.claude/rules/` are auto-loaded by Claude Code on every API call.

| Rule file | Lines | Tokens (~) | When generated |
|-----------|-------|------------|----------------|
| frontend.md | 12-15 | ~80-100 | `rulesSetup` includes 'frontend' |
| ux.md | 18-20 | ~120-140 | `rulesSetup` includes 'ux' |
| python-api.md | 16-18 | ~110-130 | `rulesSetup` includes 'python-api' |
| node-api.md | 12-14 | ~80-100 | `rulesSetup` includes 'node-api' |
| banned-techniques.md | 12-14 | ~60-80 | `rulesSetup` includes 'banned-techniques' |
| go-api.md | 14-16 | ~90-110 | `rulesSetup` includes 'go-api' |
| rust-api.md | 14-16 | ~90-110 | `rulesSetup` includes 'rust-api' |
| game-loop.md | 16-18 | ~100-120 | `rulesSetup` includes 'game-loop' |
| data-pipeline.md | 14-16 | ~80-100 | `rulesSetup` includes 'data-pipeline' |
| mobile.md | 12-14 | ~80-100 | `rulesSetup` includes 'mobile' |
| profiling.md | 30-35 | ~200-250 | `rulesSetup` includes 'profiling' |

**Token cost**: DIRECT — every rules file in `.claude/rules/` is loaded on every API call. A React + Python fullstack project with profiling generates ~4-5 rules files = ~500-700 tokens per call.

**Can be disabled?**: User selects which rules to generate during project setup. No runtime toggle.

**Saver mode recommendation**:
- `banned-techniques.md` starts empty (just template text) — costs ~60 tokens for zero value until populated. Skip generating it until the user adds the first entry.
- `profiling.md` is the largest at ~200-250 tokens. Only needed during perf work. Move to an on-demand agent template or make it conditional.
- `ux.md` has generic principles — could be merged into `frontend.md` to save one file overhead.

#### 3. LLM-suggested conventions — one-time API cost + ongoing context

**Source**: `src/main/ipc-wizard.ts` line ~883 — `analyze-project` handler

During project setup, HAL-O calls `claude-sonnet-4-6` with web search to analyze the project and suggest a tech stack + 3 conventions. This costs:
- **One-time**: ~500-1000 input tokens + ~200-400 output tokens (Sonnet API call)
- **Ongoing**: The 3 generated conventions (~15-30 words each) are embedded in CLAUDE.md's Key Conventions section, costing ~20-40 tokens per Claude Code API call forever.

**Can be disabled?**: No toggle. Conventions are empty (`[]`) if the API call fails or for manual setup.

**Saver mode recommendation**: Allow the user to review and trim conventions before they're written. Add a "conventions: none" option in the wizard.

#### 4. Global CLAUDE.md — loaded every API call across ALL projects

**Source**: `~/.claude/CLAUDE.md` — 132 lines, 9,664 bytes

This file is injected into every Claude Code session on every API call. Breakdown:

| Section | Lines | Tokens (~) | Essential? |
|---------|-------|------------|-----------|
| CLI Responsiveness | 2 | ~30 | YES — prevents blocking |
| Credentials (16 API keys listed) | 18 | ~180 | PARTIAL — most projects use 1-2 keys |
| Telegram Channel Core Rule | 2 | ~40 | YES for Telegram users |
| Telegram Notifications | 6 | ~200 | YES for Telegram users |
| Voice System (full) | 80 | ~900 | PARTIAL — only needed when voice is active |
| Personality Sliders (TARS) | 30 | ~350 | PARTIAL — only needed for voice/personality |
| Zog zog | 6 | ~60 | LOW — fun feature, small cost |
| User Info | 2 | ~15 | YES — timezone is useful |

**Total**: ~1,775 tokens loaded on every API call in every project.

**Can be disabled?**: No. This is the user's global instructions file.

**Saver mode recommendation**:
- The Voice System section (80 lines, ~900 tokens) is the biggest single block. For projects that never use voice, this is pure waste. Move voice instructions to `~/.claude/rules/voice.md` or a conditional include.
- Credentials section lists 16 API keys. Most sessions use 1-2. Trim to just the commonly used ones, or move the full list to a separate file that can be sourced on demand.
- The Personality Sliders section (~350 tokens) could be moved to `~/.claude/rules/personality.md`.
- **Potential savings: ~1,200 tokens/call** (voice + personality + excess credentials) if moved to rules files or conditional includes.

#### 5. Project MEMORY.md — loaded every API call for this project

**Source**: `~/.claude/projects/D--GitHub-hal-o/memory/MEMORY.md` — 183 lines, 13,625 bytes (~3,400 tokens)

This is the largest single context file. It contains:
- Current state, architecture, component map, key decisions
- 3 renderer modes documentation
- Full embedded terminal documentation
- node-pty build patches
- Screen recording commands
- Voice system integration notes
- 46 memory file references

**Token cost**: DIRECT — ~3,400 tokens per API call. This is the single biggest token consumer.

**Can be disabled?**: Not without losing session continuity.

**Saver mode recommendation**:
- Aggressively trim sections that are reference-only (node-pty build patches = ~100 tokens, screen recording = ~50 tokens, voice system Chatterbox details = ~100 tokens). Move to separate memory files that are read on demand.
- The "Key Components" file tree (~400 tokens) is useful but could be shortened — remove inline comments, keep just paths.
- The "Memory File Index" (~200 tokens) lists 25 files with descriptions. Could be shortened to just filenames.
- **Potential savings: ~800-1,000 tokens/call**.

#### 6. Satellite memory files (46 files) — loaded on demand by Claude

**Source**: `~/.claude/projects/D--GitHub-hal-o/memory/*.md` — 1,326 lines total, 74,820 bytes total (~18,700 tokens)

These are NOT loaded every API call. Claude reads them when it encounters a reference in MEMORY.md and decides to look. However:
- Session state files (`project_session2_state.md` = 5,619 bytes, `project_session3_state.md` = 2,118 bytes) are frequently read at session start.
- Many feedback files are small (500-800 bytes) but there are 25+ of them.

**Token cost**: INDIRECT — read on demand. The MEMORY.md index that references them (~200 tokens) is loaded every call.

**Saver mode recommendation**:
- Consolidate related feedback files (e.g., merge all `feedback_telegram_*.md` into one file, all `feedback_voice_*.md` into one file). This reduces the index in MEMORY.md.
- Archive old session state files (`project_session2_state.md`) — they're historical, rarely needed.

#### 7. Generated hooks (settings.json) — indirect token cost

**Source**: `src/main/generators.ts` — `generateHooksSettings()`

Hooks execute shell commands whose output becomes part of Claude's context:

| Hook | Output size | When fired | Token cost |
|------|-------------|------------|-----------|
| SessionStart (startup) | ~10-15 lines | Once per session | ~50-80 tokens |
| SessionStart (resume) | ~5-8 lines | Once per resume | ~30-50 tokens |
| PostToolUse (tsc) | 0-20 lines | Every Edit/Write on .ts/.tsx | 0-100 tokens |
| PostToolUse (pycache) | 1 line | Every Edit/Write on .py | ~5 tokens |
| Notification (permission) | 0 (external curl) | Per permission prompt | 0 |
| Notification (idle) | 0 (external curl) | Per idle | 0 |
| UserPromptSubmit (channel mode) | 0-1 line | Every user message | ~5 tokens |
| PreToolUse (cross-channel block) | 0-1 line | Every Telegram reply attempt | ~10 tokens |
| PreCompact | 2 lines | Before compaction | ~30 tokens |

**Token cost**: INDIRECT — hook output is injected into context. The TSC hook is the most expensive (runs after every TypeScript file edit, can produce 20 lines of errors).

**Can be disabled?**: User selects hooks during project setup. No runtime toggle.

**Saver mode recommendation**:
- The TSC PostToolUse hook can flood context with type errors. Add `| tail -5` to cap output.
- Channel mode hook fires on every single user message — trivial cost (~5 tokens) but adds up over long sessions.

---

### INDIRECT TOKEN COSTS (data that stays in renderer, never reaches Claude context)

#### 8. Project stats polling (git commands every 60s per project)

**Source**: `src/main/ipc-hub.ts` — `getProjectStats()` with 60s cache TTL

Runs 4 parallel git commands per project: `git log -1 --pretty=format:%s`, `git log -1 --pretty=format:%ct`, `git rev-list --count --since="30 days ago" HEAD`, `git ls-files --cached | wc -l`.

**Token cost**: NONE — data goes from main process to renderer via IPC, displayed on ScreenPanel cards. Never enters Claude's context unless a user copies terminal output containing these stats into a prompt.

**Can be disabled?**: Stats are lazy-loaded (only when a ScreenPanel becomes front-facing). Capped at 4 concurrent git processes.

**Saver mode recommendation**: No token savings, but CPU savings: increase cache TTL to 300s for background projects.

#### 9. Terminal activity metering (500ms IPC tick)

**Source**: `src/main/terminal-manager.ts` — 500ms `setInterval` broadcasting `terminal-activity` events

**Token cost**: NONE — IPC event goes to PbrHoloScene, writes to `terminalActivityMap` (a JS Map), read by ScreenPanel's `useFrame` for edge glow animation. Never enters Claude's context.

**Can be disabled?**: Yes — `activityFeedback` setting (toggle in Settings). When disabled, the IPC listener is not registered.

**Saver mode recommendation**: No token savings. Already has "only send when level changes" guard.

#### 10. External session detection (10s polling, PowerShell process queries)

**Source**: `src/renderer/src/components/ProjectHub.tsx` line ~320 — `detectExternalSessions()` every 10s

Calls PowerShell `Get-CimInstance Win32_Process` for 4 process names (node.exe, cmd.exe, pwsh.exe, powershell.exe) with an 8s timeout each.

**Token cost**: NONE — data stays in React state for the absorption UI. Never enters Claude's context.

**Can be disabled?**: Skipped in demo mode. Has visibility guard (`document.hidden`). Has change-detection guard.

**Saver mode recommendation**: No token savings. Could increase interval to 30s to save CPU.

#### 11. Merge conflict detection (10s polling, file existence checks)

**Source**: `src/renderer/src/hooks/useMergeDetection.ts` — `batchCheckMergeState()` every 10s

Checks `.git/MERGE_HEAD` existence for all projects.

**Token cost**: NONE — data stays in React state for merge UI indicators. Never enters Claude's context.

**Can be disabled?**: Skipped in demo mode. Has visibility guard and change-detection guard.

**Saver mode recommendation**: No token savings. Could increase interval to 30s.

#### 12. Voice TTS generation text rewriting

**Source**: Global CLAUDE.md voice instructions

When voice output is triggered, Claude rewrites its response as a spoken-language version. This adds ~50-200 tokens to the output per voice reply. The voice instructions themselves (~900 tokens) are loaded every call regardless.

**Token cost**: DIRECT (output tokens) when voice is used. DIRECT (input tokens for voice instructions) every call.

**Can be disabled?**: Voice output can be toggled in Settings. But the instructions in global CLAUDE.md are always loaded.

**Saver mode recommendation**: Move voice instructions to a conditional rules file, as noted in item 4.

---

### SUMMARY: Token Cost by Feature

| Feature | Cost Type | Tokens/call | Tokens/session (est.) | Disableable? | Saver Recommendation |
|---------|-----------|-------------|----------------------|-------------|---------------------|
| Global CLAUDE.md | Direct input | ~1,775 | ~1,775 * N calls | No | Move voice (~900) + personality (~350) to rules files |
| MEMORY.md | Direct input | ~3,400 | ~3,400 * N calls | No | Trim reference sections, shorten component map |
| MEMORY.md index (46 files) | Direct input | ~200 | ~200 * N calls | No | Consolidate memory files, reduce index |
| Generated CLAUDE.md | Direct input | ~120-550 | ~120-550 * N calls | Partially (minimal mode) | Move devlog templates + "What NOT To Do" to rules |
| Generated rules files | Direct input | ~0-700 | ~0-700 * N calls | Per-file at setup | Skip empty `banned-techniques.md`, move `profiling.md` to on-demand |
| LLM conventions (generate) | Direct one-time | ~1,000 | ~1,000 (once) | No toggle | Add "skip" option |
| LLM conventions (in CLAUDE.md) | Direct input | ~20-40 | ~20-40 * N calls | No | Allow user review/trim |
| SessionStart hook output | Indirect input | ~30-80 | ~30-80 (once) | At setup | OK as-is |
| PostToolUse TSC hook | Indirect input | ~0-100 | ~0-100 * M edits | At setup | Cap output with `tail -5` |
| Channel mode hook | Indirect input | ~5 | ~5 * N calls | At setup | OK — trivial cost |
| Project stats polling | None | 0 | 0 | Lazy (front-facing only) | No token savings |
| Terminal activity metering | None | 0 | 0 | Settings toggle | No token savings |
| External session detection | None | 0 | 0 | Demo mode only | No token savings |
| Merge conflict detection | None | 0 | 0 | Demo mode only | No token savings |
| Voice TTS rewriting | Direct output | ~50-200 | Per voice reply | Settings toggle | Move instructions to conditional file |

### AGGRESSIVE SAVER MODE — Maximum Token Reduction

If a user wanted to minimize token cost per Claude Code API call:

1. **Move voice instructions out of global CLAUDE.md** (-900 tokens/call)
2. **Move personality sliders out of global CLAUDE.md** (-350 tokens/call)
3. **Trim credentials list to top 3 used** (-120 tokens/call)
4. **Trim MEMORY.md** reference sections (-800 tokens/call)
5. **Use minimal CLAUDE.md generation** (-200 tokens/call for target projects)
6. **Skip profiling.md rule** (-200 tokens/call for target projects)
7. **Skip empty banned-techniques.md** (-60 tokens/call for target projects)
8. **Cap TSC hook output** (-50 tokens avg for target projects)

**Total potential savings: ~2,170 tokens/call on global context + ~510 tokens/call on target project context.**

Current estimated context overhead per call: **~5,575 tokens** (global CLAUDE.md + MEMORY.md + MEMORY index).
After aggressive saver: **~3,405 tokens** (39% reduction).

For target projects created by HAL-O: current overhead ~700-1,250 tokens/call from generated files.
After aggressive saver: ~440-540 tokens/call (45-57% reduction).
