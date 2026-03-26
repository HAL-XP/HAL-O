/**
 * Sphere Audio Validation — 5s clip showing audio reaction.
 *
 * SPEED OPTIMIZATIONS:
 *   - No approach, no trimming, no post-processing
 *   - 8s scene warmup only (minimal)
 *   - 5s raw gdigrab recording → scaled to 1080p → output
 *   - Direct GainNode 3x audio → AnalyserNode (no API calls)
 *   - NO setAudioDemo(), NO setActivity()
 *
 * Run:
 *   npx playwright test e2e/sphere-audio-validate.spec.ts --timeout 120000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')
const AUDIO_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-combined.wav'
const OUTPUT_MP4 = resolve(TEMP, 'sphere-audio-validate.mp4')

// Export so tests can use them
export const VID_W = 1920
export const VID_H = 1080
export const REC_DURATION = 5

let app: ElectronApplication
let page: Page

test.setTimeout(120_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, tactical theme, animated-core
// ===================================================================
async function setupScene() {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'tactical')
    localStorage.setItem('hal-o-sphere-style', 'animated-core')
    localStorage.setItem('hal-o-split', '50')
    localStorage.setItem('hal-o-hub-font', '18')
    localStorage.setItem('hal-o-term-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '16')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
    // Activity at 0 (no fake activity interference)
    localStorage.setItem('hal-o-demo-activity', '0')
    // Auto-rotate slow
    localStorage.setItem('hal-o-auto-rotate', 'true')
    localStorage.setItem('hal-o-auto-rotate-speed', '0.12')
  })
  await page.reload()

  // Set window to exactly 1920x1080 at position (0,0)
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      if (win.isFullScreen()) win.setFullScreen(false)
    }
  })
  await page.waitForTimeout(500)

  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setPosition(0, 0)
      win.setSize(1920, 1080)
    }
  })
  await page.waitForTimeout(500)

  // 8s scene warmup (minimal — no fake activity, no audio demo)
  await page.waitForTimeout(8000)
}

// ===================================================================
// TEST: 5s validation clip
// ===================================================================
test('Sphere audio validation — 5s gdigrab clip', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()

  // Clean old output
  try {
    execSync(`rm -f "${OUTPUT_MP4.replace(/\\/g, '/')}"`, { stdio: 'ignore' })
  } catch {}

  const t0 = Date.now()
  function log(msg: string) {
    const s = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[validate @ ${s}s] ${msg}`)
  }

  // Set camera close to sphere
  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (!cam || !oc) {
      console.error('[validate] Camera or OrbitControls not available!')
      return
    }
    cam.position.set(0, 2, 8)
    oc.target.set(0, 0, 0)
    oc.update()
  })
  log('Camera positioned: [0, 2, 8]')
  await sleep(1000)

  // Get content area bounds for gdigrab
  let captureX: number, captureY: number, captureW: number, captureH: number
  try {
    const contentBounds = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win.getContentBounds()
    })
    captureX = contentBounds.x
    captureY = contentBounds.y
    captureW = contentBounds.width
    captureH = contentBounds.height
  } catch {
    const bounds = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win.getBounds()
    })
    captureX = bounds.x
    captureY = bounds.y + 30
    captureW = bounds.width
    captureH = bounds.height - 30
  }

  // Ensure even dimensions
  captureW = captureW % 2 === 0 ? captureW : captureW - 1
  captureH = captureH % 2 === 0 ? captureH : captureH - 1

  // Start ffmpeg gdigrab
  const rawPath = resolve(TEMP, 'sphere-audio-validate-raw.mp4').replace(/\\/g, '/')
  const ffmpegArgs = [
    '-f', 'gdigrab',
    '-framerate', '30',
    '-offset_x', String(captureX),
    '-offset_y', String(captureY),
    '-video_size', `${captureW}x${captureH}`,
    '-i', 'desktop',
    '-t', String(REC_DURATION),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-y',
    rawPath,
  ]

  log(`RECORD START — ${captureW}x${captureH} @ 30fps for ${REC_DURATION}s`)

  const ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let ffmpegStderr = ''
  ffmpegProc.stderr?.on('data', (chunk: Buffer) => {
    ffmpegStderr += chunk.toString()
  })

  // Immediately play audio through GainNode 3x → AnalyserNode
  await page.evaluate(() => {
    const url = 'file:///C:/Users/dindo/AppData/Local/Temp/hal-combined.wav'
    const a = new Audio(url)
    a.volume = 1.0
    const analyser = (window as any).__haloAudioAnalyser
    if (analyser) {
      const ctx = analyser.context
      if (ctx.state === 'suspended') ctx.resume()
      const source = ctx.createMediaElementSource(a)
      const gain = ctx.createGain()
      gain.gain.value = 3.0
      source.connect(gain)
      gain.connect(analyser)
      console.log('[VALIDATE] Audio connected to AnalyserNode via GainNode 3x')
    }
    ;(window as any).__halSpeaking = true
    a.play().catch(e => console.error('[VALIDATE] Audio play failed:', e))
    a.addEventListener('ended', () => {
      ;(window as any).__halSpeaking = false
    })
  })
  log('Audio playing through AnalyserNode 3x gain')

  // Wait for ffmpeg to finish
  log(`Waiting for ${REC_DURATION}s recording...`)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ffmpegProc.kill('SIGTERM')
      reject(new Error('ffmpeg recording timed out'))
    }, 20_000)

    ffmpegProc.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
      } else {
        console.error('[validate] ffmpeg stderr:', ffmpegStderr.slice(-500))
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    ffmpegProc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  if (existsSync(rawPath.replace(/\//g, '\\'))) {
    const rawSize = (statSync(rawPath.replace(/\//g, '\\')).size / 1024 / 1024).toFixed(1)
    log(`Raw recorded: ${rawSize} MB`)
  } else {
    throw new Error('ffmpeg produced no output file')
  }

  // Simple scale to 1080p — NO timecode, NO audio mixing
  log('Scaling to 1080p...')
  const outputPath = OUTPUT_MP4.replace(/\\/g, '/')
  try {
    execSync(
      `ffmpeg -y -i "${rawPath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" ` +
      `-c:v libx264 -preset fast -c:a copy "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    )
    log('Scale complete')
  } catch (err: any) {
    console.error('[validate] Scale failed:', err.stderr?.toString().slice(-500))
    // Fallback: just copy raw
    try {
      execSync(`cp "${rawPath}" "${outputPath}"`, { stdio: 'pipe' })
      log('Fallback: raw file copied')
    } catch {
      throw new Error('Could not create output file')
    }
  }

  // Verify output
  if (existsSync(outputPath.replace(/\//g, '\\'))) {
    const finalSize = (statSync(outputPath.replace(/\//g, '\\')).size / 1024 / 1024).toFixed(1)
    log(`Output: ${finalSize} MB at ${outputPath.replace(/\//g, '\\')}`)

    // ffprobe check
    try {
      const probeOutput = execSync(
        `ffprobe -v quiet -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
        { encoding: 'utf8' }
      ).trim()
      const duration = parseFloat(probeOutput)
      log(`Verified: ${duration.toFixed(2)}s duration`)
    } catch {
      log('ffprobe check skipped')
    }
  }

  log('VALIDATION DONE')
  await app?.close()
})
