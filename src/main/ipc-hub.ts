// ── Project Hub IPC handlers ──
// Owner: Agent B (Terminal + Core)

import { ipcMain, shell } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { exec, execSync } from 'child_process'
import { join, normalize } from 'path'
import { run } from './ipc-shared'
import { openTerminalAt, runLaunchScript, getCommonProjectDirs, getLaunchScriptNames } from './platform'
import { terminalManager } from './terminal-manager'
import { RULES_VERSION } from './version'

// ── Project stats cache (60s TTL) ──
interface ProjectStats {
  lastCommit: string
  lastCommitTime: number
  commitCount30d: number
  fileCount: number
}
const statsCache = new Map<string, { data: ProjectStats; ts: number }>()
const STATS_TTL = 60_000

// ── Async semaphore: cap concurrent getProjectStats to avoid execSync stampede ──
const MAX_CONCURRENT_STATS = 4
let activeStats = 0
const statsQueue: Array<{ resolve: (v: ProjectStats) => void; reject: (e: Error) => void; path: string }> = []

/** Run a shell command asynchronously, returning trimmed stdout. */
function runAsync(cmd: string, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      shell: true,
      windowsHide: true,
    }, (err, stdout) => {
      if (err) reject(err)
      else resolve((stdout || '').trim())
    })
  })
}

/** Gather git stats for a project asynchronously (non-blocking). */
async function getProjectStatsAsync(projectPath: string): Promise<ProjectStats> {
  const stats: ProjectStats = { lastCommit: '', lastCommitTime: 0, commitCount30d: 0, fileCount: 0 }

  if (!existsSync(join(projectPath, '.git'))) {
    try {
      stats.fileCount = readdirSync(projectPath).length
    } catch { /* */ }
    statsCache.set(projectPath, { data: stats, ts: Date.now() })
    return stats
  }

  // Fire all git commands in parallel — each is a separate child process
  const fileCountCmd = process.platform === 'win32'
    ? 'git ls-files --cached | find /c /v ""'
    : 'git ls-files --cached | wc -l'

  const [lastCommit, epoch, count30d, fileCount] = await Promise.all([
    runAsync('git log -1 --pretty=format:%s', projectPath).catch(() => ''),
    runAsync('git log -1 --pretty=format:%ct', projectPath).catch(() => ''),
    runAsync('git rev-list --count --since="30 days ago" HEAD', projectPath).catch(() => '0'),
    runAsync(fileCountCmd, projectPath).catch(() => ''),
  ])

  stats.lastCommit = lastCommit
  stats.lastCommitTime = epoch ? parseInt(epoch, 10) * 1000 : 0
  stats.commitCount30d = parseInt(count30d, 10) || 0
  stats.fileCount = parseInt(fileCount, 10) || 0

  // Fallback for file count if git ls-files failed
  if (!stats.fileCount) {
    try {
      stats.fileCount = readdirSync(projectPath).length
    } catch { /* */ }
  }

  statsCache.set(projectPath, { data: stats, ts: Date.now() })
  return stats
}

/** Drain queued stats requests up to the concurrency limit. */
function drainStatsQueue(): void {
  while (statsQueue.length > 0 && activeStats < MAX_CONCURRENT_STATS) {
    const item = statsQueue.shift()!
    activeStats++
    getProjectStatsAsync(item.path)
      .then(item.resolve)
      .catch(() => item.resolve({ lastCommit: '', lastCommitTime: 0, commitCount30d: 0, fileCount: 0 }))
      .finally(() => {
        activeStats--
        drainStatsQueue()
      })
  }
}

