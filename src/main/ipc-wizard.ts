// ── Wizard / Project Creation IPC handlers ──
// Owner: Agent D (Wizard + UX)

import { ipcMain } from 'electron'
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
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
      stack: string
      description: string
      files: string[]
      readme: string
    } = {
      name: projectPath.split(/[/\\]/).pop() || '',
      path: projectPath,
      hasGit: false, gitRemote: '', gitBranch: '',
      hasClaude: false, hasClaudeDir: false, hasBatchFiles: false,
      stack: '', description: '', files: [], readme: '',
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
    } catch { /* */ }

    return result
  })

  ipcMain.handle('analyze-project', async (_event, name: string, description: string, folderPath: string, lang?: string) => {
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
