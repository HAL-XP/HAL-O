// ── S5: Versioning Upgrade Engine ──
// Handles diff computation, backup, restore, and content migration
// for HAL-O generated files (CLAUDE.md, rules, hooks, etc.)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync } from 'fs'
import { join, basename, dirname } from 'path'
import { RULES_VERSION, HAL_O_VERSION } from './version'

// ── Types ──

export interface UpgradeSection {
  /** Unique section ID (e.g. 'claude-md', 'rules/frontend.md', 'hooks') */
  id: string
  /** Human-readable label */
  label: string
  /** File path relative to project root */
  relativePath: string
  /** Current content on disk (empty string if file doesn't exist) */
  currentContent: string
  /** New content that would be written */
  newContent: string
  /** Diff lines for display (unified diff format) */
  diffLines: DiffLine[]
  /** Whether the section has actual changes */
  hasChanges: boolean
  /** Whether this section exists on disk */
  existsOnDisk: boolean
  /** Whether user customizations were detected (content differs from last known generated) */
  hasUserCustomizations: boolean
  /** Section type for grouping in UI */
  type: 'claude-md' | 'rule' | 'hooks' | 'meta'
}

export interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header'
  content: string
  lineNumber?: number
}

export interface UpgradePreview {
  /** Project path */
  projectPath: string
  /** Project name (from meta or folder) */
  projectName: string
  /** Current rules version on disk */
  currentVersion: number
  /** Target rules version */
  targetVersion: number
  /** Current HAL-O app version from meta */
  currentAppVersion: string
  /** Target HAL-O app version */
  targetAppVersion: string
  /** All sections with their diffs */
  sections: UpgradeSection[]
  /** Number of sections that actually have changes */
  changedCount: number
  /** Whether a backup already exists (from a failed previous attempt) */
  hasExistingBackup: boolean
  /** Summary of the version changelog */
  changelog: string[]
}

export interface UpgradeResult {
  success: boolean
  log: string[]
  /** Path to backup directory */
  backupPath: string
  /** Sections that were upgraded */
  upgradedSections: string[]
  /** Sections that were skipped (user rejected) */
  skippedSections: string[]
}

export interface RollbackResult {
  success: boolean
  log: string[]
  /** Files that were restored */
  restoredFiles: string[]
}

export interface HalOMeta {
  enlistedAt: string
  halOVersion: string
  rulesVersion: number
  filesCreated?: string[]
  /** Upgrade history for audit trail */
  upgradeHistory?: Array<{
    from: number
    to: number
    date: string
    appVersion: string
    backupPath: string
    sectionsUpgraded: string[]
  }>
}

// ── Version Changelog ──
// Maps rulesVersion numbers to human-readable changes

const VERSION_CHANGELOG: Record<number, string[]> = {
  1: [
    'Initial HAL-O rules generation',
  ],
  2: [
    'Added modular rule files (frontend, UX, API, etc.)',
    'Added hours tracking rule',
    'Added agent templates',
    'Added MEMORY.md seed generation',
  ],
  3: [
    'Added version markers to all generated sections',
    'CLAUDE.md: improved key conventions with React hooks rule',
    'CLAUDE.md: added performance section with compaction tips',
    'Rules: enhanced frontend.md with component patterns',
    'Rules: enhanced profiling.md with key metrics table',
    'Hooks: improved session start with branch detection',
    'Hooks: added PreCompact hook for context preservation',
    'Added upgrade engine with diff preview and rollback',
  ],
}

/** Get changelog entries between two versions */
export function getChangelog(fromVersion: number, toVersion: number): string[] {
  const entries: string[] = []
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const changes = VERSION_CHANGELOG[v]
    if (changes) {
      entries.push(`--- v${v} ---`)
      entries.push(...changes)
    }
  }
  return entries
}

// ── Diff Engine ──

/**
 * Compute a unified diff between two strings.
 * Produces context-aware diff lines suitable for UI display.
 */
export function computeDiff(oldText: string, newText: string, contextLines = 3): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // Simple LCS-based diff
  const lcs = computeLCS(oldLines, newLines)
  const rawDiff = buildRawDiff(oldLines, newLines, lcs)

  // Convert to unified diff with context
  return buildUnifiedDiff(rawDiff, oldLines, newLines, contextLines)
}

