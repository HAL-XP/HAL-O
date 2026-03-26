/**
 * UX17: Keyboard shortcut overlay — subtle HUD on the 3D view.
 * Toggle with ? key. Fades after 5s of no keyboard input.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const SHORTCUTS = [
  { key: '←→', desc: 'Navigate cards' },
  { key: '↑↓', desc: 'Switch rings' },
  { key: 'Enter', desc: 'Resume session' },
  { key: 'Esc', desc: 'Deselect card' },
  { key: '/', desc: 'Focus search' },
  { key: '[ ]', desc: 'Switch sector' },
  { key: 'Ctrl+`', desc: 'Hub ↔ Terminal' },
  { key: 'Ctrl+Space', desc: 'Push to talk' },
  { key: '?', desc: 'Toggle this overlay' },
]

const FADE_TIMEOUT = 5000

export function KeyboardOverlay() {
  const [visible, setVisible] = useState(false)
  const [faded, setFaded] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetFade = useCallback(() => {
    setFaded(false)
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => setFaded(true), FADE_TIMEOUT)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Don't toggle if typing in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        setVisible(v => {
          const next = !v
          if (next) {
            setFaded(false)
            fadeTimer.current = setTimeout(() => setFaded(true), FADE_TIMEOUT)
          }
          return next
        })
      } else if (visible) {
        // Any other key resets the fade timer
        resetFade()
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [visible, resetFade])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9000,
        background: 'rgba(5, 8, 16, 0.85)',
        border: '1px solid rgba(0, 229, 255, 0.2)',
        borderRadius: 6,
        padding: '10px 14px',
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        fontSize: 11,
        color: '#e0e6f0',
        backdropFilter: 'blur(8px)',
        opacity: faded ? 0.15 : 0.9,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
        maxWidth: 220,
      }}
    >
      <div style={{ fontSize: 9, color: '#00e5ff', letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>
        SHORTCUTS
      </div>
      {SHORTCUTS.map(s => (
        <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
          <span style={{ color: '#00e5ff', fontWeight: 700, minWidth: 70 }}>{s.key}</span>
          <span style={{ color: '#5a6a8a', textAlign: 'right' }}>{s.desc}</span>
        </div>
      ))}
    </div>
  )
}
