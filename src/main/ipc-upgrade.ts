// ── S5: Upgrade IPC Handlers ──
// Exposes upgrade engine functionality to the renderer via IPC

import { ipcMain } from 'electron'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  buildUpgradePreview,
  applyUpgrade,
  restoreFromBackup,
  listBackups,
  type UpgradePreview,
  type UpgradeResult,
  type RollbackResult,
} from './upgrade-engine'
import { RULES_VERSION, HAL_O_VERSION } from './version'

export function registerUpgradeHandlers(): void {

  // ── Check if upgrade is available for a project ──
  ipcMain.handle('check-upgrade-available', async (_event, projectPath: string) => {
    try {
      if (!projectPath || typeof projectPath !== 'string' || !existsSync(projectPath)) {
        return { available: false, reason: 'invalid-path', error: 'Project path does not exist' }
      }
      const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
      if (!existsSync(metaPath)) {
        // Check if this is a pre-versioning project (has .claude/ dir but no meta)
        const claudeDir = join(projectPath, '.claude')
        if (existsSync(claudeDir)) {
          return {
            available: true,
            reason: 'pre-versioning',
            currentVersion: 0,
            targetVersion: RULES_VERSION,
            currentAppVersion: '0.0.0',
            targetAppVersion: HAL_O_VERSION,
          }
        }
        return { available: false, reason: 'no-meta' }
      }

      let meta: any
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      } catch {
        // Corrupted meta file — treat as version 0 so upgrade can repair it
        return {
          available: true,
          reason: 'corrupted-meta',
          currentVersion: 0,
          targetVersion: RULES_VERSION,
          currentAppVersion: '0.0.0',
          targetAppVersion: HAL_O_VERSION,
        }
      }

      const currentVersion = typeof meta.rulesVersion === 'number' ? meta.rulesVersion : 0

      if (currentVersion >= RULES_VERSION) {
        return {
          available: false,
          reason: 'up-to-date',
          currentVersion,
          targetVersion: RULES_VERSION,
          currentAppVersion: meta.halOVersion || '0.0.0',
          targetAppVersion: HAL_O_VERSION,
        }
      }

      return {
        available: true,
        reason: 'outdated',
        currentVersion,
        targetVersion: RULES_VERSION,
        currentAppVersion: meta.halOVersion || '0.0.0',
        targetAppVersion: HAL_O_VERSION,
      }
    } catch (e: any) {
      return { available: false, reason: 'error', error: e.message }
    }
  })

  // ── Preview what an upgrade would change ──
  ipcMain.handle('preview-upgrade', async (_event, projectPath: string) => {
    try {
      if (!projectPath || typeof projectPath !== 'string' || !existsSync(projectPath)) {
        return { success: false, error: 'Project path does not exist' }
      }
      // Read the project's meta to reconstruct its config
      const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
      let meta: any = {}

      if (existsSync(metaPath)) {
        try {
          meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        } catch {
          // Corrupted meta — proceed with empty meta (version 0) so upgrade can repair
          meta = { rulesVersion: 0, halOVersion: '0.0.0', corrupted: true }
        }
      } else {
        // Pre-versioning project or never enlisted — check if .claude/ dir exists
        const claudeDir = join(projectPath, '.claude')
        if (!existsSync(claudeDir)) {
          return { success: false, error: 'No .claude/ directory found. This project has not been set up with HAL-O yet.' }
        }
        // Pre-versioning: treat as version 0
        meta = { rulesVersion: 0, halOVersion: '0.0.0' }
      }

      // Try to reconstruct the config from existing files
      const config = reconstructConfig(projectPath, meta)

      const preview = buildUpgradePreview(projectPath, config)
      return { success: true, preview }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ── Apply upgrade with selected sections ──
  ipcMain.handle('apply-upgrade', async (_event, projectPath: string, acceptedSectionIds: string[]) => {
    try {
      if (!projectPath || typeof projectPath !== 'string' || !existsSync(projectPath)) {
        return { success: false, log: ['[ERROR] Project path does not exist'], backupPath: '', upgradedSections: [], skippedSections: [] }
      }
      if (!Array.isArray(acceptedSectionIds) || acceptedSectionIds.length === 0) {
        return { success: false, log: ['[ERROR] No sections selected for upgrade'], backupPath: '', upgradedSections: [], skippedSections: [] }
      }
      const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
      let meta: any = {}

      if (existsSync(metaPath)) {
        try {
          meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        } catch {
          meta = { rulesVersion: 0, halOVersion: '0.0.0' }
        }
      } else {
        meta = { rulesVersion: 0, halOVersion: '0.0.0' }
      }

      const config = reconstructConfig(projectPath, meta)
      const preview = buildUpgradePreview(projectPath, config)

      const result = applyUpgrade(projectPath, preview.sections, acceptedSectionIds)
      return result
    } catch (e: any) {
      return { success: false, log: [`[ERROR] ${e.message}`], backupPath: '', upgradedSections: [], skippedSections: [] }
    }
  })

  // ── Rollback to a specific backup ──
  ipcMain.handle('rollback-upgrade', async (_event, projectPath: string, backupPath: string) => {
    try {
      if (!backupPath || !existsSync(backupPath)) {
        return { success: false, log: ['[ERROR] Backup directory not found or invalid path'], restoredFiles: [] }
      }
      const result = restoreFromBackup(projectPath, backupPath)
      return result
    } catch (e: any) {
      return { success: false, log: [`[ERROR] ${e.message}`], restoredFiles: [] }
    }
  })

  // ── List available backups ──
  ipcMain.handle('list-upgrade-backups', async (_event, projectPath: string) => {
    try {
      return listBackups(projectPath)
    } catch {
      return []
    }
  })
}

/**
 * Reconstruct a project config from its meta and existing files.
 * This is needed to generate the "new" content for comparison.
 */
function reconstructConfig(projectPath: string, meta: any): {
  agentName: string
  techStack: string
  languages: string[]
  description: string
  hooksSetup: string[]
  rulesSetup: string[]
  styling?: string
} {
  const name = projectPath.split(/[/\\]/).pop() || 'Project'

  // Try to read existing CLAUDE.md for hints
  let description = ''
  let techStack = ''
  const languages: string[] = []

  try {
    const claudeMd = readFileSync(join(projectPath, 'CLAUDE.md'), 'utf-8')
    const descMatch = claudeMd.match(/^#\s+(.+)$/m)
    if (descMatch) {
      // The line after the title might be the description
      const lines = claudeMd.split('\n')
      const titleIdx = lines.findIndex(l => l.startsWith('# '))
      if (titleIdx >= 0 && titleIdx + 2 < lines.length && lines[titleIdx + 1] === '' && lines[titleIdx + 2] && !lines[titleIdx + 2].startsWith('#')) {
        description = lines[titleIdx + 2]
      }
    }

    // Extract stack from CLAUDE.md
    const stackMatch = claudeMd.match(/\*\*Primary\*\*:\s*(.+)/)
    if (stackMatch) techStack = stackMatch[1]

    // Extract languages
    const langMatch = claudeMd.match(/\*\*Languages\*\*:\s*(.+)/)
    if (langMatch) {
      languages.push(...langMatch[1].split(',').map(l => l.trim()))
    }
  } catch { /* */ }

  // Try package.json for stack detection
  if (!techStack) {
    try {
      const pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) techStack = 'Next.js'
      else if (deps['electron']) techStack = 'Electron'
      else if (deps['react']) techStack = 'React'
      else if (deps['vue']) techStack = 'Vue'
      else techStack = 'Node.js'
    } catch { /* */ }
  }

  // Detect which hooks were originally set up
  const hooksSetup: string[] = []
  try {
    const settings = JSON.parse(readFileSync(join(projectPath, '.claude', 'settings.json'), 'utf-8'))
    if (settings.hooks?.SessionStart) hooksSetup.push('session-start')
    if (settings.hooks?.PostToolUse) {
      const matchers = JSON.stringify(settings.hooks.PostToolUse)
      if (matchers.includes('tsc')) hooksSetup.push('post-tool-tsc')
      if (matchers.includes('pycache')) hooksSetup.push('post-tool-pycache')
    }
    if (settings.hooks?.Notification) hooksSetup.push('telegram-notify')
  } catch { /* */ }

  // Detect which rules exist
  const rulesSetup: string[] = []
  try {
    const rulesDir = join(projectPath, '.claude', 'rules')
    if (existsSync(rulesDir)) {
      const files = readdirSync(rulesDir) as string[]
      if (files.includes('frontend.md')) rulesSetup.push('frontend')
      if (files.includes('ux.md')) rulesSetup.push('ux')
      if (files.includes('python-api.md')) rulesSetup.push('python-api')
      if (files.includes('node-api.md')) rulesSetup.push('node-api')
      if (files.includes('banned-techniques.md')) rulesSetup.push('banned-techniques')
      if (files.includes('profiling.md')) rulesSetup.push('profiling')
    }
  } catch { /* */ }

  // Agent name from meta or folder name
  const agentName = meta?.agentName || name

  return {
    agentName,
    techStack,
    languages,
    description,
    hooksSetup,
    rulesSetup,
  }
}
