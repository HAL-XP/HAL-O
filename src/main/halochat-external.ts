// ── Halo Chat External Session Bridge ──
// File-based IPC to route Halo Chat messages to external Claude sessions.
//
// When no internal terminal is running but an external Claude session exists
// (detected via session.lock or .hal-o-external-session), messages are written
// to an inbox file that the external session's hooks can watch. Responses come
// back via an outbox file that this module polls.
//
// Files use per-message naming to prevent concurrent message loss:
//   ~/.hal-o/halochat-inbox-{msgId}.json  — message FROM Halo Chat TO external session
//   ~/.hal-o/halochat-outbox-{msgId}.json — response FROM external session TO Halo Chat
//
// Legacy single-file names are still checked for backward compatibility with
// older hook scripts that may not yet use per-message naming.
//
// Format (inbox): { id: string, agent: string, message: string, timestamp: string }
// Format (outbox): { id: string, agent: string, response: string, done: boolean, timestamp: string }

import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'fs'
import { dataPath } from './instance'
import { loadExternalSessionState, verifyExternalSession } from './session-externalize'

/** Per-message inbox/outbox file naming */
function inboxFile(msgId: string): string {
  return `halochat-inbox-${msgId}.json`
}
function outboxFile(msgId: string): string {
  return `halochat-outbox-${msgId}.json`
}

// Legacy single-file names (for backward compat with older hook scripts)
const LEGACY_INBOX_FILE = 'halochat-inbox.json'
const LEGACY_OUTBOX_FILE = 'halochat-outbox.json'
const POLL_INTERVAL_MS = 500  // check outbox every 500ms
const OUTBOX_STALE_MS = 30_000 // ignore outbox entries older than 30s
const MAX_POLL_DURATION_MS = 120_000 // stop polling after 2 min per message

export interface InboxMessage {
  id: string
  agent: string
  message: string
  timestamp: string
}

export interface OutboxMessage {
  id: string
  agent: string
  response: string
  done: boolean
  timestamp: string
}

export type SessionMode = 'internal' | 'external' | 'none'

export interface SessionStatus {
  mode: SessionMode
  pid: number | null
  hasChannels: boolean
  instanceName: string | null
}

// ── Session Lock reading (duplicated from session-lifecycle to avoid circular deps) ──

interface SessionLock {
  pid: number
  hasChannels: boolean
  startedAt: string
  instanceName: string
  command?: string
}

function readSessionLock(): SessionLock | null {
  const lockPath = dataPath('session.lock')
  try {
    if (!existsSync(lockPath)) return null
    const raw = JSON.parse(readFileSync(lockPath, 'utf-8'))
    if (raw && typeof raw.pid === 'number') {
      return raw as SessionLock
    }
  } catch {
    // Corrupt lock file
  }
  return null
}

// ── Detect external session status ──

/**
 * Check for a live external Claude session.
 * Checks both session.lock (channels-connected sessions written by health check)
 * and .hal-o-external-session (sessions externalized by the app on shutdown).
 *
 * Returns session info if an external session is alive, null otherwise.
 */
export function detectExternalSession(): { pid: number; hasChannels: boolean; instanceName: string } | null {
  // ── Check 1: session.lock (written by session-health-check.sh) ──
  const lock = readSessionLock()
  if (lock && lock.pid && verifyExternalSession(lock.pid)) {
    return {
      pid: lock.pid,
      hasChannels: lock.hasChannels,
      instanceName: lock.instanceName,
    }
  }

  // ── Check 2: .hal-o-external-session (written by session-externalize.ts on app shutdown) ──
  const state = loadExternalSessionState()
  if (state && state.pid && verifyExternalSession(state.pid)) {
    return {
      pid: state.pid,
      hasChannels: state.command?.includes('--channels') ?? false,
      instanceName: state.instanceName,
    }
  }

  return null
}

/**
 * Get the current session routing status.
 * Used by GET /session/status endpoint.
 */
export function getSessionStatus(hasInternalTerminal: boolean): SessionStatus {
  if (hasInternalTerminal) {
    return {
      mode: 'internal',
      pid: null, // internal terminals don't expose PID this way
      hasChannels: false,
      instanceName: null,
    }
  }

  const external = detectExternalSession()
  if (external) {
    return {
      mode: 'external',
      pid: external.pid,
      hasChannels: external.hasChannels,
      instanceName: external.instanceName,
    }
  }

  return {
    mode: 'none',
    pid: null,
    hasChannels: false,
    instanceName: null,
  }
}

