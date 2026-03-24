/**
 * DockContext — React context for passing app-level props into dockview panels.
 *
 * Dockview panels are instantiated by string key, so they can't receive React
 * props directly.  Instead we put everything they need into this context so
 * ScenePanel and TerminalTabPanel can useContext(DockCtx) to grab what they need.
 */

import { createContext } from 'react'
import type { TerminalSession } from '../../types'
import type {
  VoiceProfileId,
  DockPosition,
  CameraSettings,
  PersonalitySettings,
  SphereStyleId,
} from '../../hooks/useSettings'
import type { DemoSettings } from '../../hooks/useDemoSettings'

// ── Scene (ProjectHub) props ──
export interface DockSceneProps {
  onNewProject: () => void
  onConvertProject: (path: string) => void
  onOpenTerminal?: (projectPath: string, projectName: string, resume: boolean) => void
  voiceFocus?: 'hub' | string
  onVoiceFocusHub?: () => void
  hubFontSize: number
  termFontSize: number
  wizardFontSize: number
  onWizardFontSize: (size: number) => void
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  screenOpacity: number
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
  onCameraMove?: (distance: number, angle: number) => void
  rendererId: string
  onRendererChange: (id: string) => void
  layoutId: string
  onLayoutChange: (id: string) => void
  threeTheme: string
  onThreeThemeChange: (id: string) => void
  shipVfxEnabled?: boolean
  onShipVfxEnabledChange?: (enabled: boolean) => void
  activityFeedback?: boolean
  onActivityFeedbackChange?: (enabled: boolean) => void
  sphereStyle?: SphereStyleId
  onSphereStyleChange?: (style: SphereStyleId) => void
  voiceReactionIntensity?: number
  onVoiceReactionIntensityChange?: (v: number) => void
  personality: PersonalitySettings
  onPersonalityChange: (key: keyof PersonalitySettings, value: number) => void
  onPersonalityPreset: (presetName: string) => void
  halSessionId?: string | null
  terminalCount?: number
  demo?: DemoSettings
  defaultIde?: string
  onDefaultIdeChange?: (id: string) => void
  // Dock-mode toggle so Settings can show it
  dockMode: boolean
  onDockModeChange: (enabled: boolean) => void
}

// ── Terminal props ──
export interface DockTerminalProps {
  sessions: TerminalSession[]
  onClose: (id: string) => void
  voiceFocus?: 'hub' | string
  onVoiceFocus?: (sessionId: string) => void
  fontSize: number
  voiceOut: boolean
  voiceProfile: VoiceProfileId
}

export interface DockContextValue {
  scene: DockSceneProps
  terminal: DockTerminalProps
}

// The context is created with null — components must be wrapped in a provider.
export const DockCtx = createContext<DockContextValue | null>(null)
