#!/usr/bin/env node
// HAL-OS Watchdog — keeps the app alive, relaunches on crash
// Run: node _scripts/watchdog.js (detaches itself automatically)
// Kill: create .hal-o-watchdog-stop file in project root

const { spawn, execSync } = require('child_process')
const { existsSync, unlinkSync, writeFileSync } = require('fs')
const { join } = require('path')
const http = require('http')

const PROJECT_ROOT = join(__dirname, '..')
const STOP_FILE = join(PROJECT_ROOT, '.hal-o-watchdog-stop')
const PID_FILE = join(PROJECT_ROOT, '.hal-o-watchdog-pid')
const CHECK_INTERVAL = 60000 // 60 seconds
const HEALTH_URL = 'http://127.0.0.1:19400/health'
const MAX_RESTART_ATTEMPTS = 5
const RESTART_COOLDOWN = 30000 // 30s between restarts

let restartCount = 0
let lastRestart = 0

// Write PID for identification
writeFileSync(PID_FILE, String(process.pid))
console.log(`[Watchdog] Started (PID ${process.pid}). Stop file: ${STOP_FILE}`)

// Clean up stop file if it exists from previous run
if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE)

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

async function monitor() {
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
    console.log('[Watchdog] App not responding — relaunching...')
    launchApp()
  }
}

// Run check loop
setInterval(monitor, CHECK_INTERVAL)

// Initial check after 5s
setTimeout(monitor, 5000)

console.log(`[Watchdog] Monitoring ${HEALTH_URL} every ${CHECK_INTERVAL / 1000}s`)
