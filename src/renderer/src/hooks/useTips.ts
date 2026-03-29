// ── HAL-O Adaptive Tips Hook ──
// Tracks session count, discovered features, and rotates tips.

import { useState, useEffect, useCallback, useRef } from 'react'
import { TIPS, type Tip } from '../data/tips'

const LS_SESSION_COUNT = 'hal-o-session-count'
const LS_DISCOVERED = 'hal-o-discovered-features'
const LS_DISMISSED = 'hal-o-dismissed-tips'
const LS_TIPS_ENABLED = 'hal-o-tips-enabled'

/** Default rotation interval: 5 minutes */
const ROTATION_MS = 5 * 60 * 1000

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* corrupted, reset */ }
  return new Set()
}

function writeSet(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]))
}

export interface UseTipsReturn {
  /** The current tip to display, or null if nothing to show */
  currentTip: Tip | null
  /** Dismiss the current tip (won't show again) */
  dismissTip: () => void
  /** Whether the tips system is enabled (user toggle) */
  tipsEnabled: boolean
  /** Toggle tips on/off */
  setTipsEnabled: (enabled: boolean) => void
  /** Mark a feature as discovered (suppresses tips for it) */
  discoverFeature: (feature: string) => void
  /** Current session count */
  sessionCount: number
}

export function useTips(): UseTipsReturn {
  // ── All hooks BEFORE any conditional return ──
  const [sessionCount, setSessionCount] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem(LS_SESSION_COUNT) || '0')
    return isNaN(stored) ? 0 : stored
  })
  const [discovered, setDiscovered] = useState<Set<string>>(() => readSet(LS_DISCOVERED))
  const [dismissed, setDismissed] = useState<Set<string>>(() => readSet(LS_DISMISSED))
  const [tipsEnabled, setTipsEnabledState] = useState<boolean>(() => {
    return localStorage.getItem(LS_TIPS_ENABLED) !== 'false'
  })
  const [rotationIndex, setRotationIndex] = useState(0)
  const rotationTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Increment session count once on mount
  useEffect(() => {
    const current = parseInt(localStorage.getItem(LS_SESSION_COUNT) || '0') || 0
    const next = current + 1
    localStorage.setItem(LS_SESSION_COUNT, String(next))
    setSessionCount(next)
  }, [])

  // Rotation timer: advance tip every ROTATION_MS
  useEffect(() => {
    if (!tipsEnabled) return
    rotationTimer.current = setInterval(() => {
      setRotationIndex(i => i + 1)
    }, ROTATION_MS)
    return () => {
      if (rotationTimer.current) clearInterval(rotationTimer.current)
    }
  }, [tipsEnabled])

  // ── Computed: eligible tips ──
  const eligible = TIPS.filter(tip => {
    // Already discovered this feature
    if (discovered.has(tip.feature)) return false
    // User dismissed this specific tip
    if (dismissed.has(tip.id)) return false
    // Session range check
    if (sessionCount < tip.minSessionCount) return false
    if (tip.maxSessionCount > 0 && sessionCount > tip.maxSessionCount) return false
    return true
  }).sort((a, b) => b.priority - a.priority)

  const currentTip = eligible.length > 0
    ? eligible[rotationIndex % eligible.length]
    : null

  // ── Callbacks ──
  const dismissTip = useCallback(() => {
    if (!currentTip) return
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(currentTip.id)
      writeSet(LS_DISMISSED, next)
      return next
    })
    // Advance to next tip immediately
    setRotationIndex(i => i + 1)
  }, [currentTip])

  const setTipsEnabled = useCallback((enabled: boolean) => {
    setTipsEnabledState(enabled)
    localStorage.setItem(LS_TIPS_ENABLED, String(enabled))
  }, [])

  const discoverFeature = useCallback((feature: string) => {
    setDiscovered(prev => {
      if (prev.has(feature)) return prev
      const next = new Set(prev)
      next.add(feature)
      writeSet(LS_DISCOVERED, next)
      return next
    })
  }, [])

  return {
    currentTip: tipsEnabled ? currentTip : null,
    dismissTip,
    tipsEnabled,
    setTipsEnabled,
    discoverFeature,
    sessionCount,
  }
}
