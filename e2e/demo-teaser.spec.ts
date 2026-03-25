/**
 * Demo Teaser Recording — Two 12s videos orchestrated by Playwright + ffmpeg gdigrab
 *
 * Video 1: 12s teaser — close card → pull back → settings → HAL greeting + sphere pulse
 * Video 2: 12s ship version — wider angle, spaceship flyby crossing frame
 *
 * Run:
 *   npx playwright test e2e/demo-teaser.spec.ts --timeout 300000
 *
 * HARD RULE: hal-o-demo-mode=true ALWAYS
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

// Video 1 paths
const RAW_V1 = resolve(TEMP, 'demo-teaser-raw.mp4')
const TC_V1 = resolve(TEMP, 'demo-teaser-v1.mp4')

// Video 2 paths
const RAW_V2 = resolve(TEMP, 'demo-teaser-ship-raw.mp4')
const TC_V2 = resolve(TEMP, 'demo-teaser-ship.mp4')

const TIMING_LOG = resolve(TEMP, 'demo-teaser-timing.json')

// HAL greeting audio
const GREETING_AUDIO = 'C:/Users/dindo/AppData/Local/Temp/hal-greeting.ogg'

let app: ElectronApplication
let page: Page

// 5 minutes total — both videos + post-processing
test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Configure the scene: demo mode, PBR holo, neon theme, maximize */
async function setupScene(extraSettings?: Record<string, string>) {
  await page.evaluate((extra) => {
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
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        localStorage.setItem(k, v)
      }
    }
  }, extraSettings || null)
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
  console.log(`[teaser] Starting ffmpeg: ${durationSeconds}s → ${outputPath}`)
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

/** Add timecode overlay via ffmpeg */
function addTimecode(input: string, output: string) {
  try {
    execSync(
      `ffmpeg -y -i "${input.replace(/\\/g, '/')}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast "${output.replace(/\\/g, '/')}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[teaser] Timecode video created: ${output}`)
  } catch (err: any) {
    console.error('[teaser] Timecode overlay failed:', err.stderr?.toString().slice(-300))
    execSync(`cp "${input.replace(/\\/g, '/')}" "${output.replace(/\\/g, '/')}"`)
  }
}

