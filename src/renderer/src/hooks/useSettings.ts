import { useReducer, useCallback, useRef, useMemo } from 'react'

export const VOICE_PROFILES = [
  { id: 'auto', label: 'AUTO' },
  { id: 'butler', label: 'HAL' },
  { id: 'soft', label: 'HALLIE' },
] as const

export type VoiceProfileId = typeof VOICE_PROFILES[number]['id']

export const DOCK_POSITIONS = [
  { id: 'bottom', label: 'BOTTOM' },
  { id: 'right', label: 'RIGHT' },
  { id: 'left', label: 'LEFT' },
] as const

export type DockPosition = typeof DOCK_POSITIONS[number]['id']

// ── Sphere Style Picker (P4 enhancement) ──

export const SPHERE_STYLES = [
  { id: 'wireframe', label: 'WIREFRAME' },
  { id: 'hal-eye', label: 'HAL 9000 EYE' },
  { id: 'animated-core', label: 'ANIMATED CORE' },
  { id: 'pulse', label: 'PULSE RATE' },
  { id: 'corona', label: 'CORONA FLARE' },
  { id: 'particles', label: 'PARTICLE ERUPTION' },
  { id: 'colorshift', label: 'COLOR SHIFT' },
  { id: 'lightning', label: 'LIGHTNING ARCS' },
] as const

export type SphereStyleId = typeof SPHERE_STYLES[number]['id']

// ── Graphics Quality Presets (P14) ──

export const GRAPHICS_PRESETS = [
  { id: 'light', label: 'LIGHT' },
  { id: 'medium', label: 'MEDIUM' },
  { id: 'high', label: 'HIGH' },
] as const

export type GraphicsPresetId = typeof GRAPHICS_PRESETS[number]['id']

/** Read raw GPU renderer string from WebGL for display purposes. */
export function getGpuRendererName(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return 'Unknown GPU'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return 'Unknown GPU'
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)?.toString() ?? 'Unknown GPU'
  } catch {
    return 'Unknown GPU'
  }
}

/** Auto-detect a sensible default graphics preset based on WebGL renderer info. */
export function detectGraphicsPreset(): GraphicsPresetId {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return 'medium'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return 'medium'
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)?.toString().toLowerCase() ?? ''
    // High-end: RTX 3000+, RTX 4000+, RTX 5000+, RX 7000+, Arc A-series
    if (/rtx\s*(30[6-9]0|308\d|309\d|40[6-9]0|408\d|409\d|50[7-9]0|5090)/i.test(renderer)) return 'high'
    if (/rx\s*7[0-9]{3}/i.test(renderer)) return 'high'
    if (/arc\s*a7[0-9]/i.test(renderer)) return 'high'
    // Integrated / low-end: Intel HD/UHD, Intel Iris, AMD APU, Mali, Adreno
    if (/intel.*(hd|uhd|iris)|mali|adreno|llvmpipe|swiftshader/i.test(renderer)) return 'light'
    // Everything else: mid-range dedicated GPUs
    return 'medium'
  } catch {
    return 'medium'
  }
}

export interface CameraSettings {
  particleHideDist: number  // units from camera where particles fade (default 4)
  cameraDistance: number    // distance from sphere center (default 19)
  cameraAngle: number      // elevation angle in degrees above horizontal (default 32)
}

export const DEFAULT_CAMERA: CameraSettings = {
  particleHideDist: 4,
  cameraDistance: 19,
  cameraAngle: 32,
}

export const PARTICLE_DENSITY_LABELS = ['OFF', 'BARE', 'MINIMAL', 'VERY LOW', 'LOW', 'LOW-MED', 'MEDIUM', 'MED-HIGH', 'HIGH', 'HIGH+', 'VERY HIGH', 'ULTRA', 'ULTRA+', 'EXTREME', 'INSANE', 'MAX'] as const
export const PARTICLE_DENSITY_MULTIPLIERS = [0, 0.03, 0.08, 0.15, 0.25, 0.4, 0.6, 0.85, 1.0, 1.3, 1.7, 2.2, 2.8, 3.5, 4.5, 6.0] as const

// ── Personality Sliders (TARS System) ──

export interface PersonalitySettings {
  humor: number       // 0-100, default 50
  formality: number   // 0-100, default 50
  verbosity: number   // 0-100, default 50
  dramatic: number    // 0-100, default 25
}

export const DEFAULT_PERSONALITY: PersonalitySettings = {
  humor: 50,
  formality: 50,
  verbosity: 50,
  dramatic: 25,
}

export interface PersonalityPreset {
  name: string
  label: string
  values: PersonalitySettings
}

export const PERSONALITY_PRESETS: PersonalityPreset[] = [
  { name: 'default',  label: 'DEFAULT',  values: { humor: 50, formality: 50, verbosity: 50, dramatic: 25 } },
  { name: 'serious',  label: 'SERIOUS',  values: { humor: 10, formality: 80, verbosity: 60, dramatic: 10 } },
  { name: 'tars',     label: 'TARS',     values: { humor: 75, formality: 40, verbosity: 30, dramatic: 30 } },
  { name: 'movie',    label: 'MOVIE',    values: { humor: 30, formality: 50, verbosity: 50, dramatic: 90 } },
  { name: 'butler',   label: 'BUTLER',   values: { humor: 20, formality: 95, verbosity: 70, dramatic: 15 } },
  { name: 'chaos',    label: 'CHAOS',    values: { humor: 90, formality: 10, verbosity: 80, dramatic: 85 } },
]

// ── IDE options (U19) ──

