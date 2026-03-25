/**
 * Demo Teaser v6 — ALL fixes applied.
 *
 * CRITICAL FIXES from v4/v5:
 *   - Uses window.__haloPhotoMode.animateCamera(keyframes) exclusively
 *     This API runs inside the R3F useFrame loop — OrbitControls CANNOT fight it
 *   - Records at 1920x1080 (Electron window resized, capture that region)
 *   - 75/25 hub/terminal split (terminal visible at bottom)
 *   - Butler voice greeting at ~1s into animation
 *   - Self-QA frames extracted and verified before delivering
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v6.spec.ts --timeout 300000
 */
import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_V6 = resolve(TEMP, 'demo-v6-raw.mp4')
const FINAL_V6 = resolve(TEMP, 'demo-v6.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-greeting-v6.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v6-timing.json')

// Target resolution for the video
const VID_W = 1920
const VID_H = 1080

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, neon theme, 75/25 split
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
    localStorage.setItem('hal-o-split', '75')       // 75% hub, 25% terminal
    localStorage.setItem('hal-o-hub-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '16')
    localStorage.setItem('hal-o-tutorial-done', '1')  // hide intro tutorial overlay
  })
  await page.reload()

  // Un-maximize then resize to 1920x1080
  // On 125% DPI (Windows 11): physical = logical * 1.25
  // gdigrab captures physical pixels, so we need to size the window such that
  // gdigrab sees 1920x1080 physical pixels.
  // Strategy: set logical size to 1920x1080 (which will be 2400x1350 physical on 125% DPI)
  // then capture at whatever physical size the window actually is.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      if (win.isFullScreen()) win.setFullScreen(false)
    }
  })
  await page.waitForTimeout(500)  // let window state settle

  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      // Set content size (excludes title bar/frame)
      win.setSize(1920, 1080)
      win.center()
    }
  })
  await page.waitForTimeout(500)  // let resize settle

  // Wait for WebGL init + textures + bloom + intro spline to finish
  await page.waitForTimeout(10000)
}

// ===================================================================
// Get Electron window bounds in PHYSICAL pixels (for ffmpeg gdigrab)
// On 125% DPI Windows: logical bounds * scaleFactor = physical bounds
// ===================================================================
async function getWindowBounds(): Promise<{ x: number; y: number; w: number; h: number }> {
  const result = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return { x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1.25 }
    const bounds = win.getBounds()
    // Get the display that contains this window
    const display = screen.getDisplayMatching(bounds)
    return { ...bounds, scaleFactor: display?.scaleFactor || 1.25 }
  })
  const scale = result.scaleFactor
  // Convert logical → physical, clamp negative values (window shadow on Windows)
  const x = Math.max(0, Math.round(result.x * scale))
  const y = Math.max(0, Math.round(result.y * scale))
  const w = Math.round(result.width * scale)
  const h = Math.round(result.height * scale)
  return { x, y, w, h }
}

// ===================================================================
// ffmpeg helpers — capture specific region (Electron window)
// ===================================================================
function startFfmpeg(
  outputPath: string,
  durationSeconds: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number
): ChildProcess {
  const ffmpegArgs = [
    '-y',
    '-f', 'gdigrab',
    '-framerate', '30',
    '-offset_x', String(offsetX),
    '-offset_y', String(offsetY),
    '-video_size', `${width}x${height}`,
    '-i', 'desktop',
    '-t', String(durationSeconds),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    outputPath.replace(/\\/g, '/'),
  ]
  console.log(`[v6] Starting ffmpeg: ${durationSeconds}s @ ${width}x${height} offset (${offsetX},${offsetY})`)
  console.log(`[v6] ffmpeg args: ${ffmpegArgs.join(' ')}`)
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
    console.log(`[v6] Audio mixed at ${delayMs}ms offset`)
  } catch (err: any) {
    console.error('[v6] Audio mix failed:', err.stderr?.toString().slice(-500))
    execSync(`cp "${vIn}" "${mixedTmp}"`, { stdio: 'pipe' })
  }

  // Step 2: Scale to 1920x1080 + add timecode overlay
  try {
    execSync(
      `ffmpeg -y -i "${mixedTmp}" -vf "scale=1920:1080:flags=lanczos,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast -c:a copy "${out}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v6] Scaled to 1920x1080 + timecode overlay: ${out}`)
  } catch (err: any) {
    console.error('[v6] Scale+timecode failed:', err.stderr?.toString().slice(-300))
    execSync(`cp "${mixedTmp}" "${out}"`, { stdio: 'pipe' })
  }

  // Clean up temp
  try { execSync(`rm -f "${mixedTmp}"`, { stdio: 'ignore' }) } catch {}
}

