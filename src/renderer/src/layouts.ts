// Layout positioning functions — each returns {left, top} for a card given its index

interface CardPosition {
  left: number
  top: number
  transform?: string
}

interface LayoutContext {
  w: number       // container width
  h: number       // container height
  total: number   // total cards
  cardW: number   // card width (~220)
}

type LayoutFn = (index: number, ctx: LayoutContext) => CardPosition

// ── Dual Arc ──
const dualArc: LayoutFn = (index, { w, h, total, cardW }) => {
  const cx = w / 2
  const cy = h * 0.5
  const baseRadius = Math.min(h * 0.35, w * 0.3, 350)

  // When many projects, split into outer + inner rings to avoid overlap
  if (total > 16) {
    const outerCount = Math.ceil(total * 0.6)
    const isOuter = index < outerCount
    const ringTotal = isOuter ? outerCount : total - outerCount
    const ringIndex = isOuter ? index : index - outerCount
    const radius = isOuter ? baseRadius : baseRadius * 0.6
    const half = Math.ceil(ringTotal / 2)
    const isLeft = ringIndex < half
    const i = isLeft ? ringIndex : ringIndex - half
    const count = isLeft ? half : ringTotal - half
    const startAngle = isLeft ? Math.PI * 0.6 : -Math.PI * 0.4
    const endAngle = isLeft ? Math.PI * 1.4 : Math.PI * 0.4
    const t = count <= 1 ? 0.5 : i / (count - 1)
    const angle = startAngle + t * (endAngle - startAngle)
    const px = cx + Math.cos(angle) * radius
    const py = cy + Math.sin(angle) * radius
    return {
      left: isLeft ? px - cardW - 15 : px + 15,
      top: py - 20,
    }
  }

  const radius = baseRadius
  const half = Math.ceil(total / 2)
  const isLeft = index < half
  const i = isLeft ? index : index - half
  const count = isLeft ? half : total - half
  const startAngle = isLeft ? Math.PI * 0.6 : -Math.PI * 0.4
  const endAngle = isLeft ? Math.PI * 1.4 : Math.PI * 0.4
  const t = count <= 1 ? 0.5 : i / (count - 1)
  const angle = startAngle + t * (endAngle - startAngle)
  const px = cx + Math.cos(angle) * radius
  const py = cy + Math.sin(angle) * radius
  return {
    left: isLeft ? px - cardW - 15 : px + 15,
    top: py - 20,
  }
}

// ── Dual Arc 3D ──
const dualArc3d: LayoutFn = (index, ctx) => {
  const pos = dualArc(index, ctx)
  const isLeft = index < Math.ceil(ctx.total / 2)
  const depth = Math.abs(index - ctx.total / 2) / ctx.total
  return {
    ...pos,
    transform: `perspective(600px) rotateY(${isLeft ? 6 - depth * 4 : -6 + depth * 4}deg) rotateX(${-2 + depth * 3}deg)`,
  }
}

// ── JARVIS Radial ──
const jarvisRadial: LayoutFn = (index, { w, h, total, cardW }) => {
  const cx = w / 2
  const cy = h * 0.5
  const baseRadius = Math.min(h * 0.38, w * 0.35, 380)

  // Max cards per ring before they overlap (approximate: circumference / cardWidth)
  const maxPerRing = Math.max(8, Math.floor((2 * Math.PI * baseRadius) / (cardW + 20)))
  if (total > maxPerRing) {
    const ringCount = Math.ceil(total / maxPerRing)
    let remaining = total
    let offset = 0
    for (let ring = 0; ring < ringCount; ring++) {
      const ringSize = ring < ringCount - 1 ? maxPerRing : remaining
      if (index < offset + ringSize) {
        const i = index - offset
        const radius = baseRadius - ring * (baseRadius * 0.3 / ringCount)
        const angle = (i / ringSize) * Math.PI * 2 - Math.PI / 2
        const px = cx + Math.cos(angle) * radius
        const py = cy + Math.sin(angle) * radius
        return {
          left: px - cardW / 2,
          top: py - 18,
          transform: `rotateY(${Math.cos(angle) * 5}deg)`,
        }
      }
      offset += ringSize
      remaining -= ringSize
    }
  }

  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  const px = cx + Math.cos(angle) * baseRadius
  const py = cy + Math.sin(angle) * baseRadius
  return {
    left: px - cardW / 2,
    top: py - 18,
    transform: `rotateY(${Math.cos(angle) * 5}deg)`,
  }
}

// ── JARVIS Scattered Panels ──
const jarvisPanels: LayoutFn = (index, { w, h, total }) => {
  // Golden ratio spiral for pleasing scatter
  const golden = 1.618033988749
  const angle = index * golden * Math.PI * 2
  const r = 80 + Math.sqrt(index / total) * Math.min(w, h) * 0.35
  const cx = w / 2
  const cy = h * 0.45
  return {
    left: cx + Math.cos(angle) * r - 100,
    top: cy + Math.sin(angle) * r * 0.7 - 18,
    transform: `rotate(${(Math.random() - 0.5) * 2}deg)`,
  }
}

