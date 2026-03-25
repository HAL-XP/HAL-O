/**
 * UX16: Focus Zone hook — manages 'hub' | 'terminal' focus zones.
 *
 * Provides:
 * - focusZone state with localStorage persistence
 * - setFocusZone to switch zones programmatically
 * - CTRL+` global keyboard listener for frame switching
 * - Click-based zone detection (clicking hub area → 'hub', terminal → 'terminal')
 */
import { useState, useEffect, useCallback, useRef } from 'react'

export type FocusZone = 'hub' | 'terminal'

const STORAGE_KEY = 'hal-o-focus-zone'

function loadFocusZone(): FocusZone {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'hub' || v === 'terminal') return v
  } catch { /* */ }
  return 'hub'
}

export function useFocusZone(hasTerminals: boolean) {
  const [focusZone, setFocusZoneRaw] = useState<FocusZone>(loadFocusZone)
  const focusZoneRef = useRef(focusZone)
  focusZoneRef.current = focusZone

  const setFocusZone = useCallback((zone: FocusZone) => {
    setFocusZoneRaw(zone)
    try { localStorage.setItem(STORAGE_KEY, zone) } catch { /* */ }
  }, [])

  // If there are no terminals, force hub mode
  useEffect(() => {
    if (!hasTerminals && focusZoneRef.current === 'terminal') {
      setFocusZone('hub')
    }
  }, [hasTerminals, setFocusZone])

  // CTRL+` global listener — toggles between hub and terminal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        e.stopPropagation()
        const current = focusZoneRef.current
        if (current === 'hub' && hasTerminals) {
          setFocusZone('terminal')
        } else {
          setFocusZone('hub')
        }
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [hasTerminals, setFocusZone])

  return { focusZone, setFocusZone }
}
