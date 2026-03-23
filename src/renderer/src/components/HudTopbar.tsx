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
  camera: CameraSettings
  cameraTweaking: boolean
  onCameraChange: (cam: CameraSettings) => void
  onCameraTweakingChange: (on: boolean) => void
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
  demo?: DemoSettings
}

export function HudTopbar({
  search, onSearchChange, onNewProject, onConvertProject,
  voiceFocus, halSessionId, onListeningChange,
  projectCount, readyCount,
  hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, camera, cameraTweaking, rendererId, layoutId, threeTheme,
  onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, onScreenOpacityChange, onCameraChange, onCameraTweakingChange, onCameraReset, onRendererChange, onLayoutChange, onThreeThemeChange,
  groups = [], onCreateGroup, onDeleteGroup, onRenameGroup, onReorderGroups, onApplyPreset,
  demo,
}: HudTopbarProps) {
  const pendingCount = projectCount - readyCount

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
    } else {
      // Hub focused, no HAL — just search
      onSearchChange(text)
    }
  }

  return (
    <div className="hal-topbar">
      <div className="hal-topbar-left">
        <span className="hal-sys-label">SYS://HAL-O</span>
        <span className="hal-sys-ver">v1.0</span>
        <button className="hal-cmd deploy" onClick={onNewProject} style={{ marginLeft: 16, padding: '3px 10px', fontSize: '9px' }}>+ NEW</button>
        <button className="hal-cmd" onClick={async () => { const f = await window.api.selectFolder(); if (f) onConvertProject(f) }} style={{ padding: '3px 10px', fontSize: '9px' }}>+ RECRUIT</button>
      </div>
      <div className="hal-topbar-center">
        <span className="hal-prompt">&gt;</span>
        <input className="hal-search" placeholder="SEARCH... (CTRL+SPACE to talk)" value={search} onChange={(e) => onSearchChange(e.target.value)} />
        <MicButton onTranscript={handleTranscript} onListeningChange={onListeningChange} />
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
          hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          camera={camera} cameraTweaking={cameraTweaking}
          rendererId={rendererId as any} layoutId={layoutId as any} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut}
          onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraTweakingChange={onCameraTweakingChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange as any} onLayoutChange={onLayoutChange as any} onThreeThemeChange={onThreeThemeChange}
          demo={demo}
        />
        <span className="hal-stat"><span className="hal-stat-n">{projectCount}</span> OPS</span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-ok">{readyCount}</span> READY</span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-warn">{pendingCount}</span> PENDING</span>
      </div>
    </div>
  )
}
