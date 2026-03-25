# UX16: HAL-O Keyboard Navigation System

**Status**: Design complete — ready for implementation review
**Date**: 2026-03-25
**Ambition**: 9/10 (breakthrough — best in class + one invention no other tool has)
**Scope**: Full keyboard navigation from zero to power user — Hub focus zones, terminal switching, card selection, conflict avoidance, discovery system

---

## 1. Current State Audit

### What exists today

| Shortcut | Action | Location |
|----------|--------|----------|
| `F2` | Toggle perf overlay | ProjectHub |
| `Escape` | Exit cinematic mode | ProjectHub (cinematicActive only) |
| `CTRL+SPACE` | Push-to-talk (MicButton) | MicButton / VoiceController |
| `CTRL+SHIFT+T` | Toggle TaskBoard | HudTopbar |
| `CTRL+V` / `CTRL+SHIFT+V` | Paste in terminal | TerminalPanel (xterm intercept) |
| `CTRL+C` | Copy selection in terminal | TerminalPanel (when selection exists) |

**Current keyboard score: 2/10.** Primary actions (open project, switch terminal, search, navigate cards) are 100% mouse-only. There is no focus zone concept — the app has no notion of "hub mode" vs "terminal mode." A user cannot operate HAL-O without a mouse.

**Conflict inventory:**
- `CTRL+SPACE` is taken (push-to-talk)
- `CTRL+V`, `CTRL+C` are intercepted in terminal context
- xterm.js captures ALL key events when the terminal element has DOM focus — no safe way to intercept keys from inside xterm without the custom key handler already in place

---

## 2. Reference Research

### Warp — AI Panel + Terminal Focus
- `CTRL+~` or `CTRL+`` toggles between command input and AI panel
- Focus ring is visually explicit: active pane gets a bright border, inactive panes are visually dimmed
- Tab cycles between blocks within terminal, not between panes
- **Key insight**: Warp uses a visible "mode indicator" in the status bar showing which zone is active. No ambiguity about where keyboard events go.

### iTerm2 — Split Pane Navigation
- `CMD+[` / `CMD+]` cycles between panes
- `CMD+SHIFT+Arrow` moves focus directionally between splits
- `CMD+T` new tab, `CMD+W` close tab, `CMD+1..9` jump to tab N
- `CMD+Shift+D` splits pane horizontally, `CMD+D` splits vertically
- **Key insight**: All split navigation uses CMD-based shortcuts. No conflict with terminal keys because CMD is separate from everything a shell uses.

### tmux/screen — The Prefix Key Pattern
- tmux uses `CTRL+B` as prefix: all navigation is `CTRL+B` + one more key
- `CTRL+B + %` vertical split, `CTRL+B + "` horizontal split
- `CTRL+B + Arrow` focus move between panes
- `CTRL+B + n/p` next/previous window (tab)
- **Key insight**: The prefix completely eliminates key conflicts. No key is "stolen" from the terminal — the prefix acts as a mode switch. The downside: requires two keystrokes per action.

### Vim — Modal Focus Philosophy
- Two modes: INSERT (all keys go to content), NORMAL (all keys are commands)
- `Esc` or `CTRL+[` exits insert mode back to normal
- In normal mode: `h/j/k/l` for navigation, `/` for search, `:` for command
- **Key insight**: HAL-O has an analogous duality — Terminal mode (all keys to PTY) vs Hub mode (keys navigate cards). Vim proves this is learnable. The challenge: `Esc` is used inside terminals (vi mode, shell escape sequences), so it can't be the mode-switch trigger.

