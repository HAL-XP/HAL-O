import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { registerIpcHandlers } from './ipc-handlers'
import { getIconFilename } from './platform'
import { terminalManager } from './terminal-manager'

let mainWindow: BrowserWindow | null = null

// ── PID tracking ──

const PIDS_FILE = join(process.cwd(), '.claude', '.pids')

function registerPid(name: string): void {
  try {
    mkdirSync(join(process.cwd(), '.claude'), { recursive: true })
    const pids = existsSync(PIDS_FILE) ? JSON.parse(readFileSync(PIDS_FILE, 'utf-8')) : {}
    pids[name] = process.pid
    writeFileSync(PIDS_FILE, JSON.stringify(pids, null, 2))
  } catch { /* best effort */ }
}

function unregisterPid(name: string): void {
  try {
    const pids = JSON.parse(readFileSync(PIDS_FILE, 'utf-8'))
    delete pids[name]
    writeFileSync(PIDS_FILE, JSON.stringify(pids, null, 2))
  } catch { /* best effort */ }
}

// ── Menu ──

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Claudeborn',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools', label: 'Developer Tools' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Window ──

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 720,
    minWidth: 750,
    minHeight: 550,
    title: 'Claudeborn',
    icon: join(__dirname, '../../resources/', getIconFilename()),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0f1117',
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  // Give terminal manager access to the window for IPC sends
  terminalManager.setWindow(mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Dev tools ──

// Reload renderer without killing main process (ptys survive!)
ipcMain.handle('reload-renderer', async () => {
  mainWindow?.webContents.reload()
  return true
})

ipcMain.handle('capture-screenshot', async () => {
  if (!mainWindow) return null
  const image = await mainWindow.webContents.capturePage()
  const path = join(process.cwd(), '_screenshot_app.png')
  writeFileSync(path, image.toPNG())
  return path
})

// ── App lifecycle ──

app.whenReady().then(() => {
  registerPid('claudeborn')
  registerIpcHandlers()
  createMenu()
  createWindow()
})

app.on('before-quit', () => {
  // Pop all terminals to external windows so they survive the restart
  const { openTerminalAt } = require('./platform')
  const sessions = terminalManager.getActiveSessions()

  if (sessions.length > 0) {
    // Save for auto-restore on next launch
    const pendingFile = join(
      process.env.USERPROFILE || process.env.HOME || '',
      '.claudeborn-pending-sessions.json'
    )
    writeFileSync(pendingFile, JSON.stringify(
      sessions.map((s: any) => ({ projectPath: s.projectPath, projectName: s.projectName }))
    ))

    // Pop each to external terminal
    for (const s of sessions) {
      openTerminalAt(s.projectPath, `claude --dangerously-skip-permissions -n "${s.projectName}" --continue`)
    }
  }

  terminalManager.closeAll()
  unregisterPid('claudeborn')
})

// ── Graceful restart signal ──
// When a file `.claudeborn-restart` appears in the project dir,
// pop all terminals to external, save sessions, then quit.
// This lets the CLI agent restart the app without killing terminals.
const restartSignalFile = join(process.cwd(), '.claudeborn-restart')
const { watchFile, unwatchFile, unlinkSync: unlinkSyncFs } = require('fs')

function checkRestartSignal() {
  if (existsSync(restartSignalFile)) {
    console.log('[Claudeborn] Restart signal detected — popping terminals and quitting')
    try { unlinkSyncFs(restartSignalFile) } catch { /* */ }

    const { openTerminalAt } = require('./platform')
    const sessions = terminalManager.getActiveSessions()

    // Save sessions for auto-restore
    if (sessions.length > 0) {
      const pendingFile = join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.claudeborn-pending-sessions.json'
      )
      writeFileSync(pendingFile, JSON.stringify(
        sessions.map((s: any) => ({ projectPath: s.projectPath, projectName: s.projectName }))
      ))

      // Pop each to external terminal
      for (const s of sessions) {
        openTerminalAt(s.projectPath, `claude --dangerously-skip-permissions -n "${s.projectName}" --continue`)
        terminalManager.close(s.id)
      }
    }

    // Quit after a short delay to let terminals spawn
    setTimeout(() => app.quit(), 1000)
  }
}

// Poll for the signal file every 2 seconds
setInterval(checkRestartSignal, 2000)

app.on('window-all-closed', () => {
  app.quit()
})
