/**
 * Demo Teaser v3 — re-record with fixes:
 *   1. Audio: generate HAL greeting via tts.py, mix in post with ffmpeg
 *   2. Camera closer: setCamera(2, 4, 6) for readable card text
 *   3. Font bigger: hal-o-hub-font = 18
 *   4. Same timing/choreography as v1
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v3.spec.ts --timeout 300000
 *
 * HARD RULE: hal-o-demo-mode=true ALWAYS
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

// v3 paths
const RAW_V3 = resolve(TEMP, 'demo-teaser-v3-raw.mp4')
const AUDIO_V3 = resolve(TEMP, 'demo-teaser-v3.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-greeting.wav'
const TIMING_LOG = resolve(TEMP, 'demo-teaser-v3-timing.json')

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Configure the scene: demo mode, PBR holo, neon theme, maximize, BIGGER FONT */
async function setupScene() {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-demo-terminals', '2')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'dual-arc')
    localStorage.setItem('hal-o-3d-theme', 'neon')
    localStorage.setItem('hal-o-sphere-style', 'animated-core')
    localStorage.setItem('hal-o-split', '100') // hub only
    // FIX #3: bigger font for settings readability
    localStorage.setItem('hal-o-hub-font', '18')
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  // Wait for WebGL init + textures + bloom + intro spline
  await page.waitForTimeout(6000)
}

/** Start ffmpeg gdigrab recording for a given duration */
function startFfmpeg(outputPath: string, durationSeconds: number): ChildProcess {
  const ffmpegArgs = [
    '-y',
    '-f', 'gdigrab',
    '-framerate', '30',
    '-offset_x', '0',
    '-offset_y', '0',
    '-video_size', '3840x2160',
    '-i', 'desktop',
    '-t', String(durationSeconds),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    outputPath.replace(/\\/g, '/'),
  ]
  console.log(`[v3] Starting ffmpeg: ${durationSeconds}s -> ${outputPath}`)
  return spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
}

/** Wait for ffmpeg to exit with a safety timeout */
async function waitFfmpeg(ffmpeg: ChildProcess, safetyMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGTERM')
      resolve()
    }, safetyMs)
    ffmpeg.on('exit', () => { clearTimeout(timeout); resolve() })
    ffmpeg.on('error', () => { clearTimeout(timeout); resolve() })
  })
}

/** Mix audio + add timecode in one pass */
function mixAudioAndTimecode(videoIn: string, audioIn: string, output: string, delayMs: number) {
  // Mix: delay the greeting audio, pad to video length, overlay timecode
  const vIn = videoIn.replace(/\\/g, '/')
  const aIn = audioIn.replace(/\\/g, '/')
  const out = output.replace(/\\/g, '/')

  // Step 1: Mix audio into video
  const mixedTmp = out.replace('.mp4', '-mixed.mp4')
  try {
    execSync(
      `ffmpeg -y -i "${vIn}" -i "${aIn}" -filter_complex "[1:a]adelay=${delayMs}|${delayMs},apad=whole_dur=14[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -shortest "${mixedTmp}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v3] Audio mixed into video`)
  } catch (err: any) {
    console.error('[v3] Audio mix failed:', err.stderr?.toString().slice(-500))
    // Fallback: just copy video without audio
    execSync(`cp "${vIn}" "${mixedTmp}"`, { stdio: 'pipe' })
  }

  // Step 2: Add timecode overlay
  try {
    execSync(
      `ffmpeg -y -i "${mixedTmp}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast -c:a copy "${out}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v3] Timecode overlay added: ${out}`)
  } catch (err: any) {
    console.error('[v3] Timecode failed:', err.stderr?.toString().slice(-300))
    execSync(`cp "${mixedTmp}" "${out}"`, { stdio: 'pipe' })
  }

  // Clean up temp
  try { execSync(`rm -f "${mixedTmp}"`, { stdio: 'ignore' }) } catch {}
}