// ═══════════════════════════════════════════════════════
// VIDEO 1: 12s Teaser
// ═══════════════════════════════════════════════════════
test('Video 1 — 12s teaser', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Remove old files
  for (const f of [RAW_V1, TC_V1]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[teaser @ ${mm}:${ss}] ${action}`)
  }

  // Disable auto-rotate and position camera BEFORE recording starts
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.pauseAutoRotate()
      pm.setCamera(3, 5, 8) // close to a card
      pm.setActivity(70)
    }
  })
  await sleep(1000) // let camera settle

  // Start ffmpeg — 14s capture (2s buffer)
  const ffmpeg = startFfmpeg(RAW_V1.replace(/\\/g, '/'), 14)
  await sleep(2000) // let ffmpeg initialize
  log('RECORDING STARTED')

  // ── 0-3s: Camera close to a card ──
  log('CLOSE-UP — card view')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setCamera(3, 5, 8)
      pm.setActivity(70)
    }
  })
  await sleep(3000)

  // ── 3-5s: Pull back slightly ──
  log('PULL BACK — sphere + cards')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.setCamera(5, 7, 12)
  })
  await sleep(2000)

  // ── 5-7s: Open settings ──
  log('SETTINGS — opening')
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })
  await sleep(2000)

  // ── 7s: Close settings ──
  log('SETTINGS — closing')
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })
  await sleep(500)

  // ── 7-12s: Sphere pulses + HAL greeting audio ──
  log('HAL GREETING — sphere pulse + audio')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setAudioDemo(true)
      pm.setCamera(5, 7, 12) // keep pulled-back view
    }
  })

  // Inject and play the greeting audio via Web Audio API
  await page.evaluate((audioPath) => {
    const audio = new Audio('file:///' + audioPath.replace(/\\/g, '/'))
    audio.volume = 1.0
    audio.play().catch(console.error)
  }, GREETING_AUDIO)

  // Trigger sphere glow events for visual punch
  await sleep(1000)
  log('SPHERE — success event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })

  await sleep(2000)
  log('SPHERE — warning event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })

  await sleep(2500)
  log('RECORDING — waiting for ffmpeg to finish')

  // Wait for ffmpeg (14s recording + buffer)
  await waitFfmpeg(ffmpeg, 20000)
  log('RECORDING — ffmpeg done')

  // Verify raw video
  if (!existsSync(RAW_V1)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  console.log(`[teaser] Raw V1 size: ${(statSync(RAW_V1).size / 1024 / 1024).toFixed(1)} MB`)

  // Add timecode
  log('POST — adding timecode')
  addTimecode(RAW_V1, TC_V1)

  // Save timing log
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    video1: {
      duration_seconds: 14,
      framerate: 30,
      resolution: '3840x2160',
      raw_video: 'demo-teaser-raw.mp4',
      timecode_video: 'demo-teaser-v1.mp4',
      events: timingLog,
    }
  }, null, 2))

  log('Video 1 DONE')
  await app?.close()
})

// ═══════════════════════════════════════════════════════
// VIDEO 2: Ship Version
// ═══════════════════════════════════════════════════════
test('Video 2 — 12s ship teaser', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Remove old files
  for (const f of [RAW_V2, TC_V2]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[ship @ ${mm}:${ss}] ${action}`)
  }

  // Position camera wider to catch the ship — pause auto-rotate
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.pauseAutoRotate()
      pm.setCamera(5, 8, 14) // wider angle
      pm.setActivity(60)
    }
  })
  await sleep(1000)

  // Start ffmpeg — 14s capture
  const ffmpeg = startFfmpeg(RAW_V2.replace(/\\/g, '/'), 14)
  await sleep(2000)
  log('RECORDING STARTED')

  // ── 0-2s: Establish wide shot ──
  log('WIDE SHOT — establishing')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setCamera(5, 8, 14)
      pm.setActivity(60)
      pm.setAudioDemo(true)
    }
  })
  await sleep(2000)

  // ── 2s: Trigger flyby ──
  log('FLYBY — triggered')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.triggerFlyby()
  })

  // ── 2-5s: Ship is approaching from the left ──
  await sleep(3000)
  log('FLYBY — ship approaching')

  // ── 5-8s: Mid-flight, add sphere events ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })
  log('SPHERE — success event during flyby')
  await sleep(3000)

  // ── 8-10s: Ship should be crossing through frame now ──
  log('FLYBY — ship crossing frame')
  await sleep(2000)

  // ── 10-12s: Ship exiting + warning pulse ──
  log('SPHERE — warning event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })
  await sleep(2500)

  log('RECORDING — waiting for ffmpeg to finish')
  await waitFfmpeg(ffmpeg, 20000)
  log('RECORDING — ffmpeg done')

  // Verify raw video
  if (!existsSync(RAW_V2)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  console.log(`[ship] Raw V2 size: ${(statSync(RAW_V2).size / 1024 / 1024).toFixed(1)} MB`)

  // Add timecode
  log('POST — adding timecode')
  addTimecode(RAW_V2, TC_V2)

  // Update timing log with Video 2 data
  let existingLog: any = {}
  try {
    existingLog = JSON.parse(readFileSync(TIMING_LOG, 'utf-8'))
  } catch {}

  writeFileSync(TIMING_LOG, JSON.stringify({
    ...existingLog,
    video2: {
      duration_seconds: 14,
      framerate: 30,
      resolution: '3840x2160',
      raw_video: 'demo-teaser-ship-raw.mp4',
      timecode_video: 'demo-teaser-ship.mp4',
      events: timingLog,
    }
  }, null, 2))

  log('Video 2 DONE')
  await app?.close()
})
