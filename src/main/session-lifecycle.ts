// ── Session Lifecycle ──
// Ensures there's always ONE HAL-O Claude session running.
// On app boot: detect external session → absorb it, or start headless.
// The session persists independently of the app window.
//
// CRITICAL SAFETY: NEVER absorb a session that has --channels.
// That session is the user's primary TG-connected session. Killing it
// disconnects the user from Telegram and has caused real incidents.
// This protection is enforced in code — not in CLAUDE.md rules that get forgotten.

import { exec, execSync } from 'child_process'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { terminalManager } from './terminal-manager'
import { getInstanceName, dataPath } from './instance'
import { loadExternalSessionState, clearExternalSessionState, verifyExternalSession } from './session-externalize'

// ── Session Lock File ──
// Written by session-health-check.sh on every session start.
// Provides a fast, reliable guard against absorbing TG-connected sessions.

interface SessionLock {
  pid: number
  hasChannels: boolean
  startedAt: string
  instanceName: string
  command?: string
}

function getSessionLockPath(): string {
  return dataPath('session.lock')
}

/** Read the session lock file. Returns null if missing/corrupt/stale. */
function readSessionLock(): SessionLock | null {
  const lockPath = getSessionLockPath()
  try {
    if (!existsSync(lockPath)) return null
    const raw = JSON.parse(readFileSync(lockPath, 'utf-8'))
    if (raw && typeof raw.pid === 'number') {
      return raw as SessionLock
    }
  } catch {
    // Corrupt lock file — treat as absent
  }
  return null
}

/** Remove the lock file (called when PID is confirmed dead). */
function clearSessionLock(): void {
  const lockPath = getSessionLockPath()
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath)
      console.log('[Session] Stale lock file removed')
    }
  } catch { /* best effort */ }
}

/**
 * Check if a session is protected from absorption.
 * A session is protected if:
 *   1. Its command line contains --channels (direct check)
 *   2. A lock file exists with hasChannels=true and matching PID that is alive
 *
 * Returns a reason string if protected, or null if safe to absorb.
 */
function isSessionProtected(pid: number, cmdLine: string): string | null {
  // ── Check 1: Direct command line inspection ──
  if (cmdLine.includes('--channels')) {
    return `command line contains --channels`
  }

  // ── Check 2: Lock file guard ──
  const lock = readSessionLock()
  if (lock && lock.hasChannels && lock.pid === pid) {
    if (verifyExternalSession(pid)) {
      return `lock file marks PID ${pid} as channels-connected (locked at ${lock.startedAt})`
    } else {
      // Lock file PID is dead — clean up
      console.log(`[Session] Lock file PID ${pid} is dead — clearing stale lock`)
      clearSessionLock()
    }
  }

  return null
}

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
          // Skip our own Electron process and npm/node internals
          if (cmdLine.includes('electron')) continue
          if (cmdLine.includes('node_modules')) continue
          // ONLY match processes with THIS instance's name (-n flag)
          // Claudette must NOT kill HAL-O. HAL-O must NOT kill Claudette.
          const instanceName = getInstanceName()
          const namePattern = `-n ${instanceName}` // e.g. "-n HAL-O" or "-n Claudette"
          const namePatternQuoted = `-n "${instanceName}"` // e.g. '-n "HAL-O"'
          const matchesThisInstance = cmdLine.includes(namePattern) || cmdLine.includes(namePatternQuoted)
          if (matchesThisInstance) {
            console.log(`[Session] Found external ${instanceName} session: PID ${pid}`)
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
  const instanceName = getInstanceName() // "HAL-O" for main, "Claudette" for clones, etc.
  const projectPath = process.cwd()
  const sessionId = `${instanceName.toLowerCase().replace(/\s+/g, '-')}-session-${Date.now()}`

  console.log(`[Session] Starting headless ${instanceName} session in ${projectPath}`)

  const ok = terminalManager.spawn(sessionId, {
    cwd: projectPath,
    cmd: 'claude',
    args: ['--dangerously-skip-permissions', '-n', instanceName, '--continue'],
    cols: 120,
    rows: 30,
    projectName: instanceName,
  })

  if (ok) {
    console.log(`[Session] Headless ${instanceName} session started: ${sessionId}`)
  } else {
    console.warn(`[Session] Failed to start headless ${instanceName} session — node-pty not available?`)
  }
}

