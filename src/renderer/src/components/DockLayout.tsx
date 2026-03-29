/**
 * DockLayout -- dockview-based root layout component for HAL-O.
 *
 * Replaces the manual flex + draggable-divider layout with a full docking
 * system that supports drag-to-rearrange, tab groups, and persistent layout.
 *
 * DESIGN:
 *  - Uses paneRegistry for component discovery (extensible, no hardcoded map)
 *  - Passes SettingsState directly through DockCtx (no decompose/recompose)
 *  - 3D Canvas uses dockview's "always" renderer so WebGL context is never lost
 *  - Terminal panels are synced with termSessions via useEffect
 *  - Layout persists to localStorage with debounced save
 */

import { useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DockviewReact,
  themeAbyss,
  type DockviewReadyEvent,
  type DockviewApi,
} from 'dockview'
import 'dockview/dist/styles/dockview.css'
import '../styles/dockview-theme.css'

import type { TerminalSession } from '../types'
import type { SettingsState } from '../hooks/useSettings'
import type { DemoSettings } from '../hooks/useDemoSettings'
import type { FocusZone } from '../hooks/useFocusZone'
import { DockCtx, type DockContextValue } from './dock/DockContext'
import { ScenePanel } from './dock/ScenePanel'
import { TerminalTabPanel } from './dock/TerminalTabPanel'
import {
  registerPane,
  buildComponentMap,
  getPane,
} from '../registry/paneRegistry'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_STORAGE_KEY = 'hal-o-dock-layout'

/** Debounce delay (ms) before persisting layout changes to localStorage */
const SAVE_DEBOUNCE_MS = 300

/** Prefix for terminal panel IDs inside dockview */
const TERM_PANEL_PREFIX = 'term:'

// ---------------------------------------------------------------------------
// Register built-in panes (runs once at module load)
// ---------------------------------------------------------------------------
registerPane({
  id: 'scene',
  title: 'Scene',
  icon: '3d_rotation',
  component: ScenePanel,
  renderer: 'always',
  defaultVisible: true,
  singleton: true,
})

registerPane({
  id: 'terminal',
  title: 'Terminal',
  icon: 'terminal',
  component: TerminalTabPanel,
  renderer: 'always',
  defaultVisible: false, // terminals are created on-demand
  singleton: false,
  defaultPosition: {
    referencePanel: 'scene',
    direction: 'right',
    initialWidth: typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.3) : 600,
  },
})

// ---------------------------------------------------------------------------
// Component registry built from paneRegistry
// ---------------------------------------------------------------------------
const PANEL_COMPONENTS = buildComponentMap()

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
    // Silently swallow -- layout save is best-effort
  }
}

function buildDefaultLayout(api: DockviewApi) {
  // Scene panel takes ~70% of width (default visible, singleton)
  api.addPanel({
    id: 'scene',
    component: 'scene',
    title: 'Scene',
    renderer: 'always', // critical: keeps WebGL context alive
  })
}

// ---------------------------------------------------------------------------
// Props -- dramatically simplified by accepting SettingsState directly
// ---------------------------------------------------------------------------

export interface DockLayoutProps {
  /** Full settings state (values + updaters) -- forwarded to panels via context */
  settings: SettingsState

  // Scene-specific callbacks (not in SettingsState)
  onNewProject: () => void
  onConvertProject: (path: string) => void
  onOpenTerminal?: (projectPath: string, projectName: string, resume: boolean) => void
  onVoiceFocusHub?: () => void
  onCameraMove?: (distance: number, angle: number) => void
  onRedetectGpu?: () => void
  onOpenBrowser?: (projectPath: string, projectName: string) => void
  wizardFontSize: number
  onWizardFontSize: (size: number) => void

  // Shared state
  voiceFocus?: 'hub' | string
  halSessionId?: string | null
  terminalCount?: number
  demo?: DemoSettings
  focusZone?: FocusZone

  // Terminal session management
  termSessions: TerminalSession[]
  onCloseTerminal: (id: string) => void
  onVoiceFocus?: (sessionId: string) => void

  // Dock mode toggle
  dockMode: boolean
  onDockModeChange: (enabled: boolean) => void
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

  // Build context value for panels -- one clean object
  const ctxValue = useMemo<DockContextValue>(() => ({
    settings: props.settings,
    scene: {
      onNewProject: props.onNewProject,
      onConvertProject: props.onConvertProject,
      onOpenTerminal: props.onOpenTerminal,
      onVoiceFocusHub: props.onVoiceFocusHub,
      onCameraMove: props.onCameraMove,
      onRedetectGpu: props.onRedetectGpu,
      onOpenBrowser: props.onOpenBrowser,
      wizardFontSize: props.wizardFontSize,
      onWizardFontSize: props.onWizardFontSize,
    },
    terminal: {
      sessions: props.termSessions,
      onClose: props.onCloseTerminal,
      voiceFocus: props.voiceFocus,
      onVoiceFocus: props.onVoiceFocus,
      fontSize: props.settings.termFontSize,
      voiceOut: props.settings.voiceOut,
      voiceProfile: props.settings.voiceProfile,
    },
    voiceFocus: props.voiceFocus,
    halSessionId: props.halSessionId,
    terminalCount: props.terminalCount,
    demo: props.demo,
    focusZone: props.focusZone,
    dockMode: props.dockMode,
    onDockModeChange: props.onDockModeChange,
  }), [
    props.settings,
    props.onNewProject, props.onConvertProject, props.onOpenTerminal,
    props.onVoiceFocusHub, props.onCameraMove, props.onRedetectGpu,
    props.onOpenBrowser, props.wizardFontSize, props.onWizardFontSize,
    props.termSessions, props.onCloseTerminal, props.onVoiceFocus,
    props.voiceFocus, props.halSessionId, props.terminalCount,
    props.demo, props.focusZone, props.dockMode, props.onDockModeChange,
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

  // ---- Sync terminal sessions into dockview panels ----
  // When a terminal session is added, add a panel; when removed, remove it.
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

          // Get default position from registry
          const termDef = getPane('terminal')
          const defaultWidth = termDef?.defaultPosition?.initialWidth ?? Math.round(window.innerWidth * 0.3)

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
            ...(existingTermPanel ? {} : { initialWidth: defaultWidth }),
          })
          tracked.add(session.id)
        } catch {
          // Panel may already exist from layout restore -- that's fine
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

  // Handle panel close events -- when user closes a terminal tab via dockview UI
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
        // Corrupted layout -- fall through to default
        localStorage.removeItem(LAYOUT_STORAGE_KEY)
      }
    }

    // No saved layout or restore failed -- build the default (scene only)
    buildDefaultLayout(api)
  }, [debouncedSave, props.onCloseTerminal])

  return (
    <DockCtx.Provider value={ctxValue}>
      <div className="hal-dock-root" style={{ width: '100%', height: '100vh' }}>
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
