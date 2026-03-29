# Dockview Pane System — Unified Layout Architecture

Status: Design (ready to implement)
Library: dockview v5.1.0 (already in package.json)
Quality Bar: AAA
Est. Implementation: 30–40 hours across 5 sprints

Executive Summary
=================

HAL-O transitions from fixed flex layout to fully composable pane-based system powered by dockview.

Everything becomes a pane:
- 3D Hub Scene
- Terminal Panels
- Debate Chat (streaming agent responses, consensus)
- Stats Dashboard (CPU, GPU, memory, FPS)
- Settings Panel (modal → paned, persistent)
- Git Log
- Future Panes (code editor, docs viewer, etc.)

Key Architecture Win: Dockview's `renderer: 'always'` keeps WebGL canvas alive during drag/dock — no context loss, no flickering.

1. Current vs. Target State
===========================

Current (2026-03-28):
- Fixed flex layout
- HudTopbar (fixed top)
- ProjectHub (flex center) with 3D scene
- TerminalView (flex right) with custom split panes
- SettingsMenu modal overlay (blocks interaction)
- DockPosition enum (manual, limited)

Limitations: Not composable, modal blocks UX, custom split logic, no presets

Target (Dockview-based):
- PanelSceneGroup (center, dockable)
- PanelTerminalGroup (right, dockable, tabbed)
- PanelDebateChatGroup (optional, auto-dock)
- PanelStatsGroup (optional, floating)
- PanelSettingsGroup (optional, hidden)

Advantages: Unlimited panes, settings don't block, debate first-class, presets, WebGL survives

2. Pane Type Registry
====================

Built-in Pane Types:
- scene (PbrHoloScene, always) - WebGL
- terminal (TerminalPanel, always) - xterm.js
- debate-chat (DebateChatPanel, always) - Streams agent responses
- stats (StatsPanel, onVisible) - CPU/GPU/memory/FPS
- settings (SettingsPanel, onVisible) - Replaces modal
- git-log (GitLogPanel, onVisible) - Commit browser
- console (ConsolePanel, onVisible) - JS console

Renderer Policy:
- always: WebGL panes — keep DOM alive
- onVisible: Lighter panes — mount when visible

3. Debate Chat Integration
==========================

DebateChatPanel displays:
- Agent message history (colored cards)
- Streaming indicator (typing animation)
- Consensus badge
- Optional audio controls

Auto-dock on debate start:
- Create floating group at bottom-right
- Text streams via useDebate hook
- User can close, move, resize, pop out
- Persists until closed

4. Stats Panel Integration
=========================

Displays real-time metrics:
- CPU usage (%)
- GPU usage (%)
- Memory (MB used / total)
- FPS (from PBR scene)
- Token usage (total)
- Uptime

Metrics via IPC channels, polled every 2s.

5. Settings Migration (Phase 2)
==============================

Current: Modal (blocks interaction)
Target: Dockable pane

- Can dock or float
- Hidden by default (opt-in)
- Once positioned, saved
- No modal overlay

6. Implementation Plan (5 Sprints, ~34 hours)
=============================================

Sprint 1: Foundation (8h)
- Create paneRegistry.ts
- Create useWorkspace hook
- Create DockLayout.tsx
- Migrate App.tsx
- Verify WebGL survives
- Test: Scene renders, movable, no flashing

Sprint 2: Terminal Integration (6h)
- Migrate TerminalView → dockview
- Create TerminalPane wrapper
- Wire terminal sessions to tabs
- Restore layout on reload
- Test: Drag/split/close/pop out

Sprint 3: Debate + Chat (7h)
- Create DebateChatPanel.tsx
- Integrate useDebate hook
- Auto-dock on debate
- Stream messages + consensus
- Test: Chat streams real-time

Sprint 4: Stats + Settings (5h)
- Create StatsPanel.tsx
- Wire IPC metrics
- Migrate SettingsMenu → SettingsPanel
- Settings hidden by default
- Test: Stats real-time, settings work

Sprint 5: Polish + Persistence (8h)
- Layout presets (Default, Debate, CodeReview)
- "Manage Layouts" UI
- Sci-fi theme CSS
- Keyboard shortcuts (Ctrl+Shift+Arrow)
- Corruption fallback
- TSC + Playwright smoke test
- Test: 60fps with all panes

7. File Changes
===============

New Files:
- src/renderer/src/components/DockLayout.tsx
- src/renderer/src/components/PaneComponentFactory.tsx
- src/renderer/src/components/DebateChatPanel.tsx
- src/renderer/src/components/StatsPanel.tsx
- src/renderer/src/components/SettingsPanel.tsx
- src/renderer/src/registry/paneRegistry.ts
- src/renderer/src/hooks/useWorkspace.ts
- src/renderer/src/types/workspace.ts
- src/renderer/src/styles/dockview-theme.css
- src/renderer/src/styles/dockview-animations.css

Modified Files:
- src/renderer/src/App.tsx
- src/renderer/src/components/HudTopbar.tsx
- src/renderer/src/hooks/useSettings.ts
- src/main/ipc-handlers.ts

Deprecated:
- src/renderer/src/components/TerminalView.tsx

8. Why Dockview (vs. Custom)
===========================

Aspect | Dockview | Custom
-------|----------|--------
WebGL Context | renderer:'always' | Risky rebuild
Nested Groups | Built-in | Custom math
Floating | Native | z-index tracking
Serialize | toJSON/fromJSON | Custom schema
Keyboard Nav | Built-in | Must implement
Maturity | 1000+ stars | Untested
Effort | ~30h | ~60h + bugs

Decision: Use dockview. renderer:'always' saves 10+ hours.

9. Testing Strategy
==================

Playwright Tests:
- Scene WebGL survives pane move
- xterm survives dock ops
- Debate chat auto-docks
- Workspace persists on reload
- Layout corruption fallback

Visual QA:
- Screenshot panes at 3 sizes
- Verify sci-fi theme
- Smooth animations

Performance:
- Target: 60fps scene + stats + debate
- Measure on RTX 5090 + 1440p

10. Summary
===========

Status: Ready to implement
Library: dockview v5.1.0 (MIT)
Hours: ~34h (5 sprints)
Key Win: WebGL survives dock ops
Debate: Auto-dock, stream, consensus
Stats: Real-time CPU/GPU/memory/FPS
Settings: Modal → pane
Persistence: localStorage + file
Quality: AAA (VS Code-tier)

Next: Approve plan, kick off Sprint 1
Timeline: 6 weeks (parallel with other features)

Document Version: 1.0
Last Updated: 2026-03-29
Author: Research Agent (HAL-O)
Status: Ready for implementation review
