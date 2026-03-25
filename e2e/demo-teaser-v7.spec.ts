/**
 * Demo Teaser v7 — Incorporating ALL user feedback.
 *
 * KEY CHANGES from v6:
 *   - Bigger fonts: hub 18, terminal 16
 *   - 70/30 split (more terminal space visible)
 *   - Camera: spawn → card approach → 3s HOLD on card → slide right → sphere MEDIUM close-up
 *   - intro-animation disabled (we control camera exclusively)
 *   - Butler voice greeting at 1s
 *   - QA frames at 0, 3, 5, 8, 11s with specific verification criteria
 *   - Sphere NOT ultra close-up at the end (medium distance)
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v7.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_V7 = resolve(TEMP, 'demo-v7-raw.mp4')
const FINAL_V7 = resolve(TEMP, 'demo-v7.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-greeting-v7.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v7-timing.json')

const VID_W = 1920
const VID_H = 1080

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, neon theme, 70/30 split, bigger fonts
// ===================================================================
async function setupScene() {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-demo-terminals', '3')       // 3 terminal panes at bottom
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'dual-arc')
    localStorage.setItem('hal-o-3d-theme', 'neon')
    localStorage.setItem('hal-o-sphere-style', 'animated-core')
    localStorage.setItem('hal-o-split', '70')                // 70% hub, 30% terminal — more terminal
    localStorage.setItem('hal-o-hub-font', '18')             // BIGGER hub font
    localStorage.setItem('hal-o-term-font', '16')             // BIGGER terminal font
    localStorage.setItem('hal-o-cards-per-sector', '16')
    localStorage.setItem('hal-o-tutorial-done', '1')         // hide intro tutorial overlay
    localStorage.setItem('hal-o-intro-animation', 'false')   // skip intro — we control camera
  })
  await page.reload()

  // Un-maximize then resize to 1920x1080
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
      win.setSize(1920, 1080)
      win.center()
    }
  })
  await page.waitForTimeout(500)

  // Wait for WebGL init + textures + bloom + scene to fully settle
  await page.waitForTimeout(10000)
}

// ===================================================================
// Get Electron window bounds in PHYSICAL pixels (for ffmpeg gdigrab)
// ===================================================================
async function getWindowBounds(): Promise<{ x: number; y: number; w: number; h: number }> {
  const result = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return { x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1.25 }
    const bounds = win.getBounds()
    const display = screen.getDisplayMatching(bounds)
    return { ...bounds, scaleFactor: display?.scaleFactor || 1.25 }
  })
  const scale = result.scaleFactor
  const x = Math.max(0, Math.round(result.x * scale))
  const y = Math.max(0, Math.round(result.y * scale))
  const w = Math.round(result.width * scale)
  const h = Math.round(result.height * scale)
  return { x, y, w, h }
}

// ===================================================================
// ffmpeg helpers
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
  console.log(`[v7] Starting ffmpeg: ${durationSeconds}s @ ${width}x${height} offset (${offsetX},${offsetY})`)
  console.log(`[v7] ffmpeg args: ${ffmpegArgs.join(' ')}`)
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

/** Mix audio at a delay offset + scale to 1920x1080 + timecode overlay */
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
    console.log(`[v7] Audio mixed at ${delayMs}ms offset`)
  } catch (err: any) {
    console.error('[v7] Audio mix failed:', err.stderr?.toString().slice(-500))
    execSync(`cp "${vIn}" "${mixedTmp}"`, { stdio: 'pipe' })
  }

  // Step 2: Scale to 1920x1080 + timecode overlay
  try {
    execSync(
      `ffmpeg -y -i "${mixedTmp}" -vf "scale=1920:1080:flags=lanczos,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast -c:a copy "${out}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v7] Scaled to 1920x1080 + timecode overlay: ${out}`)
  } catch (err: any) {
    console.error('[v7] Scale+timecode failed:', err.stderr?.toString().slice(-300))
    execSync(`cp "${mixedTmp}" "${out}"`, { stdio: 'pipe' })
  }

  // Clean up temp
  try { execSync(`rm -f "${mixedTmp}"`, { stdio: 'ignore' }) } catch {}
}

