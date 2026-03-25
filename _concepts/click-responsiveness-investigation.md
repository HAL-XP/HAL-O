# Click Responsiveness Investigation
**Date**: 2026-03-25
**Status**: Research complete — fixes not yet applied
**Scope**: All click paths in PBR Holographic renderer and menu system

---

## Executive Summary

Six distinct bugs contribute to click failures. The worst (SEVERITY: HIGH) are two
pointer-events logic errors in `ScreenPanel.tsx` and one stale module-level flag
(`_isUserInteracting`) that can permanently block pointer-events. Several medium-
severity issues compound the problem on focus recovery.

---

## Bug #1 — ScreenPanel: pointerEvents cleared to 'none' by back-face check, never restored on focus recovery
**File**: `src/renderer/src/components/three/ScreenPanel.tsx` lines 486–494
**Severity**: HIGH — most common cause
**Frequency**: Every alt-tab, every renderer switch, happens silently

### What happens
The back-face detection only reruns when `_cameraMovedThisFrame` is true OR
`panelMoving` is true:

```ts
if (!_cameraMovedThisFrame && !panelMoving && wasFrontRef.current !== null) return
```

`_cameraMovedThisFrame` is updated by `updateCameraMovementFlag()` in
`ScreenPanelUpdater.useFrame`. But `_cameraMovedThisFrame` starts `true` on
module load, and `ScreenPanelUpdater` is a scene child — it only runs when the
Canvas is rendering frames. If the tab was hidden (`_sceneThrottled = true`)
or terminal was focused, frames were skipped. When the window regains focus,
`_cameraMovedThisFrame` might be stuck at `false` from the last rendered frame
before throttling started. The back-face check is skipped, and the HTML wrapper
that was set to `pointerEvents: 'none'` (e.g. when the card was briefly
back-facing during auto-rotation) never gets re-evaluated.

The `htmlWrapRef.current.style.pointerEvents` is only written when `isFront !==
wasFrontRef.current` — meaning it is **never re-applied on visibility recovery**
unless the camera actually moved. If the app was alt-tabbed while auto-rotate was
mid-rotation and a card happened to be back-facing at that instant, the card
remains unclickable after returning.

### Fix direction
On focus recovery (`useFocusRecovery.handleFocusGain`), force `_cameraMovedThisFrame = true`
for at least 3 frames so every panel re-evaluates its back-face state. Or, on the
`onRecoveryChange` subscriber already in `InvalidateExporter`, call a new exported
`invalidateAllBackFaceChecks()` function that resets `wasFrontRef` on all panels —
but that requires ref collection. The simpler fix: reset `_cameraMovedThisFrame = true`
from the existing `onRecoveryChange` subscriber in `InvalidateExporter`.

---

## Bug #2 — ScreenPanel: _isUserInteracting timer can keep pointer-events blocked
**File**: `src/renderer/src/components/three/ScreenPanel.tsx` lines 136–146
**Severity**: HIGH — intermittent, hard to reproduce
**Frequency**: After any orbit drag, then immediate click attempt within 200ms

### What happens
`setUserInteracting(false)` starts a 200ms debounce timer:
```ts
_interactionEndTimer = setTimeout(() => { _isUserInteracting = false }, 200)
```

When `_isUserInteracting = true`, the back-face check runs only every 3rd frame
(line 474). More critically, if the window loses focus while `_isUserInteracting`
is still `true` (during a drag), the 200ms timer continues in the background.
When focus is regained, `_isUserInteracting` might already be `false` — but if
a new interaction fires and is then cancelled (e.g. Electron focus steal in the
middle of a drag), the `start` event fired but `end` never fired. `_isUserInteracting`
stays `true` permanently until next drag.

This is an Electron-specific issue: Windows occasionally steals the mouseup event
during focus transitions. OrbitControls fires `start` on pointerdown but `end`
on pointerup — if the BrowserWindow loses focus mid-drag (alt-tab while dragging),
the pointerup goes to the OS, OrbitControls never fires `end`, and
`_isUserInteracting` is stuck `true` forever. Back-face checks run at 33% rate
permanently.

