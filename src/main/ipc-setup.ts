// ── Setup/prerequisites IPC handlers ──
// Owner: Agent D (Wizard + UX)

import { ipcMain, dialog } from 'electron'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { run, findApiKey } from './ipc-shared'
import { openTerminalAt, getGhInstallInfo, getCommonProjectDirs } from './platform'

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

  ipcMain.handle('select-folder', async (_event, defaultPath?: string) => {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const result = await dialog.showOpenDialog({
      defaultPath: defaultPath || home,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
