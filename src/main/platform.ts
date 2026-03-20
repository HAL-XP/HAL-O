import { spawn } from 'child_process'
import { chmodSync } from 'fs'
import { join, sep } from 'path'

export const isWin = process.platform === 'win32'
export const isMac = process.platform === 'darwin'
export const isLinux = process.platform === 'linux'

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
    if (command) {
      spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${path}" && ${command}`], {
        detached: true, stdio: 'ignore',
      })
    } else {
      spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${path}"`], {
        detached: true, stdio: 'ignore',
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
    spawn('cmd', ['/c', 'start', '', scriptPath], {
      cwd: projectPath, detached: true, stdio: 'ignore',
    })
  } else {
    openTerminalAt(projectPath, scriptPath)
  }
}

// ── gh CLI install command ──

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
