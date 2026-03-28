// ── Session Externalize ──
// Spawns a Claude session DETACHED from Electron's process tree.
// This is critical: Windows kills child processes when the parent exits.
// Using wmic (or PowerShell Start-Process) creates a truly independent process.
//
// Flow: Electron about to die → externalizeSession() → Claude runs outside → Electron can safely exit
// On next boot: session-lifecycle reads the state file for fast recovery → auto-absorb

import { execSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { getInstanceName, dataPath } from './instance'

// ── State file — fast recovery path for session-lifecycle ──
const STATE_FILE_NAME = '.hal-o-external-session'

function getStateFilePath(): string {
  return dataPath(STATE_FILE_NAME)
}

export interface ExternalSessionState {
  pid: number
  instanceName: string
  cwd: string
  startedAt: string
  /** The command that was used to spawn */
  command: string
}

/** Save external session state for fast recovery on next boot */
function saveState(state: ExternalSessionState): void {
  try {
    writeFileSync(getStateFilePath(), JSON.stringify(state, null, 2), 'utf-8')
    console.log(`[Externalize] State saved: PID ${state.pid} → ${getStateFilePath()}`)
  } catch (err) {
    console.error('[Externalize] Failed to save state file:', err)
  }
}

/** Load external session state (fast path — no process scan needed) */
export function loadExternalSessionState(): ExternalSessionState | null {
  const filePath = getStateFilePath()
  try {
    if (!existsSync(filePath)) return null
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (raw && typeof raw.pid === 'number' && raw.instanceName) {
      return raw as ExternalSessionState
    }
  } catch {
    // Corrupt or missing — ignore
  }
  return null
}

/** Remove the state file (called after successful absorb) */
export function clearExternalSessionState(): void {
  const filePath = getStateFilePath()
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
      console.log('[Externalize] State file cleared')
    }
  } catch { /* best effort */ }
}

/**
 * Check if a specific PID is alive.
 * Uses tasklist on Windows (fast, no WMI overhead).
 */
