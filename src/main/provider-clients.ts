// ── Unified LLM Provider Clients ──
// Single chatCompletion() function that routes to Anthropic, OpenAI, Ollama, or Gemini.
// Handles streaming, auth, and graceful fallback. Used by multi-agent debate system.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ── Types ──

export type LLMProvider = 'anthropic' | 'openai' | 'ollama' | 'gemini'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatCompletionOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Timeout in ms (default: 60000) */
  timeout?: number
}

// ── Credential Loading ──
// Same pattern as agent-api.ts and model-providers.ts

const _keyCache = new Map<string, string>()

function loadApiKey(envVar: string): string | null {
  // Check cache
  if (_keyCache.has(envVar)) return _keyCache.get(envVar) || null

  // Check process.env first
  if (process.env[envVar]) {
    _keyCache.set(envVar, process.env[envVar]!)
    return process.env[envVar]!
  }

  // Check ~/.claude_credentials (bash-sourceable key=value file)
  try {
    const credPath = join(process.env.USERPROFILE || process.env.HOME || '', '.claude_credentials')
    if (existsSync(credPath)) {
      const content = readFileSync(credPath, 'utf-8')
      const re = new RegExp(`(?:export\\s+)?${envVar}=["']?([^"'\\n]+)`)
      const m = content.match(re)
      if (m && m[1] && m[1].length > 5) {
        _keyCache.set(envVar, m[1])
        return m[1]
      }
    }
  } catch { /* ignore */ }

  return null
}

/** Clear the key cache (e.g. after user updates credentials) */
export function invalidateKeyCache(): void {
  _keyCache.clear()
}

// ── SSE Stream Parser ──

async function parseSSEStream(
  response: Response,
  extractChunk: (event: Record<string, unknown>) => string | null,
  onChunk?: (text: string) => void
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        const chunk = extractChunk(event)
        if (chunk) {
          fullText += chunk
          onChunk?.(chunk)
        }
      } catch { /* skip malformed JSON */ }
    }
  }

  return fullText
}

// ── Anthropic Provider ──

async function anthropicCompletion(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  options: ChatCompletionOptions = {},
  onChunk?: (text: string) => void
): Promise<string> {
  const apiKey = loadApiKey('ANTHROPIC_API_KEY')
  if (!apiKey) return '[ERROR] No ANTHROPIC_API_KEY found in env or ~/.claude_credentials'

  // Separate system messages from conversation
  const convMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const timeoutMs = options.timeout ?? 60_000
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      system: systemPrompt,
      messages: convMessages,
      stream: true,
    }),
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const err = await response.text()
    return `[ERROR] Anthropic API ${response.status}: ${err}`
  }

  return parseSSEStream(
    response,
    (event) => {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined
        return (delta?.text as string) || null
      }
      return null
    },
    onChunk
  )
}

// ── OpenAI Provider ──

async function openaiCompletion(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  options: ChatCompletionOptions = {},
  onChunk?: (text: string) => void
): Promise<string> {
  const apiKey = loadApiKey('OPENAI_API_KEY')
  if (!apiKey) return '[ERROR] No OPENAI_API_KEY found in env or ~/.claude_credentials'

  // OpenAI uses system role in messages array
  const allMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ]

  const timeoutMs = options.timeout ?? 60_000
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: allMessages,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stream: true,
    }),
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const err = await response.text()
    return `[ERROR] OpenAI API ${response.status}: ${err}`
  }

  return parseSSEStream(
    response,
    (event) => {
      const choices = event.choices as Array<Record<string, unknown>> | undefined
      if (choices && choices[0]) {
        const delta = choices[0].delta as Record<string, unknown> | undefined
        return (delta?.content as string) || null
      }
      return null
    },
    onChunk
  )
}

// ── Ollama Provider (OpenAI-compatible endpoint) ──

async function ollamaCompletion(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  options: ChatCompletionOptions = {},
  onChunk?: (text: string) => void
): Promise<string> {
  // No API key needed — local server
  const baseUrl = 'http://127.0.0.1:11434'

  // Check if Ollama is running
  try {
    await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(2000) })
  } catch {
    return '[ERROR] Ollama not running at localhost:11434'
  }

  // Use Ollama's OpenAI-compatible endpoint
  const allMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ]

  const timeoutMs = options.timeout ?? 120_000 // longer for local models
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: allMessages,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stream: true,
    }),
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const err = await response.text()
    return `[ERROR] Ollama API ${response.status}: ${err}`
  }

  return parseSSEStream(
    response,
    (event) => {
      const choices = event.choices as Array<Record<string, unknown>> | undefined
      if (choices && choices[0]) {
        const delta = choices[0].delta as Record<string, unknown> | undefined
        return (delta?.content as string) || null
      }
      return null
    },
    onChunk
  )
}

