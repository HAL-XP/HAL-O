import { useCallback, useState, useEffect } from 'react'
import { MicButton } from './MicButton'
import { SettingsMenu } from './SettingsMenu'
import { GroupsPanel } from './GroupsPanel'
import { TaskBoard } from './TaskBoard'
import { useTasks } from '../hooks/useTasks'
import type { VoiceProfileId, DockPosition, CameraSettings, PersonalitySettings, IdeOptionId, SphereStyleId, TerminalModelId, DevlogSections, DevlogSectionKey, DevlogVerbosity, SettingsState } from '../hooks/useSettings'
import { DEFAULT_DEVLOG_SECTIONS } from '../hooks/useSettings'
import type { DemoSettings } from '../hooks/useDemoSettings'
import type { ProjectGroup, GroupPreset } from '../hooks/useProjectGroups'
import { FilterBar, type FilterId } from './FilterBar'
import type { ProjectInfo } from '../types'

interface HudTopbarProps {
  settings: SettingsState
  search: string
  onSearchChange: (value: string) => void
  onNewProject: () => void
  onConvertProject: (path: string) => void
  voiceFocus?: 'hub' | string
  halSessionId?: string | null
  onListeningChange: (listening: boolean) => void
  projectCount: number
  readyCount: number
  allProjects?: ProjectInfo[]
  activeFilter?: FilterId
  onFilterChange?: (id: FilterId) => void
  isFavorite?: (path: string) => boolean
  hubFontSize: number
  termFontSize: number
  wizardFontSize: number
  onWizardFontSize: (size: number) => void
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  screenOpacity: number
  rendererId: string
  layoutId: string
  threeTheme: string
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
  onRendererChange: (id: string) => void
  onLayoutChange: (id: string) => void
  onThreeThemeChange: (id: string) => void
  // Groups
  groups?: ProjectGroup[]
  onCreateGroup?: (name: string, color: string) => void
  onDeleteGroup?: (id: string) => void
  onRenameGroup?: (id: string, name: string) => void
  onReorderGroups?: (ids: string[]) => void
  onApplyPreset?: (preset: GroupPreset) => void
  shipVfxEnabled?: boolean
  onShipVfxEnabledChange?: (enabled: boolean) => void
  introAnimation?: boolean
  onIntroAnimationChange?: (enabled: boolean) => void
  activityFeedback?: boolean
  onActivityFeedbackChange?: (enabled: boolean) => void
  sphereStyle?: SphereStyleId
  onSphereStyleChange?: (style: SphereStyleId) => void
  voiceReactionIntensity?: number
  onVoiceReactionIntensityChange?: (v: number) => void
  personality: PersonalitySettings
  onPersonalityChange: (key: keyof PersonalitySettings, value: number) => void
  onPersonalityPreset: (presetName: string) => void
  // Hidden projects
  hiddenPaths?: string[]
  onUnhide?: (path: string) => void
  demo?: DemoSettings
  onVoiceBlocked?: () => void
  // IDE (U19)
  defaultIde?: IdeOptionId
  onDefaultIdeChange?: (id: IdeOptionId) => void
  // X7: Terminal AI model
  defaultTerminalModel?: TerminalModelId
  onDefaultTerminalModelChange?: (id: TerminalModelId) => void
  // Dock mode (Phase 2)
  dockMode?: boolean
  onDockModeChange?: (enabled: boolean) => void
  // P14: Graphics quality presets
  graphicsPreset?: 'light' | 'medium' | 'high'
  onGraphicsPresetChange?: (preset: 'light' | 'medium' | 'high') => void
  bloomEnabled?: boolean
  onBloomEnabledChange?: (enabled: boolean) => void
  chromaticAberrationEnabled?: boolean
  onChromaticAberrationEnabledChange?: (enabled: boolean) => void
  floorLinesEnabled?: boolean
  onFloorLinesEnabledChange?: (enabled: boolean) => void
  groupTrailsEnabled?: boolean
  onGroupTrailsEnabledChange?: (enabled: boolean) => void
  // UX9: Auto-rotate settings
  autoRotateEnabled?: boolean
  onAutoRotateEnabledChange?: (enabled: boolean) => void
  autoRotateSpeed?: number
  onAutoRotateSpeedChange?: (speed: number) => void
  // P14b: GPU wizard re-detect
  onRedetectGpu?: () => void
  // Task board — project list for filter dropdown
  projects?: Array<{ path: string; name: string }>
  // U23: Devlog section verbosity
  devlogSections?: DevlogSections
  onDevlogSectionChange?: (key: DevlogSectionKey, value: DevlogVerbosity) => void
  onSetAllDevlogSections?: (value: DevlogVerbosity) => void
}

