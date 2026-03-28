// ── Knowledge Base ──
// Provider knowledge cards + task routing.
// Loads from user data dir first, falls back to shipped _knowledge/ defaults.

import { existsSync, readFileSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { dataPath } from './instance'

// ── Types ──

export interface ProviderEntry {
  file: string
  enabled: boolean
  order: number
  defaultModel: string
  models: string[]
}

export interface KBIndex {
  providers: Record<string, ProviderEntry>
  taskRouting: Record<string, string[]>
}

// ── Path Resolution ──

const SHIPPED_KB = join(process.cwd(), '_knowledge')

/**
 * Resolve a knowledge-base path.
 * Checks the per-instance user data dir first, then falls back to the
 * repo-shipped _knowledge/ directory.
 */
function kbPath(...segments: string[]): string {
  const userPath = dataPath('knowledge-base', ...segments)
  if (existsSync(userPath)) return userPath
  return join(SHIPPED_KB, ...segments)
}

// ── In-memory cache (lazy, cleared on demand) ──

let _indexCache: KBIndex | null = null
let _providerCache = new Map<string, string>()

export function clearKBCache(): void {
  _indexCache = null
  _providerCache.clear()
}

// ── Public API ──

/** Load the full markdown content for a provider knowledge card. */
export function loadProviderKB(provider: string): string | null {
  if (_providerCache.has(provider)) return _providerCache.get(provider)!
  const filePath = kbPath('providers', `${provider}.md`)
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf-8')
  _providerCache.set(provider, content)
  return content
}

/** Load the index.json registry (providers + task routing). */
export function loadKBIndex(): KBIndex | null {
  if (_indexCache) return _indexCache
  const indexPath = kbPath('index.json')
  if (!existsSync(indexPath)) return null
  try {
    _indexCache = JSON.parse(readFileSync(indexPath, 'utf-8')) as KBIndex
    return _indexCache
  } catch {
    return null
  }
}

/** Get the recommended provider IDs for a given task type. */
export function getRecommendedProviders(task: string): string[] {
  const index = loadKBIndex()
  return index?.taskRouting[task] ?? []
}

/** List all known provider IDs from the index. */
export function listProviders(): string[] {
  const index = loadKBIndex()
  if (!index) return []
  return Object.entries(index.providers)
    .filter(([, v]) => v.enabled)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([k]) => k)
}

/** Load a task card markdown file. */
export function loadTaskCard(task: string): string | null {
  const filePath = kbPath('tasks', `${task}.md`)
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, 'utf-8')
}

/** List all available task card names. */
export function listTaskCards(): string[] {
  const tasksDir = kbPath('tasks')
  if (!existsSync(tasksDir)) return []
  return readdirSync(tasksDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
}

/**
 * Copy shipped defaults into the user data dir so the user can customize.
 * Only copies files that don't already exist (non-destructive).
 */
export function initUserKB(): void {
  const userBase = dataPath('knowledge-base')
  if (!existsSync(userBase)) mkdirSync(userBase, { recursive: true })

  const dirs = ['', 'providers', 'tasks']
  for (const sub of dirs) {
    const srcDir = join(SHIPPED_KB, sub)
    const dstDir = join(userBase, sub)
    if (!existsSync(srcDir)) continue
    if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true })

    for (const file of readdirSync(srcDir)) {
      const srcFile = join(srcDir, file)
      const dstFile = join(dstDir, file)
      // Only copy files, skip directories (handled by outer loop)
      try {
        const stat = readFileSync(srcFile)
        if (!existsSync(dstFile)) {
          writeFileSync(dstFile, stat)
        }
      } catch {
        // Skip directories or unreadable files
      }
    }
  }
}
