import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { connectAudioElement } from '../utils/audioAnalyser'
import { VOICE_PROFILES, DOCK_POSITIONS, PARTICLE_DENSITY_LABELS, PERSONALITY_PRESETS, IDE_OPTIONS, SPHERE_STYLES, TERMINAL_MODEL_OPTIONS, TOKEN_BUDGET_OPTIONS, type VoiceProfileId, type DockPosition, type CameraSettings, type PersonalitySettings, type IdeOptionId, type SphereStyleId, type TerminalModelId, type TokenBudgetId, type SettingsState } from '../hooks/useSettings'
import type { DemoSettings } from '../hooks/useDemoSettings'
import { LAYOUTS_3D } from '../layouts3d'
import { THREE_STYLES } from '../data/three-styles'

// ── Exported constants (used by other components) ──

export const RENDERERS = [
  { id: 'classic', label: 'CLASSIC' },
  { id: 'holographic', label: 'HOLOGRAPHIC' },
  { id: 'pbr-holo', label: 'PBR HOLOGRAPHIC' },
] as const
export type RendererId = typeof RENDERERS[number]['id']

export const LAYOUTS_CLASSIC = [
  { id: 'dual-arc', label: 'DUAL ARC' }, { id: 'dual-arc-3d', label: 'DUAL ARC 3D' },
  { id: 'jarvis-radial', label: 'JARVIS RADIAL' }, { id: 'jarvis-panels', label: 'JARVIS PANELS' },
  { id: 'holo-stack', label: 'HOLO STACK' }, { id: 'command-grid', label: 'COMMAND GRID' },
  { id: 'data-hack', label: 'DATA HACK' }, { id: 'orbital', label: 'ORBITAL' },
  { id: 'hexagonal', label: 'HEXAGONAL' }, { id: 'cinematic', label: 'CINEMATIC' },
  { id: 'grid-wall', label: 'GRID WALL' }, { id: 'honeycomb', label: 'HONEYCOMB' },
  { id: 'timeline', label: 'TIMELINE' }, { id: 'orbit', label: 'ORBIT' },
  { id: 'matrix', label: 'MATRIX' },
] as const
export const LAYOUTS = LAYOUTS_CLASSIC
export type LayoutId = string

const RENDERER_LAYOUTS: Record<string, readonly { id: string; label: string }[]> = {
  'classic': LAYOUTS_CLASSIC, 'holographic': LAYOUTS_3D, 'pbr-holo': LAYOUTS_3D,
}

// ── Voice preview helpers ──

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

const voiceCache = new Map<string, { text: string; audioDataUrl: string }>()

function playOrGenerate(text: string, profileId: string, setPreviewing: (v: string | null) => void) {
  const cached = voiceCache.get(profileId)
  if (cached && cached.text === text) {
    setPreviewing(profileId)
    const a = new Audio(cached.audioDataUrl)
    a.onended = () => setPreviewing(null); a.onerror = () => setPreviewing(null)
    connectAudioElement(a); a.play().catch(() => setPreviewing(null)); return
  }
  setPreviewing(profileId)
  window.api.voiceSpeak(text, profileId, 'en').then((r) => {
    if (r.success && r.audioDataUrl) {
      voiceCache.set(profileId, { text, audioDataUrl: r.audioDataUrl })
      const a = new Audio(r.audioDataUrl)
      a.onended = () => setPreviewing(null); a.onerror = () => setPreviewing(null)
      connectAudioElement(a); a.play().catch(() => setPreviewing(null))
    } else { setPreviewing(null) }
  }).catch(() => setPreviewing(null))
}

// ── Presets persistence ──

const PRESET_KEYS = ['rendererId', 'layoutId', 'threeTheme', 'screenOpacity', 'particleDensity', 'renderQuality', 'hubFontSize', 'termFontSize', 'dockPosition'] as const
type PresetKey = typeof PRESET_KEYS[number]
type PresetValues = { [K in PresetKey]: number | string }
interface SavedPresets { [name: string]: PresetValues }
function loadPresets(): SavedPresets { try { return JSON.parse(localStorage.getItem('hal-o-presets') || '{}') } catch { return {} } }
function savePresetsStorage(p: SavedPresets) { localStorage.setItem('hal-o-presets', JSON.stringify(p)) }

// ── Tab definitions ──

type TabId = 'display' | 'graphics' | 'scene' | 'terminal' | 'voice-ai' | 'presets' | 'system'

