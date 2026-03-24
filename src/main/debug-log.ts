/**
 * Debug logging — opt-in via --debug flag or HAL_O_DEBUG=1 env var.
 * Writes timestamped logs to _debug.log in the project root.
 * OFF by default to avoid token/disk costs.
 *
 * Usage in main process:
 *   import { debugLog, isDebugEnabled } from './debug-log'
 *   debugLog('ipc', 'scan-projects returned', { count: 5 })
 *
 * The renderer sends logs via IPC: window.api.debugLog(tag, message, data?)
 */
import { appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ipcMain } from 'electron'

const DEBUG_FLAG = process.argv.includes('--debug') || process.env.HAL_O_DEBUG === '1'
const LOG_FILE = join(process.cwd(), '_debug.log')

let _initialized = false

export function isDebugEnabled(): boolean {
  return DEBUG_FLAG
}

export function debugLog(tag: string, message: string, data?: unknown): void {
  if (!DEBUG_FLAG) return
  const ts = new Date().toISOString()
  const line = data !== undefined
    ? `[${ts}] [${tag}] ${message} ${JSON.stringify(data)}\n`
    : `[${ts}] [${tag}] ${message}\n`
  try {
    appendFileSync(LOG_FILE, line)
  } catch { /* best effort */ }
}

/** Call once at startup to initialize the log file and register renderer IPC */
export function initDebugLog(): void {
  if (!DEBUG_FLAG || _initialized) return
  _initialized = true

  // Fresh log file
  try {
    writeFileSync(LOG_FILE, `=== HAL-O Debug Log ===\nStarted: ${new Date().toISOString()}\nArgs: ${process.argv.join(' ')}\n\n`)
  } catch { /* best effort */ }

  debugLog('init', 'Debug logging enabled')
  debugLog('init', `Node ${process.version}, Electron ${process.versions.electron}, CWD: ${process.cwd()}`)

  // IPC bridge — renderer can send logs here
  ipcMain.on('debug-log', (_e, tag: string, message: string, data?: unknown) => {
    debugLog(`renderer:${tag}`, message, data)
  })
}
