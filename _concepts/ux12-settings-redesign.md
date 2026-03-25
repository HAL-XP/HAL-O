# UX12: Full-Screen Video-Game-Style Settings Menu

**Status**: Planned (design approved 9/10)
**Date**: 2026-03-25
**Ambition**: 8-9/10 (breakthrough — best-in-class settings UX for a dev tool)

---

## 1. Current State Audit

### Current Implementation
- `SettingsMenu.tsx` — 375 lines, single monolithic component
- Rendered as a **floating dropdown panel** (260-420px wide, max 80vh tall) via `createPortal` to `document.body`
- Positioned fixed relative to a small gear icon button in `HudTopbar.tsx`
- 10 collapsible accordion sections with search filtering
- All settings applied live (no apply/cancel)
- Props passed through massive interface (92 lines, ~45 individual props)

### Current Sections & Option Count (10 sections, ~47 options)

| # | Section | Options | Controls |
|---|---------|---------|----------|
| 1 | **DISPLAY** | 6 | Renderer (select), Layout (select), 3D Style (select), Hub Font (slider), Terminal Font (slider), Wizard Font (slider) |
| 2 | **GRAPHICS** | 11 | Bloom (toggle), Chromatic Aberr. (toggle), Floor Lines (toggle), Group Trails (toggle), Auto Rotate (toggle), Rotation Speed (slider), Screen Opacity (slider), Particle Density (slider), Render Quality (slider), Sphere Style (select), Particle Hide Dist (slider), Re-detect GPU (button) |
| 3 | **EFFECTS** | 5 | Ship VFX (toggle), Intro Animation (toggle), Activity Feedback (toggle), Save View (button), Reset View (button) |
| 4 | **TERMINAL** | 4 | Terminal Dock (select), Dock Mode (toggle), AI Model (select), Default IDE (select) |
| 5 | **VOICE** | 3 | Voice Output (toggle), Voice Profile (select + preview), Voice Reaction (slider) |
| 6 | **PERSONALITY** | 5 | Humor (slider), Formality (slider), Verbosity (slider), Dramatic (slider), Presets (6 buttons) |
| 7 | **PRESETS** | 2 | Save Preset (input + button), Load/Delete Preset (list) |
| 8 | **SYSTEM** | 2 | Launch on Startup (toggle), Token Budget (3 radio buttons) |
| 9 | **HIDDEN PROJECTS** | 1 | Restore buttons per hidden project |
| 10 | **DEMO MODE** | 8 | Enabled (toggle), Project Cards (slider), Terminal Areas (slider), Min/Max Tabs (sliders), VFX Freq (slider), Demo Text (input), Demo Voice (select + preview) |

**Total**: ~47 individual options across 10 sections.

---

## 2. Proposed Tab Categories (7 tabs)

Reorganize from 10 accordion sections into 7 polished vertical tabs. Each tab should feel like a distinct "page" with breathing room — not a cramped list.

| Tab | Icon | Contains (merged from) | Option Count |
|-----|------|------------------------|--------------|
| **DISPLAY** | Monitor icon | Renderer, Layout, 3D Style, Hub/Term/Wizard font sizes | 6 |
| **GRAPHICS** | GPU/palette icon | Bloom, Chromatic Aberr., Floor Lines, Group Trails, Screen Opacity, Particle Density, Render Quality, Sphere Style, Particle Hide Dist, Re-detect GPU | 10 |
| **SCENE** | Camera icon | Auto Rotate, Rotation Speed, Ship VFX, Intro Animation, Activity Feedback, Save/Reset View | 6 |
| **TERMINAL** | Terminal icon | Terminal Dock, Dock Mode, AI Model, Default IDE | 4 |
| **VOICE & AI** | Mic/waveform icon | Voice Output, Voice Profile + preview, Voice Reaction, Personality (4 sliders + presets), Token Budget | 10 |
| **PRESETS** | Disk/save icon | Save/Load/Delete presets, Record GIF (new) | 2+1 |
| **SYSTEM** | Gear icon | Launch on Startup, Hidden Projects, Demo Mode (all sub-options) | 11 |