interface TabDef {
  id: TabId
  label: string
  icon: string
}

const TABS: TabDef[] = [
  { id: 'display',   label: 'DISPLAY',    icon: 'monitor' },
  { id: 'graphics',  label: 'GRAPHICS',   icon: 'palette' },
  { id: 'scene',     label: 'SCENE',      icon: 'camera' },
  { id: 'terminal',  label: 'TERMINAL',   icon: 'terminal' },
  { id: 'voice-ai',  label: 'VOICE & AI', icon: 'mic' },
  { id: 'presets',   label: 'PRESETS',     icon: 'save' },
  { id: 'system',    label: 'SYSTEM',     icon: 'gear' },
]

// SVG icon components for tabs
function TabIcon({ type, size = 16 }: { type: string; size?: number }) {
  const s = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }
  switch (type) {
    case 'monitor':
      return <svg {...s} viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
    case 'palette':
      return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="8" r="1.5" fill="currentColor" /><circle cx="8" cy="12" r="1.5" fill="currentColor" /><circle cx="16" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="16" r="1.5" fill="currentColor" /></svg>
    case 'camera':
      return <svg {...s} viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
    case 'terminal':
      return <svg {...s} viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
    case 'mic':
      return <svg {...s} viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
    case 'save':
      return <svg {...s} viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
    case 'gear':
      return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    default:
      return null
  }
}

// ── Reusable primitives ──

function Toggle({ value, onChange, color: c }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  const clr = c || 'var(--primary)'
  return (<button className="hal-so-toggle" onClick={() => onChange(!value)} style={{
    background: value ? clr + '18' : 'rgba(255,255,255,0.03)',
    borderColor: value ? (c ? c + '55' : 'var(--primary-dim)') : 'rgba(255,255,255,0.12)',
    color: value ? clr : 'var(--text-dim)',
  }}>{value ? 'ON' : 'OFF'}</button>)
}

function Slider({ label, min, max, step, value, onChange, fmt, w = 48, accent }: {
  label: string; min: number; max: number; step: number; value: number
  onChange: (v: number) => void; fmt: (v: number) => string; w?: number; accent?: string
}) {
  return (<div className="hal-so-row">
    <span className="hal-so-label">{label}</span>
    <div className="hal-so-slider-wrap">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: accent || 'var(--primary)' }} />
      <span className="hal-so-slider-val" style={{ width: w }}>{fmt(value)}</span>
    </div>
  </div>)
}

