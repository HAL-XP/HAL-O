/**
 * DockLayout — dockview-based root layout component for HAL-O.
 *
 * Replaces the manual flex + draggable-divider layout with a full docking
 * system that supports drag-to-rearrange, tab groups, and persistent layout.
 *
 * Phase 2: Real panel components via DockContext, terminal session management.
 * The 3D Canvas uses dockview's "always" renderer so it is never unmounted.
 */

import { useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DockviewReact,
  themeAbyss,
  type DockviewReadyEvent,
  type DockviewApi,
} from 'dockview'
import 'dockview/dist/styles/dockview.css'

import type { TerminalSession } from '../types'
import type {
  VoiceProfileId,
  DockPosition,
  CameraSettings,
  PersonalitySettings,
  SphereStyleId,
} from '../hooks/useSettings'
import type { DemoSettings } from '../hooks/useDemoSettings'
import { DockCtx, type DockContextValue } from './dock/DockContext'
import { ScenePanel } from './dock/ScenePanel'
import { TerminalTabPanel } from './dock/TerminalTabPanel'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_STORAGE_KEY = 'hal-o-dock-layout'

/** Debounce delay (ms) before persisting layout changes to localStorage */
const SAVE_DEBOUNCE_MS = 300

/** Prefix for terminal panel IDs inside dockview */
const TERM_PANEL_PREFIX = 'term:'

// ---------------------------------------------------------------------------
// Component registry — maps component IDs to React components.
// dockview looks up by string key when creating / restoring panels.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PANEL_COMPONENTS: Record<string, React.FunctionComponent<any>> = {
  scene: ScenePanel,
  terminal: TerminalTabPanel,
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function loadSavedLayout(): unknown | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveLayout(api: DockviewApi) {
  try {
    const json = api.toJSON()
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(json))
  } catch {
    // Silently swallow — layout save is best-effort
  }
}

function buildDefaultLayout(api: DockviewApi) {
  // Scene panel takes ~70% of width
  api.addPanel({
    id: 'scene',
    component: 'scene',
    title: 'Scene',
    renderer: 'always', // critical: keeps WebGL context alive
  })
}

// ---------------------------------------------------------------------------
// Props — everything DockLayout needs from App.tsx
// ---------------------------------------------------------------------------

export interface DockLayoutProps {
  // Scene / ProjectHub props
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
  defaultTerminalModel?: string
  onDefaultTerminalModelChange?: (id: string) => void

  // Terminal session management
  termSessions: TerminalSession[]
  onCloseTerminal: (id: string) => void
  onVoiceFocus?: (sessionId: string) => void

  // Dock mode toggle
  dockMode: boolean
  onDockModeChange: (enabled: boolean) => void

  // U11: Embedded browser
  onOpenBrowser?: (projectPath: string, projectName: string) => void
}

// ---------------------------------------------------------------------------
// DockLayout Component
// ---------------------------------------------------------------------------