**Rationale**:
- Merged EFFECTS into SCENE (camera/animation concerns)
- Merged PERSONALITY into VOICE & AI (both control HAL's behavior)
- Merged HIDDEN PROJECTS and DEMO MODE into SYSTEM (low-frequency admin concerns)
- 7 tabs fits the sweet spot: enough granularity to find things, few enough to scan at a glance

---

## 3. Live Preview Analysis

All settings currently apply immediately via state updates. The 3D scene behind the overlay will naturally reflect changes. Specific live-preview behaviors:

### Instant (already works, scene renders behind overlay)
- Renderer/Layout/3D Style — scene reconfigures
- Bloom, Chromatic Aberration, Floor Lines, Group Trails — post-processing updates
- Screen Opacity, Particle Density, Render Quality — visual density changes
- Sphere Style — sphere morphs
- Auto Rotate, Rotation Speed — orbit behavior
- Ship VFX, Intro Animation — enables/disables effects
- Font sizes — hub text resizes behind overlay

### Needs Attention
- **Theme re-skinning** — the settings overlay itself must read from CSS custom properties (`--primary`, `--text`, `--bg-base`, etc.) and update in real-time when 3D Style changes. Current panel uses hardcoded `rgba(10, 15, 20, 0.95)` background and `rgba(132, 204, 22, 0.2)` border — these MUST become `var(--primary)` etc.
- **Voice preview** — already has play button, works as-is
- **Personality sliders** — no immediate visual feedback (affects AI text responses, not scene). Could add a "sample response" preview that regenerates with current personality settings.

---

## 4. Component Architecture

### New File Structure
```
src/renderer/src/components/
  settings/
    SettingsOverlay.tsx        — Full-screen overlay wrapper (backdrop, animations, layout shell)
    SettingsTabBar.tsx         — Left vertical tab bar with icons + labels
    SettingsPanel.tsx          — Right content area (renders active tab's panel)
    panels/
      DisplayPanel.tsx         — DISPLAY tab content
      GraphicsPanel.tsx        — GRAPHICS tab content
      ScenePanel.tsx           — SCENE tab content
      TerminalPanel.tsx        — TERMINAL tab content
      VoiceAiPanel.tsx         — VOICE & AI tab content
      PresetsPanel.tsx         — PRESETS tab content (includes Record GIF)
      SystemPanel.tsx          — SYSTEM tab content
    primitives/
      SettingsToggle.tsx       — Reusable ON/OFF toggle (extracted from current Toggle)
      SettingsSlider.tsx       — Reusable slider row (extracted from current Slider)
      SettingsSelect.tsx       — Reusable dropdown
      SettingsButton.tsx       — Reusable action button
    SettingsSearch.tsx         — Global search (filters across all tabs, highlights matching tab)
    RecordButton.tsx           — GIF capture UI (record/stop/download)
  SettingsMenu.tsx             — KEPT AS-IS (deprecated wrapper, redirects to new overlay)
```

### Key Decisions

1. **New component, not refactor** — Create `SettingsOverlay.tsx` as the new entry point. Keep `SettingsMenu.tsx` temporarily as a thin wrapper that opens the new overlay (allows gradual migration, no big-bang risk).

2. **Props consolidation** — The current 45-prop interface is unsustainable. The new overlay should consume `useSettings()` directly inside itself (the hook is already available). Only external concerns (demo, hiddenPaths, onUnhide, dockMode) need props.

3. **Open/close via event bus** — Keep the existing `hal-open-settings` CustomEvent pattern. The gear button dispatches the event, `SettingsOverlay` listens. Add ESC key to close.

4. **Tab state** — Store active tab in component state (not localStorage). Always opens on DISPLAY tab. Search field persists across tab switches.

5. **Animation** — CSS `@keyframes` for open (scale 0.95 -> 1.0 + opacity 0 -> 1, 200ms ease-out) and close (reverse, 150ms ease-in). No React transition library needed.

6. **Theme re-skinning** — All overlay CSS must use CSS custom properties. When user changes 3D Style, the CSS variables update (already wired via `ThreeThemeContext`), and the overlay re-skins automatically.

---

## 5. Record / GIF Capture Approach

### Recommended: Electron `capturePage` + GIF Encoder

The app already has `capture-screenshot` IPC (`mainWindow.webContents.capturePage()`). Extend this for multi-frame capture.

**Flow**:
1. User clicks RECORD in Presets tab
2. Settings overlay hides temporarily (or becomes minimized to a floating record indicator)
3. Capture 30 frames over 5 seconds via `capturePage()` at ~6 FPS (low frame count = small file)
4. Encode frames to GIF using `gif.js` (web worker-based, runs in renderer) or `gifenc` (lighter, no worker)
5. Show preview + download/share button

**Why not MediaRecorder API?**
- MediaRecorder + `canvas.captureStream()` would need the Three.js canvas specifically. The R3F canvas is inside an iframe-like structure with EffectComposer — getting a clean stream is fragile.
- `capturePage()` captures the entire window including post-processing, overlays, HUD — exactly what the user sees.
- GIF output is more shareable than WebM (works everywhere, no codec issues).

**Implementation steps**:
1. Add `capture-frame` IPC that returns a `NativeImage` as PNG buffer
2. Collect 30 frames at 167ms intervals (6 FPS, 5 seconds)
3. Encode with `gifenc` (npm package, ~8KB, no dependencies)
4. Resize to 800px width (from 3840 native) for reasonable file size
5. Save to temp + open save dialog, or copy to clipboard

**Estimated GIF size**: ~2-5MB for 5s at 800px width, 6 FPS, 256 colors.

**Alternative: WebM via main process** — Use Electron's `desktopCapturer` API to record a 5s WebM clip. Higher quality but less universally shareable. Could offer both formats.

---

## 6. Implementation Phases

### Phase 1: Overlay Shell + Tab Navigation (1-2 hours)
- Create `SettingsOverlay.tsx` with full-screen backdrop, open/close animation
- Create `SettingsTabBar.tsx` with 7 tabs (icons + labels, active state)
- Wire to `hal-open-settings` event + ESC key close
- Empty panel placeholders per tab
- New CSS file `settings-overlay.css` using only CSS custom properties

### Phase 2: Migrate Options to Tab Panels (2-3 hours)
- Extract `Toggle`, `Slider` into `primitives/`
- Create 7 panel components, moving existing JSX from `SettingsMenu.tsx`
- Consume `useSettings()` directly (eliminate prop drilling)
- Wire all existing functionality (search, presets, voice preview, etc.)
- Verify all 47 options work identically to current

### Phase 3: Visual Polish + Theme Re-skin (1-2 hours)
- Design proper layout: tab bar ~200px, content area fills rest
- Typography hierarchy: tab headers, section labels, option labels, value readouts
- Consistent spacing, alignment, visual rhythm
- Ensure overlay re-skins with `--primary` and palette changes
- Semi-transparent backdrop showing live 3D scene
- Subtle scan-line or noise texture overlay on the panel (sci-fi feel)

### Phase 4: Search Upgrade (30 min)
- Global search field at top of overlay (not per-tab)
- Filters options across ALL tabs
- When search active: highlight matching tabs in tab bar, show combined results
- Clear search on tab click

### Phase 5: Record / GIF Capture (1-2 hours)
- Add `capture-frame` IPC handler
- Create `RecordButton.tsx` with record/stop/preview states
- Integrate `gifenc` for encoding
- Save dialog + clipboard support
- Progress indicator during encoding

### Phase 6: Deprecate Old Panel (30 min)
- Remove old `SettingsMenu.tsx` floating panel code
- Update `HudTopbar.tsx` to use gear button -> event dispatch only
- Clean up old CSS classes

**Total estimated**: 6-10 hours across 6 phases.

---

## 7. Risks & Mitigations

### Performance: Scene Rendering Behind Overlay
- **Risk**: Full 3D scene + bloom + particles rendering while overlay is displayed could drop FPS, especially on lighter GPUs.
- **Mitigation**: The scene already renders continuously (auto-rotate, particles). The overlay is just DOM — no additional GPU cost. The semi-transparent backdrop uses `backdrop-filter: blur()` which has mild GPU cost but is already used in the current panel. If needed, reduce blur radius or switch to opaque dark background with small preview window.

### Performance: GIF Encoding
- **Risk**: Encoding 30 frames at 3840px could freeze the renderer.
- **Mitigation**: Resize frames to 800px before encoding. Use `gifenc` which is synchronous but fast at small sizes (~1-2s for 30 frames at 800px). Run encoding in a web worker if needed. Show progress bar during encode.

### Props Explosion
- **Risk**: Current `SettingsMenu` has 45 props. New overlay consuming `useSettings()` directly eliminates this, but panels still need demo/hidden-projects props.
- **Mitigation**: Use React Context for demo settings (already a hook: `useDemoSettings`). Pass only truly external props (hiddenPaths, onUnhide) via a lightweight `<SettingsProvider>` or keep them as minimal props on the overlay.

### Search Across Tabs
- **Risk**: Current search filters options within visible accordion sections. New tab-based layout means a search term might match options on a non-visible tab.
- **Mitigation**: When search is active, show a flattened "search results" view that pulls matching options from all tabs, with tab-name badges. Clicking a result switches to that tab and scrolls to the option.

### Theme Re-skin Timing
- **Risk**: Changing 3D Style mid-settings could cause a jarring flash as CSS variables update.
- **Mitigation**: CSS transitions on all theme-dependent properties (color, background, border-color) with 300ms duration. The overlay smoothly morphs between themes.

### Backward Compatibility
- **Risk**: `hal-open-settings` event is used by GPU Wizard and other components.
- **Mitigation**: New overlay listens to the same event. No API change needed. Old `SettingsMenu` wrapper can be a thin redirect during migration.

### Accessibility
- **Risk**: Full-screen overlay could trap focus unexpectedly.
- **Mitigation**: Trap focus within overlay when open (standard a11y pattern). ESC key always closes. Tab navigation works within the panel.

---

## 8. Design Reference (Videogame Settings)

Target aesthetic inspiration:
- **Destiny 2 Settings** — vertical category tabs on left, clean option rows on right, dark translucent background
- **Cyberpunk 2077 Settings** — tabbed categories, slider-heavy, live preview description text
- **Halo Infinite** — full-screen overlay with scene visible behind, category navigation
- **Star Citizen** — dense but organized options with search, nested categories

Key visual elements for HAL-O:
- Monospace typography (already using Cascadia Code / Fira Code)
- Thin border lines, not heavy boxes
- Active tab highlighted with accent color glow (left edge bar)
- Option values right-aligned, consistent widths
- Subtle animations on hover/focus (scale 1.02, glow pulse)
- HUD-style decorative elements: thin horizontal rules, small corner brackets, faint grid pattern in background
- Header for each panel with section name in large tracked uppercase

---

## 9. Open Questions

1. **Record output format**: GIF only, or also WebM/MP4? GIF is universal but large. WebM is smaller but needs conversion for some platforms.
2. **Settings import/export**: Should presets be exportable as JSON files (share configs with other users)?
3. **Keyboard navigation**: Should tabs be navigable with arrow keys (up/down to switch tabs, right to enter panel)?
4. **Mobile/small window**: At very small window sizes (<800px), should the overlay switch to a stacked layout (tabs on top)?