interface RawDiffEntry {
  type: 'keep' | 'remove' | 'add'
  oldIndex?: number
  newIndex?: number
}

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp
}

function buildRawDiff(oldLines: string[], newLines: string[], dp: number[][]): RawDiffEntry[] {
  const result: RawDiffEntry[] = []
  let i = oldLines.length
  let j = newLines.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'keep', oldIndex: i - 1, newIndex: j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', newIndex: j - 1 })
      j--
    } else {
      result.unshift({ type: 'remove', oldIndex: i - 1 })
      i--
    }
  }

  return result
}

function buildUnifiedDiff(rawDiff: RawDiffEntry[], oldLines: string[], newLines: string[], contextLines: number): DiffLine[] {
  const result: DiffLine[] = []

  // Find change hunks (groups of non-keep entries)
  const changes: number[] = []
  for (let i = 0; i < rawDiff.length; i++) {
    if (rawDiff[i].type !== 'keep') changes.push(i)
  }

  if (changes.length === 0) return []

  // Group changes into hunks with context
  let hunkStart = 0
  let hunkEnd = 0
  const hunks: Array<{ start: number; end: number }> = []

  for (let ci = 0; ci < changes.length; ci++) {
    if (ci === 0) {
      hunkStart = Math.max(0, changes[ci] - contextLines)
      hunkEnd = Math.min(rawDiff.length - 1, changes[ci] + contextLines)
    } else {
      const newStart = Math.max(0, changes[ci] - contextLines)
      const newEnd = Math.min(rawDiff.length - 1, changes[ci] + contextLines)

      if (newStart <= hunkEnd + 1) {
        // Merge with current hunk
        hunkEnd = newEnd
      } else {
        // Start a new hunk
        hunks.push({ start: hunkStart, end: hunkEnd })
        hunkStart = newStart
        hunkEnd = newEnd
      }
    }
  }
  hunks.push({ start: hunkStart, end: hunkEnd })

  // Build diff lines for each hunk
  for (const hunk of hunks) {
    // Hunk header
    const oldStart = rawDiff[hunk.start].oldIndex ?? 0
    const newStart = rawDiff[hunk.start].newIndex ?? 0
    result.push({
      type: 'header',
      content: `@@ -${oldStart + 1} +${newStart + 1} @@`,
    })

    for (let i = hunk.start; i <= hunk.end && i < rawDiff.length; i++) {
      const entry = rawDiff[i]
      switch (entry.type) {
        case 'keep':
          result.push({
            type: 'context',
            content: oldLines[entry.oldIndex!],
            lineNumber: entry.newIndex! + 1,
          })
          break
        case 'remove':
          result.push({
            type: 'removed',
            content: oldLines[entry.oldIndex!],
            lineNumber: entry.oldIndex! + 1,
          })
          break
        case 'add':
          result.push({
            type: 'added',
            content: newLines[entry.newIndex!],
            lineNumber: entry.newIndex! + 1,
          })
          break
      }
    }
  }

  return result
}

// ── Content Dedup ──

/**
 * Check if content already contains a specific section.
 * Uses marker comments and fuzzy content matching.
 */
function contentAlreadyContains(existing: string, section: string): boolean {
  // Exact marker match
  const markerMatch = section.match(/<!-- hal-o:v\d+:(\w+) -->/)
  if (markerMatch) {
    const marker = markerMatch[0]
    if (existing.includes(marker)) return true
  }

  // Fuzzy: check if >80% of non-empty lines from section exist in existing
  const sectionLines = section.split('\n').filter(l => l.trim().length > 10)
  if (sectionLines.length === 0) return false

  let matches = 0
  for (const line of sectionLines) {
    if (existing.includes(line.trim())) matches++
  }

  return matches / sectionLines.length > 0.8
}

// ── Backup System ──

/**
 * Create a timestamped backup of all files that will be modified.
 * Returns the backup directory path.
 */
