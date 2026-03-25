/**
 * Demo Teaser v15 — TIMESTAMPED PAGE.SCREENSHOT frame assembly (NO GDIGRAB).
 *
 * KEY CHANGES from v14:
 *   - Camera Y lowered to 0 (card-level height, not 2.5)
 *   - Uses page.screenshot() with real timestamps instead of gdigrab
 *   - Frames captured with actual durations, assembled via ffmpeg concat
 *   - Clean Electron-only capture, no full desktop overhead
 *
 * Frame assembly flow:
 *   1. Capture page.screenshot JPEG frames in real-time loop (16s)
 *   2. Record actual durations per frame (accounts for screenshot overhead)
 *   3. Write ffmpeg concat.txt with frame files + real durations
 *   4. ffmpeg concat input with duration timings
 *   5. Scale to 1920x1080 + timecode + audio overlay
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v15.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')
const FRAMES_DIR = resolve(TEMP, 'v15-frames')
const FINAL_V15 = resolve(TEMP, 'demo-v15.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-v10.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v15-timing.json')

const REC_DURATION = 16000 // 16 seconds in ms

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, neon theme, fullscreen, 70/30 split
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
    localStorage.setItem('hal-o-auto-rotate', 'true')
    localStorage.setItem('hal-o-auto-rotate-speed', '1')
  })
  await page.reload()

  // Go TRUE fullscreen — no title bar, no taskbar, fills entire screen
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setFullScreen(true)
      win.focus()
    }
  })
  await page.waitForTimeout(2000)

  // Wait for WebGL init + textures + bloom + terminals to fill
  await page.waitForTimeout(12000)
}

// ===================================================================
// TEST: v15 — Frame assembly with real timestamps, camera Y=0
// ===================================================================
test('Video v15 — Frame assembly, Y=0 card-level height, timestamped capture', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()

  // Clean old output files
  try { execSync(`rm -f "${FINAL_V15.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  mkdirSync(FRAMES_DIR, { recursive: true })

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v15 @ ${mm}:${ss}] ${action}`)
  }

  // ── Close settings if open (press Escape) ──
  await page.keyboard.press('Escape')
  await sleep(300)

  // ── Set activity + audio demo ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(90)
      pm.setAudioDemo(true)
    }
  })
  await sleep(500)
  log('Scene ready — activity 90, audio demo on')

  // ── Disable auto-rotate during approach animation ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.pauseAutoRotate()
  })
  await sleep(200)
  log('Auto-rotate paused for approach animation')

  // ── Schedule sphere events for visual variety ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) return
    setTimeout(() => pm.sphereEvent('success', 1.0), 2000)
    setTimeout(() => pm.sphereEvent('warning', 0.8), 5000)
    setTimeout(() => pm.sphereEvent('success', 0.6), 8000)
    setTimeout(() => pm.sphereEvent('info', 0.8), 11000)
    setTimeout(() => pm.sphereEvent('success', 0.7), 14000)
  })
  log('Sphere events scheduled at 2s, 5s, 8s, 11s, 14s')

  // ── Ensure HAL-O is focused and on top before recording ──
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.focus()
      win.moveTop()
    }
  })
  await sleep(500)
  log('HAL-O in fullscreen, focused and on top')

  log('FRAME CAPTURE START — page.screenshot() with real timestamped durations')

  // ── Disable auto-rotate during approach animation ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.pauseAutoRotate()
  })

  // ── Start camera approach animation: far establishing → card-level height (Y=0) over 3s ──
  log('Camera approach animation starting: [0, 6, 20] → [0, 0, 11] over 3s (Y=0 for cards)')
  await page.evaluate(() => {
    ;(window as any).__haloPhotoMode.animateCamera([
      { t: 0,    pos: [0, 6, 20] as [number, number, number] },
      { t: 3000, pos: [0, 0, 11] as [number, number, number] },
    ])
  })

  // ── Also set orbit target to look at card level ──
  await page.evaluate(() => {
    const oc = (window as any).__haloOrbitControls
    if (oc) {
      oc.target.set(0, 1.0, 0)
      oc.update()
    }
  })
  log('Orbit target set to [0, 1.0, 0] for card-level look-at')

  // ── Play butler greeting at ~2s mark ──
  setTimeout(() => {
    if (existsSync(GREETING_WAV)) {
      const audioFileUrl = `file:///${GREETING_WAV.replace(/\\/g, '/').replace(/^\//, '')}`
      page.evaluate((url: string) => {
        const a = new Audio(url)
        a.volume = 1.0
        a.play().catch(e => console.error('[v15] Audio play failed:', e))
        ;(window as any).__halSpeaking = true
        a.addEventListener('ended', () => {
          ;(window as any).__halSpeaking = false
        })
      }, audioFileUrl).catch(e => console.error('[v15] Audio eval failed:', e))
      log('Audio playback started at ~2s mark')
    }
  }, 1500)

  // ── Frame capture loop: capture real-time with durations ──
  const frames: Array<{ file: string; capture_ms: number }> = []
  const captureStart = Date.now()

  while (Date.now() - captureStart < REC_DURATION) {
    const beforeCapture = Date.now()
    try {
      const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
      const captureDuration = Date.now() - beforeCapture
      const i = frames.length
      const fname = `frame_${String(i).padStart(5, '0')}.jpg`
      const framePath = resolve(FRAMES_DIR, fname)
      writeFileSync(framePath, buf)
      frames.push({ file: fname, capture_ms: captureDuration })

      // Log every 30 frames (~4s at 7-8 FPS)
      if (i % 30 === 0) {
        const elapsedS = (Date.now() - captureStart) / 1000
        log(`Captured ${i} frames (${elapsedS.toFixed(1)}s elapsed, avg ${(captureDuration).toFixed(1)}ms per frame)`)
      }
    } catch (err) {
      console.error(`[v15] Screenshot failed:`, err)
      break
    }

    // Small yield to prevent blocking
    await sleep(10)
  }

  log(`Frame capture complete: ${frames.length} frames total`)

  // ── 3.5s into the loop, enable auto-rotate ──
  setTimeout(() => {
    page.evaluate(() => {
      const pm = (window as any).__haloPhotoMode
      if (pm) pm.resumeAutoRotate()
      const oc = (window as any).__haloOrbitControls
      if (oc) oc.autoRotateSpeed = 0.12
    }).catch(e => console.error('[v15] resumeAutoRotate eval failed:', e))
    log('Auto-rotate resumed at speed=0.12 (via timeout)')
  }, 3500)

  // ── Build ffmpeg concat file with real frame durations ──
  // Each frame's "display duration" is calculated based on the timing of the next frame
  const concatLines: string[] = []
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    // Frame display duration: capture time of next frame + some buffer (assume ~40ms per frame nominal)
    const nextCapture = i + 1 < frames.length ? frames[i + 1].capture_ms : 40
    const displayDurationMs = Math.max(33, nextCapture + 10) // At least 33ms (30fps)
    const displayDurationSecs = displayDurationMs / 1000

    concatLines.push(`file '${f.file}'`)
    concatLines.push(`duration ${displayDurationSecs.toFixed(4)}`)
  }

  const concatPath = resolve(FRAMES_DIR, 'concat.txt')
  writeFileSync(concatPath, concatLines.join('\n'))
  log(`Written concat.txt with ${frames.length} frames`)

  // ── Assemble video via ffmpeg concat ──
  log('POST-PROCESSING — ffmpeg concat + scale + timecode + audio')

  const finalPath = FINAL_V15.replace(/\\/g, '/')
  const concatPathFormatted = concatPath.replace(/\\/g, '/')
  const audioPath = GREETING_WAV.replace(/\\/g, '/')
  const audioDelayMs = 2000

  try {
    // Step 1: Concat frames into raw video
    const concatRawPath = resolve(TEMP, 'demo-v15-concat.mp4').replace(/\\/g, '/')
    log('Step 1: Concatenating frames...')
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatPathFormatted}" ` +
      `-c:v libx264 -pix_fmt yuv420p -preset ultrafast "${concatRawPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    log('  Frames concatenated')

    // Step 2: Scale + audio + timecode
    if (existsSync(GREETING_WAV)) {
      log('Step 2: Scaling + audio + timecode...')
      execSync(
        `ffmpeg -y -i "${concatRawPath}" -i "${audioPath}" ` +
        `-filter_complex "[0:v]scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10[vout];[1:a]adelay=${audioDelayMs}|${audioDelayMs},apad=whole_dur=${REC_DURATION / 1000}[aout]" ` +
        `-map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
        { stdio: 'pipe', timeout: 180000 }
      )
      log('  Scale + audio + timecode done')
    } else {
      log('Step 2: Scaling + timecode only (no audio)...')
      execSync(
        `ffmpeg -y -i "${concatRawPath}" -vf "scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('  Scale + timecode done (no audio)')
    }

    // Check final file
    const outputPath = FINAL_V15
    if (existsSync(outputPath)) {
      const finalSize = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
      log(`Final video: ${finalSize} MB → ${outputPath}`)
    }
  } catch (err: any) {
    console.error('[v15] Post-processing failed:', err.stderr?.toString?.().slice?.(-500) || err.message)
    throw err
  }

  // ── Self-QA: extract frames at key timestamps ──
  log('QA — extracting frames at 0s, 1.5s, 3s, 5s, 10s')
  const qaTimestamps = [0, 1.5, 3, 5, 10]
  const qaFinalPath = FINAL_V15.replace(/\\/g, '/')
  for (const ts of qaTimestamps) {
    const qaFrame = resolve(TEMP, `demo-v15-qa-${ts}s.jpg`).replace(/\\/g, '/')
    try {
      execSync(
        `ffmpeg -y -ss ${ts} -i "${qaFinalPath}" -frames:v 1 -q:v 2 "${qaFrame}"`,
        { stdio: 'pipe', timeout: 30000 }
      )
      const nativePath = qaFrame.replace(/\//g, '\\')
      if (existsSync(nativePath)) {
        const sizeKB = Math.round(statSync(nativePath).size / 1024)
        log(`  QA frame ${ts}s: ${sizeKB} KB`)
      }
    } catch {
      log(`  QA frame ${ts}s: FAILED to extract`)
    }
  }

  // ── Save timing log ──
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v15',
    changes_from_v14: [
      'Camera Y lowered to 0 (card-level height, not 2.5)',
      'Uses page.screenshot() with real timestamps instead of gdigrab',
      'Frames captured with actual capture durations (accounts for screenshot overhead)',
      'ffmpeg concat with frame-level timing control',
      'Clean Electron-only capture, no full desktop',
    ],
    capture: {
      method: 'page.screenshot() JPEG with real durations',
      frames_captured: frames.length,
      nominal_fps: 'variable (based on screenshot duration)',
      total_duration_ms: REC_DURATION,
    },
    camera: {
      approach_start: [0, 6, 20],
      approach_end: [0, 0, 11],
      approach_duration_ms: 3000,
      orbit_target: [0, 1.0, 0],
      auto_rotate_speed: 0.12,
      auto_rotate_start_ms: 3500,
    },
    video: {
      final_video: 'demo-v15.mp4',
      final_resolution: '1920x1080',
      audio_file: GREETING_WAV,
      audio_delay_ms: 2000,
      events: timingLog,
    },
  }, null, 2))

  // ── QA summary ──
  console.log('\n[v15] QA CHECKLIST:')
  console.log('  [ ] 0s: Far establishing shot (camera at [0, 6, 20])')
  console.log('  [ ] 1.5s: Camera approaching — mid-flight')
  console.log('  [ ] 2s: Audio starts (butler greeting)')
  console.log('  [ ] 3s: Arrived at card-level height [0, 0, 11] — sphere centered vertically')
  console.log('  [ ] 3.5s+: Auto-rotate kicks in smoothly')
  console.log('  [ ] 5-15s: Gentle rotation showing all cards')
  console.log('  [ ] Clean Electron window capture (no desktop taskbar)')
  console.log('  [ ] Sphere pulsing with audio demo')
  console.log('  [ ] Timecode visible in corner')

  // Exit fullscreen before closing
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.setFullScreen(false)
    })
  } catch {}

  log('Video v15 DONE')
  await app?.close()
})
