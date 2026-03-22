// Generate a precise ring platform texture using Canvas
const { createCanvas } = require('canvas')
const fs = require('fs')

const SIZE = 2048
const canvas = createCanvas(SIZE, SIZE)
const ctx = canvas.getContext('2d')
const cx = SIZE / 2
const cy = SIZE / 2
const maxR = SIZE / 2

// Black background
ctx.fillStyle = '#000000'
ctx.fillRect(0, 0, SIZE, SIZE)

// Draw concentric rings
const rings = [
  // Inner red zone
  { r: 0.15, w: 3, color: 'rgba(255,34,0,0.9)' },
  { r: 0.18, w: 1.5, color: 'rgba(255,34,0,0.5)' },
  { r: 0.22, w: 5, color: 'rgba(200,20,0,0.4)' },
  { r: 0.25, w: 2, color: 'rgba(255,50,0,0.6)' },
  { r: 0.28, w: 1, color: 'rgba(180,20,0,0.3)' },
  // Transition
  { r: 0.32, w: 3, color: 'rgba(150,50,100,0.5)' },
  { r: 0.35, w: 1.5, color: 'rgba(100,80,150,0.4)' },
  { r: 0.38, w: 4, color: 'rgba(50,100,180,0.3)' },
  // Middle cyan zone
  { r: 0.42, w: 2, color: 'rgba(0,150,220,0.7)' },
  { r: 0.45, w: 6, color: 'rgba(0,80,120,0.2)' },
  { r: 0.48, w: 1.5, color: 'rgba(0,180,255,0.8)' },
  { r: 0.51, w: 3, color: 'rgba(0,100,150,0.3)' },
  { r: 0.54, w: 1, color: 'rgba(0,160,220,0.5)' },
  { r: 0.57, w: 5, color: 'rgba(0,60,100,0.2)' },
  // Outer bright cyan
  { r: 0.62, w: 2, color: 'rgba(0,200,255,0.8)' },
  { r: 0.65, w: 4, color: 'rgba(0,80,120,0.25)' },
  { r: 0.68, w: 1.5, color: 'rgba(0,180,240,0.6)' },
  { r: 0.72, w: 3, color: 'rgba(0,100,150,0.3)' },
  { r: 0.76, w: 2, color: 'rgba(0,212,255,0.9)' },
  // Edge
  { r: 0.80, w: 5, color: 'rgba(0,60,100,0.2)' },
  { r: 0.84, w: 1.5, color: 'rgba(0,180,240,0.6)' },
  { r: 0.88, w: 3, color: 'rgba(0,120,180,0.4)' },
  { r: 0.92, w: 2, color: 'rgba(0,200,255,0.7)' },
  { r: 0.95, w: 1, color: 'rgba(0,140,200,0.3)' },
]

// Draw each ring
rings.forEach(ring => {
  const r = ring.r * maxR
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = ring.color
  ctx.lineWidth = ring.w
  ctx.stroke()
})

// Add tick marks on specific rings
const tickRings = [
  { r: 0.42, count: 60, len: 8, color: 'rgba(0,150,220,0.4)' },
  { r: 0.62, count: 48, len: 12, color: 'rgba(0,200,255,0.3)' },
  { r: 0.76, count: 80, len: 6, color: 'rgba(0,180,240,0.35)' },
  { r: 0.92, count: 100, len: 5, color: 'rgba(0,200,255,0.3)' },
]

tickRings.forEach(tr => {
  const r = tr.r * maxR
  for (let i = 0; i < tr.count; i++) {
    const angle = (i / tr.count) * Math.PI * 2
    const isMajor = i % 5 === 0
    const len = isMajor ? tr.len * 1.5 : tr.len
    const x1 = cx + Math.cos(angle) * (r - len)
    const y1 = cy + Math.sin(angle) * (r - len)
    const x2 = cx + Math.cos(angle) * (r + len)
    const y2 = cy + Math.sin(angle) * (r + len)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = tr.color
    ctx.lineWidth = isMajor ? 1.5 : 0.8
    ctx.stroke()
  }
})

// Add bright marker dots on outer ring
for (let i = 0; i < 32; i++) {
  const angle = (i / 32) * Math.PI * 2
  const r = 0.76 * maxR
  const x = cx + Math.cos(angle) * r
  const y = cy + Math.sin(angle) * r
  ctx.beginPath()
  ctx.arc(x, y, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,212,255,0.8)'
  ctx.fill()

  // Glow
  const grd = ctx.createRadialGradient(x, y, 0, x, y, 15)
  grd.addColorStop(0, 'rgba(0,212,255,0.3)')
  grd.addColorStop(1, 'rgba(0,212,255,0)')
  ctx.beginPath()
  ctx.arc(x, y, 15, 0, Math.PI * 2)
  ctx.fillStyle = grd
  ctx.fill()
}

// Save
const buffer = canvas.toBuffer('image/png')
fs.writeFileSync('D:/GitHub/ProjectCreator/src/renderer/public/ring_platform.png', buffer)
console.log('Generated ring_platform.png (' + SIZE + 'x' + SIZE + ')')
