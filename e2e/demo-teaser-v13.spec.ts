/**
 * Demo Teaser v13 — Camera Y=2.5 centered on card ring 0
 *
 * CHANGES from v12/v11:
 *   - Camera Y raised to 2.5 (was 5.0 in v9)
 *   - Ring 0 cards at Y=1.0, height ~1.8, so center = 1.0 + 0.9 = 1.9 → camera Y=2.5 gives slight overhead
 *   - Camera Z=11 (closer than v9's Z=14)
 *   - Orbit target = [0, 1.0, 0] (card ring Y, not [0, 0.3, 0])
 *   - lookAt target also [0, 1.0, 0]
 *   - Auto-rotate runs entire time, no animation pause
 *   - page.screenshot() frame capture
 *   - 14s duration (420 frames @ 30fps)
 *   - Butler audio at 2s offset
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v13.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')
const FRAMES_DIR = resolve(TEMP, 'v13-frames')

const RAW_V13 = resolve(TEMP, 'demo-v13-raw.mp4')
const FINAL_V13 = resolve(TEMP, 'demo-v13.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-v10.wav'
const GREETING_OGG = 'C:/Users/dindo/AppData/Local/Temp/hal-script-test.ogg'
const TIMING_LOG = resolve(TEMP, 'demo-v13-timing.json')

const VID_W = 1920
const VID_H = 1080
const FPS = 30
const TOTAL_FRAMES = 420  // 14 seconds at 30fps
const FRAME_INTERVAL = Math.round(1000 / FPS) // ~33ms

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, neon theme, 70/30 split
// ===================================================================
async function setupScene() {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-demo-terminals', '3')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'neon')
    localStorage.setItem('hal-o-sphere-style', 'animated-core')
    localStorage.setItem('hal-o-split', '70')
    localStorage.setItem('hal-o-hub-font', '18')
    localStorage.setItem('hal-o-term-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '16')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
    // Ensure auto-rotate is enabled
    localStorage.setItem('hal-o-auto-rotate', 'true')
    localStorage.setItem('hal-o-auto-rotate-speed', '1')
  })
  await page.reload()

  // Set window to exactly 1920x1080
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

  // Wait for WebGL init + textures + bloom + terminals to fill
  await page.waitForTimeout(12000)
}

// ===================================================================
// TEST: v13 — 14s teaser, camera Y=2.5 centered on ring 0, frame capture
// ===================================================================
test('Video v13 — 14s teaser, camera Y=2.5 on ring 0, frame capture', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()
  mkdirSync(FRAMES_DIR, { recursive: true })

  // Clean old frames
  try {
    const oldFrames = readdirSync(FRAMES_DIR).filter(f => f.endsWith('.jpg'))
    for (const f of oldFrames) {
      execSync(`rm -f "${resolve(FRAMES_DIR, f).replace(/\\/g, '/')}"`, { stdio: 'ignore' })
    }
  } catch {}

  // Clean old output files
  for (const f of [RAW_V13, FINAL_V13]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v13 @ ${mm}:${ss}] ${action}`)
  }

  // ── Set activity + audio demo (auto-rotate is already running) ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(90)
      pm.setAudioDemo(true)
      // DO NOT pause auto-rotate — it must run the entire time
    }
  })
  await sleep(500)
  log('Scene ready — activity 90, audio demo on, auto-rotate running')

  // ── Set camera immediately, no animation ──
  // Ring 0 cards at Y=1.0, height ~1.8, center ~1.9
  // Camera Y=2.5 gives slight overhead view
  // Camera Z=11 is closer than v9's Z=14
  // Orbit target and lookAt both at [0, 1.0, 0] (card ring Y)
  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (!cam || !oc) {
      console.error('[v13] Camera or OrbitControls not available!')
      return
    }
    cam.position.set(0, 2.5, 11)
    cam.lookAt(0, 1.0, 0)
    oc.target.set(0, 1.0, 0)
    oc.update?.()
  })
  await sleep(500)
  log('Camera set: position=[0, 2.5, 11], lookAt=[0, 1.0, 0], target=[0, 1.0, 0]')

  // ── Wait 2 more seconds for any lerp/damping to settle ──
  await sleep(2000)
  log('Settled — ready to capture')

  // ── Sphere events for visual variety during recording ──
  // Schedule sphere events at specific frames via setTimeout
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) return
    // 2s into recording — success pulse
    setTimeout(() => pm.sphereEvent('success', 1.0), 2000)
    // 5s — warning flash
    setTimeout(() => pm.sphereEvent('warning', 0.8), 5000)
    // 8s — info pulse
    setTimeout(() => pm.sphereEvent('success', 0.6), 8000)
    // 11s — another success
    setTimeout(() => pm.sphereEvent('info', 0.8), 11000)
  })
  log('Sphere events scheduled at 2s, 5s, 8s, 11s')

  // ── CAPTURE FRAMES — page.screenshot at ~30fps ──
  log(`CAPTURE START — ${TOTAL_FRAMES} frames @ ${FPS}fps`)
  const captureStart = Date.now()

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const frameStart = Date.now()

    const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
    const framePath = resolve(FRAMES_DIR, `frame_${String(i).padStart(5, '0')}.jpg`).replace(/\\/g, '/')
    writeFileSync(framePath, buf)

    // Maintain frame timing — sleep remainder of frame interval
    const elapsed = Date.now() - frameStart
    const remaining = FRAME_INTERVAL - elapsed
    if (remaining > 0) {
      await sleep(remaining)
    }

    // Progress logging every 60 frames (2 seconds)
    if (i > 0 && i % 60 === 0) {
      const sec = (i / FPS).toFixed(1)
      log(`Captured frame ${i}/${TOTAL_FRAMES} (${sec}s)`)
    }
  }

  const captureElapsed = ((Date.now() - captureStart) / 1000).toFixed(1)
  log(`CAPTURE DONE — ${TOTAL_FRAMES} frames in ${captureElapsed}s`)

  // ── Assemble frames into video with ffmpeg ──
  log('Assembling frames into video with ffmpeg')
  const framesPath = FRAMES_DIR.replace(/\\/g, '/')
  const rawPath = RAW_V13.replace(/\\/g, '/')

  try {
    // Scale to 1920x1080 (frames may be HiDPI at physical resolution) and ensure even dimensions
    execSync(
      `ffmpeg -y -framerate ${FPS} -i "${framesPath}/frame_%05d.jpg" -vf "scale=1920:1080:flags=lanczos" -c:v libx264 -preset fast -pix_fmt yuv420p -crf 18 "${rawPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    if (existsSync(RAW_V13)) {
      const rawSize = (statSync(RAW_V13).size / 1024 / 1024).toFixed(1)
      log(`Raw video assembled: ${rawSize} MB`)
    }
  } catch (err: any) {
    console.error('[v13] Frame assembly failed:', err.stderr?.toString().slice(-500))
    throw new Error('ffmpeg frame assembly failed')
  }

  // ── Mix audio at 2s offset + add timecode overlay ──
  const audioFile = existsSync(GREETING_WAV) ? GREETING_WAV : GREETING_OGG
  const audioPath = audioFile.replace(/\\/g, '/')
  const finalPath = FINAL_V13.replace(/\\/g, '/')
  const audioDelayMs = 2000

  if (existsSync(audioFile)) {
    log(`POST — mixing audio at ${audioDelayMs}ms offset + timecode overlay`)
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -i "${audioPath}" -filter_complex "[1:a]adelay=${audioDelayMs}|${audioDelayMs},apad=whole_dur=14[aout]" -map 0:v -map "[aout]" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('Audio mixed + timecode overlay applied')
    } catch (err: any) {
      console.error('[v13] Audio mix failed:', err.stderr?.toString().slice(-500))
      // Fallback: video-only with timecode
      try {
        execSync(
          `ffmpeg -y -i "${rawPath}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
          { stdio: 'pipe', timeout: 120000 }
        )
      } catch {
        execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
      }
    }
  } else {
    log('WARNING: No audio file found, video-only with timecode')
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
    }
  }

  // ── Check final file ──
  const outputPath = existsSync(FINAL_V13) ? FINAL_V13 : RAW_V13
  if (existsSync(outputPath)) {
    const finalSize = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
    log(`Final video: ${finalSize} MB → ${outputPath}`)
  }

  // ── Self-QA: check specific frames ──
  log('QA — checking frames 0, 60, 150, 300, 400')
  const qaFrameIds = [0, 60, 150, 300, 400]
  const qaResults: Array<{ frame: number; exists: boolean; sizeKB: number }> = []

  for (const fid of qaFrameIds) {
    const framePath = resolve(FRAMES_DIR, `frame_${String(fid).padStart(5, '0')}.jpg`)
    if (existsSync(framePath)) {
      const sizeKB = Math.round(statSync(framePath).size / 1024)
      qaResults.push({ frame: fid, exists: true, sizeKB })
      log(`  Frame ${fid} (${(fid / FPS).toFixed(1)}s): ${sizeKB} KB`)
    } else {
      qaResults.push({ frame: fid, exists: false, sizeKB: 0 })
      log(`  Frame ${fid}: MISSING`)
    }
  }

  // QA criteria
  console.log('[v13] QA CRITERIA:')
  console.log('  All frames: ONLY Electron content — no taskbar, no desktop')
  console.log('  Ring 0 cards vertically centered in viewport')
  console.log('  No overlap between ring 0 and ring 1 cards')
  console.log('  Auto-rotate visible: cards drift between frames')
  console.log('  Terminals visible at bottom')

  // ── Save timing log ──
  writeFileSync(TIMING_LOG.replace(/\\/g, '/'), JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v13',
    changes_from_v9: [
      'Camera Y: 5.0 → 2.5 (more overhead, centers ring 0)',
      'Camera Z: 14 → 11 (closer, more detailed)',
      'Orbit target Y: 0.3 → 1.0 (card ring Y, not space between rings)',
      'Ring 0 cards now centered in vertical viewport',
    ],
    camera: {
      position: { x: 0, y: 2.5, z: 11 },
      lookAt: [0, 1.0, 0],
      orbit_target: [0, 1.0, 0],
      fov: 48,
      notes: [
        'Ring 0 cards at Y=1.0, height ~1.8, center ~1.9',
        'Camera Y=2.5 gives slight overhead (center + 0.6 overhead)',
        'Z=11 is closer than v9 for more detail',
        'Orbit target matches card ring Y, not space between rings',
      ],
    },
    video: {
      duration_seconds: TOTAL_FRAMES / FPS,
      framerate: FPS,
      total_frames: TOTAL_FRAMES,
      resolution: `${VID_W}x${VID_H}`,
      capture_method: 'page.screenshot({ type: jpeg, quality: 90 })',
      raw_video: 'demo-v13-raw.mp4',
      final_video: 'demo-v13.mp4',
      audio_file: audioFile,
      audio_delay_ms: audioDelayMs,
      qa_frames: qaResults,
      events: timingLog,
    }
  }, null, 2))

  log('Video v13 DONE')
  await app?.close()
})
