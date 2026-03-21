import { useEffect, useRef } from 'react'

interface Props {
  size?: number
  pulseSpeed?: number  // 0 = no pulse, 1 = normal, 2 = fast
  listening?: boolean  // voice listening state
  agentCount?: number
}

export function HalEye({ size = 120, pulseSpeed = 1, listening = false, agentCount = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    let frame = 0
    let animId: number

    const draw = () => {
      frame++
      ctx.clearRect(0, 0, size, size)

      const time = frame * 0.02 * pulseSpeed
      const pulse = 0.85 + Math.sin(time) * 0.15

      // Get the current primary color from CSS
      const style = getComputedStyle(document.documentElement)
      const primary = style.getPropertyValue('--primary').trim() || '#ef4444'

      // Parse hex to RGB
      const r = parseInt(primary.slice(1, 3), 16) || 239
      const g = parseInt(primary.slice(3, 5), 16) || 68
      const b = parseInt(primary.slice(5, 7), 16) || 68

      // Outer glow rings
      for (let i = 3; i >= 0; i--) {
        const radius = (size * 0.42) - i * 4
        const alpha = 0.04 + i * 0.02
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * pulse})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Rotating arc segments (HUD feel)
      const arcCount = Math.max(agentCount, 3)
      for (let i = 0; i < arcCount; i++) {
        const angle = (Math.PI * 2 / arcCount) * i + time * 0.3
        const arcLen = 0.3 + Math.sin(time + i) * 0.15
        ctx.beginPath()
        ctx.arc(cx, cy, size * 0.38, angle, angle + arcLen)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.2 + Math.sin(time + i * 2) * 0.1})`
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Inner rotating ring
      ctx.beginPath()
      ctx.arc(cx, cy, size * 0.3, time * 0.5, time * 0.5 + Math.PI * 1.5)
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.15)`
      ctx.lineWidth = 1.5
      ctx.stroke()

      // The eye — outer lens
      const eyeRadius = size * 0.22
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, eyeRadius)
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.9 * pulse})`)
      grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${0.5 * pulse})`)
      grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${0.15 * pulse})`)
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

      ctx.beginPath()
      ctx.arc(cx, cy, eyeRadius, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // Inner core
      const coreRadius = size * 0.08
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius)
      coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.9 * pulse})`)
      coreGrad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${0.95 * pulse})`)
      coreGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.4)`)

      ctx.beginPath()
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2)
      ctx.fillStyle = coreGrad
      ctx.fill()

      // Lens flare
      const flareX = cx - coreRadius * 0.3
      const flareY = cy - coreRadius * 0.3
      ctx.beginPath()
      ctx.arc(flareX, flareY, coreRadius * 0.25, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * pulse})`
      ctx.fill()

      // Voice listening indicator — expanding rings
      if (listening) {
        const listenPulse = Math.sin(frame * 0.1) * 0.5 + 0.5
        for (let i = 0; i < 3; i++) {
          const listenRadius = size * 0.25 + i * 8 + listenPulse * 10
          ctx.beginPath()
          ctx.arc(cx, cy, listenRadius, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.3 - i * 0.1) * listenPulse})`
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Outer data ticks
      for (let i = 0; i < 60; i++) {
        const angle = (Math.PI * 2 / 60) * i + time * 0.1
        const len = i % 5 === 0 ? 6 : 3
        const r1 = size * 0.44
        const r2 = r1 + len
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1)
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${i % 5 === 0 ? 0.3 : 0.1})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [size, pulseSpeed, listening, agentCount])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="hal-eye"
    />
  )
}
