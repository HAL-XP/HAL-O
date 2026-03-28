// ── Response Capture ──
// Captures Claude CLI responses from PTY output, correlates to message IDs.
// Used by Halo Chat to bridge PWA messages through the terminal session.

import { terminalManager } from './terminal-manager'

interface PendingCapture {
  msgId: string
  agent: string
  buffer: string
  cleanBuffer: string
  lastDataTime: number
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  silenceTimer: ReturnType<typeof setTimeout> | null
  started: boolean  // true once we see actual response text (not just echo)
}

const SILENCE_TIMEOUT = 4000 // 4s of no output = response complete
const pendingCaptures = new Map<string, PendingCapture>()

// ── ANSI + CLI chrome cleaning ──
// Comprehensive ANSI regex (based on ansi-regex npm package pattern)
// Matches: CSI sequences, OSC sequences, SGR, cursor movement, DCS, etc.
const ANSI_RE = /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const CHARSET_RE = /\x1b[()][AB012]/g
const MODE_RE = /\x1b[>=<N7-9]/g
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g
// Catch-all for any remaining ESC sequences
const ESC_LEFTOVER_RE = /\x1b[^[\]()>=<]?/g

function cleanPtyOutput(raw: string): string {
  let clean = raw
  // Handle carriage returns FIRST (keep last content per line — terminal overwrite behavior)
  clean = clean.split('\n').map(line => {
    const parts = line.split('\r')
    return parts[parts.length - 1]
  }).join('\n')
  // Convert cursor-right to spaces (Claude CLI uses ESC[nC between words)
  clean = clean.replace(/\x1b\[(\d*)C/g, (_m, n) => ' '.repeat(parseInt(n) || 1))
  // Strip ALL ANSI/escape sequences (layered for completeness)
  clean = clean.replace(OSC_RE, '')       // OSC (window title, etc.)
  clean = clean.replace(CHARSET_RE, '')   // character set selection
  clean = clean.replace(MODE_RE, '')      // mode switches
  clean = clean.replace(ANSI_RE, '')      // CSI sequences (colors, cursor, etc.)
  clean = clean.replace(ESC_LEFTOVER_RE, '') // any remaining ESC fragments
  clean = clean.replace(CTRL_RE, '')      // control chars
  // Remove CLI chrome (spinners, progress bars, status text)
  clean = clean
    .replace(/[✻✽✶✢·░▓█▒⏵●❯❮▶◐◑◒◓⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳─╭╰│├└┌┐┘┤┬┴┼]/g, '')
    .replace(/Hashing/g, '')
    .replace(/Burrowing/gi, '')  // Known garbage from partial ANSI decode
    .replace(/Opus\s*4\.\d.*$/gm, '')
    .replace(/ctx:.*$/gm, '')
    .replace(/bypass\s*permissions?\s*on/gi, '')
    .replace(/\(shift\+tab.*?\)/gi, '')
    .replace(/Git:master/g, '')
    .replace(/░+.*$/gm, '')
    .replace(/\d+%\s*\|/g, '')
    .replace(/[●❯❮▶◐◑◒◓]/g, '')
    // Filter out lines that are mostly non-alphanumeric garbage
    .split('\n').filter(line => {
      const stripped = line.replace(/[^a-zA-Z0-9]/g, '')
      // If less than 30% of the line is alphanumeric, it's probably garbage
      return stripped.length === 0 || stripped.length / Math.max(line.trim().length, 1) > 0.3
    }).join('\n')
  // Collapse whitespace
  clean = clean.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return clean
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

  const capture: PendingCapture = {
    msgId,
    agent,
    buffer: '',
    cleanBuffer: '',
    lastDataTime: Date.now(),
    onChunk,
    onDone,
    silenceTimer: null,
    started: false,
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

  const fullText = stripMarkdown(capture.cleanBuffer)
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

  const cleaned = cleanPtyOutput(data)
  if (!cleaned || cleaned.length < 2) return

  // Feed to all pending captures for this session
  // (Usually just one at a time, but handle multiple)
  for (const capture of pendingCaptures.values()) {
    capture.buffer += data
    capture.lastDataTime = Date.now()

    // Skip the echo of our own input
    if (!capture.started) {
      if (cleaned.includes('[halochat')) return // still echoing input
      capture.started = true
    }

    // Filter out lines that are just our input echo or CLI prompts
    const lines = cleaned.split('\n').filter(l => {
      const t = l.trim()
      if (!t) return false
      if (t.startsWith('[halochat')) return false
      if (t === '>') return false
      if (t.length < 3) return false
      return true
    })

    const newText = lines.join('\n').trim()
    if (newText) {
      capture.cleanBuffer += (capture.cleanBuffer ? '\n' : '') + newText
      capture.onChunk(newText)
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
