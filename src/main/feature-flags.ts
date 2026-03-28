// ── Feature Flags ──
// Simple JSON-backed feature flag system.
// Flags persist in dataPath('feature-flags.json') — per-instance.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { ipcMain } from 'electron'
import { dataPath } from './instance'

// ── Default flags (alpha) ──

const DEFAULT_FLAGS: Record<string, boolean> = {
  debate: true,            // Multi-agent debate system
  voiceProfiles: true,     // Voice profile selection
  haloChatAuth: true,      // Bearer token auth for Halo Chat
  themeVariants: true,     // 3D theme diversity
  cloudSync: false,        // Not built yet
  marketplace: false,      // Not built yet
  dndMode: false,          // D&D stats for debate agents (easter egg)
}

// ── State ──

let _flags: Record<string, boolean> | null = null

function flagsPath(): string {
  return dataPath('feature-flags.json')
}

function load(): Record<string, boolean> {
  if (_flags) return _flags

  const fp = flagsPath()
  if (existsSync(fp)) {
    try {
      const raw = JSON.parse(readFileSync(fp, 'utf-8'))
      // Merge with defaults so new flags are picked up on upgrade
      _flags = { ...DEFAULT_FLAGS, ...raw }
    } catch {
      console.warn('[feature-flags] Corrupt flags file, resetting to defaults')
      _flags = { ...DEFAULT_FLAGS }
    }
  } else {
    _flags = { ...DEFAULT_FLAGS }
  }

  // Persist merged result (picks up any new defaults)
  save()
  return _flags
}

function save(): void {
  if (!_flags) return
  try {
    writeFileSync(flagsPath(), JSON.stringify(_flags, null, 2), 'utf-8')
  } catch (err) {
    console.error('[feature-flags] Failed to save:', err)
  }
}

// ── Public API ──

/** Check if a feature flag is enabled */
export function isEnabled(flag: string): boolean {
  const flags = load()
  return flags[flag] ?? false
}

/** Set a feature flag value (auto-saves) */
export function setFlag(flag: string, value: boolean): void {
  const flags = load()
  flags[flag] = value
  save()
}

/** Get all flags as a plain object */
export function getAllFlags(): Record<string, boolean> {
  return { ...load() }
}

/** Reset all flags to defaults (auto-saves) */
export function resetFlags(): void {
  _flags = { ...DEFAULT_FLAGS }
  save()
}

// ── IPC Handlers ──

export function registerFeatureFlagHandlers(): void {
  ipcMain.handle('feature-flags-get', () => getAllFlags())
  ipcMain.handle('feature-flags-set', (_e, flag: string, value: boolean) => {
    setFlag(flag, value)
    return getAllFlags()
  })
}
