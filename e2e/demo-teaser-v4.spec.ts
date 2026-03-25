/**
 * Demo Teaser v4 — ALWAYS-MOVING camera spline + butler voice greeting
 *
 * Improvements over v3:
 *   1. Camera NEVER stops — continuous spline interpolation every frame
 *   2. Butler voice greeting at 9s mark, sphere reacts instantly
 *   3. Settings flash (open at 6s, close at 8s)
 *   4. Audio mixed in post with ffmpeg (adelay at correct offset)
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v4.spec.ts --timeout 300000
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

const RAW_V4 = resolve(TEMP, 'demo-v4-raw.mp4')
const FINAL_V4 = resolve(TEMP, 'demo-v4.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-greeting.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v4-timing.json')

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Configure the scene: demo mode, PBR holo, neon theme, maximize, big font */
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
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  // Wait for WebGL init + textures + bloom + intro spline to finish
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
  console.log(`[v4] Starting ffmpeg: ${durationSeconds}s -> ${outputPath}`)
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
    console.log(`[v4] Audio mixed at ${delayMs}ms offset`)
  } catch (err: any) {
    console.error('[v4] Audio mix failed:', err.stderr?.toString().slice(-500))
    execSync(`cp "${vIn}" "${mixedTmp}"`, { stdio: 'pipe' })
  }

  // Step 2: Add timecode overlay
  try {
    execSync(
      `ffmpeg -y -i "${mixedTmp}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast -c:a copy "${out}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v4] Timecode overlay added: ${out}`)
  } catch (err: any) {
    console.error('[v4] Timecode failed:', err.stderr?.toString().slice(-300))
    execSync(`cp "${mixedTmp}" "${out}"`, { stdio: 'pipe' })
  }

  // Clean up temp
  try { execSync(`rm -f "${mixedTmp}"`, { stdio: 'ignore' }) } catch {}
}

// ===================================================================
// CAMERA SPLINE — continuous motion, never static
// ===================================================================
// Keyframes: [time_seconds, x, y, z]
const CAMERA_KEYFRAMES: [number, number, number, number][] = [
  [0,    0,   12,  20  ],  // Start far — wide establishing shot
  [3,    2,    4,   7  ],  // Glide in close to a card — smooth deceleration
  [6,    5,    6,  12  ],  // Slow lateral drift — sphere + card visible
  [8,    5.5,  6.5, 13 ],  // Gentle drift while settings visible
  [9,    4,    7,  14  ],  // Pull back gently after settings close
  [12,   3,    8,  15  ],  // Slow orbit while sphere pulses with audio
]

/** Cubic Hermite interpolation (CatmullRom-like) between keyframes */
function interpolateCamera(t: number): [number, number, number] {
  // Clamp t to [0, 12]
  t = Math.max(0, Math.min(12, t))

  // Find the two keyframes we're between
  let i = 0
  for (let k = 0; k < CAMERA_KEYFRAMES.length - 1; k++) {
    if (t >= CAMERA_KEYFRAMES[k][0] && t <= CAMERA_KEYFRAMES[k + 1][0]) {
      i = k
      break
    }
  }
  if (t >= CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1][0]) {
    const last = CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1]
    return [last[1], last[2], last[3]]
  }

  const k0 = CAMERA_KEYFRAMES[i]
  const k1 = CAMERA_KEYFRAMES[i + 1]
  const segDuration = k1[0] - k0[0]
  const localT = (t - k0[0]) / segDuration

  // Smoothstep easing for natural deceleration
  const eased = localT * localT * (3 - 2 * localT)

  return [
    k0[1] + (k1[1] - k0[1]) * eased,
    k0[2] + (k1[2] - k0[2]) * eased,
    k0[3] + (k1[3] - k0[3]) * eased,
  ]
}

