// ── HAL-O Adaptive Tip Bar ──
// Subtle, non-intrusive tip bar at the bottom of the hub.
// Fades in/out with CSS transitions. Respects user toggle.

import { useEffect, useState } from 'react'
import type { Tip } from '../data/tips'

interface Props {
  tip: Tip | null
  onDismiss: () => void
}

export function TipBar({ tip, onDismiss }: Props) {
  // Track visibility for fade transition
  const [visible, setVisible] = useState(false)
  const [displayedTip, setDisplayedTip] = useState<Tip | null>(null)

  useEffect(() => {
    if (tip) {
      setDisplayedTip(tip)
      // Small delay so the element mounts before opacity transitions
      const t = setTimeout(() => setVisible(true), 50)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
      // Keep the old tip rendered during fade-out, then clear
      const t = setTimeout(() => setDisplayedTip(null), 400)
      return () => clearTimeout(t)
    }
  }, [tip])

  if (!displayedTip) return null

  return (
    <div className={`hal-tip-bar${visible ? ' hal-tip-bar--visible' : ''}`}>
      <span className="hal-tip-bar__icon">&#x1F4A1;</span>
      <span className="hal-tip-bar__label">DID YOU KNOW?</span>
      <span className="hal-tip-bar__text">{displayedTip.text}</span>
      <button
        className="hal-tip-bar__dismiss"
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        title="Dismiss tip"
        aria-label="Dismiss tip"
      >
        &#x2715;
      </button>
    </div>
  )
}
