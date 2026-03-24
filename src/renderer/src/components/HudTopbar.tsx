import { useCallback } from 'react'
import { MicButton } from './MicButton'
import { SettingsMenu } from './SettingsMenu'
import { GroupsPanel } from './GroupsPanel'
import type { VoiceProfileId, DockPosition, CameraSettings } from '../hooks/useSettings'
import type { DemoSettings } from '../hooks/useDemoSettings'
import type { ProjectGroup, GroupPreset } from '../hooks/useProjectGroups'

interface HudTopbarProps {
  search: string
  onSearchChange: (value: string) => void
  onNewProject: () => void
  onConvertProject: (path: string) => void
  voiceFocus?: 'hub' | string
  halSessionId?: string | null
  onListeningChange: (listening: boolean) => void
  projectCount: number
  readyCount: number
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
  voiceReactionIntensity?: number
  onVoiceReactionIntensityChange?: (v: number) => void
  // Hidden projects
  hiddenPaths?: string[]
  onUnhide?: (path: string) => void
  demo?: DemoSettings
  onVoiceBlocked?: () => void
}

export function HudTopbar({
  search, onSearchChange, onNewProject, onConvertProject,
  voiceFocus, halSessionId, onListeningChange,
  projectCount, readyCount,
  hubFontSize, termFontSize, wizardFontSize, onWizardFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, particleDensity, renderQuality, camera, rendererId, layoutId, threeTheme,
  onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, onScreenOpacityChange, onParticleDensityChange, onRenderQualityChange, onCameraChange, onCameraReset, onRendererChange, onLayoutChange, onThreeThemeChange,
  shipVfxEnabled = true, onShipVfxEnabledChange,
  voiceReactionIntensity = 0.5, onVoiceReactionIntensityChange,
  groups = [], onCreateGroup, onDeleteGroup, onRenameGroup, onReorderGroups, onApplyPreset,
  hiddenPaths = [], onUnhide,
  demo,
  onVoiceBlocked,
}: HudTopbarProps) {
  const pendingCount = projectCount - readyCount

  // Mic is disabled when hub is focused but no HAL terminal is linked
  const micDisabled = voiceFocus === 'hub' && !halSessionId

  const handleBlockedAttempt = useCallback(() => {
    onVoiceBlocked?.()
  }, [onVoiceBlocked])

  const handleTranscript = (text: string) => {
    const target = voiceFocus === 'hub' ? halSessionId : voiceFocus
    if (target) {
      ;(window as any).__voiceResponseTarget = target
      window.api.ptyInput(target, `[voice] ${text}\r`).catch(() => {})
    } else if (voiceFocus !== 'hub') {
      // Terminal focused but target missing — try any session
      window.api.ptySessions().then((sessions) => {
        if (sessions.length > 0) {
          ;(window as any).__voiceResponseTarget = sessions[0].id
          window.api.ptyInput(sessions[0].id, `[voice] ${text}\r`).catch(() => {})
        }
      }).catch(() => {})
    }
    // No fallback to search — if no valid target, mic should be disabled
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
        <button className="hal-cmd hal-topbar-btn" onClick={async () => { const f = await window.api.selectFolder(); if (f) onConvertProject(f) }} title="Add existing project">
          <svg className="hal-btn-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span className="hal-btn-label">ADD PROJECT</span>
        </button>
      </div>
      <div className="hal-topbar-center">
        <span className="hal-prompt">&gt;</span>
        <input className="hal-search" placeholder="SEARCH... (CTRL+SPACE to talk)" value={search} onChange={(e) => onSearchChange(e.target.value)} />
        <MicButton
          onTranscript={handleTranscript}
          onListeningChange={onListeningChange}
          disabled={micDisabled}
          disabledTooltip="No embedded terminal — open a project terminal first"
          onBlockedAttempt={handleBlockedAttempt}
        />
        <span className="hal-voice-target">{voiceFocus === 'hub' ? (halSessionId ? 'HAL' : 'NO LINK') : 'TERM'}</span>
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
          hubFontSize={hubFontSize} termFontSize={termFontSize} wizardFontSize={wizardFontSize} onWizardFontSize={onWizardFontSize}
          voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          particleDensity={particleDensity} onParticleDensityChange={onParticleDensityChange}
          renderQuality={renderQuality} onRenderQualityChange={onRenderQualityChange}
          camera={camera}
          rendererId={rendererId as any} layoutId={layoutId as any} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut}
          onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange as any} onLayoutChange={onLayoutChange as any} onThreeThemeChange={onThreeThemeChange}
          shipVfxEnabled={shipVfxEnabled} onShipVfxEnabledChange={onShipVfxEnabledChange ?? (() => {})}
          voiceReactionIntensity={voiceReactionIntensity} onVoiceReactionIntensityChange={onVoiceReactionIntensityChange ?? (() => {})}
          hiddenPaths={hiddenPaths} onUnhide={onUnhide}
          demo={demo}
        />
        <span className="hal-stat"><span className="hal-stat-n">{projectCount}</span><span className="hal-stat-label"> OPS</span></span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-ok">{readyCount}</span><span className="hal-stat-label"> READY</span></span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-warn">{pendingCount}</span><span className="hal-stat-label"> PENDING</span></span>
      </div>
    </div>
  )
}
