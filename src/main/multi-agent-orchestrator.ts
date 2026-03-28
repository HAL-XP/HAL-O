// ── Multi-Agent Debate Orchestrator ──
// Core engine for running multi-model AI debates and brainstorms.
// Manages debate sessions, round execution, consensus detection, and scoring.

import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataPath } from './instance'
import { chatCompletion, type LLMProvider, type ChatMessage } from './provider-clients'
import { AGENT_PRESETS, PANEL_CONFIGS, type AgentPreset } from './debate-presets'

// ── Types ──

export type DebateMode = 'round-robin' | 'concurrent' | 'devils-advocate'

export interface DebateAgent {
  presetId: string
  name: string
  /** Override provider (falls back to preset default) */
  provider?: LLMProvider
  /** Override model (falls back to preset default) */
  model?: string
  color: string
  icon: string
}

export interface DebateMessage {
  agentId: string
  agentName: string
  agentColor: string
  agentIcon: string
  round: number
  content: string
  timestamp: number
  durationMs: number
  provider: LLMProvider
  model: string
  isError: boolean
}

export interface DebateScore {
  agentId: string
  agentName: string
  score: number         // 1-10
  strengths: string[]
  weaknesses: string[]
}

export interface DebateSession {
  id: string
  topic: string
  mode: DebateMode
  agents: DebateAgent[]
  totalRounds: number
  currentRound: number
  messages: DebateMessage[]
  scores: DebateScore[] | null
  consensus: string | null
  status: 'created' | 'running' | 'paused' | 'completed' | 'error'
  createdAt: number
  updatedAt: number
  error?: string
}

type DebateSessionSerialized = DebateSession

// ── State ──

const _debates = new Map<string, DebateSession>()
let _loaded = false

function getStorePath(): string {
  return dataPath('debates.json')
}

function loadFromDisk(): void {
  if (_loaded) return
  _loaded = true
  try {
    const storePath = getStorePath()
    if (existsSync(storePath)) {
      const raw = JSON.parse(readFileSync(storePath, 'utf-8')) as DebateSessionSerialized[]
      for (const session of raw) {
        _debates.set(session.id, session)
      }
      console.log(`[DEBATE] Loaded ${_debates.size} sessions from disk`)
    }
  } catch (err) {
    console.warn('[DEBATE] Failed to load debates from disk:', err)
  }
}