### VS Code — Frame Focus Cycling
- `CTRL+`` toggles terminal panel focus
- `CTRL+SHIFT+`` creates a new terminal
- `CTRL+1/2/3` jumps to editor group N
- `CTRL+TAB` cycles through open editors
- `CTRL+P` quick open (fuzzy find files)
- `CTRL+SHIFT+P` command palette
- `CTRL+B` toggles sidebar visibility
- **Key insight**: `CTRL+`` is now universal muscle memory for "go to terminal." HAL-O should respect this. VS Code uses `CTRL+` number keys for numbered navigation — clean and learnable.

### Raycast — Keyboard-First Navigation
- Single trigger key (`CMD+Space`) launches everything
- Arrow keys navigate the result list
- `Enter` executes, `Escape` dismisses
- Every action is accessible from the launcher — no mouse required
- **Key insight**: A single well-placed trigger key unlocks the entire app. Raycast proves that keyboard-first doesn't require complexity — it requires ONE great entry point.

### Star Citizen / EVE Online — HUD Input Modes
- Star Citizen: `F1-F8` switch MFD panels in cockpit, `~` opens console, `TAB` cycles targeting
- EVE Online: `CTRL+TAB` cycles between windows, all windows are keyboard-navigable
- Both games have a "cursor mode" vs "flight mode" — you toggle between HUD interaction and world interaction
- **Key insight**: Games solved this with **explicit mode switching**. The user always knows if they're "in" the HUD or "in" the world. The visual feedback (cursor appearing/disappearing, crosshair changing) makes the mode unambiguous.

### DOOM Eternal — Radial Quick Menu
- Hold `Q` (configurable) to open the equipment/weapon ring
- Release to close it, directional input (analog stick or WASD) to select
- Works in ~0.3s, feels instantaneous with practice
- **Key insight**: Radial menus work for 8-12 items max. HAL-O's FilterBar (6 filters) and layout picker are good candidates for this pattern.

---

## 3. Focus Zone Model

### Two Zones, Crystal Clear

HAL-O has exactly two focus zones:

```
┌─────────────────────────────────────────────────────┐
│  TOPBAR (always interactive — not a focus zone)     │
├─────────────────────────────────────────────────────┤
│                                                      │
│   HUB ZONE                    TERMINAL ZONE         │
│   (3D scene + cards)          (xterm.js panes)      │
│                                                      │
│   Hub mode:                   Terminal mode:        │
│   Arrow = navigate cards      All keys → PTY        │
│   Enter = launch              No keys captured      │
│   / = search                  except CTRL+` escape  │
│   S = settings                                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Rule**: keyboard events belong to whichever zone has DOM focus. The terminal always captures everything except the one designated escape shortcut. The hub captures navigation keys only when the 3D canvas or a hub element has focus.

### Focus Zone Visual Indicators

**Terminal active** (terminal has DOM focus):
- The terminal section border glows with `var(--primary)` at full intensity (currently dimmed when unfocused)
- A small "TERMINAL MODE" badge appears in the top-left of the terminal pane — same aesthetic as the "VOICE TARGET" indicator
- The sphere in the hub dims slightly (opacity 0.7) to visually recede — it's not the interaction target

**Hub active** (hub has DOM focus):
- The 3D scene brightness returns to full
- Selected card gets a tractor-beam pulse (see Section 5)
- A "HUB MODE" badge appears at the bottom of the scene — same scanline aesthetic as HudScrollText
- The cursor changes to `default` (not text cursor)

**No focus / app unfocused**:
- Both zones dim to 0.8 opacity
- "STANDBY" status replaces both badges

---

## 4. The Frame-Switch Shortcut

### Problem
We need to switch between Hub and Terminal with a keyboard shortcut. The constraints:
- `CTRL+`` is VS Code muscle memory for "go to terminal" — we should honor it
- We need bidirectional switching (Hub → Terminal AND Terminal → Hub)
- In Terminal mode, nearly all keys are consumed by the PTY. The shortcut must be something that (a) xterm.js won't eat, and (b) isn't used by common shell programs

### Key Safety Analysis

Keys already intercepted by TerminalPanel's `attachCustomKeyEventHandler`:
- `CTRL+SPACE` — push-to-talk (returns false to xterm)
- `CTRL+V/CTRL+SHIFT+V` — paste (returns false to xterm)
- `CTRL+C` when selection exists — copy (returns false to xterm)

Keys commonly used by shell / vim / tmux inside terminals:
- `CTRL+A`..`CTRL+Z` — most are shell readline shortcuts
- `CTRL+B` — tmux prefix inside nested sessions
- `CTRL+D` — EOF / logout
- `CTRL+C` — interrupt
- `CTRL+Z` — suspend
- `CTRL+L` — clear screen
- `ESC` — vim escape, ANSI sequences, readline vi-mode

**Safe candidates** (rarely used in shells, good ergonomics):
- `CTRL+`` — VS Code muscle memory. Safe inside xterm: shells don't bind backtick with CTRL in any common config. xterm.js does NOT intercept this by default. **This is the winner.**
- `CTRL+SHIFT+]` — alternate, no shell conflicts, awkward finger position
- `ALT+TAB` — OS-level, never safe

### Verdict: `CTRL+`` for all frame switching

