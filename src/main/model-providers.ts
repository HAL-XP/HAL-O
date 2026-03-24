// ── Model Provider Abstraction (X7) ──
// Plumbing layer for multi-model terminal support.
// This does NOT make API calls — it defines provider metadata and checks availability.

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// ── Types ──

export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'custom'

export interface ModelProvider {
  id: string
  name: string
  type: ProviderType
  /** Display label for Settings/context menus */
  label: string
  /** Base URL for the API (relevant for ollama, custom) */
  baseUrl?: string
  /** Environment variable that holds the API key (checked for availability) */
  apiKeyEnvVar?: string
  /** Whether this provider is currently available (key found / server running) */
  available: boolean
  /** Short description shown in UI */
  description: string
  /** Models offered by this provider */
  models: ModelEntry[]
}

export interface ModelEntry {
  id: string
  name: string
  /** The provider-specific model identifier (e.g. 'claude-sonnet-4-20250514') */
  modelId: string
  /** Whether this is the default/recommended model for the provider */
  isDefault: boolean
}

// ── Built-in Provider Definitions ──

const ANTHROPIC_MODELS: ModelEntry[] = [
  { id: 'claude-default', name: 'Claude (default)', modelId: 'default', isDefault: true },
  { id: 'claude-opus', name: 'Claude Opus', modelId: 'claude-opus-4-0-20250514', isDefault: false },
  { id: 'claude-sonnet', name: 'Claude Sonnet', modelId: 'claude-sonnet-4-20250514', isDefault: false },
]

const OPENAI_MODELS: ModelEntry[] = [
  { id: 'gpt-4o', name: 'GPT-4o', modelId: 'gpt-4o', isDefault: true },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', modelId: 'gpt-4-turbo', isDefault: false },
  { id: 'codex', name: 'Codex', modelId: 'codex-mini-latest', isDefault: false },
  { id: 'o3', name: 'o3', modelId: 'o3', isDefault: false },
]

const OLLAMA_MODELS: ModelEntry[] = [
  { id: 'ollama-default', name: 'Default (local)', modelId: 'default', isDefault: true },
]

// ── Availability Checks ──

function findApiKey(envVar: string): boolean {
  // Check process.env first
  if (process.env[envVar]) return true

  // Check ~/.claude_credentials (bash-sourceable key=value file)
  try {
    const credPath = join(process.env.USERPROFILE || process.env.HOME || '', '.claude_credentials')
    if (existsSync(credPath)) {
      const content = readFileSync(credPath, 'utf-8')
      // Match: export KEY="value" or KEY="value" or KEY=value
      const re = new RegExp(`(?:export\\s+)?${envVar}=["']?([^"'\\s]+)`)
      const m = content.match(re)
      return !!(m && m[1] && m[1].length > 5)
    }
  } catch { /* ignore */ }

  return false
}

function isOllamaRunning(): boolean {
  try {
    // Quick check: try to hit the Ollama API health endpoint
    // Use a synchronous approach — this is called infrequently
    execSync('curl -s --max-time 1 http://localhost:11434/api/version', {
      stdio: 'pipe',
      timeout: 2000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

// ── Provider Registry ──

function buildProviders(): ModelProvider[] {
  return [
    {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      label: 'CLAUDE (DEFAULT)',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      available: findApiKey('ANTHROPIC_API_KEY'),
      description: 'Claude models via Anthropic API — used by Claude Code natively',
      models: ANTHROPIC_MODELS,
    },
    {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      label: 'OPENAI (GPT-4 / CODEX)',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      available: findApiKey('OPENAI_API_KEY'),
      description: 'GPT-4, GPT-4 Turbo, Codex via OpenAI API',
      models: OPENAI_MODELS,
    },
    {
      id: 'ollama',
      name: 'Ollama',
      type: 'ollama',
      label: 'OLLAMA (LOCAL)',
      baseUrl: 'http://localhost:11434',
      available: false, // checked lazily via getAvailableProviders()
      description: 'Local models via Ollama — no API key needed',
      models: OLLAMA_MODELS,
    },
    {
      id: 'custom',
      name: 'Custom Endpoint',
      type: 'custom',
      label: 'CUSTOM ENDPOINT',
      available: false, // user must configure
      description: 'Custom OpenAI-compatible API endpoint',
      models: [],
    },
  ]
}

// Cached providers (rebuilt on demand)
let _cachedProviders: ModelProvider[] | null = null
let _cacheTime = 0
const CACHE_TTL = 30_000 // 30s

/**
 * Returns all known providers with availability status.
 * Caches for 30s to avoid repeated filesystem/network checks.
 */
export function getAvailableProviders(): ModelProvider[] {
  const now = Date.now()
  if (_cachedProviders && now - _cacheTime < CACHE_TTL) {
    return _cachedProviders
  }

  const providers = buildProviders()

  // Ollama check is slightly expensive (network), do it here
  const ollama = providers.find(p => p.id === 'ollama')
  if (ollama) {
    ollama.available = isOllamaRunning()
  }

  _cachedProviders = providers
  _cacheTime = now
  return providers
}

/**
 * Get a specific provider by ID. Returns undefined if not found.
 */
export function getProvider(id: string): ModelProvider | undefined {
  return getAvailableProviders().find(p => p.id === id)
}

/**
 * Flat list of all models across all providers, for UI dropdown rendering.
 */
export function getAllModels(): Array<ModelEntry & { providerId: string; providerLabel: string; available: boolean }> {
  const providers = getAvailableProviders()
  const result: Array<ModelEntry & { providerId: string; providerLabel: string; available: boolean }> = []

  for (const p of providers) {
    for (const m of p.models) {
      result.push({
        ...m,
        providerId: p.id,
        providerLabel: p.label,
        available: p.available,
      })
    }
  }

  return result
}

/**
 * Invalidate the provider cache (e.g. after user configures a new key).
 */
export function invalidateProviderCache(): void {
  _cachedProviders = null
  _cacheTime = 0
}

/**
 * Serialize provider list for IPC transport (strips functions, keeps data).
 */
export interface ModelProviderSerialized {
  id: string
  name: string
  type: ProviderType
  label: string
  baseUrl?: string
  available: boolean
  description: string
  models: ModelEntry[]
}

export function serializeProviders(providers: ModelProvider[]): ModelProviderSerialized[] {
  return providers.map(({ id, name, type, label, baseUrl, available, description, models }) => ({
    id, name, type, label, baseUrl, available, description, models,
  }))
}
