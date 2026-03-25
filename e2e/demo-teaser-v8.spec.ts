/**
 * Demo Teaser v8 — COMPUTED camera framing + proper window capture.
 *
 * KEY CHANGES from v7:
 *   - Camera lookAt interpolation: keyframes now include `lookAt` to target specific cards
 *   - COMPUTED card positions from layout math (not guessed)
 *   - Two-phase: animated approach+hold (0-6s), then auto-rotate (6-14s)
 *   - Window positioned at (0,0) with explicit 1920x1080 for pixel-perfect gdigrab
 *   - Butler greeting from /tmp/hal-script-test.ogg
 *   - QA at 0, 3, 5, 8, 11s with strict criteria
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v8.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_V8 = resolve(TEMP, 'demo-v8-raw.mp4')
const FINAL_V8 = resolve(TEMP, 'demo-v8.mp4')
const GREETING_OGG = 'C:/Users/dindo/AppData/Local/Temp/hal-script-test.ogg'
const TIMING_LOG = resolve(TEMP, 'demo-v8-timing.json')

const VID_W = 1920
const VID_H = 1080

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Layout math — compute card positions from layouts3d.ts logic
// ===================================================================
// With 15 demo cards in "default" layout (MAX_PER_RING=12, PANEL_W=2.8):
//   count=15 > 12 → multi-ring
//   ringCount = ceil(15/12) = 2
//   Ring 0: 8 cards, radius = max(8, (2.8+0.6)*8 / (2*PI)) = max(8, 4.33) = 8
//           y = 1.0, angleOffset = 0
//   Ring 1: 7 cards, radius = max(8, (2.8+0.6)*7 / (2*PI)) * 0.92 = 8*0.92 = 7.36
//           y = 4.0, angleOffset = PI/7
//
// Card i on ring 0: angle = (i/8) * 2PI - PI/2
//   Card 0: angle=-PI/2 → pos [0, 1, -8] (back, -Z)
//   Card 2: angle=0 → pos [8, 1, 0] (right, +X)
//   Card 4: angle=PI/2 → pos [0, 1, 8] (front, +Z) ← BEST for camera at +Z
//   Card 6: angle=PI → pos [-8, 1, 0] (left, -X)
//
// For camera approaching from +Z, card 4 at [0, 1.0, 8.0] is directly in the line of sight.

const CARD_FRONT_POS: [number, number, number] = [0, 1.0, 8.0]  // Card 4 on ring 0
const CARD_UPPER_POS: [number, number, number] = [0, 4.0, 7.36] // Card on ring 1 (near +Z)

// ===================================================================
// Camera keyframes — v8 computed path
// Phase 1 (0-2.5s): Establishing shot → approach card
// Phase 2 (2.5-6s): HOLD on card (card centered via lookAt)
// Phase 3 (6s+): stopAnimation + resumeAutoRotate (cards spin past camera)
// ===================================================================
const CAMERA_KEYFRAMES = [
  // Establishing shot — high and far, looking at the scene center
  { t: 0,    pos: [0, 10, 20] as [number, number, number],   lookAt: [0, 1, 0] as [number, number, number] },
  // Approach card — camera descends and moves toward the front card
  // lookAt smoothly transitions from scene center to card position
  { t: 2500, pos: [0, 3.5, 14] as [number, number, number],  lookAt: CARD_FRONT_POS },
  // HOLD on card for 3.5 seconds — card centered in view
  { t: 6000, pos: [0, 3.5, 14] as [number, number, number],  lookAt: CARD_FRONT_POS },
]

// ===================================================================
// Setup — demo mode, PBR holo, neon theme, 70/30 split, bigger fonts
// ===================================================================
async function setupScene() {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-demo-terminals', '3')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'dual-arc')
    localStorage.setItem('hal-o-3d-theme', 'neon')
    localStorage.setItem('hal-o-sphere-style', 'animated-core')
    localStorage.setItem('hal-o-split', '70')
    localStorage.setItem('hal-o-hub-font', '18')
    localStorage.setItem('hal-o-term-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '16')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
  })
  await page.reload()

  // Position window at (0,0) with exact 1920x1080 size
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
  console.log(`[v8] Starting ffmpeg: ${durationSeconds}s @ ${width}x${height} offset (${offsetX},${offsetY})`)
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
      `ffmpeg -y -i "${vIn}" -i "${aIn}" -filter_complex "[1:a]adelay=${delayMs}|${delayMs},apad=whole_dur=16[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -shortest "${mixedTmp}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v8] Audio mixed at ${delayMs}ms offset`)
  } catch (err: any) {
    console.error('[v8] Audio mix failed:', err.stderr?.toString().slice(-500))
    execSync(`cp "${vIn}" "${mixedTmp}"`, { stdio: 'pipe' })
  }

  // Step 2: Scale to 1920x1080 + timecode overlay
  try {
    execSync(
      `ffmpeg -y -i "${mixedTmp}" -vf "scale=1920:1080:flags=lanczos,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast -c:a copy "${out}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log(`[v8] Scaled to 1920x1080 + timecode overlay: ${out}`)
  } catch (err: any) {
    console.error('[v8] Scale+timecode failed:', err.stderr?.toString().slice(-300))
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
    const outPath = resolve(outputDir, `demo-v8-qa-${ts}s.jpg`).replace(/\\/g, '/')
    try {
      execSync(
        `ffmpeg -y -ss ${ts} -i "${vIn}" -frames:v 1 -q:v 2 "${outPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      )
      if (existsSync(outPath)) {
        frames.push(outPath)
        const size = (statSync(outPath).size / 1024).toFixed(0)
        console.log(`[v8] QA frame @ ${ts}s: ${outPath} (${size} KB)`)
      }
    } catch (err: any) {
      console.error(`[v8] Frame extraction @ ${ts}s failed:`, err.stderr?.toString().slice(-200))
    }
  }
  return frames
}

// ===================================================================
// TEST: v8 — 14s teaser with COMPUTED camera framing + auto-rotate
// ===================================================================
test('Video v8 — 14s teaser, computed card framing + auto-rotate second half', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(TEMP, { recursive: true })

  // Clean old files
  for (const f of [RAW_V8, FINAL_V8]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v8 @ ${mm}:${ss}] ${action}`)
  }

  // ── Prepare scene: high activity, audio demo, pause auto-rotate ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(90)
      pm.setAudioDemo(true)
      pm.pauseAutoRotate()
    }
  })
  await sleep(500)
  log('Scene ready — activity 90, audio demo on, auto-rotate paused')

  // ── Get window position for ffmpeg region capture ──
  const bounds = await getWindowBounds()
  log(`Window bounds: x=${bounds.x} y=${bounds.y} w=${bounds.w} h=${bounds.h}`)

  // ── Verify card position from layout math (log for debugging) ──
  log(`Computed card target: front card at [${CARD_FRONT_POS.join(', ')}]`)
  log(`Camera hold position: [0, 3.5, 14] — 6 units behind card at z=8`)

  // ── Start ffmpeg to capture the Electron window region (16s = 6s anim + 8s rotate + 2s buffer) ──
  const RECORD_DURATION = 16
  const ffmpeg = startFfmpeg(
    RAW_V8.replace(/\\/g, '/'),
    RECORD_DURATION,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h
  )
  await sleep(2000) // let ffmpeg initialize its capture
  log('RECORDING STARTED')

  // ── Phase 1: Launch camera animation (approach + hold) — 6s ──
  await page.evaluate((keyframes) => {
    const pm = (window as any).__haloPhotoMode
    if (pm && pm.animateCamera) {
      pm.animateCamera(keyframes)
    } else {
      console.error('[v8] animateCamera API not available!')
    }
  }, CAMERA_KEYFRAMES)
  log('CAMERA ANIMATION STARTED — 6s duration, approach → hold on card')

  // ── Play butler greeting at ~0.5s into animation ──
  await sleep(500)
  log('0.5s — triggering butler greeting audio')

  await page.evaluate((oggPath) => {
    try {
      const audio = new Audio(`file:///${oggPath.replace(/\\/g, '/')}`)
      audio.volume = 1.0
      audio.play().catch((e: any) => console.error('[v8] Audio play failed:', e))
    } catch (e) {
      console.error('[v8] Audio creation failed:', e)
    }
  }, GREETING_OGG)

  // ── Sphere pulse at 2s — camera approaching card, visual punch ──
  await sleep(1500)
  log('2s — sphere success event (camera approaching card)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })

  // ── Sphere warning at 4s — during hold phase ──
  await sleep(2000)
  log('4s — sphere warning event (holding on card)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 0.8)
  })

  // ── Phase 2 at 6s: Stop animation, enable auto-rotate ──
  await sleep(2000)
  log('6s — stopping animation, enabling auto-rotate (cards spin past camera)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.stopAnimation()
      pm.resumeAutoRotate()
    }
  })

  // ── Sphere events during auto-rotate phase for visual variety ──
  await sleep(2000)
  log('8s — sphere info event (auto-rotate showing other cards)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 0.6)
  })

  await sleep(3000)
  log('11s — sphere success event (more cards visible)')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('info', 0.8)
  })

  // ── Wait for recording to finish ──
  await sleep(3000)
  log('14s — recording duration reached')

  await waitFfmpeg(ffmpeg, 25000)
  log('RECORDING — ffmpeg done')

  // ── Verify raw video exists ──
  if (!existsSync(RAW_V8)) {
    throw new Error('Raw video not created by ffmpeg')
  }
  const rawSize = (statSync(RAW_V8).size / 1024 / 1024).toFixed(1)
  log(`Raw video: ${rawSize} MB`)

  // ── Post-process: mix audio + timecode overlay ──
  // Audio delay: 2s ffmpeg init buffer + 0.5s animation offset = 2500ms from recording start
  const audioDelayMs = 2500
  log(`POST — mixing audio at ${audioDelayMs}ms offset + timecode overlay`)

  if (existsSync(GREETING_OGG)) {
    postProcess(RAW_V8, GREETING_OGG, FINAL_V8, audioDelayMs)
  } else {
    console.warn('[v8] WARNING: greeting ogg not found, video-only with timecode')
    try {
      execSync(
        `ffmpeg -y -i "${RAW_V8.replace(/\\/g, '/')}" -vf "scale=1920:1080:flags=lanczos,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${FINAL_V8.replace(/\\/g, '/')}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${RAW_V8.replace(/\\/g, '/')}" "${FINAL_V8.replace(/\\/g, '/')}"`)
    }
  }

  // ── Check final file ──
  if (existsSync(FINAL_V8)) {
    const finalSize = statSync(FINAL_V8).size / 1024 / 1024
    log(`Final video: ${finalSize.toFixed(1)} MB`)
  }

  // ── Self-QA: extract frames at 0, 3, 5, 8, 11 seconds ──
  log('QA — extracting verification frames at 0, 3, 5, 8, 11s')
  const qaTimestamps = [0, 3, 5, 8, 11]
  const qaFrames = extractQaFrames(
    existsSync(FINAL_V8) ? FINAL_V8 : RAW_V8,
    TEMP,
    qaTimestamps
  )
  log(`QA — extracted ${qaFrames.length} frames for visual verification`)

  // QA criteria log
  console.log('[v8] QA CRITERIA:')
  console.log('  0s  — Establishing shot from above, NO desktop icons, full scene visible')
  console.log('  3s  — Card centered vertically via lookAt targeting, readable text')
  console.log('  5s  — Still holding on card (hold phase), sphere + card both visible')
  console.log('  8s  — Auto-rotate: other cards scrolling past camera')
  console.log('  11s — More cards scrolled past, activity bars visible, sphere still in scene')

  // ── Save timing log ──
  writeFileSync(TIMING_LOG.replace(/\\/g, '/'), JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v8',
    changes_from_v7: [
      'Camera lookAt interpolation: keyframes target specific card positions',
      'COMPUTED card position from layout math (card 4 at [0, 1, 8])',
      'Two-phase: 6s animated approach+hold, then 8s auto-rotate',
      'Window at (0,0) with explicit 1920x1080 for gdigrab precision',
      'Butler greeting from /tmp/hal-script-test.ogg (not generated wav)',
      'Camera distance computed: 6 units behind card (z=14 for card at z=8)',
      'Auto-rotate second half shows cards scrolling past naturally',
    ],
    layout_math: {
      demo_cards: 15,
      layout: 'default',
      max_per_ring: 12,
      ring_0: { cards: 8, radius: 8, y: 1.0 },
      ring_1: { cards: 7, radius: 7.36, y: 4.0 },
      target_card: { index: 4, ring: 0, angle_deg: 90, position: CARD_FRONT_POS },
    },
    camera_keyframes: CAMERA_KEYFRAMES,
    video: {
      duration_seconds: RECORD_DURATION,
      framerate: 30,
      resolution: `${VID_W}x${VID_H}`,
      raw_video: 'demo-v8-raw.mp4',
      final_video: 'demo-v8.mp4',
      audio_file: GREETING_OGG,
      audio_delay_ms: audioDelayMs,
      qa_frames: qaFrames.map(f => f.split(/[/\\]/).pop()),
      events: timingLog,
    }
  }, null, 2))

  log('Video v8 DONE')
  await app?.close()
})