```
CTRL+`   →  if terminal focused: switch focus to hub
CTRL+`   →  if hub focused: switch focus to last-active terminal (or open new if none)
CTRL+`   →  if no terminal open: open HAL terminal
```

This matches VS Code's mental model exactly. Users coming from VS Code will try it and it'll work.

### Secondary: `CTRL+SHIFT+`` (new terminal)
Following VS Code convention: `CTRL+SHIFT+`` opens a new terminal for the currently-selected project in Hub mode, or a blank terminal if nothing selected.

---

## 5. Hub Mode Keybindings

### The Navigation Problem in 3D

Cards are arranged in radial/spiral layouts (dual-ring, constellation, DNA helix, etc.) in 3D space around a central sphere. "Arrow key navigation" doesn't map cleanly to a circular layout — pressing `ArrowRight` when cards are in a ring around you is ambiguous.

**Obvious answer (rejected, 4/10)**: Arrow keys navigate a 2D grid projection of the cards. Boring. Breaks completely with non-grid layouts. Doesn't respect the 3D radial nature of HAL-O.

**Best in class + 1 approach**: Orbital navigation.

Cards are sorted by their angular position in screen-space (their projected 2D angle from the center of the viewport). `ArrowLeft`/`ArrowRight` cycle through cards by this angular ordering — moving clockwise or counter-clockwise around the orbital ring. `ArrowUp`/`ArrowDown` switch between rings when the layout has multiple concentric rings (dual-ring, stacked, DNA-helix). This feels completely natural because it matches how the cards are actually arranged visually.

When a card is selected, the camera smoothly rotates to face it (the existing `onCameraMove` mechanism). The card emits a tractor-beam effect (see Section 5 below). This is the exact moment that makes someone stop and say "wait, what?"

### Hub Mode Binding Map

| Key | Action | Notes |
|-----|--------|-------|
| `ArrowLeft` / `ArrowRight` | Cycle cards orbital (counter-clockwise / clockwise) | Computed from screen-space angle |
| `ArrowUp` / `ArrowDown` | Move between rings / stacks | Fallback to prev/next if layout has no rings |
| `Enter` | Launch terminal for selected project | Equivalent to card Resume button |
| `CTRL+Enter` | Open in IDE for selected project | Equivalent to card IDE button |
| `/` | Focus search input | Same as clicking the topbar search |
| `Escape` | Deselect card / clear search if active | Returns camera to default orbit |
| `1..6` | Activate filter N (All, Active, HAL, Git, New, Fav) | Matches FilterBar order |
| `S` | Open Settings | Fires `hal-open-settings` event (already wired) |
| `N` | New project wizard | Same as topbar NEW button |
| `T` | Open TaskBoard | Same as CTRL+SHIFT+T (alias in hub mode only) |
| `F` | Toggle favorite for selected card | |
| `H` | Hide selected project | |
| `?` | Show keyboard shortcut overlay | |
| `CTRL+1..9` | Jump to terminal tab N | When terminal zone exists |
| `CTRL+`` | Switch focus to terminal zone | See Section 4 |

**Safe key analysis for hub mode**: All of the above are window-level keydown listeners that only fire when the Hub zone has DOM focus (not when terminal has focus). No conflicts possible since xterm.js only captures keys when IT has focus.

### Search Integration

When `/` is pressed in hub mode:
1. Focus moves to the topbar search input (already exists)
2. As the user types, cards animate to their search-ranked positions (already implemented — `searchTarget` prop)
3. `ArrowDown` from search input → moves selection to first matching card, hub receives focus
4. `Enter` → launches the focused card
5. `Escape` → clears search, returns to full card list, hub retains focus

This is the Raycast model applied to a 3D card orbit. Nothing else does this.

---

## 6. Terminal Mode Keybindings

### Rule: All keys go to the PTY

When the terminal has DOM focus, ALL key events are forwarded to the PTY by xterm.js. HAL-O must NOT intercept anything that bash/zsh/vim/tmux could plausibly need.

The only exception layer is TerminalPanel's existing `attachCustomKeyEventHandler`, which already handles:
- `CTRL+SPACE` → push-to-talk (pass to window, not xterm)
- `CTRL+V` → paste
- `CTRL+C` with selection → copy

**Additional safe intercepts to add:**

