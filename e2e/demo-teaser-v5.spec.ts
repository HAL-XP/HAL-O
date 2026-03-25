/**
 * Demo Teaser v5 — Stripped down, 2 shots, no settings, no complexity.
 *
 * CRITICAL FIX from v4: DO NOT use window.__haloPhotoMode.setCamera() for animation.
 * Instead, directly set window.__haloCamera.position.set() + lookAt() + controls.update()
 * each frame via requestAnimationFrame. Also disable orbit controls during animation
 * to prevent the controller from fighting the camera position.
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v5.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_V5 = resolve(TEMP, 'demo-v5-raw.mp4')
const FINAL_V5 = resolve(TEMP, 'demo-v5.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-greeting.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v5-timing.json')

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, neon theme, big font, 16 cards/sector
// ===================================================================
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
    localStorage.setItem('hal-o-split', '100') // hub only, no terminal pane
    localStorage.setItem('hal-o-hub-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '16')
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  // Wait for WebGL init + textures + bloom + intro spline to finish
  await page.waitForTimeout(8000)
}

// ===================================================================
// ffmpeg helpers
// ===================================================================
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
  console.log(`[v5] Starting ffmpeg: ${durationSeconds}s -> ${outputPath}`)
  return spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
}

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

/** Mix audio at a delay offset + add timecode overlay */
function postProcess(videoIn: string, audioIn: string, output: string, delayMs: number) {
  const vIn = videoIn.replace(/\\/g, '/')
  const aIn = audioIn.replace(/\\/g, '/')
  const out = output.replace(/\\/g, '/')
  const mixedTmp = out.replace('.mp4', '-mixed.mp4')

  // Step 1: Mix audio into video at the correct delay
  try {
    execSync(
      `ffmpeg -y -i "${vIn}" -i "${aIn}" -filter_complex "[1:a]adelay=${delayMs}|${delayMs},apad=whole_dur=14[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -shortest "${mixedTmp}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v5] Audio mixed at ${delayMs}ms offset`)
  } catch (err: any) {
    console.error('[v5] Audio mix failed:', err.stderr?.toString().slice(-500))
    execSync(`cp "${vIn}" "${mixedTmp}"`, { stdio: 'pipe' })
  }

  // Step 2: Add timecode overlay
  try {
    execSync(
      `ffmpeg -y -i "${mixedTmp}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast -c:a copy "${out}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v5] Timecode overlay added: ${out}`)
  } catch (err: any) {
    console.error('[v5] Timecode failed:', err.stderr?.toString().slice(-300))
    execSync(`cp "${mixedTmp}" "${out}"`, { stdio: 'pipe' })
  }

  // Clean up temp
  try { execSync(`rm -f "${mixedTmp}"`, { stdio: 'ignore' }) } catch {}
}

// ===================================================================
// Camera keyframes — 2 shots: card close-up + sphere close-up
// ===================================================================
// [time_ms, x, y, z]
const CAMERA_KEYFRAMES = [
  { t: 0,    pos: [0, 10, 16] },     // Start: default intro position (wide)
  { t: 3000, pos: [1.5, 4, 6] },     // Close-up on a card (readable)
  { t: 6000, pos: [3, 3, 4] },       // Closer, slight angle shift
  { t: 9000, pos: [0, 2, 3] },       // Sphere close-up (end)
]

