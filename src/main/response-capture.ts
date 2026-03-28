// ── Response Capture ──
// Captures Claude CLI responses from PTY output, correlates to message IDs.
// Used by Halo Chat to bridge PWA messages through the terminal session.
//
// Uses @xterm/headless as a virtual terminal emulator to properly process
// all ANSI escape sequences (cursor movements, colors, overwrites) and
// extract clean text from the screen buffer. No regex guessing.

import { terminalManager } from './terminal-manager'

// Lazy-load xterm headless (it's a heavy module)
let XTerminal: any = null
function getTerminalClass() {
  if (!XTerminal) {
    XTerminal = require('@xterm/headless').Terminal
  }
  return XTerminal
}

interface PendingCapture {
  msgId: string
  agent: string
  vterm: any  // xterm headless Terminal instance
  lastDataTime: number
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  silenceTimer: ReturnType<typeof setTimeout> | null
  started: boolean  // true once we see actual response text (not just echo)
  lastBufferSnapshot: string  // last known buffer content for diffing
}

const SILENCE_TIMEOUT = 4000 // 4s of no output = response complete
const pendingCaptures = new Map<string, PendingCapture>()

// ── Read clean text from the virtual terminal buffer ──
function readVTermBuffer(vterm: any): string {
  const buf = vterm.buffer.active
  const lines: string[] = []
  // Read all lines from the buffer (including scrollback)
  const totalLines = buf.baseY + buf.cursorY + 1
  for (let i = 0; i < totalLines; i++) {
    const line = buf.getLine(i)
    if (line) {
      lines.push(line.translateToString(true))
    }
  }
  return lines.map(l => l.trimEnd()).join('\n').trim()
}

// ── Strip CLI chrome from clean text ──
function stripCliChrome(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return false
      // Skip our own input echo (with or without prompt chars)
      if (t.includes('[halochat')) return false
      if (t.includes('halochat')) return false
      // Skip CLI prompts and status lines
      if (/^[❯>$%#]\s*$/.test(t)) return false
      if (t.length < 3) return false
      // Skip spinner/progress lines
      if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳✻✽✶✢·░▒▓█]+/.test(t)) return false
      // Skip Claude CLI chrome
      if (/bypass\s*permissions?\s*on/i.test(t)) return false
      if (/shift\+tab\s*(to\s*cycle)?/i.test(t)) return false
      if (/^(Hashing|ctx:|Git:master|\d+%\s*\|)/i.test(t)) return false
      if (/Opus\s*4\.\d/i.test(t)) return false
      if (/Sonnet\s*4\.\d/i.test(t)) return false
      if (/Haiku\s*4\.\d/i.test(t)) return false
      if (/^[░▒▓█]+/.test(t)) return false
      // Skip lines that are just box-drawing / decorative chars
      if (/^[─╭╰│├└┌┐┘┤┬┴┼╮╯]+$/.test(t)) return false
      // Skip lines that are just prompt/status (❯, >, etc.)
      if (/^[❯>]\s/.test(t) && t.length < 10) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Strip markdown for chat display ──
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/>\s+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Inject message into HAL terminal and capture response ──
export function injectAndCapture(
  sessionId: string,
  msgId: string,
  agent: string,
  message: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
): boolean {
  if (pendingCaptures.has(msgId)) return false

  // Create a headless virtual terminal to process the PTY output
  const Terminal = getTerminalClass()
  const vterm = new Terminal({ cols: 200, rows: 100, allowProposedApi: true })

  const capture: PendingCapture = {
    msgId,
    agent,
    vterm,
    lastDataTime: Date.now(),
    onChunk,
    onDone,
    silenceTimer: null,
    started: false,
    lastBufferSnapshot: '',
  }
  pendingCaptures.set(msgId, capture)

  // Inject message into terminal
  const prefix = agent && agent !== 'hal' ? `[halochat:${agent}]` : '[halochat]'
  terminalManager.write(sessionId, `${prefix} ${message}\r`)

  // Start silence detection
  resetSilenceTimer(capture)

  return true
}

function resetSilenceTimer(capture: PendingCapture) {
  if (capture.silenceTimer) clearTimeout(capture.silenceTimer)
  capture.silenceTimer = setTimeout(() => {
    // Silence detected — response complete
    finishCapture(capture)
  }, SILENCE_TIMEOUT)
}

function finishCapture(capture: PendingCapture) {
  if (capture.silenceTimer) clearTimeout(capture.silenceTimer)
  pendingCaptures.delete(capture.msgId)

  // Read final clean text from the virtual terminal
  const rawText = readVTermBuffer(capture.vterm)
  const cleaned = stripCliChrome(rawText)
  const fullText = stripMarkdown(cleaned)

  // Dispose the virtual terminal
  capture.vterm.dispose()

  if (fullText.length > 2) {
    capture.onDone(fullText)
  } else {
    capture.onDone('(No response captured)')
  }
}

// ── Process PTY output for all pending captures ──
// Called from terminal-manager's onExternalData
export function processPtyOutput(sessionId: string, _projectName: string, data: string) {
  if (pendingCaptures.size === 0) return

  for (const capture of pendingCaptures.values()) {
    capture.lastDataTime = Date.now()

    // Feed raw data into the virtual terminal (it handles all ANSI properly)
    capture.vterm.write(data)

    // Skip the echo of our own input (prompt may include ❯ or > before [halochat])
    if (!capture.started) {
      const currentText = readVTermBuffer(capture.vterm)
      if (currentText.includes('[halochat') || currentText.includes('halochat')) return // still echoing input
      capture.started = true
      // Snapshot AFTER the echo so we only capture the response
      capture.lastBufferSnapshot = currentText
      return
    }

    // Read current buffer and diff against last snapshot to find new text
    const currentText = readVTermBuffer(capture.vterm)
    const newContent = currentText.slice(capture.lastBufferSnapshot.length).trim()
    capture.lastBufferSnapshot = currentText

    if (newContent) {
      const cleaned = stripCliChrome(newContent)
      if (cleaned) {
        capture.onChunk(cleaned)
      }
    }

    resetSilenceTimer(capture)
  }
}

// ── Check if HAL-O terminal exists ──
export function findHalSession(): string | null {
  const sessions = terminalManager.getActiveSessions()
  const hal = sessions.find(s =>
    s.projectPath.toLowerCase().replace(/\\/g, '/').includes('hal-o')
  )
  return hal?.id || null
}

// ── Check if any captures are pending ──
export function hasPendingCaptures(): boolean {
  return pendingCaptures.size > 0
}
