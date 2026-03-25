import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { connectAudioElement } from '../utils/audioAnalyser'
import { VOICE_PROFILES, DOCK_POSITIONS, PARTICLE_DENSITY_LABELS, PERSONALITY_PRESETS, IDE_OPTIONS, SPHERE_STYLES, TERMINAL_MODEL_OPTIONS, TOKEN_BUDGET_OPTIONS, type VoiceProfileId, type DockPosition, type CameraSettings, type PersonalitySettings, type IdeOptionId, type SphereStyleId, type TerminalModelId, type TokenBudgetId } from '../hooks/useSettings'
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

const PRESET_KEYS = ['rendererId', 'layoutId', 'threeTheme', 'screenOpacity', 'particleDensity', 'renderQuality', 'hubFontSize', 'termFontSize', 'dockPosition'] as const
type PresetKey = typeof PRESET_KEYS[number]
type PresetValues = { [K in PresetKey]: number | string }
interface SavedPresets { [name: string]: PresetValues }
function loadPresets(): SavedPresets { try { return JSON.parse(localStorage.getItem('hal-o-presets') || '{}') } catch { return {} } }
function savePresets(p: SavedPresets) { localStorage.setItem('hal-o-presets', JSON.stringify(p)) }

interface Props {
  hubFontSize: number; termFontSize: number; wizardFontSize: number; onWizardFontSize: (s: number) => void
  voiceOut: boolean; voiceProfile: VoiceProfileId; dockPosition: DockPosition; screenOpacity: number
  rendererId: RendererId; layoutId: LayoutId; threeTheme: string
  onHubFontSize: (s: number) => void; onTermFontSize: (s: number) => void
  onVoiceOut: (e: boolean) => void; onVoiceProfileChange: (id: VoiceProfileId) => void
  onDockPositionChange: (p: DockPosition) => void; onScreenOpacityChange: (o: number) => void
  particleDensity: number; onParticleDensityChange: (v: number) => void
  renderQuality: number; onRenderQualityChange: (v: number) => void
  camera: CameraSettings; onCameraChange: (c: CameraSettings) => void; onCameraReset: () => void
  onRendererChange: (id: RendererId) => void; onLayoutChange: (id: LayoutId) => void; onThreeThemeChange: (id: string) => void
  shipVfxEnabled: boolean; onShipVfxEnabledChange: (e: boolean) => void
  introAnimation: boolean; onIntroAnimationChange: (e: boolean) => void
  activityFeedback: boolean; onActivityFeedbackChange: (e: boolean) => void
  sphereStyle: SphereStyleId; onSphereStyleChange: (s: SphereStyleId) => void
  voiceReactionIntensity: number; onVoiceReactionIntensityChange: (v: number) => void
  personality: PersonalitySettings; onPersonalityChange: (k: keyof PersonalitySettings, v: number) => void; onPersonalityPreset: (n: string) => void
  defaultIde: IdeOptionId; onDefaultIdeChange: (id: IdeOptionId) => void
  defaultTerminalModel: TerminalModelId; onDefaultTerminalModelChange: (id: TerminalModelId) => void
  hiddenPaths?: string[]; onUnhide?: (p: string) => void
  demo?: DemoSettings
  dockMode?: boolean; onDockModeChange?: (e: boolean) => void
  bloomEnabled?: boolean; onBloomEnabledChange?: (e: boolean) => void
  chromaticAberrationEnabled?: boolean; onChromaticAberrationEnabledChange?: (e: boolean) => void
  floorLinesEnabled?: boolean; onFloorLinesEnabledChange?: (e: boolean) => void
  groupTrailsEnabled?: boolean; onGroupTrailsEnabledChange?: (e: boolean) => void
  autoRotateEnabled?: boolean; onAutoRotateEnabledChange?: (e: boolean) => void
  autoRotateSpeed?: number; onAutoRotateSpeedChange?: (s: number) => void
  onRedetectGpu?: () => void
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

const SECTION_ICONS: Record<string, string> = {
  'DISPLAY': '\uD83D\uDDA5\uFE0F',
  'GRAPHICS': '\uD83C\uDFA8',
  'EFFECTS': '\u2728',
  'TERMINAL': '\u2B1B',
  'VOICE': '\uD83C\uDF99\uFE0F',
  'PERSONALITY': '\uD83C\uDFAD',
  'PRESETS': '\uD83D\uDCBE',
  'SYSTEM': '\u2699\uFE0F',
  'HIDDEN PROJECTS': '\uD83D\uDC41\uFE0F',
  'DEMO MODE': '\uD83C\uDFAC',
}

function SectionHeader({ label, expanded, onToggle }: { label: string; expanded: boolean; onToggle: () => void }) {
  const icon = SECTION_ICONS[label] || ''
  return (<button className="hal-settings-section-header" onClick={onToggle}>
    <span className="hal-settings-section-arrow">{expanded ? '\u25BC' : '\u25B6'}</span>{icon && <span style={{ marginRight: 6, fontSize: '12px' }}>{icon}</span>}<span>{label}</span>
  </button>)
}

/** Consistent ON/OFF toggle used for all boolean settings */
function Toggle({ value, onChange, color: c }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  const clr = c || 'var(--primary)'
  return (<button onClick={() => onChange(!value)} style={{
    width: 42, padding: '2px 0', fontSize: 'calc(var(--hub-font, 10px) - 1px)',
    fontFamily: "'Cascadia Code','Fira Code',monospace", letterSpacing: '1px', textAlign: 'center',
    background: value ? clr + '12' : 'rgba(255,255,255,0.03)',
    border: '1px solid ' + (value ? (c ? c + '55' : 'var(--primary-dim)') : 'rgba(255,255,255,0.1)'),
    borderRadius: '3px', color: value ? clr : 'var(--text-dim)',
    cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
  }}>{value ? 'ON' : 'OFF'}</button>)
}

/** Consistent slider row with fixed-width value label */
function Slider({ label, min, max, step, value, onChange, fmt, w = 40, accent }: {
  label: string; min: number; max: number; step: number; value: number
  onChange: (v: number) => void; fmt: (v: number) => string; w?: number; accent?: string
}) {
  return (<div className="hal-settings-row">
    <span className="hal-settings-label">{label}</span>
    <div className="hal-settings-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: accent || 'var(--primary)' }} />
      <span style={{ fontSize: 'var(--hub-font, 10px)', color: 'var(--text-dim)', width: w,
        textAlign: 'right', flexShrink: 0, fontFamily: "'Cascadia Code','Fira Code',monospace",
        fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </div>
  </div>)
}

export function SettingsMenu({
  hubFontSize, termFontSize, wizardFontSize, onWizardFontSize,
  voiceOut, voiceProfile, dockPosition, screenOpacity,
  particleDensity, onParticleDensityChange, renderQuality, onRenderQualityChange,
  camera, rendererId, layoutId, threeTheme,
  onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange,
  onDockPositionChange, onScreenOpacityChange, onCameraChange, onCameraReset,
  onRendererChange, onLayoutChange, onThreeThemeChange,
  shipVfxEnabled, onShipVfxEnabledChange, introAnimation, onIntroAnimationChange,
  activityFeedback, onActivityFeedbackChange,
  sphereStyle, onSphereStyleChange, voiceReactionIntensity, onVoiceReactionIntensityChange,
  personality, onPersonalityChange, onPersonalityPreset,
  defaultIde, onDefaultIdeChange, defaultTerminalModel, onDefaultTerminalModelChange,
  hiddenPaths = [], onUnhide, demo,
  dockMode = false, onDockModeChange,
  bloomEnabled = true, onBloomEnabledChange,
  chromaticAberrationEnabled = false, onChromaticAberrationEnabledChange,
  floorLinesEnabled = false, onFloorLinesEnabledChange,
  groupTrailsEnabled = false, onGroupTrailsEnabledChange,
  autoRotateEnabled = true, onAutoRotateEnabledChange,
  autoRotateSpeed = 0.12, onAutoRotateSpeedChange,
  onRedetectGpu,
}: Props) {
  const [open, setOpen] = useState(false)
  // Lock panel font size to whatever it was when opened — prevents the panel
  // from resizing while you drag the hub font slider. The hub behind updates live.
  const [panelFont, setPanelFont] = useState(hubFontSize)
  useEffect(() => { if (open) setPanelFont(hubFontSize) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  // Listen for external open requests (e.g. GPU wizard "Customize" button)
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('hal-open-settings', handler)
    return () => window.removeEventListener('hal-open-settings', handler)
  }, [])
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [cameraSaved, setCameraSaved] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const sA = search.trim().length > 0
  const sL = search.toLowerCase()

  const [secDisplay, setSecDisplay] = useState(true)
  const [secGraphics, setSecGraphics] = useState(false)
  const [secEffects, setSecEffects] = useState(false)
  const [secTerminal, setSecTerminal] = useState(false)
  const [secVoice, setSecVoice] = useState(false)
  const [secPersonality, setSecPersonality] = useState(false)
  const [secPresets, setSecPresets] = useState(false)
  const [secSystem, setSecSystem] = useState(false)
  const [secHidden, setSecHidden] = useState(false)
  const [secDemo, setSecDemo] = useState(false)

  const [launchOnStartup, setLaunchOnStartup] = useState(false)
  useEffect(() => { window.api?.getLaunchOnStartup?.().then((v) => setLaunchOnStartup(v)).catch(() => {}) }, [])

  const [tokenBudget, setTokenBudget] = useState<TokenBudgetId>(() => (localStorage.getItem('hal-o-token-budget') as TokenBudgetId) || 'full')
  const [subscriptionType, setSubscriptionType] = useState<'api' | 'subscription' | 'unknown'>('unknown')
  useEffect(() => { window.api?.detectSubscriptionType?.().then((info) => setSubscriptionType(info.type)).catch(() => {}) }, [])
  const handleTokenBudgetChange = useCallback((id: TokenBudgetId) => { setTokenBudget(id); localStorage.setItem('hal-o-token-budget', id) }, [])

  const isEx = (flag: boolean) => sA || flag
  const [presets, setPresets] = useState<SavedPresets>(loadPresets)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const curSettings: PresetValues = { rendererId, layoutId, threeTheme, screenOpacity, particleDensity, renderQuality, hubFontSize, termFontSize, dockPosition }

  const handleSavePreset = () => { const n = presetNameInput.trim(); if (!n) return; const u = { ...presets, [n]: { ...curSettings } }; setPresets(u); savePresets(u); setPresetNameInput(''); setShowNameInput(false) }
  const handleLoadPreset = (n: string) => { const p = presets[n]; if (!p) return; onRendererChange(p.rendererId as RendererId); onLayoutChange(p.layoutId as string); onThreeThemeChange(p.threeTheme as string); onScreenOpacityChange(p.screenOpacity as number); onParticleDensityChange(p.particleDensity as number); onRenderQualityChange(p.renderQuality as number); onHubFontSize(p.hubFontSize as number); onTermFontSize(p.termFontSize as number); onDockPositionChange(p.dockPosition as DockPosition) }
  const handleDeletePreset = (n: string) => { const u = { ...presets }; delete u[n]; setPresets(u); savePresets(u) }

  const previewProfile = useCallback((pid: string) => {
    if (pid === 'auto' || previewing) return
    playOrGenerate(PROFILE_SAMPLE_TEXTS[pid] || 'Hello, this is a voice test.', pid, setPreviewing)
  }, [previewing])

  useEffect(() => { if (!open) return; const cl = (e: MouseEvent) => { const t = e.target as Node; if (ref.current?.contains(t) || panelRef.current?.contains(t)) return; setOpen(false) }; window.addEventListener('mousedown', cl); return () => window.removeEventListener('mousedown', cl) }, [open])

  const m = (l: string) => !sA || l.toLowerCase().includes(sL)
  const sv = (ls: string[]) => !sA || ls.some((l) => l.toLowerCase().includes(sL))
  const is3D = rendererId === 'pbr-holo' || rendererId === 'holographic'

  return (<div ref={ref} style={{ position: 'relative' }}>
    <button className="hal-settings-btn" data-tutorial="settings-gear" onClick={() => setOpen(!open)} title="Settings">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    </button>
    {createPortal(
      <div className="hal-settings-panel" ref={panelRef} style={(() => { const rect = ref.current?.getBoundingClientRect(); const font = panelFont + 'px'; const pos = rect ? { position: 'fixed' as const, top: rect.bottom + 6, right: window.innerWidth - rect.right } : { position: 'fixed' as const, top: 40, right: 8 }; return { ...pos, '--hub-font': font, visibility: open ? 'visible' as const : 'hidden' as const, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' as const : 'none' as const, transition: 'opacity 0.12s ease' } as React.CSSProperties })()}>
        <div className="hal-settings-title">SETTINGS</div>
        <div style={{ marginBottom: 8 }}><input type="text" className="hal-settings-select" placeholder="SEARCH SETTINGS..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '5px 8px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', boxSizing: 'border-box' }} autoComplete="off" spellCheck={false} /></div>

        {/* 1. DISPLAY (includes font size controls — UX5) */}
        {sv(['RENDERER','LAYOUT','3D STYLE','HUB FONT SIZE','TERMINAL FONT SIZE','WIZARD FONT SIZE']) && (<><SectionHeader label="DISPLAY" expanded={isEx(secDisplay)} onToggle={() => setSecDisplay(!secDisplay)} />
          {isEx(secDisplay) && (<div className="hal-settings-section-body">
            {m('RENDERER') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}><span className="hal-settings-label">RENDERER</span><select className="hal-settings-select" value={rendererId} onChange={(e) => { const nr = e.target.value as RendererId; onRendererChange(nr); const vl = RENDERER_LAYOUTS[nr] || LAYOUTS_CLASSIC; if (!vl.some((l) => l.id === layoutId)) onLayoutChange(vl[0].id as LayoutId) }}>{RENDERERS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>)}
            {m('LAYOUT') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}><span className="hal-settings-label">LAYOUT</span><select className="hal-settings-select" value={layoutId} onChange={(e) => onLayoutChange(e.target.value as LayoutId)}>{(RENDERER_LAYOUTS[rendererId] || LAYOUTS_CLASSIC).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>)}
            {is3D && m('3D STYLE') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}><span className="hal-settings-label">3D STYLE</span><select className="hal-settings-select" value={threeTheme} onChange={(e) => onThreeThemeChange(e.target.value)}>{THREE_STYLES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>)}
            {m('HUB FONT SIZE') && <Slider label="HUB FONT SIZE" min={7} max={18} step={1} value={hubFontSize} onChange={(v) => onHubFontSize(Math.round(v))} fmt={(v) => Math.round(v) + 'px'} w={34} />}
            {m('TERMINAL FONT SIZE') && <Slider label="TERMINAL FONT SIZE" min={8} max={24} step={1} value={termFontSize} onChange={(v) => onTermFontSize(Math.round(v))} fmt={(v) => Math.round(v) + 'px'} w={34} />}
            {m('WIZARD FONT SIZE') && <Slider label="WIZARD FONT SIZE" min={10} max={22} step={1} value={wizardFontSize} onChange={(v) => onWizardFontSize(Math.round(v))} fmt={(v) => Math.round(v) + 'px'} w={34} />}
          </div>)}</>)}

        {/* 2. GRAPHICS */}
        {sv(['BLOOM','CHROMATIC ABERRATION','FLOOR LINES','GROUP TRAILS','AUTO ROTATE','ROTATION SPEED','SCREEN OPACITY','PARTICLE DENSITY','RENDER QUALITY','SPHERE STYLE','PARTICLE HIDE DIST','RE-DETECT GPU']) && (<><SectionHeader label="GRAPHICS" expanded={isEx(secGraphics)} onToggle={() => setSecGraphics(!secGraphics)} />
          {isEx(secGraphics) && (<div className="hal-settings-section-body">
            {m('BLOOM') && onBloomEnabledChange && (<div className="hal-settings-row"><span className="hal-settings-label">BLOOM</span><div className="hal-settings-control"><Toggle value={bloomEnabled} onChange={onBloomEnabledChange} /></div></div>)}
            {m('CHROMATIC ABERRATION') && onChromaticAberrationEnabledChange && (<div className="hal-settings-row"><span className="hal-settings-label">CHROMATIC ABERR.</span><div className="hal-settings-control"><Toggle value={chromaticAberrationEnabled} onChange={onChromaticAberrationEnabledChange} /></div></div>)}
            {m('FLOOR LINES') && onFloorLinesEnabledChange && (<div className="hal-settings-row"><span className="hal-settings-label">FLOOR LINES</span><div className="hal-settings-control"><Toggle value={floorLinesEnabled} onChange={onFloorLinesEnabledChange} /></div></div>)}
            {m('GROUP TRAILS') && onGroupTrailsEnabledChange && (<div className="hal-settings-row"><span className="hal-settings-label">GROUP TRAILS</span><div className="hal-settings-control"><Toggle value={groupTrailsEnabled} onChange={onGroupTrailsEnabledChange} /></div></div>)}
            {m('AUTO ROTATE') && onAutoRotateEnabledChange && (<div className="hal-settings-row"><span className="hal-settings-label">AUTO ROTATE</span><div className="hal-settings-control"><Toggle value={autoRotateEnabled} onChange={onAutoRotateEnabledChange} /></div></div>)}
            {m('ROTATION SPEED') && autoRotateEnabled && onAutoRotateSpeedChange && <Slider label="ROTATION SPEED" min={0.01} max={1} step={0.01} value={autoRotateSpeed} onChange={onAutoRotateSpeedChange} fmt={(v) => v.toFixed(2)} w={36} />}
            {m('SCREEN OPACITY') && <Slider label="SCREEN OPACITY" min={0.1} max={1} step={0.05} value={screenOpacity} onChange={onScreenOpacityChange} fmt={(v) => Math.round(v * 100) + '%'} w={36} />}
            {m('PARTICLE DENSITY') && <Slider label="PARTICLE DENSITY" min={0} max={15} step={1} value={particleDensity} onChange={(v) => onParticleDensityChange(Math.round(v))} fmt={(v) => PARTICLE_DENSITY_LABELS[Math.round(v)] || '?'} w={70} />}
            {m('RENDER QUALITY') && <Slider label="RENDER QUALITY" min={0.5} max={window.devicePixelRatio} step={0.25} value={renderQuality} onChange={onRenderQualityChange} fmt={(v) => v >= window.devicePixelRatio ? 'NATIVE' : v.toFixed(2).replace(/\.?0+$/, '') + 'x'} w={52} />}
            {m('SPHERE STYLE') && (<div className="hal-settings-row"><span className="hal-settings-label">SPHERE STYLE</span><div className="hal-settings-control"><select className="hal-settings-select" value={sphereStyle} onChange={(e) => onSphereStyleChange(e.target.value as SphereStyleId)} style={{ width: '100%', textTransform: 'uppercase' }}>{SPHERE_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div></div>)}
            {m('PARTICLE HIDE DIST') && <Slider label="PARTICLE HIDE DIST" min={1} max={15} step={0.5} value={camera.particleHideDist} onChange={(v) => onCameraChange({ ...camera, particleHideDist: v })} fmt={(v) => v + 'u'} w={36} />}
            {m('RE-DETECT GPU') && onRedetectGpu && (<div className="hal-settings-row" style={{ justifyContent: 'flex-end', marginTop: 4 }}><button className="hal-settings-preview-btn" onClick={onRedetectGpu} style={{ width: 'auto', padding: '3px 10px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', color: '#22d3ee', borderColor: '#22d3ee55', letterSpacing: '1px' }}>RE-DETECT GPU</button></div>)}
          </div>)}</>)}

        {/* 3. EFFECTS */}
        {sv(['SHIP VFX','INTRO ANIMATION','ACTIVITY FEEDBACK','SAVE CURRENT VIEW','RESET VIEW']) && (<><SectionHeader label="EFFECTS" expanded={isEx(secEffects)} onToggle={() => setSecEffects(!secEffects)} />
          {isEx(secEffects) && (<div className="hal-settings-section-body">
            {m('SHIP VFX') && (<div className="hal-settings-row"><span className="hal-settings-label">SHIP VFX</span><div className="hal-settings-control"><Toggle value={shipVfxEnabled} onChange={onShipVfxEnabledChange} /></div></div>)}
            {m('INTRO ANIMATION') && (<div className="hal-settings-row"><span className="hal-settings-label">INTRO ANIMATION</span><div className="hal-settings-control"><Toggle value={introAnimation} onChange={onIntroAnimationChange} /></div></div>)}
            {m('ACTIVITY FEEDBACK') && (<div className="hal-settings-row"><span className="hal-settings-label">ACTIVITY FEEDBACK</span><div className="hal-settings-control"><Toggle value={activityFeedback} onChange={onActivityFeedbackChange} /></div></div>)}
            {(m('SAVE CURRENT VIEW') || m('RESET VIEW')) && (<div className="hal-settings-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
              {m('SAVE CURRENT VIEW') && (<button className="hal-settings-preview-btn" onClick={() => { onCameraChange(camera); setCameraSaved(true); setTimeout(() => setCameraSaved(false), 1200) }} title="Save current orbit position" style={{ padding: '3px 10px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', width: 'auto', color: cameraSaved ? '#0f1117' : '#4ade80', borderColor: cameraSaved ? '#4ade80' : '#4ade8055', background: cameraSaved ? '#4ade80' : 'transparent', transition: 'all 0.2s' }}>{cameraSaved ? 'SAVED' : 'SAVE CURRENT VIEW'}</button>)}
              {m('RESET VIEW') && (<button className="hal-settings-preview-btn" onClick={onCameraReset} title="Reset to default view" style={{ padding: '3px 10px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', width: 'auto', color: 'var(--text-dim)', borderColor: 'var(--border-dim, #333)' }}>RESET VIEW</button>)}
            </div>)}
          </div>)}</>)}


        {/* 4. TERMINAL */}
        {sv(['TERMINAL DOCK','DOCK MODE','TERMINAL AI MODEL','DEFAULT IDE']) && (<><SectionHeader label="TERMINAL" expanded={isEx(secTerminal)} onToggle={() => setSecTerminal(!secTerminal)} />
          {isEx(secTerminal) && (<div className="hal-settings-section-body">
            {m('TERMINAL DOCK') && (<div className="hal-settings-row"><span className="hal-settings-label">TERMINAL DOCK</span><div className="hal-settings-control"><select className="hal-settings-select" value={dockPosition} onChange={(e) => onDockPositionChange(e.target.value as DockPosition)}>{DOCK_POSITIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div></div>)}
            {m('DOCK MODE') && onDockModeChange && (<div className="hal-settings-row"><span className="hal-settings-label">DOCK MODE</span><div className="hal-settings-control"><Toggle value={dockMode} onChange={onDockModeChange} /></div></div>)}
            {m('TERMINAL AI MODEL') && (<div className="hal-settings-row"><span className="hal-settings-label">AI MODEL</span><div className="hal-settings-control"><select className="hal-settings-select" value={defaultTerminalModel} onChange={(e) => onDefaultTerminalModelChange(e.target.value as TerminalModelId)}>{TERMINAL_MODEL_OPTIONS.map((mo) => <option key={mo.id} value={mo.id}>{mo.label}</option>)}</select></div></div>)}
            {m('DEFAULT IDE') && (<div className="hal-settings-row"><span className="hal-settings-label">DEFAULT IDE</span><div className="hal-settings-control"><select className="hal-settings-select" value={defaultIde} onChange={(e) => onDefaultIdeChange(e.target.value as IdeOptionId)}>{IDE_OPTIONS.map((ide) => <option key={ide.id} value={ide.id}>{ide.label}</option>)}</select></div></div>)}
          </div>)}</>)}

        {/* 5. VOICE */}
        {sv(['VOICE OUTPUT','VOICE PROFILE','VOICE REACTION']) && (<><SectionHeader label="VOICE" expanded={isEx(secVoice)} onToggle={() => setSecVoice(!secVoice)} />
          {isEx(secVoice) && (<div className="hal-settings-section-body">
            {m('VOICE OUTPUT') && (<div className="hal-settings-row"><span className="hal-settings-label">VOICE OUTPUT</span><div className="hal-settings-control"><Toggle value={voiceOut} onChange={onVoiceOut} /></div></div>)}
            {m('VOICE PROFILE') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}><span className="hal-settings-label">VOICE PROFILE</span><div style={{ display: 'flex', gap: 4, width: '100%' }}><select className="hal-settings-select" style={{ flex: 1 }} value={voiceProfile} onChange={(e) => onVoiceProfileChange(e.target.value as VoiceProfileId)}>{VOICE_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select><button className="hal-settings-preview-btn" onClick={() => previewProfile(voiceProfile === 'auto' ? 'narrator' : voiceProfile)} disabled={!!previewing} title={previewing ? 'Playing ' + previewing + '...' : 'Preview voice'}>{previewing ? '...' : '\u25B6'}</button></div></div>)}
            {m('VOICE REACTION') && <Slider label="VOICE REACTION" min={0} max={10} step={0.1} value={voiceReactionIntensity} onChange={onVoiceReactionIntensityChange} fmt={(v) => v.toFixed(1) + 'x'} w={36} />}
          </div>)}</>)}

        {/* 6. PERSONALITY */}
        {sv(['HUMOR','FORMALITY','VERBOSITY','DRAMATIC','PERSONALITY PRESET']) && (<><SectionHeader label="PERSONALITY" expanded={isEx(secPersonality)} onToggle={() => setSecPersonality(!secPersonality)} />
          {isEx(secPersonality) && (<div className="hal-settings-section-body">
            {m('HUMOR') && <Slider label="HUMOR" min={0} max={100} step={1} value={personality.humor} onChange={(v) => onPersonalityChange('humor', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}
            {m('FORMALITY') && <Slider label="FORMALITY" min={0} max={100} step={1} value={personality.formality} onChange={(v) => onPersonalityChange('formality', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}
            {m('VERBOSITY') && <Slider label="VERBOSITY" min={0} max={100} step={1} value={personality.verbosity} onChange={(v) => onPersonalityChange('verbosity', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}
            {m('DRAMATIC') && <Slider label="DRAMATIC" min={0} max={100} step={1} value={personality.dramatic} onChange={(v) => onPersonalityChange('dramatic', Math.round(v))} fmt={(v) => Math.round(v) + '%'} w={36} />}
            {m('PERSONALITY PRESET') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}><span className="hal-settings-label" style={{ fontSize: 'calc(var(--hub-font, 10px) - 2px)' }}>PRESETS</span><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{PERSONALITY_PRESETS.map((pr) => { const act = personality.humor === pr.values.humor && personality.formality === pr.values.formality && personality.verbosity === pr.values.verbosity && personality.dramatic === pr.values.dramatic; return (<button key={pr.name} className="hal-settings-preview-btn" onClick={() => onPersonalityPreset(pr.name)} style={{ width: 'auto', padding: '2px 8px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', letterSpacing: '1px', color: act ? 'var(--primary)' : 'var(--text-dim)', borderColor: act ? 'var(--primary)' : undefined, background: act ? 'rgba(132,204,22,0.08)' : undefined }}>{pr.label}</button>) })}</div></div>)}
          </div>)}</>)}

        {/* 7. PRESETS */}
        {sv(['SAVE PRESET','LOAD PRESET']) && (<><SectionHeader label="PRESETS" expanded={isEx(secPresets)} onToggle={() => setSecPresets(!secPresets)} />
          {isEx(secPresets) && (<div className="hal-settings-section-body">
            {m('SAVE PRESET') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              {!showNameInput ? (<button className="hal-settings-preview-btn" onClick={() => setShowNameInput(true)} style={{ width: 'auto', padding: '3px 10px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', color: 'var(--primary)', borderColor: 'var(--primary-dim)' }}>+ SAVE PRESET</button>
              ) : (<div style={{ display: 'flex', gap: 4, width: '100%' }}>
                <input type="text" className="hal-settings-select" placeholder="PRESET NAME..." value={presetNameInput} onChange={(e) => setPresetNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') { setShowNameInput(false); setPresetNameInput('') } }} style={{ flex: 1, padding: '4px 6px', fontSize: 'calc(var(--hub-font, 10px) - 1px)' }} autoFocus />
                <button className="hal-settings-preview-btn" onClick={handleSavePreset} disabled={!presetNameInput.trim()} style={{ width: 'auto', padding: '3px 8px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', color: '#4ade80', borderColor: '#4ade8055' }}>SAVE</button>
                <button className="hal-settings-preview-btn" onClick={() => { setShowNameInput(false); setPresetNameInput('') }} style={{ width: 'auto', padding: '3px 8px', fontSize: 'calc(var(--hub-font, 10px) - 1px)', color: 'var(--text-dim)' }}>X</button>
              </div>)}
            </div>)}
            {m('LOAD PRESET') && (<>{Object.keys(presets).length === 0 ? (<div className="hal-settings-row"><span className="hal-settings-label" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>(no presets saved)</span></div>) : Object.keys(presets).map((nm) => (<div key={nm} className="hal-settings-row" style={{ marginBottom: 4 }}><span className="hal-settings-label" style={{ flex: 1, cursor: 'pointer', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={'Load preset: ' + nm} onClick={() => handleLoadPreset(nm)}>{nm}</span><div style={{ display: 'flex', gap: 4, flexShrink: 0 }}><button className="hal-settings-preview-btn" onClick={() => handleLoadPreset(nm)} style={{ width: 'auto', padding: '2px 8px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', color: 'var(--primary)', borderColor: 'var(--primary-dim)' }}>LOAD</button><button className="hal-settings-preview-btn" onClick={() => handleDeletePreset(nm)} style={{ width: 'auto', padding: '2px 8px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', color: '#f87171', borderColor: '#f8717155' }}>DEL</button></div></div>))}</>)}
          </div>)}</>)}

        {/* 8. SYSTEM */}
        {sv(['LAUNCH ON STARTUP','TOKEN BUDGET','FULL FEATURES','BALANCED','AGGRESSIVE SAVER']) && (<><SectionHeader label="SYSTEM" expanded={isEx(secSystem)} onToggle={() => setSecSystem(!secSystem)} />
          {isEx(secSystem) && (<div className="hal-settings-section-body">
            {m('LAUNCH ON STARTUP') && (<div className="hal-settings-row"><span className="hal-settings-label">LAUNCH ON STARTUP</span><div className="hal-settings-control"><Toggle value={launchOnStartup} onChange={(nx) => { setLaunchOnStartup(nx); window.api?.setLaunchOnStartup?.(nx).catch(() => setLaunchOnStartup(!nx)) }} color="#22d3ee" /></div></div>)}
            {(m('TOKEN BUDGET') || m('FULL FEATURES') || m('BALANCED') || m('AGGRESSIVE SAVER')) && (<>
              <div className="hal-settings-row" style={{ marginBottom: 4, marginTop: 4 }}><span className="hal-settings-label" style={{ letterSpacing: '1.5px', opacity: 0.7, fontSize: 'calc(var(--hub-font, 10px) - 2px)' }}>TOKEN BUDGET</span></div>
              {subscriptionType !== 'unknown' && (<div className="hal-settings-row" style={{ marginBottom: 4 }}><span className="hal-settings-label" style={{ color: subscriptionType === 'subscription' ? '#4ade80' : '#f59e0b', fontSize: 'calc(var(--hub-font, 10px) - 2px)' }}>{subscriptionType === 'subscription' ? 'SUBSCRIPTION (UNLIMITED)' : 'API (PAY PER TOKEN)'}</span></div>)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {TOKEN_BUDGET_OPTIONS.map((opt) => (<button key={opt.id} onClick={() => handleTokenBudgetChange(opt.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px 10px', background: tokenBudget === opt.id ? 'rgba(34,211,238,0.1)' : 'transparent', border: '1px solid ' + (tokenBudget === opt.id ? '#22d3ee55' : 'var(--border-dim, #333)'), borderRadius: '4px', cursor: 'pointer', color: tokenBudget === opt.id ? '#22d3ee' : 'var(--text-dim)', textAlign: 'left', fontSize: 'calc(var(--hub-font, 10px) - 1px)', fontFamily: 'inherit', width: '100%' }}><span style={{ fontWeight: 600, fontSize: 'calc(var(--hub-font, 10px))' }}>{tokenBudget === opt.id ? '\u25CF ' : '\u25CB '}{opt.label}</span><span style={{ opacity: 0.6, marginTop: '2px' }}>{opt.description}</span></button>))}
              </div>
              {subscriptionType === 'api' && tokenBudget === 'full' && (<div style={{ marginTop: '6px', padding: '4px 8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '4px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', color: '#f59e0b' }}>TIP: API users can save ~30-50% with Balanced or Aggressive mode</div>)}
            </>)}
          </div>)}</>)}

        {/* 9. HIDDEN PROJECTS */}
        {onUnhide && sv(['HIDDEN PROJECTS']) && (<><SectionHeader label="HIDDEN PROJECTS" expanded={isEx(secHidden)} onToggle={() => setSecHidden(!secHidden)} />
          {isEx(secHidden) && (<div className="hal-settings-section-body">
            {hiddenPaths.length === 0 ? (<div className="hal-settings-row"><span className="hal-settings-label" style={{ color: 'var(--text-dim)' }}>(none)</span></div>) : (<div className="hidden-projects-list">{hiddenPaths.map((hp) => { const nm = hp.split(/[/\\]/).pop() || hp; return (<div key={hp} className="hidden-project-item"><span className="hidden-project-name" title={hp}>{nm}</span><button className="hal-settings-preview-btn" onClick={() => onUnhide(hp)} style={{ padding: '2px 8px', fontSize: 'calc(var(--hub-font, 10px) - 2px)', width: 'auto', color: '#4ade80', borderColor: '#4ade8055' }}>RESTORE</button></div>) })}</div>)}
          </div>)}</>)}

        {/* 10. DEMO MODE */}
        {demo && sv(['ENABLED','PROJECT CARDS','TERMINAL AREAS','MIN TABS','MAX TABS','VFX SPAWN FREQUENCY','DEMO TEXT','DEMO VOICE']) && (<><SectionHeader label="DEMO MODE" expanded={isEx(secDemo)} onToggle={() => setSecDemo(!secDemo)} />
          {isEx(secDemo) && (<div className="hal-settings-section-body">
            {m('ENABLED') && (<div className="hal-settings-row"><span className="hal-settings-label">ENABLED</span><div className="hal-settings-control"><Toggle value={demo.enabled} onChange={demo.setEnabled} color="#22d3ee" /></div></div>)}
            {demo.enabled && (<>
              {m('PROJECT CARDS') && <Slider label="PROJECT CARDS" min={5} max={100} step={1} value={demo.cardCount} onChange={(v) => demo.setCardCount(Math.round(v))} fmt={(v) => '' + Math.round(v)} w={28} accent="#22d3ee" />}
              {m('TERMINAL AREAS') && <Slider label="TERMINAL AREAS" min={1} max={4} step={1} value={demo.terminalCount} onChange={(v) => demo.setTerminalCount(Math.round(v))} fmt={(v) => '' + Math.round(v)} w={14} accent="#22d3ee" />}
              {m('MIN TABS') && <Slider label="MIN TABS" min={1} max={5} step={1} value={demo.tabsMin} onChange={(v) => { const rv = Math.round(v); demo.setTabsMin(rv); if (rv > demo.tabsMax) demo.setTabsMax(rv) }} fmt={(v) => '' + Math.round(v)} w={14} accent="#22d3ee" />}
              {m('MAX TABS') && <Slider label="MAX TABS" min={1} max={5} step={1} value={demo.tabsMax} onChange={(v) => { const rv = Math.round(v); demo.setTabsMax(rv); if (rv < demo.tabsMin) demo.setTabsMin(rv) }} fmt={(v) => '' + Math.round(v)} w={14} accent="#22d3ee" />}
              {m('VFX SPAWN FREQUENCY') && <Slider label="VFX SPAWN FREQ" min={0} max={30} step={1} value={demo.vfxFrequency} onChange={(v) => demo.setVfxFrequency(Math.round(v))} fmt={(v) => Math.round(v) === 0 ? 'OFF' : Math.round(v) + 's'} w={30} accent="#22d3ee" />}
              {m('DEMO TEXT') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}><span className="hal-settings-label">DEMO TEXT</span><input type="text" className="hal-settings-select" style={{ width: '100%', padding: '4px 6px', fontSize: 'calc(var(--hub-font, 10px) - 1px)' }} value={demo.demoText} onChange={(e) => demo.setDemoText(e.target.value)} /></div>)}
              {m('DEMO VOICE') && (<div className="hal-settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}><span className="hal-settings-label">DEMO VOICE</span><div style={{ display: 'flex', gap: 4, width: '100%' }}><select className="hal-settings-select" style={{ flex: 1 }} value={demo.demoVoice} onChange={(e) => demo.setDemoVoice(e.target.value as VoiceProfileId)}>{VOICE_PROFILES.filter((vp) => vp.id !== 'auto').map((vp) => <option key={vp.id} value={vp.id}>{vp.label}</option>)}</select><button className="hal-settings-preview-btn" onClick={() => { if (previewing) return; playOrGenerate(demo.demoText || 'Hello, this is a demo voice test.', demo.demoVoice, setPreviewing) }} disabled={!!previewing} title={previewing ? 'Playing...' : 'Play Demo Voice'}>{previewing ? '...' : '\u25B6'}</button></div></div>)}
            </>)}
          </div>)}</>)}
      </div>, document.body)}
  </div>)
}
