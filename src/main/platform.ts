import { spawn } from 'child_process'
import { chmodSync } from 'fs'
import { join, sep } from 'path'

export const isWin = process.platform === 'win32'
export const isMac = process.platform === 'darwin'
export const isLinux = process.platform === 'linux'

/** Escape special characters for cmd.exe argument strings */
export function escapeCmdArg(s: string): string {
  return s.replace(/([&|<>^])/g, '^$1')
}

// ── Launch script generation (.bat / .sh) ──

export function generateLaunchScript(
  agentName: string,
  resume: boolean,
  skipPermissions: boolean,
): { filename: string; content: string } {
  const args = [`-n "${agentName}"`]
  if (skipPermissions) args.push('--dangerously-skip-permissions')
  if (resume) args.push('--resume')
  const claudeCmd = `claude ${args.join(' ')}`

  if (isWin) {
    const lines = [
      '@echo off',
      `title * ${agentName}`,
      claudeCmd,
      '',
    ]
    return {
      filename: resume ? '_CLAUDE_CLI_RESUME.bat' : '_CLAUDE_CLI_NEW.bat',
      content: lines.join('\r\n'),
    }
  } else {
    const lines = [
      '#!/bin/bash',
      claudeCmd,
      '',
    ]
    return {
      filename: resume ? '_CLAUDE_CLI_RESUME.sh' : '_CLAUDE_CLI_NEW.sh',
      content: lines.join('\n'),
    }
  }
}

export function makeExecutable(filePath: string): void {
  if (!isWin) {
    try { chmodSync(filePath, '755') } catch { /* best effort */ }
  }
}

// ── Open terminal at path ──

export function openTerminalAt(path: string, command?: string): void {
  if (isWin) {
    const winPath = path.replace(/\//g, '\\')
    if (command) {
      const safeCmd = escapeCmdArg(command)
      spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${winPath}" && ${safeCmd}`], {
        cwd: winPath, detached: true, stdio: 'ignore',
      })
    } else {
      spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${winPath}"`], {
        cwd: winPath, detached: true, stdio: 'ignore',
      })
    }
  } else if (isMac) {
    if (command) {
      spawn('osascript', ['-e', `tell application "Terminal" to do script "cd '${path}' && ${command}"`], {
        detached: true, stdio: 'ignore',
      })
    } else {
      spawn('open', ['-a', 'Terminal', path], { detached: true, stdio: 'ignore' })
    }
  } else {
    // Linux — try common terminal emulators
    const cmd = command ? `cd '${path}' && ${command}` : `cd '${path}' && exec $SHELL`
    const terminals = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']
    for (const term of terminals) {
      try {
        if (term === 'gnome-terminal') {
          spawn(term, ['--', 'bash', '-c', cmd], { detached: true, stdio: 'ignore' })
        } else {
          spawn(term, ['-e', `bash -c '${cmd}'`], { detached: true, stdio: 'ignore' })
        }
        return
      } catch { continue }
    }
  }
}

// ── Run launch script ──

export function runLaunchScript(projectPath: string, scriptName: string): void {
  const scriptPath = join(projectPath, scriptName)
  if (isWin) {
    spawn('cmd', ['/c', 'start', '', `"${scriptPath}"`], {
      cwd: projectPath, detached: true, stdio: 'ignore',
    })
  } else {
    openTerminalAt(projectPath, scriptPath)
  }
}

// ── Tool install commands ──

export function getGitInstallInfo(): { command: string; label: string } {
  if (isWin) {
    return { command: 'winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements', label: 'Install via winget' }
  } else if (isMac) {
    return { command: 'xcode-select --install', label: 'Install via Xcode tools' }
  }
  return { command: 'sudo apt install git || sudo dnf install git', label: 'Install via package manager' }
}

export function getPythonInstallInfo(): { command: string; label: string } {
  if (isWin) {
    return { command: 'winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements', label: 'Install via winget' }
  } else if (isMac) {
    return { command: 'brew install python', label: 'Install via Homebrew' }
  }
  return { command: 'sudo apt install python3 python3-pip || sudo dnf install python3 python3-pip', label: 'Install via package manager' }
}

