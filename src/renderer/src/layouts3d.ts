/** 3D layout functions for holographic/PBR renderers.
 * Each function returns position + rotation arrays for screen panels. */

/** Minimum Y for screen panel centers.
 * Panels are ~1.8 units tall so the bottom edge extends ~0.9 below center.
 * Y >= 1.0 keeps panels fully above the floor plane (Y=0). */
const MIN_PANEL_Y = 1.0

/** Panel dimensions in world units (must match ScreenPanel.tsx PANEL_W/H) */
const PANEL_W = 2.8

/** UX3: Compute minimum radius so panels don't overlap on a ring.
 * Ensures the arc distance between adjacent panel centers >= panelWidth + gap. */
function minRadiusForCount(count: number, gap = 0.6): number {
  if (count <= 1) return 8
  // Arc per panel = (2π × r) / count >= PANEL_W + gap
  // → r >= (PANEL_W + gap) × count / (2π)
  return Math.max(8, ((PANEL_W + gap) * count) / (2 * Math.PI))
}

export interface Screen3DPosition {
  position: [number, number, number]
  rotation: [number, number, number]
}

type Layout3DFn = (count: number) => Screen3DPosition[]

/** Group-aware layout function signature.
 * Takes project count and an array of groupIndex per project (index into sorted group list, -1 = ungrouped). */
export type GroupLayout3DFn = (
  count: number,
  groupIndices: number[],
  groupCount: number,
) => Screen3DPosition[]

/** Single ring — screens evenly spaced around a circle */
function layoutDefault(count: number): Screen3DPosition[] {
  const radius = minRadiusForCount(count)
  const yBase = MIN_PANEL_Y
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    return {
      position: [Math.cos(angle) * radius, yBase, Math.sin(angle) * radius] as [number, number, number],
      rotation: [0, -angle + Math.PI / 2, 0] as [number, number, number],
    }
  })
}

/** Dual ring — outer ring + inner ring for overflow.
 * First ~60% on outer ring, rest on shorter inner ring. */
function layoutDualRing(count: number): Screen3DPosition[] {
  if (count <= 6) return layoutDefault(count)

  const outerCount = Math.ceil(count * 0.6)
  const innerCount = count - outerCount
  const outerRadius = minRadiusForCount(outerCount)
  const innerRadius = minRadiusForCount(innerCount, 0.4)
  const result: Screen3DPosition[] = []

  // Outer ring
  for (let i = 0; i < outerCount; i++) {
    const angle = (i / outerCount) * Math.PI * 2 - Math.PI / 2
    result.push({
      position: [Math.cos(angle) * outerRadius, MIN_PANEL_Y, Math.sin(angle) * outerRadius],
      rotation: [0, -angle + Math.PI / 2, 0],
    })
  }

  // Inner ring (slightly higher, offset rotation)
  for (let i = 0; i < innerCount; i++) {
    const angle = (i / innerCount) * Math.PI * 2 - Math.PI / 2 + Math.PI / innerCount
    result.push({
      position: [Math.cos(angle) * innerRadius, MIN_PANEL_Y + 0.8, Math.sin(angle) * innerRadius],
      rotation: [0, -angle + Math.PI / 2, 0],
    })
  }

  return result
}

/** Stacked rings — 2-3 tiers at different heights */
function layoutStackedRings(count: number): Screen3DPosition[] {
  if (count <= 4) return layoutDefault(count)

  const tiers = count <= 12 ? 2 : 3
  const perTier = Math.ceil(count / tiers)
  const baseRadius = minRadiusForCount(perTier, 0.4)
  const result: Screen3DPosition[] = []
  let placed = 0

  for (let tier = 0; tier < tiers && placed < count; tier++) {
    const tierCount = Math.min(perTier, count - placed)
    const radius = baseRadius - tier * 1.5
    const y = MIN_PANEL_Y + tier * 2.2
    const angleOffset = tier * (Math.PI / (tierCount * 2)) // stagger tiers

    for (let i = 0; i < tierCount; i++) {
      const angle = (i / tierCount) * Math.PI * 2 - Math.PI / 2 + angleOffset
      result.push({
        position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
        rotation: [0, -angle + Math.PI / 2, 0],
      })
      placed++
    }
  }

  return result
}

