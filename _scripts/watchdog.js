#!/usr/bin/env node
// HAL-OS Watchdog -- keeps the app alive, relaunches on crash
// ALSO monitors the session lock file and relaunches Claude with --channels if it dies.
// Run: node _scripts/watchdog.js (detaches itself automatically)
// Kill: create .hal-o-watchdog-stop file in project root

const { spawn, execSync } = require('child_process')
const { existsSync, unlinkSync, writeFileSync, readFileSync, mkdirSync } = require('fs')
const { join } = require('path')
const http = require('http')
const os = require('os')

const PROJECT_ROOT = join(__dirname, '..')
const STOP_FILE = join(PROJECT_ROOT, '.hal-o-watchdog-stop')
const PID_FILE = join(PROJECT_ROOT, '.hal-o-watchdog-pid')
const CHECK_INTERVAL = 60000 // 60 seconds
const SESSION_CHECK_INTERVAL = 15000 // 15 seconds — faster for session monitoring
const HEALTH_URL = 'http://127.0.0.1:19400/health'
const MAX_RESTART_ATTEMPTS = 5
const RESTART_COOLDOWN = 30000 // 30s between restarts
const SESSION_RESTART_COOLDOWN = 60000 // 60s between session relaunches

let restartCount = 0
let lastRestart = 0
let lastSessionRestart = 0

// Write PID for identification
writeFileSync(PID_FILE, String(process.pid))
console.log(`[Watchdog] Started (PID ${process.pid}). Stop file: ${STOP_FILE}`)

// Clean up stop file if it exists from previous run
if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE)

// -- Determine instance configuration -------------------------------------------

function getInstanceConfig() {
  const instanceJsonPath = join(PROJECT_ROOT, 'instance.json')
  try {
    if (existsSync(instanceJsonPath)) {
      const raw = JSON.parse(readFileSync(instanceJsonPath, 'utf-8'))
      return {
        id: raw.id || 'hal-o',
        name: raw.name || raw.id || 'HAL-O',
        isClone: true,
      }
    }
  } catch { /* ignore */ }
  return { id: 'hal-o', name: 'HAL-O', isClone: false }
}

const instanceConfig = getInstanceConfig()

function getSessionLockPath() {
  const halOBase = join(os.homedir(), '.hal-o')
  if (instanceConfig.isClone) {
    return join(halOBase, 'instances', instanceConfig.id, 'session.lock')
  }
  return join(halOBase, 'session.lock')
}

// -- Session lock file monitoring ------------------------------------------------

function readSessionLock() {
  const lockPath = getSessionLockPath()
  try {
    if (!existsSync(lockPath)) return null
    const raw = JSON.parse(readFileSync(lockPath, 'utf-8'))
    if (raw && typeof raw.pid === 'number') {
      return raw
    }
  } catch {
    // Corrupt lock file
  }
  return null
}

function isProcessAlive(pid) {
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  try {
    const out = execSync(
      `tasklist /FI "PID eq ${pid}" /NH /FO CSV`,
      { encoding: 'utf-8', timeout: 5000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    return out.includes(`"${pid}"`)
  } catch {
    return false
  }
}

function clearSessionLock() {
  const lockPath = getSessionLockPath()
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath)
      console.log('[Watchdog] Cleared stale session lock file')
    }
  } catch { /* best effort */ }
}

/**
 * Relaunch a Claude session using the bat file.
 * This ensures credentials, tokens, and --channels are all set correctly.
 */
function relaunchSession(lock) {
  const now = Date.now()
  if (now - lastSessionRestart < SESSION_RESTART_COOLDOWN) {
    console.log('[Watchdog] Session relaunch cooldown active, skipping')
    return
  }
  lastSessionRestart = now

  console.log(`[Watchdog] Session PID ${lock.pid} died. Relaunching...`)
  console.log(`[Watchdog] Instance: ${lock.instanceName}, had channels: ${lock.hasChannels}`)

  // Use the resume bat file which sets up credentials and --channels
  const batFile = join(PROJECT_ROOT, '_scripts', '_claude_cli_resume.bat')
  if (!existsSync(batFile)) {
    console.error(`[Watchdog] Resume bat file not found: ${batFile}`)
    return
  }

  // Clear the lock file — the new session's health check will write a fresh one
  clearSessionLock()

  const child = spawn('cmd.exe', ['/c', batFile], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: false, // Show the terminal window
  })
  child.unref()
  console.log(`[Watchdog] Session relaunched via bat file (cmd PID ${child.pid})`)
}

// -- App health monitoring -------------------------------------------------------

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.status === 'ok')
        } catch { resolve(false) }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

function launchApp() {
  const now = Date.now()
  if (now - lastRestart < RESTART_COOLDOWN) {
    console.log(`[Watchdog] Cooldown active, skipping restart`)
    return
  }
  if (restartCount >= MAX_RESTART_ATTEMPTS) {
    console.log(`[Watchdog] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Stopping.`)
    process.exit(1)
  }

  restartCount++
  lastRestart = now
  console.log(`[Watchdog] Launching HAL-OS app (attempt ${restartCount}/${MAX_RESTART_ATTEMPTS})...`)

  const child = spawn('cmd.exe', ['/c', 'npm start'], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
  console.log(`[Watchdog] App launched (PID ${child.pid})`)
}

// -- Monitor loops ---------------------------------------------------------------

async function monitorApp() {
  // Check for stop signal
  if (existsSync(STOP_FILE)) {
    console.log('[Watchdog] Stop signal received. Shutting down.')
    try { unlinkSync(PID_FILE) } catch {}
    process.exit(0)
  }

  const healthy = await checkHealth()
  if (healthy) {
    // Reset restart counter when app is healthy
    restartCount = 0
  } else {
    console.log('[Watchdog] App not responding -- relaunching...')
    launchApp()
  }
}

function monitorSession() {
  // Check for stop signal
  if (existsSync(STOP_FILE)) return

  const lock = readSessionLock()
  if (!lock) {
    // No lock file = no session to monitor (might not have started yet)
    return
  }

  // Only monitor channels-connected sessions (these are the critical ones)
  if (!lock.hasChannels) {
    return
  }

  // Check if the locked PID is still alive
  if (!isProcessAlive(lock.pid)) {
    console.log(`[Watchdog] ALERT: Channels-connected session (PID ${lock.pid}) is DEAD`)
    relaunchSession(lock)
  }
}

// -- Start monitoring ------------------------------------------------------------

// App health check every 60s
setInterval(monitorApp, CHECK_INTERVAL)

// Session lock check every 15s (faster — TG disconnection is high priority)
setInterval(monitorSession, SESSION_CHECK_INTERVAL)

// Initial checks after startup
setTimeout(monitorApp, 5000)
setTimeout(monitorSession, 3000)

console.log(`[Watchdog] Instance: ${instanceConfig.name} (${instanceConfig.id})`)
console.log(`[Watchdog] Lock file: ${getSessionLockPath()}`)
console.log(`[Watchdog] Monitoring app at ${HEALTH_URL} every ${CHECK_INTERVAL / 1000}s`)
console.log(`[Watchdog] Monitoring session lock every ${SESSION_CHECK_INTERVAL / 1000}s`)
