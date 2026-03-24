import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { connectAudioElement } from '../utils/audioAnalyser'
import { VOICE_PROFILES, DOCK_POSITIONS, DEFAULT_CAMERA, PARTICLE_DENSITY_LABELS, PERSONALITY_PRESETS, type VoiceProfileId, type DockPosition, type CameraSettings, type PersonalitySettings } from '../hooks/useSettings'
import type { DemoSettings } from '../hooks/useDemoSettings'
import { LAYOUTS_3D } from '../layouts3d'
import { THREE_STYLES } from '../data/three-styles'

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
  { id: 'grid-wall', label: 'GRID WALL' },
  { id: 'honeycomb', label: 'HONEYCOMB' },
  { id: 'timeline', label: 'TIMELINE' },
  { id: 'orbit', label: 'ORBIT' },
  { id: 'matrix', label: 'MATRIX' },
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

// ── Preset types ──

const PRESET_KEYS = ['rendererId', 'layoutId', 'threeTheme', 'screenOpacity', 'particleDensity', 'renderQuality', 'hubFontSize', 'termFontSize', 'dockPosition'] as const
type PresetKey = typeof PRESET_KEYS[number]
type PresetValues = { [K in PresetKey]: number | string }

interface SavedPresets {
  [name: string]: PresetValues
}

function loadPresets(): SavedPresets {
  try {
    return JSON.parse(localStorage.getItem('hal-o-presets') || '{}')
  } catch {
    return {}
  }
}

function savePresets(presets: SavedPresets) {
  localStorage.setItem('hal-o-presets', JSON.stringify(presets))
}

interface Props {
  hubFontSize: number
  termFontSize: number
  wizardFontSize: number
  onWizardFontSize: (size: number) => void
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  screenOpacity: number
  rendererId: RendererId
  layoutId: LayoutId
  threeTheme: string
  onHubFontSize: (size: number) => void
  onTermFontSize: (size: number) => void
  onVoiceOut: (enabled: boolean) => void
  onVoiceProfileChange: (id: VoiceProfileId) => void
  onDockPositionChange: (pos: DockPosition) => void
  onScreenOpacityChange: (opacity: number) => void
  particleDensity: number
  onParticleDensityChange: (v: number) => void
  renderQuality: number
  onRenderQualityChange: (v: number) => void
  camera: CameraSettings
  onCameraChange: (cam: CameraSettings) => void
  onCameraReset: () => void
  onRendererChange: (id: RendererId) => void
  onLayoutChange: (id: LayoutId) => void
  onThreeThemeChange: (id: string) => void
  shipVfxEnabled: boolean
  onShipVfxEnabledChange: (enabled: boolean) => void
  voiceReactionIntensity: number
  onVoiceReactionIntensityChange: (v: number) => void
  personality: PersonalitySettings
  onPersonalityChange: (key: keyof PersonalitySettings, value: number) => void
  onPersonalityPreset: (presetName: string) => void
  hiddenPaths?: string[]
  onUnhide?: (path: string) => void
  demo?: DemoSettings
}

// Per-voice audio cache: { profileId -> { text, audioDataUrl } }
const voiceCache = new Map<string, { text: string; audioDataUrl: string }>()

function playOrGenerate(text: string, profileId: string, setPreviewing: (v: string | null) => void) {
  const cached = voiceCache.get(profileId)
  if (cached && cached.text === text) {
    // Play from cache — connect to global analyser so sphere reacts
    setPreviewing(profileId)
    const audio = new Audio(cached.audioDataUrl)
    audio.onended = () => setPreviewing(null)
    audio.onerror = () => setPreviewing(null)
    connectAudioElement(audio)
    audio.play().catch(() => setPreviewing(null))
    return
  }
  // Generate new + cache
  setPreviewing(profileId)
  window.api.voiceSpeak(text, profileId, 'en').then((result) => {
    if (result.success && result.audioDataUrl) {
      voiceCache.set(profileId, { text, audioDataUrl: result.audioDataUrl })
      const audio = new Audio(result.audioDataUrl)
      audio.onended = () => setPreviewing(null)
      audio.onerror = () => setPreviewing(null)
      connectAudioElement(audio)
      audio.play().catch(() => setPreviewing(null))
    } else {
      setPreviewing(null)
    }
  }).catch(() => setPreviewing(null))
}

