// ── Wizard / Project Creation IPC handlers ──
// Owner: Agent D (Wizard + UX)

import { ipcMain } from 'electron'
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { run, findApiKey, type ProjectConfig } from './ipc-shared'
import {
  openTerminalAt, getLaunchScriptNames,
  generateLaunchScript, makeExecutable,
} from './platform'
import {
  generateClaudeMd,
  generateHooksSettings,
  generateGitignore,
  generateMcpJson,
  generateReadme,
  generateMemorySeed,
  generateRuleFiles,
  generateAgentTemplates,
  generateHoursTrackingRule,
} from './generators'
import { HAL_O_VERSION, RULES_VERSION } from './version'

// ── Dev tools templates for post-creation prompt ──

const PLAYWRIGHT_CONFIG_TEMPLATE = `import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
`

const SMOKE_TEST_TEMPLATE = `import { test, expect } from '@playwright/test'

test('app loads successfully', async ({ page }) => {
  // Update this URL to match your dev server
  await page.goto('http://localhost:3000')
  await expect(page).toHaveTitle(/.+/)
})

test('no console errors on load', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto('http://localhost:3000')
  await page.waitForTimeout(2000)
  expect(errors).toHaveLength(0)
})
`

// ── Language detection from file extensions + manifest files ──

const EXT_LANG_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.cs': 'C#',
  '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++',
  '.c': 'C', '.h': 'C',
  '.lua': 'Lua',
  '.dart': 'Dart',
  '.ex': 'Elixir', '.exs': 'Elixir',
  '.zig': 'Zig',
  '.scala': 'Scala',
}

const MANIFEST_LANG_MAP: Record<string, string> = {
  'package.json': 'JavaScript',
  'tsconfig.json': 'TypeScript',
  'pyproject.toml': 'Python',
  'requirements.txt': 'Python',
  'setup.py': 'Python',
  'Cargo.toml': 'Rust',
  'go.mod': 'Go',
  'Gemfile': 'Ruby',
  'composer.json': 'PHP',
  'Package.swift': 'Swift',
  'build.gradle': 'Java',
  'build.gradle.kts': 'Kotlin',
  'pom.xml': 'Java',
  'pubspec.yaml': 'Dart',
  'mix.exs': 'Elixir',
}

/** Detect languages from top-level files and one level of subdirectories */
function detectLanguages(projectPath: string, topFiles: string[]): string[] {
  const langs = new Set<string>()

  // From manifest files
  for (const file of topFiles) {
    const lang = MANIFEST_LANG_MAP[file]
    if (lang) langs.add(lang)
  }

  // From file extensions in the top level
  for (const file of topFiles) {
    const ext = extname(file).toLowerCase()
    const lang = EXT_LANG_MAP[ext]
    if (lang) langs.add(lang)
  }

  // Scan one level of common source directories for extensions
  const srcDirs = ['src', 'lib', 'app', 'pkg', 'cmd', 'internal']
  for (const dir of srcDirs) {
    const dirPath = join(projectPath, dir)
    try {
      if (!existsSync(dirPath)) continue
      const stat = statSync(dirPath)
      if (!stat.isDirectory()) continue
      const subFiles = readdirSync(dirPath)
      for (const f of subFiles) {
        const ext = extname(f).toLowerCase()
        const lang = EXT_LANG_MAP[ext]
        if (lang) langs.add(lang)
      }
    } catch { /* skip */ }
  }

  return Array.from(langs).sort()
}

/** HAL-O meta info stored in .claude/.hal-o-meta.json */
interface HalOMeta {
  enlistedAt: string
  halOVersion: string
  rulesVersion: number
  filesCreated?: string[]
}

/** Enlist config for importing an existing project into HAL-O */
export interface EnlistConfig {
  projectPath: string
  agentName: string
  addLaunchScripts: boolean
  addClaudeDir: boolean
  addClaudeMd: 'skip' | 'create' | 'append'
  addHooks: boolean
  hooksSetup: string[]
  techStack: string
  languages: string[]
  description: string
  /** U2: modular feature picker — rules to create */
  addRules?: string[]
  /** U2: modular feature picker — devlog folders to create */
  addDevlog?: string[]
  /** U2: modular feature picker — create MEMORY.md seed */
  addMemorySeed?: boolean
  /** U2: modular feature picker — create .claude/agents/ templates */
  addAgentTemplates?: boolean
}

export interface EnlistResult {
  success: boolean
  log: string[]
  path: string
}

