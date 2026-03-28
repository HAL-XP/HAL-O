import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { registerIpcHandlers } from './ipc-handlers'
import { getIconFilename, openTerminalAt, escapeCmdArg, isWin } from './platform'
import { terminalManager } from './terminal-manager'
import { HAL_O_VERSION } from './version'
import { initDebugLog, debugLog, isDebugEnabled } from './debug-log'
import { startTelegramHandler, stopTelegramHandler } from './telegram-handler'
import { isClone, getInstanceId } from './instance'

// ── Per-instance Electron userData ──
// Clones get their own cache/state dir to prevent collisions
if (isClone()) {
  const instanceUserData = join(app.getPath('userData'), 'instances', getInstanceId())
  if (!existsSync(instanceUserData)) mkdirSync(instanceUserData, { recursive: true })
  app.setPath('userData', instanceUserData)
}

// ── B25: V8 GC pressure mitigation ──
// Give V8 more old-gen heap headroom so major GC runs less frequently.
// Default is ~1.5GB; with many Html DOM panels the GC traces DOM trees causing 100-200ms pauses.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')
// Disable native occlusion calculation on Windows — causes spurious GC pauses during window interaction
if (isWin) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}
// --uncap-fps: disable vsync for benchmarking (shows true GPU headroom on fast machines)
if (process.argv.includes('--uncap-fps')) {
  app.commandLine.appendSwitch('disable-frame-rate-limit')
  app.commandLine.appendSwitch('disable-gpu-vsync')
}

// Initialize debug logging (only active with --debug flag or HAL_O_DEBUG=1)
initDebugLog()

/** Normalize cwd to a proper Windows path (handles Git Bash /d/... style) */
function getWinCwd(): string {
  let cwd = process.cwd()
  if (isWin && /^\/[a-zA-Z]\//.test(cwd)) {
    cwd = cwd[1].toUpperCase() + ':' + cwd.slice(2)
  }
  return cwd.replace(/\//g, '\\')
}

let mainWindow: BrowserWindow | null = null

// ── B32: Persist window bounds ──
const BOUNDS_FILE = join(app.getPath('userData'), 'window-bounds.json')

function loadBounds(): { x?: number; y?: number; width: number; height: number; maximized: boolean } {
  try {
    return JSON.parse(readFileSync(BOUNDS_FILE, 'utf-8'))
  } catch {
    return { width: 950, height: 720, maximized: true }
  }
}

function saveBounds(): void {
  if (!mainWindow) return
  try {
    const maximized = mainWindow.isMaximized()
    // Save the non-maximized bounds so restore works correctly
    const bounds = maximized ? (mainWindow as any)._lastNormalBounds || mainWindow.getNormalBounds() : mainWindow.getBounds()
    writeFileSync(BOUNDS_FILE, JSON.stringify({ ...bounds, maximized }, null, 2))
  } catch { /* best effort */ }
}

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
          click: () => { execSync('start cmd /k "npm test"', { cwd: getWinCwd(), shell: 'cmd.exe' }) },
        },
        {
          label: 'Run Tests (Docker)',
          click: () => { execSync('start cmd /k "npm run test:docker"', { cwd: getWinCwd(), shell: 'cmd.exe' }) },
        },
        {
          label: 'Test Fresh Install (Docker)',
          click: () => { execSync('start cmd /k "npm run test:fresh"', { cwd: getWinCwd(), shell: 'cmd.exe' }) },
        },
        {
          label: 'Docker Shell',
          click: () => { execSync('start cmd /k "npm run test:shell"', { cwd: getWinCwd(), shell: 'cmd.exe' }) },
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
        { type: 'separator' },
        {
          label: 'Cinematic Demo Mode',
          type: 'checkbox',
          click: (item) => {
            mainWindow?.webContents.send('toggle-cinematic', item.checked)
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Window ──

function createWindow(): void {
  const saved = loadBounds()
  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: 750,
    minHeight: 550,
    title: 'HAL-O',
    icon: join(__dirname, '../../resources/', getIconFilename()),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    },
    backgroundColor: '#0f1117',
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    if (saved.maximized) mainWindow?.maximize()
    mainWindow?.show()

    // M2: Auto-activate cinematic demo mode from --demo-cinematic flag
    if (process.argv.includes('--demo-cinematic')) {
      // Delay slightly to let the renderer initialize
      setTimeout(() => {
        mainWindow?.webContents.send('toggle-cinematic', true)
      }, 2000)
    }
  })

  // ── B32: Save window bounds on move/resize ──
  mainWindow.on('resize', () => { if (!mainWindow?.isMaximized()) (mainWindow as any)._lastNormalBounds = mainWindow?.getBounds() })
  mainWindow.on('move', () => { if (!mainWindow?.isMaximized()) (mainWindow as any)._lastNormalBounds = mainWindow?.getBounds() })
  mainWindow.on('close', () => saveBounds())

  // ── Frame-rate throttle: notify renderer when window loses/gains focus ──
  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window-focus-change', false)
  })
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window-focus-change', true)
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