### Fix direction
Add a `pointercancel` listener to the Canvas element (or use
`window.addEventListener('blur', () => setUserInteracting(false))`). Also add a
watchdog: if `_isUserInteracting` has been `true` for more than 2 seconds,
force it false.

---

## Bug #3 — ScreenPanel: dimOpacityRef race — pointer-events blocked at 0.3 boundary
**File**: `src/renderer/src/components/three/ScreenPanel.tsx` lines 411–415, 491–494
**Severity**: MEDIUM — affects search mode and any lerp that passes through 0.3
**Frequency**: Search interactions, any scene loading where screens fade in

### What happens
There are two separate places that write `htmlWrapRef.current.style.pointerEvents`:

**Path A** (dim update, lines 411–415) — runs only when `Math.abs(dimDelta) > 0.005`:
```ts
htmlWrapRef.current.style.pointerEvents = (vis && dimOpacityRef.current > 0.3) ? 'auto' : 'none'
```

**Path B** (back-face detection, lines 491–494) — runs only when camera moved AND
front-state changes:
```ts
htmlWrapRef.current.style.pointerEvents = (isFront && dimOp > 0.3) ? 'auto' : 'none'
```

These two paths can disagree: Path A sets it to `'none'` while `dimOpacityRef`
lerps through 0.3, then the lerp completes and the delta falls below 0.005 —
at which point **neither path runs again**. The pointer-events stays `'none'`
because Path A only fires during active animation, and Path B only fires when
camera moves or front-state changes. If neither condition triggers after the lerp
completes at e.g. 0.31 (which is > 0.3 but too close to the boundary), the element
stays unclickable.

During **scene boot**, `screenOpacity` fades in via `fadeRef.current.screens` lerp
(in `PbrSceneInner.useFrame`). The `screenOpacity` prop on each ScreenPanel updates
from 0 to 1 via the React prop. But `dimOpacityRef` starts at 1 (not at `screenOpacity`).
During Phase 1–2 load, `screenOpacity` is 0, but `dimOpacityRef` is 1, so pointer-
events may be enabled while visually nothing is rendered.

More seriously: when `searchDimmed` becomes `true` and then `false`, the dim lerp
passes through `0.3` during recovery. At dim = 0.29, pointerEvents is set to `'none'`.
It then lerps up to 0.31. The delta is 0.02 which is > 0.005, so Path A fires again
and sets it back to `'auto'`. This case works correctly. But if the lerp overshoots
(never crosses back through the boundary due to frame timing), the final value might
be stuck at 0.28.

### Fix direction
Add a final write after lerp completes (when `dimDelta < 0.005`), re-evaluating
the final `dimOpacityRef.current` value once more. Or simply apply pointer-events
every frame when `isFront` (removing the conditional write optimization for this
specific property).

---

## Bug #4 — Tutorial overlay covers screen during first launch
**File**: `src/renderer/src/components/IntroTutorial.tsx`, rendered via `createPortal`
**File**: `src/renderer/src/App.css` line 4019
**Severity**: MEDIUM — blocks all hub clicks when tutorial is active
**Frequency**: First launch only (unless tutorial is reset)

### What happens
```css
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 99998;
  pointer-events: none; /* overlay itself transparent */
}
```

The overlay itself has `pointer-events: none`, so it should let events through.
The `.tutorial-spotlight` (box-shadow cutout) also has `pointer-events: none`.
However, the box-shadow technique for the spotlight uses:
```css
box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45), ...
```

The 9999px box-shadow creates a visual darkening over the entire screen EXCEPT the
spotlight region. **Box-shadows do not intercept pointer events** — they are purely
visual. So the tutorial overlay does not block clicks from a pointer-events
perspective.

However, if the tutorial is stuck mid-state (e.g. crash during `setStep`), the
`.tutorial-tooltip` has `pointer-events: auto`. Since the tooltip is fixed-position
and may be 380px wide × 180px tall, it blocks a region of the hub. This is expected
behavior but worth noting.

