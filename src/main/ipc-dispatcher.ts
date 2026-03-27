// ── Dispatcher IPC handlers ──
// Exposes message routing to the renderer process.

import { ipcMain } from 'electron'
import { dispatchMessage, setStickySession, getStickySession, setTerminalListProvider, matchVoiceSwitch, getActiveTerminals, getVoiceForProject, type ProjectTerminal } from './dispatcher'
import { terminalManager } from './terminal-manager'

export function registerDispatcherHandlers(): void {
  // Provide terminal list to dispatcher
  setTerminalListProvider((): ProjectTerminal[] => {
    const sessions = terminalManager.getActiveSessions()
    return sessions.map(s => ({
      sessionId: s.id,
      projectName: s.projectName,
      projectPath: s.projectPath,
    }))
  })

  // Dispatch a message — returns which terminal to route to
  ipcMain.handle('dispatch-message', async (_e, message: string) => {
    return dispatchMessage(message)
  })

  // Set the sticky session (when user clicks a terminal or card)
  ipcMain.handle('set-sticky-session', async (_e, sessionId: string | null) => {
    setStickySession(sessionId)
    return { success: true }
  })

  // Get the current sticky session
  ipcMain.handle('get-sticky-session', async () => {
    return getStickySession()
  })

  // Voice switch: "work on my react app" / "list projects"
  ipcMain.handle('voice-switch', async (_e, message: string) => {
    const terminals = getActiveTerminals()
    const result = matchVoiceSwitch(message, terminals)
    if (result.type === 'switch' && result.sessionId) {
      setStickySession(result.sessionId)
    }
    if (result.type === 'list') {
      return { type: 'list', projects: terminals.map(t => ({ name: t.projectName, sessionId: t.sessionId })) }
    }
    return result
  })

  // Get voice profile for a project (from alias config)
  ipcMain.handle('get-voice-for-project', async (_e, projectName: string) => {
    return getVoiceForProject(projectName)
  })
}
