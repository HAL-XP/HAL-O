import { useEffect, useRef } from 'react'

interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; color: string; rotation: number
  rotationSpeed: number; opacity: number; shape: 'rect' | 'circle'
}

const COLORS = ['#8b7cf7', '#a097f7', '#4ade80', '#5b4fc7', '#e2e4f0']

export function Confetti({ duration = 2500, count = 70 }: { duration?: number; count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.4,
      y: canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 8 + 3),
      size: Math.random() * 7 + 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    }))

    const start = Date.now()
    let animId: number

    const animate = () => {
      const progress = Math.min((Date.now() - start) / duration, 1)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        p.x += p.vx
        p.vy += 0.18
        p.y += p.vy
        p.vx *= 0.99
        p.rotation += p.rotationSpeed
        p.opacity = Math.max(0, 1 - progress * 1.3)

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      if (progress < 1) animId = requestAnimationFrame(animate)
    }

    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [duration, count])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  )
}