| Key | Action | Why safe |
|-----|--------|----------|
| `CTRL+`` | Switch focus to Hub zone | No shell uses this combination |
| `CTRL+SHIFT+]` | Next terminal tab (backup) | No standard shell binding |
| `CTRL+SHIFT+[` | Previous terminal tab (backup) | No standard shell binding |
| `CTRL+1..9` | Jump to terminal tab N by index | Only when terminal focused, like iTerm2 |

### Tab Switching Within Terminal Zone

Current state: tabs exist in TerminalView panes but have no keyboard navigation.

Proposed additions (all inside `attachCustomKeyEventHandler` in TerminalPanel):

```
CTRL+SHIFT+]   →  next tab in same pane
CTRL+SHIFT+[   →  previous tab in same pane
CTRL+1..9      →  jump to tab N (1-indexed across all panes left-to-right)
CTRL+W         →  close active tab (with confirmation if session is running)
CTRL+T         →  create new tab for same project (or open new project terminal)
```

For `CTRL+W` — this is a conflict risk. `CTRL+W` is used by vim to manage splits, and by some readline configs. Solution: only intercept `CTRL+W` in terminal mode if the xterm `customKeyHandler` detects the terminal is NOT in an active readline/vim mode. In practice: add to the custom handler with a comment that this is a soft intercept — if the user has set `stty` to use CTRL+W, they can remap via keybinding editor (Phase 3).

### Pane Focus Switching

When multiple panes are split side-by-side:

```
CTRL+SHIFT+Arrow   →  move focus to pane in that direction (like iTerm2)
CTRL+SHIFT+P       →  cycle pane focus (next pane)
```

These are safe in terminals. No standard shell uses `CTRL+SHIFT+Arrow` (it's above what most terminal emulators even support at the PTY level).

---

## 7. Card Selection in 3D

### The Tractor Beam

**Obvious answer (rejected, 4/10)**: Put a CSS ring/border around the selected card's HTML overlay. Looks like a web form select box. Does not belong in a sci-fi mission control.

**Best in class + 1: Tractor beam from sphere to card.**

When a card is keyboard-selected (or clicked), a volumetric beam effect appears:
- A thin glowing line extends from the sphere center toward the selected card's center
- The line has animated "data pulse" dots travelling along it (like the HAL pulse ring, but directed)
- The card itself gets a brighter edge glow (already exists — edge emissive strips get emissiveIntensity bumped from current level to 3.5)
- The sphere rotates to "look toward" the selected card (using the existing autoRotate direction logic)
- A subtle scanline effect appears ON the selected card's HTML content (CSS animation, not Three.js)

This is a composition of existing systems:
- The tractor beam line = `THREE.Line` with a `ShaderMaterial` for animated dots (same pattern as HAL pulse rings)
- Edge glow bump = already happens on hover (useFrame in ScreenPanel)
- Sphere orientation = existing auto-rotate system can be given a target angle
- Scanline on card = CSS `@keyframes` already used in HudScrollText

The moment: you press `ArrowRight`, the sphere swivels, a beam locks onto the next card, the camera eases toward it, the card pulses once to confirm selection. It looks like a real targeting system. No other terminal tool does this.

### Selection Persistence

```typescript
// In localStorage
'hal-o-selected-card': string // project path of last-selected card

// Behavior:
// - On hub load: restore last-selected card, apply tractor beam immediately
// - On project deleted: fall back to first visible card in current filter
// - On filter change: select first card in new filter set (not the old card if hidden)
// - Escape: deselect (clear beam, return sphere to auto-rotate)
```

### Keyboard-to-3D Position Mapping Algorithm

```
function getOrbitalOrder(projects: ProjectInfo[], visiblePositions: Map<string, THREE.Vector3>, camera: THREE.Camera): string[] {
  // Project all card positions to screen space
  // Compute angle from screen center for each
  // Sort by angle clockwise starting from 12 o'clock
  // Return sorted array of project paths
}

function selectNextCard(direction: 'left' | 'right' | 'up' | 'down', currentPath: string | null, orderedCards: string[]): string {
  // left/right: cycle the flat orbital list
  // up/down: if multiple rings, move between rings
  //          if single ring, same as left/right (wrap-around)
}
```

This computation happens once per frame in a `useEffect` that responds to camera position changes — the orbital order can shift as you orbit the scene. The current selection stays "attached" to its card (by path), not to a position index.

---

## 8. Shortcut Discovery System

**Obvious answer (rejected, 3/10)**: A `/shortcuts` command that prints a text table. Every tool has this. Nobody reads it.

**Best in class + 1: The HAL-O Tactical Overlay**

Trigger: `?` key in any mode (always intercepted at window level).

Effect:
1. The screen dims to 60% opacity via a full-screen overlay with backdrop blur
2. The overlay uses a radial layout that mirrors the HAL-O card arrangement — shortcuts are displayed near the UI element they control
3. Each shortcut appears as a "data chip" with the HUD aesthetic (cyan border, scanline background, terminal font)
4. The overlay is animated: chips fly in from their associated UI elements using CSS transforms
5. The overlay auto-dismisses when any key is pressed (including `?` again or `Escape`)
6. Context-sensitive: if the terminal has focus when `?` is pressed, only terminal-mode shortcuts appear. If hub has focus, hub shortcuts appear. A toggle at the bottom shows "ALL SHORTCUTS" to see everything.

This is the `?` cheat-sheet pattern from Figma and GitHub, but composed with HAL-O's aesthetic and spatial awareness. It's not a modal — it's an overlay that appears over the live scene, which continues running behind it.

**The moment**: User presses `?` for the first time. The scene dims, glowing data chips appear floating over their corresponding UI controls, the sphere pulses once as if acknowledging the help request, then the chips fade in over 200ms with a stagger animation. It looks like a holographic instruction manual materializing in front of you.

Implementation: a `KeyboardOverlay` React component rendered via `createPortal` to `document.body`, using absolute-positioned chips with computed positions derived from the DOM `getBoundingClientRect()` of each associated UI element.

---

## 9. Conflict Avoidance Matrix

Full conflict analysis for every proposed shortcut:

| Shortcut | Shell safe? | Vim safe? | tmux safe? | xterm.js safe? | Decision |
|----------|------------|-----------|------------|----------------|----------|
| `CTRL+`` | YES — no shell/vim binding | YES | YES (not a tmux key) | YES — not intercepted | **USE IT** |
| `CTRL+SHIFT+]` | YES | YES | YES | YES | Use as backup tab switch |
| `CTRL+SHIFT+[` | YES | YES | YES | YES | Use as backup tab switch |
| `CTRL+1..9` | YES (not POSIX) | YES | YES | YES | Use in terminal mode |
| `ArrowLeft/Right` | YES in hub mode only | YES in hub mode only | N/A (hub) | N/A (hub only) | **USE IN HUB ONLY** |
| `Enter` in hub | YES — hub only | N/A (hub) | N/A (hub) | N/A (hub only) | **SAFE** |
| `/` in hub | YES — hub only | N/A (hub) | N/A (hub) | N/A (hub only) | **SAFE** |
| `S` in hub | YES — hub only | N/A (hub) | N/A (hub) | N/A (hub only) | **SAFE** |
| `?` global | RISK: `?` is used by bash-completion. Intercept only when terminal does NOT have focus | | | | Use **window-level intercept that checks `document.activeElement` is NOT inside xterm** |
| `CTRL+W` in terminal | RISK: vim split command | | | | Soft intercept — document the conflict |
| `CTRL+T` in terminal | LOW RISK: not common in shells | YES | YES | YES | Add with note |
| `CTRL+SHIFT+T` | Already taken (TaskBoard) | N/A | N/A | N/A | Keep existing |

### The Golden Rule

```
Hub mode shortcuts: window.addEventListener('keydown', handler)
  - only fire if document.activeElement is NOT inside .hal-terminal

Terminal mode shortcuts: TerminalPanel.attachCustomKeyEventHandler
  - only fire if e.ctrlKey && specific safe combos
  - return false to prevent xterm from handling, true to pass through

Global shortcuts (always work regardless of focus):
  - CTRL+`   (frame switch)
  - CTRL+SHIFT+T  (TaskBoard)
  - CTRL+SPACE    (push-to-talk)
  - ?   (shortcut overlay) — only when not in xterm
  - F2  (perf overlay)
```

---

## 10. The +1 Innovation: NAVIGATOR MODE

### The Breakthrough Question

Not "how do I add keyboard navigation?" but "what would make a senior dev who uses tmux every day say WAIT WHAT?"

**Iteration 1**: Good keyboard shortcuts, visual focus zones. (7/10 — solid but not surprising)

**Iteration 2**: Orbital card navigation with tractor beam. (8/10 — wow moment for 3D but not for keyboard UX specifically)

**Iteration 3**: Context-aware shortcut overlay with HAL aesthetic. (8/10 — better than most tools, still derivative)

**Iteration 4**: What if the keyboard navigation told you what was happening? Like, HAL actually narrates your navigation. When you press ArrowRight and land on a project, HAL briefly speaks the project name + its status: "NEURAL-LINK. Last active 2 hours ago. 3 pending commits." That's voice + keyboard + 3D composed into one moment.

**Iteration 5 (the +1)**: **NAVIGATOR MODE — a dedicated heads-up navigation overlay** that's exclusive to HAL-O.

When you press `CTRL+SHIFT+N` (or hold `CTRL` for 500ms in hub mode), HAL-O enters **NAVIGATOR MODE**:

1. A transparent radial overlay appears centered on screen — a ring of project icons arranged in the same orbital layout as the 3D scene
2. The 3D scene blurs slightly behind it (CSS `backdrop-filter: blur(4px)`)
3. Arrow keys move a "targeting reticle" around the radial ring (same animation as a game aim assist)
4. As each project is targeted, the corresponding 3D card pulses and the sphere emits a brief beam toward it
5. Simultaneously, HAL whispers a one-line status in TTS: project name + status (overdue commits, active terminal, last modified time)
6. Press `Enter` to launch, `Escape` to cancel, hold a direction to fast-scroll through all projects
7. The entire interaction takes ~2 seconds. Professional. Decisive. Unforgettable.

**This is the Raycast moment for HAL-O**. Nobody using VS Code or Warp has a project-switching experience that uses their voice + their 3D scene + keyboard in a single composed moment.

**HAL-O composition**:
- Radial layout positions: already computed in `layouts3d.ts`
- TTS: already in `window.api.voiceSpeak`
- Beam effect: tractor beam from Section 5
- Backdrop blur: CSS, zero cost
- Navigator ring: `<Html>` R3F component or DOM overlay, both viable

**The moment**: "I hold CTRL, a targeting ring appears around my projects, I nudge the arrow key twice, HAL whispers 'NEURAL-LINK, active 12 minutes ago,' I press Enter, the terminal opens. I never touched the mouse."

---

## 11. Benchmark Ratings

Rating each approach against the 5 benchmarks before finalizing:

### Focus Zone System

| Benchmark | Their approach | HAL-O UX16 | Score |
|-----------|---------------|-----------|-------|
| VS Code | Explicit `CTRL+`` for terminal, status bar shows mode | `CTRL+`` frame switch + TERMINAL/HUB MODE badge + sphere dim | 8/10 |
| Warp | Active pane bright border, inactive dims | Edge glow + sphere dim + mode badge | 8/10 |
| Linear | n/a (not multi-zone) | — | — |
| Figma | No terminal-style zones | — | — |
| Raycast | Single-zone (launcher), no context switching needed | — | — |

**Rating: 8/10** — matches best-in-class (VS Code/iTerm2), adds HAL-O-specific visual feedback (sphere behavior).

### Orbital Card Navigation

| Benchmark | Their approach | HAL-O UX16 | Score |
|-----------|---------------|-----------|-------|
| VS Code | Arrow keys in file tree (linear) | Orbital/angular sort matching 3D layout | 9/10 |
| Warp | No card navigation concept | — | — |
| iTerm2 | Tab navigation (linear) | Linear + ring-aware navigation | 9/10 |
| Star Citizen | `F1-F8` for discrete MFD panels | Smooth orbital scroll with tractor beam | 9/10 |
| EVE Online | Arrow keys in station menu (linear) | Orbital navigation is the improvement | 9/10 |

**Rating: 9/10** — better than every reference by mapping navigation to the actual 3D topology.

### Shortcut Discovery

| Benchmark | Their approach | HAL-O UX16 | Score |
|-----------|---------------|-----------|-------|
| VS Code | `CTRL+SHIFT+P` shows all commands | `?` → Tactical Overlay with spatial chip layout | 9/10 |
| Raycast | Inline hints in results list | — | — |
| Linear | `?` opens shortcuts modal | Tactical Overlay beats this aesthetically | 9/10 |
| Figma | Keyboard shortcuts section in help menu | — | — |
| iTerm2 | Menu bar reference | — | — |

**Rating: 9/10** — Tactical Overlay is aesthetically superior and spatially-aware.

### Navigator Mode (the +1)

No direct equivalent exists in any tool surveyed. Closest comparisons:
- Warp's AI command panel: fast but text-only, not spatial
- Raycast: keyboard-first but flat list, no voice, no 3D
- Star Citizen cockpit MFD: spatial but not for project management, no voice

**Rating: 10/10** — paradigm shift for project switching. This is what a senior dev demos to coworkers.

---

## 12. Implementation Phases

### Phase 1: Foundation (~4 hours)
**Priority**: Unblock — the app is unusable without a mouse right now.

1. Add `CTRL+`` window-level handler in App.tsx that toggles focus between hub and terminal
2. Add TERMINAL MODE / HUB MODE visual badge (simple CSS absolute-positioned div, fades in/out)
3. Add hub-mode arrow key navigation (linear fallback — `ArrowLeft`/`Right` cycles through filtered projects in DOM order)
4. Add `Enter` to launch selected project in hub mode
5. Add `/` to focus search input
6. Add `Escape` to deselect
7. Add `1..6` filter shortcuts
8. Wire `attachCustomKeyEventHandler` to pass `CTRL+`` to window (escape from terminal)

**Deliverable**: Fully keyboard-navigable app. No mouse required for primary flows.

### Phase 2: 3D Integration (~1 day)
**Priority**: The wow moment.

1. Implement orbital sort algorithm (`getOrbitalOrder`) in `PbrHoloScene` or a new `useCardSelection` hook
2. `ArrowLeft`/`Right` cycles by orbital angle in 3D layouts
3. Tractor beam effect: `THREE.Line` from sphere to selected card, animated shader dots
4. Camera ease to selected card on selection
5. Sphere rotates to "look toward" selected card (target angle for AutoRotateManager)
6. Selection persistence in localStorage
7. `CTRL+SHIFT+]`/`[` terminal tab switching in `TerminalView`
8. `CTRL+1..9` jump to terminal tab N

**Deliverable**: The full 3D navigation experience. Demo-able.

### Phase 3: Discovery + Navigator Mode (~2 days)
**Priority**: The 10/10 moment.

1. `?` Tactical Overlay: spatially-positioned shortcut chips, context-sensitive, HAL aesthetic
2. NAVIGATOR MODE (`CTRL+SHIFT+N`): radial selector overlay, TTS whisper on target, tractor beam sync
3. Voice + keyboard fusion: when navigator selects a project, TTS announces status
4. `CTRL+W` close tab (soft, with conflict docs)
5. Keybinding editor (Phase 3 stretch): settings section to remap any shortcut

**Deliverable**: The paradigm-shift experience. This is what goes in the demo video.

---

## 13. Prioritized Gap Table

| Priority | Gap | Proposal | Effort | Score impact |
|----------|-----|---------|--------|-------------|
| 1 | No frame switching | `CTRL+`` hub ↔ terminal | S | 2→8 |
| 2 | Hub: no keyboard nav | Orbital arrow navigation + Enter to launch | M | 2→8 |
| 3 | Hub: no search shortcut | `/` focuses search | S | 3→8 |
| 4 | Terminal: no tab switch | `CTRL+SHIFT+]`/`[`, `CTRL+1..9` | S | 3→8 |
| 5 | No shortcut discovery | `?` Tactical Overlay | M | 1→9 |
| 6 | No visual mode indicator | TERMINAL/HUB MODE badge + sphere dim | S | 1→8 |
| 7 | 3D card selection visual | Tractor beam from sphere | M | 1→9 |
| 8 | No project fast-switch | Navigator Mode (`CTRL+SHIFT+N`) | L | 1→10 |

---

## 14. Technical Notes for Implementation

### Where to register each shortcut

```typescript
// App.tsx — global window-level (both modes)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '`') {
    e.preventDefault()
    toggleFrameFocus()  // new function
  }
  // CTRL+SHIFT+N → Navigator Mode
  if (e.ctrlKey && e.shiftKey && e.key === 'N') {
    e.preventDefault()
    setNavigatorMode(true)
  }
})