export function registerHubHandlers(): void {
  // ── Get project git stats (cached 60s, max concurrent via async semaphore) ──
  ipcMain.handle('get-project-stats', async (_event, projectPath: string): Promise<ProjectStats> => {
    const now = Date.now()
    const cached = statsCache.get(projectPath)
    if (cached && now - cached.ts < STATS_TTL) return cached.data

    // If under the concurrency limit, run immediately (async — won't block event loop)
    if (activeStats < MAX_CONCURRENT_STATS) {
      activeStats++
      try {
        return await getProjectStatsAsync(projectPath)
      } catch {
        return { lastCommit: '', lastCommitTime: 0, commitCount30d: 0, fileCount: 0 }
      } finally {
        activeStats--
        drainStatsQueue()
      }
    }

    // Otherwise queue and wait — resolved when a slot opens
    return new Promise<ProjectStats>((resolve, reject) => {
      statsQueue.push({ resolve, reject, path: projectPath })
    })
  })

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
      hasClaude: boolean; hasBatchFiles: boolean; hasClaudeDir: boolean
      hasHalOMeta: boolean; configLevel: 'bare' | 'claude-aware' | 'hal-o-enhanced'
      lastModified: number
      gitOwner: string; runCmd: string
      rulesOutdated: boolean
    }> = []
    const seen = new Set<string>()

    // Build set of known Claude project paths from ~/.claude/projects/ cache
    const knownClaudePaths = new Set<string>()
    if (existsSync(claudeProjectsDir)) {
      try {
        const cached = readdirSync(claudeProjectsDir)
        for (const entry of cached) {
          const driveMatch = entry.match(/^([A-Za-z])--(.+)$/)
          if (!driveMatch) continue
          const drive = driveMatch[1].toUpperCase()
          const rest = driveMatch[2]
          const segments = rest.split('--')
          // Try the most common encoding: segments joined by backslash
          const tryPath = `${drive}:\\${segments.join('\\')}`
          if (existsSync(tryPath)) { knownClaudePaths.add(normalize(tryPath)); continue }
          // Fallback: dashes replaced with underscores
          const tryPath2 = `${drive}:\\${segments.map(s => s.replace(/-/g, '_')).join('\\')}`
          if (existsSync(tryPath2)) { knownClaudePaths.add(normalize(tryPath2)); continue }
          // Fallback: all dashes to backslashes
          const tryPath3 = `${drive}:\\${rest.replace(/-/g, '\\')}`
          if (existsSync(tryPath3)) { knownClaudePaths.add(normalize(tryPath3)); continue }
        }
      } catch { /* */ }
    }

    // Project marker files — if a dir has at least one, it's probably a real project
    const PROJECT_MARKERS = [
      'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml',
      'build.gradle', 'Makefile', 'CMakeLists.txt',
    ]

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

          const metaFilePath = join(fullPath, '.claude', '.hal-o-meta.json')
          const hasHalOMeta = hasClaudeDir && existsSync(metaFilePath)
          const configLevel: 'bare' | 'claude-aware' | 'hal-o-enhanced' =
            hasHalOMeta ? 'hal-o-enhanced' : (hasClaude || hasClaudeDir) ? 'claude-aware' : 'bare'

          // Check if rules are outdated (meta rulesVersion < current RULES_VERSION)
          let rulesOutdated = false
          if (hasHalOMeta) {
            try {
              const meta = JSON.parse(readFileSync(metaFilePath, 'utf-8'))
              const metaVersion = typeof meta.rulesVersion === 'number' ? meta.rulesVersion : 0
              rulesOutdated = metaVersion < RULES_VERSION
            } catch { /* ignore parse errors */ }
          }

          // Minimum signal heuristic: must be a real project (has .git/, a build manifest, or is known to Claude)
          const hasGitDir = files.includes('.git')
          const hasProjectMarker = PROJECT_MARKERS.some(m => files.includes(m))
          const isKnownClaude = knownClaudePaths.has(normalize(fullPath))
          if (!hasGitDir && !hasProjectMarker && !isKnownClaude && !hasClaude && !hasClaudeDir && !hasBatchFiles) continue

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
            hasClaude, hasBatchFiles, hasClaudeDir, hasHalOMeta, configLevel,
            lastModified: stat.mtimeMs, gitOwner, runCmd, rulesOutdated,
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

  // ── Session Absorption: detect external Claude CLI processes ──

  /** Parse PowerShell CSV output (ConvertTo-Csv) into { pid, cmdLine } entries.
   *  Format: "ProcessId","CommandLine" header, then "1234","cmd /c ..." data rows. */
  function parseProcessCsv(output: string): Array<{ pid: number; cmdLine: string }> {
    const entries: Array<{ pid: number; cmdLine: string }> = []
    for (const line of output.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // Skip header row
      if (trimmed.startsWith('"ProcessId"') || trimmed.startsWith('"CommandLine"')) continue
      // Also skip old WMIC-style header (safety)
      if (trimmed.startsWith('Node,')) continue
      // Parse quoted CSV: "PID","CommandLine" — CommandLine can contain commas and quotes
      const pidMatch = trimmed.match(/^"?(\d+)"?,/)
      if (pidMatch) {
        const pid = parseInt(pidMatch[1], 10)
        if (!pid || isNaN(pid)) continue
        // Rest after first comma is the CommandLine (may be quoted)
        let cmdLine = trimmed.slice(pidMatch[0].length).replace(/^"|"$/g, '')
        // Unescape doubled quotes from CSV
        cmdLine = cmdLine.replace(/""/g, '"')
        entries.push({ pid, cmdLine })
      }
    }
    return entries
  }

  ipcMain.handle('detect-external-sessions', async (): Promise<Array<{
    pid: number; projectPath: string; projectName: string
  }>> => {
    const isWin = process.platform === 'win32'
    if (!isWin) return [] // Only Windows implemented for now

    const embeddedPaths = new Set(
      terminalManager.getActiveSessions().map((s) => normalize(s.projectPath).toLowerCase())
    )

    const results: Array<{ pid: number; projectPath: string; projectName: string }> = []
    const seenPids = new Set<number>()

    // Scan both node.exe (claude CLI runs as node) and cmd.exe (wrapper shells)
    // Use PowerShell Get-CimInstance instead of WMIC to avoid cmd.exe quote escaping issues
    // WMIC is deprecated and its WHERE clause quotes conflict with cmd.exe shell parsing
    const processNames = ['node.exe', 'cmd.exe']

    for (const procName of processNames) {
      try {
        const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='${procName}' and CommandLine like '%claude%'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`
        const wmicOut = execSync(psCmd, {
          encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        })

        for (const { pid, cmdLine } of parseProcessCsv(wmicOut)) {
          if (seenPids.has(pid)) continue
          // Skip our own Electron/hal-o processes
          if (cmdLine.includes('electron') || cmdLine.includes('hal-o')) continue
          if (!cmdLine.includes('claude')) continue

          // Extract project name from -n "Name" flag
          let projectName = ''
          const nameMatch = cmdLine.match(/-n\s+"([^"]+)"/) || cmdLine.match(/-n\s+(\S+)/)
          if (nameMatch) projectName = nameMatch[1]

          // Extract cwd from `cd /d "path"` pattern (cmd.exe launch scripts)
          let cwd = ''
          const cdMatch = cmdLine.match(/cd\s+\/d\s+"([^"]+)"/) || cmdLine.match(/cd\s+\/d\s+(\S+)/)
          if (cdMatch) cwd = cdMatch[1]

          // Validate cwd — discard if it points to node_modules or doesn't exist
          if (cwd && (!existsSync(cwd) || cwd.includes('node_modules') || cwd.includes('\\npm'))) {
            cwd = ''
          }

          // Skip if already embedded
          if (cwd && embeddedPaths.has(normalize(cwd).toLowerCase())) continue

          // Must have at least a cwd or a project name to be useful
          if (!cwd && !projectName) continue

          if (cwd && !projectName) {
            projectName = cwd.split(/[/\\]/).pop() || 'Unknown'
          }

          seenPids.add(pid)
          results.push({
            pid,
            projectPath: cwd || '',
            projectName: projectName || 'Claude Session',
          })
        }
      } catch { /* wmic query failed — silently ignore */ }
    }

    return results
  })

  // ── Session Absorption: absorb an external Claude session into embedded terminal ──
  ipcMain.handle('absorb-session', async (_e, info: {
    pid: number; projectPath: string; projectName: string
  }): Promise<{ success: boolean }> => {
    const isWin = process.platform === 'win32'

    try {
      // Gracefully terminate the external process
      if (isWin) {
        // Graceful kill (no /F) — gives process chance to clean up
        execSync(`taskkill //PID ${info.pid} //T`, {
          encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        })
      } else {
        execSync(`kill -TERM ${info.pid}`, {
          encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        })
      }
    } catch {
      // Process may have already exited — that's fine, continue with absorption
    }

    // Wait a moment for the process to release resources
    await new Promise((resolve) => setTimeout(resolve, 1500))

    return { success: true }
  })
}
