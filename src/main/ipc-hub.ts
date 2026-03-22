// ── Project Hub IPC handlers ──
// Owner: Agent B (Terminal + Core)

import { ipcMain, shell } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { run } from './ipc-shared'
import { openTerminalAt, runLaunchScript, getCommonProjectDirs, getLaunchScriptNames } from './platform'

export function registerHubHandlers(): void {
  ipcMain.handle('scan-projects', async () => {
    const dirs = getCommonProjectDirs()

    // Also scan ~/.claude/projects/ cache to find ALL projects ever used with Claude
    const claudeProjectsDir = join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'projects')
    if (existsSync(claudeProjectsDir)) {
      try {
        const cached = readdirSync(claudeProjectsDir)
        for (const entry of cached) {
          const driveMatch = entry.match(/^([A-Za-z])--(.+)$/)
          if (!driveMatch) continue
          const drive = driveMatch[1].toUpperCase()
          const rest = driveMatch[2]
          const segments = rest.split('--')
          const tryPath = `${drive}:\\${segments.join('\\')}`
          if (existsSync(tryPath)) {
            const parent = join(tryPath, '..')
            if (!dirs.includes(parent)) dirs.push(parent)
          } else {
            const tryPath2 = `${drive}:\\${segments.map(s => s.replace(/-/g, '_')).join('\\')}`
            if (existsSync(tryPath2)) {
              const parent = join(tryPath2, '..')
              if (!dirs.includes(parent)) dirs.push(parent)
            }
            const tryPath3 = `${drive}:\\${rest.replace(/-/g, '\\')}`
            if (existsSync(tryPath3)) {
              const parent = join(tryPath3, '..')
              if (!dirs.includes(parent)) dirs.push(parent)
            }
          }
        }
      } catch { /* */ }
    }

    const projects: Array<{
      name: string; path: string; stack: string
      hasClaude: boolean; hasBatchFiles: boolean; hasClaudeDir: boolean; lastModified: number
      gitOwner: string; runCmd: string
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

          if (!hasClaude && !hasClaudeDir && !hasBatchFiles) continue

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

          let runCmd = ''
          if (files.includes('package.json')) {
            try {
              const pkg = JSON.parse(readFileSync(join(fullPath, 'package.json'), 'utf-8'))
              const scripts = pkg.scripts || {}
              if (scripts.dev) runCmd = 'npm run dev'
              else if (scripts.start) runCmd = 'npm start'
              else if (scripts.serve) runCmd = 'npm run serve'
            } catch { /* */ }
          } else if (files.includes('manage.py')) {
            runCmd = 'python manage.py runserver'
          } else if (files.includes('main.py') || files.includes('app.py')) {
            runCmd = `python ${files.includes('app.py') ? 'app.py' : 'main.py'}`
          }

          let gitOwner = ''
          try {
            const gitConfig = readFileSync(join(fullPath, '.git', 'config'), 'utf-8')
            const remoteMatch = gitConfig.match(/url\s*=\s*(?:https?:\/\/github\.com\/|git@github\.com:)([^/\s]+)\//i)
            if (remoteMatch) gitOwner = remoteMatch[1]
          } catch { /* no git or no remote */ }

          projects.push({
            name, path: fullPath, stack,
            hasClaude, hasBatchFiles, hasClaudeDir,
            lastModified: stat.mtimeMs, gitOwner, runCmd,
          })
        } catch { continue }
      }
    }

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
        : 'claude --dangerously-skip-permissions --channels plugin:telegram@claude-plugins-official'
      openTerminalAt(path, cmd)
    }
  })

  ipcMain.handle('get-launch-args', async () => {
    const args = process.argv.slice(2)
    if (args.includes('--new')) return { mode: 'wizard' }
    const convertIdx = args.indexOf('--convert')
    if (convertIdx >= 0 && args[convertIdx + 1]) return { mode: 'convert', path: args[convertIdx + 1] }
    const launchIdx = args.indexOf('--launch')
    if (launchIdx >= 0 && args[launchIdx + 1]) return { mode: 'launch', path: args[launchIdx + 1] }
    return { mode: 'hub' }
  })

  ipcMain.handle('get-github-user', async () => {
    try { return run('gh api user --jq .login') } catch { return '' }
  })

  ipcMain.handle('get-github-orgs', async () => {
    try {
      const output = run('gh api user/orgs --jq ".[].login"')
      return output.split('\n').filter(Boolean)
    } catch { return [] }
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
      openTerminalAt(path, 'claude --dangerously-skip-permissions --channels plugin:telegram@claude-plugins-official')
    }
  })

  ipcMain.handle('run-app', async (_e, projectPath: string, runCmd: string) => {
    openTerminalAt(projectPath, runCmd)
  })
}