/** Spiral — screens descend in a helix pattern */
function layoutSpiral(count: number): Screen3DPosition[] {
  const radius = minRadiusForCount(Math.ceil(count / 1.5), 0.3) // spiral wraps 1.5 turns
  const totalRotation = Math.PI * 2 * 1.5 // 1.5 full turns
  const yStart = 3.5
  const yEnd = MIN_PANEL_Y

  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1)
    const angle = -Math.PI / 2 + t * totalRotation
    const y = yStart + t * (yEnd - yStart)
    const r = radius * (1 - t * 0.15) // slightly tighter at bottom

    return {
      position: [Math.cos(angle) * r, y, Math.sin(angle) * r] as [number, number, number],
      rotation: [0, -angle + Math.PI / 2, 0] as [number, number, number],
    }
  })
}

// ── Group-Aware Layouts ──

/** Grouped rings — projects in the same group cluster together on one ring,
 *  separated by angular gaps. Ungrouped projects fill remaining space. */
function layoutGroupedRings(count: number, groupIndices: number[], groupCount: number): Screen3DPosition[] {
  if (count === 0) return []
  // If no groups assigned, fall back to default ring
  if (groupCount === 0 || groupIndices.every((g) => g < 0)) return layoutDefault(count)

  const radius = minRadiusForCount(count)
  const yBase = MIN_PANEL_Y
  const result: Screen3DPosition[] = new Array(count)

  // Bucket projects by group index (-1 = ungrouped)
  const buckets: Map<number, number[]> = new Map()
  for (let i = 0; i < count; i++) {
    const g = groupIndices[i]
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(i)
  }

  // Order: groups first (sorted by group index), then ungrouped
  const orderedBuckets: number[][] = []
  for (let g = 0; g < groupCount; g++) {
    if (buckets.has(g)) orderedBuckets.push(buckets.get(g)!)
  }
  if (buckets.has(-1)) orderedBuckets.push(buckets.get(-1)!)

  // Gap between groups in radians
  const gapAngle = orderedBuckets.length > 1 ? 0.25 : 0
  const totalGap = gapAngle * orderedBuckets.length
  const usableArc = Math.PI * 2 - totalGap
  const anglePerScreen = count > 0 ? usableArc / count : 0

  let currentAngle = -Math.PI / 2

  for (const bucket of orderedBuckets) {
    for (const projIdx of bucket) {
      const angle = currentAngle
      result[projIdx] = {
        position: [Math.cos(angle) * radius, yBase, Math.sin(angle) * radius],
        rotation: [0, -angle + Math.PI / 2, 0],
      }
      currentAngle += anglePerScreen
    }
    currentAngle += gapAngle
  }

  return result
}

/** Stacked groups — each group gets its own vertical ring tier.
 *  Ungrouped projects go on the bottom tier. */
function layoutStackedGroups(count: number, groupIndices: number[], groupCount: number): Screen3DPosition[] {
  if (count === 0) return []
  if (groupCount === 0 || groupIndices.every((g) => g < 0)) return layoutDefault(count)

  const result: Screen3DPosition[] = new Array(count)

  // Bucket projects by group index (-1 = ungrouped)
  const buckets: Map<number, number[]> = new Map()
  for (let i = 0; i < count; i++) {
    const g = groupIndices[i]
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(i)
  }

  // Order tiers: groups first (sorted), ungrouped last
  const tiers: number[][] = []
  for (let g = 0; g < groupCount; g++) {
    if (buckets.has(g)) tiers.push(buckets.get(g)!)
  }
  if (buckets.has(-1)) tiers.push(buckets.get(-1)!)

  const tierCount = tiers.length
  const maxTierSize = Math.max(...tiers.map(t => t.length))
  const baseRadius = minRadiusForCount(maxTierSize, 0.4)

  for (let t = 0; t < tierCount; t++) {
    const tier = tiers[t]
    const tierSize = tier.length
    const radius = baseRadius - t * 1.2
    const y = MIN_PANEL_Y + t * 2.4
    const angleOffset = t * (Math.PI / Math.max(1, tierSize * 2))

    for (let i = 0; i < tierSize; i++) {
      const angle = (i / tierSize) * Math.PI * 2 - Math.PI / 2 + angleOffset
      const projIdx = tier[i]
      result[projIdx] = {
        position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
        rotation: [0, -angle + Math.PI / 2, 0],
      }
    }
  }

  return result
}

