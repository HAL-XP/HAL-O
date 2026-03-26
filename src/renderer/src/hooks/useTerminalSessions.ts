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

// Module-level: hidden HAL session ID (PTY alive but tab closed)
let _hiddenHalId: string | null = null
// Module-level: external HAL session detected at boot (running outside the app)
let _externalHalDetected = false

/** Check if we're in a non-interactive context (tests, CI) */
function isTestMode(): boolean {
  return !!window.process?.argv?.some((a: string) => a.includes('--fast-wizards') || a.includes('--user-data-dir'))
}

export function useTerminalSessions(demoEnabled = false): TerminalSessionsState {
  const [termSessions, setTermSessions] = useState<TerminalSession[]>([])
  const [voiceFocus, setVoiceFocus] = useState<'hub' | string>('hub')

  const getHalSessionId = useCallback(() => {
    // Check visible sessions first
    const hal = termSessions.find((s) =>
      s.id !== '_hal_' && (s.projectPath.includes('hal-o') || s.projectPath.includes('ProjectCreator') || s.projectName === 'HAL-O' || s.projectName === 'Claudeborn')
    )
    if (hal) return hal.id
    // Check hidden HAL session (tab was closed but PTY still alive)
    return _hiddenHalId
  }, [termSessions])

  const openTerminal = useCallback((projectPath: string, projectName: string, resume: boolean) => {
    // Guard: no PTY spawning in demo/test mode
    if (demoEnabled || isTestMode()) return

    const id = projectPath.replace(/[^a-zA-Z0-9]/g, '_')
    if (termSessions.find((s) => s.id === id)) return

    // If this is the hidden HAL session, just re-show it (PTY still alive)
    if (_hiddenHalId === id) {
      _hiddenHalId = null
      setTermSessions((prev) => [...prev, { id, projectName, projectPath }])
      setVoiceFocus(id)
      return
    }

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
    // HAL session is special — hide instead of kill. The PTY stays alive in background
    // so the sphere shows ONLINE and voice routing continues to work.
    const session = termSessions.find(s => s.id === id)
    const isHal = session && (
      session.projectPath.includes('hal-o') ||
      session.projectName === 'HAL-O' ||
      session.projectName === 'Claudeborn'
    )
    if (isHal) {
      // Remove from visible tabs but DON'T kill the PTY
      setTermSessions((prev) => prev.filter((s) => s.id !== id))
      // Keep the ID in a hidden set so getHalSessionId still returns it
      _hiddenHalId = id
      return
    }
    window.api.ptyClose(id)
    setTermSessions((prev) => prev.filter((s) => s.id !== id))
  }, [termSessions])

  // Restore terminals — reconnect to running ptys (survives renderer reload)
  // AND restore from pending file (survives full app restart)
  // Skip entirely in demo mode, test mode, or CI — no real PTY sessions needed
  useEffect(() => {
    if (!window.api || demoEnabled || isTestMode()) return

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
    // Only auto-restore the most recent 2 sessions to avoid flooding
    if (window.api.ptyCheckPending) {
      window.api.ptyCheckPending().then((pending) => {
        if (!pending || pending.length === 0) return
        const toRestore = pending.slice(-2) // most recent 2 only
        setTimeout(() => {
          for (const s of toRestore) {
            openTerminal(s.projectPath, s.projectName, true)
          }
        }, 1000)
      }).catch(() => {})
    }

    // Third: detect external HAL session (running outside the app, e.g. this terminal)
    // Uses the async detect-external-sessions IPC which checks for Claude processes
    if (window.api.detectExternalSessions) {
      window.api.detectExternalSessions().then((sessions) => {
        const halExternal = sessions.find((s: any) =>
          s.projectPath?.toLowerCase().includes('hal-o') ||
          s.projectName?.toLowerCase().includes('hal-o')
        )
        if (halExternal) {
          _externalHalDetected = true
          // Set hidden HAL ID so sphere shows ONLINE without a visible tab
          _hiddenHalId = `_external_hal_${halExternal.pid}`
        }
      }).catch(() => {})
    }
  }, [demoEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { termSessions, voiceFocus, setVoiceFocus, getHalSessionId, openTerminal, closeTerminal }
}
