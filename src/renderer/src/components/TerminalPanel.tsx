import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  active: boolean
  fontSize?: number
  voiceOut?: boolean // enable TTS for Claude responses
}

// Strip ANSI escape codes for TTS
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

export function TerminalPanel({ sessionId, active, fontSize = 13, voiceOut = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const outputBufferRef = useRef('')
  const ttsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Read primary color from CSS
    const style = getComputedStyle(document.documentElement)
    const primary = style.getPropertyValue('--primary').trim() || '#84cc16'

    const term = new Terminal({
      cursorBlink: true,
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
      allowTransparency: true,
      scrollback: 5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)

    term.open(containerRef.current)

    // Try WebGL renderer for GPU acceleration
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // fallback to canvas renderer — fine
    }

    // Replay scrollback from main process (reconnection after HMR/reload)
    try {
      if (window.api?.ptyScrollback) {
        window.api.ptyScrollback(sessionId).then((data: string) => {
          if (data) term.write(data)
          fit.fit()
        }).catch(() => {})
      }
    } catch { /* pty may not exist yet */ }

    // Delayed fit — container needs time to settle its dimensions
    setTimeout(() => fit.fit(), 50)
    setTimeout(() => fit.fit(), 200)
    setTimeout(() => fit.fit(), 500)
    termRef.current = term
    fitRef.current = fit

    // Connect to pty data stream (may fail if pty doesn't exist yet)
    let cleanupData = () => {}
    let cleanupExit = () => {}
    try {
    cleanupData = window.api.onPtyData(sessionId, (data) => {
      term.write(data)

      // Buffer output for voice-out TTS
      if (voiceOut) {
        outputBufferRef.current += data
        // Reset the timer — wait for output to stop for 3 seconds
        if (ttsTimerRef.current) clearTimeout(ttsTimerRef.current)
        ttsTimerRef.current = setTimeout(() => {
          const text = stripAnsi(outputBufferRef.current).trim()
          outputBufferRef.current = ''
          // Only speak if there's meaningful content (>20 chars, not just a prompt)
          if (text.length > 20 && !text.match(/^[>\$#%]\s*$/)) {
            // Take last 500 chars to avoid speaking huge outputs
            const toSpeak = text.length > 500 ? text.slice(-500) : text
            window.api.voiceSpeak(toSpeak, 'narrator', 'en').catch(() => {})
          }
        }, 3000)
      }
    })

    cleanupExit = window.api.onPtyExit(sessionId, ({ code }) => {
      term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`)
    })
    } catch { /* pty listeners failed — session may not exist */ }

    // Send terminal input to pty
    term.onData((data) => {
      window.api.ptyInput(sessionId, data).catch(() => {})
    })

    // CTRL+V paste support
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === 'v' && e.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          if (text) window.api.ptyInput(sessionId, text).catch(() => {})
        }).catch(() => {})
        return false // prevent xterm default handling
      }
      // CTRL+C for copy when there's a selection
      if (e.ctrlKey && e.key === 'c' && e.type === 'keydown' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {})
        return false
      }
      return true
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fit.fit()
      window.api.ptyResize(sessionId, term.cols, term.rows)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      cleanupData()
      cleanupExit()
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [sessionId])

  // Re-fit when tab becomes active
  useEffect(() => {
    if (active && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 50)
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
