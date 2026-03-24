import { useEffect, useRef, useState } from 'react'

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function NeuralLinks({ containerRef }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; ready: boolean }[]>([])

  useEffect(() => {
    const update = () => {
      const container = containerRef.current
      const svg = svgRef.current
      if (!container || !svg) return

      const svgRect = svg.getBoundingClientRect()
      // Center of the viewport (where the sphere is)
      const cx = svgRect.width / 2
      const cy = svgRect.height * 0.25 // sphere is in upper area

      const dots = container.querySelectorAll('.hal-dot')
      const newLines: typeof lines = []

      dots.forEach((dot) => {
        const rect = dot.getBoundingClientRect()
        const x = rect.left + rect.width / 2 - svgRect.left
        const y = rect.top + rect.height / 2 - svgRect.top
        const isReady = dot.classList.contains('green')
        newLines.push({ x1: x, y1: y, x2: cx, y2: cy, ready: isReady })
      })

      setLines(newLines)
    }

    // Update on scroll and resize
    const container = containerRef.current
    const opsList = container?.querySelector('.hal-ops-list')

    update()
    const interval = setInterval(() => {
      if (document.hidden) return // B29: skip updates when tab is hidden
      update()
    }, 200)
    opsList?.addEventListener('scroll', update)
    window.addEventListener('resize', update)

    return () => {
      clearInterval(interval)
      opsList?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [containerRef])

  return (
    <svg
      ref={svgRef}
      className="hal-neural-svg"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <defs>
        <linearGradient id="link-green" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--success)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="link-amber" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--warning)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--warning)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {lines.map((line, i) => {
        // Curved bezier from dot to center
        const midX = (line.x1 + line.x2) / 2
        const midY = (line.y1 + line.y2) / 2
        const dx = line.x2 - line.x1
        // Curve control point offset perpendicular to the line
        const cpX = midX + (line.y1 - line.y2) * 0.15
        const cpY = midY + dx * 0.15
        return (
          <path
            key={i}
            d={`M ${line.x1} ${line.y1} Q ${cpX} ${cpY} ${line.x2} ${line.y2}`}
            fill="none"
            stroke={line.ready ? 'var(--success)' : 'var(--warning)'}
            strokeWidth="0.5"
            opacity="0.2"
          />
        )
      })}
    </svg>
  )
}
