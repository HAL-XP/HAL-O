import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { registerIpcHandlers } from './ipc-handlers'
import { getIconFilename, openTerminalAt, escapeCmdArg } from './platform'
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
      label: 'HAL-O',
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
    {
      label: 'Dev',
      submenu: [
        {
          label: 'Run Tests (local)',
          click: () => {
            const cwd = process.cwd().replace(/\//g, '\\')
            spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${cwd}" && ${escapeCmdArg('npm test')}`], {
              cwd, detached: true, stdio: 'ignore',
            })
          },
        },
        {
          label: 'Run Tests (Docker)',
          click: () => {
            const cwd = process.cwd().replace(/\//g, '\\')
            spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${cwd}" && ${escapeCmdArg('npm run test:docker')}`], {
              cwd, detached: true, stdio: 'ignore',
            })
          },
        },
        {
          label: 'Test Fresh Install (Docker)',
          click: () => {
            const cwd = process.cwd().replace(/\//g, '\\')
            spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${cwd}" && ${escapeCmdArg('npm run test:fresh')}`], {
              cwd, detached: true, stdio: 'ignore',
            })
          },
        },
        {
          label: 'Docker Shell',
          click: () => {
            const cwd = process.cwd().replace(/\//g, '\\')
            spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${cwd}" && ${escapeCmdArg('npm run test:shell')}`], {
              cwd, detached: true, stdio: 'ignore',
            })
          },
        },
        { type: 'separator' },
        {
          label: '2D Preview Mode',
          type: 'checkbox',
          click: (item) => {
            mainWindow?.webContents.send('toggle-2d-preview', item.checked)
          },
        },
        {
          label: 'Open Project Folder',
          click: () => shell.openPath(process.cwd()),
        },
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
    title: 'HAL-O',
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

  // Auto-reload on renderer crash — ptys survive in main process
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[HAL-O] Renderer crashed (${details.reason}). Auto-reloading in 1s...`)
    setTimeout(() => {
      mainWindow?.webContents.reload()
    }, 1000)
  })

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[HAL-O] Renderer unresponsive. Auto-reloading in 2s...')
    setTimeout(() => {
      mainWindow?.webContents.reload()
    }, 2000)
  })

  mainWindow.webContents.on('responsive', () => {
    console.log('[HAL-O] Renderer responsive again')
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

// Suppress error dialogs — log to console instead, keep main process alive
process.on('uncaughtException', (err) => {
  console.error('[HAL-O] Uncaught exception:', err.message)
})

process.on('unhandledRejection', (reason) => {
  console.error('[HAL-O] Unhandled rejection:', reason)
})

app.whenReady().then(() => {
  registerPid('hal-o')
  registerIpcHandlers()
  createMenu()
  createWindow()
})

app.on('before-quit', () => {
  try {
    const sessions = terminalManager.getActiveSessions()
    console.log(`[HAL-O] before-quit: ${sessions.length} active sessions`)

    if (sessions.length > 0) {
      // Save for auto-restore on next launch (no pop-out — just save and restore)
      const pendingFile = join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.hal-o-pending-sessions.json'
      )
      const data = sessions.map((s) => ({ projectPath: s.projectPath, projectName: s.projectName }))
      writeFileSync(pendingFile, JSON.stringify(data))
      console.log(`[HAL-O] Saved ${data.length} sessions for auto-restore`)
    }

    terminalManager.closeAll()
    unregisterPid('hal-o')
  } catch (err) {
    console.error('[HAL-O] before-quit error:', err)
    terminalManager.closeAll()
    unregisterPid('hal-o')
  }
})

// ── Graceful restart signal ──
// When a file `.hal-o-restart` appears in the project dir,
// pop all terminals to external, save sessions, then quit.
// This lets the CLI agent restart the app without killing terminals.
const restartSignalFile = join(process.cwd(), '.hal-o-restart')

function checkRestartSignal() {
  if (existsSync(restartSignalFile)) {
    console.log('[HAL-O] Restart signal detected — quitting gracefully')
    try { require('fs').unlinkSync(restartSignalFile) } catch { /* */ }
    // before-quit handler will save sessions and pop terminals
    app.quit()
  }
}

// Poll for the signal file every 2 seconds
setInterval(checkRestartSignal, 2000)

app.on('window-all-closed', () => {
  app.quit()
})