// ── Gemini Provider ──

async function geminiCompletion(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  options: ChatCompletionOptions = {},
  onChunk?: (text: string) => void
): Promise<string> {
  const apiKey = loadApiKey('GEMINI_API_KEY') || loadApiKey('GOOGLE_API_KEY')
  if (!apiKey) return '[ERROR] No GEMINI_API_KEY or GOOGLE_API_KEY found in env or ~/.claude_credentials'

  // Gemini uses a different message format
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const timeoutMs = options.timeout ?? 60_000

  // Gemini streaming uses server-sent events via streamGenerateContent
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        topP: options.topP,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    }),
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const err = await response.text()
    return `[ERROR] Gemini API ${response.status}: ${err}`
  }

  return parseSSEStream(
    response,
    (event) => {
      const candidates = event.candidates as Array<Record<string, unknown>> | undefined
      if (candidates && candidates[0]) {
        const content = candidates[0].content as Record<string, unknown> | undefined
        const parts = content?.parts as Array<Record<string, unknown>> | undefined
        if (parts && parts[0]) {
          return (parts[0].text as string) || null
        }
      }
      return null
    },
    onChunk
  )
}

// ── Unified Entry Point ──

/**
 * Send a chat completion request to any supported LLM provider.
 * Routes to the correct API, handles streaming, and returns the full response text.
 *
 * @param provider - Which LLM provider to use
 * @param model - Provider-specific model ID (e.g. 'claude-sonnet-4-20250514', 'gpt-4o', 'mistral')
 * @param messages - Conversation history
 * @param systemPrompt - System/persona prompt
 * @param options - Temperature, max tokens, etc.
 * @param onChunk - Optional callback for streaming chunks (real-time updates)
 * @returns Full response text, or an [ERROR] string if the provider failed
 */
export async function chatCompletion(
  provider: LLMProvider,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  options?: ChatCompletionOptions,
  onChunk?: (text: string) => void
): Promise<string> {
  const opts = options ?? {}

  try {
    switch (provider) {
      case 'anthropic':
        return await anthropicCompletion(model, messages, systemPrompt, opts, onChunk)
      case 'openai':
        return await openaiCompletion(model, messages, systemPrompt, opts, onChunk)
      case 'ollama':
        return await ollamaCompletion(model, messages, systemPrompt, opts, onChunk)
      case 'gemini':
        return await geminiCompletion(model, messages, systemPrompt, opts, onChunk)
      default:
        return `[ERROR] Unknown provider: ${provider}`
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Don't crash — return error string so the debate can continue with other agents
    return `[ERROR] ${provider}/${model} failed: ${message}`
  }
}

/**
 * Check if a provider has the required credentials configured.
 */
export function isProviderAvailable(provider: LLMProvider): boolean {
  switch (provider) {
    case 'anthropic':
      return !!loadApiKey('ANTHROPIC_API_KEY')
    case 'openai':
      return !!loadApiKey('OPENAI_API_KEY')
    case 'gemini':
      return !!(loadApiKey('GEMINI_API_KEY') || loadApiKey('GOOGLE_API_KEY'))
    case 'ollama':
      return true // availability checked at call time (local server)
    default:
      return false
  }
}

/**
 * Get a human-readable status for each provider.
 */
export function getProviderStatus(): Record<LLMProvider, { available: boolean; reason: string }> {
  return {
    anthropic: {
      available: isProviderAvailable('anthropic'),
      reason: isProviderAvailable('anthropic') ? 'API key configured' : 'Missing ANTHROPIC_API_KEY',
    },
    openai: {
      available: isProviderAvailable('openai'),
      reason: isProviderAvailable('openai') ? 'API key configured' : 'Missing OPENAI_API_KEY',
    },
    ollama: {
      available: true,
      reason: 'Local server (checked at call time)',
    },
    gemini: {
      available: isProviderAvailable('gemini'),
      reason: isProviderAvailable('gemini') ? 'API key configured' : 'Missing GEMINI_API_KEY / GOOGLE_API_KEY',
    },
  }
}
