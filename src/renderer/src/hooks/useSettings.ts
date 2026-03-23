import { useState, useCallback } from 'react'

export interface SettingsState {
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  rendererId: string
  layoutId: string
  updateHubFont: (size: number) => void
  updateTermFont: (size: number) => void
  updateVoiceOut: (enabled: boolean) => void
  updateRenderer: (id: string) => void
  updateLayout: (id: string) => void
}

export function useSettings(): SettingsState {
  const [hubFontSize, setHubFontSize] = useState(() => parseInt(localStorage.getItem('hal-o-hub-font') || '10'))
  const [termFontSize, setTermFontSize] = useState(() => parseInt(localStorage.getItem('hal-o-term-font') || '13'))
  const [voiceOut, setVoiceOut] = useState(() => localStorage.getItem('hal-o-voice-out') === 'true')
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

  return {
    hubFontSize, termFontSize, voiceOut, rendererId, layoutId,
    updateHubFont, updateTermFont, updateVoiceOut, updateRenderer, updateLayout,
  }
}
