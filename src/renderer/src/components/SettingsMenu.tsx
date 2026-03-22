import { useState, useRef, useEffect } from 'react'

export const LAYOUTS = [
  { id: 'dual-arc', label: 'DUAL ARC' },
  { id: 'dual-arc-3d', label: 'DUAL ARC 3D' },
  { id: 'jarvis-radial', label: 'JARVIS RADIAL' },
  { id: 'jarvis-panels', label: 'JARVIS PANELS' },
  { id: 'holo-stack', label: 'HOLO STACK' },
  { id: 'command-grid', label: 'COMMAND GRID' },
  { id: 'data-hack', label: 'DATA HACK' },
  { id: 'orbital', label: 'ORBITAL' },
  { id: 'hexagonal', label: 'HEXAGONAL' },
  { id: 'cinematic', label: 'CINEMATIC' },
] as const

export type LayoutId = typeof LAYOUTS[number]['id']

interface Props {
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  layoutId: LayoutId
  onHubFontSize: (size: number) => void
  onTermFontSize: (size: number) => void
  onVoiceOut: (enabled: boolean) => void
  onLayoutChange: (id: LayoutId) => void
}

export function SettingsMenu({ hubFontSize, termFontSize, voiceOut, layoutId, onHubFontSize, onTermFontSize, onVoiceOut, onLayoutChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="hal-settings-btn"
        onClick={() => setOpen(!open)}
        title="Settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="hal-settings-panel">
          <div className="hal-settings-title">SETTINGS</div>

          <div className="hal-settings-row">
            <span className="hal-settings-label">HUB FONT SIZE</span>
            <div className="hal-settings-control">
              <button onClick={() => onHubFontSize(Math.max(7, hubFontSize - 1))}>-</button>
              <span>{hubFontSize}px</span>
              <button onClick={() => onHubFontSize(Math.min(18, hubFontSize + 1))}>+</button>
            </div>
          </div>

          <div className="hal-settings-row">
            <span className="hal-settings-label">TERMINAL FONT SIZE</span>
            <div className="hal-settings-control">
              <button onClick={() => onTermFontSize(Math.max(8, termFontSize - 1))}>-</button>
              <span>{termFontSize}px</span>
              <button onClick={() => onTermFontSize(Math.min(24, termFontSize + 1))}>+</button>
            </div>
          </div>

          <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span className="hal-settings-label">LAYOUT</span>
            <select
              className="hal-settings-select"
              value={layoutId}
              onChange={(e) => onLayoutChange(e.target.value as LayoutId)}
            >
              {LAYOUTS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>

          <div className="hal-settings-row">
            <span className="hal-settings-label">VOICE OUTPUT</span>
            <div className="hal-settings-control">
              <button
                onClick={() => onVoiceOut(!voiceOut)}
                style={{
                  width: 'auto',
                  padding: '2px 8px',
                  color: voiceOut ? 'var(--primary)' : 'var(--text-dim)',
                  borderColor: voiceOut ? 'var(--primary-dim)' : undefined,
                }}
              >
                {voiceOut ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