function saveToDisk(): void {
  try {
    const sessions = Array.from(_debates.values())
    writeFileSync(getStorePath(), JSON.stringify(sessions, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[DEBATE] Failed to save debates to disk:', err)
  }
}

// ── Session Management ──

/**
 * Create a new debate session.
 */
export function createDebate(
  topic: string,
  mode: DebateMode,
  agentIds: string[],
  totalRounds: number = 3,
  overrides?: Record<string, { provider?: LLMProvider; model?: string }>
): DebateSession {
  loadFromDisk()

  const id = randomBytes(8).toString('hex')

  const agents: DebateAgent[] = agentIds.map(presetId => {
    const preset = AGENT_PRESETS[presetId]
    if (!preset) throw new Error(`Unknown agent preset: ${presetId}`)
    const override = overrides?.[presetId]
    return {
      presetId,
      name: preset.name,
      provider: override?.provider,
      model: override?.model,
      color: preset.color,
      icon: preset.icon,
    }
  })

  const session: DebateSession = {
    id,
    topic,
    mode,
    agents,
    totalRounds: Math.max(1, Math.min(10, totalRounds)),
    currentRound: 0,
    messages: [],
    scores: null,
    consensus: null,
    status: 'created',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  _debates.set(id, session)
  saveToDisk()
  return session
}

/**
 * Get a debate session by ID.
 */
export function getDebate(id: string): DebateSession | undefined {
  loadFromDisk()
  return _debates.get(id)
}

/**
 * List all debate sessions (newest first).
 */
export function listDebates(): DebateSession[] {
  loadFromDisk()
  return Array.from(_debates.values()).sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Delete a debate session.
 */
export function deleteDebate(id: string): boolean {
  loadFromDisk()
  const deleted = _debates.delete(id)
  if (deleted) saveToDisk()
  return deleted
}

// ── Round Execution ──

/**
 * Build the message history that an agent sees during its turn.
 */
function buildAgentContext(
  session: DebateSession,
  agentId: string,
  round: number
): ChatMessage[] {
  const messages: ChatMessage[] = []

  // Opening message with the topic
  messages.push({
    role: 'user',
    content: `DEBATE TOPIC: ${session.topic}\n\nYou are in round ${round} of ${session.totalRounds}. ${session.agents.length} agents are participating. Respond with your analysis.`,
  })

  // Which prior messages this agent can see depends on mode
  const priorMessages = session.messages.filter(m => {
    if (session.mode === 'concurrent') {
      // In concurrent mode, agents only see messages from completed prior rounds
      return m.round < round
    }
    // In round-robin and devils-advocate, agents see everything so far (including current round)
    return m.round < round || (m.round === round && m.agentId !== agentId)
  })

  // Build conversation from prior messages
  for (const msg of priorMessages) {
    if (msg.isError) continue // skip error messages

    messages.push({
      role: 'user',
      content: `[${msg.agentName} — Round ${msg.round}]: ${msg.content}`,
    })
  }

  // Add round context for later rounds
  if (round > 1) {
    messages.push({
      role: 'user',
      content: `This is round ${round}. Build on or challenge the discussion so far. Be specific about what you agree/disagree with and why. If the conversation is converging, push deeper or explore what's been missed.`,
    })
  }

  return messages
}

/**
 * Execute a single agent's turn.
 */
async function executeAgentTurn(
  session: DebateSession,
  agent: DebateAgent,
  round: number,
  onChunk?: (agentId: string, chunk: string) => void
): Promise<DebateMessage> {
  const preset = AGENT_PRESETS[agent.presetId]
  if (!preset) throw new Error(`Missing preset: ${agent.presetId}`)

  const provider = agent.provider ?? preset.defaultProvider
  const model = agent.model ?? preset.defaultModel
  const context = buildAgentContext(session, agent.presetId, round)

  // Build persona with debate-specific context
  let persona = preset.persona
  if (session.mode === 'devils-advocate' && agent.presetId === 'devils-advocate') {
    persona += '\n\nIMPORTANT: You go LAST in each round. You MUST oppose the emerging consensus. Find the strongest counter-argument to whatever the group is leaning toward.'
  }

  const startTime = Date.now()

  const content = await chatCompletion(
    provider,
    model,
    context,
    persona,
    { temperature: 0.8, maxTokens: 1024, timeout: 90_000 },
    onChunk ? (chunk) => onChunk(agent.presetId, chunk) : undefined
  )

  const durationMs = Date.now() - startTime
  const isError = content.startsWith('[ERROR]')

  return {
    agentId: agent.presetId,
    agentName: agent.name,
    agentColor: agent.color,
    agentIcon: agent.icon,
    round,
    content,
    timestamp: Date.now(),
    durationMs,
    provider,
    model,
    isError,
  }
}

/**
 * Run a single debate round.
 */
export async function runDebateRound(
  id: string,
  onMessage?: (message: DebateMessage) => void,
  onChunk?: (agentId: string, chunk: string) => void
): Promise<DebateMessage[]> {
  const session = _debates.get(id)
  if (!session) throw new Error(`Debate not found: ${id}`)
  if (session.status === 'completed') throw new Error('Debate already completed')
  if (session.currentRound >= session.totalRounds) throw new Error('All rounds completed')

  session.status = 'running'
  session.currentRound++
  const round = session.currentRound
  const roundMessages: DebateMessage[] = []

  // Determine agent order based on mode
  let agentOrder = [...session.agents]
  if (session.mode === 'devils-advocate') {
    // Devil's advocate goes last
    const devilIdx = agentOrder.findIndex(a => a.presetId === 'devils-advocate')
    if (devilIdx >= 0) {
      const [devil] = agentOrder.splice(devilIdx, 1)
      agentOrder.push(devil)
    }
  }

  if (session.mode === 'concurrent') {
    // Concurrent: all agents run in parallel (see only prior rounds)
    const results = await Promise.all(
      agentOrder.map(agent => executeAgentTurn(session, agent, round, onChunk))
    )
    for (const msg of results) {
      session.messages.push(msg)
      roundMessages.push(msg)
      onMessage?.(msg)
    }
  } else {
    // Round-robin / devils-advocate: sequential, each sees prior agents in this round
    for (const agent of agentOrder) {
      const msg = await executeAgentTurn(session, agent, round, onChunk)
      session.messages.push(msg)
      roundMessages.push(msg)
      onMessage?.(msg)
    }
  }

  // Check if debate is complete
  if (session.currentRound >= session.totalRounds) {
    session.status = 'completed'
  } else {
    session.status = 'paused'
  }

  session.updatedAt = Date.now()
  saveToDisk()
  return roundMessages
}

/**
 * Run all remaining rounds of a debate.
 */
export async function runFullDebate(
  id: string,
  onMessage?: (message: DebateMessage) => void,
  onChunk?: (agentId: string, chunk: string) => void,
  onRoundComplete?: (round: number, messages: DebateMessage[]) => void
): Promise<void> {
  const session = _debates.get(id)
  if (!session) throw new Error(`Debate not found: ${id}`)

  while (session.currentRound < session.totalRounds && session.status !== 'error') {
    const roundMessages = await runDebateRound(id, onMessage, onChunk)
    onRoundComplete?.(session.currentRound, roundMessages)
  }
}

// ── Scoring ──

/**
 * Score all agents using a cheap LLM judge.
 * Uses Ollama by default (free), falls back to Anthropic Haiku.
 */
export async function scoreDebate(id: string): Promise<DebateScore[]> {
  const session = _debates.get(id)
  if (!session) throw new Error(`Debate not found: ${id}`)
  if (session.messages.length === 0) throw new Error('No messages to score')

  // Build a summary of the debate for the judge
  const debateSummary = session.messages
    .filter(m => !m.isError)
    .map(m => `[${m.agentName} — Round ${m.round}]: ${m.content}`)
    .join('\n\n')

  const agentList = session.agents.map(a => a.name).join(', ')

  const judgePrompt = `You are an impartial debate judge. Score each agent's performance.

DEBATE TOPIC: ${session.topic}
AGENTS: ${agentList}

For each agent, provide:
- score: 1-10 (integer)
- strengths: 1-3 bullet points
- weaknesses: 1-3 bullet points

Respond in STRICT JSON format (no markdown, no explanation outside JSON):
[{"agentId":"<preset-id>","agentName":"<name>","score":<n>,"strengths":["..."],"weaknesses":["..."]}]

Agent preset IDs: ${session.agents.map(a => a.presetId).join(', ')}

DEBATE TRANSCRIPT:
${debateSummary.slice(0, 8000)}`

  // Try Ollama first (free), fall back to Anthropic
  let judgeResult = await chatCompletion(
    'ollama',
    'mistral',
    [{ role: 'user', content: judgePrompt }],
    'You are a fair and precise debate judge. Always respond in valid JSON.',
    { temperature: 0.3, maxTokens: 1024, timeout: 30_000 }
  )

  if (judgeResult.startsWith('[ERROR]')) {
    // Fallback to Anthropic
    judgeResult = await chatCompletion(
      'anthropic',
      'claude-sonnet-4-20250514',
      [{ role: 'user', content: judgePrompt }],
      'You are a fair and precise debate judge. Always respond in valid JSON.',
      { temperature: 0.3, maxTokens: 1024 }
    )
  }

  if (judgeResult.startsWith('[ERROR]')) {
    throw new Error(`Scoring failed: ${judgeResult}`)
  }

  // Parse JSON from response (may be wrapped in markdown code blocks)
  let scores: DebateScore[]
  try {
    const jsonStr = judgeResult
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
    const parsed = JSON.parse(jsonStr)
    scores = Array.isArray(parsed) ? parsed : []

    // Validate and sanitize
    scores = scores.map(s => ({
      agentId: String(s.agentId || ''),
      agentName: String(s.agentName || ''),
      score: Math.max(1, Math.min(10, Number(s.score) || 5)),
      strengths: Array.isArray(s.strengths) ? s.strengths.map(String) : [],
      weaknesses: Array.isArray(s.weaknesses) ? s.weaknesses.map(String) : [],
    }))
  } catch {
    // If JSON parsing fails, create neutral scores
    scores = session.agents.map(a => ({
      agentId: a.presetId,
      agentName: a.name,
      score: 5,
      strengths: ['Participated in the debate'],
      weaknesses: ['Score could not be parsed from judge response'],
    }))
  }

  session.scores = scores
  session.updatedAt = Date.now()
  saveToDisk()
  return scores
}

// ── Consensus Detection ──

/**
 * Analyze whether the debate reached consensus.
 * Returns a summary string or null if no clear consensus.
 */
export async function detectConsensus(id: string): Promise<string | null> {
  const session = _debates.get(id)
  if (!session) throw new Error(`Debate not found: ${id}`)
  if (session.messages.length === 0) return null

  // Use final round messages for consensus check
  const lastRound = session.currentRound
  const finalMessages = session.messages
    .filter(m => m.round === lastRound && !m.isError)
    .map(m => `[${m.agentName}]: ${m.content}`)
    .join('\n\n')

  const consensusPrompt = `Analyze the final round of this debate and determine if the agents reached consensus.

TOPIC: ${session.topic}

FINAL ROUND STATEMENTS:
${finalMessages.slice(0, 6000)}

Respond in this EXACT format:
CONSENSUS: YES/NO/PARTIAL
SUMMARY: <1-3 sentence summary of where agents agree and disagree>

If YES: describe what they agree on.
If PARTIAL: describe areas of agreement and remaining disagreements.
If NO: describe the key unresolved conflicts.`

  // Try Ollama first, fall back to Anthropic
  let result = await chatCompletion(
    'ollama',
    'mistral',
    [{ role: 'user', content: consensusPrompt }],
    'You are a precise debate analyst. Be concise and accurate.',
    { temperature: 0.2, maxTokens: 512, timeout: 30_000 }
  )

  if (result.startsWith('[ERROR]')) {
    result = await chatCompletion(
      'anthropic',
      'claude-sonnet-4-20250514',
      [{ role: 'user', content: consensusPrompt }],
      'You are a precise debate analyst. Be concise and accurate.',
      { temperature: 0.2, maxTokens: 512 }
    )
  }

  if (result.startsWith('[ERROR]')) {
    return null
  }

  session.consensus = result
  session.updatedAt = Date.now()
  saveToDisk()
  return result
}

// ── Utility ──

/**
 * Create a debate from a panel config preset.
 */
export function createDebateFromPanel(
  topic: string,
  panelId: string,
  mode: DebateMode = 'round-robin',
  rounds: number = 3
): DebateSession {
  const panel = PANEL_CONFIGS[panelId]
  if (!panel) throw new Error(`Unknown panel config: ${panelId}`)
  return createDebate(topic, mode, panel.agentIds, rounds)
}

/**
 * Get a summary of a debate suitable for display.
 */
export function getDebateSummary(id: string): {
  id: string
  topic: string
  mode: DebateMode
  agentCount: number
  messageCount: number
  roundsCompleted: number
  totalRounds: number
  status: string
  hasScores: boolean
  hasConsensus: boolean
  createdAt: number
} | null {
  const session = _debates.get(id)
  if (!session) return null
  return {
    id: session.id,
    topic: session.topic,
    mode: session.mode,
    agentCount: session.agents.length,
    messageCount: session.messages.length,
    roundsCompleted: session.currentRound,
    totalRounds: session.totalRounds,
    status: session.status,
    hasScores: !!session.scores,
    hasConsensus: !!session.consensus,
    createdAt: session.createdAt,
  }
}