export function getClaudeCliInstallInfo(): { command: string; label: string } {
  return { command: 'npm install -g @anthropic-ai/claude-code', label: 'Install via npm' }
}

export function getFfmpegInstallInfo(): { command: string; label: string } {
  if (isWin) {
    return { command: 'winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements', label: 'Install via winget' }
  } else if (isMac) {
    return { command: 'brew install ffmpeg', label: 'Install via Homebrew' }
  }
  return { command: 'sudo apt install ffmpeg || sudo dnf install ffmpeg', label: 'Install via package manager' }
}

export function getGhInstallInfo(): { command: string; label: string } {
  if (isWin) {
    return {
      command: 'winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements',
      label: 'Install via winget',
    }
  } else if (isMac) {
    return {
      command: 'brew install gh',
      label: 'Install via Homebrew',
    }
  } else {
    return {
      command: 'sudo apt install gh || sudo dnf install gh',
      label: 'Install via package manager',
    }
  }
}

// ── Process kill command (for generated docs) ──

export function getKillCommand(pid?: number): string {
  if (isWin) {
    return pid ? `taskkill //PID ${pid} //T //F` : 'taskkill //PID <pid> //T //F'
  }
  return pid ? `kill -TERM ${pid}` : 'kill -TERM <pid>'
}

export function getFindProcessCommand(): string {
  if (isWin) return 'tasklist | grep'
  return 'ps aux | grep'
}

// ── Open project in IDE ──

/** IDE definition: command-line binary name, display label, short button label */
export interface IdeDefinition {
  id: string
  cmd: string
  name: string
  shortLabel: string // 2-6 char label for button (e.g. "CODE", "CURSOR", "WS")
}

/** All supported IDEs — order is the fallback priority for auto-detect */
export const IDE_CANDIDATES: IdeDefinition[] = [
  { id: 'vscode',    cmd: 'code',      name: 'VS Code',        shortLabel: 'CODE' },
  { id: 'cursor',    cmd: 'cursor',    name: 'Cursor',         shortLabel: 'CURSOR' },
  { id: 'webstorm',  cmd: 'webstorm',  name: 'WebStorm',       shortLabel: 'WS' },
  { id: 'idea',      cmd: 'idea',      name: 'IntelliJ IDEA',  shortLabel: 'IDEA' },
  { id: 'fleet',     cmd: 'fleet',     name: 'Fleet',          shortLabel: 'FLEET' },
  { id: 'zed',       cmd: 'zed',       name: 'Zed',            shortLabel: 'ZED' },
  { id: 'sublime',   cmd: 'subl',      name: 'Sublime Text',   shortLabel: 'SUBL' },
  { id: 'atom',      cmd: 'atom',      name: 'Atom',           shortLabel: 'ATOM' },
]

