// ── Message Dispatcher (Phase 2) ──
// Routes incoming messages (voice, Telegram, terminal) to the right project/terminal.
// Implements Layers 0-2 of the 5-layer cascade (prefix, regex, context stickiness).
// No LLM needed — handles 80%+ of messages.

export interface DispatchResult {
  /** Target terminal session ID (null = no match, use default) */
  sessionId: string | null
  /** Matched project name (for UI display) */
  projectName: string | null
  /** Which layer resolved the routing */
  layer: 0 | 1 | 2 | 3 | 4 | 5
  /** Confidence 0-1 */
  confidence: number
  /** Original message (possibly cleaned of prefix) */
  cleanMessage: string
}

export interface ProjectTerminal {
  sessionId: string
  projectName: string
  projectPath: string
}

// ── Layer 0: Explicit Prefix (<1ms) ──
// "@hal-o fix this" → route to hal-o terminal
// "@myapp test" → route to myapp terminal

const PREFIX_RE = /^@([\w-]+)\s+/i

function matchPrefix(message: string, terminals: ProjectTerminal[]): DispatchResult | null {
  const m = message.match(PREFIX_RE)
  if (!m) return null

  const target = m[1].toLowerCase()
  const cleanMessage = message.slice(m[0].length)

  // Find terminal whose project name matches (case-insensitive, partial OK)
  const match = terminals.find(t =>
    t.projectName.toLowerCase() === target ||
    t.projectName.toLowerCase().replace(/[^a-z0-9]/g, '') === target.replace(/[^a-z0-9]/g, '')
  )

  if (match) {
    return {
      sessionId: match.sessionId,
      projectName: match.projectName,
      layer: 0,
      confidence: 1.0,
      cleanMessage,
    }
  }

  return null
}

// ── Layer 1: Keyword/Command Regex (<2ms) ──
// "push hal-o" → route to hal-o terminal
// "test myapp" → route to myapp terminal
// These are the /hal-style command keywords

const COMMAND_KEYWORDS = /^(push|test|nuke|ship|clean|qa|perf|build|deploy|run|start|stop|restart|fix|debug)\s+/i

function matchKeywordWithProject(message: string, terminals: ProjectTerminal[]): DispatchResult | null {
  const m = message.match(COMMAND_KEYWORDS)
  if (!m) return null

  const rest = message.slice(m[0].length).trim().toLowerCase()
  const restSpaced = rest.replace(/[-_.]/g, ' ')

  // Check if the rest starts with a project name (hyphenated, spaced, or compact)
  const match = terminals.find(t => {
    const pn = t.projectName.toLowerCase()
    const pnSpaced = pn.replace(/[-_.]/g, ' ')
    const pnCompact = pn.replace(/[^a-z0-9]/g, '')
    return rest.startsWith(pn) || rest.startsWith(pnCompact) ||
      restSpaced.startsWith(pnSpaced) || restSpaced.startsWith(pn)
  })

  if (match) {
    return {
      sessionId: match.sessionId,
      projectName: match.projectName,
      layer: 1,
      confidence: 0.9,
      cleanMessage: message,
    }
  }

  return null
}

// ── Layer 1b: Voice Switch Commands (<2ms) ──
// "Work on my react app" / "Switch to client API" / "Talk to hal-o"
// Sets sticky context and confirms the switch.

