/**
 * Demo Teaser v10 — gdigrab real-time capture + post-crop taskbar.
 *
 * KEY CHANGES from v9:
 *   - gdigrab for real-time capture (correct FPS, correct timing, audio sync)
 *   - NOT page.screenshot() — that causes fast-forward video
 *   - Window positioned at (0,0) 1920x1080
 *   - Audio played in-browser at 2s via Web Audio (real-time sync)
 *   - Post-process: crop bottom 40px (Windows taskbar) + timecode overlay
 *   - Auto-rotate runs the ENTIRE recording duration
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v10.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_V10 = resolve(TEMP, 'demo-v10-raw.mp4')
const FINAL_V10 = resolve(TEMP, 'demo-v10.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-v10.wav'
const GREETING_OGG = 'C:/Users/dindo/AppData/Local/Temp/hal-script-test.ogg'
const TIMING_LOG = resolve(TEMP, 'demo-v10-timing.json')

const VID_W = 1920
const VID_H = 1080
const REC_DURATION = 14  // seconds

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

  // Wait for WebGL init + textures + bloom + terminals to fill
  await page.waitForTimeout(12000)
}

// ===================================================================
// TEST: v10 — 14s teaser, gdigrab real-time capture
// ===================================================================
test('Video v10 — 14s teaser, gdigrab real-time capture', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()

  // Clean old output files
  for (const f of [RAW_V10, FINAL_V10]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v10 @ ${mm}:${ss}] ${action}`)
  }

  // ── Set activity + audio demo (auto-rotate is already running) ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(90)
      pm.setAudioDemo(true)
    }
  })
  await sleep(500)
  log('Scene ready — activity 90, audio demo on, auto-rotate running')

  // ── Vertical camera adjustment ONLY ──
  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (!cam || !oc) {
      console.error('[v10] Camera or OrbitControls not available!')
      return
    }
    cam.position.y = 5
    cam.position.x = 0
    cam.position.z = 14
    oc.target.set(0, 0.3, 0)
    oc.update()
  })
  await sleep(500)
  log('Camera adjusted: Y=5, Z=14, target=[0, 0.3, 0]')

  // Wait for damping to settle
  await sleep(2000)
  log('Settled — ready to capture')

  // ── Schedule sphere events for visual variety ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) return
    setTimeout(() => pm.sphereEvent('success', 1.0), 2000)
    setTimeout(() => pm.sphereEvent('warning', 0.8), 5000)
    setTimeout(() => pm.sphereEvent('success', 0.6), 8000)
    setTimeout(() => pm.sphereEvent('info', 0.8), 11000)
  })
  log('Sphere events scheduled at 2s, 5s, 8s, 11s')

  // ── Get content area bounds for gdigrab ──
  // Try getContentBounds first (excludes title bar), fall back to getBounds + offset
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
    log(`Content bounds: x=${captureX}, y=${captureY}, w=${captureW}, h=${captureH}`)
  } catch {
    // Fallback: use getBounds and add ~30px title bar offset
    const bounds = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win.getBounds()
    })
    captureX = bounds.x
    captureY = bounds.y + 30  // skip title bar
    captureW = bounds.width
    captureH = bounds.height - 30
    log(`Fallback bounds: x=${captureX}, y=${captureY}, w=${captureW}, h=${captureH} (getBounds + 30px offset)`)
  }

  // Ensure even dimensions (required by libx264)
  captureW = captureW % 2 === 0 ? captureW : captureW - 1
  captureH = captureH % 2 === 0 ? captureH : captureH - 1

  // ── Start ffmpeg gdigrab recording ──
  const rawPath = RAW_V10.replace(/\\/g, '/')
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

  log(`RECORDING START — ffmpeg gdigrab ${captureW}x${captureH} @ 30fps for ${REC_DURATION}s`)
  log(`ffmpeg args: ${ffmpegArgs.join(' ')}`)

  const ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let ffmpegStderr = ''
  ffmpegProc.stderr?.on('data', (chunk: Buffer) => {
    ffmpegStderr += chunk.toString()
  })

  // ── Wait 2 seconds (establishing shot) then play audio ──
  await sleep(2000)
  log('Playing butler greeting audio at 2s mark')

  // Check which audio file to use for in-browser playback
  const audioForPlayback = existsSync(GREETING_WAV) ? GREETING_WAV : GREETING_OGG
  const audioFileUrl = `file:///${audioForPlayback.replace(/\\/g, '/').replace(/^\//, '')}`

  await page.evaluate((url: string) => {
    const a = new Audio(url)
    a.volume = 1.0
    a.play().catch(e => console.error('[v10] Audio play failed:', e))
    ;(window as any).__halSpeaking = true
    // Reset speaking flag when audio ends
    a.addEventListener('ended', () => {
      ;(window as any).__halSpeaking = false
    })
  }, audioFileUrl)
  log(`Audio playback started: ${audioForPlayback}`)

  // ── Wait for ffmpeg to finish recording ──
  log(`Waiting for ffmpeg to finish ${REC_DURATION}s recording...`)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ffmpegProc.kill('SIGTERM')
      reject(new Error('ffmpeg recording timed out after 30s'))
    }, 30_000)

    ffmpegProc.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
      } else {
        console.error('[v10] ffmpeg stderr (last 1000 chars):', ffmpegStderr.slice(-1000))
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    ffmpegProc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  if (existsSync(RAW_V10)) {
    const rawSize = (statSync(RAW_V10).size / 1024 / 1024).toFixed(1)
    log(`RECORDING DONE — raw: ${rawSize} MB`)
  } else {
    throw new Error('ffmpeg produced no output file')
  }

  // ── POST-PROCESS: crop bottom 40px (taskbar) + mix audio + timecode ──
  const finalPath = FINAL_V10.replace(/\\/g, '/')
  const audioFile = existsSync(GREETING_WAV) ? GREETING_WAV : GREETING_OGG
  const audioPath = audioFile.replace(/\\/g, '/')
  const audioDelayMs = 2000

  if (existsSync(audioFile)) {
    log(`POST — crop taskbar (bottom 40px) + mix audio at ${audioDelayMs}ms offset + timecode`)
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -i "${audioPath}" ` +
        `-filter_complex "[0:v]crop=in_w:in_h-40:0:0,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10[vout];[1:a]adelay=${audioDelayMs}|${audioDelayMs},apad=whole_dur=${REC_DURATION}[aout]" ` +
        `-map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('Post-process complete: crop + audio + timecode')
    } catch (err: any) {
      console.error('[v10] Post-process with audio failed:', err.stderr?.toString().slice(-500))
      // Fallback: crop + timecode, no audio
      log('FALLBACK — crop + timecode only (no audio)')
      try {
        execSync(
          `ffmpeg -y -i "${rawPath}" -vf "crop=in_w:in_h-40:0:0,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
          { stdio: 'pipe', timeout: 120000 }
        )
      } catch {
        execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
      }
    }
  } else {
    log('WARNING: No audio file found — crop + timecode only')
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -vf "crop=in_w:in_h-40:0:0,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
    }
  }

  // ── Check final file ──
  const outputPath = existsSync(FINAL_V10) ? FINAL_V10 : RAW_V10
  if (existsSync(outputPath)) {
    const finalSize = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
    log(`Final video: ${finalSize} MB → ${outputPath}`)
  }

  // ── Self-QA: extract frames at key timestamps for visual inspection ──
  log('QA — extracting frames at 0s, 3s, 7s, 11s')
  const qaTimestamps = [0, 3, 7, 11]
  for (const ts of qaTimestamps) {
    const qaFrame = resolve(TEMP, `demo-v10-qa-${ts}s.jpg`).replace(/\\/g, '/')
    try {
      execSync(
        `ffmpeg -y -ss ${ts} -i "${finalPath}" -frames:v 1 -q:v 2 "${qaFrame}"`,
        { stdio: 'pipe', timeout: 30000 }
      )
      if (existsSync(qaFrame.replace(/\//g, '\\'))) {
        const sizeKB = Math.round(statSync(qaFrame.replace(/\//g, '\\')).size / 1024)
        log(`  QA frame ${ts}s: ${sizeKB} KB`)
      }
    } catch {
      log(`  QA frame ${ts}s: FAILED to extract`)
    }
  }

  // ── Save timing log ──
  writeFileSync(TIMING_LOG.replace(/\\/g, '/'), JSON.stringify({
    generated: new Date().toISOString(),
    version: 'v10',
    changes_from_v9: [
      'gdigrab real-time capture (NOT page.screenshot) — correct FPS, no fast-forward',
      'Audio played in-browser at 2s — real-time sync guaranteed',
      'Post-process: crop bottom 40px (taskbar) + audio mix + timecode overlay',
      'Auto-rotate runs entire duration',
    ],
    capture: {
      method: 'gdigrab',
      content_bounds: { x: captureX, y: captureY, w: captureW, h: captureH },
      framerate: 30,
      duration_seconds: REC_DURATION,
    },
    camera: {
      adjusted_position: { x: 0, y: 5, z: 14 },
      orbit_target: [0, 0.3, 0],
      fov: 48,
    },
    video: {
      raw_video: 'demo-v10-raw.mp4',
      final_video: 'demo-v10.mp4',
      audio_file: audioFile,
      audio_delay_ms: audioDelayMs,
      post_process: 'crop bottom 40px + audio delay 2s + timecode overlay',
      events: timingLog,
    },
  }, null, 2))

  // ── QA summary ──
  console.log('\n[v10] QA CHECKLIST:')
  console.log('  [ ] Video plays at real-time speed (not fast-forward)?')
  console.log('  [ ] Audio starts at ~2 seconds?')
  console.log('  [ ] Taskbar NOT visible (cropped in post)?')
  console.log('  [ ] Cards rotating smoothly throughout?')
  console.log('  [ ] Terminals visible at bottom?')
  console.log('  [ ] Sphere pulses visible at 2s, 5s, 8s, 11s?')

  log('Video v10 DONE')
  await app?.close()
})