// ProjectHub.tsx — hub-only (guard: !isTerminalFocused())
window.addEventListener('keydown', (e) => {
  if (isTerminalFocused()) return  // already exported from TerminalPanel
  switch (e.key) {
    case 'ArrowLeft':  selectPrevCard(); break
    case 'ArrowRight': selectNextCard(); break
    case 'ArrowUp':    selectCardAbove(); break
    case 'ArrowDown':  selectCardBelow(); break
    case 'Enter':      launchSelected(); break
    case '/':          focusSearch(); break
    case 'Escape':     clearSelection(); break
    case 's': case 'S': openSettings(); break
    case '1': activateFilter('all'); break
    // ...etc
    case '?':          setShowKeyboardOverlay(true); break
  }
})

// TerminalPanel.tsx — inside attachCustomKeyEventHandler (already exists)
term.attachCustomKeyEventHandler((e) => {
  if (e.ctrlKey && e.key === '`') {
    // Fire custom event to App.tsx
    window.dispatchEvent(new CustomEvent('hal-focus-hub'))
    return false  // don't let xterm eat it
  }
  // existing: CTRL+SPACE, CTRL+V, CTRL+C
  // new: CTRL+SHIFT+], CTRL+SHIFT+[ for tab navigation
  if (e.ctrlKey && e.shiftKey && e.key === ']') {
    window.dispatchEvent(new CustomEvent('hal-next-tab'))
    return false
  }
  // ...
})
```

### State to add

```typescript
// App.tsx or new useKeyboardNav hook
const [hubFocus, setHubFocus] = useState(true)       // true = hub zone active
const [selectedCardPath, setSelectedCardPath] = useState<string | null>(
  localStorage.getItem('hal-o-selected-card')
)
const [showKeyboardOverlay, setShowKeyboardOverlay] = useState(false)
const [navigatorMode, setNavigatorMode] = useState(false)

