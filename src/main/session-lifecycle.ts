// ── Session Lifecycle ──
// Ensures there's always ONE HAL-O Claude session running.
// On app boot: detect external session → absorb it, or start headless.
// The session persists independently of the app window.

import { exec } from 'child_process'
import { terminalManager } from './terminal-manager'

/** Check if a HAL-O Claude session is already running externally */
async function detectExternalHalSession(): Promise<{ pid: number; cmdLine: string } | null> {
  if (process.platform !== 'win32') return null

  return new Promise((resolve) => {
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe' and CommandLine like '%claude%hal%'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`
    exec(psCmd, { encoding: 'utf-8', timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve(null); return }
      const lines = stdout.trim().split('\n').slice(1) // skip header
      for (const line of lines) {
        const match = line.match(/"(\d+)","(.+)"/)
        if (match) {
          const pid = parseInt(match[1])
          const cmdLine = match[2]
          // Skip our own Electron process
          if (cmdLine.includes('electron')) continue
          // Must be a Claude session for hal-o
          if (cmdLine.toLowerCase().includes('hal-o') || cmdLine.toLowerCase().includes('hal_o')) {
            console.log(`[Session] Found external HAL-O session: PID ${pid}`)
            resolve({ pid, cmdLine })
            return
          }
        }
      }
      resolve(null)
    })
  })
}

/** Check if HAL-O terminal is already running inside the app */
function hasEmbeddedHalSession(): boolean {
  const sessions = terminalManager.getActiveSessions()
  return sessions.some(s =>
    s.projectPath.toLowerCase().replace(/\\/g, '/').includes('hal-o')
  )
}

/** Start a headless Claude session for HAL-O */
function startHeadlessSession(): void {
  const halPath = process.cwd() // HAL-O project is the CWD of the Electron app
  const sessionId = `hal-session-${Date.now()}`

  console.log(`[Session] Starting headless HAL-O session in ${halPath}`)

  const ok = terminalManager.spawn(sessionId, {
    cwd: halPath,
    cmd: 'claude',
    args: ['--dangerously-skip-permissions', '-n', 'HAL-O', '--continue'],
    cols: 120,
    rows: 30,
    projectName: 'HAL-O',
  })

  if (ok) {
    console.log(`[Session] Headless HAL-O session started: ${sessionId}`)
  } else {
    console.warn('[Session] Failed to start headless session — node-pty not available?')
  }
}

/** Main lifecycle function — called on app boot */
export async function detectOrStartHalSession(): Promise<void> {
  // 1. Already have an embedded terminal? Done.
  if (hasEmbeddedHalSession()) {
    console.log('[Session] HAL-O terminal already running in app')
    return
  }

  // 2. External session running? Log it (absorb is handled by detect-external-sessions IPC)
  const external = await detectExternalHalSession()
  if (external) {
    console.log(`[Session] External HAL-O session detected (PID ${external.pid}) — can be absorbed via UI`)
    // Don't start a new one — the external session IS the session
    // The user can absorb it via the project card's "Absorb" button
    return
  }

  // 3. No session anywhere — start headless
  console.log('[Session] No HAL-O session found — starting headless')
  startHeadlessSession()
}
