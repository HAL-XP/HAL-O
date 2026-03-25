# UX: Pagination for 100+ Project Cards in the 3D Hub

**Status**: Design complete — ready for implementation review
**Date**: 2026-03-25
**Ambition target**: 8-9/10
**Scope**: Supporting 100+ project cards in the PBR Holographic renderer without visual chaos, with page switching, keyboard nav (UX16) integration, and search across all pages.

---

## 1. Problem Statement

### Current Constraints

The stacked-rings layout in `layouts3d.ts` distributes cards across vertical rings at `y = MIN_PANEL_Y + ring * 3.0`. With `MAX_PER_RING = 12`:

- 12 cards → 1 ring at y=1.0
- 24 cards → 2 rings at y=1.0 and y=4.0
- 36 cards → 3 rings at y=1.0, y=4.0, y=7.0

Camera constraints in `PbrHoloScene.tsx`:
```
minPolarAngle={0.3}        // can't look below equator
maxPolarAngle={Math.PI / 2 - 0.03}  // can't look straight down
maxDistance → roughly 18-22 depending on project count
```

`maxPolarAngle = Math.PI/2 - 0.03 ≈ 1.54 rad` means the camera can look almost straight down at the floor but cannot look up past the equatorial plane. At 30+ cards, the top rings are above the camera horizon — invisible unless `minPolarAngle` is dramatically reduced, which breaks the scene aesthetic.

### Scale of the Problem

| Card Count | Rings Required | Top Ring Y | Camera Reachable? |
|-----------|---------------|-----------|-------------------|
| 12        | 1             | 1.0       | Yes               |
| 24        | 2             | 4.0       | Yes (tilting)     |
| 36        | 3             | 7.0       | Marginal          |
| 48        | 4             | 10.0      | No                |
| 100       | 9             | 25.0      | Completely lost   |

Additionally, at 48+ cards with the current radius formula, panels overlap during auto-rotate — the scene becomes a wall of text. Not a mission control. A dumpster.

---

## 2. The Ambition Process

### Step 1: Rate the Obvious Answer

**Obvious answer**: Add a `currentPage` state variable. Slice the projects array by page. Show page 1 first (projects 1-20), page 2 next (projects 21-40). Add `[<]` / `[>]` buttons in the topbar. When user clicks next, fade out current cards, render new set.

**Honest rating: 4/10.** This is a web list with a cool background. Windows 98 pagination. The user sees "Page 2 of 5" and feels like they're browsing a grocery store website, not operating a sci-fi mission control. The 3D scene is completely wasted — it's just a backdrop for a carousel. Rejected.

### Step 2: The Breakthrough Question

Not "how do I show page 2 in the ring?"

**But: "What does a real mission controller do when they need to see more stations than fit on one screen?"**

They switch to a different tactical view. Different threat sector. Different orbital quadrant. The room doesn't disappear — they are *deployed* to a different operational context. The sphere knows. The room reconfigures around you.

### Step 3: Think in Experiences

The moment: user presses `]` in Hub mode. The current ring of cards doesn't fade like a PowerPoint slide. Instead — the sphere PULSES. All current cards streak outward on radial data-beam lines, dissolving into particles. A new ring assembles from inward streaks, each card arriving in sequence, snapping into orbit. The HUD changes sector indicator: `SECTOR 1 of 4` → `SECTOR 2 of 4`. The sphere's equatorial band changes hue (cyan → amber for sector 2, magenta for sector 3). The camera stays. The world rebuilds around you.

This is the "wait, WHAT?" moment.

### Step 4: Connect Existing Systems

HAL-O already has:
- `dispatchSphereEvent()` — sphere color pulse (success/error/warning)
- `DataParticles` — ambient particle motes that can be intensified
- `SpaceshipFlyby` — geometry-streaking animation proving particle transitions work
- `HudScrollText` — scrolling HUD text on scene edges (can display sector info)
- Sphere colorshift system (UX10) — sphere changes color on demand
- `ScreenPanel` with `searchTarget` animation prop — cards already fly to new positions
- `useFocusZone.ts` (new hook) — hub/terminal focus awareness
- FilterBar — already reduces card set; pagination should compose with it

