/**
 * DockContext -- React context for passing app-level props into dockview panels.
 *
 * Dockview panels are instantiated by string key, so they can't receive React
 * props directly.  Instead we put everything they need into this context so
 * ScenePanel, TerminalTabPanel, and future panels can useContext(DockCtx).
 *
 * DESIGN: Instead of decomposing SettingsState into 50+ individual fields, we
 * pass the whole SettingsState object.  Panels that need settings (ScenePanel
 * for ProjectHub, future SettingsPanel) pull it directly.  This prevents the
 * "missing prop" bug that occurred when new settings were added to useSettings
 * but not forwarded through the context.
 */

import { createContext } from 'react'
import type { TerminalSession } from '../../types'
import type { SettingsState, VoiceProfileId } from '../../hooks/useSettings'
import type { DemoSettings } from '../../hooks/useDemoSettings'
import type { FocusZone } from '../../hooks/useFocusZone'

// ── Scene (ProjectHub) props that are NOT part of SettingsState ──
export interface DockSceneCallbacks {
  onNewProject: () => void
  onConvertProject: (path: string) => void
  onOpenTerminal?: (projectPath: string, projectName: string, resume: boolean) => void
  onVoiceFocusHub?: () => void
  onCameraMove?: (distance: number, angle: number) => void
  onRedetectGpu?: () => void
  onOpenBrowser?: (projectPath: string, projectName: string) => void
  wizardFontSize: number
  onWizardFontSize: (size: number) => void
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
  /** Full settings state -- panels pull what they need */
  settings: SettingsState
  /** Scene-specific callbacks not in SettingsState */
  scene: DockSceneCallbacks
  /** Terminal session management */
  terminal: DockTerminalProps
  /** Shared across panels */
  voiceFocus?: 'hub' | string
  halSessionId?: string | null
  terminalCount?: number
  demo?: DemoSettings
  focusZone?: FocusZone
  dockMode: boolean
  onDockModeChange: (enabled: boolean) => void
}

// The context is created with null -- components must be wrapped in a provider.
export const DockCtx = createContext<DockContextValue | null>(null)