// TerminalView.tsx — already has panes state
// Need: expose "jump to tab N" handler via custom event
```

### New component: `KeyboardNav.tsx`

```
src/renderer/src/components/KeyboardNav.tsx
  - Handles all hub-mode keyboard events (guards on isTerminalFocused())
  - Manages selectedCardPath state
  - Provides selectedCardPath via context or prop
  - Renders nothing itself — pure logic component

src/renderer/src/components/KeyboardOverlay.tsx
  - The `?` Tactical Overlay
  - createPortal to document.body
  - Reads DOM positions of UI elements via getBoundingClientRect()
  - Positioned chips with HAL aesthetic

src/renderer/src/components/NavigatorMode.tsx
  - CTRL+SHIFT+N radial overlay
  - Uses project list + layout positions
  - Triggers TTS whisper on target change
  - Tractor beam event dispatch to PbrHoloScene
```

### Tractor beam in PbrHoloScene

```typescript
// New prop: selectedCardPath?: string
// In PbrSceneInner:
// - Maintain a THREE.Line from sphere to selected card position
// - Animated shader: dots travel along the line at ~2 units/s
// - Uses same color as --primary (cyan default)
// - emissive glow at card destination
```

---

## 15. Keyboard Shortcut Reference Card

*This is what the `?` Tactical Overlay shows — the canonical list.*

### Global (always active)

| Key | Action |
|-----|--------|
| `CTRL+`` | Switch between Hub and Terminal |
| `CTRL+SHIFT+N` | Navigator Mode (radial project switcher) |
| `CTRL+SHIFT+T` | Task Board |
| `CTRL+SPACE` | Push-to-talk |
| `F2` | Performance overlay |