A + B + C = sector transition: sphere event fires → sphere colorshifts to sector hue → existing cards stream out (scale + velocity → zero, opacity → 0) → new cards stream in on a staggered delay → HudScrollText updates with sector ID.

### Step 5: Iterate — Five Variants

**Variant 1 (4/10)**: Simple pagination, next/prev buttons, cross-fade. Described above. Rejected.

**Variant 2 (6/10)**: "Sectors" concept with a ring that rotates like a physical dial. The orbital ring stays constant, but spinning it reveals different cards like a rotary selector. Problem: at 100 cards they're all crammed in one ring and invisible — it doesn't solve the density issue. Also, rotating the entire ring feels like a camera trick, not a scene reconfiguration.

**Variant 3 (7/10)**: Each page is a complete ring reconfiguration. Transition is a cross-dissolve (opacity 0→1 staggered on new cards). Page indicator is 5 dots in the HUD. Keyboard `[` and `]` change pages. Functional, clean, but the transition is standard. Nothing you haven't seen in a React carousel.

**Variant 4 (8/10)**: "Tactical Sectors" — full rebuild with particle streaking. This is the Step 3 experience above. Cards stream in and out. Sphere event fires. HudScrollText updates. Sector indicator in scene (not topbar dots). This is genuinely cinematic. It exploits every system HAL-O already has. **This is the recommendation**.

**Variant 5 (9/10 — stretch)**: Tactical Sectors + Holographic Mini-Map. A secondary HUD element (small, bottom-left or bottom-right of the 3D scene) shows a top-down orbital diagram: N dots representing N sectors, your current sector highlighted, projects as tiny blips. Think Star Citizen's MOBIGLAS minimap. Hovering over a sector dot shows a tooltip with the project names in that sector. Clicking jumps there. This requires a `<Html>` overlay in R3F — already used in ScreenPanel. The mini-map is purely 2D SVG inside a `<Html>` positioned in world space or screen space. This is the 9/10 version because it makes the pagination **spatial** — you understand where your projects live in the orbital diagram, not just "page 2 of 5."

---

## 3. Recommended Design: Tactical Sectors

### Concept

Projects are organized into **Sectors** — named, numbered orbital configurations. Each sector holds `cardsPerSector` projects (default 16, configurable 8-24). Sectors are numbered 1..N.

This is not pagination. This is **spatial memory**. Projects don't have a page number; they have a sector address: `SECTOR 2 / SLOT 4`. Over time, operators learn "my Python projects are in Sector 2." The sphere changes hue per sector — cyan for sector 1, amber for sector 2, magenta for sector 3, green for sector 4 (cycling for more sectors). The hue cue alone gives instant orientation: amber scene = I'm in Sector 2.

### Sector Assignment Logic

Default automatic assignment:
1. **Sector 1 — Priority**: All Favorites + projects with open terminals + recently active (last 7 days). These are always in Sector 1 regardless of total count.
2. **Sector 2+ — Alphabetical**: Remaining projects sorted alphabetically, split evenly across sectors.
3. **Pinning**: User can pin any project to a specific sector via right-click context menu on the card. Pins persist to localStorage.

### Transition Animation

When navigating to a new sector:

1. `dispatchSphereEvent({ type: 'info', intensity: 0.6 })` — brief white surge on sphere
2. Current cards: CSS/Three.js animation — scale shrinks to 0 + radial velocity outward + opacity fade to 0. Duration: 280ms. Staggered 15ms per card (outermost first).
3. Sphere hue shifts to new sector color (via UX10 colorshift — already implemented).
4. New cards: fly in from center outward, scale grows from 0 to 1 + opacity 0 to 1. Duration: 320ms. Staggered 20ms per card (innermost first). Each card gets a brief emissive edge flash on arrival.
5. `HudScrollText` updates: injects `[ SECTOR 2 ONLINE — 16 TARGETS ACQUIRED ]` into the scroll stream.
6. Sector indicator HUD element updates (see Section 4).

Total transition wall-clock: ~600ms. Feels like a tactical display switching scan sectors. Not a page flip.

### Cards Per Sector Setting

**Settings > Display > Cards per Sector**

