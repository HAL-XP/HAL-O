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

export interface SettingsState {
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  rendererId: string
  layoutId: string
  updateHubFont: (size: number) => void
  updateTermFont: (size: number) => void
  updateVoiceOut: (enabled: boolean) => void
  updateVoiceProfile: (id: VoiceProfileId) => void
  updateDockPosition: (pos: DockPosition) => void
  updateRenderer: (id: string) => void
  updateLayout: (id: string) => void
}

export function useSettings(): SettingsState {
  const [hubFontSize, setHubFontSize] = useState(() => parseInt(localStorage.getItem('hal-o-hub-font') || '10'))
  const [termFontSize, setTermFontSize] = useState(() => parseInt(localStorage.getItem('hal-o-term-font') || '13'))
  const [voiceOut, setVoiceOut] = useState(() => localStorage.getItem('hal-o-voice-out') === 'true')
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfileId>(() => (localStorage.getItem('hal-o-voice-profile') as VoiceProfileId) || 'auto')
  const [dockPosition, setDockPosition] = useState<DockPosition>(() => (localStorage.getItem('hal-o-dock') as DockPosition) || 'bottom')
  const [rendererId, setRendererId] = useState<string>(() => localStorage.getItem('hal-o-renderer') || 'classic')
  const [layoutId, setLayoutId] = useState<string>(() => localStorage.getItem('hal-o-layout') || 'dual-arc')

  const updateRenderer = useCallback((id: string) => {
    setRendererId(id)
    localStorage.setItem('hal-o-renderer', id)
  }, [])
  const updateLayout = useCallback((id: string) => {
    setLayoutId(id)
    localStorage.setItem('hal-o-layout', id)
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

  return {
    hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, rendererId, layoutId,
    updateHubFont, updateTermFont, updateVoiceOut, updateVoiceProfile, updateDockPosition, updateRenderer, updateLayout,
  }
}
