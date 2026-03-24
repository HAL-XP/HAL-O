// ── Setup/prerequisites IPC handlers ──
// Owner: Agent D (Wizard + UX)

import { ipcMain, dialog } from 'electron'
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { run, findApiKey } from './ipc-shared'
import { openTerminalAt, getGhInstallInfo, getPythonInstallInfo, getClaudeCliInstallInfo, getFfmpegInstallInfo, getGitInstallInfo, getCommonProjectDirs } from './platform'

const HOME = process.env.HOME || process.env.USERPROFILE || ''
const CONTINUATION_FILE = join(HOME, '.hal-o-setup-continue.json')

export function registerSetupHandlers(): void {
  ipcMain.handle('check-prerequisites', async () => {
    const home = process.env.HOME || process.env.USERPROFILE || ''

    // Node.js — if Electron is running, Node works. Use process.version as primary.
    let nodeVersion = process.version || ''
    if (!nodeVersion) {
      try { nodeVersion = run('node --version') } catch { /* */ }
    }

    // gh CLI — separate install check from auth check
    let ghInstalled = false
    let ghAuthenticated = false
    let ghUser = ''
    try {
      run('gh --version')
      ghInstalled = true
    } catch { /* gh not installed */ }

    if (ghInstalled) {
      try {
        ghUser = run('gh api user --jq .login')
        ghAuthenticated = true
      } catch {
        // gh installed but not authenticated — that's OK, separate issue
        try {
          const status = run('gh auth status 2>&1 || true')
          ghAuthenticated = status.includes('Logged in')
          if (ghAuthenticated) {
            const userMatch = status.match(/account\s+(\S+)/)
            if (userMatch) ghUser = userMatch[1]
          }
        } catch { /* */ }
      }
    }

    // git
    let gitInstalled = false
    let gitVersion = ''
    try {
      gitVersion = run('git --version').replace('git version ', '').trim()
      gitInstalled = true
    } catch { /* */ }

    // Python
    let pythonInstalled = false
    let pythonVersion = ''
    for (const cmd of ['python3 --version', 'python --version']) {
      try {
        pythonVersion = run(cmd).replace('Python ', '').trim()
        pythonInstalled = true
        break
      } catch { /* try next */ }
    }

    // Claude CLI
    let claudeCliInstalled = false
    let claudeCliVersion = ''
    try {
      claudeCliVersion = run('claude --version 2>&1').trim()
      claudeCliInstalled = true
    } catch { /* */ }

    // ffmpeg (optional, for voice)
    let ffmpegInstalled = false
    try {
      run('ffmpeg -version')
      ffmpegInstalled = true
    } catch { /* */ }

    // API key
    const apiKeyResult = findApiKey()

    return {
      nodeVersion,
      gitInstalled,
      gitVersion,
      ghInstalled,
      ghAuthenticated,
      ghUser,
      pythonInstalled,
      pythonVersion,
      claudeCliInstalled,
      claudeCliVersion,
      ffmpegInstalled,
      apiKeyFound: !!apiKeyResult.key,
      apiKeySource: apiKeyResult.source,
      apiKeyPreview: apiKeyResult.key ? apiKeyResult.key.slice(0, 12) + '...' : '',
    }
  })

  // ── U21: Detect subscription type for token budget wizard step ──
  ipcMain.handle('detect-subscription-type', async () => {
    const apiKeyResult = findApiKey()
    const hasApiKey = !!apiKeyResult.key

    // Check for Claude Code OAuth credentials (subscription users)
    let hasOAuth = false
    try {
      const claudeDir = join(HOME, '.claude')
      const credentialsPath = join(claudeDir, 'credentials.json')
      if (existsSync(credentialsPath)) {
        const creds = JSON.parse(readFileSync(credentialsPath, 'utf-8'))
        hasOAuth = !!(creds.oauthToken || creds.accessToken || creds.refreshToken)
      }
    } catch { /* */ }

    // Also check .claude.json in home dir
    if (!hasOAuth) {
      try {
        const dotClaudeJson = join(HOME, '.claude.json')
        if (existsSync(dotClaudeJson)) {
          const data = JSON.parse(readFileSync(dotClaudeJson, 'utf-8'))
          hasOAuth = !!(data.oauthToken || data.accessToken || data.refreshToken)
        }
      } catch { /* */ }
    }

    let type: 'api' | 'subscription' | 'unknown' = 'unknown'
    if (hasOAuth) {
      type = 'subscription'
    } else if (hasApiKey) {
      type = 'api'
    }

    return { type, hasApiKey }
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

  ipcMain.handle('install-git', async () => {
    try {
      const { command } = getGitInstallInfo()
      run(command)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('install-python', async () => {
    try {
      const { command } = getPythonInstallInfo()
      run(command)
      return { success: true, needsRestart: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('install-claude-cli', async () => {
    try {
      const { command } = getClaudeCliInstallInfo()
      run(command)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('install-ffmpeg', async () => {
    try {
      const { command } = getFfmpegInstallInfo()
      run(command)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('get-gh-install-label', async () => {
    return getGhInstallInfo().label
  })

  ipcMain.handle('get-install-labels', async () => {
    return {
      git: getGitInstallInfo().label,
      gh: getGhInstallInfo().label,
      python: getPythonInstallInfo().label,
      claudeCli: getClaudeCliInstallInfo().label,
      ffmpeg: getFfmpegInstallInfo().label,
    }
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

  ipcMain.handle('select-folder', async (_event, defaultPath?: string) => {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const result = await dialog.showOpenDialog({
      defaultPath: defaultPath || home,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── Continuation files (D4) ──
  // Write a continuation file so the app knows to resume setup after relaunch
  ipcMain.handle('write-continuation', async (_event, data: { step: string; reason: string; message: string }) => {
    try {
      writeFileSync(CONTINUATION_FILE, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Read and delete the continuation file (returns null if none)
  ipcMain.handle('read-continuation', async () => {
    try {
      if (!existsSync(CONTINUATION_FILE)) return null
      const data = JSON.parse(readFileSync(CONTINUATION_FILE, 'utf-8'))
      unlinkSync(CONTINUATION_FILE)
      return data
    } catch {
      // If parse fails or file disappears, clean up and return null
      try { unlinkSync(CONTINUATION_FILE) } catch { /* */ }
      return null
    }
  })

  // ── Statusline config detection (D8) ──
  ipcMain.handle('check-statusline', async () => {
    const claudeSettingsPath = join(HOME, '.claude', 'settings.json')
    try {
      if (!existsSync(claudeSettingsPath)) {
        return { exists: false, hasStatusline: false, settingsPath: claudeSettingsPath }
      }
      const settings = JSON.parse(readFileSync(claudeSettingsPath, 'utf-8'))
      const hasStatusline = !!(
        settings.env?.CLAUDE_CODE_ENABLE_STATUSLINE ||
        settings.env?.CLAUDE_STATUSLINE ||
        settings.statusline ||
        settings.statusLine
      )
      return { exists: true, hasStatusline, settingsPath: claudeSettingsPath }
    } catch {
      return { exists: false, hasStatusline: false, settingsPath: claudeSettingsPath }
    }
  })

  // Configure a default statusline in ~/.claude/settings.json
  ipcMain.handle('configure-statusline', async () => {
    const claudeDir = join(HOME, '.claude')
    const claudeSettingsPath = join(claudeDir, 'settings.json')
    try {
      const { mkdirSync } = require('fs')
      mkdirSync(claudeDir, { recursive: true })

      let settings: Record<string, any> = {}
      try {
        settings = JSON.parse(readFileSync(claudeSettingsPath, 'utf-8'))
      } catch { /* new file */ }

      if (!settings.env) settings.env = {}
      settings.env.CLAUDE_CODE_ENABLE_STATUSLINE = '1'

      writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      return { success: true, path: claudeSettingsPath }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
