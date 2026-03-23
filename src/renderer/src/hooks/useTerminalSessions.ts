import { useState, useEffect, useCallback } from 'react'
import type { TerminalSession } from '../types'

export interface TerminalSessionsState {
  termSessions: TerminalSession[]
  voiceFocus: 'hub' | string
  setVoiceFocus: (target: 'hub' | string) => void
  getHalSessionId: () => string | null
  openTerminal: (projectPath: string, projectName: string, resume: boolean) => void
  closeTerminal: (id: string) => void
}

export function useTerminalSessions(): TerminalSessionsState {
  const [termSessions, setTermSessions] = useState<TerminalSession[]>([])
  const [voiceFocus, setVoiceFocus] = useState<'hub' | string>('hub')

  const getHalSessionId = useCallback(() => {
    const hal = termSessions.find((s) =>
      s.id !== '_hal_' && (s.projectPath.includes('hal-o') || s.projectPath.includes('ProjectCreator') || s.projectName === 'HAL-O' || s.projectName === 'Claudeborn')
    )
    return hal?.id || null
  }, [termSessions])

  const openTerminal = useCallback((projectPath: string, projectName: string, resume: boolean) => {
    const id = projectPath.replace(/[^a-zA-Z0-9]/g, '_')
    if (termSessions.find((s) => s.id === id)) return

    const args = ['--dangerously-skip-permissions', '-n', projectName, '--channels', 'plugin:telegram@claude-plugins-official']
    if (resume) args.push('--continue')

    window.api.ptySpawn({
      id,
      cwd: projectPath,
      cmd: 'claude',
      args,
      cols: 120,
      rows: 30,
      projectName,
    })

    setTermSessions((prev) => [...prev, { id, projectName, projectPath }])
    setVoiceFocus(id)
  }, [termSessions])

  const closeTerminal = useCallback((id: string) => {
    window.api.ptyClose(id)
    setTermSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // Restore terminals — reconnect to running ptys (survives renderer reload)
  // AND restore from pending file (survives full app restart)
  useEffect(() => {
    if (!window.api) return

    // First: check for running pty sessions (renderer reload case)
    window.api.ptySessions().then((active) => {
      if (active.length > 0) {
        setTermSessions((prev) => {
          const existing = new Set(prev.map((s) => s.id))
          const toAdd = active.filter((s) => !existing.has(s.id))
          if (toAdd.length === 0) return prev
          return [...prev, ...toAdd.map((s) => ({
            id: s.id,
            projectName: s.projectName,
            projectPath: s.projectPath,
          }))]
        })
      }
    }).catch(() => {})

    // Second: check for pending sessions from full restart
    if (window.api.ptyCheckPending) {
      window.api.ptyCheckPending().then((pending) => {
        if (!pending || pending.length === 0) return
        setTimeout(() => {
          for (const s of pending) {
            openTerminal(s.projectPath, s.projectName, true)
          }
        }, 1000)
      }).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { termSessions, voiceFocus, setVoiceFocus, getHalSessionId, openTerminal, closeTerminal }
}
