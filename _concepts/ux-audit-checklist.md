---
title: HAL-O UX Audit Checklist
version: 1.0
date: 2026-03-25
purpose: Systematic gap detection framework — run before each major release or when something feels "obviously missing"
---

# HAL-O UX Audit Checklist

This checklist exists because "obviously missing" features get shipped without. Run this quarterly or before any public release. Each section scores 1-10. Anything below 7 = flagged gap that needs a "best in class + 1" proposal.

---

## HOW TO SCORE

- **9-10**: Best in class or better. Ship it.
- **7-8**: Good enough. Not a blocker.
- **5-6**: Noticeable absence. Users will feel it eventually.
- **3-4**: Obvious gap. Anyone switching from a competing tool will notice immediately.
- **1-2**: Missing entirely. Embarrassing if pointed out in a review.

Flag everything 6 or below. For each flagged item, produce a "best in class + 1" proposal using the ambition process.

---

## SECTION A — Universal App Patterns (every desktop app must have these)

| # | Pattern | Score | Gap? | Notes |
|---|---------|-------|------|-------|
| A1 | **Keyboard shortcuts** — every primary action reachable without mouse | | | Current: CTRL+SPACE, CTRL+SHIFT+T |
| A2 | **Shortcut discovery** — user can find what shortcuts exist (overlay, tooltip, help page) | | | Current: tooltips only, no dedicated overlay |
| A3 | **Customizable toolbar/topbar** — hide/show/reorder widgets | | | Current: HARDCODED — FLAGGED |
| A4 | **Undo/redo** — at minimum for destructive actions (delete project, close terminal) | | | Current: none visible |
| A5 | **Drag-and-drop** — primary content sortable/movable without menu | | | Current: partial (terminal tabs) |
| A6 | **Global search with preview** — Cmd+K / fuzzy finder style | | | Current: topbar search only |
| A7 | **Theming / dark+light modes** — at least 2 themes, ideally user-defined | | | Current: 6 Three.js themes, no light mode |
| A8 | **Onboarding flow** — guided first-run experience, not blank slate | | | Current: setup screen exists |
| A9 | **Accessible keyboard navigation** — tab order, focus rings, skip links | | | |
| A10 | **Persistent state / crash recovery** — last view restored on reopen | | | Current: localStorage for splits |
| A11 | **Notification system** — in-app toasts for async events | | | Current: Telegram only, no in-app toasts |
| A12 | **Confirmation dialogs** for destructive actions | | | |
| A13 | **Error states** — every async operation has a visible failure state | | | |
| A14 | **Loading states** — spinners, skeletons, progress indicators | | | |
| A15 | **Empty states** — meaningful content when list is empty (not just blank) | | | |

---

## SECTION B — Developer Tool Specifics (JetBrains/VS Code/Warp baseline)

| # | Pattern | Score | Gap? | Notes |
|---|---------|-------|------|-------|
| B1 | **Command palette** — fuzzy search all actions (Cmd+K or Cmd+Shift+P) | | | Current: /hal menu, not visual palette |
| B2 | **Split pane UI** — horizontal + vertical, arbitrary depth | | | Current: drag-to-split terminals |
| B3 | **Configurable panels** — show/hide any panel, drag to reorder | | | Current: nothing configurable |
| B4 | **Status bar** — always-visible system state (git branch, active sessions, CPU, etc.) | | | Current: topbar stats (partial) |
| B5 | **Project-level settings** — per-project config that overrides global | | | Current: CLAUDE.md per project |
| B6 | **Activity log / history** — what happened in this session | | | Current: devlog, not always surfaced |
| B7 | **Quick open** — jump to project/file by typing partial name | | | Current: topbar search is partial |
| B8 | **Breadcrumb / context indicators** — where am I, what's selected | | | |
| B9 | **Side panel** — persistent navigation panel (like VS Code explorer) | | | Current: nothing |
| B10 | **Minimap** — at-a-glance overview of all projects/terminals | | | Current: 3D view serves this role |
| B11 | **Tab management** — open/close/pin/reorder tabs | | | Current: terminal tabs only |
| B12 | **Recent items** — last N projects/files opened | | | |
| B13 | **Workspace layouts** — save and recall full UI arrangements | | | Current: layouts exist for 3D only |
| B14 | **Inline editing** — rename/edit content without opening settings | | | Current: GroupsPanel has rename |
| B15 | **Rich context menus** — right-click everywhere meaningful | | | Current: terminal right-click only |

---

## SECTION C — Sci-Fi / Gaming UX Patterns (HAL-O's unique bar)