**Actual concern**: The tutorial renders on first launch BEFORE `sceneDismissed` is
true (condition: `tutorialActive && sceneDismissed`). So the tutorial only shows
after the loading overlay clears. This part is correct. No blocking from the tutorial
overlay unless the tooltip coincidentally covers the target card.

---

## Bug #5 — Scene loading overlay: exists in DOM but pointer-events: none — NOT a bug
**File**: `src/renderer/src/App.css` lines 3614–3620
**Severity**: NONE — already handled

```css
.hal-scene-overlay {
  pointer-events: none;
  z-index: 5;
}
```

The overlay always has `pointer-events: none`, so it never blocks clicks. It is also
conditionally rendered (`{!sceneDismissed && ...}`) so it leaves the DOM after 500ms.
However, on theme change or renderer change, `resetSceneReady()` is called which
resets `dismissed = false` and re-renders the overlay. For 500ms after every
renderer/theme switch, the overlay is visible (but click-transparent). Not a bug.

---

## Bug #6 — `_sceneThrottled` setInterval: terminal focus permanently throttles scene
**File**: `src/renderer/src/components/three/PbrHoloScene.tsx` lines 123–127
**Severity**: MEDIUM — causes dropped clicks during heavy terminal output
**Frequency**: Whenever terminal is actively running commands

### What happens
```ts
setInterval(() => { _sceneThrottled = document.hidden || isTerminalFocused() }, 500)
```

When `_sceneThrottled = true`, it is checked by `useFrame` callbacks in various
components that call `if (isSceneThrottled()) return` — but NOT by ScreenPanel's
`useFrame`. So scene throttle doesn't directly block card clicks.

However: `_terminalFocused` is set by `focusin`/`focusout` events on the terminal
container element. When terminal output is running fast (Claude streaming), the
focus check is true, and `_sceneThrottled` is true. The `setInterval` checks at
500ms granularity. If the user clicks back to the hub immediately after a terminal
burst (within 500ms), `_sceneThrottled` is still true from the last check.

The `setInterval` does NOT fire synchronously on `focusout` from the terminal —
it waits up to 500ms. During that window, all `isSceneThrottled()`-gated operations
are suspended. This includes `DataParticles.useFrame`, `HudScrollText.useFrame`, etc.
but NOT the critical ScreenPanel back-face detection.

**The real risk**: On the R3F side, the `frameloop='always'` Canvas keeps rendering.
But if some `useFrame` in the chain is early-returning due to `isSceneThrottled`,
it may be skipping updates that indirectly affect click handling (e.g., activity
bar visibility, edge opacity — but NOT `pointerEvents` directly).

### Fix direction
Replace the polling interval with an event-driven approach: update `_sceneThrottled`
synchronously in the `focusin`/`focusout` handlers in TerminalPanel, and also
listen for `document.visibilitychange`. Remove the 500ms polling interval.

---

## Bug #7 — OrbitControls pointer capture blocks Html overlay clicks (R3F known issue)
**File**: `src/renderer/src/components/three/PbrHoloScene.tsx` lines 2633–2644
**Severity**: MEDIUM — affects first click after orbit stop
**Frequency**: After every orbit drag

### What happens
Three.js `OrbitControls` calls `element.setPointerCapture(pointerId)` on
`pointerdown`. This routes ALL subsequent pointer events to the canvas element
until `pointerup`. If the user clicks quickly after releasing an orbit drag,
OrbitControls may still hold pointer capture.

Additionally, R3F implements its own event system on top of the DOM. When
`makeDefault={true}`, the R3F EventManager intercepts pointer events on the canvas
and distributes them to Three.js objects. React Three Fiber's event system does NOT
dispatch click events to `drei Html` children — it only hits Three.js meshes via
raycasting. Clicks on `Html` content work because drei inserts the HTML elements
OUTSIDE the canvas in the DOM, with CSS transform3d positioning. These elements
receive native DOM events directly.

