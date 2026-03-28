// ── HAL-O Instance Configuration ──
// Supports running multiple HAL-O clones (work-assistant, personal-assistant, etc.)
// Each clone gets isolated data directories, ports, and identity.
//
// How it works:
//   - If instance.json exists at the repo root → clone mode (isolated data dir)
//   - If no instance.json → main HAL-O mode (backward-compat ~/.hal-o/)
//
// Data layout:
//   ~/.hal-o/                     ← HAL-O main (no instance.json)
//   ~/.hal-o/instances/<id>/      ← each clone gets its own dir

import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Types ──

export interface InstanceConfig {
  /** Unique ID for this instance (e.g. "work-assistant", "personal-assistant") */
  id: string
  /** Human-readable name (e.g. "Work Assistant") */
  name: string
  /** HTTP API port (default: 19400 for main, must differ per instance) */
  port?: number
  /** HTTPS proxy port (default: port + 1) */
  httpsPort?: number
  /** Description shown in UI */
  description?: string
}

// ── Resolution (runs once at module load) ──

const HOME = process.env.USERPROFILE || process.env.HOME || ''
const HAL_O_BASE = join(HOME, '.hal-o')
const INSTANCE_JSON = join(process.cwd(), 'instance.json')

let _config: InstanceConfig | null = null
let _loaded = false

function loadConfig(): InstanceConfig | null {
  if (_loaded) return _config
  _loaded = true
  try {
    if (existsSync(INSTANCE_JSON)) {
      const raw = JSON.parse(readFileSync(INSTANCE_JSON, 'utf-8'))
      if (raw.id && typeof raw.id === 'string') {
        _config = {
          id: raw.id,
          name: raw.name || raw.id,
          port: raw.port,
          httpsPort: raw.httpsPort,
          description: raw.description,
        }
      }
    }
  } catch { /* no instance.json or invalid — main mode */ }
  return _config
}

// ── Public API ──

/** True when running as a clone (instance.json present) */
export function isClone(): boolean {
  return loadConfig() !== null
}

/** True when running as the main HAL-O instance */
export function isMain(): boolean {
  return !isClone()
}

/** Instance ID — "hal-o" for main, otherwise from instance.json */
export function getInstanceId(): string {
  return loadConfig()?.id ?? 'hal-o'
}

/** Human-readable instance name */
export function getInstanceName(): string {
  return loadConfig()?.name ?? 'HAL-O'
}

/**
 * Per-instance data directory.
 * - Main: ~/.hal-o/
 * - Clone: ~/.hal-o/instances/<id>/
 * Auto-creates the directory on first call.
 */
export function getDataDir(): string {
  const config = loadConfig()
  const dir = config
    ? join(HAL_O_BASE, 'instances', config.id)
    : HAL_O_BASE
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve a file path inside the instance data dir */
export function dataPath(...segments: string[]): string {
  return join(getDataDir(), ...segments)
}

/** HTTP API port (default 19400 for main) */
export function getPort(): number {
  return loadConfig()?.port ?? 19400
}

/** HTTPS proxy port (default: port + 1) */
export function getHttpsPort(): number {
  const config = loadConfig()
  return config?.httpsPort ?? (getPort() + 1)
}

/** Full instance config (null for main) */
export function getConfig(): InstanceConfig | null {
  return loadConfig()
}

/** Instance description */
export function getDescription(): string {
  return loadConfig()?.description ?? 'HAL-O Development Brain'
}

/**
 * Per-instance devlog directory.
 * - Main: <repo>/_devlog/ (tracked in git, documents HAL-O's development)
 * - Clone: ~/.hal-o/instances/<id>/devlogs/ (not in repo, backed up via cloud sync)
 */
export function getDevlogDir(): string {
  const config = loadConfig()
  if (config) {
    const dir = join(getDataDir(), 'devlogs')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }
  // Main instance: devlogs live in the repo
  return join(process.cwd(), '_devlog')
}