function SelectRow({ label, value, onChange, options, fullWidth }: {
  label: string; value: string; onChange: (v: string) => void
  options: readonly { id: string; label: string }[]; fullWidth?: boolean
}) {
  return (<div className={fullWidth ? 'hal-so-row hal-so-row-col' : 'hal-so-row'}>
    <span className="hal-so-label">{label}</span>
    <select className="hal-so-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  </div>)
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="hal-so-section-title">{children}</div>
}

function Divider() {
  return <hr className="hal-so-divider" />
}

// ── Props -- minimal external interface ──

interface Props {
  settings: SettingsState
  wizardFontSize: number
  onWizardFontSize: (s: number) => void
  hiddenPaths?: string[]
  onUnhide?: (p: string) => void
  demo?: DemoSettings
  dockMode?: boolean
  onDockModeChange?: (e: boolean) => void
  onRedetectGpu?: () => void
}

export function SettingsMenu({
  settings,
  wizardFontSize, onWizardFontSize,
  hiddenPaths = [], onUnhide,
  demo,
  dockMode = false, onDockModeChange,
  onRedetectGpu,
}: Props) {
  // ── Destructure settings from parent (shared state) ──
  const {
    hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity,
    camera, particleDensity, renderQuality, rendererId, layoutId, threeTheme,
    shipVfxEnabled, sphereStyle, voiceReactionIntensity, personality,
    defaultIde, defaultTerminalModel, introAnimation, activityFeedback,
    bloomEnabled, chromaticAberrationEnabled, floorLinesEnabled, groupTrailsEnabled,
    autoRotateEnabled, autoRotateSpeed,
    updateHubFont, updateTermFont, updateVoiceOut, updateVoiceProfile,
    updateDockPosition, updateScreenOpacity, updateCamera, resetCamera,
    updateParticleDensity, updateRenderQuality, updateRenderer, updateLayout,
    updateThreeTheme, updateShipVfxEnabled, updateSphereStyle,
    updateVoiceReactionIntensity, updatePersonality, applyPersonalityPreset,
    updateDefaultIde, updateDefaultTerminalModel, updateIntroAnimation,
    updateActivityFeedback, updateBloomEnabled, updateChromaticAberrationEnabled,
    updateFloorLinesEnabled, updateGroupTrailsEnabled,
    updateAutoRotateEnabled, updateAutoRotateSpeed,
  } = settings

  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('display')
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [cameraSaved, setCameraSaved] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ── Open/close listeners ──
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('hal-open-settings', handler)
    return () => window.removeEventListener('hal-open-settings', handler)
  }, [])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // ── Presets state ──
  const [presets, setPresets] = useState<SavedPresets>(loadPresets)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const curSettings: PresetValues = { rendererId, layoutId, threeTheme, screenOpacity, particleDensity, renderQuality, hubFontSize, termFontSize, dockPosition }

  const handleSavePreset = () => { const n = presetNameInput.trim(); if (!n) return; const u = { ...presets, [n]: { ...curSettings } }; setPresets(u); savePresetsStorage(u); setPresetNameInput(''); setShowNameInput(false) }
  const handleLoadPreset = (n: string) => {
    const p = presets[n]; if (!p) return
    updateRenderer(p.rendererId as string); updateLayout(p.layoutId as string)
    updateThreeTheme(p.threeTheme as string); updateScreenOpacity(p.screenOpacity as number)
    updateParticleDensity(p.particleDensity as number); updateRenderQuality(p.renderQuality as number)
    updateHubFont(p.hubFontSize as number); updateTermFont(p.termFontSize as number)
    updateDockPosition(p.dockPosition as DockPosition)
  }
  const handleDeletePreset = (n: string) => { const u = { ...presets }; delete u[n]; setPresets(u); savePresetsStorage(u) }

  // ── System state ──
  const [launchOnStartup, setLaunchOnStartup] = useState(false)
  useEffect(() => { window.api?.getLaunchOnStartup?.().then((v) => setLaunchOnStartup(v)).catch(() => {}) }, [])

  const [tokenBudget, setTokenBudget] = useState<TokenBudgetId>(() => (localStorage.getItem('hal-o-token-budget') as TokenBudgetId) || 'full')
  const [subscriptionType, setSubscriptionType] = useState<'api' | 'subscription' | 'unknown'>('unknown')
  useEffect(() => { window.api?.detectSubscriptionType?.().then((info) => setSubscriptionType(info.type)).catch(() => {}) }, [])
  const handleTokenBudgetChange = useCallback((id: TokenBudgetId) => { setTokenBudget(id); localStorage.setItem('hal-o-token-budget', id) }, [])

  // ── Voice preview ──
  const previewProfile = useCallback((pid: string) => {
    if (pid === 'auto' || previewing) return
    playOrGenerate(PROFILE_SAMPLE_TEXTS[pid] || 'Hello, this is a voice test.', pid, setPreviewing)
  }, [previewing])

  // ── Search helpers ──
  const sL = search.toLowerCase().trim()
  const sA = sL.length > 0
  const m = (l: string) => !sA || l.toLowerCase().includes(sL)

  // Determine which tabs have matching options when searching
  const tabHasMatch = useCallback((tabId: TabId): boolean => {
    if (!sA) return true
    const labels: Record<TabId, string[]> = {
      'display': ['RENDERER', 'LAYOUT', '3D STYLE', 'HUB FONT SIZE', 'TERMINAL FONT SIZE', 'WIZARD FONT SIZE'],
      'graphics': ['BLOOM', 'CHROMATIC ABERRATION', 'FLOOR LINES', 'GROUP TRAILS', 'SCREEN OPACITY', 'CARDS PER SECTOR', 'PARTICLE DENSITY', 'RENDER QUALITY', 'SPHERE STYLE', 'PARTICLE HIDE DIST', 'RE-DETECT GPU'],
      'scene': ['AUTO ROTATE', 'ROTATION SPEED', 'SHIP VFX', 'INTRO ANIMATION', 'ACTIVITY FEEDBACK', 'SAVE CURRENT VIEW', 'RESET VIEW'],
      'terminal': ['TERMINAL DOCK', 'DOCK MODE', 'TERMINAL AI MODEL', 'DEFAULT IDE'],
      'voice-ai': ['VOICE OUTPUT', 'VOICE PROFILE', 'VOICE REACTION', 'HUMOR', 'FORMALITY', 'VERBOSITY', 'DRAMATIC', 'PERSONALITY PRESET', 'TOKEN BUDGET'],
      'presets': ['SAVE PRESET', 'LOAD PRESET'],
      'system': ['LAUNCH ON STARTUP', 'HIDDEN PROJECTS', 'ENABLED', 'PROJECT CARDS', 'TERMINAL AREAS', 'MIN TABS', 'MAX TABS', 'VFX SPAWN FREQUENCY', 'DEMO TEXT', 'DEMO VOICE'],
    }
    return labels[tabId]?.some(l => l.toLowerCase().includes(sL)) ?? false
  }, [sA, sL])

  const is3D = rendererId === 'pbr-holo' || rendererId === 'holographic'

  // ── Render tab content ──
  const renderTabContent = () => {
    switch (activeTab) {
      case 'display': return (
        <div className="hal-so-panel-content">
          <SectionTitle>DISPLAY</SectionTitle>
          {m('RENDERER') && (
            <SelectRow label="RENDERER" value={rendererId} onChange={(v) => {
              const nr = v as RendererId; updateRenderer(nr)
              const vl = RENDERER_LAYOUTS[nr] || LAYOUTS_CLASSIC
              if (!vl.some(l => l.id === layoutId)) updateLayout(vl[0].id)
            }} options={RENDERERS} />
          )}
          {m('LAYOUT') && (
            <SelectRow label="LAYOUT" value={layoutId} onChange={(v) => updateLayout(v)}
              options={RENDERER_LAYOUTS[rendererId] || LAYOUTS_CLASSIC} />
          )}
          {is3D && m('3D STYLE') && (
            <SelectRow label="3D STYLE" value={threeTheme} onChange={(v) => updateThreeTheme(v)}
              options={THREE_STYLES} />
          )}
          <Divider />
          {m('HUB FONT SIZE') && <Slider label="HUB FONT SIZE" min={7} max={18} step={1} value={hubFontSize} onChange={(v) => updateHubFont(Math.round(v))} fmt={(v) => Math.round(v) + 'px'} w={34} />}
          {m('TERMINAL FONT SIZE') && <Slider label="TERMINAL FONT SIZE" min={8} max={24} step={1} value={termFontSize} onChange={(v) => updateTermFont(Math.round(v))} fmt={(v) => Math.round(v) + 'px'} w={34} />}
          {m('WIZARD FONT SIZE') && <Slider label="WIZARD FONT SIZE" min={10} max={22} step={1} value={wizardFontSize} onChange={(v) => onWizardFontSize(Math.round(v))} fmt={(v) => Math.round(v) + 'px'} w={34} />}
        </div>
      )

      case 'graphics': return (
        <div className="hal-so-panel-content">
          <SectionTitle>GRAPHICS</SectionTitle>
          {m('BLOOM') && (<div className="hal-so-row"><span className="hal-so-label">BLOOM</span><Toggle value={bloomEnabled} onChange={updateBloomEnabled} /></div>)}
          {m('CHROMATIC ABERRATION') && (<div className="hal-so-row"><span className="hal-so-label">CHROMATIC ABERR.</span><Toggle value={chromaticAberrationEnabled} onChange={updateChromaticAberrationEnabled} /></div>)}
          {m('FLOOR LINES') && (<div className="hal-so-row"><span className="hal-so-label">FLOOR LINES</span><Toggle value={floorLinesEnabled} onChange={updateFloorLinesEnabled} /></div>)}
          {m('GROUP TRAILS') && (<div className="hal-so-row"><span className="hal-so-label">GROUP TRAILS</span><Toggle value={groupTrailsEnabled} onChange={updateGroupTrailsEnabled} /></div>)}
          <Divider />
          {m('SCREEN OPACITY') && <Slider label="SCREEN OPACITY" min={0.1} max={1} step={0.05} value={screenOpacity} onChange={updateScreenOpacity} fmt={(v) => Math.round(v * 100) + '%'} w={36} />}
          {m('CARDS PER SECTOR') && <Slider label="CARDS PER SECTOR" min={8} max={24} step={2} value={cardsPerSector} onChange={(v) => updateCardsPerSector(Math.round(v))} fmt={(v) => String(Math.round(v))} w={28} />}
          {m('PARTICLE DENSITY') && <Slider label="PARTICLE DENSITY" min={0} max={15} step={1} value={particleDensity} onChange={(v) => updateParticleDensity(Math.round(v))} fmt={(v) => PARTICLE_DENSITY_LABELS[Math.round(v)] || '?'} w={70} />}
          {m('RENDER QUALITY') && <Slider label="RENDER QUALITY" min={0.5} max={window.devicePixelRatio} step={0.25} value={renderQuality} onChange={updateRenderQuality} fmt={(v) => v >= window.devicePixelRatio ? 'NATIVE' : v.toFixed(2).replace(/\.?0+$/, '') + 'x'} w={52} />}
          {m('SPHERE STYLE') && (
            <SelectRow label="SPHERE STYLE" value={sphereStyle} onChange={(v) => updateSphereStyle(v as SphereStyleId)} options={SPHERE_STYLES} />
          )}
          {m('PARTICLE HIDE DIST') && <Slider label="PARTICLE HIDE DIST" min={1} max={15} step={0.5} value={camera.particleHideDist} onChange={(v) => updateCamera({ ...camera, particleHideDist: v })} fmt={(v) => v + 'u'} w={36} />}
          {m('RE-DETECT GPU') && onRedetectGpu && (
            <div className="hal-so-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="hal-so-action-btn" onClick={onRedetectGpu}
                style={{ color: '#22d3ee', borderColor: '#22d3ee55' }}>RE-DETECT GPU</button>
            </div>
          )}
        </div>
      )

      case 'scene': return (
        <div className="hal-so-panel-content">
          <SectionTitle>SCENE</SectionTitle>
          {m('AUTO ROTATE') && (<div className="hal-so-row"><span className="hal-so-label">AUTO ROTATE</span><Toggle value={autoRotateEnabled} onChange={updateAutoRotateEnabled} /></div>)}
          {m('ROTATION SPEED') && autoRotateEnabled && <Slider label="ROTATION SPEED" min={0.01} max={1} step={0.01} value={autoRotateSpeed} onChange={updateAutoRotateSpeed} fmt={(v) => v.toFixed(2)} w={36} />}
          <Divider />
          {m('SHIP VFX') && (<div className="hal-so-row"><span className="hal-so-label">SHIP VFX</span><Toggle value={shipVfxEnabled} onChange={updateShipVfxEnabled} /></div>)}
          {m('INTRO ANIMATION') && (<div className="hal-so-row"><span className="hal-so-label">INTRO ANIMATION</span><Toggle value={introAnimation} onChange={updateIntroAnimation} /></div>)}
          {m('ACTIVITY FEEDBACK') && (<div className="hal-so-row"><span className="hal-so-label">ACTIVITY FEEDBACK</span><Toggle value={activityFeedback} onChange={updateActivityFeedback} /></div>)}
          <Divider />
          {(m('SAVE CURRENT VIEW') || m('RESET VIEW')) && (
            <div className="hal-so-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              {m('SAVE CURRENT VIEW') && (
                <button className="hal-so-action-btn" onClick={() => { updateCamera(camera); setCameraSaved(true); setTimeout(() => setCameraSaved(false), 1200) }}
                  style={{ color: cameraSaved ? '#0f1117' : '#4ade80', borderColor: cameraSaved ? '#4ade80' : '#4ade8055', background: cameraSaved ? '#4ade80' : 'transparent' }}>
                  {cameraSaved ? 'SAVED' : 'SAVE VIEW'}
                </button>
              )}
              {m('RESET VIEW') && (
                <button className="hal-so-action-btn" onClick={resetCamera}
                  style={{ color: 'var(--text-dim)', borderColor: 'var(--border-dim, #333)' }}>RESET VIEW</button>
              )}
            </div>
          )}
        </div>
      )

      case 'terminal': return (
        <div className="hal-so-panel-content">
          <SectionTitle>TERMINAL</SectionTitle>
          {m('TERMINAL DOCK') && (
            <SelectRow label="TERMINAL DOCK" value={dockPosition} onChange={(v) => updateDockPosition(v as DockPosition)} options={DOCK_POSITIONS} />
          )}
          {m('DOCK MODE') && onDockModeChange && (<div className="hal-so-row"><span className="hal-so-label">DOCK MODE</span><Toggle value={dockMode} onChange={onDockModeChange} /></div>)}
          {m('TERMINAL AI MODEL') && (
            <SelectRow label="AI MODEL" value={defaultTerminalModel} onChange={(v) => updateDefaultTerminalModel(v as TerminalModelId)} options={TERMINAL_MODEL_OPTIONS} />
          )}
          {m('DEFAULT IDE') && (
            <SelectRow label="DEFAULT IDE" value={defaultIde} onChange={(v) => updateDefaultIde(v as IdeOptionId)} options={IDE_OPTIONS} />
          )}
        </div>
      )

      case 'voice-ai': return (
        <div className="hal-so-panel-content">
          <SectionTitle>VOICE & AI</SectionTitle>
          {m('VOICE OUTPUT') && (<div className="hal-so-row"><span className="hal-so-label">VOICE OUTPUT</span><Toggle value={voiceOut} onChange={updateVoiceOut} /></div>)}
          {m('VOICE PROFILE') && (
            <div className="hal-so-row hal-so-row-col">
              <span className="hal-so-label">VOICE PROFILE</span>
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <select className="hal-so-select" style={{ flex: 1 }} value={voiceProfile}
                  onChange={(e) => updateVoiceProfile(e.target.value as VoiceProfileId)}>
                  {VOICE_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <button className="hal-so-action-btn" onClick={() => previewProfile(voiceProfile === 'auto' ? 'narrator' : voiceProfile)}
                  disabled={!!previewing} title={previewing ? 'Playing ' + previewing + '...' : 'Preview voice'}
                  style={{ width: 32, padding: '3px 0' }}>{previewing ? '...' : '\u25B6'}</button>
              </div>
            </div>
          )}
          {m('VOICE REACTION') && <Slider label="VOICE REACTION" min={0} max={10} step={0.1} value={voiceReactionIntensity} onChange={updateVoiceReactionIntensity} fmt={(v) => v.toFixed(1) + 'x'} w={36} />}

          <Divider />
          <div className="hal-so-subsection-label">PERSONALITY</div>

          {m('HUMOR') && <Slider label="HUMOR" min={0} max={100} step={1} value={personality.humor} onChange={(v) => updatePersonality('humor', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}
          {m('FORMALITY') && <Slider label="FORMALITY" min={0} max={100} step={1} value={personality.formality} onChange={(v) => updatePersonality('formality', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}
          {m('VERBOSITY') && <Slider label="VERBOSITY" min={0} max={100} step={1} value={personality.verbosity} onChange={(v) => updatePersonality('verbosity', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}
          {m('DRAMATIC') && <Slider label="DRAMATIC" min={0} max={100} step={1} value={personality.dramatic} onChange={(v) => updatePersonality('dramatic', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}

          {m('PERSONALITY PRESET') && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {PERSONALITY_PRESETS.map((pr) => {
                const act = personality.humor === pr.values.humor && personality.formality === pr.values.formality &&
                  personality.verbosity === pr.values.verbosity && personality.dramatic === pr.values.dramatic
                return (<button key={pr.name} className="hal-so-action-btn" onClick={() => applyPersonalityPreset(pr.name)}
                  style={{ color: act ? 'var(--primary)' : 'var(--text-dim)', borderColor: act ? 'var(--primary)' : undefined, background: act ? 'rgba(132,204,22,0.08)' : undefined }}>
                  {pr.label}
                </button>)
              })}
            </div>
          )}

          <Divider />
          <div className="hal-so-subsection-label">TOKEN BUDGET</div>
          {subscriptionType !== 'unknown' && (
            <div className="hal-so-row" style={{ marginBottom: 4 }}>
              <span className="hal-so-label" style={{ color: subscriptionType === 'subscription' ? '#4ade80' : '#f59e0b', fontSize: '11px' }}>
                {subscriptionType === 'subscription' ? 'SUBSCRIPTION (UNLIMITED)' : 'API (PAY PER TOKEN)'}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TOKEN_BUDGET_OPTIONS.map((opt) => (
              <button key={opt.id} className="hal-so-budget-btn" onClick={() => handleTokenBudgetChange(opt.id)}
                style={{ borderColor: tokenBudget === opt.id ? '#22d3ee55' : 'var(--border-dim, #333)', background: tokenBudget === opt.id ? 'rgba(34,211,238,0.1)' : 'transparent', color: tokenBudget === opt.id ? '#22d3ee' : 'var(--text-dim)' }}>
                <span style={{ fontWeight: 600 }}>{tokenBudget === opt.id ? '\u25CF ' : '\u25CB '}{opt.label}</span>
                <span style={{ opacity: 0.6, marginTop: 2, fontSize: '11px' }}>{opt.description}</span>
              </button>
            ))}
          </div>
          {subscriptionType === 'api' && tokenBudget === 'full' && (
            <div className="hal-so-tip">TIP: API users can save ~30-50% with Balanced or Aggressive mode</div>
          )}
        </div>
      )

      case 'presets': return (
        <div className="hal-so-panel-content">
          <SectionTitle>PRESETS</SectionTitle>
          {m('SAVE PRESET') && (
            <div style={{ marginBottom: 12 }}>
              {!showNameInput ? (
                <button className="hal-so-action-btn" onClick={() => setShowNameInput(true)}
                  style={{ color: 'var(--primary)', borderColor: 'var(--primary-dim)' }}>+ SAVE PRESET</button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" className="hal-so-select" placeholder="PRESET NAME..." value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') { setShowNameInput(false); setPresetNameInput('') } }}
                    style={{ flex: 1 }} autoFocus />
                  <button className="hal-so-action-btn" onClick={handleSavePreset} disabled={!presetNameInput.trim()}
                    style={{ color: '#4ade80', borderColor: '#4ade8055' }}>SAVE</button>
                  <button className="hal-so-action-btn" onClick={() => { setShowNameInput(false); setPresetNameInput('') }}
                    style={{ color: 'var(--text-dim)' }}>X</button>
                </div>
              )}
            </div>
          )}
          {m('LOAD PRESET') && (
            <>
              {Object.keys(presets).length === 0 ? (
                <div className="hal-so-row"><span className="hal-so-label" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>(no presets saved)</span></div>
              ) : Object.keys(presets).map((nm) => (
                <div key={nm} className="hal-so-row" style={{ marginBottom: 6 }}>
                  <span className="hal-so-label" style={{ flex: 1, cursor: 'pointer', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={'Load preset: ' + nm} onClick={() => handleLoadPreset(nm)}>{nm}</span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="hal-so-action-btn" onClick={() => handleLoadPreset(nm)} style={{ color: 'var(--primary)', borderColor: 'var(--primary-dim)' }}>LOAD</button>
                    <button className="hal-so-action-btn" onClick={() => handleDeletePreset(nm)} style={{ color: '#f87171', borderColor: '#f8717155' }}>DEL</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )

      case 'system': return (
        <div className="hal-so-panel-content">
          <SectionTitle>SYSTEM</SectionTitle>
          {m('LAUNCH ON STARTUP') && (<div className="hal-so-row"><span className="hal-so-label">LAUNCH ON STARTUP</span>
            <Toggle value={launchOnStartup} onChange={(nx) => { setLaunchOnStartup(nx); window.api?.setLaunchOnStartup?.(nx).catch(() => setLaunchOnStartup(!nx)) }} color="#22d3ee" />
          </div>)}

          {/* Hidden Projects */}
          {onUnhide && (
            <>
              <Divider />
              <div className="hal-so-subsection-label">HIDDEN PROJECTS</div>
              {hiddenPaths.length === 0 ? (
                <div className="hal-so-row"><span className="hal-so-label" style={{ color: 'var(--text-dim)' }}>(none)</span></div>
              ) : hiddenPaths.map((hp) => {
                const nm = hp.split(/[/\\]/).pop() || hp
                return (<div key={hp} className="hal-so-row" style={{ marginBottom: 4 }}>
                  <span className="hal-so-label" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={hp}>{nm}</span>
                  <button className="hal-so-action-btn" onClick={() => onUnhide(hp)} style={{ color: '#4ade80', borderColor: '#4ade8055' }}>RESTORE</button>
                </div>)
              })}
            </>
          )}

          {/* Demo Mode */}
          {demo && (
            <>
              <Divider />
              <div className="hal-so-subsection-label">DEMO MODE</div>
              {m('ENABLED') && (<div className="hal-so-row"><span className="hal-so-label">ENABLED</span><Toggle value={demo.enabled} onChange={demo.setEnabled} color="#22d3ee" /></div>)}
              {demo.enabled && (<>
                {m('PROJECT CARDS') && <Slider label="PROJECT CARDS" min={5} max={100} step={1} value={demo.cardCount} onChange={(v) => demo.setCardCount(Math.round(v))} fmt={(v) => '' + Math.round(v)} w={28} accent="#22d3ee" />}
                {m('TERMINAL AREAS') && <Slider label="TERMINAL AREAS" min={1} max={4} step={1} value={demo.terminalCount} onChange={(v) => demo.setTerminalCount(Math.round(v))} fmt={(v) => '' + Math.round(v)} w={14} accent="#22d3ee" />}
                {m('MIN TABS') && <Slider label="MIN TABS" min={1} max={5} step={1} value={demo.tabsMin} onChange={(v) => { const rv = Math.round(v); demo.setTabsMin(rv); if (rv > demo.tabsMax) demo.setTabsMax(rv) }} fmt={(v) => '' + Math.round(v)} w={14} accent="#22d3ee" />}
                {m('MAX TABS') && <Slider label="MAX TABS" min={1} max={5} step={1} value={demo.tabsMax} onChange={(v) => { const rv = Math.round(v); demo.setTabsMax(rv); if (rv < demo.tabsMin) demo.setTabsMin(rv) }} fmt={(v) => '' + Math.round(v)} w={14} accent="#22d3ee" />}
                {m('VFX SPAWN FREQUENCY') && <Slider label="VFX SPAWN FREQ" min={0} max={30} step={1} value={demo.vfxFrequency} onChange={(v) => demo.setVfxFrequency(Math.round(v))} fmt={(v) => Math.round(v) === 0 ? 'OFF' : Math.round(v) + 's'} w={30} accent="#22d3ee" />}
                {m('DEMO TEXT') && (
                  <div className="hal-so-row hal-so-row-col">
                    <span className="hal-so-label">DEMO TEXT</span>
                    <input type="text" className="hal-so-select" style={{ width: '100%' }} value={demo.demoText} onChange={(e) => demo.setDemoText(e.target.value)} />
                  </div>
                )}
                {m('DEMO VOICE') && (
                  <div className="hal-so-row hal-so-row-col">
                    <span className="hal-so-label">DEMO VOICE</span>
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      <select className="hal-so-select" style={{ flex: 1 }} value={demo.demoVoice}
                        onChange={(e) => demo.setDemoVoice(e.target.value as VoiceProfileId)}>
                        {VOICE_PROFILES.filter(vp => vp.id !== 'auto').map(vp => <option key={vp.id} value={vp.id}>{vp.label}</option>)}
                      </select>
                      <button className="hal-so-action-btn" onClick={() => { if (previewing) return; playOrGenerate(demo.demoText || 'Hello, this is a demo voice test.', demo.demoVoice, setPreviewing) }}
                        disabled={!!previewing} style={{ width: 32, padding: '3px 0' }}>{previewing ? '...' : '\u25B6'}</button>
                    </div>
                  </div>
                )}
              </>)}
            </>
          )}
        </div>
      )

      default: return null
    }
  }

  return (<div ref={btnRef} style={{ position: 'relative' }}>
    {/* Gear toggle button -- same as before */}
    <button className="hal-settings-btn" data-tutorial="settings-gear" onClick={() => setOpen(!open)} title="Settings">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    </button>

    {/* Full-screen overlay -- always mounted, visibility toggled (PERF9) */}
    {createPortal(
      <div className={'hal-so-backdrop' + (open ? ' hal-so-open' : '')} ref={overlayRef}
        style={{ visibility: open ? 'visible' : 'hidden', pointerEvents: open ? 'auto' : 'none' }}
        onClick={(e) => { if (e.target === overlayRef.current) setOpen(false) }}>
        <div className={'hal-so-container' + (open ? ' hal-so-container-open' : '')}>
          {/* Header with title, search, close */}
          <div className="hal-so-header">
            <div className="hal-so-header-title">SETTINGS</div>
            <div className="hal-so-header-search">
              <input type="text" placeholder="SEARCH SETTINGS..." value={search}
                onChange={(e) => setSearch(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <button className="hal-so-close-btn" onClick={() => setOpen(false)} title="Close (ESC)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="hal-so-body">
            {/* Left tab bar */}
            <nav className="hal-so-tabs">
              {TABS.map((tab) => {
                const hasMatch = tabHasMatch(tab.id)
                const active = activeTab === tab.id
                return (
                  <button key={tab.id} className={'hal-so-tab' + (active ? ' hal-so-tab-active' : '') + (!hasMatch && sA ? ' hal-so-tab-dim' : '')}
                    onClick={() => { setActiveTab(tab.id); if (!hasMatch) setSearch('') }}>
                    <span className="hal-so-tab-icon"><TabIcon type={tab.icon} size={18} /></span>
                    <span className="hal-so-tab-label">{tab.label}</span>
                    {sA && hasMatch && !active && <span className="hal-so-tab-match-dot" />}
                  </button>
                )
              })}
            </nav>

            {/* Right content panel */}
            <div className="hal-so-panel">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
  </div>)
}
