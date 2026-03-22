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
  cardW: number   // card width (~200)
}

type LayoutFn = (index: number, ctx: LayoutContext) => CardPosition

// ── Dual Arc ──
const dualArc: LayoutFn = (index, { w, h, total, cardW }) => {
  const cx = w / 2
  const cy = h * 0.5
  const radius = Math.min(h * 0.35, w * 0.3, 350)
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
  const radius = Math.min(h * 0.38, w * 0.35, 380)
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  const px = cx + Math.cos(angle) * radius
  const py = cy + Math.sin(angle) * radius
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
  const half = Math.ceil(total / 2)
  const isLeft = index < half
  const i = isLeft ? index : index - half
  const count = isLeft ? half : total - half
  const colX = isLeft ? w * 0.15 : w * 0.85 - cardW
  const startY = h * 0.08
  const spacing = Math.min(50, (h * 0.85) / count)
  return {
    left: colX + i * 3, // slight offset for depth
    top: startY + i * spacing,
    transform: `perspective(800px) translateZ(${-i * 8}px) rotateY(${isLeft ? 3 : -3}deg)`,
  }
}

// ── Command Grid ──
const commandGrid: LayoutFn = (index, { w, h, total, cardW }) => {
  const cols = Math.min(4, Math.ceil(Math.sqrt(total)))
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
const dataHack: LayoutFn = (index, { w, h, total }) => {
  // Cards stacked on the right side, terminal-style
  const startY = h * 0.06
  const spacing = Math.min(42, (h * 0.9) / total)
  return {
    left: w * 0.65,
    top: startY + index * spacing,
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
const cinematic: LayoutFn = (index, { w, h, total }) => {
  const spacing = Math.min(46, (h * 0.88) / total)
  return {
    left: w * 0.58,
    top: h * 0.06 + index * spacing,
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