### Hub Mode (when 3D scene is focused)

| Key | Action |
|-----|--------|
| `←` `→` | Cycle cards orbitally (clockwise / counter-clockwise) |
| `↑` `↓` | Move between rings / stacks |
| `Enter` | Launch terminal for selected project |
| `CTRL+Enter` | Open selected project in IDE |
| `/` | Focus search |
| `Escape` | Deselect / clear search |
| `S` | Open Settings |
| `N` | New project wizard |
| `T` | Toggle Task Board |
| `F` | Favorite selected project |
| `H` | Hide selected project |
| `1..6` | Filter: All / Active / HAL / Git / New / Fav |
| `?` | Show this overlay |

### Terminal Mode (when terminal is focused)

| Key | Action |
|-----|--------|
| `CTRL+`` | Return focus to Hub |
| `CTRL+SHIFT+]` | Next terminal tab |
| `CTRL+SHIFT+[` | Previous terminal tab |
| `CTRL+1..9` | Jump to terminal tab N |
| `CTRL+T` | New terminal tab |
| `CTRL+W` | Close terminal tab |
| `CTRL+SHIFT+Arrow` | Move focus to adjacent pane |
| `CTRL+V` | Paste |
| `CTRL+C` | Copy selection / interrupt |
| `CTRL+SPACE` | Push-to-talk |
| `?` | (disabled — goes to PTY) |

---

## 16. Ambition Self-Assessment

Running the 5-step process one final time:

**Step 1 — Obvious answer**: Add arrow key navigation to cards and CTRL+` to switch frames. **Rating: 6/10.** Solid but forgettable. Any good developer would ship this.

**Step 2 — Breakthrough question**: What would make a tmux power user say "I'm switching to HAL-O"?

**Step 3 — Experience, not feature**: The experience is: "I navigate my 20 projects without ever looking away from the code or lifting my hand from the keyboard. The sphere tracks my selection. HAL whispers project status as I scan. It feels like piloting a spacecraft."

**Step 4 — Composition**: Voice (TTS status whisper) + orbital 3D navigation + tractor beam selection indicator + CTRL+` frame switching + Navigator Mode. Five existing systems composed into one navigation experience.

**Step 5 — Iteration result**: Navigator Mode is Iteration 5. It takes the obvious answer (arrow keys on cards) and composes it with voice + 3D + spatial targeting into something that has never existed in a developer tool.

**Final self-rating: 9/10.** The orbital navigation + tractor beam alone is 8/10. Navigator Mode with TTS whisper is 9/10. A 10/10 would require real-time contextual AI suggestions as you navigate ("HAL-LINK has 3 failing tests — want to launch there first?") — that's Phase 4 if the team decides to push further.

The system as designed will make a senior developer say "I want that." That's the bar. It clears it.
