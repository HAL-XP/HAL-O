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

// ── A11: Git push detection — "Ship it!" flyby ──
// Match lines that indicate a successful git push:
//   "Enumerating objects: 5, done."
//   "Writing objects: 100% (5/5)"
//   "To github.com:user/repo.git" or "To https://github.com/..."
//   "main -> main" (branch update confirmation)
// We trigger on the branch-update line ("->") since it appears at the very end,
// confirming the push actually succeeded. Fallback: "To <remote>" pattern.
const GIT_PUSH_PATTERNS = [
  /[a-zA-Z0-9_./-]+\s+->\s+[a-zA-Z0-9_./-]+/,   // "main -> main", "feature/x -> feature/x"
  /To\s+\S+\.git\b/,                                // "To github.com:user/repo.git"
  /To\s+https?:\/\/\S+/,                            // "To https://github.com/..."
]
const GIT_PUSH_COOLDOWN_MS = 5000 // 5s debounce — git push produces many output lines

// FNV-1a hash: deterministic project name → ship index mapping.
// Returns a 32-bit unsigned integer; caller should mod by ship count.
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) // FNV prime
  }
  return hash >>> 0 // unsigned
}

interface PtySession {
  pty: import('node-pty').IPty
  projectPath: string
  projectName: string
  scrollback: string // buffered output for reconnection after renderer reload
  lastPushFlybyTime: number // A11: cooldown timestamp for git push flyby
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
      lastPushFlybyTime: 0,
    }

    p.onData((data) => {
      // Buffer output for reconnection
      session.scrollback += data
      if (session.scrollback.length > SCROLLBACK_SIZE) {
        session.scrollback = session.scrollback.slice(-SCROLLBACK_SIZE)
      }

      // A11: Detect git push success — trigger "Ship it!" flyby
      const now = Date.now()
      if (now - session.lastPushFlybyTime > GIT_PUSH_COOLDOWN_MS) {
        const matched = GIT_PUSH_PATTERNS.some((re) => re.test(data))
        if (matched) {
          session.lastPushFlybyTime = now
          const TOTAL_SHIP_DESIGNS = 11
          const shipIndex = fnv1aHash(session.projectName) % TOTAL_SHIP_DESIGNS
          console.log(`[TerminalManager] A11: Git push detected in "${session.projectName}" — Ship it! flyby (ship #${shipIndex})`)
          try {
            if (this.window && !this.window.isDestroyed()) {
              this.window.webContents.send('ship-it-flyby', {
                projectPath: session.projectPath,
                projectName: session.projectName,
                shipIndex,
              })
            }
          } catch { /* window destroyed during shutdown */ }
        }
      }

      try {
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send(`pty-data-${id}`, data)
        }
      } catch { /* window destroyed during shutdown */ }
    })

    p.onExit(({ exitCode }) => {
      try {
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send(`pty-exit-${id}`, { code: exitCode })
        }
      } catch { /* window destroyed during shutdown */ }
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
