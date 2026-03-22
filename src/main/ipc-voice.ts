// ── Voice IPC handlers ──
// Owner: Agent C (Audio/Voice)

import { ipcMain } from 'electron'
import { writeFileSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execSync, spawn } from 'child_process'

export function registerVoiceHandlers(): void {
  const scriptsDir = resolve(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'scripts')
  const transcribeScript = join(scriptsDir, 'transcribe.py')
  const ttsScript = join(scriptsDir, 'tts.py')

  ipcMain.handle('voice-transcribe', async (_e, audioBuffer: ArrayBuffer) => {
    const tempPath = join(tmpdir(), `claudeborn_voice_${Date.now()}.ogg`)
    try {
      writeFileSync(tempPath, Buffer.from(audioBuffer))
      const result = execSync(`python "${transcribeScript}" "${tempPath}"`, {
        encoding: 'utf-8',
        timeout: 30000,
      }).trim()
      return { success: true, text: result }
    } catch (e: any) {
      return { success: false, text: '', error: e.message }
    } finally {
      try { unlinkSync(tempPath) } catch { /* */ }
    }
  })

  ipcMain.handle('voice-speak', async (_e, text: string, profile: string = 'narrator', lang: string = 'en') => {
    const outPath = join(tmpdir(), `claudeborn_tts_${Date.now()}.ogg`)
    return new Promise<{ success: boolean; audioPath?: string; error?: string }>((resolve) => {
      const proc = spawn('python', [ttsScript, text, outPath, profile, lang], {
        timeout: 120000,
      })
      let stderr = ''
      proc.stderr.on('data', (d) => { stderr += d.toString() })
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, audioPath: outPath })
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