The problem: OrbitControls `enablePan={false}`, `enableZoom={true}`. Zoom uses
the wheel event (no pointer capture) on desktop. Pan is disabled. Rotation is the
only drag operation. After a rotation drag, OrbitControls fires `end` which calls
`setUserInteracting(false)`, starting the 200ms debounce. During those 200ms,
the canvas still has R3F's event handling active.

When clicking an Html overlay button DURING the debounce period, the click goes
through correctly because Html buttons are outside the canvas in the DOM. However,
if the button's parent `<Html>` component had its `htmlWrapRef.pointerEvents`
set to `'none'` due to Bug #1, no amount of pointer capture changes help.

**Actual verdict**: OrbitControls pointer capture is NOT a direct cause of missed
clicks on Html overlay buttons. The R3F event system only affects Three.js mesh
ray-casting. Html overlay buttons receive native DOM events directly. The orbit
capture concern is a red herring for this specific issue.

---

## Bug #8 — SettingsMenu outside-click: `mousedown` on window may fire BEFORE click
**File**: `src/renderer/src/components/SettingsMenu.tsx` line 244
**Severity**: LOW — rare timing issue
**Frequency**: Rarely (window regain scenarios)

### What happens
```ts
useEffect(() => {
  if (!open) return
  const cl = (e: MouseEvent) => {
    const t = e.target as Node
    if (ref.current?.contains(t) || panelRef.current?.contains(t)) return
    setOpen(false)
  }
  window.addEventListener('mousedown', cl)
  return () => window.removeEventListener('mousedown', cl)
}, [open])
```

The settings panel uses `panelRef` which points to the portal content. The panel is
rendered via `createPortal` to `document.body`. This means `ref.current` (the
settings gear button wrapper) and `panelRef.current` (the panel) are in different
DOM subtrees. The containment check `ref.current?.contains(t)` works correctly.

On Electron Windows, alt-tab back into the app sends a synthetic `mousedown` event
to bring focus back to the Chromium window. If the settings panel was open before
alt-tab and the click target in the new window happens to be outside both refs,
`setOpen(false)` fires. This dismisses the settings panel on the first click after
re-focus. The user sees the panel disappear without their intent.

This is a general Electron Windows focus-click issue: the "activation click" that
brings the window to focus should not also dismiss the panel. Electron does not have
`WM_MOUSEACTIVATE` equivalent in Chromium — the first click after focus does fire
normally and bubbles.

### Fix direction
Add a small timestamp guard: if the click happened within 150ms of window focus
gain (`lastFocusTimestamp()` from `useFocusRecovery`), ignore the dismiss event.

---

## Bug #9 — Electron: first click after re-focus fires and is received, but...
**Severity**: LOW — interaction model issue, not a bug per se
**Note**: This was investigated as a potential cause but is not blocking

Electron on Windows does NOT consume the activation click (unlike native Win32 apps
that call `SetCapture`). The first click after alt-tab DOES fire as a normal DOM
event. This was confirmed by the `useFocusRecovery.ts` approach which only staggered
IPC calls, not pointer events. So Electron focus transition itself does not drop
click events.

However, the `onRecoveryChange` listeners DO perform burst invalidation for 1500ms
(`RECOVERY_DURATION_MS`). During this window, `InvalidateExporter.useFrame` calls
`invalidate()` every frame. This is designed to keep the render loop warm. It does
not affect pointer events.

---

## Bug #10 — `hal-room` onClick calls `onVoiceFocusHub` on every click
**File**: `src/renderer/src/components/ProjectHub.tsx` line 828
**Severity**: LOW — not a blocking issue but may cause side effects

```tsx
<div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub} ...>
```

Every click on the hub (including card buttons, topbar buttons, settings) fires
`onVoiceFocusHub`. In `App.tsx`, this calls `setVoiceFocus('hub')` via
`useTerminalSessions`. This triggers a state update in the parent, which re-renders
`ProjectHub`. Since `ScreenPanel` is wrapped in `React.memo` with `screenPanelAreEqual`,
this re-render is mostly blocked. But `HudTopbar` is NOT memoized and re-renders
on every voiceFocus state change.