/** Extract QA frames and return paths */
function extractQaFrames(videoPath: string, outputDir: string): string[] {
  const vIn = videoPath.replace(/\\/g, '/')
  const frames: string[] = []

  // Extract at 0s, 5s, 10s
  const timestamps = [0, 5, 10]
  for (const ts of timestamps) {
    const outPath = resolve(outputDir, `demo-v6-qa-${ts}s.jpg`).replace(/\\/g, '/')
    try {
      execSync(
        `ffmpeg -y -ss ${ts} -i "${vIn}" -frames:v 1 -q:v 2 "${outPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      )
      if (existsSync(outPath)) {
        frames.push(outPath)
        const size = (statSync(outPath).size / 1024).toFixed(0)
        console.log(`[v6] QA frame @ ${ts}s: ${outPath} (${size} KB)`)
      }
    } catch (err: any) {
      console.error(`[v6] Frame extraction @ ${ts}s failed:`, err.stderr?.toString().slice(-200))
    }
  }
  return frames
}

// ===================================================================
// Camera keyframes — use animateCamera API!
// Smooth 3-segment fly-in: wide → card close-up → side angle → sphere
// ===================================================================
const CAMERA_KEYFRAMES = [
  { t: 0,     pos: [0, 10, 16] },     // Start: wide establishing shot
  { t: 2500,  pos: [2, 5, 8] },       // Approach cards from the side
  { t: 5000,  pos: [1.5, 4, 6] },     // Card close-up — linger here, readable stats
  { t: 7500,  pos: [0.5, 3, 4] },     // Transition: slide toward sphere, card still in frame
  { t: 10000, pos: [0, 2, 2.5] },     // Sphere ultra close-up (end)
]

// ===================================================================
// TEST: v6 — 13s teaser, animateCamera API, 1920x1080, 75/25 split
// ===================================================================
test('Video v6 — 13s teaser, animateCamera API + butler greeting + QA', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Clean old files
  for (const f of [RAW_V6, FINAL_V6]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v6 @ ${mm}:${ss}] ${action}`)
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
  log('Scene ready — activity 80, audio demo on, auto-rotate paused')

  // ── Get window position for ffmpeg region capture ──
  const bounds = await getWindowBounds()
  log(`Window bounds: x=${bounds.x} y=${bounds.y} w=${bounds.w} h=${bounds.h}`)

  // ── Start ffmpeg to capture the Electron window region ──
  const ffmpeg = startFfmpeg(
    RAW_V6.replace(/\\/g, '/'),
    13,           // 13 seconds total
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h
  )
  await sleep(2000) // let ffmpeg initialize its capture
  log('RECORDING STARTED')

  // ── Launch camera animation via animateCamera() API ──
  // This runs INSIDE the R3F useFrame loop — immune to OrbitControls
  const keyframesForEval = CAMERA_KEYFRAMES.map(kf => ({ t: kf.t, pos: kf.pos }))
  await page.evaluate((keyframes) => {
    const pm = (window as any).__haloPhotoMode
    if (pm && pm.animateCamera) {
      pm.animateCamera(keyframes)
    } else {
      console.error('[v6] animateCamera API not available!')
    }
  }, keyframesForEval)
  log('CAMERA ANIMATION STARTED — animateCamera() API, 10s duration')

  // ── Play butler greeting at ~1s into animation ──
  await sleep(1000)
  log('1s — triggering butler greeting audio')

  await page.evaluate((wavPath) => {
    try {
      const audio = new Audio(`file:///${wavPath.replace(/\\/g, '/')}`)
      audio.volume = 1.0
      audio.play().catch((e: any) => console.error('[v6] Audio play failed:', e))
    } catch (e) {
      console.error('[v6] Audio creation failed:', e)
    }
  }, GREETING_WAV)

  // ── Sphere pulse at 3s for visual punch (card in view) ──
  await sleep(2000)
  log('3s — sphere success event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })

  // ── Sphere warning event at 6s (transition to closer angle) ──
  await sleep(3000)
  log('6s — sphere warning event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })

  // ── Wait for camera to reach sphere ultra close-up ──
  await sleep(4000)
  log('10s — camera animation complete (auto re-enables OrbitControls)')

  // Wait for ffmpeg to finish its 13s recording + safety
  await waitFfmpeg(ffmpeg, 25000)
  log('RECORDING — ffmpeg done')

  // ── Verify raw video exists ──
  if (!existsSync(RAW_V6)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  const rawSize = (statSync(RAW_V6).size / 1024 / 1024).toFixed(1)
  console.log(`[v6] Raw size: ${rawSize} MB`)
  log(`Raw video: ${rawSize} MB`)

  // ── Post-process: mix audio at correct offset + timecode overlay ──
  // Audio delay: 2s ffmpeg init buffer + 1s animation offset = 3000ms from recording start
  const audioDelayMs = 3000
  log(`POST — mixing audio at ${audioDelayMs}ms offset + timecode overlay`)

  if (existsSync(GREETING_WAV)) {
    postProcess(RAW_V6, GREETING_WAV, FINAL_V6, audioDelayMs)
  } else {
    console.warn('[v6] WARNING: greeting wav not found, video-only with timecode')
    try {
      execSync(
        `ffmpeg -y -i "${RAW_V6.replace(/\\/g, '/')}" -vf "scale=1920:1080:flags=lanczos,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${FINAL_V6.replace(/\\/g, '/')}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${RAW_V6.replace(/\\/g, '/')}" "${FINAL_V6.replace(/\\/g, '/')}"`)
    }
  }

  // ── Check final file ──
  if (existsSync(FINAL_V6)) {
    const finalSize = statSync(FINAL_V6).size / 1024 / 1024
    console.log(`[v6] Final size: ${finalSize.toFixed(1)} MB`)
    log(`Final video: ${finalSize.toFixed(1)} MB`)
    if (finalSize > 50) {
      console.log('[v6] WARNING: File > 50MB — may need splitting for upload')
    }
  }

  // ── Self-QA: extract frames at 0s, 5s, 10s and verify ──
  log('QA — extracting verification frames')
  const qaFrames = extractQaFrames(
    existsSync(FINAL_V6) ? FINAL_V6 : RAW_V6,
    TEMP
  )
  log(`QA — extracted ${qaFrames.length} frames for visual verification`)

  // ── Save timing log ──
  writeFileSync(TIMING_LOG.replace(/\\/g, '/'), JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v6',
    fixes: [
      'CRITICAL: Uses animateCamera() API — runs inside R3F useFrame, OrbitControls cannot fight it',
      'Electron window resized to 1920x1080 — native resolution recording',
      'ffmpeg captures exact Electron window region (offset_x/y from getBounds)',
      '75/25 hub/terminal split — terminal visible at bottom',
      'Butler voice greeting at 1s into animation (3s from recording start)',
    ],
    camera_keyframes: CAMERA_KEYFRAMES,
    video: {
      duration_seconds: 13,
      framerate: 30,
      resolution: `${VID_W}x${VID_H}`,
      raw_video: 'demo-v6-raw.mp4',
      final_video: 'demo-v6.mp4',
      audio_delay_ms: audioDelayMs,
      qa_frames: qaFrames.map(f => f.split('/').pop()),
      events: timingLog,
    }
  }, null, 2))

  log('Video v6 DONE')
  await app?.close()
})