export function createBackup(projectPath: string, filesToBackup: string[]): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupDir = join(projectPath, '.claude', 'backups', timestamp)
  mkdirSync(backupDir, { recursive: true })

  for (const relPath of filesToBackup) {
    const srcPath = join(projectPath, relPath)
    if (existsSync(srcPath)) {
      const destDir = join(backupDir, dirname(relPath))
      mkdirSync(destDir, { recursive: true })
      copyFileSync(srcPath, join(backupDir, relPath))
    }
  }

  // Write a manifest for the backup
  const manifest = {
    timestamp,
    projectPath,
    files: filesToBackup.filter(f => existsSync(join(projectPath, f))),
    rulesVersionBefore: getCurrentMetaVersion(projectPath),
    halOVersionBefore: getCurrentMetaAppVersion(projectPath),
  }
  writeFileSync(join(backupDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  return backupDir
}

/**
 * Restore files from a backup directory.
 */
export function restoreFromBackup(projectPath: string, backupPath: string): RollbackResult {
  const log: string[] = []
  const restoredFiles: string[] = []

  try {
    const manifestPath = join(backupPath, '_manifest.json')
    if (!existsSync(manifestPath)) {
      log.push('[ERROR] Backup manifest not found')
      return { success: false, log, restoredFiles }
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

    for (const relPath of manifest.files) {
      const srcPath = join(backupPath, relPath)
      const destPath = join(projectPath, relPath)

      if (existsSync(srcPath)) {
        const destDir = join(projectPath, dirname(relPath))
        mkdirSync(destDir, { recursive: true })
        copyFileSync(srcPath, destPath)
        restoredFiles.push(relPath)
        log.push(`[RESTORED] ${relPath}`)
      }
    }

    // Restore meta version
    if (typeof manifest.rulesVersionBefore === 'number') {
      const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        meta.rulesVersion = manifest.rulesVersionBefore
        meta.halOVersion = manifest.halOVersionBefore || meta.halOVersion
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        log.push('[RESTORED] Meta version rolled back')
      }
    }

    log.push(`[OK] Rollback complete — ${restoredFiles.length} files restored`)
    return { success: true, log, restoredFiles }
  } catch (e: any) {
    log.push(`[ERROR] Rollback failed: ${e.message}`)
    return { success: false, log, restoredFiles }
  }
}

/**
 * List available backups for a project (newest first).
 */
export function listBackups(projectPath: string): Array<{
  path: string
  timestamp: string
  rulesVersionBefore: number
  fileCount: number
}> {
  const backupRoot = join(projectPath, '.claude', 'backups')
  if (!existsSync(backupRoot)) return []

  try {
    const dirs = readdirSync(backupRoot)
      .filter(d => {
        try { return statSync(join(backupRoot, d)).isDirectory() } catch { return false }
      })
      .sort()
      .reverse()

    return dirs.map(dir => {
      const manifestPath = join(backupRoot, dir, '_manifest.json')
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        return {
          path: join(backupRoot, dir),
          timestamp: manifest.timestamp || dir,
          rulesVersionBefore: manifest.rulesVersionBefore ?? 0,
          fileCount: manifest.files?.length ?? 0,
        }
      } catch {
        return {
          path: join(backupRoot, dir),
          timestamp: dir,
          rulesVersionBefore: 0,
          fileCount: 0,
        }
      }
    })
  } catch {
    return []
  }
}

// ── Meta helpers ──

function getCurrentMetaVersion(projectPath: string): number {
  try {
    const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    return typeof meta.rulesVersion === 'number' ? meta.rulesVersion : 0
  } catch {
    return 0
  }
}

