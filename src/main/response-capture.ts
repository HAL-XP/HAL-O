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
  responseStartSnapshot: string  // buffer content when response started (for final diff)
  lastBufferSnapshot: string  // last known buffer content for chunk diffing
  accumulatedResponse: string  // accumulated clean response text
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
// Aggressive filter: only keep lines that look like natural language response.
// The PTY captures EVERYTHING: tool calls, file paths, status bars, spinners, WebSocket events.
// We must be strict — better to miss a line than to show garbage.
function stripCliChrome(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return false
      if (t.length < 3) return false

      // ── Input echo ──
      if (t.includes('[halochat')) return false
      if (t.includes('halochat')) return false

      // ── CLI prompts ──
      if (/^[❯>$%#]\s*$/.test(t)) return false
      if (/^[❯>]\s/.test(t) && t.length < 10) return false

      // ── Spinners / progress ──
      if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✳✻✽✶✢·░▒▓█*]+\s/.test(t)) return false
      if (/^[░▒▓█]+/.test(t)) return false

      // ── Claude CLI status lines ──
      if (/bypass\s*permissions?\s*on/i.test(t)) return false
      if (/shift\+tab/i.test(t)) return false
      if (/^(Hashing|ctx:|Git:|Deliberating|Thinking|Processing)/i.test(t)) return false
      if (/thinking with (high|low|medium)\s*(effort)?/i.test(t)) return false
      if (/^\(thinking/i.test(t)) return false
      if (/(Opus|Sonnet|Haiku)\s*\d+\.\d/i.test(t)) return false
      if (/^\d+%\s*\|/.test(t)) return false

      // ── Box-drawing / decorative ──
      if (/^[─╭╰│├└┌┐┘┤┬┴┼╮╯━┃┏┓┗┛╋]+$/.test(t)) return false

      // ── Internal code / tool calls leaking through ──
      if (/\.(ts|js|tsx|jsx|json|css|html|md)\b/.test(t) && !/\s{2,}/.test(t)) return false  // file paths (unless part of prose)
      if (/^(import|export|const|let|var|function|class|interface|type)\s/.test(t)) return false  // code
      if (/\b(onChunk|onDone|audioIds|tts_ready|chat_chunk|session_chunk)\b/.test(t)) return false  // internal events
      if (/^[A-Z_]{2,}\s*[:=]/.test(t)) return false  // CONST_NAME: value
      if (/\bsrc[/\\](main|renderer|preload)\b/.test(t)) return false  // source paths
      if (/\bnode_modules\b/.test(t)) return false
      if (/\b(ipcMain|ipcRenderer|electron)\b/.test(t)) return false  // Electron internals
      if (/^\s*[{}\[\]()]+\s*$/.test(t)) return false  // lone brackets
      if (/^(Read|Write|Edit|Bash|Glob|Grep|Agent)\s/.test(t)) return false  // tool names

      // ── Lines that are mostly non-word characters (garbage) ──
      const wordChars = t.replace(/[^a-zA-Z\s]/g, '').trim()
      if (wordChars.length < t.length * 0.3 && t.length > 10) return false

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
    responseStartSnapshot: '',
    lastBufferSnapshot: '',
    accumulatedResponse: '',
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

  // Get the full response by diffing current buffer against the start snapshot
  const currentText = readVTermBuffer(capture.vterm)
  const responseRaw = currentText.slice(capture.responseStartSnapshot.length)
  const cleaned = stripCliChrome(responseRaw)
  const fullText = stripMarkdown(cleaned)

  // Dispose the virtual terminal
  capture.vterm.dispose()

  if (fullText.length > 2) {
    capture.onDone(fullText)
  } else if (capture.accumulatedResponse.length > 2) {
    // Fallback: use accumulated chunks if buffer diff is empty
    capture.onDone(stripMarkdown(capture.accumulatedResponse))
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
      if (currentText.includes('[halochat') || currentText.includes('halochat')) return
      capture.started = true
      // Snapshot AFTER the echo so we only diff the actual response
      capture.responseStartSnapshot = currentText
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
        capture.accumulatedResponse += (capture.accumulatedResponse ? '\n' : '') + cleaned
        capture.onChunk(cleaned)
      }
    }

    resetSilenceTimer(capture)
  }
}

// ── Check if HAL-O terminal exists with an active Claude session ──
export function findHalSession(): string | null {
  const sessions = terminalManager.getActiveSessions()
  // Find HAL-O terminals
  const halSessions = sessions.filter(s =>
    s.projectPath.toLowerCase().replace(/\\/g, '/').includes('hal-o')
  )
  if (halSessions.length === 0) return null

  // Prefer terminals where Claude is actually running (not dead shell)
  // Check scrollback for signs of a dead session
  for (const s of halSessions) {
    const scrollback = terminalManager.getScrollback(s.id)
    const lastChunk = scrollback.slice(-500)
    // If the terminal shows Claude exit tips or raw shell prompt, skip it
    const isDead = /Tip:\s*Run claude/i.test(lastChunk) ||
      /claude --continue|claude --resume/i.test(lastChunk) &&
      !/\[halochat\]/i.test(lastChunk.slice(-200))
    if (!isDead) return s.id
  }

  // Fallback: return first HAL-O terminal anyway (better than nothing)
  return halSessions[0].id
}

// ── Check if any captures are pending ──
export function hasPendingCaptures(): boolean {
  return pendingCaptures.size > 0
}