export function registerWizardHandlers(): void {
  // ── Scan existing project for import/recruit ──
  ipcMain.handle('scan-existing-project', async (_event, projectPath: string) => {
    const result: {
      name: string
      path: string
      hasGit: boolean
      gitRemote: string
      gitBranch: string
      hasClaude: boolean
      hasClaudeDir: boolean
      hasBatchFiles: boolean
      hasHooks: boolean
      hasRules: boolean
      hasDevlog: boolean
      rulesList: string[]
      languages: string[]
      halOMeta: HalOMeta | null
      stack: string
      description: string
      files: string[]
      readme: string
      communityTools: string[]
    } = {
      name: projectPath.split(/[/\\]/).pop() || '',
      path: projectPath,
      hasGit: false, gitRemote: '', gitBranch: '',
      hasClaude: false, hasClaudeDir: false, hasBatchFiles: false,
      hasHooks: false, hasRules: false, hasDevlog: false,
      rulesList: [], languages: [], halOMeta: null,
      stack: '', description: '', files: [], readme: '',
      communityTools: [],
    }

    if (!existsSync(projectPath)) return result

    try {
      const files = readdirSync(projectPath)
      result.files = files.slice(0, 50)

      if (files.includes('.git')) {
        result.hasGit = true
        try { result.gitRemote = run('git remote get-url origin', projectPath) } catch { /* */ }
        try { result.gitBranch = run('git branch --show-current', projectPath) } catch { /* */ }
      }

      result.hasClaude = files.includes('CLAUDE.md')
      result.hasClaudeDir = files.includes('.claude')
      const { newScript } = getLaunchScriptNames()
      result.hasBatchFiles = files.includes(newScript) || files.includes('_CLAUDE_CLI_NEW.bat') || files.includes('_CLAUDE_CLI_NEW.sh')

      // Check _devlog/ existence
      result.hasDevlog = files.includes('_devlog') && existsSync(join(projectPath, '_devlog'))

      // Check .claude/ contents: hooks, rules, hal-o-meta
      if (result.hasClaudeDir) {
        const claudeDir = join(projectPath, '.claude')

        // Hooks: .claude/settings.json exists
        const settingsPath = join(claudeDir, 'settings.json')
        if (existsSync(settingsPath)) {
          result.hasHooks = true
        }

        // Rules: .claude/rules/ exists and has files
        const rulesDir = join(claudeDir, 'rules')
        try {
          if (existsSync(rulesDir)) {
            const ruleFiles = readdirSync(rulesDir).filter(f => !f.startsWith('.'))
            result.rulesList = ruleFiles
            result.hasRules = ruleFiles.length > 0
          }
        } catch { /* */ }

        // HAL-O meta: .claude/.hal-o-meta.json
        const metaPath = join(claudeDir, '.hal-o-meta.json')
        try {
          if (existsSync(metaPath)) {
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
            result.halOMeta = {
              enlistedAt: meta.enlistedAt || '',
              halOVersion: meta.halOVersion || '',
              rulesVersion: typeof meta.rulesVersion === 'number' ? meta.rulesVersion : 0,
            }
          }
        } catch { /* */ }
      }

      // Detect languages from file extensions + manifest files
      result.languages = detectLanguages(projectPath, files)

      if (files.includes('package.json')) {
        try {
          const pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'))
          const deps = { ...pkg.dependencies, ...pkg.devDependencies }
          if (deps['next']) result.stack = 'Next.js'
          else if (deps['electron']) result.stack = 'Electron'
          else if (deps['react']) result.stack = 'React'
          else if (deps['vue']) result.stack = 'Vue'
          else if (deps['svelte']) result.stack = 'SvelteKit'
          else result.stack = 'Node.js'
          if (pkg.description) result.description = pkg.description
        } catch { result.stack = 'Node.js' }
      } else if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
        result.stack = 'Python'
      } else if (files.includes('Cargo.toml')) {
        result.stack = 'Rust'
      } else if (files.includes('go.mod')) {
        result.stack = 'Go'
      }

      if (files.includes('README.md')) {
        try { result.readme = readFileSync(join(projectPath, 'README.md'), 'utf-8').slice(0, 500) } catch { /* */ }
      }

      if (result.hasClaude && !result.description) {
        try {
          const claudeMd = readFileSync(join(projectPath, 'CLAUDE.md'), 'utf-8').slice(0, 300)
          result.description = claudeMd
        } catch { /* */ }
      }

      // ── S3: Community tool detection ──
      // Detect files/dirs from other AI coding tools and report them (non-destructive)
      const detected: string[] = []

      // Cursor IDE: .cursorrules file or .cursor/ directory
      if (files.some(f => f === '.cursorrules' || f.toLowerCase() === '.cursorrules')) detected.push('cursor')
      if (files.some(f => f === '.cursor')) {
        try {
          const cursorStat = require('fs').statSync(join(projectPath, '.cursor'))
          if (cursorStat.isDirectory() && !detected.includes('cursor')) detected.push('cursor')
        } catch { /* */ }
      }

      // Aider: .aider* files
      if (files.some(f => f.startsWith('.aider'))) detected.push('aider')

      // GitHub Copilot: .github/copilot-instructions.md
      if (existsSync(join(projectPath, '.github', 'copilot-instructions.md'))) detected.push('copilot')

      // Windsurf: .windsurfrules
      if (files.some(f => f === '.windsurfrules')) detected.push('windsurf')

      // Existing CLAUDE.md not created by HAL-O: check if hasClaude but no halOMeta or file not in filesCreated
      // (detect "foreign" CLAUDE.md = exists but no HAL-O meta, or meta doesn't list it as created)
      if (result.hasClaude) {
        const isHalOOwned = result.halOMeta?.filesCreated?.includes('CLAUDE.md') ?? false
        const isHalOSection = (() => {
          try {
            const content = readFileSync(join(projectPath, 'CLAUDE.md'), 'utf-8')
            return content.includes('HAL-O') || content.includes('HAL-O Best Practices')
          } catch { return false }
        })()
        if (!isHalOOwned && !isHalOSection) {
          // CLAUDE.md exists and appears to be from another tool or user — flag as foreign
          detected.push('foreign-claude-md')
        }
      }

      // Existing .claude/rules/ files not created by HAL-O
      if (result.hasRules && result.rulesList.length > 0) {
        const halOCreatedFiles = result.halOMeta?.filesCreated ?? []
        const foreignRules = result.rulesList.filter(
          f => !halOCreatedFiles.some(hf => hf.endsWith(f))
        )
        if (foreignRules.length > 0) {
          detected.push('foreign-rules')
        }
      }

      result.communityTools = detected
    } catch { /* */ }

    return result
  })

  // ── Enlist existing project (non-destructive import) ──
  ipcMain.handle('enlist-project', async (_event, config: EnlistConfig) => {
    const log: string[] = []
    const filesCreated: string[] = []
    const projectPath = config.projectPath

    try {
      if (!existsSync(projectPath)) {
        log.push(`[ERROR] Project path does not exist: ${projectPath}`)
        return { success: false, log, path: projectPath }
      }

      const claudeDir = join(projectPath, '.claude')
      const rulesDir = join(claudeDir, 'rules')

      // 1. Create .claude/ directory structure (if requested)
      if (config.addClaudeDir) {
        if (!existsSync(claudeDir)) {
          mkdirSync(claudeDir, { recursive: true })
          log.push('[OK] Created .claude/')
        } else {
          log.push('[SKIP] .claude/ already exists')
        }
        if (!existsSync(rulesDir)) {
          mkdirSync(rulesDir, { recursive: true })
          log.push('[OK] Created .claude/rules/')
        } else {
          log.push('[SKIP] .claude/rules/ already exists')
        }
      }

      // 2. CLAUDE.md
      const claudeMdPath = join(projectPath, 'CLAUDE.md')
      if (config.addClaudeMd === 'create') {
        if (existsSync(claudeMdPath)) {
          log.push('[SKIP] CLAUDE.md already exists — preserved (use Enhance to append HAL-O section)')
        } else {
          const lines = [
            `# ${config.agentName}`,
            '',
            config.description || '',
            '',
            '## Stack',
            `- **Primary**: ${config.techStack || 'Not specified'}`,
            config.languages.length > 0 ? `- **Languages**: ${config.languages.join(', ')}` : '',
            '',
            '## Key Conventions',
            '- API keys in `~/.claude_credentials` (bash-sourceable), never in repo',
            '- NEVER kill processes by name -- always by PID',
            '- Messages prefixed with `[voice]` are spoken by the user via microphone',
            '',
          ].filter(l => l !== '').join('\n') + '\n'
          writeFileSync(claudeMdPath, lines, 'utf-8')
          filesCreated.push('CLAUDE.md')
          log.push('[OK] Created CLAUDE.md')
        }
      } else if (config.addClaudeMd === 'append') {
        if (existsSync(claudeMdPath)) {
          const existing = readFileSync(claudeMdPath, 'utf-8')
          // Check if HAL-O section already appended (either marker)
          if (existing.includes('<!-- HAL-O additions -->') || existing.includes('<!-- hal-o:') || existing.includes('## HAL-O Best Practices (auto-generated)')) {
            log.push('[SKIP] CLAUDE.md already has HAL-O section')
          } else {
            const appendSection = [
              '',
              '<!-- HAL-O additions -->',
              '',
              '---',
              '',
              '## HAL-O Best Practices (auto-generated)',
              '',
              '- API keys in `~/.claude_credentials` (bash-sourceable), never in repo',
              '- NEVER kill processes by name -- always by PID',
              '- Messages prefixed with `[voice]` are spoken by the user via microphone',
              '- Save PIDs when launching background processes, kill by PID (see `.claude/rules/` for platform command)',
              '',
              '<!-- /HAL-O additions -->',
            ].join('\n')
            writeFileSync(claudeMdPath, existing + appendSection, 'utf-8')
            filesCreated.push('CLAUDE.md')
            log.push('[OK] Appended HAL-O section to CLAUDE.md')
          }
        } else {
          // Append mode but file doesn't exist — create it instead
          const lines = [
            `# ${config.agentName}`,
            '',
            config.description || '',
            '',
            '## HAL-O Best Practices (auto-generated)',
            '',
            '- API keys in `~/.claude_credentials` (bash-sourceable), never in repo',
            '- NEVER kill processes by name -- always by PID',
            '- Messages prefixed with `[voice]` are spoken by the user via microphone',
            '',
          ].filter(l => l !== '').join('\n') + '\n'
          writeFileSync(claudeMdPath, lines, 'utf-8')
          filesCreated.push('CLAUDE.md')
          log.push('[OK] Created CLAUDE.md (append mode, file did not exist)')
        }
      } else {
        log.push('[SKIP] CLAUDE.md (skipped by config)')
      }

      // 3. Hooks (.claude/settings.json)
      if (config.addHooks && config.hooksSetup.length > 0) {
        const settingsPath = join(claudeDir, 'settings.json')
        if (existsSync(settingsPath)) {
          log.push('[SKIP] .claude/settings.json already exists')
        } else {
          // Ensure .claude/ exists
          mkdirSync(claudeDir, { recursive: true })
          const fakeConfig: ProjectConfig = {
            name: config.agentName,
            location: '',
            description: config.description,
            techStack: config.techStack,
            languages: config.languages,
            styling: 'none',
            database: 'none',
            githubCreate: false,
            githubAccount: '',
            githubVisibility: 'private',
            claudeMd: 'skip',
            hooksSetup: config.hooksSetup,
            rulesSetup: [],
            devlog: [],
            gitignore: false,
            playwrightMcp: false,
            frontendDesignPlugin: false,
            agentTemplates: false,
            memorySeed: false,
            readme: false,
            agentName: config.agentName,
            sessionName: false,
            conventions: [],
            skipPermissions: false,
            tokenBudget: 'full',
          }
          const hooks = generateHooksSettings(fakeConfig)
          writeFileSync(settingsPath, JSON.stringify(hooks, null, 2), 'utf-8')
          filesCreated.push('.claude/settings.json')
          log.push(`[OK] Created .claude/settings.json with hooks: ${config.hooksSetup.join(', ')}`)
        }
      }

      // 4. Launch scripts
      if (config.addLaunchScripts) {
        const newScript = generateLaunchScript(config.agentName, false, false)
        const resumeScript = generateLaunchScript(config.agentName, true, false)

        const newPath = join(projectPath, newScript.filename)
        if (existsSync(newPath)) {
          log.push(`[SKIP] ${newScript.filename} already exists`)
        } else {
          writeFileSync(newPath, newScript.content, 'utf-8')
          makeExecutable(newPath)
          filesCreated.push(newScript.filename)
          log.push(`[OK] Created ${newScript.filename}`)
        }

        const resumePath = join(projectPath, resumeScript.filename)
        if (existsSync(resumePath)) {
          log.push(`[SKIP] ${resumeScript.filename} already exists`)
        } else {
          writeFileSync(resumePath, resumeScript.content, 'utf-8')
          makeExecutable(resumePath)
          filesCreated.push(resumeScript.filename)
          log.push(`[OK] Created ${resumeScript.filename}`)
        }
      }

      // 5. Rules (.claude/rules/) — U2 modular feature picker
      if (config.addRules && config.addRules.length > 0) {
        // Ensure .claude/ and rules/ exist
        mkdirSync(claudeDir, { recursive: true })
        mkdirSync(rulesDir, { recursive: true })

        // Build a minimal ProjectConfig to pass to generateRuleFiles
        const fakeConfigForRules: ProjectConfig = {
          name: config.agentName,
          location: '',
          description: config.description,
          techStack: config.techStack,
          languages: config.languages,
          styling: 'none',
          database: 'none',
          githubCreate: false,
          githubAccount: '',
          githubVisibility: 'private',
          claudeMd: 'skip',
          hooksSetup: [],
          rulesSetup: config.addRules,
          devlog: [],
          gitignore: false,
          playwrightMcp: false,
          frontendDesignPlugin: false,
          agentTemplates: false,
          memorySeed: false,
          readme: false,
          agentName: config.agentName,
          sessionName: false,
          conventions: [],
          skipPermissions: false,
          tokenBudget: 'full',
        }
        const ruleFiles = generateRuleFiles(fakeConfigForRules)
        for (const [filename, content] of Object.entries(ruleFiles)) {
          const rulePath = join(rulesDir, filename)
          if (existsSync(rulePath)) {
            log.push(`[SKIP] .claude/rules/${filename} already exists`)
          } else {
            writeFileSync(rulePath, content, 'utf-8')
            filesCreated.push(`.claude/rules/${filename}`)
            log.push(`[OK] Created .claude/rules/${filename}`)
          }
        }
        // Also add hours tracking rule if not present
        const hoursRulePath = join(rulesDir, 'hours-tracking.md')
        if (!existsSync(hoursRulePath)) {
          writeFileSync(hoursRulePath, generateHoursTrackingRule(), 'utf-8')
          filesCreated.push('.claude/rules/hours-tracking.md')
          log.push('[OK] Created .claude/rules/hours-tracking.md')
        }
      }

      // 6. Devlog (_devlog/) — U2 modular feature picker
      if (config.addDevlog && config.addDevlog.length > 0) {
        const devlogDir = join(projectPath, '_devlog')
        mkdirSync(devlogDir, { recursive: true })
        log.push('[OK] Ensured _devlog/')
        for (const folder of config.addDevlog) {
          const folderPath = join(devlogDir, folder)
          if (!existsSync(folderPath)) {
            mkdirSync(folderPath, { recursive: true })
            // Add .gitkeep so empty folders are tracked
            writeFileSync(join(folderPath, '.gitkeep'), '', 'utf-8')
            filesCreated.push(`_devlog/${folder}/`)
            log.push(`[OK] Created _devlog/${folder}/`)
          } else {
            log.push(`[SKIP] _devlog/${folder}/ already exists`)
          }
        }
      }

      // 7. MEMORY.md seed — U2 modular feature picker
      if (config.addMemorySeed) {
        const memoryPath = join(projectPath, 'MEMORY.md')
        if (existsSync(memoryPath)) {
          log.push('[SKIP] MEMORY.md already exists')
        } else {
          const fakeConfigForMemory: ProjectConfig = {
            name: config.agentName,
            location: '',
            description: config.description,
            techStack: config.techStack,
            languages: config.languages,
            styling: 'none',
            database: 'none',
            githubCreate: false,
            githubAccount: '',
            githubVisibility: 'private',
            claudeMd: 'skip',
            hooksSetup: [],
            rulesSetup: [],
            devlog: [],
            gitignore: false,
            playwrightMcp: false,
            frontendDesignPlugin: false,
            agentTemplates: false,
            memorySeed: true,
            readme: false,
            agentName: config.agentName,
            sessionName: false,
            conventions: [],
            skipPermissions: false,
            tokenBudget: 'full',
          }
          writeFileSync(memoryPath, generateMemorySeed(fakeConfigForMemory), 'utf-8')
          filesCreated.push('MEMORY.md')
          log.push('[OK] Created MEMORY.md')
        }
      }

      // 8. Agent templates (.claude/agents/) — U2 modular feature picker
      if (config.addAgentTemplates) {
        const agentsDir = join(claudeDir, 'agents')
        mkdirSync(claudeDir, { recursive: true })
        mkdirSync(agentsDir, { recursive: true })
        const fakeConfigForAgents: ProjectConfig = {
          name: config.agentName,
          location: '',
          description: config.description,
          techStack: config.techStack,
          languages: config.languages,
          styling: 'none',
          database: 'none',
          githubCreate: false,
          githubAccount: '',
          githubVisibility: 'private',
          claudeMd: 'skip',
          hooksSetup: [],
          rulesSetup: config.addRules || [],
          devlog: [],
          gitignore: false,
          playwrightMcp: false,
          frontendDesignPlugin: false,
          agentTemplates: true,
          memorySeed: false,
          readme: false,
          agentName: config.agentName,
          sessionName: false,
          conventions: [],
          skipPermissions: false,
          tokenBudget: 'full',
        }
        const agentFiles = generateAgentTemplates(fakeConfigForAgents)
        for (const [filename, content] of Object.entries(agentFiles)) {
          const agentPath = join(agentsDir, filename)
          if (existsSync(agentPath)) {
            log.push(`[SKIP] .claude/agents/${filename} already exists`)
          } else {
            writeFileSync(agentPath, content, 'utf-8')
            filesCreated.push(`.claude/agents/${filename}`)
            log.push(`[OK] Created .claude/agents/${filename}`)
          }
        }
      }

      // 9. Write .claude/.hal-o-meta.json (version tracking + created files)
      mkdirSync(claudeDir, { recursive: true })
      const metaPath = join(claudeDir, '.hal-o-meta.json')
      filesCreated.push('.claude/.hal-o-meta.json')
      const meta: HalOMeta = {
        enlistedAt: new Date().toISOString(),
        halOVersion: HAL_O_VERSION,
        rulesVersion: RULES_VERSION,
        filesCreated,
      }
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      log.push('[OK] Written .claude/.hal-o-meta.json')

      log.push('')
      log.push(`[OK] Project "${config.agentName}" enlisted in HAL-O!`)

      return { success: true, log, path: projectPath }
    } catch (e: any) {
      log.push(`[ERROR] ${e.message}`)
      return { success: false, log, path: projectPath }
    }
  })

  ipcMain.handle('analyze-project', async (_event, name: string, description: string, folderPath: string, lang?: string) => {
    const folderDetections: string[] = []
    const fullPath = folderPath ? join(folderPath, name) : ''

    // Structured detection result returned to renderer for instant pre-fill (U3)
    interface FolderDetectionResult {
      techStack: string
      techStackLabel: string
      languages: string[]
      styling: string
      hasTypeScript: boolean
      hasPython: boolean
      framework: string
    }
    let folderDetection: FolderDetectionResult | null = null

    if (fullPath && existsSync(fullPath)) {
      try {
        const files = readdirSync(fullPath)
        const detection: FolderDetectionResult = {
          techStack: '', techStackLabel: '', languages: [], styling: '', hasTypeScript: false, hasPython: false, framework: '',
        }

        // package.json — detect JS/TS frameworks
        if (files.includes('package.json')) {
          try {
            const pkg = JSON.parse(readFileSync(join(fullPath, 'package.json'), 'utf-8'))
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
            folderDetections.push(`package.json found. Dependencies: ${Object.keys(allDeps).join(', ')}`)
            // Framework detection from deps
            if (allDeps['next']) { detection.techStack = 'nextjs'; detection.techStackLabel = 'Next.js'; detection.framework = 'Next.js' }
            else if (allDeps['electron']) { detection.techStack = 'electron'; detection.techStackLabel = 'Electron'; detection.framework = 'Electron' }
            else if (allDeps['react-native'] || allDeps['expo']) { detection.techStack = 'react-native'; detection.techStackLabel = 'React Native'; detection.framework = 'React Native' }
            else if (allDeps['@sveltejs/kit']) { detection.techStack = 'sveltekit'; detection.techStackLabel = 'SvelteKit'; detection.framework = 'SvelteKit' }
            else if (allDeps['svelte']) { detection.techStack = 'sveltekit'; detection.techStackLabel = 'Svelte'; detection.framework = 'Svelte' }
            else if (allDeps['@nuxt/core'] || allDeps['nuxt']) { detection.techStack = 'nuxt'; detection.techStackLabel = 'Nuxt'; detection.framework = 'Nuxt' }
            else if (allDeps['astro']) { detection.techStack = 'astro'; detection.techStackLabel = 'Astro'; detection.framework = 'Astro' }
            else if (allDeps['remix'] || allDeps['@remix-run/react']) { detection.techStack = 'remix'; detection.techStackLabel = 'Remix'; detection.framework = 'Remix' }
            else if (allDeps['vue'] || allDeps['@vue/core']) { detection.techStack = 'sveltekit'; detection.techStackLabel = 'Vue'; detection.framework = 'Vue' }
            else if (allDeps['react']) { detection.techStack = 'web-react'; detection.techStackLabel = 'React'; detection.framework = 'React' }
            else if (allDeps['express'] || allDeps['fastify'] || allDeps['hono'] || allDeps['koa']) { detection.techStack = 'node-backend'; detection.techStackLabel = 'Node.js Backend'; detection.framework = allDeps['express'] ? 'Express' : allDeps['fastify'] ? 'Fastify' : allDeps['hono'] ? 'Hono' : 'Koa' }
            else { detection.techStack = 'node-backend'; detection.techStackLabel = 'Node.js' }
            // TypeScript
            if (allDeps['typescript'] || allDeps['ts-node']) {
              detection.hasTypeScript = true
              if (!detection.languages.includes('TypeScript')) detection.languages.push('TypeScript')
            } else {
              if (!detection.languages.includes('JavaScript')) detection.languages.push('JavaScript')
            }
            // Styling
            if (allDeps['tailwindcss']) detection.styling = 'tailwind'
            else if (allDeps['styled-components']) detection.styling = 'styled-components'
          } catch {
            folderDetections.push('package.json found (could not parse)')
          }
        }

        // tsconfig.json — TypeScript
        if (files.includes('tsconfig.json')) {
          folderDetections.push('tsconfig.json found (TypeScript)')
          detection.hasTypeScript = true
          if (!detection.languages.includes('TypeScript')) detection.languages.push('TypeScript')
          // Remove JavaScript if TypeScript is confirmed
          detection.languages = detection.languages.filter(l => l !== 'JavaScript')
        }

        // Python detection
        if (files.includes('requirements.txt')) {
          try {
            const reqs = readFileSync(join(fullPath, 'requirements.txt'), 'utf-8').slice(0, 500)
            folderDetections.push(`requirements.txt found: ${reqs}`)
            detection.hasPython = true
            if (!detection.languages.includes('Python')) detection.languages.push('Python')
            if (!detection.techStack) {
              if (/fastapi/i.test(reqs)) { detection.techStack = 'fullstack-python'; detection.techStackLabel = 'FastAPI'; detection.framework = 'FastAPI' }
              else if (/django/i.test(reqs)) { detection.techStack = 'fullstack-python'; detection.techStackLabel = 'Django'; detection.framework = 'Django' }
              else if (/flask/i.test(reqs)) { detection.techStack = 'python-backend'; detection.techStackLabel = 'Flask'; detection.framework = 'Flask' }
              else { detection.techStack = 'python-backend'; detection.techStackLabel = 'Python Backend' }
            }
          } catch {
            folderDetections.push('requirements.txt found')
          }
        }
        if (files.includes('pyproject.toml')) {
          folderDetections.push('pyproject.toml found (Python project)')
          detection.hasPython = true
          if (!detection.languages.includes('Python')) detection.languages.push('Python')
          if (!detection.techStack) {
            try {
              const pyproj = readFileSync(join(fullPath, 'pyproject.toml'), 'utf-8').slice(0, 1000)
              if (/fastapi/i.test(pyproj)) { detection.techStack = 'fullstack-python'; detection.techStackLabel = 'FastAPI'; detection.framework = 'FastAPI' }
              else if (/django/i.test(pyproj)) { detection.techStack = 'fullstack-python'; detection.techStackLabel = 'Django'; detection.framework = 'Django' }
              else if (/flask/i.test(pyproj)) { detection.techStack = 'python-backend'; detection.techStackLabel = 'Flask'; detection.framework = 'Flask' }
              else { detection.techStack = 'python-backend'; detection.techStackLabel = 'Python Backend' }
            } catch { detection.techStack = 'python-backend'; detection.techStackLabel = 'Python Backend' }
          }
        }

        // Rust
        if (files.includes('Cargo.toml')) {
          folderDetections.push('Cargo.toml found (Rust project)')
          if (!detection.languages.includes('Rust')) detection.languages.push('Rust')
          if (!detection.techStack) { detection.techStack = 'rust-backend'; detection.techStackLabel = 'Rust' }
        }

        // Go
        if (files.includes('go.mod')) {
          folderDetections.push('go.mod found (Go project)')
          if (!detection.languages.includes('Go')) detection.languages.push('Go')
          if (!detection.techStack) { detection.techStack = 'go-backend'; detection.techStackLabel = 'Go Backend' }
        }

        // Flutter/Dart
        if (files.includes('pubspec.yaml')) {
          folderDetections.push('pubspec.yaml found (Flutter/Dart project)')
          if (!detection.languages.includes('Dart')) detection.languages.push('Dart')
          if (!detection.techStack) { detection.techStack = 'react-native'; detection.techStackLabel = 'Flutter'; detection.framework = 'Flutter' }
        }

        // Godot
        if (files.includes('.godot') || files.some(f => f.endsWith('.godot'))) {
          folderDetections.push('Godot project detected')
          if (!detection.techStack) { detection.techStack = 'godot'; detection.techStackLabel = 'Godot' }
        }

        // Ruby
        if (files.includes('Gemfile')) {
          folderDetections.push('Gemfile found (Ruby project)')
          if (!detection.languages.includes('Ruby')) detection.languages.push('Ruby')
          if (!detection.techStack) { detection.techStack = 'node-backend'; detection.techStackLabel = 'Ruby' }
        }

        // Build config markers
        if (files.includes('vite.config.ts') || files.includes('vite.config.js')) folderDetections.push('Vite config found')
        if (files.includes('next.config.js') || files.includes('next.config.ts') || files.includes('next.config.mjs')) folderDetections.push('Next.js config found')
        if (files.includes('electron.vite.config.ts') || files.includes('electron-builder.yml')) folderDetections.push('Electron project detected')
        if (files.includes('.csproj') || files.some(f => f.endsWith('.csproj'))) {
          folderDetections.push('C# project detected')
          if (!detection.languages.includes('C#')) detection.languages.push('C#')
        }
        if (files.includes('tailwind.config.ts') || files.includes('tailwind.config.js')) {
          folderDetections.push('Tailwind CSS configured')
          detection.styling = 'tailwind'
        }
        if (files.includes('CLAUDE.md')) folderDetections.push('CLAUDE.md already exists')

        // Only expose as folderDetection if we confidently detected a stack
        if (detection.techStack) {
          folderDetection = detection
        }
      } catch { /* folder doesn't exist yet, that's fine */ }
    }

    const { key: apiKey } = findApiKey()

    if (!apiKey) {
      return {
        techStack: folderDetection?.techStack || '', techStackLabel: folderDetection?.techStackLabel || '',
        languages: folderDetection?.languages || [], styling: folderDetection?.styling || '', database: '',
        agentName: name, conventions: [],
        reasoning: folderDetection?.techStack
          ? `Detected from existing files: ${folderDetection.techStackLabel}. No API key — using detected stack.`
          : 'No ANTHROPIC_API_KEY found. To enable smart analysis, set it in one of:\n'
            + '  - Environment variable: ANTHROPIC_API_KEY\n'
            + '  - .env file in project folder or home directory\n'
            + '  - ~/.claude_credentials (export ANTHROPIC_API_KEY="sk-ant-...")\n'
            + 'Falling back to manual stack selection.',
        folderDetected: folderDetections.length > 0,
        folderDetection,
      }
    }

    try {
      const client = new Anthropic({ apiKey })

      const folderContext = folderDetections.length > 0
        ? `\n\nExisting files detected in the project folder:\n${folderDetections.map(d => `- ${d}`).join('\n')}`
        : ''

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305' as any, name: 'web_search', max_uses: 2 }],
        messages: [{
          role: 'user',
          content: `You are helping set up a new coding project. First, search the web for the latest and most popular frameworks/stacks for the type of project described below, so your suggestion uses current best practices (2026).

IMPORTANT: If the description mentions "Claude CLI", "Claude Code", "just CLI", or similar, the user is describing their DEVELOPMENT TOOL (Claude Code CLI), NOT the type of project they want to build. In that case, focus on what the project actually does based on its name and any other context. If you truly cannot determine the project type, suggest a minimal generic setup (e.g. node-backend or web-react) rather than "cli-tool".

Project name: "${name}"
Description: "${description}"${folderContext}

After researching, respond with ONLY valid JSON (no markdown, no code fences):
{
  "techStack": "<one of these known IDs: web-react, nextjs, sveltekit, astro, nuxt, remix, fullstack-node, fullstack-python, fullstack-htmx, python-backend, node-backend, go-backend, rust-backend, electron, tauri, react-native, pygame, godot, cli-node, cli-python, automation, data-science, ml-pipeline, static-site — or a custom identifier if none fit>",
  "techStackLabel": "<human readable label like 'Next.js 15 + PostgreSQL' or 'SvelteKit + Supabase'>",
  "languages": ["<language1>", "<language2>"],
  "styling": "<tailwind|css-modules|styled-components|plain-css|none or other>",
  "database": "<postgresql|sqlite|supabase|mongodb|json-files|drizzle|prisma|none or other>",
  "agentName": "${name}",
  "conventions": ["<convention1>", "<convention2>", "<convention3>"],
  "reasoning": "<1-2 sentence explanation of why you chose this stack${lang && lang !== 'en' ? `, written in the language with code: ${lang}` : ''}>"
}`
        }],
      })

      const textBlocks = response.content.filter((b: any) => b.type === 'text')
      const raw = textBlocks.length > 0 ? (textBlocks[textBlocks.length - 1] as any).text : ''
      const text = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)

      return {
        techStack: parsed.techStack || '',
        techStackLabel: parsed.techStackLabel || '',
        languages: Array.isArray(parsed.languages) ? parsed.languages : [],
        styling: parsed.styling || 'none',
        database: parsed.database || 'none',
        agentName: parsed.agentName || name,
        conventions: Array.isArray(parsed.conventions) ? parsed.conventions : [],
        reasoning: parsed.reasoning || '',
        folderDetected: folderDetections.length > 0,
        folderDetection,
      }
    } catch (e: any) {
      return {
        techStack: folderDetection?.techStack || '', techStackLabel: folderDetection?.techStackLabel || '',
        languages: folderDetection?.languages || [], styling: folderDetection?.styling || '', database: '',
        agentName: name, conventions: [],
        reasoning: `Analysis failed: ${e.message}. ${folderDetection?.techStack ? `Detected from files: ${folderDetection.techStackLabel}.` : 'Using manual mode.'}`,
        folderDetected: folderDetections.length > 0,
        folderDetection,
      }
    }
  })

  ipcMain.handle('create-project', async (_event, config: ProjectConfig) => {
    const log: string[] = []
    const projectPath = join(config.location, config.name)

    try {
      // 1. Create project folder
      if (!existsSync(projectPath)) {
        mkdirSync(projectPath, { recursive: true })
        log.push(`[OK] Created folder: ${projectPath}`)
      } else {
        log.push(`[OK] Folder already exists: ${projectPath}`)
      }

      // 2. Git setup
      if (config.githubCreate) {
        try {
          let ghUser = ''
          try { ghUser = run('gh api user --jq .login') } catch { /* */ }
          const owner = (!config.githubAccount || config.githubAccount === ghUser) ? '' : `${config.githubAccount}/`
          const visibility = config.githubVisibility === 'public' ? '--public' : '--private'
          const desc = config.description ? `--description "${config.description.replace(/"/g, '\\"')}"` : ''
          run(`gh repo create ${owner}${config.name} ${visibility} ${desc} --clone`, config.location)
          log.push(`[OK] Created GitHub repo: ${config.githubAccount}/${config.name} (${config.githubVisibility})`)
        } catch (e: any) {
          log.push(`[ERROR] GitHub repo creation failed: ${e.message}`)
          if (!existsSync(join(projectPath, '.git'))) {
            run('git init', projectPath)
            log.push('[OK] Fell back to local git init')
          }
        }
      } else {
        if (!existsSync(join(projectPath, '.git'))) {
          run('git init', projectPath)
          log.push('[OK] Initialized git repository')
        } else {
          log.push('[OK] Git already initialized')
        }
      }

      // 3. Create .claude directory structure
      const claudeDir = join(projectPath, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      mkdirSync(join(claudeDir, 'rules'), { recursive: true })
      log.push('[OK] Created .claude/ directory structure')

      // 4. CLAUDE.md
      if (config.claudeMd !== 'skip') {
        const content = generateClaudeMd(config)
        writeFileSync(join(projectPath, 'CLAUDE.md'), content, 'utf-8')
        log.push('[OK] Generated CLAUDE.md')
      }

      // 5. Hooks
      if (config.hooksSetup.length > 0) {
        const hooks = generateHooksSettings(config)
        writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(hooks, null, 2), 'utf-8')
        log.push(`[OK] Configured hooks: ${config.hooksSetup.join(', ')}`)
      }

      // 6. Rules
      if (config.rulesSetup.length > 0) {
        const rules = generateRuleFiles(config)
        for (const [filename, content] of Object.entries(rules)) {
          writeFileSync(join(claudeDir, 'rules', filename), content, 'utf-8')
        }
        log.push(`[OK] Created rule files: ${Object.keys(rules).join(', ')}`)
      }

      // 7. Hours tracking rule
      if (config.devlog.includes('hours')) {
        const content = generateHoursTrackingRule()
        writeFileSync(join(claudeDir, 'rules', 'hours-tracking.md'), content, 'utf-8')
        log.push('[OK] Created hours-tracking.md rule')
      }

      // 8. .gitignore
      if (config.gitignore) {
        const content = generateGitignore(config)
        writeFileSync(join(projectPath, '.gitignore'), content, 'utf-8')
        log.push('[OK] Generated .gitignore')
      }

      // 9. .mcp.json
      if (config.playwrightMcp) {
        const content = generateMcpJson()
        writeFileSync(join(projectPath, '.mcp.json'), JSON.stringify(content, null, 2), 'utf-8')
        log.push('[OK] Generated .mcp.json with Playwright MCP')
      }

      // 9b. Frontend design plugin
      if (config.frontendDesignPlugin) {
        try {
          run('claude plugin install frontend-design --scope project', projectPath)
          log.push('[OK] Installed frontend-design plugin')
        } catch {
          log.push('[OK] frontend-design plugin: install manually with /plugin install frontend-design')
        }
      }

      // 10. Agent templates
      if (config.agentTemplates) {
        mkdirSync(join(claudeDir, 'agents'), { recursive: true })
        const templates = generateAgentTemplates(config)
        for (const [filename, content] of Object.entries(templates)) {
          writeFileSync(join(claudeDir, 'agents', filename), content, 'utf-8')
        }
        log.push(`[OK] Created agent templates: ${Object.keys(templates).join(', ')}`)
      }

      // 11. MEMORY.md seed
      if (config.memorySeed) {
        const content = generateMemorySeed(config)
        writeFileSync(join(projectPath, 'MEMORY_SEED.md'), content, 'utf-8')
        log.push('[OK] Created MEMORY_SEED.md (copy to auto-memory after first session)')
      }

      // 12. README.md
      if (config.readme) {
        const content = generateReadme(config)
        writeFileSync(join(projectPath, 'README.md'), content, 'utf-8')
        log.push('[OK] Generated README.md')
      }

      // 13. _devlog/ directory structure
      if (config.devlog.length > 0) {
        const devlogDir = join(projectPath, '_devlog')
        mkdirSync(devlogDir, { recursive: true })
        for (const sub of config.devlog) {
          mkdirSync(join(devlogDir, sub), { recursive: true })
          writeFileSync(join(devlogDir, sub, '.gitkeep'), '', 'utf-8')
        }
        log.push(`[OK] Created _devlog/ with: ${config.devlog.join(', ')}`)
      }

      // 14. Launch scripts
      const newScript = generateLaunchScript(config.agentName, false, config.skipPermissions)
      const resumeScript = generateLaunchScript(config.agentName, true, config.skipPermissions)
      writeFileSync(join(projectPath, newScript.filename), newScript.content, 'utf-8')
      writeFileSync(join(projectPath, resumeScript.filename), resumeScript.content, 'utf-8')
      makeExecutable(join(projectPath, newScript.filename))
      makeExecutable(join(projectPath, resumeScript.filename))
      log.push(`[OK] Generated ${newScript.filename} and ${resumeScript.filename}`)

      // 15. Initial commit
      try {
        run('git add -A', projectPath)
        run('git commit -m "Initial project setup via HAL-O"', projectPath)
        log.push('[OK] Created initial commit')
      } catch (e: any) {
        log.push(`[OK] Git commit: ${e.message}`)
      }

      // 16. Push if GitHub repo was created
      if (config.githubCreate) {
        try {
          run('git push -u origin main', projectPath)
          log.push('[OK] Pushed to GitHub')
        } catch {
          try {
            run('git push -u origin master', projectPath)
            log.push('[OK] Pushed to GitHub')
          } catch (e: any) {
            log.push(`[OK] Push skipped: ${e.message}`)
          }
        }
      }

      log.push('')
      log.push(`[OK] Project "${config.name}" is ready!`)

      return { success: true, path: projectPath, log }
    } catch (e: any) {
      log.push(`[ERROR] ${e.message}`)
      return { success: false, path: projectPath, log }
    }
  })

  // ── Setup dev tools (Playwright + lint) for a created project ──
  ipcMain.handle('setup-dev-tools', async (_event, projectPath: string) => {
    const log: string[] = []

    try {
      if (!existsSync(projectPath)) {
        return { success: false, log: [`[ERROR] Path does not exist: ${projectPath}`] }
      }

      // 1. Create playwright.config.ts
      const playwrightConfigPath = join(projectPath, 'playwright.config.ts')
      if (existsSync(playwrightConfigPath)) {
        log.push('[SKIP] playwright.config.ts already exists')
      } else {
        writeFileSync(playwrightConfigPath, PLAYWRIGHT_CONFIG_TEMPLATE, 'utf-8')
        log.push('[OK] Created playwright.config.ts')
      }

      // 2. Create e2e/smoke.spec.ts
      const e2eDir = join(projectPath, 'e2e')
      mkdirSync(e2eDir, { recursive: true })
      const smokeTestPath = join(e2eDir, 'smoke.spec.ts')
      if (existsSync(smokeTestPath)) {
        log.push('[SKIP] e2e/smoke.spec.ts already exists')
      } else {
        writeFileSync(smokeTestPath, SMOKE_TEST_TEMPLATE, 'utf-8')
        log.push('[OK] Created e2e/smoke.spec.ts')
      }

      // 3. Add test script to package.json (if it exists)
      const pkgPath = join(projectPath, 'package.json')
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
          if (!pkg.scripts) pkg.scripts = {}
          if (!pkg.scripts.test) {
            pkg.scripts.test = 'npx playwright test'
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
            log.push('[OK] Added "test" script to package.json')
          } else {
            log.push(`[SKIP] package.json already has a "test" script: ${pkg.scripts.test}`)
          }
        } catch (e: any) {
          log.push(`[ERROR] Could not update package.json: ${e.message}`)
        }
      } else {
        log.push('[SKIP] No package.json found — skipping test script')
      }

      log.push('')
      log.push('[OK] Dev tools setup complete!')

      return { success: true, log }
    } catch (e: any) {
      log.push(`[ERROR] ${e.message}`)
      return { success: false, log }
    }
  })

  // ── Write dev tools prompt preference to project meta ──
  ipcMain.handle('write-dev-tools-meta', async (_event, projectPath: string, preference: 'later' | 'never') => {
    try {
      const claudeDir = join(projectPath, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      const metaPath = join(claudeDir, '.hal-o-meta.json')

      let meta: Record<string, unknown> = {}
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      } catch { /* new file or parse error */ }

      if (preference === 'later') {
        // Snooze for 7 days
        const snoozeUntil = new Date()
        snoozeUntil.setDate(snoozeUntil.getDate() + 7)
        meta.devToolsPromptSnooze = snoozeUntil.toISOString()
      } else {
        meta.devToolsPrompt = 'never'
      }

      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