export const IDE_OPTIONS = [
  { id: 'auto', label: 'AUTO-DETECT' },
  { id: 'vscode', label: 'VS CODE' },
  { id: 'cursor', label: 'CURSOR' },
  { id: 'webstorm', label: 'WEBSTORM' },
  { id: 'idea', label: 'INTELLIJ IDEA' },
  { id: 'fleet', label: 'FLEET' },
  { id: 'zed', label: 'ZED' },
  { id: 'sublime', label: 'SUBLIME TEXT' },
] as const

export type IdeOptionId = typeof IDE_OPTIONS[number]['id']

// ── X7: Terminal AI Model ──

export const TERMINAL_MODEL_OPTIONS = [
  { id: 'default', label: 'CLAUDE (DEFAULT)' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'codex', label: 'CODEX' },
  { id: 'ollama', label: 'OLLAMA (LOCAL)' },
  { id: 'custom', label: 'CUSTOM ENDPOINT' },
] as const

export type TerminalModelId = typeof TERMINAL_MODEL_OPTIONS[number]['id']

// ── U21: Token Budget ──

export type TokenBudgetId = 'full' | 'balanced' | 'aggressive'

export const TOKEN_BUDGET_OPTIONS = [
  { id: 'full' as const, label: 'FULL FEATURES', description: 'All features, no optimization' },
  { id: 'balanced' as const, label: 'BALANCED', description: 'Haiku subagents, 75% compaction' },
  { id: 'aggressive' as const, label: 'AGGRESSIVE SAVER', description: 'Haiku subagents, 65% compaction, minimal CLAUDE.md' },
] as const

// ── U23: Per-section devlog verbosity ──

export type DevlogVerbosity = 'off' | 'haiku' | 'limited' | 'full'

export const DEVLOG_SECTION_DEFS = [
  { key: 'conventions',      label: 'CONVENTIONS',            tokens: '~20-40' },
  { key: 'performance',      label: 'PERFORMANCE TIPS',       tokens: '~50' },
  { key: 'keyFiles',         label: 'KEY FILES',              tokens: '~30' },
  { key: 'profiling',        label: 'PROFILING RULES',        tokens: '~200' },
  { key: 'hooksSetup',       label: 'HOOKS SETUP TIPS',       tokens: '~40' },
  { key: 'sessionStart',     label: 'SESSION START PROTOCOL', tokens: '~60' },
] as const

export type DevlogSectionKey = typeof DEVLOG_SECTION_DEFS[number]['key']
export type DevlogSections = Record<DevlogSectionKey, DevlogVerbosity>

export const DEFAULT_DEVLOG_SECTIONS: DevlogSections = {
  conventions: 'full',
  performance: 'full',
  keyFiles: 'full',
  profiling: 'full',
  hooksSetup: 'full',
  sessionStart: 'full',
}

/** Pre-configure devlog sections when token budget preset changes */
export function devlogSectionsForBudget(budget: TokenBudgetId): DevlogSections {
  switch (budget) {
    case 'full':
      return { conventions: 'full', performance: 'full', keyFiles: 'full', profiling: 'full', hooksSetup: 'full', sessionStart: 'full' }
    case 'balanced':
      return { conventions: 'limited', performance: 'limited', keyFiles: 'full', profiling: 'haiku', hooksSetup: 'limited', sessionStart: 'limited' }
    case 'aggressive':
      return { conventions: 'off', performance: 'haiku', keyFiles: 'haiku', profiling: 'off', hooksSetup: 'off', sessionStart: 'off' }
  }
}

export interface SettingsState {
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  screenOpacity: number
  camera: CameraSettings
  cameraTweaking: boolean
  particleDensity: number
  renderQuality: number
  rendererId: string
  layoutId: string
  threeTheme: string
  shipVfxEnabled: boolean
  sphereStyle: SphereStyleId
  voiceReactionIntensity: number
  personality: PersonalitySettings
  defaultIde: IdeOptionId
  activityFeedback: boolean
  defaultTerminalModel: TerminalModelId
  introAnimation: boolean
  graphicsPreset: GraphicsPresetId
  bloomEnabled: boolean
  chromaticAberrationEnabled: boolean
  floorLinesEnabled: boolean
  groupTrailsEnabled: boolean
  autoRotateEnabled: boolean
  autoRotateSpeed: number
  cardsPerSector: number
  devlogSections: DevlogSections
  // Theme parameter overrides — -1 means "use theme default"
  bloomIntensityOverride: number
  gridOpacityOverride: number
  particleBrightnessOverride: number
  vignetteOverride: number
  updateHubFont: (size: number) => void
  updateTermFont: (size: number) => void
  updateVoiceOut: (enabled: boolean) => void
  updateVoiceProfile: (id: VoiceProfileId) => void
  updateDockPosition: (pos: DockPosition) => void
  updateScreenOpacity: (opacity: number) => void
  updateCamera: (cam: CameraSettings) => void
  updateCameraTweaking: (on: boolean) => void
  resetCamera: () => void
  updateParticleDensity: (v: number) => void
  updateRenderQuality: (v: number) => void
  updateRenderer: (id: string) => void
  updateLayout: (id: string) => void
  updateThreeTheme: (id: string) => void
  updateShipVfxEnabled: (enabled: boolean) => void
  updateSphereStyle: (style: SphereStyleId) => void
  updateVoiceReactionIntensity: (v: number) => void
  updatePersonality: (key: keyof PersonalitySettings, value: number) => void
  applyPersonalityPreset: (presetName: string) => void
  updateDefaultIde: (id: IdeOptionId) => void
  updateActivityFeedback: (enabled: boolean) => void
  updateDefaultTerminalModel: (id: TerminalModelId) => void
  updateIntroAnimation: (enabled: boolean) => void
  updateGraphicsPreset: (preset: GraphicsPresetId) => void
  updateBloomEnabled: (enabled: boolean) => void
  updateChromaticAberrationEnabled: (enabled: boolean) => void
  updateFloorLinesEnabled: (enabled: boolean) => void
  updateGroupTrailsEnabled: (enabled: boolean) => void
  updateAutoRotateEnabled: (enabled: boolean) => void
  updateAutoRotateSpeed: (speed: number) => void
  updateCardsPerSector: (count: number) => void
  updateDevlogSection: (key: DevlogSectionKey, value: DevlogVerbosity) => void
  setAllDevlogSections: (value: DevlogVerbosity) => void
  // Theme parameter overrides
  updateBloomIntensityOverride: (v: number) => void
  updateGridOpacityOverride: (v: number) => void
  updateParticleBrightnessOverride: (v: number) => void
  updateVignetteOverride: (v: number) => void
}