function getCurrentMetaAppVersion(projectPath: string): string {
  try {
    const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    return meta.halOVersion || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function readMeta(projectPath: string): HalOMeta | null {
  try {
    const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
    return JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

// ── Preview Engine ──

/**
 * Build a complete upgrade preview for a project.
 * This reads all current files, generates what the new versions would look like,
 * and computes diffs for each section.
 */
export function buildUpgradePreview(projectPath: string, config: {
  agentName: string
  techStack: string
  languages: string[]
  description: string
  hooksSetup: string[]
  rulesSetup: string[]
  styling?: string
}): UpgradePreview {
  const meta = readMeta(projectPath)
  const currentVersion = meta?.rulesVersion ?? 0
  const currentAppVersion = meta?.halOVersion ?? '0.0.0'
  const filesCreated = meta?.filesCreated ?? []

  const sections: UpgradeSection[] = []

  // 1. CLAUDE.md section
  const claudeMdPath = join(projectPath, 'CLAUDE.md')
  const currentClaudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf-8') : ''

  // Detect if CLAUDE.md was created by HAL-O (has marker or is in filesCreated)
  const isHalOClaudeMd = filesCreated.includes('CLAUDE.md') ||
    currentClaudeMd.includes('<!-- HAL-O additions -->') ||
    currentClaudeMd.includes('<!-- hal-o:')

  if (isHalOClaudeMd || !existsSync(claudeMdPath)) {
    // Generate new CLAUDE.md content
    // We need to import the generator — but to avoid circular deps, we reconstruct the key parts
    const newClaudeMd = generateUpgradedClaudeMd(config)

    // If the file has user customizations (content outside HAL-O markers), preserve them
    const hasUserCustomizations = detectUserCustomizations(currentClaudeMd)

    let mergedNewContent: string
    if (hasUserCustomizations && currentClaudeMd.includes('<!-- HAL-O additions -->')) {
      // Preserve user content, only replace HAL-O sections
      mergedNewContent = mergeClaudeMdSections(currentClaudeMd, newClaudeMd)
    } else if (hasUserCustomizations) {
      // User has CLAUDE.md but it wasn't created by HAL-O append mode
      // Append HAL-O section instead of replacing
      mergedNewContent = currentClaudeMd + '\n\n' + generateHalOAppendSection()
    } else {
      mergedNewContent = newClaudeMd
    }

    const diffLines = computeDiff(currentClaudeMd, mergedNewContent)
    sections.push({
      id: 'claude-md',
      label: 'CLAUDE.md',
      relativePath: 'CLAUDE.md',
      currentContent: currentClaudeMd,
      newContent: mergedNewContent,
      diffLines,
      hasChanges: diffLines.length > 0,
      existsOnDisk: existsSync(claudeMdPath),
      hasUserCustomizations,
      type: 'claude-md',
    })
  }

  // 2. Rule files
  const rulesDir = join(projectPath, '.claude', 'rules')
  const ruleFiles = generateUpgradedRuleFiles(config)

  for (const [filename, newContent] of Object.entries(ruleFiles)) {
    const rulePath = join(rulesDir, filename)
    const currentContent = existsSync(rulePath) ? readFileSync(rulePath, 'utf-8') : ''
    const diffLines = computeDiff(currentContent, newContent)
    const isTracked = filesCreated.includes(`.claude/rules/${filename}`)

    sections.push({
      id: `rules/${filename}`,
      label: `Rule: ${filename}`,
      relativePath: `.claude/rules/${filename}`,
      currentContent,
      newContent,
      diffLines,
      hasChanges: diffLines.length > 0,
      existsOnDisk: existsSync(rulePath),
      hasUserCustomizations: isTracked && currentContent !== '' && !contentAlreadyContains(newContent, currentContent),
      type: 'rule',
    })
  }

  // 3. Hooks settings
  const settingsPath = join(projectPath, '.claude', 'settings.json')
  if (filesCreated.includes('.claude/settings.json') || !existsSync(settingsPath)) {
    const currentSettings = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf-8') : ''
    const newSettings = generateUpgradedHooksSettings(config)
    const newSettingsStr = JSON.stringify(newSettings, null, 2)
    const diffLines = computeDiff(currentSettings, newSettingsStr)

    sections.push({
      id: 'hooks',
      label: 'Hooks (settings.json)',
      relativePath: '.claude/settings.json',
      currentContent: currentSettings,
      newContent: newSettingsStr,
      diffLines,
      hasChanges: diffLines.length > 0,
      existsOnDisk: existsSync(settingsPath),
      hasUserCustomizations: false, // Hooks are fully generated
      type: 'hooks',
    })
  }

  const changedSections = sections.filter(s => s.hasChanges)
  const backups = listBackups(projectPath)

  return {
    projectPath,
    projectName: config.agentName || basename(projectPath),
    currentVersion,
    targetVersion: RULES_VERSION,
    currentAppVersion,
    targetAppVersion: HAL_O_VERSION,
    sections,
    changedCount: changedSections.length,
    hasExistingBackup: backups.length > 0,
    changelog: getChangelog(currentVersion, RULES_VERSION),
  }
}

// ── Apply Upgrade ──

/**
 * Apply selected sections from an upgrade preview.
 * Creates a backup first, then writes the new content.
 */
export function applyUpgrade(
  projectPath: string,
  sections: UpgradeSection[],
  acceptedSectionIds: string[],
): UpgradeResult {
  const log: string[] = []
  const upgradedSections: string[] = []
  const skippedSections: string[] = []

  // Determine which files need backup
  const filesToBackup = sections
    .filter(s => s.existsOnDisk)
    .map(s => s.relativePath)

  // Also backup the meta file
  filesToBackup.push('.claude/.hal-o-meta.json')

  // 1. Create backup
  let backupPath: string
  try {
    backupPath = createBackup(projectPath, filesToBackup)
    log.push(`[OK] Backup created: ${basename(backupPath)}`)
  } catch (e: any) {
    log.push(`[ERROR] Backup failed: ${e.message}`)
    return { success: false, log, backupPath: '', upgradedSections, skippedSections }
  }

  // 2. Apply accepted sections
  try {
    for (const section of sections) {
      if (!section.hasChanges) continue

      if (!acceptedSectionIds.includes(section.id)) {
        skippedSections.push(section.id)
        log.push(`[SKIP] ${section.label} (rejected by user)`)
        continue
      }

      const fullPath = join(projectPath, section.relativePath)
      const dir = dirname(fullPath)
      mkdirSync(dir, { recursive: true })
      writeFileSync(fullPath, section.newContent, 'utf-8')
      upgradedSections.push(section.id)
      log.push(`[OK] Updated ${section.label}`)
    }

    // 3. Update meta
    const metaPath = join(projectPath, '.claude', '.hal-o-meta.json')
    const meta: HalOMeta = readMeta(projectPath) || {
      enlistedAt: new Date().toISOString(),
      halOVersion: HAL_O_VERSION,
      rulesVersion: RULES_VERSION,
    }

    const previousVersion = meta.rulesVersion ?? 0
    meta.rulesVersion = RULES_VERSION
    meta.halOVersion = HAL_O_VERSION

    if (!meta.upgradeHistory) meta.upgradeHistory = []
    meta.upgradeHistory.push({
      from: previousVersion,
      to: RULES_VERSION,
      date: new Date().toISOString(),
      appVersion: HAL_O_VERSION,
      backupPath,
      sectionsUpgraded: upgradedSections,
    })

    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    log.push('[OK] Updated .hal-o-meta.json')

    log.push('')
    log.push(`[OK] Upgrade complete! ${upgradedSections.length} sections updated, ${skippedSections.length} skipped`)

    return { success: true, log, backupPath, upgradedSections, skippedSections }
  } catch (e: any) {
    // On failure, attempt rollback
    log.push(`[ERROR] Upgrade failed: ${e.message}`)
    log.push('[INFO] Attempting automatic rollback...')

    const rollback = restoreFromBackup(projectPath, backupPath)
    log.push(...rollback.log)

    return { success: false, log, backupPath, upgradedSections, skippedSections }
  }
}

// ── Content Generators (versioned) ──
// These mirror generators.ts but add version markers

function generateUpgradedClaudeMd(config: {
  agentName: string
  techStack: string
  languages: string[]
  description: string
  styling?: string
}): string {
  const lines: string[] = []

  lines.push(`<!-- hal-o:v${RULES_VERSION}:header -->`)
  lines.push(`# ${config.agentName}`)
  lines.push('')

  if (config.description) {
    lines.push(config.description)
    lines.push('')
  }

  lines.push(`<!-- hal-o:v${RULES_VERSION}:stack -->`)
  lines.push('## Stack')
  lines.push(`- **Primary**: ${config.techStack || 'Not specified'}`)
  if (config.languages.length) {
    lines.push(`- **Languages**: ${config.languages.join(', ')}`)
  }
  lines.push('')

  lines.push(`<!-- hal-o:v${RULES_VERSION}:conventions -->`)
  lines.push('## Key Conventions')
  lines.push('- API keys in `~/.claude_credentials` (bash-sourceable), never in repo')

  const hasFrontend = /react|vue|svelte|next|nuxt|electron|vite|angular|frontend/i.test(config.techStack)
  if (hasFrontend) {
    lines.push('- All API calls go through `src/services/` -- never call APIs from components directly')
    if (config.styling === 'tailwind') {
      lines.push('- Use Tailwind utility classes exclusively -- no CSS files, no inline styles')
    }
    lines.push('- All React hooks (useState, useEffect, useRef) MUST be placed BEFORE any conditional return -- violating this causes silent crashes')
  }

  const hasPython = /python|fastapi|django|flask/i.test(config.techStack) || config.languages.some(l => /python/i.test(l))
  if (hasPython) {
    lines.push('- Python scripts must start with `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` on Windows')
  }

  lines.push('- NEVER kill processes by name -- always by PID from `.claude/.pids`')
  lines.push('- Save PIDs when launching background processes, kill by PID (see `.claude/rules/` for platform command)')
  lines.push('- Messages prefixed with `[voice]` are spoken by the user via microphone -- respond concisely and conversationally')
  lines.push('- Long-running commands (builds, installs, generation) should use `run_in_background: true` -- never block the terminal for more than ~5 seconds')
  lines.push('- Never estimate complexity from a human POV -- always propose the AAA solution first')
  lines.push('')

  lines.push(`<!-- hal-o:v${RULES_VERSION}:performance -->`)
  lines.push('## Performance')
  lines.push('- Set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80` in your environment for earlier context compaction (preserves more working context in long sessions)')
  lines.push('- Keep `MEMORY.md` updated at natural milestones -- it survives compaction and session boundaries')
  lines.push('')

  lines.push(`<!-- hal-o:v${RULES_VERSION}:key-files -->`)
  lines.push('## Key Files')
  lines.push('| File | Purpose |')
  lines.push('|------|---------|')
  lines.push('| `.claude/rules/` | Domain-specific rules (auto-loaded) |')
  lines.push('')

  lines.push(`<!-- hal-o:v${RULES_VERSION}:footer -->`)

  return lines.join('\n')
}

function generateHalOAppendSection(): string {
  const lines = [
    `<!-- hal-o:v${RULES_VERSION}:append-start -->`,
    '',
    '---',
    '',
    '## HAL-O Best Practices (auto-generated)',
    '',
    '- API keys in `~/.claude_credentials` (bash-sourceable), never in repo',
    '- NEVER kill processes by name -- always by PID',
    '- Messages prefixed with `[voice]` are spoken by the user via microphone',
    '- Save PIDs when launching background processes, kill by PID (see `.claude/rules/` for platform command)',
    '- All React hooks (useState, useEffect, useRef) MUST be placed BEFORE any conditional return -- violating this causes silent crashes',
    '- Long-running commands (builds, installs, generation) should use `run_in_background: true`',
    '',
    `<!-- hal-o:v${RULES_VERSION}:append-end -->`,
  ]
  return lines.join('\n')
}

/**
 * Merge HAL-O sections into an existing CLAUDE.md that uses the append format.
 * Preserves everything outside <!-- HAL-O additions --> markers.
 */
function mergeClaudeMdSections(existing: string, _newGenerated: string): string {
  // Replace the HAL-O additions block with the new version
  const startMarker = '<!-- HAL-O additions -->'
  const endMarker = '<!-- /HAL-O additions -->'

  const startIdx = existing.indexOf(startMarker)
  const endIdx = existing.indexOf(endMarker)

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx)
    const after = existing.slice(endIdx + endMarker.length)
    return before + generateHalOAppendSection() + after
  }

  // Check for versioned markers
  const versionedStart = existing.match(/<!-- hal-o:v\d+:append-start -->/)
  const versionedEnd = existing.match(/<!-- hal-o:v\d+:append-end -->/)

  if (versionedStart && versionedEnd) {
    const vStartIdx = existing.indexOf(versionedStart[0])
    const vEndIdx = existing.indexOf(versionedEnd[0])
    if (vStartIdx !== -1 && vEndIdx !== -1) {
      const before = existing.slice(0, vStartIdx)
      const after = existing.slice(vEndIdx + versionedEnd[0].length)
      return before + generateHalOAppendSection() + after
    }
  }

  // Fallback: append at end
  return existing + '\n\n' + generateHalOAppendSection()
}

function detectUserCustomizations(content: string): boolean {
  if (!content) return false

  // If it has HAL-O markers and content outside them, user has customized
  const hasHalOMarkers = content.includes('<!-- HAL-O additions -->') ||
    content.includes('<!-- hal-o:') ||
    content.includes('HAL-O Best Practices')

  if (!hasHalOMarkers) {
    // No HAL-O markers at all — this is entirely user content
    return content.trim().length > 0
  }

  // Check if there's substantial content outside the markers
  let cleaned = content
  // Remove HAL-O sections
  cleaned = cleaned.replace(/<!-- hal-o:v\d+:\w+ -->/g, '')
  cleaned = cleaned.replace(/<!-- HAL-O additions -->[\s\S]*?<!-- \/HAL-O additions -->/g, '')
  cleaned = cleaned.replace(/## HAL-O Best Practices[\s\S]*$/m, '')

  const remainingLines = cleaned.split('\n').filter(l => l.trim().length > 0)
  return remainingLines.length > 5  // More than just a title and blank lines
}

function generateUpgradedRuleFiles(config: {
  techStack: string
  languages: string[]
  styling?: string
}): Record<string, string> {
  const files: Record<string, string> = {}

  const hasFrontend = /react|vue|svelte|next|nuxt|electron|vite|angular|frontend/i.test(config.techStack)
  const hasPython = /python|fastapi|django|flask/i.test(config.techStack) || config.languages.some(l => /python/i.test(l))
  const hasNode = /node|express|nestjs|fullstack-node/i.test(config.techStack)

  if (hasFrontend) {
    const styling = config.styling === 'tailwind'
      ? `## Styling\n- Use Tailwind utility classes exclusively. No CSS files, no inline \`style={}\`.\n- Use \`cn()\` from \`@/lib/utils\` for conditional/merged classes.\n- No arbitrary hex colors -- use Tailwind tokens.`
      : '## Styling\n- Follow the project\'s styling conventions consistently.'

    files['frontend.md'] = `<!-- hal-o:v${RULES_VERSION}:frontend -->
# Frontend Rules

${styling}

## Component Patterns
- Keep components focused -- one responsibility per component.
- Fetch errors: catch, extract message, show via toast. Never silently swallow.
- Use custom dialog components instead of \`window.alert()\` / \`window.confirm()\`.
- All React hooks (useState, useEffect, useRef) MUST be placed BEFORE any conditional return.
`
  }

  if (hasPython) {
    files['python-api.md'] = `<!-- hal-o:v${RULES_VERSION}:python-api -->
# API Rules (Python Backend)

## Server
- Backend runs on \`localhost:8000\`.
- MANDATORY: \`sys.stdout.reconfigure(encoding="utf-8", errors="replace")\` in every Python script.

## MANDATORY: Restart API After Backend Changes
After ANY change to Python files:
1. Find PIDs: \`ps aux | grep python\` (or \`tasklist | grep python\` on Windows)
2. Kill: \`kill -TERM <pid>\` (or \`taskkill //PID <pid> //F\` on Windows)
3. Clear pycache: \`find . -name "__pycache__" -type d -exec rm -rf {} +\`
4. Restart in background
5. Verify: \`curl -s http://localhost:8000/health\`

## Route Patterns
- Heavy operations go through job queue -- never synchronous.
- Return JSON for data, raise appropriate HTTP exceptions for errors.
`
  }

  if (hasNode) {
    files['node-api.md'] = `<!-- hal-o:v${RULES_VERSION}:node-api -->
# API Rules (Node.js Backend)

## Server
- Backend runs on \`localhost:3000\` (or configured port).
- Use async/await consistently. Never block the event loop.

## Route Patterns
- Validate all input at the route handler level.
- Return consistent JSON shapes: \`{ data, error, message }\`.
- Heavy operations should use worker threads or queues.
- Log errors with context (request ID, user, action).
`
  }

  // Always include banned-techniques for tracked projects
  files['banned-techniques.md'] = `<!-- hal-o:v${RULES_VERSION}:banned-techniques -->
# Banned Techniques (proven harmful or dead -- do NOT retry)

## Libraries
- (none yet -- add entries as dead ends are discovered)

## Approaches
- (none yet)

## Dead Ends
- (none yet)

---
Add entries here as soon as something is confirmed dead.
Include the date and context. This file is auto-loaded every session.
`

  return files
}

function generateUpgradedHooksSettings(config: {
  agentName: string
  techStack: string
  languages: string[]
  hooksSetup: string[]
}): object {
  // Re-use the main generator but we need a compatible config
  // For the upgrade engine, we generate a simplified version
  const hooks: Record<string, any[]> = {}

  const hasFrontend = /react|vue|svelte|next|nuxt|electron|vite|angular|frontend/i.test(config.techStack)
  const hasPython = /python|fastapi|django|flask/i.test(config.techStack)

  if (config.hooksSetup.includes('session-start')) {
    const healthChecks: string[] = [
      'echo "=== SESSION INIT ==="',
      `echo "Project: ${config.agentName}"`,
      'echo "---"',
      'echo "Git status:"',
      'git status --short 2>/dev/null | head -15',
    ]
    if (hasFrontend) {
      healthChecks.push('echo "---"', 'echo "Frontend:"')
      healthChecks.push('curl -sf http://localhost:5173 >/dev/null 2>&1 && echo " running" || echo " NOT running"')
    }
    if (hasPython) {
      healthChecks.push('echo "---"', 'echo "API:"')
      healthChecks.push('curl -sf http://localhost:8000/health 2>/dev/null && echo " running" || echo " NOT running"')
    }
    healthChecks.push('echo "---"')
    healthChecks.push('echo "ACTION: Read MEMORY.md for current state. Commit any uncommitted work."')

    const startupCmd = process.platform === 'win32'
      ? `cmd /c "${healthChecks.join(' && ')}"`
      : `bash -c '${healthChecks.join('; ')}'`

    const resumeCmd = process.platform === 'win32'
      ? `cmd /c "echo === SESSION RESUMED === && echo Project: ${config.agentName} && echo Git branch: && git branch --show-current 2>NUL && echo Uncommitted: && git status --short 2>NUL && echo === && echo ACTION: Read MEMORY.md for current state and resume pending work."`
      : `bash -c 'echo "=== SESSION RESUMED ==="; echo "Project: ${config.agentName}"; echo "Git branch: $(git branch --show-current 2>/dev/null || echo N/A)"; echo "Uncommitted: $(git status --short 2>/dev/null | wc -l | tr -d " ") files"; echo "==="; echo "ACTION: Read MEMORY.md for current state and resume pending work."'`

    hooks.SessionStart = [
      {
        matcher: 'startup',
        hooks: [{ type: 'command', command: startupCmd }],
      },
      {
        matcher: 'resume',
        hooks: [{ type: 'command', command: resumeCmd }],
      },
    ]
  }

  if (config.hooksSetup.includes('post-tool-tsc')) {
    if (!hooks.PostToolUse) hooks.PostToolUse = []
    hooks.PostToolUse.push({
      matcher: 'Edit|Write',
      hooks: [{
        type: 'command',
        command: "FILE=$(echo \"$TOOL_INPUT\" | jq -r '.file_path // empty') && if echo \"$FILE\" | grep -qE '\\.(tsx|ts)$'; then npx tsc --noEmit 2>&1 | head -20; fi",
      }],
    })
  }

  // PreCompact hook (new in v3)
  const preCompactCmd = `bash -c 'echo "COMPACTION IMMINENT. You MUST immediately: 1) Update MEMORY.md with current task, PIDs, log paths, next steps. 2) Commit and push any unsaved work. Do these NOW before context is lost."'`
  hooks.PreCompact = [{
    matcher: '',
    hooks: [{ type: 'command', command: preCompactCmd }],
  }]

  const env: Record<string, string> = {
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '80',
  }

  return { hooks, env }
}
