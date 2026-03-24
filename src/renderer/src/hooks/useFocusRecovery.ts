// ── B29: Focus recovery guard ──
// After alt-tab back, multiple subsystems (polling, frameloop, IPC) all fire simultaneously,
// causing 1-2s of sluggishness. This module provides:
// 1. A shared "recovering" flag that's true for RECOVERY_DURATION_MS after focus regain
// 2. A staggered-resume helper that delays polling restart after visibility change

const RECOVERY_DURATION_MS = 1500

// ── Shared singleton state (module-scoped, no React re-renders) ──
let _recovering = false
let _recoverTimer: ReturnType<typeof setTimeout> | null = null
let _focusTimestamp = 0
const _listeners = new Set<(recovering: boolean) => void>()

/** Returns true while the app is in the focus-recovery window (first 1.5s after un-hide) */
export function isFocusRecovering(): boolean {
  return _recovering
}

/** Timestamp of the last focus/visibility recovery event */
export function lastFocusTimestamp(): number {
  return _focusTimestamp
}

function setRecovering(value: boolean): void {
  if (_recovering === value) return
  _recovering = value
  for (const listener of _listeners) listener(value)
}

/** Subscribe to recovery state changes (used by useFrame burst invalidator) */
export function onRecoveryChange(listener: (recovering: boolean) => void): () => void {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

// ── Visibility/focus listeners (install once, globally) ──
function handleFocusGain(): void {
  _focusTimestamp = Date.now()
  setRecovering(true)
  if (_recoverTimer) clearTimeout(_recoverTimer)
  _recoverTimer = setTimeout(() => {
    setRecovering(false)
    _recoverTimer = null
  }, RECOVERY_DURATION_MS)
}

function handleFocusLoss(): void {
  if (_recoverTimer) { clearTimeout(_recoverTimer); _recoverTimer = null }
  setRecovering(false)
}

// Auto-install on module load (renderer process only)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handleFocusLoss(); else handleFocusGain()
  })
  // Also listen to Electron's focus change if available
  if ((window as any).api?.onWindowFocusChange) {
    (window as any).api.onWindowFocusChange((focused: boolean) => {
      if (focused) handleFocusGain(); else handleFocusLoss()
    })
  }
}

/**
 * Helper for polling effects: wraps a poll function so that the FIRST poll
 * after a visibility change is delayed by `delayMs` (default 2000ms).
 * During the delay, subsequent interval ticks are also skipped.
 *
 * Returns { poll, cleanup } — call cleanup() in useEffect's return to remove
 * the visibilitychange listener and avoid leaks on effect re-runs.
 *
 * Usage in useEffect:
 *   const { poll, cleanup } = createStaggeredPoll(actualPoll, 2000)
 *   poll() // initial check (runs immediately if no recovery)
 *   const interval = setInterval(poll, 10_000)
 *   return () => { clearInterval(interval); cleanup() }
 */
export function createStaggeredPoll(
  pollFn: () => void,
  delayMs: number = 2000
): { poll: () => void; cleanup: () => void } {
  let resumeAfter = 0

  const onVisible = () => {
    if (!document.hidden) {
      resumeAfter = Date.now() + delayMs
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  const poll = () => {
    // Always skip when hidden
    if (document.hidden) return
    // Skip during the stagger window after focus recovery
    if (Date.now() < resumeAfter) return
    pollFn()
  }

  const cleanup = () => {
    document.removeEventListener('visibilitychange', onVisible)
  }

  return { poll, cleanup }
}
