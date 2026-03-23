import { MicButton } from './MicButton'
import { SettingsMenu } from './SettingsMenu'

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
  rendererId: string
  layoutId: string
  onHubFontSize: (size: number) => void
  onTermFontSize: (size: number) => void
  onVoiceOut: (enabled: boolean) => void
  onRendererChange: (id: string) => void
  onLayoutChange: (id: string) => void
}

export function HudTopbar({
  search, onSearchChange, onNewProject, onConvertProject,
  voiceFocus, halSessionId, onListeningChange,
  projectCount, readyCount,
  hubFontSize, termFontSize, voiceOut, rendererId, layoutId,
  onHubFontSize, onTermFontSize, onVoiceOut, onRendererChange, onLayoutChange,
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
        <SettingsMenu
          hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut}
          rendererId={rendererId as any} layoutId={layoutId as any}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut}
          onRendererChange={onRendererChange as any} onLayoutChange={onLayoutChange as any}
        />
        <span className="hal-stat"><span className="hal-stat-n">{projectCount}</span> OPS</span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-ok">{readyCount}</span> READY</span>
        <span className="hal-stat"><span className="hal-stat-n hal-c-warn">{pendingCount}</span> PENDING</span>
      </div>
    </div>
  )
}
