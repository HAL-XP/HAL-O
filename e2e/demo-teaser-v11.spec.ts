/**
 * Demo Teaser v11 — full-desktop gdigrab + post-crop for correct HiDPI capture.
 *
 * KEY CHANGES from v10:
 *   - Capture FULL desktop (no getContentBounds — avoids HiDPI logical/physical mismatch)
 *   - Window maximized (not 1920x1080 — fills the screen)
 *   - Camera set immediately to final position (no spline, no animation)
 *   - Post-process: crop title bar + taskbar, scale to 1920x1080, add audio + timecode
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v11.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_V11 = resolve(TEMP, 'demo-v11-raw.mp4')
const CROPPED_V11 = resolve(TEMP, 'demo-v11-cropped.mp4')
const FINAL_V11 = resolve(TEMP, 'demo-v11.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-v10.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v11-timing.json')

const REC_DURATION = 14 // seconds

// Physical pixel dimensions for full desktop capture (3840x2160 at 125% DPI)
const DESKTOP_W = 3840
const DESKTOP_H = 2160

// In fullscreen mode, no title bar or taskbar — no crop needed
// Keep small values just in case there's minor framing offset
const CROP_TOP = 0
const CROP_BOTTOM = 0

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, neon theme, maximized, 70/30 split
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
// TEST: v11 — 14s teaser, full-desktop gdigrab + post-crop
// ===================================================================
test('Video v11 — 14s teaser, full-desktop capture + post-crop', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()

  // Clean old output files
  for (const f of [RAW_V11, CROPPED_V11, FINAL_V11]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v11 @ ${mm}:${ss}] ${action}`)
  }

  // ── Close settings if open (press Escape) ──
  await page.keyboard.press('Escape')
  await sleep(300)

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

  // ── Set camera to final position IMMEDIATELY (no animation) ──
  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (!cam || !oc) {
      console.error('[v11] Camera or OrbitControls not available!')
      return
    }
    // Set position directly — no lerp, no spline
    cam.position.set(0, 5, 14)
    cam.lookAt(0, 0.3, 0)
    oc.target.set(0, 0.3, 0)
    oc.update()
  })
  await sleep(500)
  log('Camera set immediately: position=[0, 5, 14], target=[0, 0.3, 0]')

  // Brief settle for damping
  await sleep(1500)
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

  // ── Start ffmpeg gdigrab — capture PRIMARY MONITOR ONLY ──
  // Multi-monitor: gdigrab "-i desktop" captures ALL monitors (11520x2160).
  // We restrict to just the primary monitor using offset + video_size.
  // Primary monitor: physical (0,0) to (3840,2160) at 125% DPI.
  const rawPath = RAW_V11.replace(/\\/g, '/')
  const ffmpegArgs = [
    '-f', 'gdigrab',
    '-framerate', '30',
    '-offset_x', '0',
    '-offset_y', '0',
    '-video_size', `${DESKTOP_W}x${DESKTOP_H}`,
    '-i', 'desktop',
    '-t', String(REC_DURATION),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-y',
    rawPath,
  ]

  log(`RECORDING START — ffmpeg gdigrab primary monitor ${DESKTOP_W}x${DESKTOP_H} @ 30fps for ${REC_DURATION}s`)

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

  const audioFileUrl = `file:///${GREETING_WAV.replace(/\\/g, '/').replace(/^\//, '')}`
  await page.evaluate((url: string) => {
    const a = new Audio(url)
    a.volume = 1.0
    a.play().catch(e => console.error('[v11] Audio play failed:', e))
    ;(window as any).__halSpeaking = true
    a.addEventListener('ended', () => {
      ;(window as any).__halSpeaking = false
    })
  }, audioFileUrl)
  log(`Audio playback started: ${GREETING_WAV}`)

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
        console.error('[v11] ffmpeg stderr (last 1000 chars):', ffmpegStderr.slice(-1000))
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    ffmpegProc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  if (existsSync(RAW_V11)) {
    const rawSize = (statSync(RAW_V11).size / 1024 / 1024).toFixed(1)
    log(`RECORDING DONE — raw: ${rawSize} MB`)
  } else {
    throw new Error('ffmpeg produced no output file')
  }

  // ── POST-PROCESS STEP 1: Crop if needed ──
  const croppedH = DESKTOP_H - CROP_TOP - CROP_BOTTOM
  const cropHEven = croppedH % 2 === 0 ? croppedH : croppedH - 1
  const croppedPath = CROPPED_V11.replace(/\\/g, '/')

  if (CROP_TOP > 0 || CROP_BOTTOM > 0) {
    log(`POST STEP 1 — crop: remove ${CROP_TOP}px top + ${CROP_BOTTOM}px bottom → ${DESKTOP_W}x${cropHEven}`)
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -vf "crop=in_w:${cropHEven}:0:${CROP_TOP}" -c:v libx264 -preset fast -pix_fmt yuv420p "${croppedPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('Crop done')
    } catch (err: any) {
      console.error('[v11] Crop failed:', err.stderr?.toString().slice(-500))
      execSync(`cp "${rawPath}" "${croppedPath}"`, { stdio: 'pipe' })
      log('FALLBACK — using raw (no crop)')
    }
  } else {
    // Fullscreen — no crop needed, use raw directly
    log('POST STEP 1 — fullscreen mode, no crop needed')
    execSync(`cp "${rawPath}" "${croppedPath}"`, { stdio: 'pipe' })
  }

  // ── POST-PROCESS STEP 2: Scale to 1920x1080 + audio + timecode ──
  const finalPath = FINAL_V11.replace(/\\/g, '/')
  const audioPath = GREETING_WAV.replace(/\\/g, '/')
  const audioDelayMs = 2000

  if (existsSync(GREETING_WAV)) {
    log(`POST STEP 2 — scale to 1920x1080 + audio at ${audioDelayMs}ms + timecode`)
    try {
      execSync(
        `ffmpeg -y -i "${croppedPath}" -i "${audioPath}" ` +
        `-filter_complex "[0:v]scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10[vout];[1:a]adelay=${audioDelayMs}|${audioDelayMs},apad=whole_dur=${REC_DURATION}[aout]" ` +
        `-map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('Scale + audio + timecode done')
    } catch (err: any) {
      console.error('[v11] Scale+audio failed:', err.stderr?.toString().slice(-500))
      // Fallback: scale + timecode, no audio
      log('FALLBACK — scale + timecode only (no audio)')
      try {
        execSync(
          `ffmpeg -y -i "${croppedPath}" -vf "scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
          { stdio: 'pipe', timeout: 120000 }
        )
      } catch {
        execSync(`cp "${croppedPath}" "${finalPath}"`, { stdio: 'pipe' })
      }
    }
  } else {
    log('WARNING: No audio file found — scale + timecode only')
    try {
      execSync(
        `ffmpeg -y -i "${croppedPath}" -vf "scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${croppedPath}" "${finalPath}"`, { stdio: 'pipe' })
    }
  }

  // ── Check final file ──
  const outputPath = existsSync(FINAL_V11) ? FINAL_V11 : RAW_V11
  if (existsSync(outputPath)) {
    const finalSize = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
    log(`Final video: ${finalSize} MB → ${outputPath}`)
  }

  // ── Self-QA: extract frames at key timestamps ──
  log('QA — extracting frames at 0s, 3s, 7s, 11s')
  const qaTimestamps = [0, 3, 7, 11]
  for (const ts of qaTimestamps) {
    const qaFrame = resolve(TEMP, `demo-v11-qa-${ts}s.jpg`).replace(/\\/g, '/')
    try {
      execSync(
        `ffmpeg -y -ss ${ts} -i "${finalPath}" -frames:v 1 -q:v 2 "${qaFrame}"`,
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
    version: 'v11',
    changes_from_v10: [
      'Full-desktop gdigrab capture — avoids HiDPI logical/physical pixel mismatch',
      'Window maximized instead of fixed 1920x1080',
      'Camera set immediately (no animation/spline)',
      'Post-crop: remove title bar + taskbar in physical pixels',
      'Post-scale: 3840→1920 for crisp 1080p output',
    ],
    capture: {
      method: 'gdigrab full desktop',
      desktop_resolution: `${DESKTOP_W}x${DESKTOP_H}`,
      dpi_scaling: '125%',
      framerate: 30,
      duration_seconds: REC_DURATION,
    },
    crop: {
      top_px: CROP_TOP,
      bottom_px: CROP_BOTTOM,
      cropped_height: cropHEven,
    },
    camera: {
      position: [0, 5, 14],
      target: [0, 0.3, 0],
      method: 'immediate set (no animation)',
    },
    video: {
      raw_video: 'demo-v11-raw.mp4',
      cropped_video: 'demo-v11-cropped.mp4',
      final_video: 'demo-v11.mp4',
      final_resolution: '1920x1080',
      audio_file: GREETING_WAV,
      audio_delay_ms: audioDelayMs,
      events: timingLog,
    },
  }, null, 2))

  // ── QA summary ──
  console.log('\n[v11] QA CHECKLIST:')
  console.log('  [ ] Full Electron content visible (hub + ALL terminals at bottom)?')
  console.log('  [ ] No title bar, no taskbar?')
  console.log('  [ ] Video plays at normal speed (not fast-forward)?')
  console.log('  [ ] Audio starts at ~2 seconds?')
  console.log('  [ ] Cards rotating smoothly throughout?')
  console.log('  [ ] Sphere pulses visible at 2s, 5s, 8s, 11s?')

  // Exit fullscreen before closing
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.setFullScreen(false)
    })
  } catch {}

  log('Video v11 DONE')
  await app?.close()
})