// ===================================================================
// TEST: v5 — 12s teaser, 2 shots, direct camera control
// ===================================================================
test('Video v5 — 12s teaser, direct camera animation + butler greeting', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Clean old files
  for (const f of [RAW_V5, FINAL_V5]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v5 @ ${mm}:${ss}] ${action}`)
  }

  // ── Prepare scene: high activity, audio demo, pause auto-rotate ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(80)
      pm.setAudioDemo(true)
      pm.pauseAutoRotate()
    }
  })
  await sleep(500)

  // ── Set initial camera position DIRECTLY (no setCamera!) ──
  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (cam) {
      cam.position.set(0, 10, 16)
      cam.lookAt(0, 0.3, 0)
    }
    if (oc) {
      oc.target.set(0, 0.3, 0)
      oc.enabled = false  // DISABLE orbit controls to prevent fighting
      oc.update()
    }
  })
  await sleep(500)
  log('Scene ready — camera at start position, orbit controls disabled')

  // ── Start ffmpeg BEFORE animation ──
  const ffmpeg = startFfmpeg(RAW_V5.replace(/\\/g, '/'), 14)
  await sleep(2000) // let ffmpeg initialize its capture
  log('RECORDING STARTED')

  // ── Inject continuous camera animation via requestAnimationFrame ──
  // CRITICAL: Uses __haloCamera.position.set directly, NOT setCamera
  const keyframesForEval = CAMERA_KEYFRAMES.map(kf => ({ t: kf.t, pos: kf.pos }))
  await page.evaluate((keyframes) => {
    const w = window as any
    w.__v5AnimStart = performance.now()
    w.__v5Done = false

    function smoothstep(a: number, b: number, t: number) {
      t = Math.max(0, Math.min(1, (t - a) / (b - a)))
      return t * t * (3 - 2 * t)
    }

    function animate() {
      if (w.__v5Done) return
      const elapsed = performance.now() - w.__v5AnimStart
      if (elapsed > 10000) { w.__v5Done = true; return }

      const cam = w.__haloCamera
      const oc = w.__haloOrbitControls
      if (!cam) { requestAnimationFrame(animate); return }

      // Find current segment
      const kf = keyframes as Array<{ t: number; pos: number[] }>
      let i = 0
      for (let k = 1; k < kf.length; k++) {
        if (elapsed < kf[k].t) { i = k - 1; break }
        i = k
      }
      const next = Math.min(i + 1, kf.length - 1)
      const segT = smoothstep(kf[i].t, kf[next].t, elapsed)

      const p = kf[i].pos
      const n = kf[next].pos
      cam.position.set(
        p[0] + (n[0] - p[0]) * segT,
        p[1] + (n[1] - p[1]) * segT,
        p[2] + (n[2] - p[2]) * segT
      )
      cam.lookAt(0, 0.3, 0)
      if (oc) {
        oc.target.set(0, 0.3, 0)
        oc.update()
      }

      requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, keyframesForEval)

  log('CAMERA ANIMATION STARTED — direct position control, 10s duration')

  // ── Play greeting at ~2s (card comes into view) ──
  await sleep(2000)
  log('2s — triggering greeting audio playback in renderer')

  // Play the WAV via the renderer's Audio API
  // Note: file:// protocol needed for local files in Electron
  await page.evaluate((wavPath) => {
    try {
      const audio = new Audio(`file:///${wavPath.replace(/\\/g, '/')}`)
      audio.volume = 1.0
      audio.play().catch(() => {})
    } catch {}
  }, GREETING_WAV)

  // ── Sphere pulse at 4s for visual punch ──
  await sleep(2000)
  log('4s — sphere success event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })

  // ── Wait for camera to reach sphere close-up ──
  await sleep(3000)
  log('7s — sphere warning event (visual punch)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })

  // ── Wait for animation to complete ──
  await sleep(3000)
  log('10s — camera animation complete')

  // Stop animation loop
  await page.evaluate(() => { (window as any).__v5Done = true })

  // Re-enable orbit controls
  await page.evaluate(() => {
    const oc = (window as any).__haloOrbitControls
    if (oc) oc.enabled = true
  })

  // Wait for ffmpeg to finish (14s recording + safety)
  await waitFfmpeg(ffmpeg, 25000)
  log('RECORDING — ffmpeg done')

  // Verify raw video exists
  if (!existsSync(RAW_V5)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  const rawSize = (statSync(RAW_V5).size / 1024 / 1024).toFixed(1)
  console.log(`[v5] Raw size: ${rawSize} MB`)

  // ── Post-process: mix audio at 2s offset + timecode overlay ──
  // Audio delay: 2s ffmpeg init buffer + 2s animation offset = 4000ms from recording start
  log('POST — mixing audio at 4s offset + timecode overlay')
  if (existsSync(GREETING_WAV)) {
    postProcess(RAW_V5, GREETING_WAV, FINAL_V5, 4000)
  } else {
    console.warn('[v5] WARNING: greeting wav not found, video-only with timecode')
    try {
      execSync(
        `ffmpeg -y -i "${RAW_V5.replace(/\\/g, '/')}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast "${FINAL_V5.replace(/\\/g, '/')}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${RAW_V5.replace(/\\/g, '/')}" "${FINAL_V5.replace(/\\/g, '/')}"`)
    }
  }

  // ── Check file size ──
  if (existsSync(FINAL_V5)) {
    const finalSize = statSync(FINAL_V5).size / 1024 / 1024
    console.log(`[v5] Final size: ${finalSize.toFixed(1)} MB`)
    if (finalSize > 50) {
      console.log('[v5] WARNING: File > 50MB — may need splitting for upload')
    }
  }

  // Save timing log
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v5',
    fixes: [
      'CRITICAL: NO setCamera — direct __haloCamera.position.set + lookAt each frame',
      'Orbit controls disabled during animation (oc.enabled=false) to prevent fighting',
      'oc.target.set(0, 0.3, 0) synced with lookAt target each frame',
    ],
    improvements: [
      'Stripped down: 2 shots only (card close-up + sphere close-up)',
      'No settings menu flash — simpler, cleaner',
      'Audio at 2s (card visible) instead of 9s',
      '16 cards/sector for denser scene',
    ],
    camera_keyframes: CAMERA_KEYFRAMES,
    video: {
      duration_seconds: 14,
      framerate: 30,
      resolution: '3840x2160',
      raw_video: 'demo-v5-raw.mp4',
      final_video: 'demo-v5.mp4',
      audio_delay_ms: 4000,
      events: timingLog,
    }
  }, null, 2))

  log('Video v5 DONE')
  await app?.close()
})