// ── Holographic Stack ──
const holoStack: LayoutFn = (index, { w, h, total, cardW }) => {
  // Determine how many columns we need so cards don't overflow vertically
  const maxPerCol = Math.max(4, Math.floor((h * 0.85) / 50))
  const numCols = Math.max(2, Math.ceil(total / maxPerCol))
  const colIndex = index % numCols
  const rowIndex = Math.floor(index / numCols)
  const count = Math.ceil(total / numCols)
  // Distribute columns evenly across width
  const colSpacing = Math.min(cardW + 30, (w * 0.7) / numCols)
  const startX = (w - numCols * colSpacing) / 2
  const colX = startX + colIndex * colSpacing
  const startY = h * 0.08
  const spacing = Math.min(50, (h * 0.85) / count)
  const isLeft = colIndex < numCols / 2
  return {
    left: colX + rowIndex * 3, // slight offset for depth
    top: startY + rowIndex * spacing,
    transform: `perspective(800px) translateZ(${-rowIndex * 8}px) rotateY(${isLeft ? 3 : -3}deg)`,
  }
}

// ── Command Grid ──
const commandGrid: LayoutFn = (index, { w, h, total, cardW }) => {
  // Allow more columns when container is wide enough and there are many cards
  const maxCols = Math.max(4, Math.floor(w / (cardW + 20)))
  const cols = Math.min(maxCols, Math.ceil(Math.sqrt(total * 1.5)))
  const col = index % cols
  const row = Math.floor(index / cols)
  const gapX = 12
  const gapY = 10
  const totalW = cols * cardW + (cols - 1) * gapX
  const startX = (w - totalW) / 2
  const startY = h * 0.12
  return {
    left: startX + col * (cardW + gapX),
    top: startY + row * (52 + gapY),
  }
}

// ── Data Hack ──
const dataHack: LayoutFn = (index, { w, h, total, cardW }) => {
  // Cards stacked on the right side, terminal-style
  // Split into multiple columns if too many cards for one column
  const maxPerCol = Math.max(4, Math.floor((h * 0.9) / 42))
  const numCols = Math.ceil(total / maxPerCol)
  const col = Math.floor(index / maxPerCol)
  const row = index % maxPerCol
  const colCount = col < numCols - 1 ? maxPerCol : total - col * maxPerCol
  const startY = h * 0.06
  const spacing = Math.min(42, (h * 0.9) / colCount)
  return {
    left: w * 0.65 - col * (cardW + 15),
    top: startY + row * spacing,
  }
}

// ── Orbital ──
const orbital: LayoutFn = (index, { w, h, total, cardW }) => {
  const cx = w / 2
  const cy = h * 0.48
  const ringIndex = index % 3
  const radii = [
    Math.min(h * 0.22, 200),
    Math.min(h * 0.32, 300),
    Math.min(h * 0.42, 380),
  ]
  const perRing = Math.ceil(total / 3)
  const i = Math.floor(index / 3)
  const angle = (i / perRing) * Math.PI * 2 + ringIndex * 0.3
  const r = radii[ringIndex]
  return {
    left: cx + Math.cos(angle) * r - cardW / 2,
    top: cy + Math.sin(angle) * r * 0.6 - 18,
  }
}

// ── Hexagonal ──
const hexagonal: LayoutFn = (index, { w, h, total, cardW }) => {
  const cx = w / 2
  const cy = h * 0.45
  if (index === 0) return { left: cx - cardW / 2, top: cy - 18 }
  // Rings of hexagons
  let ring = 1
  let pos = 1
  while (pos + ring * 6 <= index) { pos += ring * 6; ring++ }
  const inRing = index - pos
  const side = Math.floor(inRing / ring)
  const offset = inRing % ring
  const hexSize = Math.min(80, w / (total * 0.8))
  const angle = (side * Math.PI) / 3 + (offset / ring) * (Math.PI / 3)
  const r = ring * hexSize * 1.5
  return {
    left: cx + Math.cos(angle) * r - cardW / 2,
    top: cy + Math.sin(angle) * r * 0.7 - 18,
  }
}

// ── Cinematic Widescreen ──
const cinematic: LayoutFn = (index, { w, h, total, cardW }) => {
  // Split into multiple columns if too many cards for one column
  const maxPerCol = Math.max(4, Math.floor((h * 0.88) / 46))
  const numCols = Math.ceil(total / maxPerCol)
  const col = Math.floor(index / maxPerCol)
  const row = index % maxPerCol
  const colCount = col < numCols - 1 ? maxPerCol : total - col * maxPerCol
  const spacing = Math.min(46, (h * 0.88) / colCount)
  return {
    left: w * 0.58 - col * (cardW + 15),
    top: h * 0.06 + row * spacing,
  }
}

// ── Registry ──
export const LAYOUT_FNS: Record<string, LayoutFn> = {
  'dual-arc': dualArc,
  'dual-arc-3d': dualArc3d,
  'jarvis-radial': jarvisRadial,
  'jarvis-panels': jarvisPanels,
  'holo-stack': holoStack,
  'command-grid': commandGrid,
  'data-hack': dataHack,
  'orbital': orbital,
  'hexagonal': hexagonal,
  'cinematic': cinematic,
}

// Get center point and arc data for SVG connection lines
export function getLayoutCenter(layoutId: string, w: number, h: number): { x: number; y: number } {
  if (layoutId === 'cinematic' || layoutId === 'data-hack') {
    return { x: w * 0.3, y: h * 0.45 }
  }
  return { x: w / 2, y: h * 0.5 }
}
