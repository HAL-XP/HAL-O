import type { BrowserWindow } from 'electron'

// node-pty is a native module — try prebuilt first, then regular
let pty: typeof import('node-pty') | undefined
try {
  pty = require('node-pty-prebuilt-multiarch')
} catch {
  try {
    pty = require('node-pty')
  } catch {
    console.error('node-pty not available — embedded terminal disabled')
  }
}

const SCROLLBACK_SIZE = 50000 // chars to keep for reconnection

interface PtySession {
  pty: import('node-pty').IPty
  projectPath: string
  projectName: string
  scrollback: string // buffered output for reconnection after renderer reload
}

export class TerminalManager {
  private sessions = new Map<string, PtySession>()
  private window: BrowserWindow | null = null

  setWindow(win: BrowserWindow) {
    this.window = win
  }

  spawn(id: string, options: {
    cwd: string
    cmd: string
    args: string[]
    cols: number
    rows: number
    projectName: string
  }): boolean {
    if (!pty || !this.window) {
      console.error('[TerminalManager] pty not available or no window')
      return false
    }
    if (this.sessions.has(id)) return true // already running

    console.log(`[TerminalManager] Spawning: ${options.cmd} ${options.args.join(' ')} in ${options.cwd}`)

    const isWin = process.platform === 'win32'
    const shell = isWin ? 'cmd.exe' : '/bin/bash'
    const cmdLine = [options.cmd, ...options.args].join(' ')
    const shellArgs = isWin ? ['/k', cmdLine] : ['-c', cmdLine]

    const p = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: { ...process.env },
    })

    console.log(`[TerminalManager] PID: ${p.pid}`)

    const session: PtySession = {
      pty: p,
      projectPath: options.cwd,
      projectName: options.projectName,
      scrollback: '',
    }

    p.onData((data) => {
      // Buffer output for reconnection
      session.scrollback += data
      if (session.scrollback.length > SCROLLBACK_SIZE) {
        session.scrollback = session.scrollback.slice(-SCROLLBACK_SIZE)
      }
      this.window?.webContents.send(`pty-data-${id}`, data)
    })

    p.onExit(({ exitCode }) => {
      this.window?.webContents.send(`pty-exit-${id}`, { code: exitCode })
      this.sessions.delete(id)
    })

    this.sessions.set(id, session)
    return true
  }

  // Get buffered scrollback for reconnection after renderer reload
  getScrollback(id: string): string {
    return this.sessions.get(id)?.scrollback || ''
  }

  write(id: string, data: string) {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    this.sessions.get(id)?.pty.resize(cols, rows)
  }

  close(id: string) {
    const session = this.sessions.get(id)
    if (session) {
      session.pty.kill()
      this.sessions.delete(id)
    }
  }

  isRunning(id: string): boolean {
    return this.sessions.has(id)
  }

  getActiveSessions(): Array<{ id: string; projectName: string; projectPath: string }> {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      projectName: s.projectName,
      projectPath: s.projectPath,
    }))
  }

  closeAll() {
    this.sessions.forEach((s) => s.pty.kill())
    this.sessions.clear()
  }
}

export const terminalManager = new TerminalManager()
