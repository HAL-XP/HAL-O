import { useState, useCallback, useRef } from 'react'

export const VOICE_PROFILES = [
  { id: 'auto', label: 'AUTO (CONTEXT)' },
  { id: 'buddy', label: 'BUDDY' },
  { id: 'orc', label: 'ORC' },
  { id: 'narrator', label: 'NARRATOR' },
  { id: 'soft', label: 'SOFT' },
  { id: 'asmr', label: 'ASMR' },
  { id: 'movie_trailer', label: 'MOVIE TRAILER' },
  { id: 'gollum', label: 'GOLLUM' },
  { id: 'pirate', label: 'PIRATE' },
  { id: 'wizard', label: 'WIZARD' },
  { id: 'drill_sergeant', label: 'DRILL SERGEANT' },
  { id: 'glados', label: 'GLADOS' },
  { id: 'news_anchor', label: 'NEWS ANCHOR' },
  { id: 'sports_commentator', label: 'SPORTS COMMENTATOR' },
  { id: 'surfer', label: 'SURFER' },
  { id: 'santa', label: 'SANTA' },
  { id: 'irish', label: 'IRISH' },
  { id: 'australian', label: 'AUSTRALIAN' },
  { id: 'butler', label: 'BUTLER' },
  { id: 'russian', label: 'RUSSIAN' },
  { id: 'italian_chef', label: 'ITALIAN CHEF' },
] as const

export type VoiceProfileId = typeof VOICE_PROFILES[number]['id']

export const DOCK_POSITIONS = [
  { id: 'bottom', label: 'BOTTOM' },
  { id: 'right', label: 'RIGHT' },
  { id: 'left', label: 'LEFT' },
] as const

export type DockPosition = typeof DOCK_POSITIONS[number]['id']

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
  voiceReactionIntensity: number
  personality: PersonalitySettings
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
  updateVoiceReactionIntensity: (v: number) => void
  updatePersonality: (key: keyof PersonalitySettings, value: number) => void
  applyPersonalityPreset: (presetName: string) => void
}

