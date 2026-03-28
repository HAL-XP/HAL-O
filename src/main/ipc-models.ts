// ── Model Provider IPC handlers (X7) ──
// Exposes model/provider info to the renderer process.

import { ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import {
  getAvailableProviders,
  invalidateProviderCache,
  serializeProviders,
  listOllamaModels,
  pullOllamaModel,
  ollamaChat,
  type ModelRoutingConfig,
  MODEL_ROUTING_PRESETS,
} from './model-providers'
import { dataPath } from './instance'

// Per-terminal model overrides stored in memory (not persisted across restarts)
const terminalModelOverrides = new Map<string, string>()

// Model routing config file path (per-instance)
function routingConfigPath(): string {
  return dataPath('model-routing.json')
}

function loadRoutingConfig(): { preset: string; config: ModelRoutingConfig } {
  try {
    const p = routingConfigPath()
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf-8'))
    }
  } catch { /* ignore */ }
  // Default: Claude only (no local setup needed)
  return { preset: 'claudeOnly', config: MODEL_ROUTING_PRESETS.claudeOnly.config }
}

function saveRoutingConfig(preset: string, config: ModelRoutingConfig): void {
  writeFileSync(routingConfigPath(), JSON.stringify({ preset, config }, null, 2))
}

export function registerModelHandlers(): void {
  // Return all known providers with availability status
  ipcMain.handle('get-available-models', async () => {
    const providers = getAvailableProviders()
    return serializeProviders(providers)
  })

  // Set (or clear) the model override for a specific terminal session
  ipcMain.handle('set-terminal-model', async (_e, sessionId: string, modelId: string | null) => {
    if (modelId === null || modelId === 'default') {
      terminalModelOverrides.delete(sessionId)
    } else {
      terminalModelOverrides.set(sessionId, modelId)
    }
    return { success: true }
  })

  // Get the model override for a specific terminal session (null = use default)
  ipcMain.handle('get-terminal-model', async (_e, sessionId: string) => {
    return terminalModelOverrides.get(sessionId) || null
  })

  // Force-refresh provider availability cache
  ipcMain.handle('refresh-model-providers', async () => {
    invalidateProviderCache()
    const providers = getAvailableProviders()
    return serializeProviders(providers)
  })

  // List models available in Ollama
  ipcMain.handle('list-ollama-models', async () => {
    return await listOllamaModels()
  })

  // Pull a model in Ollama
  ipcMain.handle('pull-ollama-model', async (_e, modelName: string) => {
    return await pullOllamaModel(modelName)
  })

  // Get model routing config
  ipcMain.handle('get-model-routing', async () => {
    return loadRoutingConfig()
  })

  // Save model routing config
  ipcMain.handle('set-model-routing', async (_e, preset: string, config: ModelRoutingConfig) => {
    saveRoutingConfig(preset, config)
    return { success: true }
  })

  // Get available presets
  ipcMain.handle('get-model-presets', async () => {
    return Object.entries(MODEL_ROUTING_PRESETS).map(([id, p]) => ({
      id,
      label: p.label,
      description: p.description,
      config: p.config,
    }))
  })

  // Test Ollama chat (quick connectivity + model test)
  ipcMain.handle('test-ollama-chat', async (_e, model: string, prompt: string) => {
    return await ollamaChat(model, [{ role: 'user', content: prompt }], { maxTokens: 100 })
  })
}

/**
 * Get the model override for a terminal (used by terminal-manager when spawning).
 * Returns null if no override is set.
 */
export function getTerminalModelOverride(sessionId: string): string | null {
  return terminalModelOverrides.get(sessionId) || null
}

/**
 * Clean up model override when a terminal is closed.
 */
export function clearTerminalModelOverride(sessionId: string): void {
  terminalModelOverrides.delete(sessionId)
}
