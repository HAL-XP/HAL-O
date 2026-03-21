import { ipcMain, dialog, shell } from 'electron'
import { execSync, spawn } from 'child_process'
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'fs'
import { join, sep } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import {
  openTerminalAt, runLaunchScript, getGhInstallInfo, getCommonProjectDirs,
  generateLaunchScript, makeExecutable, getLaunchScriptNames, isWin,
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

interface ProjectConfig {
  name: string
  location: string
  description: string
  techStack: string
  languages: string[]
  styling: string
  database: string
  githubCreate: boolean
  githubAccount: string
  githubVisibility: string
  claudeMd: string
  hooksSetup: string[]
  rulesSetup: string[]
  devlog: string[]
  gitignore: boolean
  playwrightMcp: boolean
  frontendDesignPlugin: boolean
  agentTemplates: boolean
  memorySeed: boolean
  readme: boolean
  agentName: string
  sessionName: boolean
  conventions: string[]
  skipPermissions: boolean
}

function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e: any) {
    throw new Error(e.stderr || e.message)
  }
}

function findApiKey(): { key: string; source: string } {
  // Check environment first
  if (process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, source: 'Environment variable' }
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  const candidates = [
    { path: join(process.cwd(), '.env'), label: '.env (Claudeborn folder)' },
    { path: join(process.cwd(), '.env.local'), label: '.env.local (Claudeborn folder)' },
    { path: join(home, '.env'), label: '~/.env' },
    { path: join(home, '.env.local'), label: '~/.env.local' },
    { path: join(home, '.claude_credentials'), label: '~/.claude_credentials' },
  ]

  for (const c of candidates) {
    try {
      const content = readFileSync(c.path, 'utf-8')
      const match = content.match(/(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*"?([^"\s\n]+)"?/)
      if (match) return { key: match[1], source: c.label }
    } catch { /* skip */ }
  }

  return { key: '', source: '' }
}

