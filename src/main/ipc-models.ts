// ── Model Provider IPC handlers (X7) ──
// Exposes model/provider info to the renderer process.

import { ipcMain } from 'electron'
import {
  getAvailableProviders,
  invalidateProviderCache,
  serializeProviders,
} from './model-providers'

// Per-terminal model overrides stored in memory (not persisted across restarts)
const terminalModelOverrides = new Map<string, string>()

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
