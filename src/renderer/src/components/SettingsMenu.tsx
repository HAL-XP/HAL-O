import { useState, useRef, useEffect, useCallback } from 'react'
import { VOICE_PROFILES, DOCK_POSITIONS, type VoiceProfileId, type DockPosition } from '../hooks/useSettings'
import { LAYOUTS_3D } from '../layouts3d'

export const RENDERERS = [
  { id: 'classic', label: 'CLASSIC' },
  { id: 'holographic', label: 'HOLOGRAPHIC' },
  { id: 'pbr-holo', label: 'PBR HOLOGRAPHIC' },
] as const

export type RendererId = typeof RENDERERS[number]['id']

export const LAYOUTS_CLASSIC = [
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

// Keep old export for backward compat
export const LAYOUTS = LAYOUTS_CLASSIC

export type LayoutId = string

const RENDERER_LAYOUTS: Record<string, readonly { id: string; label: string }[]> = {
  'classic': LAYOUTS_CLASSIC,
  'holographic': LAYOUTS_3D,
  'pbr-holo': LAYOUTS_3D,
}

const PROFILE_SAMPLE_TEXTS: Record<string, string> = {
  buddy: 'Hey there, just checking in. Everything looks good.',
  orc: 'Work work! Me ready for battle, Warchief!',
  narrator: 'In a world of code, one system stands above the rest.',
  soft: 'Take your time. Everything is going to be just fine.',
  asmr: 'Shh, everything is quiet and peaceful right now.',
  movie_trailer: 'This summer, one developer will change everything.',
  gollum: 'My precious code, we must protect it!',
  pirate: 'Arrr, the deployment be complete, captain!',
  wizard: 'Heed my words carefully, young developer.',
  drill_sergeant: 'Drop and give me twenty test cases, NOW!',
  glados: 'Oh, you broke the tests again. How surprising.',
  news_anchor: 'Breaking news: all systems are operational.',
  sports_commentator: 'And the build succeeds! What a play!',
  surfer: 'Dude, the vibes are totally chill right now.',
  santa: 'Ho ho ho! Checking the naughty and nice list.',
  irish: 'Ah sure, it will be grand, no worries at all.',
  australian: 'No worries mate, she will be right.',
  butler: 'Very good, sir. The deployment is ready.',
  russian: 'System is secure. No unauthorized access detected.',
  italian_chef: 'Bellissimo! This code is magnifico!',
}

interface Props {
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  rendererId: RendererId
  layoutId: LayoutId
  onHubFontSize: (size: number) => void
  onTermFontSize: (size: number) => void
  onVoiceOut: (enabled: boolean) => void
  onVoiceProfileChange: (id: VoiceProfileId) => void
  onDockPositionChange: (pos: DockPosition) => void
  onRendererChange: (id: RendererId) => void
  onLayoutChange: (id: LayoutId) => void
}

export function SettingsMenu({ hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, rendererId, layoutId, onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, onRendererChange, onLayoutChange }: Props) {
  const [open, setOpen] = useState(false)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const previewProfile = useCallback((profileId: string) => {
    if (profileId === 'auto' || previewing) return
    setPreviewing(profileId)
    const text = PROFILE_SAMPLE_TEXTS[profileId] || 'Hello, this is a voice test.'
    window.api.voiceSpeak(text, profileId, 'en').then((result) => {
      if (result.success && result.audioPath) {
        const audio = new Audio(`file://${result.audioPath}`)
        audio.onended = () => setPreviewing(null)
        audio.onerror = () => setPreviewing(null)
        audio.play().catch(() => setPreviewing(null))
      } else {
        setPreviewing(null)
      }
    }).catch(() => setPreviewing(null))
  }, [previewing])

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
            <span className="hal-settings-label">RENDERER</span>
            <select
              className="hal-settings-select"
              value={rendererId}
              onChange={(e) => {
                const newRenderer = e.target.value as RendererId
                onRendererChange(newRenderer)
                // Auto-switch to first valid layout if current one doesn't exist in new renderer
                const validLayouts = RENDERER_LAYOUTS[newRenderer] || LAYOUTS_CLASSIC
                if (!validLayouts.some((l) => l.id === layoutId)) {
                  onLayoutChange(validLayouts[0].id as LayoutId)
                }
              }}
            >
              {RENDERERS.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span className="hal-settings-label">LAYOUT</span>
            <select
              className="hal-settings-select"
              value={layoutId}
              onChange={(e) => onLayoutChange(e.target.value as LayoutId)}
            >
              {(RENDERER_LAYOUTS[rendererId] || LAYOUTS_CLASSIC).map((l) => (
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

          <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span className="hal-settings-label">VOICE PROFILE</span>
            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
              <select
                className="hal-settings-select"
                style={{ flex: 1 }}
                value={voiceProfile}
                onChange={(e) => onVoiceProfileChange(e.target.value as VoiceProfileId)}
              >
                {VOICE_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <button
                className="hal-settings-preview-btn"
                onClick={() => previewProfile(voiceProfile === 'auto' ? 'narrator' : voiceProfile)}
                disabled={!!previewing}
                title={previewing ? `Playing ${previewing}...` : 'Preview voice'}
              >
                {previewing ? '...' : '\u25B6'}
              </button>
            </div>
          </div>

          <div className="hal-settings-row">
            <span className="hal-settings-label">TERMINAL DOCK</span>
            <div className="hal-settings-control">
              <select
                className="hal-settings-select"
                value={dockPosition}
                onChange={(e) => onDockPositionChange(e.target.value as DockPosition)}
              >
                {DOCK_POSITIONS.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