// ── Stack Info (A4: overflow compression for large groups) ──

/** Describes overflow stacking when a group exceeds maxVisible panels. */
export interface StackInfo {
  /** Project indices that should be rendered as normal ScreenPanels */
  visibleIndices: Set<number>
  /** Per-group overflow: group index -> { count of hidden projects, stack indicator position/rotation } */
  stacks: Array<{
    groupIndex: number
    hiddenCount: number
    position: [number, number, number]
    rotation: [number, number, number]
  }>
}

/**
 * Compute stack info for group-aware layouts.
 * Groups with more than `maxVisible` projects will show only the first `maxVisible - 1`
 * as normal panels, and the last slot becomes a stack indicator showing "+ N more".
 *
 * @param groupIndices per-project group index array (-1 = ungrouped)
 * @param groupCount total number of distinct groups
 * @param screenPositions positions already computed by the layout function
 * @param maxVisible max panels shown per group before stacking (default 6)
 */
export function computeStackInfo(
  groupIndices: number[],
  groupCount: number,
  screenPositions: Screen3DPosition[],
  maxVisible = 6,
): StackInfo {
  const visibleIndices = new Set<number>()
  const stacks: StackInfo['stacks'] = []

  // Bucket project indices by group
  const buckets = new Map<number, number[]>()
  for (let i = 0; i < groupIndices.length; i++) {
    const g = groupIndices[i]
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(i)
  }

  for (const [gIdx, members] of buckets) {
    if (members.length <= maxVisible) {
      // All visible
      for (const idx of members) visibleIndices.add(idx)
    } else {
      // Show first (maxVisible - 1), stack the rest
      const showCount = maxVisible - 1
      for (let j = 0; j < showCount; j++) {
        visibleIndices.add(members[j])
      }
      const hiddenCount = members.length - showCount
      // Stack indicator takes the position of the last visible slot (the maxVisible-th position)
      const stackSlotIdx = members[showCount] // first hidden project's original position
      const sp = screenPositions[stackSlotIdx]
      if (sp) {
        stacks.push({
          groupIndex: gIdx,
          hiddenCount,
          position: sp.position,
          rotation: sp.rotation,
        })
      }
    }
  }

  return { visibleIndices, stacks }
}

// ── Layout Registry ──

export const LAYOUT_3D_FNS: Record<string, Layout3DFn> = {
  'default': layoutDefault,
  'dual-ring': layoutDualRing,
  'stacked-rings': layoutStackedRings,
  'spiral': layoutSpiral,
}

/** Group-aware layout functions. These take extra params for group data. */
export const GROUP_LAYOUT_3D_FNS: Record<string, GroupLayout3DFn> = {
  'grouped-rings': layoutGroupedRings,
  'stacked-groups': layoutStackedGroups,
}

export const LAYOUTS_3D = [
  { id: 'default', label: 'DEFAULT' },
  { id: 'dual-ring', label: 'DUAL RING' },
  { id: 'stacked-rings', label: 'STACKED RINGS' },
  { id: 'spiral', label: 'SPIRAL' },
  { id: 'grouped-rings', label: 'GROUPED RINGS' },
  { id: 'stacked-groups', label: 'STACKED GROUPS' },
] as const
