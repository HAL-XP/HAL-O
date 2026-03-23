import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import type { FeedEntry } from '../data/demo-feed'
import '@xterm/xterm/css/xterm.css'

interface Props {
  feedEntries: FeedEntry[]
  active: boolean
  fontSize?: number
  /** Offset in the feed to start from (so multiple panels don't sync) */
  startOffset?: number
}

export function DemoTerminalPanel({ feedEntries, active, fontSize = 13, startOffset = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const style = getComputedStyle(document.documentElement)
    const primary = style.getPropertyValue('--primary').trim() || '#84cc16'

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: {
        background: '#0a0a12',
        foreground: '#e0e0e8',
        cursor: primary,
        cursorAccent: '#0a0a12',
        selectionBackground: primary + '40',
        black: '#1a1a2e',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e4f0',
        brightBlack: '#5a5e73',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
      scrollback: 5000,
      disableStdin: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
      requestAnimationFrame(() => term.refresh(0, term.rows - 1))
    } catch {
      // canvas fallback
    }

    setTimeout(() => fit.fit(), 50)
    setTimeout(() => fit.fit(), 200)
    termRef.current = term
    fitRef.current = fit

    // Start the scripted feed playback
    const timers: ReturnType<typeof setTimeout>[] = []
    let loopCount = 0
    const maxLoops = 50 // prevent infinite loops in demo

    function playFeed(offset: number) {
      if (loopCount >= maxLoops) return
      loopCount++
      let cumulativeDelay = 0
      const startIdx = offset % feedEntries.length

      // Play from startIdx to end, then from 0 to startIdx
      const ordered = [
        ...feedEntries.slice(startIdx),
        ...feedEntries.slice(0, startIdx),
      ]

      for (let i = 0; i < ordered.length; i++) {
        const entry = ordered[i]
        cumulativeDelay += entry.delay
        const t = setTimeout(() => {
          term.write(entry.text)
        }, cumulativeDelay)
        timers.push(t)
      }

      // After entire feed plays, add a pause then restart
      cumulativeDelay += 8000
      const restartTimer = setTimeout(() => {
        term.write('\r\n\x1b[90m' + '\u2500'.repeat(60) + '\x1b[0m\r\n')
        term.write('\x1b[90m  [Demo loop restarting...]\x1b[0m\r\n\r\n')
        playFeed(0)
      }, cumulativeDelay)
      timers.push(restartTimer)
    }

    playFeed(startOffset)

    // Resize handling
    const container = containerRef.current
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => fit.fit(), 50)
    })
    resizeObserver.observe(container)

    return () => {
      for (const t of timers) clearTimeout(t)
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [feedEntries, startOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when tab becomes active
  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
      setTimeout(() => {
        fitRef.current?.fit()
        termRef.current?.refresh(0, termRef.current.rows - 1)
      }, 50)
    }
  }, [active])

  // Live font size update
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize
      fitRef.current?.fit()
    }
  }, [fontSize])

  return (
    <div
      ref={containerRef}
      className="hal-terminal"
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}