- Component: Slider with labeled stops: 8 / 12 / 16 / 20 / 24
- Default: 16
- Label: `CARDS PER SECTOR`
- Sub-label: `Lower = faster sector loads. Higher = fewer sectors to navigate.`
- Persists to `useSettings` (localStorage key: `cardsPerSector`)
- Clamped at 24 — above this, cards begin to overlap at the layout radius even with auto-spread

This intentionally does NOT allow the user to show 100 cards at once. That is by design. Forcing sectors is what keeps the scene readable.

---

## 4. Sector HUD Element

### Design

A compact HUD element fixed in 3D scene space (not topbar) at bottom-center of the viewport, implemented as a `<Html>` element from `@react-three/fiber` with `fullscreen` prop or positioned at a fixed world coordinate.

```
 ◄  SECTOR 2 / 4  ►
 ● ● ○ ○
```

- Dots: filled = occupied sectors, hollow = empty. Active sector dot pulses (the UX10 sonar ring animation in miniature).
- Sector label styled with the same scanline CSS as HudScrollText (monospace, `var(--primary)`, 0.85 opacity).
- Left/right chevrons: clickable, keyboard-navigable. Mouse hover raises opacity to 1.0. Click transitions to prev/next sector.
- When only 1 sector exists, the entire element fades to 0 opacity and does not intercept clicks.

### Stretch: Mini-Map (Variant 5 / 9/10)

A secondary `<Html>` element positioned at world coordinates `[-15, 8, 0]` (left side of scene, at eye level) renders a top-down SVG orbital diagram:

```
      * (S1 = cyan)
   *     *
  * (S2)  *
   *     *
      * (S3)
```

Each sector is a dot on a circle. Dots are colored by sector hue. Your current sector is slightly enlarged with a sonar ring. Blips (tiny `<circle>` elements, 2px) orbit each sector dot representing individual projects. Hovering a sector dot shows a `<title>` tooltip listing the first 5 project names. Clicking navigates to that sector.

This is the same `<Html>` pattern already used inside ScreenPanel for card content. Zero new technology — just a new application of existing patterns.

---

## 5. Keyboard Navigation (UX16 Integration)

UX16 (`ux16-keyboard-navigation.md`) defines orbital card navigation: `ArrowLeft`/`ArrowRight` cycle cards by angular position, `ArrowUp`/`ArrowDown` switch rings. This needs to wrap across sector boundaries:

### Cross-Sector Wrapping

```
ArrowRight at last card in Sector 1
  → auto-advance to Sector 2
  → trigger sector transition animation
  → select first card in Sector 2
```

```
ArrowLeft at first card in Sector 1
  → wrap to last sector (sector N)
  → trigger sector transition animation
  → select last card in sector N
```

This is consistent with how macOS Launchpad works — swiping right on the last page wraps to page 1. The difference: HAL-O's "swipe" is the orbital cinematic rebuild.

### New Sector-Specific Bindings (additive to UX16)

| Key | Action | Context |
|-----|--------|---------|
| `]` | Next sector | Hub mode, no modifier |
| `[` | Previous sector | Hub mode, no modifier |
| `CTRL+1..4` | Jump to sector N directly | Hub mode (up to 4 sectors mapped) |
| `ArrowRight` at last card | Advance to next sector + select first card | UX16 orbital nav, wraps to next sector |
| `ArrowLeft` at first card | Back to prev sector + select last card | UX16 orbital nav, wraps to prev sector |

**Why `[` and `]`**: These keys are the standard bracketing convention (tmux window prev/next is `CTRL+B + [/]`). In hub mode they're completely safe — no conflict with terminal (xterm only captures keys when IT has focus). They're easily discoverable because they visually suggest "previous bracket / next bracket" = previous section / next section.

### Search Across All Sectors

When the user presses `/` to activate search:
- The search is performed against ALL projects in ALL sectors — not just the current sector.
- Results from other sectors are visually differentiated: cards from sector 2+ appear with a sector-color accent on their frame edge (e.g., an amber edge stripe for sector 2 results mixed with sector 1 cyan results).
- If a search result is from a different sector, pressing `Enter` on it auto-transitions to that sector first, then launches.
- The sector indicator shows `SECTOR ? / SEARCH` while search is active.
- Pressing `Escape` from search returns to the pre-search sector.