export function HudTopbar({
  settings,
  search, onSearchChange, onNewProject, onConvertProject,
  voiceFocus, halSessionId, onListeningChange,
  projectCount, readyCount, allProjects = [], activeFilter = 'all', onFilterChange, isFavorite = () => false,
  hubFontSize, termFontSize, wizardFontSize, onWizardFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, particleDensity, renderQuality, camera, rendererId, layoutId, threeTheme,
  onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, onScreenOpacityChange, onParticleDensityChange, onRenderQualityChange, onCameraChange, onCameraReset, onRendererChange, onLayoutChange, onThreeThemeChange,
  shipVfxEnabled = true, onShipVfxEnabledChange,
  introAnimation = true, onIntroAnimationChange,
  activityFeedback = true, onActivityFeedbackChange,
  sphereStyle = 'wireframe', onSphereStyleChange,
  voiceReactionIntensity = 0.5, onVoiceReactionIntensityChange,
  personality, onPersonalityChange, onPersonalityPreset,
  groups = [], onCreateGroup, onDeleteGroup, onRenameGroup, onReorderGroups, onApplyPreset,
  hiddenPaths = [], onUnhide,
  demo,
  onVoiceBlocked,
  defaultIde = 'auto', onDefaultIdeChange,
  defaultTerminalModel = 'default', onDefaultTerminalModelChange,
  dockMode = false, onDockModeChange,
  graphicsPreset = 'medium', onGraphicsPresetChange,
  bloomEnabled = true, onBloomEnabledChange,
  chromaticAberrationEnabled = false, onChromaticAberrationEnabledChange,
  floorLinesEnabled = false, onFloorLinesEnabledChange,
  groupTrailsEnabled = false, onGroupTrailsEnabledChange,
  autoRotateEnabled = true, onAutoRotateEnabledChange,
  autoRotateSpeed = 0.12, onAutoRotateSpeedChange,
  onRedetectGpu,
  projects = [],
  devlogSections = DEFAULT_DEVLOG_SECTIONS, onDevlogSectionChange, onSetAllDevlogSections,
}: HudTopbarProps) {
  const pendingCount = projectCount - readyCount

  // ── Task Board ──
  const tasksState = useTasks()
  const [taskBoardOpen, setTaskBoardOpen] = useState(false)
  const [taskFilterProject, setTaskFilterProject] = useState<string | null>(null)
  const taskCount = tasksState.tasks.filter(t => t.status !== 'done').length

  const openTaskBoard = useCallback((projectPath?: string | null) => {
    setTaskFilterProject(projectPath ?? null)
    setTaskBoardOpen(true)
  }, [])

  // Expose global function so ScreenPanel (inside R3F Canvas) can open the task board
  useEffect(() => {
    ;(window as any).__openTaskBoard = openTaskBoard
    return () => { delete (window as any).__openTaskBoard }
  }, [openTaskBoard])

  // Keyboard shortcut: Ctrl+Shift+T opens task board
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        setTaskBoardOpen(prev => !prev)
        if (!taskBoardOpen) setTaskFilterProject(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [taskBoardOpen])

  // Resolve focused project name from session list
  const [focusedProjectName, setFocusedProjectName] = useState<string | null>(null)
  useEffect(() => {
    if (voiceFocus === 'hub' || !voiceFocus) { setFocusedProjectName(null); return }
    window.api?.ptySessions?.().then((sessions) => {
      const match = sessions.find(s => s.id === voiceFocus)
      setFocusedProjectName(match?.projectName?.toUpperCase() || null)
    }).catch(() => {})
  }, [voiceFocus])

  const micDisabled = false // dispatcher handles routing; mic always available

  const handleBlockedAttempt = useCallback(() => {
    onVoiceBlocked?.()
  }, [onVoiceBlocked])

  const handleTranscript = (text: string) => {
    const focusTarget = voiceFocus !== 'hub' ? voiceFocus : halSessionId

    // If we have a focused terminal: use it by default.
    // Only override for explicit switch commands ("@project", "switch to X", "work on X").
    // Never override based on accidental project name matches in regular speech.
    if (focusTarget) {
      window.api.dispatchMessage?.(text).then((result) => {
        // Only override focus for Layer 0 (@prefix, confidence 1.0)
        const isExplicitSwitch = result.layer === 0 && result.confidence >= 0.9 && result.sessionId
        const target = isExplicitSwitch ? result.sessionId! : focusTarget

        ;(window as any).__voiceResponseTarget = target
        const prefix = isExplicitSwitch && result.projectName
          ? `[voice → ${result.projectName}]`
          : '[voice]'
        window.api.ptyInput(target, `${prefix} ${result.cleanMessage || text}\r`).catch(() => {})

        if (isExplicitSwitch && result.projectName) {
          import('../components/ErrorToast').then(({ showToast }) => {
            showToast(`Voice → ${result.projectName}`, 'Explicit switch')
          })
        }
      }).catch(() => {
        ;(window as any).__voiceResponseTarget = focusTarget
        window.api.ptyInput(focusTarget, `[voice] ${text}\r`).catch(() => {})
      })
      return
    }

    // No focused terminal (hub view) — full dispatch with all layers
    window.api.dispatchMessage?.(text).then((result) => {
      if (result.sessionId) {
        ;(window as any).__voiceResponseTarget = result.sessionId
        const prefix = result.projectName && result.confidence > 0.5
          ? `[voice → ${result.projectName}]`
          : '[voice]'
        window.api.ptyInput(result.sessionId, `${prefix} ${result.cleanMessage || text}\r`).catch(() => {})
        if (result.projectName && result.confidence > 0.5) {
          import('../components/ErrorToast').then(({ showToast }) => {
            showToast(`Voice → ${result.projectName}`, `Layer ${result.layer} (${Math.round(result.confidence * 100)}%)`)
          })
        }
      } else {
        window.api.ptySessions().then((sessions) => {
          if (sessions.length > 0) {
            ;(window as any).__voiceResponseTarget = sessions[0].id
            window.api.ptyInput(sessions[0].id, `[voice] ${text}\r`).catch(() => {})
          }
        }).catch(() => {})
      }
    }).catch(() => {})
  }

  return (
    <div className="hal-topbar">
      <div className="hal-topbar-left">
        <span className="hal-sys-label">SYS://HAL-O</span>
        <span className="hal-sys-ver">v1.0</span>
        <button className="hal-cmd deploy hal-topbar-btn" onClick={onNewProject} title="New project">
          <svg className="hal-btn-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span className="hal-btn-label">NEW</span>
        </button>
        <button className="hal-cmd hal-topbar-btn" data-tutorial="add-project" onClick={async () => { const f = await window.api.selectFolder(); if (f) onConvertProject(f) }} title="Add existing project">
          <svg className="hal-btn-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span className="hal-btn-label">ADD PROJECT</span>
        </button>
      </div>
      {onFilterChange && allProjects.length > 0 && (
        <FilterBar projects={allProjects} activeFilter={activeFilter} onFilterChange={onFilterChange} isFavorite={isFavorite} />
      )}
      <div className="hal-topbar-center">
        <span className="hal-prompt">&gt;</span>
        <input className="hal-search" placeholder="SEARCH... (Ctrl+Space = voice)" value={search} onChange={(e) => onSearchChange(e.target.value)} />
        <MicButton
          onTranscript={handleTranscript}
          onListeningChange={onListeningChange}
          disabled={micDisabled}
          disabledTooltip="No embedded terminal — open a project terminal first"
          onBlockedAttempt={handleBlockedAttempt}
        />
        <button className="hal-voice-toggle" onClick={() => {
          onVoiceOut(!voiceOut)
          // Stop any currently playing audio
          if (voiceOut) {
            document.querySelectorAll('audio').forEach(a => { a.pause(); a.currentTime = 0 })
            // Also stop Web Audio sources
            ;(window as any).__haloAudioSource?.stop?.()
          }
        }} title={voiceOut ? 'Voice output ON — click to mute' : 'Voice output OFF — click to unmute'}>
          {voiceOut ? '🔊' : '🔇'}
        </button>
        <span className="hal-voice-target">{
          voiceFocus === 'hub' ? 'DISPATCH' : (focusedProjectName || 'TERM')
        }</span>
      </div>
      <div className="hal-topbar-right">
        {onCreateGroup && onDeleteGroup && onRenameGroup && onReorderGroups && onApplyPreset && (
          <GroupsPanel
            groups={groups}
            onCreateGroup={onCreateGroup}
            onDeleteGroup={onDeleteGroup}
            onRenameGroup={onRenameGroup}
            onReorderGroups={onReorderGroups}
            onApplyPreset={onApplyPreset}
          />
        )}
        <SettingsMenu
          settings={settings}
          wizardFontSize={wizardFontSize} onWizardFontSize={onWizardFontSize}
          hiddenPaths={hiddenPaths} onUnhide={onUnhide}
          demo={demo}
          dockMode={dockMode} onDockModeChange={onDockModeChange}
          onRedetectGpu={onRedetectGpu}
        />
        {/* Task Board button */}
        <button
          className="hal-settings-btn"
          onClick={() => { setTaskFilterProject(null); setTaskBoardOpen(prev => !prev) }}
          title="Mission Control — Task Board (Ctrl+Shift+T)"
          style={{ position: 'relative' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="9" x2="9" y2="21" />
          </svg>
          {taskCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: '#22d3ee', color: '#000',
              fontSize: '7px', fontWeight: 800,
              minWidth: '12px', height: '12px',
              borderRadius: '6px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', lineHeight: 1,
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            }}>
              {taskCount}
            </span>
          )}
        </button>
        <span className="hal-stat"><span className="hal-stat-n">{projectCount}</span><span className="hal-stat-label"> OPS</span></span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-ok">{readyCount}</span><span className="hal-stat-label"> READY</span></span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-warn">{pendingCount}</span><span className="hal-stat-label"> PENDING</span></span>
      </div>
      {/* Task Board overlay */}
      <TaskBoard
        open={taskBoardOpen}
        onClose={() => setTaskBoardOpen(false)}
        tasks={tasksState}
        filterProject={taskFilterProject}
        projects={projects}
      />
    </div>
  )
}
