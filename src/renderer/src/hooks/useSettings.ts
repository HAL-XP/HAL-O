import { useState, useCallback } from 'react'

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

export const PARTICLE_DENSITY_LABELS = ['NONE', 'MINIMAL', 'VERY LOW', 'LOW', 'LOW-MED', 'MED', 'MED-HIGH', 'HIGH', 'VERY HIGH', 'ULTRA', 'MAX'] as const
export const PARTICLE_DENSITY_MULTIPLIERS = [0, 0.1, 0.2, 0.3, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0] as const

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
      // Migrate old 0-4 scale to new 0-10 scale: multiply by 2.5 and round
      // Old default was 2 (MED) → new default is 5 (MED)
      if (v >= 0 && v <= 4 && localStorage.getItem('hal-o-particle-density-v2') === null) {
        const migrated = Math.round(v * 2.5)
        localStorage.setItem('hal-o-particle-density', String(migrated))
        localStorage.setItem('hal-o-particle-density-v2', '1')
        return migrated
      }
      return v
    }
    return 5
  })
  const [renderQuality, setRenderQuality] = useState(() => {
    const stored = localStorage.getItem('hal-o-render-quality')
    return stored !== null ? parseFloat(stored) : Math.min(window.devicePixelRatio, 2)
  })
  const [rendererId, setRendererId] = useState<string>(() => localStorage.getItem('hal-o-renderer') || 'classic')
  const [layoutId, setLayoutId] = useState<string>(() => localStorage.getItem('hal-o-layout') || 'dual-arc')
  const [threeTheme, setThreeTheme] = useState<string>(() => localStorage.getItem('hal-o-3d-theme') || 'tactical')
  const [shipVfxEnabled, setShipVfxEnabled] = useState(() => localStorage.getItem('hal-o-ship-vfx') !== 'false')

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

  return {
    hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, camera, cameraTweaking, particleDensity, renderQuality, rendererId, layoutId, threeTheme, shipVfxEnabled,
    updateHubFont, updateTermFont, updateVoiceOut, updateVoiceProfile, updateDockPosition, updateScreenOpacity, updateCamera, updateCameraTweaking, resetCamera, updateParticleDensity, updateRenderQuality, updateRenderer, updateLayout, updateThreeTheme, updateShipVfxEnabled,
  }
}