// Clipboard — reliable in all Electron security contexts
ipcMain.handle('copy-to-clipboard', async (_event, text: string) => {
  const { clipboard } = await import('electron')
  clipboard.writeText(text)
  return true
})

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

// ── Watchdog heartbeat writer (X8) ──

const CLAUDE_DIR = join(process.env.USERPROFILE || process.env.HOME || '', '.claude')
const HEARTBEAT_FILE = join(CLAUDE_DIR, 'hal-o-heartbeat.json')
const SHUTDOWN_FILE = join(CLAUDE_DIR, 'hal-o-shutdown.json')
const HEARTBEAT_INTERVAL_MS = 30_000

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const appStartTime = Date.now()

function writeHeartbeat(): void {
  try {
    mkdirSync(CLAUDE_DIR, { recursive: true })
    const payload = {
      pid: process.pid,
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - appStartTime) / 1000),
      version: HAL_O_VERSION,
    }
    writeFileSync(HEARTBEAT_FILE, JSON.stringify(payload, null, 2))
  } catch { /* best effort — don't crash the app */ }
}

function startHeartbeat(): void {
  writeHeartbeat() // immediate first beat
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/** Remove heartbeat file and write shutdown signal so watchdog knows it was intentional */
function cleanShutdown(reason: string): void {
  stopHeartbeat()
  try {
    // Delete heartbeat — absence tells watchdog "not running"
    if (existsSync(HEARTBEAT_FILE)) unlinkSync(HEARTBEAT_FILE)
  } catch { /* best effort */ }
  try {
    // Write shutdown signal — watchdog checks: if shutdown newer than heartbeat → don't relaunch
    mkdirSync(CLAUDE_DIR, { recursive: true })
    writeFileSync(SHUTDOWN_FILE, JSON.stringify({
      reason,
      timestamp: new Date().toISOString(),
    }, null, 2))
  } catch { /* best effort */ }
}

// ── Launch on startup IPC (X8) ──

ipcMain.handle('get-launch-on-startup', async () => {
  try {
    const settings = app.getLoginItemSettings()
    return settings.openAtLogin
  } catch {
    return false
  }
})

ipcMain.handle('set-launch-on-startup', async (_event, enabled: boolean) => {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ── App lifecycle ──

// Suppress error dialogs — log to console instead, keep main process alive
process.on('uncaughtException', (err) => {
  console.error('[HAL-O] Uncaught exception:', err.message)
})

process.on('unhandledRejection', (reason) => {
  console.error('[HAL-O] Unhandled rejection:', reason)
})

app.whenReady().then(async () => {
  registerPid('hal-o')
  registerIpcHandlers()
  createMenu()
  createWindow()
  startHeartbeat()
  // Start own Telegram handler for dispatch-aware routing
  startTelegramHandler()

  // Write this instance's TG token to the plugin .env BEFORE session starts
  // This ensures the TG plugin connects to the RIGHT bot for this instance
  try {
    const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
    const { join } = require('path')
    const credPath = join(process.env.USERPROFILE || process.env.HOME || '', '.claude_credentials')
    if (existsSync(credPath)) {
      const content = readFileSync(credPath, 'utf-8')
      // Determine which token to use based on instance
      const { isClone } = require('./instance')
      let token = ''
      if (isClone()) {
        // Clone: use TELEGRAM_MAIN_BOT_TOKEN or TELEGRAM_CLAUDETTE_BOT_TOKEN
        const m = content.match(/TELEGRAM_MAIN_BOT_TOKEN=["']?([^\s"'\r\n]+)/) ||
                  content.match(/TELEGRAM_CLAUDETTE_BOT_TOKEN=["']?([^\s"'\r\n]+)/)
        if (m) token = m[1]
      } else {
        // Main: use TELEGRAM_BOT_TOKEN
        const m = content.match(/TELEGRAM_BOT_TOKEN=["']?([^\s"'\r\n]+)/)
        if (m) token = m[1]
      }
      if (token) {
        const tgDir = join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'channels', 'telegram')
        if (existsSync(tgDir)) {
          writeFileSync(join(tgDir, '.env'), `TELEGRAM_BOT_TOKEN=${token}\n`, 'utf-8')
          console.log(`[HAL-O] TG token written to plugin .env (${token.slice(0, 10)}...)`)
        }
      }
    }
  } catch (e) { console.error('[HAL-O] Failed to write TG token:', e) }

  // Session lifecycle: detect or start Claude session
  // This ensures there's always ONE session running
  setTimeout(async () => {
    try {
      const { detectOrStartHalSession } = await import('./session-lifecycle')
      await detectOrStartHalSession()
    } catch (err) {
      console.error('[HAL-O] Session lifecycle error:', err)
    }
  }, 3000) // Wait 3s for window + terminals to initialize
})

app.on('before-quit', () => {
  try {
    const sessions = terminalManager.getActiveSessions()
    console.log(`[HAL-O] before-quit: ${sessions.length} active sessions`)

    if (sessions.length > 0) {
      // Save for auto-restore on next launch (no pop-out — just save and restore)
      // Exclude HAL-O sessions — session-lifecycle.ts owns those exclusively
      const pendingFile = join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.hal-o-pending-sessions.json'
      )
      const data = sessions
        .map((s) => ({ projectPath: s.projectPath, projectName: s.projectName }))
        .filter((s) => !s.projectPath.toLowerCase().replace(/\\/g, '/').includes('hal-o'))
      if (data.length > 0) {
        writeFileSync(pendingFile, JSON.stringify(data))
        console.log(`[HAL-O] Saved ${data.length} non-HAL sessions for auto-restore`)
      } else {
        console.log('[HAL-O] No non-HAL sessions to save (HAL sessions handled by session-lifecycle)')
      }
    }

    stopTelegramHandler()
    terminalManager.closeAll()
    unregisterPid('hal-o')
    cleanShutdown('user-quit')
  } catch (err) {
    console.error('[HAL-O] before-quit error:', err)
    terminalManager.closeAll()
    unregisterPid('hal-o')
    cleanShutdown('user-quit')
  }
})

// ── Graceful restart signal ──
// When a file `.hal-o-restart` appears in the project dir,
// pop all terminals to external, save sessions, then quit.
// This lets the CLI agent restart the app without killing terminals.
const restartSignalFile = join(process.cwd(), '.hal-o-restart')

function checkRestartSignal() {
  if (existsSync(restartSignalFile)) {
    console.log('[HAL-O] Restart signal detected — launching restart orchestrator')
    try { require('fs').unlinkSync(restartSignalFile) } catch { /* */ }

    // Launch the restart orchestrator script (runs OUTSIDE this process)
    // It will: 1) start Claude externally with --continue, 2) wait for it,
    // 3) kill this app, 4) relaunch the app
    const scriptPath = join(process.cwd(), '_scripts', 'restart-cycle.ps1')
    if (existsSync(scriptPath)) {
      const { spawn } = require('child_process')
      spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-HalODir', process.cwd()], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      }).unref()
      console.log('[HAL-O] Restart orchestrator launched — it will handle the cycle')
    } else {
      console.error('[HAL-O] restart-cycle.ps1 not found — falling back to simple quit')
      app.quit()
    }
  }
}

// Poll for the signal file every 2 seconds
setInterval(checkRestartSignal, 2000)

app.on('window-all-closed', () => {
  app.quit()
})