This is not a blocking issue but contributes to micro-jank on every hub click.

---

## Summary Table

| # | Description | Severity | Frequency |
|---|-------------|----------|-----------|
| 1 | Back-face `pointerEvents` not re-evaluated on focus recovery | **HIGH** | Every alt-tab |
| 2 | `_isUserInteracting` stuck `true` after Electron focus steal mid-drag | **HIGH** | Occasional |
| 3 | `dimOpacityRef` race at 0.3 threshold leaves `pointerEvents: none` stuck | MEDIUM | Search mode, scene load |
| 4 | Tutorial tooltip blocks small area (expected behavior) | LOW | First launch only |
| 5 | Scene overlay: pointer-events: none — NOT a bug | NONE | N/A |
| 6 | `_sceneThrottled` 500ms polling delay on terminal focus change | MEDIUM | During terminal use |
| 7 | OrbitControls pointer capture vs Html overlay — NOT a real issue | NONE | N/A |
| 8 | SettingsMenu dismissed by Electron activation mousedown | LOW | Alt-tab back while settings open |
| 9 | Electron activation click — NOT a blocking issue | NONE | N/A |
| 10 | `hal-room onClick` causes HudTopbar re-render on every click | LOW | Constant, cosmetic |

---

## Root Cause Ranking (most impactful to fix first)

### Fix 1 (Bug #1 + #2) — Force back-face re-evaluation on focus recovery
In `ScreenPanel.tsx`, after the `isFocusRecovering` hook already installed in
`InvalidateExporter`, additionally reset `_cameraMovedThisFrame = true` and clear
`_isUserInteracting = false` when recovery starts. This costs nothing — the next
frame will rerun all back-face checks and restore pointer-events correctly.

Implementation: Export a `onFocusRecovery()` function from ScreenPanel.tsx, call
it from the existing `onRecoveryChange` subscriber in `InvalidateExporter`.

### Fix 2 (Bug #2 partial) — Watchdog for stuck `_isUserInteracting`
Add `window.addEventListener('blur', () => setUserInteracting(false))` in
`ScreenPanelUpdater.useEffect` to handle mid-drag focus loss.

### Fix 3 (Bug #3) — Re-apply pointer-events after dim lerp settles
After the dim lerp's `Math.abs(dimDelta) <= 0.005` condition, do one final write
of `pointerEvents` based on final `dimOpacityRef.current`. This ensures the settled
value correctly reflects the threshold check.

### Fix 4 (Bug #6) — Event-driven `_sceneThrottled`
In `TerminalPanel.tsx`, have the `focusin`/`focusout` handlers directly update
`_sceneThrottled` via an exported `setSceneThrottled(bool)` function, eliminating
the 500ms polling lag.

### Fix 5 (Bug #8) — Guard SettingsMenu dismiss
In SettingsMenu's `mousedown` handler, check `Date.now() - lastFocusTimestamp() < 150`
and skip dismissal if within the activation window.

---

## Code Pointers

- `ScreenPanel.tsx:474` — back-face skip condition (reset `_cameraMovedThisFrame` here)
- `ScreenPanel.tsx:411–415` — dim path pointer-events write (add settled write)
- `ScreenPanel.tsx:486–494` — back-face pointer-events write (correct)
- `ScreenPanel.tsx:136–146` — `setUserInteracting` debounce (add blur listener)
- `PbrHoloScene.tsx:2662–2680` — `InvalidateExporter` (add `onFocusRecovery()` call here)
- `PbrHoloScene.tsx:123–127` — `_sceneThrottled` setInterval (replace with event-driven)
- `SettingsMenu.tsx:244` — outside-click handler (add timestamp guard)
- `useFocusRecovery.ts:7` — `RECOVERY_DURATION_MS = 1500` (also expose `lastFocusTimestamp`)