// ── Collapsible section header ──

interface SectionHeaderProps {
  label: string
  expanded: boolean
  onToggle: () => void
}

function SectionHeader({ label, expanded, onToggle }: SectionHeaderProps) {
  return (
    <button className="hal-settings-section-header" onClick={onToggle}>
      <span className="hal-settings-section-arrow">{expanded ? '▼' : '▶'}</span>
      <span>{label}</span>
    </button>
  )
}

export function SettingsMenu({ hubFontSize, termFontSize, wizardFontSize, onWizardFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, particleDensity, onParticleDensityChange, renderQuality, onRenderQualityChange, camera, rendererId, layoutId, threeTheme, onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, onScreenOpacityChange, onCameraChange, onCameraReset, onRendererChange, onLayoutChange, onThreeThemeChange, shipVfxEnabled, onShipVfxEnabledChange, voiceReactionIntensity, onVoiceReactionIntensityChange, personality, onPersonalityChange, onPersonalityPreset, hiddenPaths = [], onUnhide, demo }: Props) {
  const [open, setOpen] = useState(false)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [cameraSaved, setCameraSaved] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Search ──
  const [search, setSearch] = useState('')
  const searchActive = search.trim().length > 0
  const searchLower = search.toLowerCase()

  // ── Section collapse state — Display + Terminal expanded by default ──
  const [secPresets, setSecPresets] = useState(false)
  const [secDisplay, setSecDisplay] = useState(true)
  const [secTerminal, setSecTerminal] = useState(true)
  const [secFonts, setSecFonts] = useState(true)
  const [secVoice, setSecVoice] = useState(false)
  const [secPersonality, setSecPersonality] = useState(false)
  const [secScene, setSecScene] = useState(false)
  const [secHidden, setSecHidden] = useState(false)
  const [secDemo, setSecDemo] = useState(false)

  // When searching, sections auto-expand; when cleared, collapse state is restored by saved flags
  const isExpanded = (flag: boolean) => searchActive || flag

  // ── Presets ──
  const [presets, setPresets] = useState<SavedPresets>(loadPresets)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)

  const currentSettings: PresetValues = {
    rendererId,
    layoutId,
    threeTheme,
    screenOpacity,
    particleDensity,
    renderQuality,
    hubFontSize,
    termFontSize,
    dockPosition,
  }

  const handleSavePreset = () => {
    const name = presetNameInput.trim()
    if (!name) return
    const updated = { ...presets, [name]: { ...currentSettings } }
    setPresets(updated)
    savePresets(updated)
    setPresetNameInput('')
    setShowNameInput(false)
  }

  const handleLoadPreset = (name: string) => {
    const p = presets[name]
    if (!p) return
    onRendererChange(p.rendererId as RendererId)
    onLayoutChange(p.layoutId as string)
    onThreeThemeChange(p.threeTheme as string)
    onScreenOpacityChange(p.screenOpacity as number)
    onParticleDensityChange(p.particleDensity as number)
    onRenderQualityChange(p.renderQuality as number)
    onHubFontSize(p.hubFontSize as number)
    onTermFontSize(p.termFontSize as number)
    onDockPositionChange(p.dockPosition as DockPosition)
  }

  const handleDeletePreset = (name: string) => {
    const updated = { ...presets }
    delete updated[name]
    setPresets(updated)
    savePresets(updated)
  }

  const previewProfile = useCallback((profileId: string) => {
    if (profileId === 'auto' || previewing) return
    const text = PROFILE_SAMPLE_TEXTS[profileId] || 'Hello, this is a voice test.'
    playOrGenerate(text, profileId, setPreviewing)
  }, [previewing])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  // ── Search match helpers ──
  const match = (label: string) => !searchActive || label.toLowerCase().includes(searchLower)

  // Collect which sections have at least one visible row when searching
  const presetsLabels = ['SAVE PRESET', 'LOAD PRESET']
  const displayLabels = ['RENDERER', 'LAYOUT', '3D STYLE']
  const terminalLabels = ['TERMINAL DOCK']
  const fontsLabels = ['HUB FONT SIZE', 'TERMINAL FONT SIZE', 'WIZARD FONT SIZE']
  const voiceLabels = ['VOICE OUTPUT', 'VOICE PROFILE', 'VOICE REACTION']
  const personalityLabels = ['HUMOR', 'FORMALITY', 'VERBOSITY', 'DRAMATIC', 'PERSONALITY PRESET']
  const sceneLabels = ['SCREENS OPACITY', 'PARTICLE DENSITY', 'RENDER QUALITY', 'SHIP VFX', 'PARTICLE HIDE DIST', 'SAVE CURRENT VIEW', 'RESET VIEW']
  const hiddenLabels = ['HIDDEN PROJECTS']
  const demoLabels = ['ENABLED', 'PROJECT CARDS', 'TERMINAL AREAS', 'MIN TABS', 'MAX TABS', 'VFX SPAWN FREQUENCY', 'DEMO TEXT', 'DEMO VOICE']

  const sectionVisible = (labels: string[]) => !searchActive || labels.some((l) => l.toLowerCase().includes(searchLower))

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

      {open && createPortal(
        <div className="hal-settings-panel" ref={panelRef} style={(() => {
          const rect = ref.current?.getBoundingClientRect()
          if (!rect) return { '--hub-font': `${hubFontSize}px` } as React.CSSProperties
          return { position: 'fixed' as const, top: rect.bottom + 6, right: window.innerWidth - rect.right, '--hub-font': `${hubFontSize}px` } as React.CSSProperties
        })()}>
          <div className="hal-settings-title">SETTINGS</div>

          {/* ── SEARCH BAR ── */}
          <div style={{ marginBottom: 8 }}>
            <input
              type="text"
              className="hal-settings-select"
              placeholder="SEARCH SETTINGS..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '5px 8px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', boxSizing: 'border-box' }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* ── PRESETS section ── */}
          {sectionVisible(presetsLabels) && (
            <>
              <SectionHeader label="PRESETS" expanded={isExpanded(secPresets)} onToggle={() => setSecPresets(!secPresets)} />
              {isExpanded(secPresets) && (
                <div className="hal-settings-section-body">
                  {/* Save preset */}
                  {match('SAVE PRESET') && (
                    <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      {!showNameInput ? (
                        <button
                          className="hal-settings-preview-btn"
                          onClick={() => setShowNameInput(true)}
                          style={{ width: 'auto', padding: '3px 10px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', color: 'var(--primary)', borderColor: 'var(--primary-dim)' }}
                        >
                          + SAVE PRESET
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                          <input
                            type="text"
                            className="hal-settings-select"
                            placeholder="PRESET NAME..."
                            value={presetNameInput}
                            onChange={(e) => setPresetNameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePreset()
                              if (e.key === 'Escape') { setShowNameInput(false); setPresetNameInput('') }
                            }}
                            style={{ flex: 1, padding: '4px 6px', fontSize: 'calc(var(--hub-font, 10px) - 1px)' }}
                            autoFocus
                          />
                          <button
                            className="hal-settings-preview-btn"
                            onClick={handleSavePreset}
                            disabled={!presetNameInput.trim()}
                            style={{ width: 'auto', padding: '3px 8px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', color: '#4ade80', borderColor: '#4ade8055' }}
                          >
                            SAVE
                          </button>
                          <button
                            className="hal-settings-preview-btn"
                            onClick={() => { setShowNameInput(false); setPresetNameInput('') }}
                            style={{ width: 'auto', padding: '3px 8px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', color: 'var(--text-dim)' }}
                          >
                            X
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preset list */}
                  {match('LOAD PRESET') && (
                    <>
                      {Object.keys(presets).length === 0 ? (
                        <div className="hal-settings-row">
                          <span className="hal-settings-label" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>(no presets saved)</span>
                        </div>
                      ) : (
                        Object.keys(presets).map((name) => (
                          <div key={name} className="hal-settings-row" style={{ marginBottom: 4 }}>
                            <span
                              className="hal-settings-label"
                              style={{ flex: 1, cursor: 'pointer', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={`Load preset: ${name}`}
                              onClick={() => handleLoadPreset(name)}
                            >
                              {name}
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button
                                className="hal-settings-preview-btn"
                                onClick={() => handleLoadPreset(name)}
                                style={{ width: 'auto', padding: '2px 8px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', color: 'var(--primary)', borderColor: 'var(--primary-dim)' }}
                                title={`Load "${name}"`}
                              >
                                LOAD
                              </button>
                              <button
                                className="hal-settings-preview-btn"
                                onClick={() => handleDeletePreset(name)}
                                style={{ width: 'auto', padding: '2px 8px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', color: '#f87171', borderColor: '#f8717155' }}
                                title={`Delete "${name}"`}
                              >
                                DEL
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── DISPLAY section ── */}
          {sectionVisible(displayLabels) && (
            <>
              <SectionHeader label="DISPLAY" expanded={isExpanded(secDisplay)} onToggle={() => setSecDisplay(!secDisplay)} />
              {isExpanded(secDisplay) && (
                <div className="hal-settings-section-body">
                  {match('RENDERER') && (
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
                  )}

                  {match('LAYOUT') && (
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
                  )}

                  {(rendererId === 'pbr-holo' || rendererId === 'holographic') && match('3D STYLE') && (
                    <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <span className="hal-settings-label">3D STYLE</span>
                      <select
                        className="hal-settings-select"
                        value={threeTheme}
                        onChange={(e) => onThreeThemeChange(e.target.value)}
                      >
                        {THREE_STYLES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── TERMINAL section ── */}
          {sectionVisible(terminalLabels) && (
            <>
              <SectionHeader label="TERMINAL" expanded={isExpanded(secTerminal)} onToggle={() => setSecTerminal(!secTerminal)} />
              {isExpanded(secTerminal) && (
                <div className="hal-settings-section-body">
                  {match('TERMINAL DOCK') && (
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
                  )}
                </div>
              )}
            </>
          )}

          {/* ── FONTS section ── */}
          {sectionVisible(fontsLabels) && (
            <>
              <SectionHeader label="FONTS" expanded={isExpanded(secFonts)} onToggle={() => setSecFonts(!secFonts)} />
              {isExpanded(secFonts) && (
                <div className="hal-settings-section-body">
                  {match('HUB FONT SIZE') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">HUB FONT SIZE</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min="7" max="18" step="1" value={hubFontSize}
                          onChange={(e) => onHubFontSize(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }} />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 34, textAlign: 'right', flexShrink: 0, fontFamily: 'monospace' }}>{hubFontSize}px</span>
                      </div>
                    </div>
                  )}

                  {match('TERMINAL FONT SIZE') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">TERMINAL FONT SIZE</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min="8" max="24" step="1" value={termFontSize}
                          onChange={(e) => onTermFontSize(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }} />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 34, textAlign: 'right', flexShrink: 0, fontFamily: 'monospace' }}>{termFontSize}px</span>
                      </div>
                    </div>
                  )}

                  {match('WIZARD FONT SIZE') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">WIZARD FONT SIZE</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min="10" max="22" step="1" value={wizardFontSize}
                          onChange={(e) => onWizardFontSize(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }} />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 34, textAlign: 'right', flexShrink: 0, fontFamily: 'monospace' }}>{wizardFontSize}px</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── VOICE section ── */}
          {sectionVisible(voiceLabels) && (
            <>
              <SectionHeader label="VOICE" expanded={isExpanded(secVoice)} onToggle={() => setSecVoice(!secVoice)} />
              {isExpanded(secVoice) && (
                <div className="hal-settings-section-body">
                  {match('VOICE OUTPUT') && (
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
                  )}

                  {match('VOICE PROFILE') && (
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
                  )}

                  {match('VOICE REACTION') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">VOICE REACTION</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.1"
                          value={voiceReactionIntensity}
                          onChange={(e) => onVoiceReactionIntensityChange(parseFloat(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{voiceReactionIntensity.toFixed(1)}x</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── PERSONALITY section ── */}
          {sectionVisible(personalityLabels) && (
            <>
              <SectionHeader label="PERSONALITY" expanded={isExpanded(secPersonality)} onToggle={() => setSecPersonality(!secPersonality)} />
              {isExpanded(secPersonality) && (
                <div className="hal-settings-section-body">
                  {match('HUMOR') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">HUMOR</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range" min="0" max="100" step="1"
                          value={personality.humor}
                          onChange={(e) => onPersonalityChange('humor', parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{personality.humor}%</span>
                      </div>
                    </div>
                  )}

                  {match('FORMALITY') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">FORMALITY</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range" min="0" max="100" step="1"
                          value={personality.formality}
                          onChange={(e) => onPersonalityChange('formality', parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{personality.formality}%</span>
                      </div>
                    </div>
                  )}

                  {match('VERBOSITY') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">VERBOSITY</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range" min="0" max="100" step="1"
                          value={personality.verbosity}
                          onChange={(e) => onPersonalityChange('verbosity', parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{personality.verbosity}%</span>
                      </div>
                    </div>
                  )}

                  {match('DRAMATIC') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">DRAMATIC</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range" min="0" max="100" step="1"
                          value={personality.dramatic}
                          onChange={(e) => onPersonalityChange('dramatic', parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{personality.dramatic}%</span>
                      </div>
                    </div>
                  )}

                  {match('PERSONALITY PRESET') && (
                    <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <span className="hal-settings-label" style={{ fontSize: 'calc(var(--hub-font, 10px) - 2px)' }}>PRESETS</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {PERSONALITY_PRESETS.map((preset) => {
                          const isActive = personality.humor === preset.values.humor &&
                            personality.formality === preset.values.formality &&
                            personality.verbosity === preset.values.verbosity &&
                            personality.dramatic === preset.values.dramatic
                          return (
                            <button
                              key={preset.name}
                              className="hal-settings-preview-btn"
                              onClick={() => onPersonalityPreset(preset.name)}
                              style={{
                                width: 'auto',
                                padding: '2px 8px',
                                fontSize: 'calc(var(--hub-font, 10px) - 2px)',
                                letterSpacing: '1px',
                                color: isActive ? 'var(--primary)' : 'var(--text-dim)',
                                borderColor: isActive ? 'var(--primary)' : undefined,
                                background: isActive ? 'rgba(132, 204, 22, 0.08)' : undefined,
                              }}
                            >
                              {preset.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── 3D SCENE section ── */}
          {sectionVisible(sceneLabels) && (
            <>
              <SectionHeader label="3D SCENE" expanded={isExpanded(secScene)} onToggle={() => setSecScene(!secScene)} />
              {isExpanded(secScene) && (
                <div className="hal-settings-section-body">
                  {match('SCREENS OPACITY') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">SCREENS OPACITY</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          value={screenOpacity}
                          onChange={(e) => onScreenOpacityChange(parseFloat(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 36, textAlign: 'right', flexShrink: 0 }}>{Math.round(screenOpacity * 100)}%</span>
                      </div>
                    </div>
                  )}

                  {match('PARTICLE DENSITY') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">PARTICLE DENSITY</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min="0"
                          max="15"
                          step="1"
                          value={particleDensity}
                          onChange={(e) => onParticleDensityChange(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 70, textAlign: 'right', flexShrink: 0, fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>{PARTICLE_DENSITY_LABELS[particleDensity]}</span>
                      </div>
                    </div>
                  )}

                  {match('RENDER QUALITY') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">RENDER QUALITY</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min="0.5"
                          max={window.devicePixelRatio}
                          step="0.25"
                          value={renderQuality}
                          onChange={(e) => onRenderQualityChange(parseFloat(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 52, textAlign: 'right', flexShrink: 0 }}>
                          {renderQuality >= window.devicePixelRatio ? 'NATIVE' : `${renderQuality.toFixed(2).replace(/\.?0+$/, '')}x`}
                        </span>
                      </div>
                    </div>
                  )}

                  {match('SHIP VFX') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">SHIP VFX</span>
                      <div className="hal-settings-control">
                        <button
                          onClick={() => onShipVfxEnabledChange(!shipVfxEnabled)}
                          style={{
                            width: 'auto',
                            padding: '2px 8px',
                            color: shipVfxEnabled ? 'var(--primary)' : 'var(--text-dim)',
                            borderColor: shipVfxEnabled ? 'var(--primary-dim)' : undefined,
                          }}
                        >
                          {shipVfxEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  )}

                  {match('PARTICLE HIDE DIST') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">PARTICLE HIDE DIST</span>
                      <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min="1" max="15" step="0.5" value={camera.particleHideDist}
                          onChange={(e) => onCameraChange({ ...camera, particleHideDist: parseFloat(e.target.value) })}
                          style={{ flex: 1, accentColor: 'var(--primary)' }} />
                        <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: 36, textAlign: 'right', flexShrink: 0 }}>{camera.particleHideDist}u</span>
                      </div>
                    </div>
                  )}

                  {(match('SAVE CURRENT VIEW') || match('RESET VIEW')) && (
                    <div className="hal-settings-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      {match('SAVE CURRENT VIEW') && (
                        <button
                          className="hal-settings-preview-btn"
                          onClick={() => {
                            onCameraChange(camera)
                            setCameraSaved(true)
                            setTimeout(() => setCameraSaved(false), 1200)
                          }}
                          title="Save current orbit position to settings"
                          style={{
                            padding: '3px 10px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', width: 'auto',
                            color: cameraSaved ? '#0f1117' : '#4ade80',
                            borderColor: cameraSaved ? '#4ade80' : '#4ade8055',
                            background: cameraSaved ? '#4ade80' : 'transparent',
                            transition: 'all 0.2s',
                          }}
                        >
                          {cameraSaved ? 'SAVED' : 'SAVE CURRENT VIEW'}
                        </button>
                      )}
                      {match('RESET VIEW') && (
                        <button className="hal-settings-preview-btn" onClick={onCameraReset} title="Reset to default view"
                          style={{ padding: '3px 10px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', width: 'auto', color: 'var(--text-dim)', borderColor: 'var(--border-dim, #333)' }}>RESET VIEW</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── HIDDEN PROJECTS section ── */}
          {onUnhide && sectionVisible(hiddenLabels) && (
            <>
              <SectionHeader label="HIDDEN PROJECTS" expanded={isExpanded(secHidden)} onToggle={() => setSecHidden(!secHidden)} />
              {isExpanded(secHidden) && (
                <div className="hal-settings-section-body">
                  {hiddenPaths.length === 0 ? (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label" style={{ color: 'var(--text-dim)' }}>(none)</span>
                    </div>
                  ) : (
                    <div className="hidden-projects-list">
                      {hiddenPaths.map((p) => {
                        const name = p.split(/[/\\]/).pop() || p
                        return (
                          <div key={p} className="hidden-project-item">
                            <span className="hidden-project-name" title={p}>{name}</span>
                            <button
                              className="hal-settings-preview-btn"
                              onClick={() => onUnhide(p)}
                              style={{ padding: '2px 8px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', width: 'auto', color: '#4ade80', borderColor: '#4ade8055' }}
                            >
                              RESTORE
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── DEMO MODE section (collapsed by default, at the bottom) ── */}
          {demo && sectionVisible(demoLabels) && (
            <>
              <SectionHeader label="DEMO MODE" expanded={isExpanded(secDemo)} onToggle={() => setSecDemo(!secDemo)} />
              {isExpanded(secDemo) && (
                <div className="hal-settings-section-body">
                  {match('ENABLED') && (
                    <div className="hal-settings-row">
                      <span className="hal-settings-label">ENABLED</span>
                      <div className="hal-settings-control">
                        <button
                          onClick={() => demo.setEnabled(!demo.enabled)}
                          style={{
                            width: 'auto',
                            padding: '2px 8px',
                            color: demo.enabled ? '#22d3ee' : 'var(--text-dim)',
                            borderColor: demo.enabled ? '#22d3ee55' : undefined,
                          }}
                        >
                          {demo.enabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  )}

                  {demo.enabled && (
                    <>
                      {match('PROJECT CARDS') && (
                        <div className="hal-settings-row">
                          <span className="hal-settings-label">PROJECT CARDS</span>
                          <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="range"
                              min="5"
                              max="100"
                              step="1"
                              value={demo.cardCount}
                              onChange={(e) => demo.setCardCount(parseInt(e.target.value))}
                              style={{ flex: 1, accentColor: '#22d3ee' }}
                            />
                            <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', minWidth: 20 }}>{demo.cardCount}</span>
                          </div>
                        </div>
                      )}

                      {match('TERMINAL AREAS') && (
                        <div className="hal-settings-row">
                          <span className="hal-settings-label">TERMINAL AREAS</span>
                          <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="range"
                              min="1"
                              max="4"
                              step="1"
                              value={demo.terminalCount}
                              onChange={(e) => demo.setTerminalCount(parseInt(e.target.value))}
                              style={{ flex: 1, accentColor: '#22d3ee' }}
                            />
                            <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', minWidth: 14 }}>{demo.terminalCount}</span>
                          </div>
                        </div>
                      )}

                      {match('MIN TABS') && (
                        <div className="hal-settings-row">
                          <span className="hal-settings-label">MIN TABS</span>
                          <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              step="1"
                              value={demo.tabsMin}
                              onChange={(e) => {
                                const v = parseInt(e.target.value)
                                demo.setTabsMin(v)
                                if (v > demo.tabsMax) demo.setTabsMax(v)
                              }}
                              style={{ flex: 1, accentColor: '#22d3ee' }}
                            />
                            <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', minWidth: 14 }}>{demo.tabsMin}</span>
                          </div>
                        </div>
                      )}

                      {match('MAX TABS') && (
                        <div className="hal-settings-row">
                          <span className="hal-settings-label">MAX TABS</span>
                          <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              step="1"
                              value={demo.tabsMax}
                              onChange={(e) => {
                                const v = parseInt(e.target.value)
                                demo.setTabsMax(v)
                                if (v < demo.tabsMin) demo.setTabsMin(v)
                              }}
                              style={{ flex: 1, accentColor: '#22d3ee' }}
                            />
                            <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', minWidth: 14 }}>{demo.tabsMax}</span>
                          </div>
                        </div>
                      )}

                      {match('VFX SPAWN FREQUENCY') && (
                        <div className="hal-settings-row">
                          <span className="hal-settings-label">VFX SPAWN FREQUENCY</span>
                          <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="range"
                              min="0"
                              max="30"
                              step="1"
                              value={demo.vfxFrequency}
                              onChange={(e) => demo.setVfxFrequency(parseInt(e.target.value))}
                              style={{ flex: 1, accentColor: '#22d3ee' }}
                            />
                            <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', minWidth: 30 }}>{demo.vfxFrequency === 0 ? 'OFF' : `${demo.vfxFrequency}s`}</span>
                          </div>
                        </div>
                      )}

                      {match('DEMO TEXT') && (
                        <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <span className="hal-settings-label">DEMO TEXT</span>
                          <input
                            type="text"
                            className="hal-settings-select"
                            style={{ width: '100%', padding: '4px 6px', fontSize: 'calc(var(--hub-font, 10px) - 1px)' }}
                            value={demo.demoText}
                            onChange={(e) => demo.setDemoText(e.target.value)}
                          />
                        </div>
                      )}

                      {match('DEMO VOICE') && (
                        <div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <span className="hal-settings-label">DEMO VOICE</span>
                          <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                            <select
                              className="hal-settings-select"
                              style={{ flex: 1 }}
                              value={demo.demoVoice}
                              onChange={(e) => demo.setDemoVoice(e.target.value as VoiceProfileId)}
                            >
                              {VOICE_PROFILES.filter((p) => p.id !== 'auto').map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </select>
                            <button
                              className="hal-settings-preview-btn"
                              onClick={() => {
                                if (previewing) return
                                const text = demo.demoText || 'Hello, this is a demo voice test.'
                                playOrGenerate(text, demo.demoVoice, setPreviewing)
                              }}
                              disabled={!!previewing}
                              title={previewing ? `Playing...` : 'Play Demo Voice'}
                            >
                              {previewing ? '...' : '\u25B6'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
