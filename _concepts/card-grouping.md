# HAL-O Card Grouping & Filtering System

## Overview
HAL-O displays projects as 3D cards in holographic scenes. Currently, all cards populate a single layout (ring, spiral, grid-wall, etc.). This design adds **preset filters** (top bar buttons) and **visual grouping** to organize projects intelligently across all layouts while maintaining instant performance.

---

## 1. Filter Bar UI

### Location
- **HudTopbar.tsx** — add filter button row to the right of "+ADD PROJECT"
- **Behavior**: clicking a filter button toggles it on/off; only one filter active at a time (radio behavior)
- **Active state**: button highlighted, show badge with match count

### Preset Filters (5 buttons)

| Button | ID | Logic | Icon |
|--------|-----|--------|------|
| **Active Projects** | `filter_active` | Recent git activity (any commit in last 30 days) | ⚡ |
| **Git Projects Only** | `filter_git_only` | projects.json has `gitPath` present | 🌳 |
| **Untracked** | `filter_untracked` | Projects NOT in HAL-O (no `.claude/hal-o.json`); show external sessions | ⚙️ |
| **HAL-Configured** | `filter_hal_configured` | Projects WITH `.claude/hal-o.json` rules file present | ✓ |
| **Favorites** | `filter_favorites` | In `useFavoriteProjects.favoritePaths` set | ⭐ |

### Filter State
- **Storage**: `localStorage['hal-o-active-filter']` — stores filter ID or null (no filter)
- **Hook**: `useActiveFilter()` (new) — returns `{ activeFilterId, setActiveFilterId, visibleProjects, visibleCount }`
- **Reset behavior**: clicking active filter again → clears all filters

### Count Badge
- Display: `(42)` next to button name
- Updates instantly from project scan
- Disappears if count = 0 (but button stays enabled)

---

## 2. Preset Group Definitions

### Group Detection (Auto)
HAL-O detects **4 automatic group types** based on project metadata. Users can also assign custom groups via the existing `useProjectGroups()` hook.

#### Type 1: Activity-Based (Auto)
Detect from git stats (IPC call to `getProjectStats`):
- **Active** — any commit in last 30 days
- **Stale** — no commits in last 90 days
- **Maintenance** — 30–90 days since last commit

Data source: `ProjectInfo.lastCommitTime` (already fetched in hub scan).

#### Type 2: Stack-Based (Auto)
Detect from `ProjectInfo.stack` (detected by import scan):
- **Python** — `stack.includes('Python')`
- **Node.js** — `stack.includes('Node')`
- **React** — `stack.includes('React')`
- **Go** — `stack.includes('Go')`
- **Rust** — `stack.includes('Rust')`
- **Other** — anything else

#### Type 3: Status-Based (Auto)
Detect from project metadata:
- **External** — `isExternal` prop (external Claude session running)
- **Absorbing** — `isAbsorbing` prop (absorption in progress)
- **Outdated** — `rulesOutdated` prop (rules version behind)

#### Type 4: Custom (Manual)
User-assigned groups via existing `useProjectGroups.assignments` (one group per project).

### Group Switching UI
- **SettingsMenu.tsx**: add "Grouping" section below "Renderer" dropdown
- Options:
  - "None" (default — no grouping)
  - "Activity" (Active / Stale / Maintenance)
  - "Stack" (Python / Node / React / Go / Rust / Other)
  - "Status" (External / Absorbing / Outdated)
  - "Custom" (use manual assignments from `useProjectGroups`)

- **Storage**: `localStorage['hal-o-grouping-mode']` — default "None"
- **Hook**: `useGroupingMode()` (new) — returns current mode and computes `groupIndices` array

---

## 3. Group Mapping to Layouts

All layout functions already have signature:
```typescript
type GroupLayout3DFn = (
  count: number,
  groupIndices: number[],
  groupCount: number
) => Screen3DPosition[]
```

Where:
- `groupIndices[i]` = group ID for project i (range 0 to groupCount-1), or -1 if ungrouped
- `groupCount` = total distinct groups

### Current Layout Functions (existing + enhanced)

| Layout | Group Strategy | Description |
|--------|---|---|
| **Default** | Stacked rings (one per group) | Each group on its own vertical ring; ungrouped at bottom |
| **Dual Ring** | Outer/inner split by group count | If 2–3 groups: outer ring = group 0, inner = group 1+ |
| **Stacked Rings** | One per tier | 2–3 tiers total; each group on own tier |
| **Spiral** | Sorted by group then index | Groups cluster together as we descend helix |
| **Grid-Wall** | Rows per group | Each group gets horizontal rows; ungrouped wraps |
| **Hemisphere** | Wedges per group | Split hemisphere by group (360° ÷ groupCount) |
| **Arena** | Rings of groups | Concentric rings: center = group 0, expanding outward |
| **DNA Helix** | Dual helix (2 groups) | If 2+ groups: alternate strands; otherwise single helix |
| **Cascade** | Stepped tiers per group | Each group descends at different rate |
| **Constellation** | Spatial clusters | Group centers as constellations, projects orbit cluster center |