| # | Pattern | Score | Gap? | Notes |
|---|---------|-------|------|-------|
| C1 | **HUD customization** — user can reposition, hide, or resize HUD elements | | | Current: NONE — FLAGGED |
| C2 | **Ambient sound / soundscape** — idle audio feedback, not just TTS | | | Current: none |
| C3 | **Alert system** — mission-style alerts with priority levels (critical / warning / info) | | | Current: only Telegram |
| C4 | **Status overlays** — scanline effects, glitch states on errors | | | |
| C5 | **Data visualization** — activity heatmaps, git timeline, commit velocity | | | Current: activity bars in screens |
| C6 | **Boot/shutdown sequence** — theatrical on open/close | | | Current: intro animation |
| C7 | **Notification toasts** — in-scene 3D toasts or 2D HUD notifications | | | Current: NONE — FLAGGED |
| C8 | **Performance meter** — FPS counter, memory, GPU % as optional HUD element | | | |
| C9 | **Achievement / milestone system** — gamified project milestones | | | Current: none |
| C10 | **Ambient reactive state** — colors/effects respond to system state (build running, tests failing) | | | Current: partial (sphere online/offline) |
| C11 | **Mission log** — persistent narrative log of what the AI has done | | | Current: devlog (close) |
| C12 | **Tactical minimap** — zoomable overview of all active operations | | | |
| C13 | **Warp/teleport navigation** — fast-switch between projects with animation | | | Current: camera moves |
| C14 | **Quick command ring** — radial menu triggered on hotkey (DOOM-style weapon wheel) | | | Current: NONE — interesting gap |
| C15 | **Damage indicators** — visual cues when build fails, test breaks, error spikes | | | |

---

## SECTION D — Customization & Power User Features

| # | Pattern | Score | Gap? | Notes |
|---|---------|-------|------|-------|
| D1 | **Toolbar customization** — drag widgets, right-click to hide | | | Current: NONE — FLAGGED |
| D2 | **Resizable panels** — user-controlled panel sizing | | | Current: draggable hub/terminal divider |
| D3 | **Color scheme editor** — custom palette beyond presets | | | Current: 6 presets only |
| D4 | **Font choice** — pick font family per context (hub, terminal, HUD) | | | Current: size only, not family |
| D5 | **Layout save/restore** — named workspace saves | | | Current: none |
| D6 | **Profile system** — multiple user profiles with different settings | | | Current: single settings store |
| D7 | **Plugin/extension system** — user-installable extensions | | | Current: none |
| D8 | **Import/export settings** — portable config file | | | Current: none |
| D9 | **Advanced keybinding editor** — remap any shortcut | | | Current: none |
| D10 | **Scripting hooks** — run user scripts on events (project open, build complete, etc.) | | | |

---

## SECTION E — Performance & Reliability

| # | Pattern | Score | Gap? | Notes |
|---|---------|-------|------|-------|
| E1 | **FPS targeting** — user can cap FPS for battery/performance | | | Current: frameloop='demand' system |
| E2 | **Memory leak detection** — observable memory growth indicators | | | |
| E3 | **Graceful degradation** — app works without GPU/WebGL | | | Current: Classic renderer exists |
| E4 | **Auto-update** — notify user of new releases | | | |
| E5 | **Crash reporting** — optional telemetry for unhandled errors | | | |
| E6 | **Startup time** — app reaches interactive state in <3s | | | |
| E7 | **Large project handling** — 100+ projects without jank | | | Current: demo mode skip for perf |
| E8 | **Background throttling** — reduced rendering when window unfocused | | | |

---

## SECTION F — Accessibility (often the last section filled in, always the first one that embarrasses)

| # | Pattern | Score | Gap? | Notes |
|---|---------|-------|------|-------|
| F1 | **ARIA labels** — screen reader support for primary controls | | | |
| F2 | **Focus management** — keyboard-navigable modals, panels | | | |
| F3 | **Contrast ratios** — WCAG AA on all text | | | Current: sci-fi palette may fail |
| F4 | **Reduce motion** — respects prefers-reduced-motion | | | |
| F5 | **Font size scaling** — base font follows system preference | | | Current: manual size only |
| F6 | **Color-blind mode** — palette variant usable without color | | | |

---

## HIGH-PRIORITY FLAGGED GAPS (any item scoring ≤6 gets an entry here)

Template for each gap:

```
### GAP: [Name]
**Checklist item**: [e.g. A3 — Customizable toolbar]
**Current score**: [1-10]
**Impact**: [Who feels this gap, how often, severity]
**Best-in-class reference**: [App + what they do]
**Best in class + 1 proposal**: [What HAL-O should do, building on the reference but one level higher]
**Implementation phases**: [Phase 1 (2h), Phase 2 (1d), Phase 3 (optional)]
**Effort vs impact**: [High/Med/Low effort, High/Med/Low impact]
```

---

## HOW TO RUN THIS AUDIT

1. Open the checklist. Score every item 1-10 honestly.
2. Mark anything ≤6 as a flagged gap.
3. For each gap, fill out the template above.
4. Sort gaps by (impact × urgency) descending.
5. Take top 3 gaps. Invoke `/critic` for each to get the "best in class + 1" proposal.
6. Add approved proposals to `project_todo_backlog.md`.
7. Run again after each major release cycle.

---

## AUDIT LOG

| Date | Run by | Gaps found | Top priority |
|------|--------|------------|-------------|
| 2026-03-25 | Initial creation — pre-scored | A3, A11, C1, C7, D1 | A3/D1 Customizable Topbar |