// ── Reducer: single state object replaces 21 separate useState calls ──

/** Data-only slice of SettingsState (no callbacks) */
interface SettingsData {
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  screenOpacity: number
  camera: CameraSettings
  cameraTweaking: boolean
  particleDensity: number
  renderQuality: number
  rendererId: string
  layoutId: string
  threeTheme: string
  shipVfxEnabled: boolean
  sphereStyle: SphereStyleId
  voiceReactionIntensity: number
  personality: PersonalitySettings
  defaultIde: IdeOptionId
  activityFeedback: boolean
  defaultTerminalModel: TerminalModelId
  introAnimation: boolean
  graphicsPreset: GraphicsPresetId
  bloomEnabled: boolean
  chromaticAberrationEnabled: boolean
  floorLinesEnabled: boolean
  groupTrailsEnabled: boolean
  autoRotateEnabled: boolean
  autoRotateSpeed: number
  cardsPerSector: number
  devlogSections: DevlogSections
  // Theme parameter overrides — -1 means "use theme default"
  bloomIntensityOverride: number
  gridOpacityOverride: number
  particleBrightnessOverride: number
  vignetteOverride: number
}

type SettingsAction =
  | { type: 'SET_HUB_FONT'; value: number }
  | { type: 'SET_TERM_FONT'; value: number }
  | { type: 'SET_VOICE_OUT'; value: boolean }
  | { type: 'SET_VOICE_PROFILE'; value: VoiceProfileId }
  | { type: 'SET_DOCK_POSITION'; value: DockPosition }
  | { type: 'SET_SCREEN_OPACITY'; value: number }
  | { type: 'SET_CAMERA'; value: CameraSettings }
  | { type: 'SET_CAMERA_TWEAKING'; value: boolean }
  | { type: 'SET_PARTICLE_DENSITY'; value: number }
  | { type: 'SET_RENDER_QUALITY'; value: number }
  | { type: 'SET_RENDERER'; value: string }
  | { type: 'SET_LAYOUT'; value: string }
  | { type: 'SET_THREE_THEME'; value: string }
  | { type: 'SET_SHIP_VFX'; value: boolean }
  | { type: 'SET_SPHERE_STYLE'; value: SphereStyleId }
  | { type: 'SET_VOICE_REACTION_INTENSITY'; value: number }
  | { type: 'SET_PERSONALITY'; key: keyof PersonalitySettings; value: number }
  | { type: 'SET_PERSONALITY_PRESET'; value: PersonalitySettings }
  | { type: 'SET_DEFAULT_IDE'; value: IdeOptionId }
  | { type: 'SET_ACTIVITY_FEEDBACK'; value: boolean }
  | { type: 'SET_DEFAULT_TERMINAL_MODEL'; value: TerminalModelId }
  | { type: 'SET_INTRO_ANIMATION'; value: boolean }
  | { type: 'SET_GRAPHICS_PRESET'; value: GraphicsPresetId }
  | { type: 'SET_BLOOM_ENABLED'; value: boolean }
  | { type: 'SET_CHROMATIC_ABERRATION_ENABLED'; value: boolean }
  | { type: 'SET_FLOOR_LINES_ENABLED'; value: boolean }
  | { type: 'SET_GROUP_TRAILS_ENABLED'; value: boolean }
  | { type: 'SET_AUTO_ROTATE_ENABLED'; value: boolean }
  | { type: 'SET_AUTO_ROTATE_SPEED'; value: number }
  | { type: 'SET_CARDS_PER_SECTOR'; value: number }
  | { type: 'SET_DEVLOG_SECTION'; key: DevlogSectionKey; value: DevlogVerbosity }
  | { type: 'SET_ALL_DEVLOG_SECTIONS'; value: DevlogVerbosity }
  | { type: 'SET_BLOOM_INTENSITY_OVERRIDE'; value: number }
  | { type: 'SET_GRID_OPACITY_OVERRIDE'; value: number }
  | { type: 'SET_PARTICLE_BRIGHTNESS_OVERRIDE'; value: number }
  | { type: 'SET_VIGNETTE_OVERRIDE'; value: number }