**Why this matters**: The cardinal sin of multi-page UIs is that users forget things exist on page 2. By searching all sectors and showing cross-sector results in context, HAL-O solves this. The "lost project" problem goes away. Search is a superpower, not a crutch.

---

## 6. Filter Bar Interaction

The existing FilterBar (All, Active, HAL, Git, New, Fav) composes with sectors:

- Filters run FIRST, then the filtered set is paginated into sectors.
- If a filter reduces the set to ≤ cardsPerSector, only 1 sector exists → the sector HUD element hides.
- The "Fav" filter will almost always collapse to 1 sector (users rarely have 16+ favorites).
- When filter is active, sector 1 is always shown first.
- Filter changes reset to sector 1 (no point staying on sector 3 when the set is now 4 cards).

This means **filters are the primary way power users reduce their visible set**. Sectors are for users with many ungrouped projects. The recommended workflow:
1. Use filter first (Active, Fav) to narrow scope.
2. If filtered set still exceeds cardsPerSector, sector navigation activates automatically.
3. Bulk management of all 100 projects → remove all filters → sector nav through all.

---

## 7. Sector Assignment — Priority Rules

Sector assignment runs on `useMemo` from the full filtered/sorted project list.

```typescript
function assignSectors(projects: ProjectInfo[], cardsPerSector: number): ProjectInfo[][] {
  const sectors: ProjectInfo[][] = [[]]  // sector 0 = Sector 1

  // Phase 1: Priority projects → always Sector 1
  const priority = projects.filter(p =>
    p.favorite || p.hasOpenTerminal || isRecentlyActive(p, 7)
  )
  // Phase 2: Remainder sorted alphabetically
  const rest = projects
    .filter(p => !priority.includes(p))
    .sort((a, b) => a.name.localeCompare(b.name))

  const ordered = [...priority, ...rest]

  // Slice into sectors
  for (let i = 0; i < ordered.length; i++) {
    const sectorIdx = Math.floor(i / cardsPerSector)
    if (!sectors[sectorIdx]) sectors[sectorIdx] = []
    sectors[sectorIdx].push(ordered[i])
  }

  return sectors
}
```

Pinned sector overrides applied after initial assignment (project moved to specified sector, others shift).

---

## 8. Implementation Phases

### Phase 1 — Functional Core (~4h)

Minimal working sectors, no animation.

1. Add `cardsPerSector` to `useSettings` (default 16).
2. Add `currentSector` state to `ProjectHub` / `PbrHoloScene`.
3. `assignSectors()` function in a new `useSectors.ts` hook.
4. `PbrHoloScene` renders only `sectors[currentSector]` instead of all projects.
5. Sector HUD element: text-only `SECTOR N / M` with `[<]` `[>]` buttons (no dots, no animation). Positioned as a fixed `<div>` overlay in the topbar area (easiest first).
6. `[` / `]` keyboard bindings in hub mode.
7. Settings slider: Cards per Sector.
8. Search: all-sector search with sector-transition on Enter.

**Acceptance**: 100 cards work, scene is clean, can navigate between sectors, search finds cards across all sectors.

### Phase 2 — Cinematic Transitions (~1d)

1. Stream-out animation: current cards animate scale → 0 + radial velocity + opacity → 0, staggered 15ms each.
2. Stream-in animation: new cards animate from center outward, staggered 20ms each.
3. Sphere event dispatch on sector change (brief white pulse).
4. Sphere hue colorshift per sector (cyan/amber/magenta/green cycling — hook into UX10 colorshift already built).
5. HudScrollText injection: `[ SECTOR N ONLINE — X TARGETS ]`.
6. Sector indicator with dot array + active pulse.
7. Cross-sector arrow-key wrap (UX16 integration).

**Acceptance**: Transition is cinematic, not a page flip. Sphere changes color. HUD text updates. Keyboard arrows wrap between sectors.

### Phase 3 — Mini-Map + Power Features (stretch, ~1.5d)

1. SVG mini-map `<Html>` element: orbital diagram, sector dots colored by hue, project blips, hover tooltips.
2. Sector pinning: right-click card → "Pin to Sector N" context menu item.
3. Sector names: user can rename sectors (double-click sector label in HUD element). Names persist to localStorage.
4. "Quick sector jump" on sector dot click in mini-map.
5. Auto-sector-balance option: when enabled, re-runs `assignSectors()` daily to redistribute evenly (toggle in Settings > Display).

