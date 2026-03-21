import { useEffect, useRef } from 'react'

interface Props {
  nodeCount?: number
  connectionDistance?: number
}

interface Node {
  x: number; y: number
  vx: number; vy: number
  size: number
  brightness: number
}

export function NetworkBg({ nodeCount = 50, connectionDistance = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0, h = 0
    const resize = () => {
      w = canvas.parentElement?.clientWidth || window.innerWidth
      h = canvas.parentElement?.clientHeight || window.innerHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    // Get primary color
    const style = getComputedStyle(document.documentElement)
    const primary = style.getPropertyValue('--primary').trim() || '#84cc16'
    const pr = parseInt(primary.slice(1, 3), 16) || 132
    const pg = parseInt(primary.slice(3, 5), 16) || 204
    const pb = parseInt(primary.slice(5, 7), 16) || 22

    // Create nodes
    const nodes: Node[] = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 1,
      brightness: Math.random() * 0.5 + 0.3,
    }))

    // Mouse interaction
    let mouseX = -1000, mouseY = -1000
    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseX = e.clientX - rect.left
      mouseY = e.clientY - rect.top
    }
    const onMouseLeave = () => { mouseX = -1000; mouseY = -1000 }
    canvas.addEventListener('mousemove', onMouse)
    canvas.addEventListener('mouseleave', onMouseLeave)

    let animId: number
    let frame = 0

    const draw = () => {
      frame++
      ctx.clearRect(0, 0, w, h)

      // Update nodes
      for (const node of nodes) {
        node.x += node.vx
        node.y += node.vy

        // Bounce off edges
        if (node.x < 0 || node.x > w) node.vx *= -1
        if (node.y < 0 || node.y > h) node.vy *= -1

        // Slight attraction to mouse
        const dx = mouseX - node.x
        const dy = mouseY - node.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200 && dist > 0) {
          node.vx += (dx / dist) * 0.01
          node.vy += (dy / dist) * 0.01
        }

        // Dampen velocity
        node.vx *= 0.999
        node.vy *= 0.999

        // Pulse brightness
        node.brightness = 0.3 + Math.sin(frame * 0.01 + node.x * 0.01) * 0.2
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.12
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }

        // Mouse connections
        const mdx = mouseX - nodes[i].x
        const mdy = mouseY - nodes[i].y
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy)
        if (mDist < connectionDistance * 1.5) {
          const alpha = (1 - mDist / (connectionDistance * 1.5)) * 0.25
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(mouseX, mouseY)
          ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`
          ctx.lineWidth = 0.8
          ctx.stroke()
        }
      }

      // Draw nodes
      for (const node of nodes) {
        // Glow
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${node.brightness * 0.08})`
        ctx.fill()

        // Core
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${node.brightness})`
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMouse)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [nodeCount, connectionDistance])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'all',
        zIndex: 0,
      }}
    />
  )
}
