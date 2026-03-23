/** 3D layout functions for holographic/PBR renderers.
 * Each function returns position + rotation arrays for screen panels. */

export interface Screen3DPosition {
  position: [number, number, number]
  rotation: [number, number, number]
}

type Layout3DFn = (count: number) => Screen3DPosition[]

/** Single ring — screens evenly spaced around a circle */
function layoutDefault(count: number): Screen3DPosition[] {
  const radius = Math.max(8, count * 0.55)
  const yBase = 0.8
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
  const outerRadius = Math.max(9, count * 0.5)
  const innerRadius = outerRadius * 0.55
  const result: Screen3DPosition[] = []

  // Outer ring
  for (let i = 0; i < outerCount; i++) {
    const angle = (i / outerCount) * Math.PI * 2 - Math.PI / 2
    result.push({
      position: [Math.cos(angle) * outerRadius, 0.8, Math.sin(angle) * outerRadius],
      rotation: [0, -angle + Math.PI / 2, 0],
    })
  }

  // Inner ring (slightly higher, offset rotation)
  for (let i = 0; i < innerCount; i++) {
    const angle = (i / innerCount) * Math.PI * 2 - Math.PI / 2 + Math.PI / innerCount
    result.push({
      position: [Math.cos(angle) * innerRadius, 1.6, Math.sin(angle) * innerRadius],
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
  const baseRadius = Math.max(7, count * 0.35)
  const result: Screen3DPosition[] = []
  let placed = 0

  for (let tier = 0; tier < tiers && placed < count; tier++) {
    const tierCount = Math.min(perTier, count - placed)
    const radius = baseRadius - tier * 1.5
    const y = 0.5 + tier * 2.2
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
  const radius = Math.max(7, count * 0.35)
  const totalRotation = Math.PI * 2 * 1.5 // 1.5 full turns
  const yStart = 3.5
  const yEnd = -0.5

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

// ── Layout Registry ──

export const LAYOUT_3D_FNS: Record<string, Layout3DFn> = {
  'default': layoutDefault,
  'dual-ring': layoutDualRing,
  'stacked-rings': layoutStackedRings,
  'spiral': layoutSpiral,
}

export const LAYOUTS_3D = [
  { id: 'default', label: 'DEFAULT' },
  { id: 'dual-ring', label: 'DUAL RING' },
  { id: 'stacked-rings', label: 'STACKED RINGS' },
  { id: 'spiral', label: 'SPIRAL' },
] as const