function settingsReducer(state: SettingsData, action: SettingsAction): SettingsData {
  switch (action.type) {
    case 'SET_HUB_FONT': return state.hubFontSize === action.value ? state : { ...state, hubFontSize: action.value }
    case 'SET_TERM_FONT': return state.termFontSize === action.value ? state : { ...state, termFontSize: action.value }
    case 'SET_VOICE_OUT': return state.voiceOut === action.value ? state : { ...state, voiceOut: action.value }
    case 'SET_VOICE_PROFILE': return state.voiceProfile === action.value ? state : { ...state, voiceProfile: action.value }
    case 'SET_DOCK_POSITION': return state.dockPosition === action.value ? state : { ...state, dockPosition: action.value }
    case 'SET_SCREEN_OPACITY': return state.screenOpacity === action.value ? state : { ...state, screenOpacity: action.value }
    case 'SET_CAMERA': return { ...state, camera: action.value }
    case 'SET_CAMERA_TWEAKING': return state.cameraTweaking === action.value ? state : { ...state, cameraTweaking: action.value }
    case 'SET_PARTICLE_DENSITY': return state.particleDensity === action.value ? state : { ...state, particleDensity: action.value }
    case 'SET_RENDER_QUALITY': return state.renderQuality === action.value ? state : { ...state, renderQuality: action.value }
    case 'SET_RENDERER': return state.rendererId === action.value ? state : { ...state, rendererId: action.value }
    case 'SET_LAYOUT': return state.layoutId === action.value ? state : { ...state, layoutId: action.value }
    case 'SET_THREE_THEME': return state.threeTheme === action.value ? state : { ...state, threeTheme: action.value }
    case 'SET_SHIP_VFX': return state.shipVfxEnabled === action.value ? state : { ...state, shipVfxEnabled: action.value }
    case 'SET_SPHERE_STYLE': return state.sphereStyle === action.value ? state : { ...state, sphereStyle: action.value }
    case 'SET_VOICE_REACTION_INTENSITY': return state.voiceReactionIntensity === action.value ? state : { ...state, voiceReactionIntensity: action.value }
    case 'SET_PERSONALITY': {
      if (state.personality[action.key] === action.value) return state
      return { ...state, personality: { ...state.personality, [action.key]: action.value } }
    }
    case 'SET_PERSONALITY_PRESET': return { ...state, personality: action.value }
    case 'SET_DEFAULT_IDE': return state.defaultIde === action.value ? state : { ...state, defaultIde: action.value }
    case 'SET_ACTIVITY_FEEDBACK': return state.activityFeedback === action.value ? state : { ...state, activityFeedback: action.value }
    case 'SET_DEFAULT_TERMINAL_MODEL': return state.defaultTerminalModel === action.value ? state : { ...state, defaultTerminalModel: action.value }
    case 'SET_INTRO_ANIMATION': return state.introAnimation === action.value ? state : { ...state, introAnimation: action.value }
    case 'SET_GRAPHICS_PRESET': return state.graphicsPreset === action.value ? state : { ...state, graphicsPreset: action.value }
    case 'SET_BLOOM_ENABLED': return state.bloomEnabled === action.value ? state : { ...state, bloomEnabled: action.value }
    case 'SET_CHROMATIC_ABERRATION_ENABLED': return state.chromaticAberrationEnabled === action.value ? state : { ...state, chromaticAberrationEnabled: action.value }
    case 'SET_FLOOR_LINES_ENABLED': return state.floorLinesEnabled === action.value ? state : { ...state, floorLinesEnabled: action.value }
    case 'SET_GROUP_TRAILS_ENABLED': return state.groupTrailsEnabled === action.value ? state : { ...state, groupTrailsEnabled: action.value }
    case 'SET_AUTO_ROTATE_ENABLED': return state.autoRotateEnabled === action.value ? state : { ...state, autoRotateEnabled: action.value }
    case 'SET_AUTO_ROTATE_SPEED': return state.autoRotateSpeed === action.value ? state : { ...state, autoRotateSpeed: action.value }
    case 'SET_CARDS_PER_SECTOR': return state.cardsPerSector === action.value ? state : { ...state, cardsPerSector: action.value }
    case 'SET_DEVLOG_SECTION': {
      if (state.devlogSections[action.key] === action.value) return state
      return { ...state, devlogSections: { ...state.devlogSections, [action.key]: action.value } }
    }
    case 'SET_ALL_DEVLOG_SECTIONS': {
      const next: DevlogSections = {} as DevlogSections
      for (const k of Object.keys(state.devlogSections) as DevlogSectionKey[]) next[k] = action.value
      return { ...state, devlogSections: next }
    }
    case 'SET_BLOOM_INTENSITY_OVERRIDE': return state.bloomIntensityOverride === action.value ? state : { ...state, bloomIntensityOverride: action.value }
    case 'SET_GRID_OPACITY_OVERRIDE': return state.gridOpacityOverride === action.value ? state : { ...state, gridOpacityOverride: action.value }
    case 'SET_PARTICLE_BRIGHTNESS_OVERRIDE': return state.particleBrightnessOverride === action.value ? state : { ...state, particleBrightnessOverride: action.value }
    case 'SET_VIGNETTE_OVERRIDE': return state.vignetteOverride === action.value ? state : { ...state, vignetteOverride: action.value }
  }
}

