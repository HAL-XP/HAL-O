import { useEffect, useRef, memo } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { selectVoiceProfile } from '../utils/selectVoiceProfile'
import { playWithAnalyser } from '../utils/audioAnalyser'
import type { VoiceProfileId } from '../hooks/useSettings'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  active: boolean
  fontSize?: number
  voiceOut?: boolean // enable TTS for Claude responses
  voiceProfile?: VoiceProfileId
}

// B30: Notify 3D scene to throttle when terminal is focused
let _terminalFocused = false
export function isTerminalFocused(): boolean { return _terminalFocused }

// Strip ANSI escape codes for TTS
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}


export const TerminalPanel = memo(function TerminalPanel({ sessionId, active, fontSize = 13, voiceOut = false, voiceProfile = 'auto' }: Props) {
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
    })

    const fit = new FitAddon()
    term.loadAddon(fit)

    term.open(containerRef.current)

    // GPU-accelerated renderer — use canvas fallback if WebGL fails
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        webgl.dispose()
      })
      term.loadAddon(webgl)
      // Force redraw so WebGL fully owns the cursor (prevents ghost artifacts)
      requestAnimationFrame(() => term.refresh(0, term.rows - 1))
    } catch {
      // canvas renderer fallback — fine
    }

    // Replay scrollback from main process (reconnection after HMR/reload)
    try {
      if (window.api?.ptyScrollback) {
        window.api.ptyScrollback(sessionId).then((data: string) => {
          if (data) term.write(data)
          fit.fit()
          // Force full redraw after scrollback — WebGL can get out of sync
          term.refresh(0, term.rows - 1)
        }).catch(() => {})
      }
    } catch { /* pty may not exist yet */ }

    // Delayed fit — container needs time to settle its dimensions
    setTimeout(() => fit.fit(), 50)
    setTimeout(() => fit.fit(), 200)
    setTimeout(() => fit.fit(), 500)
    termRef.current = term
    fitRef.current = fit

    // B30: Batch xterm writes — accumulate data for one frame then write once
    let writeBuf = ''
    let writeRaf = 0
    const flushWrite = () => {
      if (writeBuf) {
        term.write(writeBuf)
        writeBuf = ''
      }
      writeRaf = 0
    }

    // Connect to pty data stream (may fail if pty doesn't exist yet)
    let cleanupData = () => {}
    let cleanupExit = () => {}
    try {
    cleanupData = window.api.onPtyData(sessionId, (data) => {
      // Queue data for batched write instead of writing every event
      writeBuf += data
      if (!writeRaf) writeRaf = requestAnimationFrame(flushWrite)

      // Auto-speak response when this terminal is the voice response target
      const isVoiceTarget = (window as any).__voiceResponseTarget === sessionId
      if (isVoiceTarget) {
        outputBufferRef.current += data
        if (ttsTimerRef.current) clearTimeout(ttsTimerRef.current)
        ttsTimerRef.current = setTimeout(() => {
          // Clear the target flag
          ;(window as any).__voiceResponseTarget = null
          const text = stripAnsi(outputBufferRef.current).trim()
          outputBufferRef.current = ''
          if (text.length > 20) {
            const toSpeak = text.length > 800 ? text.slice(-800) : text
            // Check for a one-shot override (e.g. from zog-zog detection)
            const override = (window as any).__voiceProfileOverride as string | undefined
            if (override) {
              ;(window as any).__voiceProfileOverride = null
            }
            // Resolve the effective profile: override > explicit profile > auto-select
            const effectiveProfile = override || (voiceProfile === 'auto' ? selectVoiceProfile(toSpeak) : voiceProfile)
            window.api.voiceSpeak(toSpeak, effectiveProfile, 'en').then((result) => {
              if (result.success && result.audioDataUrl) {
                // Play with Web Audio API for analyser data (base64 data URL works with contextIsolation)
                playWithAnalyser(result.audioDataUrl)
              }
            }).catch(() => {})
          }
        }, 3000) // wait 3s after output stops
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

    // Custom key handler — intercept before xterm processes
    term.attachCustomKeyEventHandler((e) => {
      // CTRL+SPACE → let it bubble to window for push-to-talk
      if (e.ctrlKey && e.code === 'Space') {
        return false // don't let xterm handle it
      }
      // CTRL+V / CTRL+SHIFT+V paste — block xterm's \x16 handling,
      // let the browser paste event flow through to xterm's native paste handler
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V') && e.type === 'keydown') {
        return false
      }
      // CTRL+C for copy when there's a selection (otherwise let ^C go to pty)
      if (e.ctrlKey && e.key === 'c' && e.type === 'keydown' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {})
        return false
      }
      return true
    })

    // Right-click on terminal: copy selection to clipboard (standard terminal behavior)
    const container = containerRef.current
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      if (term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {})
        term.clearSelection()
      }
    }
    container.addEventListener('contextmenu', onContextMenu)

    // Handle resize — debounced to prevent display corruption and layout thrashing during drag
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        fit.fit()
        window.api.ptyResize(sessionId, term.cols, term.rows)
      }, 150)
    })
    resizeObserver.observe(container)

    // B30: Track terminal focus to throttle 3D scene
    const onFocusIn = () => { _terminalFocused = true }
    const onFocusOut = () => { _terminalFocused = false }
    container.addEventListener('focusin', onFocusIn)
    container.addEventListener('focusout', onFocusOut)

    return () => {
      cleanupData()
      cleanupExit()
      if (writeRaf) cancelAnimationFrame(writeRaf)
      if (resizeTimer) clearTimeout(resizeTimer)
      container.removeEventListener('contextmenu', onContextMenu)
      container.removeEventListener('focusin', onFocusIn)
      container.removeEventListener('focusout', onFocusOut)
      resizeObserver.disconnect()
      _terminalFocused = false
      term.dispose()
    }
  }, [sessionId])

  // Re-fit and refresh when tab becomes active (WebGL needs full redraw after display:none)
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
})