**Acceptance**: Mini-map renders. Pinning works. Sector rename works. The 9/10 experience is complete.

---

## 9. Sector Hue Palette

```
Sector 1: #00f5ff  (cyan   — default HAL-O primary)
Sector 2: #f59e0b  (amber  — distinct, warm contrast)
Sector 3: #c026d3  (magenta/fuchsia — vivid)
Sector 4: #22c55e  (green  — signal/safe)
Sector 5+: cycling HSL hue at 72° increments from cyan
```

The sphere emissive tint, the ScreenPanel edge glow, and the sector indicator dots all adopt the active sector hue. When transitioning, hue lerps over 400ms — the same colorshift timing as UX10.

---

## 10. Settings: Cards per Sector

**Location**: Settings > Display (same section as Screen Opacity slider, Auto-Spin toggle)

```
CARDS PER SECTOR
[ ─────●──── ]  16
  8          24
Lower = fewer cards visible, faster scene loads
Higher = more cards per view, fewer sector switches
```

The slider snaps to: 8, 10, 12, 14, 16, 18, 20, 22, 24.

When the user changes this value, the sector assignment re-runs immediately. If the current sector index exceeds the new sector count, clamp to sector 1. No animation during the settings change — the next manual sector switch will be cinematic.

---

## 11. Score Assessment

### Obvious Answer (pagination buttons, cross-fade): 4/10
- Treats a 3D mission control like a WordPress blog
- Completely ignores existing animation, sphere, particle systems
- The "page" mental model is cognitively wrong for a spatial interface
- No discovery mechanism — projects on page 3 might as well not exist

### Tactical Sectors (Phase 1+2): 8/10
- Spatial mental model: sectors, not pages
- Cinematic transitions using systems HAL-O already has
- Sphere changes color — immediate orientation cue (no need to read the number)
- Search spans all sectors — no "lost project" problem
- Keyboard nav wraps naturally at sector boundary
- Filter bar composes cleanly
- The Priority rule keeps Favorites + Active on Sector 1 — power users rarely leave sector 1

### Tactical Sectors + Mini-Map (Phase 3): 9/10
- Spatial memory built into the UI — you *see* where your projects live
- Sector rename → "I called it CLIENTS" — ownership and personalization
- Project blips on mini-map → instant density scan of each sector
- Nothing else in developer tooling does this
- The closest reference is Star Citizen's MOBIGLAS but that's a game, not a dev tool

**What would reach 10/10**: Voice command integration. "HAL, switch to sector 2." The sphere responds, the transition fires, HAL speaks "Sector 2 online — 14 targets." This requires wiring `[voice]` command parsing to the sector navigation dispatch — technically trivial (one regex in the existing command parser) but requires audio design for the spoken responses. Flagged as a Phase 4 stretch for the Voice agent.

---

## 12. Dependency Map

| Dependency | Status | Notes |
|-----------|--------|-------|
| UX10 sphere colorshift | Implemented | Need to expose `setSectorHue(color)` API |
| UX16 keyboard nav | Designed, not implemented | Sector wrap added as additive extension |
| ScreenPanel `searchTarget` prop | Implemented | Used for search animation — reuse for stream-in |
| `dispatchSphereEvent` | Implemented | Call on every sector change |
| HudScrollText injection API | Needs review | Check if external messages can be injected |
| `<Html>` in R3F | Implemented (used in ScreenPanel) | Mini-map reuses this pattern |
| `useSettings.ts` | Implemented | Add `cardsPerSector` key |
| FilterBar | Implemented | No changes needed — filter runs before sector assignment |

---

## 13. Priority

**Impact**: HIGH — affects every user with more than 16 projects (which is the target power user demographic).

**Urgency**: HIGH — without this, HAL-O cannot be positioned as a tool for real studios or teams with large project portfolios. The 100-card scenario breaks the scene visually in its current state.

**Effort**: Phase 1 = S/M. Phase 2 = M. Phase 3 = L.

**Recommendation**: Implement Phase 1 immediately as an unblocking fix. Schedule Phase 2 in the same session (cinematic transitions are the differentiator that makes this 8/10 instead of 4/10). Phase 3 is a milestone feature.
