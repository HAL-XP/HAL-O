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
function cleanPtyOutput(raw: string): string {
  let clean = raw
  // Convert cursor-right to spaces (Claude CLI uses ESC[nC between words)
  clean = clean.replace(/\x1b\[(\d*)C/g, (_m, n) => ' '.repeat(parseInt(n) || 1))
  // Strip all ANSI escape sequences
  clean = clean.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
  clean = clean.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  clean = clean.replace(/\x1b[()][AB012]/g, '')
  clean = clean.replace(/\x1b[>=<]/g, '')
  clean = clean.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  // Handle carriage returns (keep last content per line)
  clean = clean.split('\n').map(line => {
    const parts = line.split('\r')
    return parts[parts.length - 1]
  }).join('\n')
  // Remove CLI chrome
  clean = clean
    .replace(/[✻✽✶✢·░▓█▒⏵●❯❮▶◐◑◒◓⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳─]/g, '')
    .replace(/Hashing/g, '')
    .replace(/Opus\s*4\.\d.*$/gm, '')
    .replace(/ctx:.*$/gm, '')
    .replace(/bypass\s*permissions?\s*on/gi, '')
    .replace(/\(shift\+tab.*?\)/gi, '')
    .replace(/Git:master/g, '')
    .replace(/░+.*$/gm, '')
    .replace(/\d+%\s*\|/g, '')
    .replace(/[●❯❮▶◐◑◒◓]/g, '')
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