export function verifyExternalSession(pid: number): boolean {
  if (process.platform !== 'win32') {
    // Unix: signal 0 checks existence without killing
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  try {
    const out = execSync(
      `tasklist /FI "PID eq ${pid}" /NH /FO CSV`,
      { encoding: 'utf-8', timeout: 5000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    // tasklist CSV output: "process.exe","PID","Session Name","Session#","Mem Usage"
    // If PID not found: "INFO: No tasks are running..."
    return out.includes(`"${pid}"`)
  } catch {
    return false
  }
}

/**
 * Spawn Claude DETACHED from Electron's process tree.
 *
 * Strategy (Windows):
 *   1. Try wmic process call create — creates process outside job object
 *   2. Fallback: PowerShell Start-Process — also detached from parent
 *
 * Returns the PID of the spawned process, or null on failure.
 */
export async function externalizeSession(): Promise<number | null> {
  if (process.platform !== 'win32') {
    console.warn('[Externalize] Only Windows supported currently')
    return null
  }

  const instanceName = getInstanceName()
  const cwd = process.cwd()
  // The claude command: continue the same session, named for this instance
  const claudeCmd = `cd /d "${cwd}" && claude --dangerously-skip-permissions --continue -n "${instanceName}" --channels plugin:telegram@claude-plugins-official --permission-mode bypassPermissions`

  console.log(`[Externalize] Spawning external ${instanceName} session...`)
  console.log(`[Externalize] CWD: ${cwd}`)

  let spawnedPid: number | null = null

  // ── Strategy 1: wmic (truly detached, outside job object) ──
  spawnedPid = await tryWmic(claudeCmd, cwd)

  // ── Strategy 2: PowerShell Start-Process fallback ──
  if (spawnedPid === null) {
    console.log('[Externalize] wmic failed, trying PowerShell Start-Process...')
    spawnedPid = await tryPowerShell(claudeCmd, cwd)
  }

  if (spawnedPid === null) {
    console.error('[Externalize] FAILED: Could not spawn external session via any method')
    return null
  }

  // ── Verify the process is alive ──
  console.log(`[Externalize] Spawned cmd.exe PID ${spawnedPid}, waiting for Claude CLI...`)

  const claudePid = await waitForClaude(instanceName, 15)
  if (claudePid !== null) {
    console.log(`[Externalize] Claude CLI confirmed alive: PID ${claudePid}`)
    const state: ExternalSessionState = {
      pid: claudePid,
      instanceName,
      cwd,
      startedAt: new Date().toISOString(),
      command: claudeCmd,
    }
    saveState(state)
    return claudePid
  }

  // Claude CLI didn't appear, but cmd.exe is running — save that PID instead
  if (verifyExternalSession(spawnedPid)) {
    console.warn(`[Externalize] Claude CLI not detected, but cmd.exe (PID ${spawnedPid}) is alive. Saving cmd PID.`)
    const state: ExternalSessionState = {
      pid: spawnedPid,
      instanceName,
      cwd,
      startedAt: new Date().toISOString(),
      command: claudeCmd,
    }
    saveState(state)
    return spawnedPid
  }

  console.error('[Externalize] Spawned process died before verification completed')
  return null
}

// ── CIM strategy (replaces deprecated wmic, works on Windows 11) ──

async function tryWmic(claudeCmd: string, _cwd: string): Promise<number | null> {
  try {
    // Invoke-CimMethod creates a process outside the current job object (truly detached).
    // This replaced wmic which was removed in Windows 11.
    const cimTarget = `cmd.exe /c ${claudeCmd}`
    const psCmd = `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='${cimTarget.replace(/'/g, "''")}'}; if ($r.ReturnValue -eq 0) { $r.ProcessId } else { throw 'CIM create failed' }`

    console.log('[Externalize] Trying CIM (Invoke-CimMethod)...')
    const output = execSync(`powershell -NoProfile -Command "${psCmd.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const pid = parseInt(output.trim())
    if (pid && !isNaN(pid)) {
      console.log(`[Externalize] CIM spawned PID: ${pid}`)
      return pid
    }

    console.warn('[Externalize] CIM succeeded but could not parse PID:', output.trim())
    return null
  } catch (err) {
    console.warn('[Externalize] CIM failed:', (err as Error).message)
    return null
  }
}

// ── PowerShell Start-Process fallback ──

async function tryPowerShell(claudeCmd: string, cwd: string): Promise<number | null> {
  try {
    // Start-Process with -PassThru gives us the PID
    // Using cmd.exe as the target so we get a visible terminal window
    const psCmd = [
      'powershell', '-NoProfile', '-Command',
      `$p = Start-Process cmd.exe -ArgumentList '/k','cd /d "${cwd}" && claude --dangerously-skip-permissions --continue -n "${getInstanceName()}" --channels plugin:telegram@claude-plugins-official --permission-mode bypassPermissions' -PassThru; Write-Output $p.Id`,
    ]

    console.log('[Externalize] Trying PowerShell Start-Process...')
    const output = execSync(psCmd.join(' '), {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const pid = parseInt(output.trim())
    if (!isNaN(pid) && pid > 0) {
      console.log(`[Externalize] PowerShell spawned PID: ${pid}`)
      return pid
    }

    console.warn('[Externalize] PowerShell Start-Process returned invalid PID:', output.trim())
    return null
  } catch (err) {
    console.error('[Externalize] PowerShell Start-Process failed:', (err as Error).message)
    return null
  }
}

// ── Wait for Claude CLI process ──

/**
 * Poll for claude.exe to appear in the process list (associated with our instance).
 * Returns the PID if found within timeoutSec, or null.
 */
async function waitForClaude(instanceName: string, timeoutSec: number): Promise<number | null> {
  const pollIntervalMs = 1000
  const maxPolls = timeoutSec

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollIntervalMs))

    try {
      const pid = findClaudeProcess(instanceName)
      if (pid !== null) return pid
    } catch {
      // Ignore transient errors during polling
    }

    if (i > 0 && i % 5 === 0) {
      console.log(`[Externalize] Still waiting for Claude CLI... (${i}s)`)
    }
  }

  return null
}

/**
 * Find a claude.exe process matching this instance name.
 * Uses tasklist + wmic for command line inspection.
 */
function findClaudeProcess(instanceName: string): number | null {
  if (process.platform !== 'win32') return null

  try {
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='claude.exe'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`
    const output = execSync(psCmd, {
      encoding: 'utf-8',
      timeout: 8000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const lines = output.trim().split('\n').slice(1) // skip CSV header
    for (const line of lines) {
      const match = line.match(/"(\d+)","(.+)"/)
      if (match) {
        const pid = parseInt(match[1])
        const cmdLine = match[2]
        // Must match our instance name
        const namePattern = `-n ${instanceName}`
        const namePatternQuoted = `-n "${instanceName}"`
        if (cmdLine.includes(namePattern) || cmdLine.includes(namePatternQuoted)) {
          // Skip if it's running inside Electron (embedded terminal)
          if (cmdLine.includes('electron') || cmdLine.includes('node_modules')) continue
          return pid
        }
      }
    }
  } catch {
    // WMI query failed — transient
  }

  return null
}