const SWITCH_RE = /^(?:work on|switch to|talk to|go to|open|focus on|let's work on)\s+(.+?)(?:\s+project)?$/i
const LIST_RE = /^(?:list|show|what are)\s+(?:my\s+)?projects?$/i

export interface VoiceSwitchResult {
  type: 'switch' | 'list' | 'none'
  projectName?: string
  sessionId?: string
}

function matchVoiceSwitch(message: string, terminals: ProjectTerminal[]): VoiceSwitchResult {
  // Check for list command first
  if (LIST_RE.test(message.trim())) {
    return { type: 'list' }
  }

  // Check for switch command
  const m = message.trim().match(SWITCH_RE)
  if (!m) return { type: 'none' }

  const target = m[1].toLowerCase().trim()

  // Fuzzy match against terminal project names
  const match = terminals.find(t => {
    const pn = t.projectName.toLowerCase()
    const pnClean = pn.replace(/[^a-z0-9]/g, '')
    const targetClean = target.replace(/[^a-z0-9]/g, '')
    return pn === target || pnClean === targetClean ||
      pn.includes(target) || target.includes(pn) ||
      pnClean.includes(targetClean) || targetClean.includes(pnClean)
  })

  if (match) {
    return { type: 'switch', projectName: match.projectName, sessionId: match.sessionId }
  }

  return { type: 'none' }
}

// ── Layer 1c: Natural Project Name Detection (<3ms) ──
// Scans the message for any mention of a project name.
// "Fix the auth bug in my react app" → detect "my react app" → route

function matchProjectNameInMessage(message: string, terminals: ProjectTerminal[]): DispatchResult | null {
  const msgLower = message.toLowerCase()
  // Normalize: replace hyphens/underscores/dots with spaces for speech matching
  const msgSpaced = msgLower.replace(/[-_.]/g, ' ')

  // Score each terminal by how well its name matches
  let bestMatch: ProjectTerminal | null = null
  let bestScore = 0

  for (const t of terminals) {
    const pn = t.projectName.toLowerCase()
    // Create multiple matching forms:
    // "my-react-app" → ["my-react-app", "my react app", "myreactapp"]
    const pnExact = pn
    const pnSpaced = pn.replace(/[-_.]/g, ' ')
    const pnCompact = pn.replace(/[^a-z0-9]/g, '')

    let score = 0

    // Exact name with hyphens found in message (e.g. "hal-o" in "hal-o sphere")
    if (msgLower.includes(pnExact) && pnExact.length > 2) {
      score = pnExact.length * 1.2 // highest priority
    }
    // Spaced form found in message (e.g. "my react app" in "fix auth in my react app")
    else if (pnSpaced.length > 3 && msgSpaced.includes(pnSpaced)) {
      score = pnSpaced.length
    }
    // Compact form found in compact message (e.g. "clientapi" in "deployclientapitostaging")
    else if (pnCompact.length > 4) {
      const msgCompact = msgLower.replace(/[^a-z0-9]/g, '')
      if (msgCompact.includes(pnCompact)) {
        score = pnCompact.length * 0.7
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = t
    }
  }

  if (bestMatch && bestScore > 3) {
    return {
      sessionId: bestMatch.sessionId,
      projectName: bestMatch.projectName,
      layer: 1,
      confidence: Math.min(0.85, 0.5 + bestScore * 0.03),
      cleanMessage: message,
    }
  }

  return null
}

// ── Export voice switch for UI handling ──
export { matchVoiceSwitch }

// ── Layer 2: Context Stickiness (<1ms) ──
// If the user was recently talking to a specific terminal, keep routing there.
// Resets after 5 minutes of inactivity or explicit switch.

let _stickySessionId: string | null = null
let _stickyTimestamp = 0
const STICKY_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export function setStickySession(sessionId: string | null): void {
  _stickySessionId = sessionId
  _stickyTimestamp = Date.now()
}

export function getStickySession(): string | null {
  if (!_stickySessionId) return null
  if (Date.now() - _stickyTimestamp > STICKY_TIMEOUT) {
    _stickySessionId = null
    return null
  }
  return _stickySessionId
}

function matchSticky(terminals: ProjectTerminal[]): DispatchResult | null {
  const sticky = getStickySession()
  if (!sticky) return null

  const match = terminals.find(t => t.sessionId === sticky)
  if (!match) {
    _stickySessionId = null
    return null
  }

  return {
    sessionId: match.sessionId,
    projectName: match.projectName,
    layer: 2,
    confidence: 0.7,
    cleanMessage: '', // will be filled by caller
  }
}

// ── Main Dispatch Function ──

export function dispatch(message: string, terminals: ProjectTerminal[]): DispatchResult {
  if (terminals.length === 0) {
    return { sessionId: null, projectName: null, layer: 5, confidence: 0, cleanMessage: message }
  }

  // Layer 0: Explicit prefix
  const prefixMatch = matchPrefix(message, terminals)
  if (prefixMatch) {
    setStickySession(prefixMatch.sessionId)
    return prefixMatch
  }

  // Layer 1: Keyword + project name
  const keywordMatch = matchKeywordWithProject(message, terminals)
  if (keywordMatch) {
    setStickySession(keywordMatch.sessionId)
    return keywordMatch
  }

  // Layer 1c: Natural project name mention
  const nameMatch = matchProjectNameInMessage(message, terminals)
  if (nameMatch) {
    setStickySession(nameMatch.sessionId)
    return nameMatch
  }

  // Layer 2: Context stickiness
  const stickyMatch = matchSticky(terminals)
  if (stickyMatch) {
    stickyMatch.cleanMessage = message
    return stickyMatch
  }

  // Default: route to first terminal (usually HAL-O)
  // In future: Layer 3 (embeddings) and Layer 4 (LLM) go here
  return {
    sessionId: terminals[0].sessionId,
    projectName: terminals[0].projectName,
    layer: 5,
    confidence: 0.3,
    cleanMessage: message,
  }
}

// ── Utility: list active terminals for dispatch ──
// This is called from IPC handlers to get the current terminal list.

let _getTerminalsCallback: (() => ProjectTerminal[]) | null = null

export function setTerminalListProvider(callback: () => ProjectTerminal[]): void {
  _getTerminalsCallback = callback
}

export function getActiveTerminals(): ProjectTerminal[] {
  return _getTerminalsCallback?.() ?? []
}

// ── Dispatch from any input source ──

export function dispatchMessage(message: string): DispatchResult {
  const terminals = getActiveTerminals()
  return dispatch(message, terminals)
}
