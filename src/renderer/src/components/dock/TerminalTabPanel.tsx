/**
 * TerminalTabPanel — dockview panel that wraps a single TerminalPanel.
 *
 * Each terminal session gets its own dockview panel instance.  The session ID
 * is stored in dockview's panel params (params.sessionId) and retrieved via
 * the IDockviewPanelProps.  The rest of the config comes from DockCtx.
 *
 * Uses dockview's "always" renderer so xterm.js WebGL contexts survive
 * tab/group rearrangement without remounting.
 */

import { useContext, useMemo } from 'react'
import type { IDockviewPanelProps } from 'dockview'
import { TerminalPanel } from '../TerminalPanel'
import { DockCtx } from './DockContext'

export interface TerminalTabParams {
  sessionId: string
}

export function TerminalTabPanel(props: IDockviewPanelProps<TerminalTabParams>) {
  const ctx = useContext(DockCtx)
  const sessionId = props.params.sessionId

  // Determine if this terminal is the "active" one for voice focus
  const isActive = useMemo(
    () => ctx?.terminal.voiceFocus === sessionId,
    [ctx?.terminal.voiceFocus, sessionId],
  )

  if (!ctx || !sessionId) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#0d1117', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        {!ctx ? 'DockContext not available' : 'No session ID'}
      </div>
    )
  }

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onClick={() => ctx.terminal.onVoiceFocus?.(sessionId)}
    >
      <TerminalPanel
        sessionId={sessionId}
        active={isActive ?? false}
        fontSize={ctx.terminal.fontSize}
        voiceOut={ctx.terminal.voiceOut}
        voiceProfile={ctx.terminal.voiceProfile}
      />
    </div>
  )
}