// ===============================================================
// VIDEO 1 v3: 12s Teaser — closer camera + bigger font + audio
// ===============================================================
test('Video 1 v3 — 12s teaser with audio', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Clean old
  for (const f of [RAW_V3, AUDIO_V3]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v3 @ ${mm}:${ss}] ${action}`)
  }

  // FIX #2: Camera CLOSER — position BEFORE recording starts
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.pauseAutoRotate()
      pm.setCamera(2, 4, 6) // CLOSER than v1's (3,5,8)
      pm.setActivity(70)
    }
  })
  await sleep(1000) // let camera settle

  // Start ffmpeg — 14s capture (2s buffer on each side)
  const ffmpeg = startFfmpeg(RAW_V3.replace(/\\/g, '/'), 14)
  await sleep(2000) // let ffmpeg initialize
  log('RECORDING STARTED')

  // -- 0-3s: Camera close to a card (already positioned) --
  log('CLOSE-UP -- card view (camera 2,4,6)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setCamera(2, 4, 6) // reinforce close position
      pm.setActivity(70)
    }
  })
  await sleep(3000)

  // -- 3-5s: Pull back slightly to show sphere + 2-3 cards --
  log('PULL BACK -- sphere + cards')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.setCamera(4, 6, 10) // still closer than v1's (5,7,12)
  })
  await sleep(2000)

  // -- 5-7s: Open settings --
  log('SETTINGS -- opening')
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })
  await sleep(2000)

  // -- 7s: Close settings by dispatching mousedown outside the panel --
  log('SETTINGS -- closing')
  // hal-open-settings only opens; to close we dispatch mousedown on the canvas
  // The SettingsMenu useEffect listener catches mousedown outside its refs
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (canvas) {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    } else {
      // Fallback: dispatch on body
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }
  })
  await sleep(500)

  // -- 7-12s: Sphere pulses (audio mixed in post at ~7s) --
  log('HAL GREETING ZONE -- sphere pulse (audio mixed in post at 7s)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setAudioDemo(true)
      pm.setCamera(4, 6, 10) // keep pulled-back view
    }
  })

  // Trigger sphere glow events for visual impact
  await sleep(1000)
  log('SPHERE -- success event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })

  await sleep(2000)
  log('SPHERE -- warning event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })

  await sleep(2500)
  log('RECORDING -- waiting for ffmpeg to finish')

  // Wait for ffmpeg (14s recording + buffer)
  await waitFfmpeg(ffmpeg, 25000)
  log('RECORDING -- ffmpeg done')

  // Verify raw video
  if (!existsSync(RAW_V3)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  const rawSize = (statSync(RAW_V3).size / 1024 / 1024).toFixed(1)
  console.log(`[v3] Raw size: ${rawSize} MB`)

  // FIX #1: Mix HAL greeting audio at ~7s mark + add timecode
  log('POST -- mixing audio + timecode')
  if (existsSync(GREETING_WAV)) {
    mixAudioAndTimecode(RAW_V3, GREETING_WAV, AUDIO_V3, 7000)
  } else {
    console.warn('[v3] WARNING: greeting wav not found, falling back to video-only with timecode')
    try {
      execSync(
        `ffmpeg -y -i "${RAW_V3.replace(/\\/g, '/')}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast "${AUDIO_V3.replace(/\\/g, '/')}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${RAW_V3.replace(/\\/g, '/')}" "${AUDIO_V3.replace(/\\/g, '/')}"`)
    }
  }

  // Save timing log
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v3',
    fixes: [
      'Audio: HAL greeting mixed at 7s mark',
      'Camera: closer (2,4,6) for readable card text',
      'Font: hal-o-hub-font=18 for bigger settings text',
      'Same timing/choreography as v1',
    ],
    video: {
      duration_seconds: 14,
      framerate: 30,
      resolution: '3840x2160',
      raw_video: 'demo-teaser-v3-raw.mp4',
      final_video: 'demo-teaser-v3.mp4',
      audio_delay_ms: 7000,
      events: timingLog,
    }
  }, null, 2))

  log('Video v3 DONE')
  await app?.close()
})
