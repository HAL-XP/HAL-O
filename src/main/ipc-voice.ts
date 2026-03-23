// ── Voice IPC handlers ──
// Owner: Agent C (Audio/Voice)

import { ipcMain } from 'electron'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execSync, spawn } from 'child_process'

/** Find a working Python executable (python3 preferred on unix, python on Windows) */
function findPython(): string {
  if (process.platform === 'win32') {
    // On Windows, try 'python' first (standard), then 'python3' (store alias)
    for (const cmd of ['python', 'python3']) {
      try {
        execSync(`${cmd} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
        return cmd
      } catch { /* try next */ }
    }
  } else {
    for (const cmd of ['python3', 'python']) {
      try {
        execSync(`${cmd} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
        return cmd
      } catch { /* try next */ }
    }
  }
  return 'python' // fallback
}

export function registerVoiceHandlers(): void {
  const scriptsDir = resolve(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'scripts')
  const transcribeScript = join(scriptsDir, 'transcribe.py')
  const ttsScript = join(scriptsDir, 'tts.py')
  const pythonExe = findPython()

  ipcMain.handle('voice-transcribe', async (_e, audioBuffer: ArrayBuffer) => {
    const tempPath = join(tmpdir(), `halo_voice_${Date.now()}.ogg`)
    try {
      writeFileSync(tempPath, Buffer.from(audioBuffer))
      const result = execSync(`${pythonExe} "${transcribeScript}" "${tempPath}"`, {
        encoding: 'utf-8',
        timeout: 30000,
        shell: true,
      }).trim()
      return { success: true, text: result }
    } catch (e: any) {
      return { success: false, text: '', error: e.message }
    } finally {
      try { unlinkSync(tempPath) } catch { /* */ }
    }
  })

  ipcMain.handle('voice-speak', async (_e, text: string, profile: string = 'narrator', lang: string = 'en') => {
    const outPath = join(tmpdir(), `halo_tts_${Date.now()}.ogg`)
    return new Promise<{ success: boolean; audioPath?: string; audioDataUrl?: string; error?: string }>((resolve) => {
      const proc = spawn(pythonExe, [ttsScript, text, outPath, profile, lang], {
        timeout: 120000,
      })
      let stderr = ''
      proc.stderr.on('data', (d) => { stderr += d.toString() })
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const audioData = readFileSync(outPath)
            const audioDataUrl = 'data:audio/ogg;base64,' + audioData.toString('base64')
            resolve({ success: true, audioPath: outPath, audioDataUrl })
          } catch {
            resolve({ success: true, audioPath: outPath })
          }
        } else {
          resolve({ success: false, error: stderr || `Exit code ${code}` })
        }
      })
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  })
}