/** Check if a CLI command is available on PATH */
function isCommandAvailable(cmd: string): boolean {
  const whichCmd = isWin ? 'where' : 'which'
  try {
    require('child_process').execSync(`${whichCmd} ${cmd}`, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

/** Auto-detect IDE from project directory files.
 *  Scans for .vscode/, .idea/, .fleet/, *.code-workspace.
 *  Returns the IDE id or null if no IDE markers found. */
export function detectProjectIde(projectPath: string): string | null {
  const { existsSync, readdirSync } = require('fs')

  // Check for IDE-specific directories/files
  if (existsSync(join(projectPath, '.vscode'))) {
    // Could be VS Code or Cursor — check if Cursor is installed, otherwise VS Code
    if (isCommandAvailable('cursor')) return 'cursor'
    return 'vscode'
  }

  if (existsSync(join(projectPath, '.idea'))) {
    // JetBrains — could be WebStorm or IntelliJ
    if (isCommandAvailable('webstorm')) return 'webstorm'
    if (isCommandAvailable('idea')) return 'idea'
    return 'webstorm' // default to WebStorm for web projects
  }

  if (existsSync(join(projectPath, '.fleet'))) return 'fleet'

  // Check for *.code-workspace files
  try {
    const files = readdirSync(projectPath) as string[]
    if (files.some((f: string) => f.endsWith('.code-workspace'))) {
      if (isCommandAvailable('cursor')) return 'cursor'
      return 'vscode'
    }
  } catch { /* */ }

  return null
}

/** Resolve which IDE to use for a project.
 *  Priority: per-project override > auto-detect from files > global default > first available.
 *  Returns the IDE definition or null if no IDE is available. */
export function resolveIde(projectPath: string, perProjectIde?: string | null, globalDefault?: string | null): IdeDefinition | null {
  // 1. Per-project override
  if (perProjectIde && perProjectIde !== 'auto') {
    const ide = IDE_CANDIDATES.find(c => c.id === perProjectIde)
    if (ide && isCommandAvailable(ide.cmd)) return ide
  }

  // 2. Auto-detect from project files (when per-project is 'auto' or not set, or global is 'auto')
  const detected = detectProjectIde(projectPath)
  if (detected) {
    const ide = IDE_CANDIDATES.find(c => c.id === detected)
    if (ide && isCommandAvailable(ide.cmd)) return ide
  }

  // 3. Global default
  if (globalDefault && globalDefault !== 'auto') {
    const ide = IDE_CANDIDATES.find(c => c.id === globalDefault)
    if (ide && isCommandAvailable(ide.cmd)) return ide
  }

  // 4. First available on PATH
  for (const ide of IDE_CANDIDATES) {
    if (isCommandAvailable(ide.cmd)) return ide
  }

  return null
}

/** Open a project directory in a specific IDE (by id) or auto-resolve.
 *  Returns the IDE name that was launched, or throws if none found. */
export function openInIde(projectPath: string, ideId?: string): string {
  const winPath = isWin ? projectPath.replace(/\//g, '\\') : projectPath

  let ide: IdeDefinition | undefined

  if (ideId) {
    ide = IDE_CANDIDATES.find(c => c.id === ideId)
    if (ide && !isCommandAvailable(ide.cmd)) {
      throw new Error(`${ide.name} is not installed or not on PATH.`)
    }
  }

  if (!ide) {
    // Fallback: try each candidate in priority order
    for (const candidate of IDE_CANDIDATES) {
      if (isCommandAvailable(candidate.cmd)) {
        ide = candidate
        break
      }
    }
  }

  if (!ide) {
    throw new Error('No supported IDE found on PATH. Install VS Code, Cursor, or another IDE and ensure it is on PATH.')
  }

  spawn(ide.cmd, [winPath], {
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,
  }).unref()

  return ide.name
}

// ── Path display ──

export function displayPath(...parts: string[]): string {
  return parts.join(sep)
}

// ── Default project paths ──

export function getCommonProjectDirs(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const dirs = [
    join(home, 'GitHub'),
    join(home, 'Projects'),
    join(home, 'repos'),
    join(home, 'dev'),
    join(home, 'code'),
    join(home, 'src'),
  ]

  if (isWin) {
    for (const drive of ['D', 'E', 'F']) {
      dirs.unshift(join(`${drive}:\\`, 'GitHub'))
      dirs.push(join(`${drive}:\\`, 'Projects'))
    }
  }

  if (isMac) {
    dirs.unshift(join(home, 'Developer'))
  }

  dirs.push(join(home, 'Documents', 'GitHub'))
  return dirs
}

// ── Icon path ──

export function getIconFilename(): string {
  return isWin ? 'icon.ico' : 'icon.png'
}

// ── Script extension for generated projects ──

export function getLaunchScriptNames(): { newScript: string; resumeScript: string } {
  if (isWin) {
    return { newScript: '_CLAUDE_CLI_NEW.bat', resumeScript: '_CLAUDE_CLI_RESUME.bat' }
  }
  return { newScript: '_CLAUDE_CLI_NEW.sh', resumeScript: '_CLAUDE_CLI_RESUME.sh' }
}
