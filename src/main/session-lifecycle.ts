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
    // Search for any Claude process (not just ones with 'hal' in cmdline)
    // The external session may have been started with just 'claude --continue'
    // Search for claude.exe (native binary) AND node.exe (when run via npm/npx)
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"(Name='claude.exe' or Name='node.exe') and CommandLine like '%claude%'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`
    exec(psCmd, { encoding: 'utf-8', timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve(null); return }
      const lines = stdout.trim().split('\n').slice(1) // skip header
      for (const line of lines) {
        const match = line.match(/"(\d+)","(.+)"/)
        if (match) {
          const pid = parseInt(match[1])
          const cmdLine = match[2]
          // Skip our own Electron process and internal spawns
          if (cmdLine.includes('electron')) continue
          if (cmdLine.includes('node_modules')) continue
          // Skip processes we spawned internally (our headless sessions use --dangerously-skip-permissions -n HAL-O)
          if (cmdLine.includes('--dangerously-skip-permissions') && cmdLine.includes('-n')) continue
          // Match Claude sessions: either explicitly for hal-o, or any --continue session
          // (if the app CWD is hal-o, any external Claude is likely ours)
          const isHalO = cmdLine.toLowerCase().includes('hal-o') || cmdLine.toLowerCase().includes('hal_o')
          const isContinue = cmdLine.includes('--continue')
          if (isHalO || isContinue) {
            console.log(`[Session] Found external Claude session: PID ${pid} (hal-o=${isHalO}, continue=${isContinue})`)
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
  if (process.env.HAL_TEST_MODE === '1') {
    console.log('[Session] Test mode — skipping session lifecycle')
    return
  }
  // 1. Already have an embedded terminal? Done.
  if (hasEmbeddedHalSession()) {
    console.log('[Session] HAL-O terminal already running in app')
    return
  }

  // 2. External session running?
  const external = await detectExternalHalSession()
  if (external) {
    // Dev mode (explicit opt-in only): detect + route, but NEVER absorb
    // User mode (default): don't start a new session, let UI handle absorption
    const devMode = process.env.HAL_DEV_MODE === '1'
    if (devMode) {
      console.log(`[Session] External session detected (PID ${external.pid}) — DEV MODE: routing only`)
    } else {
      console.log(`[Session] External session detected (PID ${external.pid}) — skipping new session start`)
    }
    // Don't start a new one — the external session IS the session
    return
  }

  // 3. No session anywhere — start headless
  console.log('[Session] No HAL-O session found — starting headless')
  startHeadlessSession()
}