export function DockLayout(props: DockLayoutProps) {
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track which terminal sessions we've already added as panels
  const addedTerminalsRef = useRef<Set<string>>(new Set())

  // Memoize the theme to avoid unnecessary re-renders
  const theme = useMemo(() => ({
    ...themeAbyss,
    gap: 1, // minimal gap for the sci-fi look
  }), [])

  // Build context value for panels
  const ctxValue = useMemo<DockContextValue>(() => ({
    scene: {
      onNewProject: props.onNewProject,
      onConvertProject: props.onConvertProject,
      onOpenTerminal: props.onOpenTerminal,
      voiceFocus: props.voiceFocus,
      onVoiceFocusHub: props.onVoiceFocusHub,
      hubFontSize: props.hubFontSize,
      termFontSize: props.termFontSize,
      wizardFontSize: props.wizardFontSize,
      onWizardFontSize: props.onWizardFontSize,
      voiceOut: props.voiceOut,
      voiceProfile: props.voiceProfile,
      dockPosition: props.dockPosition,
      screenOpacity: props.screenOpacity,
      onHubFontSize: props.onHubFontSize,
      onTermFontSize: props.onTermFontSize,
      onVoiceOut: props.onVoiceOut,
      onVoiceProfileChange: props.onVoiceProfileChange,
      onDockPositionChange: props.onDockPositionChange,
      onScreenOpacityChange: props.onScreenOpacityChange,
      particleDensity: props.particleDensity,
      onParticleDensityChange: props.onParticleDensityChange,
      renderQuality: props.renderQuality,
      onRenderQualityChange: props.onRenderQualityChange,
      camera: props.camera,
      onCameraChange: props.onCameraChange,
      onCameraReset: props.onCameraReset,
      onCameraMove: props.onCameraMove,
      rendererId: props.rendererId,
      onRendererChange: props.onRendererChange,
      layoutId: props.layoutId,
      onLayoutChange: props.onLayoutChange,
      threeTheme: props.threeTheme,
      onThreeThemeChange: props.onThreeThemeChange,
      shipVfxEnabled: props.shipVfxEnabled,
      onShipVfxEnabledChange: props.onShipVfxEnabledChange,
      activityFeedback: props.activityFeedback,
      onActivityFeedbackChange: props.onActivityFeedbackChange,
      sphereStyle: props.sphereStyle,
      onSphereStyleChange: props.onSphereStyleChange,
      voiceReactionIntensity: props.voiceReactionIntensity,
      onVoiceReactionIntensityChange: props.onVoiceReactionIntensityChange,
      personality: props.personality,
      onPersonalityChange: props.onPersonalityChange,
      onPersonalityPreset: props.onPersonalityPreset,
      halSessionId: props.halSessionId,
      terminalCount: props.terminalCount,
      demo: props.demo,
      defaultIde: props.defaultIde,
      onDefaultIdeChange: props.onDefaultIdeChange,
      defaultTerminalModel: props.defaultTerminalModel,
      onDefaultTerminalModelChange: props.onDefaultTerminalModelChange,
      dockMode: props.dockMode,
      onDockModeChange: props.onDockModeChange,
      onOpenBrowser: props.onOpenBrowser,
    },
    terminal: {
      sessions: props.termSessions,
      onClose: props.onCloseTerminal,
      voiceFocus: props.voiceFocus,
      onVoiceFocus: props.onVoiceFocus,
      fontSize: props.termFontSize,
      voiceOut: props.voiceOut,
      voiceProfile: props.voiceProfile,
    },
  }), [
    props.onNewProject, props.onConvertProject, props.onOpenTerminal,
    props.voiceFocus, props.onVoiceFocusHub,
    props.hubFontSize, props.termFontSize, props.wizardFontSize, props.onWizardFontSize,
    props.voiceOut, props.voiceProfile, props.dockPosition, props.screenOpacity,
    props.onHubFontSize, props.onTermFontSize, props.onVoiceOut, props.onVoiceProfileChange,
    props.onDockPositionChange, props.onScreenOpacityChange,
    props.particleDensity, props.onParticleDensityChange,
    props.renderQuality, props.onRenderQualityChange,
    props.camera, props.onCameraChange, props.onCameraReset, props.onCameraMove,
    props.rendererId, props.onRendererChange, props.layoutId, props.onLayoutChange,
    props.threeTheme, props.onThreeThemeChange,
    props.shipVfxEnabled, props.onShipVfxEnabledChange,
    props.activityFeedback, props.onActivityFeedbackChange,
    props.sphereStyle, props.onSphereStyleChange,
    props.voiceReactionIntensity, props.onVoiceReactionIntensityChange,
    props.personality, props.onPersonalityChange, props.onPersonalityPreset,
    props.halSessionId, props.terminalCount, props.demo,
    props.defaultIde, props.onDefaultIdeChange,
    props.defaultTerminalModel, props.onDefaultTerminalModelChange,
    props.dockMode, props.onDockModeChange, props.onOpenBrowser,
    props.termSessions, props.onCloseTerminal, props.onVoiceFocus,
  ])

  // Debounced save: coalesce rapid layout changes into a single write
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      if (apiRef.current) {
        saveLayout(apiRef.current)
      }
    }, SAVE_DEBOUNCE_MS)
  }, [])

  // Clean up pending save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  // ── Sync terminal sessions into dockview panels ──
  // When a terminal session is added, add a panel; when removed, remove the panel.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return

    const currentIds = new Set(props.termSessions.map((s) => s.id))
    const tracked = addedTerminalsRef.current

    // Add new sessions
    for (const session of props.termSessions) {
      if (!tracked.has(session.id)) {
        const panelId = TERM_PANEL_PREFIX + session.id
        try {
          // Try to find an existing terminal group to add tabs to
          const existingTermPanel = api.panels.find(
            (p) => p.id.startsWith(TERM_PANEL_PREFIX),
          )
          const scenePanel = api.panels.find((p) => p.id === 'scene')

          api.addPanel({
            id: panelId,
            component: 'terminal',
            title: session.projectName || session.id,
            renderer: 'always',
            params: { sessionId: session.id },
            position: existingTermPanel
              ? { referencePanel: existingTermPanel }
              : scenePanel
                ? { referencePanel: scenePanel, direction: 'right' }
                : undefined,
            ...(existingTermPanel ? {} : { initialWidth: Math.round(window.innerWidth * 0.3) }),
          })
          tracked.add(session.id)
        } catch {
          // Panel may already exist from layout restore — that's fine
          tracked.add(session.id)
        }
      }
    }

    // Remove panels for closed sessions
    for (const id of tracked) {
      if (!currentIds.has(id)) {
        const panelId = TERM_PANEL_PREFIX + id
        try {
          const panel = api.panels.find((p) => p.id === panelId)
          if (panel) {
            panel.api.close()
          }
        } catch {
          // Panel might already be gone
        }
        tracked.delete(id)
      }
    }
  }, [props.termSessions])

  // Handle panel close events — when user closes a terminal tab via dockview UI
  const handleReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api
    apiRef.current = api

    // Subscribe to layout changes for auto-save persistence
    api.onDidLayoutChange(() => {
      debouncedSave()
    })

    // When a panel is removed via dockview UI (close button), clean up
    api.onDidRemovePanel((event) => {
      const panelId = event.id
      if (panelId.startsWith(TERM_PANEL_PREFIX)) {
        const sessionId = panelId.slice(TERM_PANEL_PREFIX.length)
        addedTerminalsRef.current.delete(sessionId)
        // Notify parent to close the PTY session
        props.onCloseTerminal(sessionId)
      }
    })

    // Try to restore a previously saved layout
    const saved = loadSavedLayout()
    if (saved) {
      try {
        api.fromJSON(saved as Parameters<typeof api.fromJSON>[0])
        // After restoring layout, sync terminal panel tracking
        for (const panel of api.panels) {
          if (panel.id.startsWith(TERM_PANEL_PREFIX)) {
            const sessionId = panel.id.slice(TERM_PANEL_PREFIX.length)
            addedTerminalsRef.current.add(sessionId)
          }
        }
        return
      } catch {
        // Corrupted layout — fall through to default
        localStorage.removeItem(LAYOUT_STORAGE_KEY)
      }
    }

    // No saved layout or restore failed — build the default (scene only)
    buildDefaultLayout(api)
  }, [debouncedSave, props.onCloseTerminal])

  return (
    <DockCtx.Provider value={ctxValue}>
      <div style={{ width: '100%', height: '100vh' }}>
        <DockviewReact
          components={PANEL_COMPONENTS}
          onReady={handleReady}
          defaultRenderer="always"
          theme={theme}
          disableFloatingGroups={true}
        />
      </div>
    </DockCtx.Provider>
  )
}
