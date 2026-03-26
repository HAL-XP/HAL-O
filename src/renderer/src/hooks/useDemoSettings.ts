import { useState, useCallback } from 'react'
import type { VoiceProfileId } from './useSettings'

export interface DemoSettings {
  enabled: boolean
  cardCount: number
  terminalCount: number
  tabsMin: number
  tabsMax: number
  vfxFrequency: number // seconds between spawns, 0 = disabled
  demoText: string
  demoVoice: VoiceProfileId
  setEnabled: (v: boolean) => void
  setCardCount: (v: number) => void
  setTerminalCount: (v: number) => void
  setTabsMin: (v: number) => void
  setTabsMax: (v: number) => void
  setVfxFrequency: (v: number) => void
  setDemoText: (v: string) => void
  setDemoVoice: (v: VoiceProfileId) => void
}

const DEFAULT_DEMO_TEXT = 'Welcome to HAL-O \u2014 your holographic command center for Claude Code projects'

function ls(key: string, fallback: string): string {
  return localStorage.getItem(key) || fallback
}

export function useDemoSettings(): DemoSettings {
  const [enabled, _setEnabled] = useState(() => ls('hal-o-demo-mode', 'false') === 'true')
  const [cardCount, _setCardCount] = useState(() => parseInt(ls('hal-o-demo-cards', '15')))
  const [terminalCount, _setTerminalCount] = useState(() => parseInt(ls('hal-o-demo-terminals', '2')))
  const [tabsMin, _setTabsMin] = useState(() => parseInt(ls('hal-o-demo-tabs-min', '1')))
  const [tabsMax, _setTabsMax] = useState(() => parseInt(ls('hal-o-demo-tabs-max', '3')))
  const [vfxFrequency, _setVfxFrequency] = useState(() => parseInt(ls('hal-o-demo-vfx-freq', '0')))
  const [demoText, _setDemoText] = useState(() => ls('hal-o-demo-text', DEFAULT_DEMO_TEXT))
  const [demoVoice, _setDemoVoice] = useState<VoiceProfileId>(() => (ls('hal-o-demo-voice', 'butler') as VoiceProfileId))

  const setEnabled = useCallback((v: boolean) => { _setEnabled(v); localStorage.setItem('hal-o-demo-mode', String(v)) }, [])
  const setCardCount = useCallback((v: number) => { _setCardCount(v); localStorage.setItem('hal-o-demo-cards', String(v)) }, [])
  const setTerminalCount = useCallback((v: number) => { _setTerminalCount(v); localStorage.setItem('hal-o-demo-terminals', String(v)) }, [])
  const setTabsMin = useCallback((v: number) => { _setTabsMin(v); localStorage.setItem('hal-o-demo-tabs-min', String(v)) }, [])
  const setTabsMax = useCallback((v: number) => { _setTabsMax(v); localStorage.setItem('hal-o-demo-tabs-max', String(v)) }, [])
  const setVfxFrequency = useCallback((v: number) => { _setVfxFrequency(v); localStorage.setItem('hal-o-demo-vfx-freq', String(v)) }, [])
  const setDemoText = useCallback((v: string) => { _setDemoText(v); localStorage.setItem('hal-o-demo-text', v) }, [])
  const setDemoVoice = useCallback((v: VoiceProfileId) => { _setDemoVoice(v); localStorage.setItem('hal-o-demo-voice', v) }, [])

  return {
    enabled, cardCount, terminalCount, tabsMin, tabsMax, vfxFrequency, demoText, demoVoice,
    setEnabled, setCardCount, setTerminalCount, setTabsMin, setTabsMax, setVfxFrequency, setDemoText, setDemoVoice,
  }
}
