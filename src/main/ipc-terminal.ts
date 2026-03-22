// ── Terminal (pty) IPC handlers ──
// Owner: Agent B (Terminal + Core)

import { ipcMain } from 'electron'
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { terminalManager } from './terminal-manager'
import { openTerminalAt } from './platform'

export function registerTerminalHandlers(): void {
  ipcMain.handle('pty-spawn', async (_e, options: {
    id: string; cwd: string; cmd: string; args: string[]
    cols: number; rows: number; projectName: string
  }) => {
    return { success: terminalManager.spawn(options.id, options) }
  })

  ipcMain.handle('pty-input', async (_e, id: string, data: string) => {
    terminalManager.write(id, data)
  })

  ipcMain.handle('pty-resize', async (_e, id: string, cols: number, rows: number) => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('pty-close', async (_e, id: string) => {
    terminalManager.close(id)
  })

  ipcMain.handle('pty-scrollback', async (_e, id: string) => {
    return terminalManager.getScrollback(id)
  })

  ipcMain.handle('pty-sessions', async () => {
    return terminalManager.getActiveSessions()
  })

  const pendingSessionsFile = join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.claudeborn-pending-sessions.json'
  )

  // Pop a specific terminal to external window (e.g. before app restart)
  ipcMain.handle('pty-pop-external', async (_e, sessionId: string) => {
    const sessions = terminalManager.getActiveSessions()
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      openTerminalAt(session.projectPath, `claude --dangerously-skip-permissions --channels plugin:telegram@claude-plugins-official -n "${session.projectName}" --continue`)
      terminalManager.close(session.id)
      return true
    }
    return false
  })

  // Save all active sessions to disk before restart, pop them to external
  ipcMain.handle('pty-pre-restart', async () => {
    const sessions = terminalManager.getActiveSessions()
    if (sessions.length === 0) return 0

    writeFileSync(pendingSessionsFile, JSON.stringify(
      sessions.map((s) => ({ projectPath: s.projectPath, projectName: s.projectName }))
    ))

    for (const s of sessions) {
      openTerminalAt(s.projectPath, `claude --dangerously-skip-permissions --channels plugin:telegram@claude-plugins-official -n "${s.projectName}" --continue`)
      terminalManager.close(s.id)
    }

    return sessions.length
  })

  // Check for pending sessions from a previous restart
  ipcMain.handle('pty-check-pending', async () => {
    try {
      if (!existsSync(pendingSessionsFile)) return []
      const data = JSON.parse(readFileSync(pendingSessionsFile, 'utf-8'))
      unlinkSync(pendingSessionsFile) // consume it
      return data as Array<{ projectPath: string; projectName: string }>
    } catch {
      return []
    }
  })
}