export function useSettings(): SettingsState {
  const [hubFontSize, setHubFontSize] = useState(() => parseInt(localStorage.getItem('hal-o-hub-font') || '10'))
  const [termFontSize, setTermFontSize] = useState(() => parseInt(localStorage.getItem('hal-o-term-font') || '13'))
  const [voiceOut, setVoiceOut] = useState(() => localStorage.getItem('hal-o-voice-out') === 'true')
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfileId>(() => (localStorage.getItem('hal-o-voice-profile') as VoiceProfileId) || 'auto')
  const [dockPosition, setDockPosition] = useState<DockPosition>(() => (localStorage.getItem('hal-o-dock') as DockPosition) || 'bottom')
  const [screenOpacity, setScreenOpacity] = useState(() => parseFloat(localStorage.getItem('hal-o-screen-opacity') || '1'))
  const [camera, setCamera] = useState<CameraSettings>(() => {
    try { const c = localStorage.getItem('hal-o-camera'); return c ? JSON.parse(c) : DEFAULT_CAMERA } catch { return DEFAULT_CAMERA }
  })
  const [cameraTweaking, setCameraTweaking] = useState(() => localStorage.getItem('hal-o-camera-tweaking') === 'true')
  const [particleDensity, setParticleDensity] = useState(() => {
    const stored = localStorage.getItem('hal-o-particle-density')
    if (stored !== null) {
      const v = parseInt(stored)
      // Migrate old 0-4 scale → 0-10 scale (v2) → 0-15 scale (v3)
      if (v >= 0 && v <= 4 && localStorage.getItem('hal-o-particle-density-v2') === null) {
        // v1→v3 direct: map 0-4 multipliers to closest 0-15 index
        const V1_TO_V3 = [0, 3, 8, 10, 14] // old 0-4 mapped to new 0-15
        const migrated = V1_TO_V3[v] ?? 8
        localStorage.setItem('hal-o-particle-density', String(migrated))
        localStorage.setItem('hal-o-particle-density-v2', '1')
        localStorage.setItem('hal-o-particle-density-v3', '1')
        return migrated
      }
      // v2→v3: map old 0-10 scale to new 0-15 scale by closest multiplier
      if (v >= 0 && v <= 10 && localStorage.getItem('hal-o-particle-density-v3') === null) {
        const V2_TO_V3 = [0, 3, 4, 4, 6, 8, 10, 11, 12, 13, 14]
        const migrated = V2_TO_V3[v] ?? 8
        localStorage.setItem('hal-o-particle-density', String(migrated))
        localStorage.setItem('hal-o-particle-density-v3', '1')
        return migrated
      }
      return v
    }
    return 8
  })
  const [renderQuality, setRenderQuality] = useState(() => {
    const stored = localStorage.getItem('hal-o-render-quality')
    return stored !== null ? parseFloat(stored) : Math.min(window.devicePixelRatio, 2)
  })
  const [rendererId, setRendererId] = useState<string>(() => localStorage.getItem('hal-o-renderer') || 'classic')
  const [layoutId, setLayoutId] = useState<string>(() => localStorage.getItem('hal-o-layout') || 'dual-arc')
  const [threeTheme, setThreeTheme] = useState<string>(() => localStorage.getItem('hal-o-3d-theme') || 'tactical')
  const [shipVfxEnabled, setShipVfxEnabled] = useState(() => localStorage.getItem('hal-o-ship-vfx') !== 'false')
  const [voiceReactionIntensity, setVoiceReactionIntensity] = useState(() => {
    const stored = localStorage.getItem('hal-o-voice-reaction-intensity')
    return stored !== null ? parseFloat(stored) : 0.5
  })
  const [personality, setPersonality] = useState<PersonalitySettings>(() => {
    try {
      const stored = localStorage.getItem('hal-o-personality')
      return stored ? { ...DEFAULT_PERSONALITY, ...JSON.parse(stored) } : DEFAULT_PERSONALITY
    } catch { return DEFAULT_PERSONALITY }
  })

  const updateRenderer = useCallback((id: string) => {
    setRendererId(id)
    localStorage.setItem('hal-o-renderer', id)
  }, [])
  const updateLayout = useCallback((id: string) => {
    setLayoutId(id)
    localStorage.setItem('hal-o-layout', id)
  }, [])
  const updateThreeTheme = useCallback((id: string) => {
    setThreeTheme(id)
    localStorage.setItem('hal-o-3d-theme', id)
  }, [])
  const updateHubFont = useCallback((size: number) => {
    setHubFontSize(size)
    localStorage.setItem('hal-o-hub-font', String(size))
  }, [])
  const updateTermFont = useCallback((size: number) => {
    setTermFontSize(size)
    localStorage.setItem('hal-o-term-font', String(size))
  }, [])
  const updateVoiceOut = useCallback((enabled: boolean) => {
    setVoiceOut(enabled)
    localStorage.setItem('hal-o-voice-out', String(enabled))
  }, [])
  const updateVoiceProfile = useCallback((id: VoiceProfileId) => {
    setVoiceProfile(id)
    localStorage.setItem('hal-o-voice-profile', id)
  }, [])
  const updateDockPosition = useCallback((pos: DockPosition) => {
    setDockPosition(pos)
    localStorage.setItem('hal-o-dock', pos)
  }, [])
  const updateScreenOpacity = useCallback((opacity: number) => {
    setScreenOpacity(opacity)
    localStorage.setItem('hal-o-screen-opacity', String(opacity))
  }, [])
  const updateCamera = useCallback((cam: CameraSettings) => {
    setCamera(cam)
    localStorage.setItem('hal-o-camera', JSON.stringify(cam))
  }, [])
  const updateCameraTweaking = useCallback((on: boolean) => {
    setCameraTweaking(on)
    localStorage.setItem('hal-o-camera-tweaking', String(on))
  }, [])
  const resetCamera = useCallback(() => {
    setCamera(DEFAULT_CAMERA)
    localStorage.setItem('hal-o-camera', JSON.stringify(DEFAULT_CAMERA))
  }, [])
  const updateParticleDensity = useCallback((v: number) => {
    setParticleDensity(v)
    localStorage.setItem('hal-o-particle-density', String(v))
  }, [])
  const updateRenderQuality = useCallback((v: number) => {
    setRenderQuality(v)
    localStorage.setItem('hal-o-render-quality', String(v))
  }, [])
  const updateShipVfxEnabled = useCallback((enabled: boolean) => {
    setShipVfxEnabled(enabled)
    localStorage.setItem('hal-o-ship-vfx', String(enabled))
  }, [])
  const updateVoiceReactionIntensity = useCallback((v: number) => {
    setVoiceReactionIntensity(v)
    localStorage.setItem('hal-o-voice-reaction-intensity', String(v))
  }, [])

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

  const updatePersonality = useCallback((key: keyof PersonalitySettings, value: number) => {
    setPersonality(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem('hal-o-personality', JSON.stringify(next))
      writePersonalityFile(next)
      return next
    })
  }, [writePersonalityFile])

  const applyPersonalityPreset = useCallback((presetName: string) => {
    const preset = PERSONALITY_PRESETS.find(p => p.name === presetName)
    if (!preset) return
    setPersonality(preset.values)
    localStorage.setItem('hal-o-personality', JSON.stringify(preset.values))
    writePersonalityFile(preset.values, presetName)
  }, [writePersonalityFile])

  return {
    hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, camera, cameraTweaking, particleDensity, renderQuality, rendererId, layoutId, threeTheme, shipVfxEnabled, voiceReactionIntensity, personality,
    updateHubFont, updateTermFont, updateVoiceOut, updateVoiceProfile, updateDockPosition, updateScreenOpacity, updateCamera, updateCameraTweaking, resetCamera, updateParticleDensity, updateRenderQuality, updateRenderer, updateLayout, updateThreeTheme, updateShipVfxEnabled, updateVoiceReactionIntensity, updatePersonality, applyPersonalityPreset,
  }
}