export function registerIpcHandlers(): void {
  // ── Setup/prerequisites checks ──

  ipcMain.handle('check-prerequisites', async () => {
    const home = process.env.HOME || process.env.USERPROFILE || ''

    // Node.js — if we're here, it works
    let nodeVersion = ''
    try { nodeVersion = run('node --version') } catch { /* */ }

    // gh CLI
    let ghInstalled = false
    let ghAuthenticated = false
    let ghUser = ''
    try {
      run('gh --version')
      ghInstalled = true
      ghUser = run('gh api user --jq .login')
      ghAuthenticated = true
    } catch { /* */ }

    // API key
    const apiKeyResult = findApiKey()

    return {
      nodeVersion,
      ghInstalled,
      ghAuthenticated,
      ghUser,
      apiKeyFound: !!apiKeyResult.key,
      apiKeySource: apiKeyResult.source,
      apiKeyPreview: apiKeyResult.key ? apiKeyResult.key.slice(0, 12) + '...' : '',
    }
  })

  ipcMain.handle('save-api-key', async (_event, key: string, location: string) => {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const line = `ANTHROPIC_API_KEY="${key}"`

    const pathMap: Record<string, { path: string; format: string }> = {
      'env-local-project': {
        path: join(process.cwd(), '.env.local'),
        format: `${line}\n`,
      },
      'env-project': {
        path: join(process.cwd(), '.env'),
        format: `${line}\n`,
      },
      'env-home': {
        path: join(home, '.env'),
        format: `${line}\n`,
      },
      'claude-credentials': {
        path: join(home, '.claude_credentials'),
        format: `export ${line}\n`,
      },
    }

    const target = pathMap[location]
    if (!target) return { success: false, error: 'Unknown save location' }

    try {
      // Append to file (don't overwrite existing content)
      let existing = ''
      try { existing = readFileSync(target.path, 'utf-8') } catch { /* new file */ }

      // Replace existing key or append
      if (existing.match(/(?:export\s+)?ANTHROPIC_API_KEY\s*=/)) {
        existing = existing.replace(/(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*"?[^"\s\n]+"?/, target.format.trim())
        writeFileSync(target.path, existing, 'utf-8')
      } else {
        writeFileSync(target.path, existing + (existing && !existing.endsWith('\n') ? '\n' : '') + target.format, 'utf-8')
      }

      return { success: true, path: target.path }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('install-gh-cli', async () => {
    try {
      const { command } = getGhInstallInfo()
      run(command)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('get-gh-install-label', async () => {
    return getGhInstallInfo().label
  })

  ipcMain.handle('auth-gh-cli', async () => {
    openTerminalAt(process.cwd(), 'gh auth login')
    return { success: true }
  })

  ipcMain.handle('get-platform', async () => {
    return process.platform
  })

  ipcMain.handle('get-default-project-path', async () => {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const candidates = getCommonProjectDirs()
    for (const dir of candidates) {
      if (existsSync(dir)) return dir
    }
    return join(home, 'Projects')
  })

  // ── Project Hub ──

  ipcMain.handle('scan-projects', async () => {
    const dirs = getCommonProjectDirs()
    const projects: Array<{
      name: string; path: string; stack: string
      hasClaude: boolean; hasBatchFiles: boolean; hasClaudeDir: boolean; lastModified: number
    }> = []
    const seen = new Set<string>()

    for (const parentDir of dirs) {
      if (!existsSync(parentDir)) continue
      let entries: string[] = []
      try { entries = readdirSync(parentDir) } catch { continue }

      for (const entry of entries) {
        const fullPath = join(parentDir, entry)
        if (seen.has(fullPath)) continue
        seen.add(fullPath)

        try {
          const stat = require('fs').statSync(fullPath)
          if (!stat.isDirectory()) continue

          const files = readdirSync(fullPath)
          const hasClaude = files.includes('CLAUDE.md')
          const hasClaudeDir = files.includes('.claude')
          const { newScript, resumeScript } = getLaunchScriptNames()
          const hasBatchFiles = files.includes(newScript) || files.includes(resumeScript)
            || files.includes('_CLAUDE_CLI_NEW.bat') || files.includes('_CLAUDE_CLI_NEW.sh')

          // Only include if it looks like a Claude project
          if (!hasClaude && !hasClaudeDir && !hasBatchFiles) continue

          // Detect stack
          let stack = ''
          if (hasClaude) {
            try {
              const md = readFileSync(join(fullPath, 'CLAUDE.md'), 'utf-8')
              const stackMatch = md.match(/\*\*Primary\*\*:\s*(.+)/i)
                || md.match(/## Stack\n-\s*\*\*(.+?)\*\*/i)
                || md.match(/## Stack\n-\s*(.+)/i)
              if (stackMatch) stack = stackMatch[1].trim()
            } catch { /* */ }
          }
          if (!stack) {
            if (files.includes('package.json')) {
              try {
                const pkg = JSON.parse(readFileSync(join(fullPath, 'package.json'), 'utf-8'))
                const deps = { ...pkg.dependencies, ...pkg.devDependencies }
                if (deps['next']) stack = 'Next.js'
                else if (deps['react']) stack = 'React'
                else if (deps['electron']) stack = 'Electron'
                else if (deps['vue']) stack = 'Vue'
                else if (deps['svelte']) stack = 'SvelteKit'
                else stack = 'Node.js'
              } catch { stack = 'Node.js' }
            } else if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
              stack = 'Python'
            } else if (files.includes('Cargo.toml')) {
              stack = 'Rust'
            } else if (files.includes('go.mod')) {
              stack = 'Go'
            }
          }

          // Get agent name from batch file
          let name = entry
          const batPath = join(fullPath, '_CLAUDE_CLI_NEW.bat')
          const shPath = join(fullPath, '_CLAUDE_CLI_NEW.sh')
          try {
            const batContent = existsSync(batPath)
              ? readFileSync(batPath, 'utf-8')
              : existsSync(shPath) ? readFileSync(shPath, 'utf-8') : ''
            const nameMatch = batContent.match(/-n\s+"([^"]+)"/)
            if (nameMatch) name = nameMatch[1]
          } catch { /* */ }

          projects.push({
            name,
            path: fullPath,
            stack,
            hasClaude,
            hasBatchFiles,
            hasClaudeDir,
            lastModified: stat.mtimeMs,
          })
        } catch { continue }
      }
    }

    // Sort by most recently modified
    projects.sort((a, b) => b.lastModified - a.lastModified)
    return projects
  })

  ipcMain.handle('launch-project', async (_event, path: string, resume: boolean) => {
    const { newScript, resumeScript } = getLaunchScriptNames()
    const scriptName = resume ? resumeScript : newScript
    const scriptPath = join(path, scriptName)
    if (existsSync(scriptPath)) {
      runLaunchScript(path, scriptName)
    } else {
      const cmd = resume
        ? 'claude --dangerously-skip-permissions --resume'
        : 'claude --dangerously-skip-permissions'
      openTerminalAt(path, cmd)
    }
  })

  ipcMain.handle('get-launch-args', async () => {
    // Check command line args for --new, --convert, --launch
    const args = process.argv.slice(2)
    if (args.includes('--new')) return { mode: 'wizard' }
    const convertIdx = args.indexOf('--convert')
    if (convertIdx >= 0 && args[convertIdx + 1]) return { mode: 'convert', path: args[convertIdx + 1] }
    const launchIdx = args.indexOf('--launch')
    if (launchIdx >= 0 && args[launchIdx + 1]) return { mode: 'launch', path: args[launchIdx + 1] }
    return { mode: 'hub' }
  })

  ipcMain.handle('select-folder', async (_event, defaultPath?: string) => {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const result = await dialog.showOpenDialog({
      defaultPath: defaultPath || home,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('get-github-user', async () => {
    try {
      return run('gh api user --jq .login')
    } catch {
      return ''
    }
  })

  ipcMain.handle('get-github-orgs', async () => {
    try {
      const output = run('gh api user/orgs --jq ".[].login"')
      return output.split('\n').filter(Boolean)
    } catch {
      return []
    }
  })

  ipcMain.handle('analyze-project', async (_event, name: string, description: string, folderPath: string, lang?: string) => {
    // Step 1: Scan folder for existing files
    const folderDetections: string[] = []
    const fullPath = folderPath ? join(folderPath, name) : ''

    if (fullPath && existsSync(fullPath)) {
      try {
        const files = readdirSync(fullPath)
        if (files.includes('package.json')) {
          try {
            const pkg = JSON.parse(readFileSync(join(fullPath, 'package.json'), 'utf-8'))
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
            folderDetections.push(`package.json found. Dependencies: ${Object.keys(allDeps).join(', ')}`)
          } catch {
            folderDetections.push('package.json found (could not parse)')
          }
        }
        if (files.includes('requirements.txt')) {
          try {
            const reqs = readFileSync(join(fullPath, 'requirements.txt'), 'utf-8').slice(0, 500)
            folderDetections.push(`requirements.txt found: ${reqs}`)
          } catch {
            folderDetections.push('requirements.txt found')
          }
        }
        if (files.includes('pyproject.toml')) folderDetections.push('pyproject.toml found (Python project)')
        if (files.includes('Cargo.toml')) folderDetections.push('Cargo.toml found (Rust project)')
        if (files.includes('go.mod')) folderDetections.push('go.mod found (Go project)')
        if (files.includes('tsconfig.json')) folderDetections.push('tsconfig.json found (TypeScript)')
        if (files.includes('vite.config.ts') || files.includes('vite.config.js')) folderDetections.push('Vite config found')
        if (files.includes('next.config.js') || files.includes('next.config.ts') || files.includes('next.config.mjs')) folderDetections.push('Next.js config found')
        if (files.includes('electron.vite.config.ts') || files.includes('electron-builder.yml')) folderDetections.push('Electron project detected')
        if (files.includes('.csproj') || files.some(f => f.endsWith('.csproj'))) folderDetections.push('C# project detected')
        if (files.includes('tailwind.config.ts') || files.includes('tailwind.config.js')) folderDetections.push('Tailwind CSS configured')
        if (files.includes('CLAUDE.md')) folderDetections.push('CLAUDE.md already exists')
      } catch { /* folder doesn't exist yet, that's fine */ }
    }

    // Step 2: Load API key
    const { key: apiKey } = findApiKey()

    if (!apiKey) {
      return {
        techStack: '', techStackLabel: '', languages: [], styling: '', database: '',
        agentName: name, conventions: [],
        reasoning: 'No ANTHROPIC_API_KEY found. To enable smart analysis, set it in one of:\n'
          + '  - Environment variable: ANTHROPIC_API_KEY\n'
          + '  - .env file in project folder or home directory\n'
          + '  - ~/.claude_credentials (export ANTHROPIC_API_KEY="sk-ant-...")\n'
          + 'Falling back to manual stack selection.',
        folderDetected: folderDetections.length > 0,
      }
    }

    // Step 3: Call Claude Haiku for analysis
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

      // With web search tool, response may have multiple content blocks — find the last text block
      const textBlocks = response.content.filter((b: any) => b.type === 'text')
      const raw = textBlocks.length > 0 ? (textBlocks[textBlocks.length - 1] as any).text : ''
      // Strip markdown code fences if present (```json ... ```)
      const text = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
      // Extract JSON from the text (may have surrounding prose)
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
      }
    } catch (e: any) {
      return {
        techStack: '', techStackLabel: '', languages: [], styling: '', database: '',
        agentName: name, conventions: [],
        reasoning: `Analysis failed: ${e.message}. Using manual mode.`,
        folderDetected: folderDetections.length > 0,
      }
    }
  })

  ipcMain.handle('open-folder', async (_event, path: string) => {
    shell.openPath(path)
  })

  ipcMain.handle('open-in-claude', async (_event, path: string) => {
    const { newScript } = getLaunchScriptNames()
    const scriptFile = join(path, newScript)
    if (existsSync(scriptFile)) {
      runLaunchScript(path, newScript)
    } else {
      openTerminalAt(path, 'claude --dangerously-skip-permissions')
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
          // If account matches the authenticated user, no org prefix needed
          let ghUser = ''
          try { ghUser = run('gh api user --jq .login') } catch { /* */ }
          const owner = (!config.githubAccount || config.githubAccount === ghUser) ? '' : `${config.githubAccount}/`
          const visibility = config.githubVisibility === 'public' ? '--public' : '--private'
          const desc = config.description ? `--description "${config.description.replace(/"/g, '\\"')}"` : ''
          run(`gh repo create ${owner}${config.name} ${visibility} ${desc} --clone`, config.location)
          log.push(`[OK] Created GitHub repo: ${config.githubAccount}/${config.name} (${config.githubVisibility})`)
        } catch (e: any) {
          log.push(`[ERROR] GitHub repo creation failed: ${e.message}`)
          // Fall back to local git init
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

      // 5. Hooks (.claude/settings.json)
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

      // 7. Hours tracking rule (if hours is in devlog)
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

      // 9. .mcp.json (Playwright MCP)
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
        // Memory goes in the project's auto-memory directory
        // But also seed a local MEMORY reference in .claude/
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

      // 14. Batch files
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
        run('git commit -m "Initial project setup via ProjectCreator"', projectPath)
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
}
