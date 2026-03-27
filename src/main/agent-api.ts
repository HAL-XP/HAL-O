// ── Agent API Backend ──
// Calls Anthropic API directly for Bob/Karen agents instead of parsing terminal output.
// Supports streaming responses via WebSocket and model-agnostic design.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ── Types ──
export interface AgentConfig {
  name: string          // "bob", "karen"
  projectName: string   // "work-assistant", "personal-assistant"
  projectPath: string   // "D:/GitHub/work-assistant"
  model: string         // "claude-sonnet-4-6" default
  systemPrompt: string  // from CLAUDE.md
  voice: string | null  // "butler", "soft"
  lang: string          // "en", "fr"
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AgentState {
  config: AgentConfig
  history: Message[]
  lastActive: number
}

// ── State ──
const agents = new Map<string, AgentState>()
const MAX_HISTORY = 50 // keep last 50 messages per agent

// ── Load agent config from aliases + CLAUDE.md ──
export function loadAgentConfig(alias: string, project: string, projectPath: string, voice: string | null): AgentConfig {
  let systemPrompt = `You are ${alias}, a helpful assistant.`
  const claudeMdPath = join(projectPath, 'CLAUDE.md')
  if (existsSync(claudeMdPath)) {
    systemPrompt = readFileSync(claudeMdPath, 'utf-8')
  }

  // Add conversational chat rules (this is a chat API, not a CLI)
  systemPrompt += `\n\n## Chat Mode Rules
- You are responding via a mobile chat app. Keep responses conversational and concise.
- NEVER use markdown formatting: no code blocks, no **bold**, no headers, no bullet lists.
- Write plain text only, as if texting a friend.
- NEVER output code, commands, file paths, or technical artifacts unless explicitly asked.
- Your text responses are automatically converted to voice audio and played back to the user. You DO produce voice — just write naturally and the system handles TTS.
- Your name is ${alias}.`

  // Detect language from CLAUDE.md content
  const lang = systemPrompt.includes('francais') || systemPrompt.includes('français') ? 'fr' : 'en'

  return {
    name: alias,
    projectName: project,
    projectPath,
    model: 'claude-sonnet-4-6',
    systemPrompt,
    voice,
    lang,
  }
}

// ── Initialize or get agent ──
export function getOrCreateAgent(alias: string, project: string, projectPath: string, voice: string | null): AgentState {
  if (agents.has(alias)) {
    const state = agents.get(alias)!
    state.lastActive = Date.now()
    return state
  }

  const config = loadAgentConfig(alias, project, projectPath, voice)
  const state: AgentState = {
    config,
    history: [],
    lastActive: Date.now(),
  }
  agents.set(alias, state)
  return state
}

// ── Send message and stream response ──
export async function sendMessage(
  alias: string,
  message: string,
  onChunk: (text: string, done: boolean) => void,
  images?: Array<{ type: string; data: string; media_type: string }>
): Promise<string> {
  const state = agents.get(alias)
  if (!state) throw new Error(`Agent "${alias}" not initialized`)

  // Build content: text + optional images (Anthropic Vision API)
  let content: any = message
  if (images && images.length > 0) {
    const parts: any[] = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.data },
    }))
    parts.push({ type: 'text', text: message || 'What do you see?' })
    content = parts
  }

  // Add user message to history (store text only for history, not base64 images)
  state.history.push({ role: 'user', content: message })

  // Trim history if too long
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(-MAX_HISTORY)
  }

  // Load API key
  let apiKey = process.env.ANTHROPIC_API_KEY || ''
  if (!apiKey) {
    try {
      const credFile = join(process.env.USERPROFILE || process.env.HOME || '', '.claude_credentials')
      const creds = readFileSync(credFile, 'utf-8')
      const match = creds.match(/ANTHROPIC_API_KEY=["']?([^"'\n]+)/)
      if (match) apiKey = match[1]
    } catch { /* no creds file */ }
  }

  if (!apiKey) throw new Error('No ANTHROPIC_API_KEY found')

  // Call Anthropic API with streaming
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: state.config.model,
      max_tokens: 1024,
      system: state.config.systemPrompt,
      // Use multimodal content for last message if images present, text for history
      messages: images && images.length > 0
        ? [...state.history.slice(0, -1), { role: 'user', content }]
        : state.history,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status}: ${err}`)
  }

  // Process SSE stream
  let fullResponse = ''
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  if (!reader) throw new Error('No response body')

  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullResponse += event.delta.text
          onChunk(event.delta.text, false)
        }
      } catch { /* skip malformed JSON */ }
    }
  }

  onChunk('', true) // signal done

  // Add assistant response to history
  state.history.push({ role: 'assistant', content: fullResponse })
  state.lastActive = Date.now()

  return fullResponse
}

// ── List active agents ──
export function listAgents(): Array<{ alias: string; config: AgentConfig; messageCount: number }> {
  return Array.from(agents.entries()).map(([alias, state]) => ({
    alias,
    config: state.config,
    messageCount: state.history.length,
  }))
}

// ── Get agent history ──
export function getHistory(alias: string): Message[] {
  return agents.get(alias)?.history || []
}

// ── Clear agent history ──
export function clearHistory(alias: string): boolean {
  const state = agents.get(alias)
  if (!state) return false
  state.history = []
  return true
}