/** Gracefully kill an external process, then start internal session.
 *  SAFETY: Refuses to absorb sessions with --channels (TG-connected). */
async function autoAbsorb(external: { pid: number; cmdLine: string }): Promise<void> {
  // ── CRITICAL GUARD: never absorb a channels-connected session ──
  const protectedReason = isSessionProtected(external.pid, external.cmdLine)
  if (protectedReason) {
    console.log(`[Session] *** REFUSING TO ABSORB PID ${external.pid} ***`)
    console.log(`[Session] Reason: ${protectedReason}`)
    console.log(`[Session] This is the user's primary TG-connected session. Leaving it alone.`)
    console.log(`[Session] The app will co-exist with the external session (no internal headless).`)
    return
  }

  console.log(`[Session] AUTO-ABSORB: killing external PID ${external.pid}, then starting internal session`)
  console.log(`[Session] (Verified: no --channels flag, no lock file protection — safe to absorb)`)

  // Kill the external process gracefully (tree kill without /F first)
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${external.pid} /T`, {
        encoding: 'utf-8', timeout: 5000, windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } else {
      execSync(`kill -TERM ${external.pid}`, {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      })
    }
  } catch { /* process may have already exited */ }

  // Wait for process to die
  await new Promise(r => setTimeout(r, 2000))

  // Force kill if still alive
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${external.pid} /T /F`, {
        encoding: 'utf-8', timeout: 3000, windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch { /* already dead */ }
    await new Promise(r => setTimeout(r, 500))
  }

  console.log('[Session] External session killed — starting internal with --continue')
  startHeadlessSession()
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

  // 1.5. CHECK LOCK FILE: If a channels-connected session is running, NEVER absorb.
  //      This is the primary guard — checked BEFORE any absorption path.
  const lock = readSessionLock()
  if (lock && lock.hasChannels) {
    const alive = verifyExternalSession(lock.pid)
    if (alive) {
      console.log(`[Session] *** LOCK FILE GUARD: PID ${lock.pid} is a channels-connected session ***`)
      console.log(`[Session] Instance: ${lock.instanceName}, started: ${lock.startedAt}`)
      console.log(`[Session] NOT absorbing. The app will co-exist with the external session.`)
      return
    } else {
      console.log(`[Session] Lock file PID ${lock.pid} is dead — clearing stale lock`)
      clearSessionLock()
    }
  }

  // 2. FAST PATH: Check state file from previous externalize
  //    This avoids the slow WMI process scan (~2-5s) when we already know the PID.
  const savedState = loadExternalSessionState()
  if (savedState) {
    console.log(`[Session] Found external session state file: PID ${savedState.pid} (${savedState.instanceName})`)
    const alive = verifyExternalSession(savedState.pid)
    if (alive) {
      console.log(`[Session] State file PID ${savedState.pid} is alive — attempting AUTO-ABSORB (fast path)`)
      clearExternalSessionState()
      await autoAbsorb({ pid: savedState.pid, cmdLine: savedState.command })
      return
    } else {
      console.log(`[Session] State file PID ${savedState.pid} is dead — clearing stale state`)
      clearExternalSessionState()
    }
  }

  // 3. SLOW PATH: Full process scan for external session — auto-absorb if found
  const external = await detectExternalHalSession()
  if (external) {
    console.log(`[Session] External session detected (PID ${external.pid}) — attempting AUTO-ABSORB`)
    await autoAbsorb(external)
    return
  }

  // 4. No session anywhere — start fresh headless
  console.log('[Session] No HAL-O session found — starting headless')
  startHeadlessSession()
}
