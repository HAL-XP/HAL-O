// ── Electron Graceful Shutdown ──
// Ensures Claude session survives app restarts by externalizing BEFORE Electron dies.
//
// Safety contract:
//   1. Call externalizeSession() — spawns detached Claude
//   2. Wait for verification (Claude is alive)
//   3. Tiny gap (100ms) then quit Electron
//   4. If verification FAILS → ABORT shutdown, do NOT kill Electron
//
// This prevents the catastrophic scenario where Claude dies with the app.

import { app } from 'electron'
import { externalizeSession, verifyExternalSession } from './session-externalize'
import { terminalManager } from './terminal-manager'

export interface ShutdownOptions {
  /** Why we're shutting down (logged + sent to caller) */
  reason: string
  /** If true, externalize Claude session before quitting */
  waitForExternal: boolean
}

export interface ShutdownResult {
  success: boolean
  reason: string
  externalPid?: number
  error?: string
  aborted?: boolean
}

/**
 * Graceful shutdown: externalize Claude session, then quit Electron.
 *
 * If waitForExternal is true:
 *   - Spawns Claude externally (detached from process tree)
 *   - Verifies the external process is alive
 *   - Only then quits Electron (100ms gap)
 *   - If verification fails → ABORT, do NOT quit
 *
 * If waitForExternal is false:
 *   - Just quits Electron immediately (for simple restart cases)
 */
export async function gracefulShutdown(options: ShutdownOptions): Promise<ShutdownResult> {
  const { reason, waitForExternal } = options
  console.log(`[Shutdown] Graceful shutdown initiated — reason: ${reason}, waitForExternal: ${waitForExternal}`)

  if (waitForExternal) {
    // ── Phase 1: Externalize the Claude session ──
    console.log('[Shutdown] Phase 1: Externalizing Claude session...')
    let externalPid: number | null = null

    try {
      externalPid = await externalizeSession()
    } catch (err) {
      console.error('[Shutdown] Externalize threw:', err)
      return {
        success: false,
        reason,
        error: `Externalize failed: ${err}`,
        aborted: true,
      }
    }

    if (externalPid === null) {
      console.error('[Shutdown] ABORT: Could not externalize session — Electron will NOT quit')
      return {
        success: false,
        reason,
        error: 'Failed to spawn external session',
        aborted: true,
      }
    }

    // ── Phase 2: Final verification RIGHT BEFORE quit ──
    // This 100ms gap is intentional: we verify as close to quit as possible
    // to minimize the window where the external process could die
    console.log(`[Shutdown] Phase 2: Final verification of PID ${externalPid}...`)
    await new Promise(r => setTimeout(r, 100))

    const alive = verifyExternalSession(externalPid)
    if (!alive) {
      console.error(`[Shutdown] ABORT: External PID ${externalPid} is NOT alive — Electron will NOT quit`)
      return {
        success: false,
        reason,
        externalPid,
        error: `External PID ${externalPid} died before shutdown could complete`,
        aborted: true,
      }
    }

    console.log(`[Shutdown] External session verified alive (PID ${externalPid}). Proceeding with Electron quit.`)

    // ── Phase 3: Close terminals and quit ──
    try {
      // Close all embedded terminals (they'll be restored on next boot)
      terminalManager.closeAll()
    } catch (err) {
      console.warn('[Shutdown] Error closing terminals (non-fatal):', err)
    }

    // Schedule quit on next tick to allow response to be sent
    setTimeout(() => {
      console.log(`[Shutdown] Quitting Electron now (reason: ${reason})`)
      app.quit()
    }, 200)

    return {
      success: true,
      reason,
      externalPid,
    }
  }

  // ── Simple shutdown (no externalize) ──
  console.log(`[Shutdown] Simple quit — no externalize (reason: ${reason})`)

  try {
    terminalManager.closeAll()
  } catch (err) {
    console.warn('[Shutdown] Error closing terminals (non-fatal):', err)
  }

  setTimeout(() => {
    console.log(`[Shutdown] Quitting Electron now (reason: ${reason})`)
    app.quit()
  }, 200)

  return {
    success: true,
    reason,
  }
}