/** Extract QA frames at specified timestamps */
function extractQaFrames(videoPath: string, outputDir: string, timestamps: number[]): string[] {
  const vIn = videoPath.replace(/\\/g, '/')
  const frames: string[] = []

  for (const ts of timestamps) {
    const outPath = resolve(outputDir, `demo-v7-qa-${ts}s.jpg`).replace(/\\/g, '/')
    try {
      execSync(
        `ffmpeg -y -ss ${ts} -i "${vIn}" -frames:v 1 -q:v 2 "${outPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      )
      if (existsSync(outPath)) {
        frames.push(outPath)
        const size = (statSync(outPath).size / 1024).toFixed(0)
        console.log(`[v7] QA frame @ ${ts}s: ${outPath} (${size} KB)`)
      }
    } catch (err: any) {
      console.error(`[v7] Frame extraction @ ${ts}s failed:`, err.stderr?.toString().slice(-200))
    }
  }
  return frames
}

// ===================================================================
// Camera keyframes — v7 path
// Spawn → approach card → HOLD 3s → slide right → sphere medium close-up
// ===================================================================
const CAMERA_KEYFRAMES = [
  { t: 0,     pos: [0, 10, 16] },      // Spawn: default establishing shot (terminals visible)
  { t: 2500,  pos: [1.5, 4.5, 7] },    // Approach card (smooth decel)
  { t: 5500,  pos: [1.5, 4.5, 7] },    // HOLD on card for 3 seconds (readable text + activity)
  { t: 8000,  pos: [4, 4, 5] },        // Slide right — card exits frame
  { t: 10000, pos: [1, 3, 3.5] },      // Gentle approach sphere (NOT too close)
  { t: 12000, pos: [0.5, 2.5, 3] },    // Final: sphere medium close-up (NOT ultra close)
]

// ===================================================================
// TEST: v7 — 14s teaser with ALL feedback incorporated
// ===================================================================
test('Video v7 — 14s teaser, card hold + sphere medium + bigger fonts + 3 terminals', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Clean old files
  for (const f of [RAW_V7, FINAL_V7]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v7 @ ${mm}:${ss}] ${action}`)
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

  // ── Start ffmpeg to capture the Electron window region (14s) ──
  const ffmpeg = startFfmpeg(
    RAW_V7.replace(/\\/g, '/'),
    14,            // 14 seconds total (12s animation + 2s buffer)
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h
  )
  await sleep(2000) // let ffmpeg initialize its capture
  log('RECORDING STARTED')

  // ── Launch camera animation via animateCamera() API ──
  const keyframesForEval = CAMERA_KEYFRAMES.map(kf => ({ t: kf.t, pos: kf.pos }))
  await page.evaluate((keyframes) => {
    const pm = (window as any).__haloPhotoMode
    if (pm && pm.animateCamera) {
      pm.animateCamera(keyframes)
    } else {
      console.error('[v7] animateCamera API not available!')
    }
  }, keyframesForEval)
  log('CAMERA ANIMATION STARTED — 12s duration, 6 keyframes')

  // ── Play butler greeting at ~1s into animation ──
  await sleep(1000)
  log('1s — triggering butler greeting audio')

  await page.evaluate((wavPath) => {
    try {
      const audio = new Audio(`file:///${wavPath.replace(/\\/g, '/')}`)
      audio.volume = 1.0
      audio.play().catch((e: any) => console.error('[v7] Audio play failed:', e))
    } catch (e) {
      console.error('[v7] Audio creation failed:', e)
    }
  }, GREETING_WAV)

  // ── Sphere pulse at 3s — card in view, visual punch ──
  await sleep(2000)
  log('3s — sphere success event (card in frame)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })

  // ── Sphere warning at 6s — during hold phase, extra visual interest ──
  await sleep(3000)
  log('6s — sphere warning event (still holding on card)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })

  // ── Sphere info event at 9s — slide phase, transitioning to sphere ──
  await sleep(3000)
  log('9s — sphere info event (slide to sphere)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 0.6)
  })

  // ── Wait for camera animation to complete + ffmpeg to finish ──
  await sleep(3000)
  log('12s — camera animation complete')

  await waitFfmpeg(ffmpeg, 25000)
  log('RECORDING — ffmpeg done')

  // ── Verify raw video exists ──
  if (!existsSync(RAW_V7)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  const rawSize = (statSync(RAW_V7).size / 1024 / 1024).toFixed(1)
  console.log(`[v7] Raw size: ${rawSize} MB`)
  log(`Raw video: ${rawSize} MB`)

  // ── Post-process: mix audio + timecode overlay ──
  // Audio delay: 2s ffmpeg init buffer + 1s animation offset = 3000ms from recording start
  const audioDelayMs = 3000
  log(`POST — mixing audio at ${audioDelayMs}ms offset + timecode overlay`)

  if (existsSync(GREETING_WAV)) {
    postProcess(RAW_V7, GREETING_WAV, FINAL_V7, audioDelayMs)
  } else {
    console.warn('[v7] WARNING: greeting wav not found, video-only with timecode')
    try {
      execSync(
        `ffmpeg -y -i "${RAW_V7.replace(/\\/g, '/')}" -vf "scale=1920:1080:flags=lanczos,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${FINAL_V7.replace(/\\/g, '/')}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${RAW_V7.replace(/\\/g, '/')}" "${FINAL_V7.replace(/\\/g, '/')}"`)
    }
  }

  // ── Check final file ──
  if (existsSync(FINAL_V7)) {
    const finalSize = statSync(FINAL_V7).size / 1024 / 1024
    console.log(`[v7] Final size: ${finalSize.toFixed(1)} MB`)
    log(`Final video: ${finalSize.toFixed(1)} MB`)
  }

  // ── Self-QA: extract frames at 0, 3, 5, 8, 11 seconds ──
  log('QA — extracting verification frames at 0, 3, 5, 8, 11s')
  const qaTimestamps = [0, 3, 5, 8, 11]
  const qaFrames = extractQaFrames(
    existsSync(FINAL_V7) ? FINAL_V7 : RAW_V7,
    TEMP,
    qaTimestamps
  )
  log(`QA — extracted ${qaFrames.length} frames for visual verification`)

  // QA criteria log
  console.log('[v7] QA CRITERIA:')
  console.log('  0s  — Wide establishing shot, terminals visible at bottom (30% height)')
  console.log('  3s  — Card in frame, readable text, activity effects visible')
  console.log('  5s  — Still on card (hold phase), bigger fonts visible')
  console.log('  8s  — Card sliding out of frame, sphere becoming prominent')
  console.log('  11s — Sphere medium close-up (NOT ultra close), still some scene context')

  // ── Save timing log ──
  writeFileSync(TIMING_LOG.replace(/\\/g, '/'), JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v7',
    changes_from_v6: [
      'Bigger fonts: hub 18 (was 16), terminal 16 (was default)',
      '70/30 hub/terminal split (was 75/25) — more terminal visible',
      'Camera HOLDS on card for 3 seconds (t=2500 to t=5500)',
      'Sphere medium close-up at end (0.5, 2.5, 3) — NOT ultra close',
      'Slide right transition (card exits frame naturally)',
      'intro-animation disabled (skip intro spline)',
      '3 demo terminals (was 2)',
      'QA at 0, 3, 5, 8, 11s (more thorough)',
    ],
    camera_keyframes: CAMERA_KEYFRAMES,
    video: {
      duration_seconds: 14,
      framerate: 30,
      resolution: `${VID_W}x${VID_H}`,
      raw_video: 'demo-v7-raw.mp4',
      final_video: 'demo-v7.mp4',
      audio_delay_ms: audioDelayMs,
      qa_frames: qaFrames.map(f => f.split('/').pop()),
      events: timingLog,
    }
  }, null, 2))

  log('Video v7 DONE')
  await app?.close()
})