### Implementation Notes
- **If no groups**: all layouts fall back to ungrouped behavior
- **If groupCount > 5**: group smaller groups together or fall back to ungrouped
- **Visually distinct**: groups use color from `ProjectGroup.color` on card edge (already via `ScreenPanel.tsx` prop `groupColor`)

---

## 4. Visual Group Indicators

### Ring Labels (Multi-Ring Layouts)
When using "Stacked Rings", "Default", or "Stacked Groups" layout:
- **Label position**: center of ring at ring's Y + 0.2 units above floor
- **Text**: group name (e.g. "ACTIVE", "PYTHON", "FRONTEND")
- **Font**: 3D text (THREE.TextGeometry) or 2D Html overlay anchored to ring
- **Color**: match group color
- **Opacity**: 0.6 (subtle, doesn't interfere with cards)
- **Visibility**: fade in/out when entering/leaving ring

### Color Bands
On card edges (`ScreenPanel.tsx`):
- Existing prop `groupColor` is already passed and applied to emissive edge color
- Groups automatically color-code cards by group assignment

### Separators (Horizontal Dividers)
For horizontal layouts (Grid-Wall, Cascade):
- Draw thin glowing line between group rows
- Color: match group color, alpha 0.3
- Implements via `LineSegments` in scene graph

### Group Badges (Mini Labels on Cards)
Optional small text label in top-left corner of card:
- Shows abbreviated group name (e.g. "ACT", "PY", "FE")
- Font size: very small (~10px at 2048 resolution)
- Only show if grouping mode is active
- Implement in `ScreenPanel.tsx` as Html overlay

---

## 5. Interaction: Click to Filter by Group

### Behavior
1. **Hover on ring label or group badge** → cursor changes to pointer
2. **Click group label** → activate filter for that group only
   - Equivalent to selecting the group in a "Group Filter" mode
   - Cards NOT in that group fade to ~0.1 opacity
   - Ring labels for other groups fade out
3. **Click active group label again** → clear filter, show all groups again
4. **Right-click on group label** → context menu: "Hide Group" (or bulk-hide all others)

### Implementation
- New filter mode: `filter_group:{groupIndex}` (stored in localStorage alongside active filter)
- `HudTopbar.tsx`: show "×" button to clear group filter
- `PbrHoloScene.tsx`: conditionally apply `searchTarget` + `searchDimmed` props to `ScreenPanel` based on active group filter

---

## 6. Performance Requirements

### Instant Filtering (Client-Side)
- **No IPC calls** during filter/grouping toggle
- **All detection precomputed** on scan (`projects.json` load):
  - Activity status (commit date known)
  - Stack (detected at import)
  - Status (stored in card props)
- **Array operations only**:
  ```typescript
  const visibleProjects = allProjects.filter(p =>
    filterFn(p, groupIndices, groupingMode)
  )
  ```
- **Layout recompute**:
  ```typescript
  const positions = layoutFn(
    visibleProjects.length,
    groupIndices.slice(0, visibleProjects.length),
    groupCount
  )
  ```

### Memory Footprint
- Store `groupIndices: number[]` in memory once (computed at filter change)
- Reuse existing `ProjectInfo` objects (no cloning)
- Group metadata cached in Context

---

## 7. Persistence & Settings

### localStorage Keys
```typescript
// Filter state
'hal-o-active-filter'     // null | 'filter_active' | 'filter_git_only' | 'filter_untracked' | 'filter_hal_configured' | 'filter_favorites'
'hal-o-active-group-filter'  // null | 'filter_group:0' | 'filter_group:1' | ...

// Grouping mode
'hal-o-grouping-mode'     // 'none' | 'activity' | 'stack' | 'status' | 'custom'

// Custom groups (existing)
'hal-o-groups'            // JSON array of ProjectGroup[]
'hal-o-project-groups'    // JSON object { projectPath: groupId }

// Favorites (existing)
'hal-o-favorite-projects' // JSON array of favorite paths

// Hidden projects (existing)
'hal-o-hidden-projects'   // JSON array of hidden paths
```

### Recovery on App Restart
- Load all persistence keys in `ProjectHub.tsx` `useEffect` at mount
- Restore last active filter + grouping mode
- If project list changes, recompute groups

---

## 8. Implementation Plan

### Phase 1: Filter Bar & Hooks (Week 1)
- [ ] Create `useActiveFilter()` hook — returns filtered projects
- [ ] Create `useGroupingMode()` hook — computes groupIndices from mode + metadata
- [ ] Update `HudTopbar.tsx` to render 5 filter buttons + badge counts
- [ ] Wire props through `ProjectHub` → `HudTopbar`

### Phase 2: Grouping Logic & Layouts (Week 1-2)
- [ ] Implement group detection functions:
  - `detectActivity(project, stats)` → 'active' | 'stale' | 'maintenance'
  - `detectStack(project)` → 'python' | 'node' | 'react' | 'go' | 'rust' | 'other'
  - `detectStatus(project)` → list of status flags
- [ ] Implement group ordering: groups sorted by group index, ungrouped last
- [ ] Update `layouts3d.ts` to pass `groupIndices` to layout functions (already signature supports this)
- [ ] Test each layout with multi-group scenarios (2, 3, 5+ groups)

### Phase 3: Visual Indicators (Week 2)
- [ ] Add ring labels (3D text or Html overlay) to `PbrHoloScene.tsx`
- [ ] Add color bands / separators between group rows
- [ ] Add mini group badges to top-left of cards (conditional on grouping mode)

### Phase 4: Group Click & Context Menu (Week 2-3)
- [ ] Implement `ScreenPanel.tsx` label click handler → dispatch group filter
- [ ] Add context menu: "Hide Group", "Favorite All in Group", etc.
- [ ] Add visual feedback: fade non-matching cards when group filter active

### Phase 5: Settings & Polish (Week 3)
- [ ] Add "Grouping" dropdown to `SettingsMenu.tsx`
- [ ] Persist filter + grouping mode to localStorage
- [ ] Add keyboard shortcuts: `1–5` for filters, `G` to cycle grouping modes
- [ ] Edge cases: empty groups, single-group scenarios

---

## 9. Edge Cases & Fallbacks

| Case | Behavior |
|------|----------|
| **No projects match filter** | Show empty scene, message: "No projects match [filter name]" |
| **Grouping mode but count < 3** | Fall back to ungrouped layout (grouping makes no sense) |
| **User changes layout while filtering** | Filter persists, layout recomputes with new geometry |
| **User deletes a group** | Projects in that group become ungrouped; filter auto-clears if that group was active |
| **Custom group + activity group conflict** | Custom group takes precedence (user assignment overrides auto-detection) |
| **New project added during session** | Auto-detect its group, add to layout next refresh |

---

## 10. Future Extensions

- **Nested groups**: grouping by (activity, then stack) — 2-level hierarchy
- **Group renaming**: custom labels for auto-groups (e.g. "My Python Projects" instead of "Python")
- **Bulk operations**: right-click group → "Add all to Favorites", "Hide all", "Assign to IDE", etc.
- **Group search**: search within a filtered group
- **Smart grouping**: ML-based clustering (similar projects together)
- **Animated transitions**: smooth camera pan when group filter changes
- **Multi-select filters**: show intersection of 2+ filter categories
- **Custom sort within groups**: sort projects in each group by name, date, activity, etc.

---

## 11. Data Flow Summary

```
ProjectHub
  ├─ useProjectGroups() → custom assignments
  ├─ useFavoriteProjects() → favorites set
  ├─ useHiddenProjects() → hidden set
  ├─ useActiveFilter() → visibleProjects, count
  └─ useGroupingMode() → groupIndices, groupCount
       │
       ├─ DetectActivity, DetectStack, DetectStatus (from ProjectInfo)
       └─ useProjectGroups.assignments (custom override)

HudTopbar
  ├─ Render 5 filter buttons + badge counts
  ├─ onClick → setActiveFilter → ProjectHub
  └─ Highlight active filter button

PbrHoloScene (or HolographicScene)
  ├─ Call layoutFn(count, groupIndices, groupCount)
  ├─ Render ScreenPanel with groupColor, searchDimmed props
  ├─ Render ring labels, separators (conditional on grouping mode)
  └─ Detect label click → setActiveGroupFilter

ScreenPanel
  ├─ Render group badge (conditional)
  ├─ Apply groupColor to edge glow
  ├─ Handle click on badge → filter by group
  └─ Lerp to searchTarget if filtered
```

---

## 12. UI Mockup (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│  HAL-O    + ADD PROJECT   ⚡ ACTIVE(24)  🌳 GIT(18)  ⚙️  UNTRACKED(5)  │
│            ✓ HAL-CONFIG(12)  ⭐ FAVORITES(7)                        │
└─────────────────────────────────────────────────────────────────────┘

    [Scene View]

    Ring Labels (when grouped by "Activity"):
         "ACTIVE"
    ┌─────────────────────────┐
    │   [proj1]   [proj2]     │  ← outer ring, yellow-edge cards
    │ [proj3]   [proj4]       │
    └─────────────────────────┘

    ────────────── group separator ──────────

         "STALE"
    ┌─────────────┐
    │ [proj5]     │  ← inner ring, orange-edge cards
    └─────────────┘

[Bottom Settings Panel]
Layout: Default ▼
Grouping: Activity ▼     ← NEW DROPDOWN
Renderer: PBR Holo ▼
```