/** Read initial values from localStorage (runs once) */
function loadInitialState(): SettingsData {
  // One-time migration: clear stale debugging values from session 3 line investigations
  if (!localStorage.getItem('hal-o-settings-v4')) {
    localStorage.removeItem('hal-o-bloom')
    localStorage.removeItem('hal-o-chromatic-aberration')
    localStorage.removeItem('hal-o-floor-lines')
    localStorage.removeItem('hal-o-group-trails')
    localStorage.removeItem('hal-o-graphics-preset')
    localStorage.setItem('hal-o-settings-v4', '1')
  }
  // ── particle density migration ──
  let particleDensity = 8
  const storedPD = localStorage.getItem('hal-o-particle-density')
  if (storedPD !== null) {
    const v = parseInt(storedPD)
    // Migrate old 0-4 scale -> 0-10 scale (v2) -> 0-15 scale (v3)
    if (v >= 0 && v <= 4 && localStorage.getItem('hal-o-particle-density-v2') === null) {
      const V1_TO_V3 = [0, 3, 8, 10, 14]
      const migrated = V1_TO_V3[v] ?? 8
      localStorage.setItem('hal-o-particle-density', String(migrated))
      localStorage.setItem('hal-o-particle-density-v2', '1')
      localStorage.setItem('hal-o-particle-density-v3', '1')
      particleDensity = migrated
    } else if (v >= 0 && v <= 10 && localStorage.getItem('hal-o-particle-density-v3') === null) {
      const V2_TO_V3 = [0, 3, 4, 4, 6, 8, 10, 11, 12, 13, 14]
      const migrated = V2_TO_V3[v] ?? 8
      localStorage.setItem('hal-o-particle-density', String(migrated))
      localStorage.setItem('hal-o-particle-density-v3', '1')
      particleDensity = migrated
    } else {
      particleDensity = v
    }
  }

  // ── sphere style migration ──
  let sphereStyle: SphereStyleId = 'wireframe'
  const legacyVideoSphere = localStorage.getItem('hal-o-video-sphere')
  if (legacyVideoSphere === 'true') {
    localStorage.setItem('hal-o-sphere-style', 'hal-eye')
    localStorage.removeItem('hal-o-video-sphere')
    sphereStyle = 'hal-eye'
  } else {
    sphereStyle = (localStorage.getItem('hal-o-sphere-style') as SphereStyleId) || 'wireframe'
  }

  // ── camera ──
  let camera = DEFAULT_CAMERA
  try {
    const c = localStorage.getItem('hal-o-camera')
    if (c) camera = JSON.parse(c)
  } catch { /* use default */ }

  // ── personality ──
  let personality = DEFAULT_PERSONALITY
  try {
    const stored = localStorage.getItem('hal-o-personality')
    if (stored) personality = { ...DEFAULT_PERSONALITY, ...JSON.parse(stored) }
  } catch { /* use default */ }

  // ── render quality ──
  const storedRQ = localStorage.getItem('hal-o-render-quality')
  const renderQuality = storedRQ !== null ? parseFloat(storedRQ) : Math.min(window.devicePixelRatio, 2)

  // ── voice reaction intensity ──
  const storedVRI = localStorage.getItem('hal-o-voice-reaction-intensity')
  const voiceReactionIntensity = storedVRI !== null ? parseFloat(storedVRI) : 5.0

  // ── devlog sections (U23) ──
  let devlogSections = DEFAULT_DEVLOG_SECTIONS
  try {
    const stored = localStorage.getItem('hal-o-devlog-sections')
    if (stored) devlogSections = { ...DEFAULT_DEVLOG_SECTIONS, ...JSON.parse(stored) }
  } catch { /* use default */ }

  // ── theme parameter overrides ──
  const storedBIO = localStorage.getItem('hal-o-bloom-intensity-override')
  const bloomIntensityOverride = storedBIO !== null ? parseFloat(storedBIO) : -1
  const storedGOO = localStorage.getItem('hal-o-grid-opacity-override')
  const gridOpacityOverride = storedGOO !== null ? parseFloat(storedGOO) : -1
  const storedPBO = localStorage.getItem('hal-o-particle-brightness-override')
  const particleBrightnessOverride = storedPBO !== null ? parseFloat(storedPBO) : -1
  const storedVO = localStorage.getItem('hal-o-vignette-override')
  const vignetteOverride = storedVO !== null ? parseFloat(storedVO) : -1

  return {
    hubFontSize: parseInt(localStorage.getItem('hal-o-hub-font') || '10'),
    termFontSize: parseInt(localStorage.getItem('hal-o-term-font') || '13'),
    voiceOut: localStorage.getItem('hal-o-voice-out') === 'true',
    voiceProfile: (localStorage.getItem('hal-o-voice-profile') as VoiceProfileId) || 'auto',
    dockPosition: (localStorage.getItem('hal-o-dock') as DockPosition) || 'bottom',
    screenOpacity: parseFloat(localStorage.getItem('hal-o-screen-opacity') || '1'),
    camera,
    cameraTweaking: localStorage.getItem('hal-o-camera-tweaking') === 'true',
    particleDensity,
    renderQuality,
    rendererId: localStorage.getItem('hal-o-renderer') || 'classic',
    layoutId: localStorage.getItem('hal-o-layout') || 'dual-arc',
    threeTheme: localStorage.getItem('hal-o-3d-theme') || 'tactical',
    shipVfxEnabled: localStorage.getItem('hal-o-ship-vfx') !== 'false',
    sphereStyle,
    voiceReactionIntensity,
    personality,
    defaultIde: (localStorage.getItem('hal-o-default-ide') as IdeOptionId) || 'auto',
    activityFeedback: localStorage.getItem('hal-o-activity-feedback') !== 'false',
    defaultTerminalModel: (localStorage.getItem('hal-o-terminal-model') as TerminalModelId) || 'default',
    introAnimation: localStorage.getItem('hal-o-intro-animation') !== 'false',
    graphicsPreset: (localStorage.getItem('hal-o-graphics-preset') as GraphicsPresetId) || detectGraphicsPreset(),
    bloomEnabled: localStorage.getItem('hal-o-bloom') !== 'false',
    chromaticAberrationEnabled: localStorage.getItem('hal-o-chromatic-aberration') === 'true',
    floorLinesEnabled: localStorage.getItem('hal-o-floor-lines') !== 'false',
    groupTrailsEnabled: localStorage.getItem('hal-o-group-trails') === 'true',
    autoRotateEnabled: localStorage.getItem('hal-o-auto-rotate') !== 'false',
    autoRotateSpeed: parseFloat(localStorage.getItem('hal-o-auto-rotate-speed') || '0.12'),
    cardsPerSector: parseInt(localStorage.getItem('hal-o-cards-per-sector') || '16'),
    devlogSections,
    bloomIntensityOverride,
    gridOpacityOverride,
    particleBrightnessOverride,
    vignetteOverride,
  }
}