// ── Inbox: write messages for external session ──

/**
 * Write a message to a per-message inbox file for the external session to pick up.
 * Each message gets its own file so concurrent messages are never overwritten.
 */
export function writeInbox(msg: InboxMessage): boolean {
  try {
    const inboxPath = dataPath(inboxFile(msg.id))
    writeFileSync(inboxPath, JSON.stringify(msg, null, 2), 'utf-8')
    console.log(`[HaloChat-External] Inbox written: id=${msg.id} agent=${msg.agent} msg="${msg.message.slice(0, 50)}..."`)
    return true
  } catch (err) {
    console.error('[HaloChat-External] Failed to write inbox:', err)
    return false
  }
}

/**
 * Clear the inbox file for a specific message ID.
 */
export function clearInbox(msgId?: string): void {
  try {
    if (msgId) {
      const p = dataPath(inboxFile(msgId))
      if (existsSync(p)) unlinkSync(p)
    }
    // Also clean up legacy single-file inbox if it exists
    const legacy = dataPath(LEGACY_INBOX_FILE)
    if (existsSync(legacy)) unlinkSync(legacy)
  } catch { /* best effort */ }
}

// ── Outbox: poll for responses from external session ──

/**
 * Read and consume the outbox file for a specific message ID.
 * Checks the per-message file first, then falls back to legacy single file.
 * Returns the outbox message if present and recent, null otherwise.
 * Deletes the file after reading (consume once).
 */
function readOutbox(msgId: string): OutboxMessage | null {
  // Try per-message file first, then legacy single file
  const candidates = [
    dataPath(outboxFile(msgId)),
    dataPath(LEGACY_OUTBOX_FILE),
  ]

  for (const outboxPath of candidates) {
    try {
      if (!existsSync(outboxPath)) continue

      // Check file age — ignore stale entries
      const stat = statSync(outboxPath)
      const age = Date.now() - stat.mtimeMs
      if (age > OUTBOX_STALE_MS) {
        // Stale outbox — clean up
        unlinkSync(outboxPath)
        continue
      }

      const raw = JSON.parse(readFileSync(outboxPath, 'utf-8'))

      if (raw && typeof raw.id === 'string' && typeof raw.response === 'string') {
        // Only consume if the message ID matches (important for legacy single-file)
        if (raw.id !== msgId) continue
        // Consume: delete the file so we don't re-read
        unlinkSync(outboxPath)
        return raw as OutboxMessage
      }
    } catch {
      // Parse or IO error — try next candidate
    }
  }
  return null
}

/**
 * Poll the outbox file for a response to a specific message ID.
 * Calls onChunk for intermediate responses and onDone when done=true.
 * Returns a cancel function to stop polling.
 */
export function pollOutbox(
  msgId: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
): () => void {
  let cancelled = false
  let accumulated = ''
  const startTime = Date.now()

  const timer = setInterval(() => {
    if (cancelled) {
      clearInterval(timer)
      return
    }

    // Timeout guard
    if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
      clearInterval(timer)
      if (accumulated) {
        onDone(accumulated)
      } else {
        onDone('(External session did not respond within 2 minutes)')
      }
      return
    }

    const msg = readOutbox(msgId)
    if (!msg) return // no response yet

    accumulated += (accumulated ? '\n' : '') + msg.response

    if (msg.done) {
      clearInterval(timer)
      onDone(accumulated)
    } else {
      onChunk(msg.response)
    }
  }, POLL_INTERVAL_MS)

  // Return cancel function
  return () => {
    cancelled = true
    clearInterval(timer)
  }
}

/**
 * Send a message to an external session and poll for the response.
 * This is the main entry point for Halo Chat external routing.
 *
 * Returns { success: true, msgId, cancel } if inbox was written,
 * or { success: false } if no external session or write failed.
 */
export function sendToExternalSession(
  msgId: string,
  agent: string,
  message: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
): { success: boolean; cancel?: () => void } {
  // Verify external session is still alive
  const external = detectExternalSession()
  if (!external) {
    console.log('[HaloChat-External] No external session detected')
    return { success: false }
  }

  // Write inbox
  const inboxMsg: InboxMessage = {
    id: msgId,
    agent,
    message,
    timestamp: new Date().toISOString(),
  }

  if (!writeInbox(inboxMsg)) {
    return { success: false }
  }

  // Start polling for response
  const cancel = pollOutbox(msgId, onChunk, onDone)

  return { success: true, cancel }
}