// ===================================================================
// VIDEO 1 v4: 12s Teaser — always-moving camera + butler greeting
// ===================================================================
test('Video v4 — 12s teaser, spline camera + butler greeting', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Clean old files
  for (const f of [RAW_V4, FINAL_V4]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v4 @ ${mm}:${ss}] ${action}`)
  }

  // Prepare scene: pause auto-rotate, set initial camera, enable activity
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.pauseAutoRotate()
      pm.setCamera(0, 12, 20) // start position
      pm.setActivity(70)
    }
  })
  await sleep(1000) // let camera settle

  // ── STEP 5: Start ffmpeg BEFORE animation ──
  const ffmpeg = startFfmpeg(RAW_V4.replace(/\\/g, '/'), 14)
  await sleep(2000) // let ffmpeg initialize its capture
  log('RECORDING STARTED')

  // ── Inject the continuous camera animation loop into the renderer ──
  // This runs inside the Electron renderer process via requestAnimationFrame
  // and continuously interpolates camera position along the spline.
  const animationStartTime = Date.now()
  await page.evaluate((keyframes) => {
    const w = window as any
    w.__v4AnimStart = performance.now()
    w.__v4Done = false

    // Smoothstep helper
    function smoothstep(t: number) { return t * t * (3 - 2 * t) }

    // Interpolate from keyframes
    function interpCamera(tSec: number): [number, number, number] {
      const kf = keyframes as [number, number, number, number][]
      tSec = Math.max(0, Math.min(12, tSec))

      let i = 0
      for (let k = 0; k < kf.length - 1; k++) {
        if (tSec >= kf[k][0] && tSec <= kf[k + 1][0]) { i = k; break }
      }
      if (tSec >= kf[kf.length - 1][0]) {
        const last = kf[kf.length - 1]
        return [last[1], last[2], last[3]]
      }

      const k0 = kf[i], k1 = kf[i + 1]
      const localT = (tSec - k0[0]) / (k1[0] - k0[0])
      const e = smoothstep(localT)

      return [
        k0[1] + (k1[1] - k0[1]) * e,
        k0[2] + (k1[2] - k0[2]) * e,
        k0[3] + (k1[3] - k0[3]) * e,
      ]
    }

    function tick() {
      if (w.__v4Done) return
      const elapsed = (performance.now() - w.__v4AnimStart) / 1000
      if (elapsed > 13) { w.__v4Done = true; return }

      const [x, y, z] = interpCamera(elapsed)
      if (w.__haloCamera) {
        w.__haloCamera.position.set(x, y, z)
        w.__haloCamera.lookAt(0, 0.3, 0)
        if (w.__haloOrbitControls) w.__haloOrbitControls.update()
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, CAMERA_KEYFRAMES)

  log('CAMERA SPLINE ANIMATION STARTED — always moving')

  // ── Timed events during recording ──

  // 0-3s: Camera flies in close — animation handles this
  await sleep(3000)
  log('3s — close-up reached, lateral drift starting')

  // 3-6s: Lateral drift — animation handles this
  await sleep(3000)
  log('6s — opening settings menu')

  // 6s: Open settings
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })

  // 6-8s: Settings visible, camera keeps drifting
  await sleep(2000)
  log('8s — closing settings')

  // 8s: Close settings
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (canvas) {
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    } else {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }
  })
  await sleep(500)

  // 8.5s: Enable sphere audio demo for visual pulse
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.setAudioDemo(true)
  })
  await sleep(500)

  // 9s: Trigger sphere events for visual punch during greeting zone
  log('9s — sphere pulse zone (greeting audio mixed in post)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })

  await sleep(1500)
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })

  await sleep(1500)
  log('12s — animation complete, waiting for ffmpeg')

  // Stop animation loop
  await page.evaluate(() => { (window as any).__v4Done = true })

  // Wait for ffmpeg to finish (14s recording + safety)
  await waitFfmpeg(ffmpeg, 25000)
  log('RECORDING — ffmpeg done')

  // Verify raw video exists
  if (!existsSync(RAW_V4)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  const rawSize = (statSync(RAW_V4).size / 1024 / 1024).toFixed(1)
  console.log(`[v4] Raw size: ${rawSize} MB`)

  // ── STEP 7: Post-process — mix audio + timecode ──
  log('POST — mixing audio at 9s + timecode overlay')
  if (existsSync(GREETING_WAV)) {
    // Audio delay: 2s ffmpeg init buffer + 9s animation = 11s from start of recording
    // But actually the recording starts ~2s before animation, and audio should play at 9s
    // into the animation. So delay = 2000 (ffmpeg init) + 9000 (animation) = 11000ms
    postProcess(RAW_V4, GREETING_WAV, FINAL_V4, 11000)
  } else {
    console.warn('[v4] WARNING: greeting wav not found, video-only with timecode')
    try {
      execSync(
        `ffmpeg -y -i "${RAW_V4.replace(/\\/g, '/')}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast "${FINAL_V4.replace(/\\/g, '/')}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${RAW_V4.replace(/\\/g, '/')}" "${FINAL_V4.replace(/\\/g, '/')}"`)
    }
  }

  // ── STEP 8: Check file size ──
  if (existsSync(FINAL_V4)) {
    const finalSize = statSync(FINAL_V4).size / 1024 / 1024
    console.log(`[v4] Final size: ${finalSize.toFixed(1)} MB`)
    if (finalSize > 50) {
      console.log('[v4] WARNING: File > 50MB — may need splitting for upload')
    }
  }

  // Save timing log
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v4',
    improvements: [
      'Camera NEVER stops — continuous spline interpolation via requestAnimationFrame',
      'Butler voice greeting mixed at 9s mark',
      'Settings flash: open at 6s, close at 8s',
      'Smoothstep easing for natural deceleration at each keyframe',
      'Sphere pulse + colorshift during greeting zone',
    ],
    camera_keyframes: CAMERA_KEYFRAMES.map(([t, x, y, z]) => ({ t, x, y, z })),
    video: {
      duration_seconds: 14,
      framerate: 30,
      resolution: '3840x2160',
      raw_video: 'demo-v4-raw.mp4',
      final_video: 'demo-v4.mp4',
      audio_delay_ms: 11000,
      events: timingLog,
    }
  }, null, 2))

  log('Video v4 DONE')
  await app?.close()
})