export function useSettings(): SettingsState {
  const [state, dispatch] = useReducer(settingsReducer, undefined, loadInitialState)

  // Debounced personality file write (150ms) — avoids spamming disk during slider drag
  const personalityWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writePersonalityFile = useCallback((p: PersonalitySettings, presetName?: string) => {
    if (personalityWriteTimer.current) clearTimeout(personalityWriteTimer.current)
    personalityWriteTimer.current = setTimeout(() => {
      const matchedPreset = presetName || PERSONALITY_PRESETS.find(
        pr => pr.values.humor === p.humor && pr.values.formality === p.formality &&
              pr.values.verbosity === p.verbosity && pr.values.dramatic === p.dramatic
      )?.name || null
      window.api?.writePersonality?.({
        ...p,
        preset: matchedPreset,
        updated: new Date().toISOString(),
      }).catch(() => {})
    }, 150)
  }, [])

  // ── Stable update callbacks (dispatch + localStorage in one call) ──

  const updateHubFont = useCallback((size: number) => {
    dispatch({ type: 'SET_HUB_FONT', value: size })
    localStorage.setItem('hal-o-hub-font', String(size))
  }, [])

  const updateTermFont = useCallback((size: number) => {
    dispatch({ type: 'SET_TERM_FONT', value: size })
    localStorage.setItem('hal-o-term-font', String(size))
  }, [])

  const updateVoiceOut = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_VOICE_OUT', value: enabled })
    localStorage.setItem('hal-o-voice-out', String(enabled))
  }, [])

  const updateVoiceProfile = useCallback((id: VoiceProfileId) => {
    dispatch({ type: 'SET_VOICE_PROFILE', value: id })
    localStorage.setItem('hal-o-voice-profile', id)
  }, [])

  const updateDockPosition = useCallback((pos: DockPosition) => {
    dispatch({ type: 'SET_DOCK_POSITION', value: pos })
    localStorage.setItem('hal-o-dock', pos)
  }, [])

  const updateScreenOpacity = useCallback((opacity: number) => {
    dispatch({ type: 'SET_SCREEN_OPACITY', value: opacity })
    localStorage.setItem('hal-o-screen-opacity', String(opacity))
  }, [])

  const updateCamera = useCallback((cam: CameraSettings) => {
    dispatch({ type: 'SET_CAMERA', value: cam })
    localStorage.setItem('hal-o-camera', JSON.stringify(cam))
  }, [])

  const updateCameraTweaking = useCallback((on: boolean) => {
    dispatch({ type: 'SET_CAMERA_TWEAKING', value: on })
    localStorage.setItem('hal-o-camera-tweaking', String(on))
  }, [])

  const resetCamera = useCallback(() => {
    dispatch({ type: 'SET_CAMERA', value: DEFAULT_CAMERA })
    localStorage.setItem('hal-o-camera', JSON.stringify(DEFAULT_CAMERA))
  }, [])

  const updateParticleDensity = useCallback((v: number) => {
    dispatch({ type: 'SET_PARTICLE_DENSITY', value: v })
    localStorage.setItem('hal-o-particle-density', String(v))
  }, [])

  const updateRenderQuality = useCallback((v: number) => {
    dispatch({ type: 'SET_RENDER_QUALITY', value: v })
    localStorage.setItem('hal-o-render-quality', String(v))
  }, [])

  const updateRenderer = useCallback((id: string) => {
    dispatch({ type: 'SET_RENDERER', value: id })
    localStorage.setItem('hal-o-renderer', id)
  }, [])

  const updateLayout = useCallback((id: string) => {
    dispatch({ type: 'SET_LAYOUT', value: id })
    localStorage.setItem('hal-o-layout', id)
  }, [])

  const updateThreeTheme = useCallback((id: string) => {
    dispatch({ type: 'SET_THREE_THEME', value: id })
    localStorage.setItem('hal-o-3d-theme', id)
  }, [])

  const updateShipVfxEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_SHIP_VFX', value: enabled })
    localStorage.setItem('hal-o-ship-vfx', String(enabled))
  }, [])

  const updateSphereStyle = useCallback((style: SphereStyleId) => {
    dispatch({ type: 'SET_SPHERE_STYLE', value: style })
    localStorage.setItem('hal-o-sphere-style', style)
  }, [])

  const updateVoiceReactionIntensity = useCallback((v: number) => {
    dispatch({ type: 'SET_VOICE_REACTION_INTENSITY', value: v })
    localStorage.setItem('hal-o-voice-reaction-intensity', String(v))
  }, [])

  const updateDefaultIde = useCallback((id: IdeOptionId) => {
    dispatch({ type: 'SET_DEFAULT_IDE', value: id })
    localStorage.setItem('hal-o-default-ide', id)
  }, [])

  const updateActivityFeedback = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_ACTIVITY_FEEDBACK', value: enabled })
    localStorage.setItem('hal-o-activity-feedback', String(enabled))
  }, [])

  const updateDefaultTerminalModel = useCallback((id: TerminalModelId) => {
    dispatch({ type: 'SET_DEFAULT_TERMINAL_MODEL', value: id })
    localStorage.setItem('hal-o-terminal-model', id)
  }, [])

  const updateIntroAnimation = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_INTRO_ANIMATION', value: enabled })
    localStorage.setItem('hal-o-intro-animation', String(enabled))
  }, [])

  const updateGraphicsPreset = useCallback((preset: GraphicsPresetId) => {
    dispatch({ type: 'SET_GRAPHICS_PRESET', value: preset })
    localStorage.setItem('hal-o-graphics-preset', preset)
    if (preset === 'light') {
      dispatch({ type: 'SET_BLOOM_ENABLED', value: false }); localStorage.setItem('hal-o-bloom', 'false')
      dispatch({ type: 'SET_CHROMATIC_ABERRATION_ENABLED', value: false }); localStorage.setItem('hal-o-chromatic-aberration', 'false')
      dispatch({ type: 'SET_FLOOR_LINES_ENABLED', value: false }); localStorage.setItem('hal-o-floor-lines', 'false')
      const capped = Math.min(window.devicePixelRatio, 1.5)
      dispatch({ type: 'SET_RENDER_QUALITY', value: capped }); localStorage.setItem('hal-o-render-quality', String(capped))
      dispatch({ type: 'SET_PARTICLE_DENSITY', value: 4 }); localStorage.setItem('hal-o-particle-density', '4')
    } else if (preset === 'medium') {
      dispatch({ type: 'SET_BLOOM_ENABLED', value: true }); localStorage.setItem('hal-o-bloom', 'true')
      dispatch({ type: 'SET_CHROMATIC_ABERRATION_ENABLED', value: false }); localStorage.setItem('hal-o-chromatic-aberration', 'false')
      dispatch({ type: 'SET_FLOOR_LINES_ENABLED', value: false }); localStorage.setItem('hal-o-floor-lines', 'false')
      const normal = Math.min(window.devicePixelRatio, 2)
      dispatch({ type: 'SET_RENDER_QUALITY', value: normal }); localStorage.setItem('hal-o-render-quality', String(normal))
      dispatch({ type: 'SET_PARTICLE_DENSITY', value: 8 }); localStorage.setItem('hal-o-particle-density', '8')
    } else if (preset === 'high') {
      dispatch({ type: 'SET_BLOOM_ENABLED', value: true }); localStorage.setItem('hal-o-bloom', 'true')
      dispatch({ type: 'SET_CHROMATIC_ABERRATION_ENABLED', value: true }); localStorage.setItem('hal-o-chromatic-aberration', 'true')
      dispatch({ type: 'SET_FLOOR_LINES_ENABLED', value: true }); localStorage.setItem('hal-o-floor-lines', 'true')
      dispatch({ type: 'SET_RENDER_QUALITY', value: window.devicePixelRatio }); localStorage.setItem('hal-o-render-quality', String(window.devicePixelRatio))
      dispatch({ type: 'SET_PARTICLE_DENSITY', value: 10 }); localStorage.setItem('hal-o-particle-density', '10')
    }
  }, [])

  const updateBloomEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_BLOOM_ENABLED', value: enabled })
    localStorage.setItem('hal-o-bloom', String(enabled))
  }, [])

  const updateChromaticAberrationEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_CHROMATIC_ABERRATION_ENABLED', value: enabled })
    localStorage.setItem('hal-o-chromatic-aberration', String(enabled))
  }, [])

  const updateFloorLinesEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_FLOOR_LINES_ENABLED', value: enabled })
    localStorage.setItem('hal-o-floor-lines', String(enabled))
  }, [])

  const updateGroupTrailsEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_GROUP_TRAILS_ENABLED', value: enabled })
    localStorage.setItem('hal-o-group-trails', String(enabled))
  }, [])

  const updateAutoRotateEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_AUTO_ROTATE_ENABLED', value: enabled })
    localStorage.setItem('hal-o-auto-rotate', String(enabled))
  }, [])

  const updateAutoRotateSpeed = useCallback((speed: number) => {
    dispatch({ type: 'SET_AUTO_ROTATE_SPEED', value: speed })
    localStorage.setItem('hal-o-auto-rotate-speed', String(speed))
  }, [])

  const updateCardsPerSector = useCallback((count: number) => {
    const clamped = Math.max(8, Math.min(24, count))
    dispatch({ type: 'SET_CARDS_PER_SECTOR', value: clamped })
    localStorage.setItem('hal-o-cards-per-sector', String(clamped))
  }, [])

  const updateBloomIntensityOverride = useCallback((v: number) => {
    dispatch({ type: 'SET_BLOOM_INTENSITY_OVERRIDE', value: v })
    if (v === -1) localStorage.removeItem('hal-o-bloom-intensity-override')
    else localStorage.setItem('hal-o-bloom-intensity-override', String(v))
  }, [])

  const updateGridOpacityOverride = useCallback((v: number) => {
    dispatch({ type: 'SET_GRID_OPACITY_OVERRIDE', value: v })
    if (v === -1) localStorage.removeItem('hal-o-grid-opacity-override')
    else localStorage.setItem('hal-o-grid-opacity-override', String(v))
  }, [])

  const updateParticleBrightnessOverride = useCallback((v: number) => {
    dispatch({ type: 'SET_PARTICLE_BRIGHTNESS_OVERRIDE', value: v })
    if (v === -1) localStorage.removeItem('hal-o-particle-brightness-override')
    else localStorage.setItem('hal-o-particle-brightness-override', String(v))
  }, [])

  const updateVignetteOverride = useCallback((v: number) => {
    dispatch({ type: 'SET_VIGNETTE_OVERRIDE', value: v })
    if (v === -1) localStorage.removeItem('hal-o-vignette-override')
    else localStorage.setItem('hal-o-vignette-override', String(v))
  }, [])

  const updateDevlogSection = useCallback((key: DevlogSectionKey, value: DevlogVerbosity) => {
    dispatch({ type: 'SET_DEVLOG_SECTION', key, value })
    const next = { ...state.devlogSections, [key]: value }
    localStorage.setItem('hal-o-devlog-sections', JSON.stringify(next))
  }, [state.devlogSections])

  const setAllDevlogSections = useCallback((value: DevlogVerbosity) => {
    dispatch({ type: 'SET_ALL_DEVLOG_SECTIONS', value })
    const next: DevlogSections = {} as DevlogSections
    for (const k of Object.keys(state.devlogSections) as DevlogSectionKey[]) next[k] = value
    localStorage.setItem('hal-o-devlog-sections', JSON.stringify(next))
  }, [state.devlogSections])

  const updatePersonality = useCallback((key: keyof PersonalitySettings, value: number) => {
    dispatch({ type: 'SET_PERSONALITY', key, value })
    // We need to read the latest state for localStorage + file write.
    // The reducer handles immutability; we compute the new value here too for side effects.
    const next = { ...state.personality, [key]: value }
    localStorage.setItem('hal-o-personality', JSON.stringify(next))
    writePersonalityFile(next)
  }, [state.personality, writePersonalityFile])

  const applyPersonalityPreset = useCallback((presetName: string) => {
    const preset = PERSONALITY_PRESETS.find(p => p.name === presetName)
    if (!preset) return
    dispatch({ type: 'SET_PERSONALITY_PRESET', value: preset.values })
    localStorage.setItem('hal-o-personality', JSON.stringify(preset.values))
    writePersonalityFile(preset.values, presetName)
  }, [writePersonalityFile])

  // Build the return object with stable callback references via useMemo.
  // The data fields come from the single reducer state; callbacks are stable (useCallback with []).
  return useMemo(() => ({
    // ── data ──
    hubFontSize: state.hubFontSize,
    termFontSize: state.termFontSize,
    voiceOut: state.voiceOut,
    voiceProfile: state.voiceProfile,
    dockPosition: state.dockPosition,
    screenOpacity: state.screenOpacity,
    camera: state.camera,
    cameraTweaking: state.cameraTweaking,
    particleDensity: state.particleDensity,
    renderQuality: state.renderQuality,
    rendererId: state.rendererId,
    layoutId: state.layoutId,
    threeTheme: state.threeTheme,
    shipVfxEnabled: state.shipVfxEnabled,
    sphereStyle: state.sphereStyle,
    voiceReactionIntensity: state.voiceReactionIntensity,
    personality: state.personality,
    defaultIde: state.defaultIde,
    activityFeedback: state.activityFeedback,
    defaultTerminalModel: state.defaultTerminalModel,
    introAnimation: state.introAnimation,
    graphicsPreset: state.graphicsPreset,
    bloomEnabled: state.bloomEnabled,
    chromaticAberrationEnabled: state.chromaticAberrationEnabled,
    floorLinesEnabled: state.floorLinesEnabled,
    groupTrailsEnabled: state.groupTrailsEnabled,
    autoRotateEnabled: state.autoRotateEnabled,
    autoRotateSpeed: state.autoRotateSpeed,
    cardsPerSector: state.cardsPerSector,
    devlogSections: state.devlogSections,
    bloomIntensityOverride: state.bloomIntensityOverride,
    gridOpacityOverride: state.gridOpacityOverride,
    particleBrightnessOverride: state.particleBrightnessOverride,
    vignetteOverride: state.vignetteOverride,
    // ── callbacks ──
    updateHubFont,
    updateTermFont,
    updateVoiceOut,
    updateVoiceProfile,
    updateDockPosition,
    updateScreenOpacity,
    updateCamera,
    updateCameraTweaking,
    resetCamera,
    updateParticleDensity,
    updateRenderQuality,
    updateRenderer,
    updateLayout,
    updateThreeTheme,
    updateShipVfxEnabled,
    updateSphereStyle,
    updateVoiceReactionIntensity,
    updatePersonality,
    applyPersonalityPreset,
    updateDefaultIde,
    updateActivityFeedback,
    updateDefaultTerminalModel,
    updateIntroAnimation,
    updateGraphicsPreset,
    updateBloomEnabled,
    updateChromaticAberrationEnabled,
    updateFloorLinesEnabled,
    updateGroupTrailsEnabled,
    updateAutoRotateEnabled,
    updateAutoRotateSpeed,
    updateCardsPerSector,
    updateDevlogSection,
    setAllDevlogSections,
    updateBloomIntensityOverride,
    updateGridOpacityOverride,
    updateParticleBrightnessOverride,
    updateVignetteOverride,
  }), [
    state,
    updateHubFont, updateTermFont, updateVoiceOut, updateVoiceProfile,
    updateDockPosition, updateScreenOpacity, updateCamera, updateCameraTweaking,
    resetCamera, updateParticleDensity, updateRenderQuality, updateRenderer,
    updateLayout, updateThreeTheme, updateShipVfxEnabled, updateSphereStyle,
    updateVoiceReactionIntensity, updatePersonality, applyPersonalityPreset,
    updateDefaultIde, updateActivityFeedback, updateDefaultTerminalModel,
    updateIntroAnimation, updateGraphicsPreset, updateBloomEnabled, updateChromaticAberrationEnabled,
    updateFloorLinesEnabled, updateGroupTrailsEnabled,
    updateAutoRotateEnabled, updateAutoRotateSpeed, updateCardsPerSector,
    updateDevlogSection, setAllDevlogSections,
    updateBloomIntensityOverride, updateGridOpacityOverride,
    updateParticleBrightnessOverride, updateVignetteOverride,
  ])
}
