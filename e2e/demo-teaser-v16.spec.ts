/**
 * Demo Teaser v16 — GDIGRAB real-time capture + camera intro spline (Y=0).
 *
 * KEY CHANGES from v14:
 *   - Camera approach: [0, 6, 20] → [0, 0, 11] over 3s (Y=0 for direct ring approach)
 *   - Orbit target: [0, 1.0, 0] (look at card ring, not scene origin)
 *   - Uses resumeAutoRotate() after animation (clean API, no manual OrbitControls poking)
 *   - Butler greeting at 2s real-time playback during recording
 *   - GDIGRAB only — no page.screenshot (prevents fast-forward artifact)
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-v16.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_V16 = resolve(TEMP, 'demo-v16-raw.mp4')
const FINAL_V16 = resolve(TEMP, 'demo-v16.mp4')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-v10.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v16-timing.json')

const REC_DURATION = 16 // seconds (3s approach + 13s auto-rotate)

// Physical pixel dimensions for full desktop capture (3840x2160 at 125% DPI)
const DESKTOP_W = 3840
const DESKTOP_H = 2160

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
// TEST: v16 — 16s teaser, GDIGRAB + camera intro spline (Y=0) + auto-rotate
// ===================================================================
test('Video v16 — 16s teaser, GDIGRAB + camera intro spline (Y=0) + auto-rotate', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()

  // Clean old output files
  for (const f of [RAW_V16, FINAL_V16]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[v16 @ ${mm}:${ss}] ${action}`)
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

  // ── Set orbit target to card ring height ──
  await page.evaluate(() => {
    const oc = (window as any).__haloOrbitControls
    if (oc) {
      oc.target.set(0, 1.0, 0)
    }
  })
  await sleep(200)
  log('Orbit target set to [0, 1.0, 0]')

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

  // ── Start ffmpeg GDIGRAB — capture PRIMARY MONITOR ONLY ──
  const rawPath = RAW_V16.replace(/\\/g, '/')
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

  log(`RECORDING START — ffmpeg GDIGRAB ${DESKTOP_W}x${DESKTOP_H} @ 30fps for ${REC_DURATION}s`)

  const ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let ffmpegStderr = ''
  ffmpegProc.stderr?.on('data', (chunk: Buffer) => {
    ffmpegStderr += chunk.toString()
  })

  // ── Small delay to ensure ffmpeg is capturing before animation starts ──
  await sleep(500)

  // ── Start camera approach animation: far establishing → Y=0 position over 3s ──
  log('Camera approach animation starting: [0, 6, 20] → [0, 0, 11] over 3s')
  await page.evaluate(() => {
    ;(window as any).__haloPhotoMode.animateCamera([
      { t: 0,    pos: [0, 6, 20] as [number, number, number] },
      { t: 3000, pos: [0, 0, 11] as [number, number, number] },
    ])
  })

  // ── Wait 2s into recording then play butler greeting ──
  await sleep(1500) // 0.5s ffmpeg settle + 1.5s = ~2s into recording
  log('Playing butler greeting audio at ~2s mark')

  const audioFileUrl = `file:///${GREETING_WAV.replace(/\\/g, '/').replace(/^\//, '')}`
  await page.evaluate((url: string) => {
    const a = new Audio(url)
    a.volume = 1.0
    a.play().catch(e => console.error('[v16] Audio play failed:', e))
    ;(window as any).__halSpeaking = true
    a.addEventListener('ended', () => {
      ;(window as any).__halSpeaking = false
    })
  }, audioFileUrl)
  log(`Audio playback started: ${GREETING_WAV}`)

  // ── Wait for approach animation to complete ──
  // Animation is 3s. We've used ~2s so far (0.5s settle + 1.5s audio wait).
  // Wait 2s more for animation to fully finish + small buffer.
  await sleep(2000)
  log('Approach animation complete — enabling auto-rotate via resumeAutoRotate()')

  // ── Resume auto-rotate using the clean Photo Mode API ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.resumeAutoRotate()
    // Also ensure a gentle rotation speed
    const oc = (window as any).__haloOrbitControls
    if (oc) oc.autoRotateSpeed = 0.12
  })
  log('Auto-rotate resumed at speed=0.12')

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
        console.error('[v16] ffmpeg stderr (last 1000 chars):', ffmpegStderr.slice(-1000))
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    ffmpegProc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  if (existsSync(RAW_V16)) {
    const rawSize = (statSync(RAW_V16).size / 1024 / 1024).toFixed(1)
    log(`RECORDING DONE — raw: ${rawSize} MB`)
  } else {
    throw new Error('ffmpeg produced no output file')
  }

  // ── POST-PROCESS: Scale to 1920x1080 + audio + timecode ──
  const finalPath = FINAL_V16.replace(/\\/g, '/')
  const audioPath = GREETING_WAV.replace(/\\/g, '/')
  const audioDelayMs = 2000

  if (existsSync(GREETING_WAV)) {
    log(`POST — scale to 1920x1080 + audio at ${audioDelayMs}ms + timecode`)
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -i "${audioPath}" ` +
        `-filter_complex "[0:v]scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10[vout];[1:a]adelay=${audioDelayMs}|${audioDelayMs},apad=whole_dur=${REC_DURATION}[aout]" ` +
        `-map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('Scale + audio + timecode done')
    } catch (err: any) {
      console.error('[v16] Scale+audio failed:', err.stderr?.toString().slice(-500))
      // Fallback: scale + timecode, no audio
      log('FALLBACK — scale + timecode only (no audio)')
      try {
        execSync(
          `ffmpeg -y -i "${rawPath}" -vf "scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
          { stdio: 'pipe', timeout: 120000 }
        )
      } catch {
        execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
      }
    }
  } else {
    log('WARNING: No audio file found — scale + timecode only')
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -vf "scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
    }
  }

  // ── Check final file ──
  const outputPath = existsSync(FINAL_V16) ? FINAL_V16 : RAW_V16
  if (existsSync(outputPath)) {
    const finalSize = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
    log(`Final video: ${finalSize} MB → ${outputPath}`)
  }

  // ── Self-QA: extract frames at key timestamps ──
  log('QA — extracting frames at 0s, 1.5s, 3s, 5s, 10s')
  const qaTimestamps = [0, 1.5, 3, 5, 10]
  for (const ts of qaTimestamps) {
    const qaFrame = resolve(TEMP, `demo-v16-qa-${ts}s.jpg`).replace(/\\/g, '/')
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
    version: 'v16',
    changes_from_v14: [
      'Camera approach: [0,6,20] → [0,0,11] over 3s (Y=0 for direct ring approach)',
      'Orbit target: [0, 1.0, 0] (look at card ring, not scene origin)',
      'Uses resumeAutoRotate() API instead of manual OrbitControls manipulation',
      'GDIGRAB real-time capture (NOT page.screenshot)',
      'Butler greeting at 2s real-time playback',
    ],
    capture: {
      method: 'gdigrab full desktop (real-time)',
      desktop_resolution: `${DESKTOP_W}x${DESKTOP_H}`,
      dpi_scaling: '125%',
      framerate: 30,
      duration_seconds: REC_DURATION,
    },
    camera: {
      approach_start: [0, 6, 20],
      approach_end: [0, 0, 11],
      approach_duration_ms: 3000,
      orbit_target: [0, 1.0, 0],
      auto_rotate_speed: 0.12,
    },
    video: {
      raw_video: 'demo-v16-raw.mp4',
      final_video: 'demo-v16.mp4',
      final_resolution: '1920x1080',
      audio_file: GREETING_WAV,
      audio_delay_ms: audioDelayMs,
      events: timingLog,
    },
  }, null, 2))

  // ── QA summary ──
  console.log('\n[v16] QA CHECKLIST:')
  console.log('  [ ] 0s: Far establishing shot (camera at [0, 6, 20])')
  console.log('  [ ] 1.5s: Camera approaching — mid-flight')
  console.log('  [ ] 2s: Audio starts (butler greeting)')
  console.log('  [ ] 3s: Arrived at ring level [0, 0, 11] — cards at eye level')
  console.log('  [ ] 3.5s+: Auto-rotate kicks in smoothly')
  console.log('  [ ] 5-15s: Gentle rotation showing all cards')
  console.log('  [ ] Normal playback speed (NOT fast-forward)')
  console.log('  [ ] No taskbar visible (fullscreen)')
  console.log('  [ ] Sphere pulsing with audio demo')

  // Exit fullscreen before closing
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.setFullScreen(false)
    })
  } catch {}

  log('Video v16 DONE')
  await app?.close()
})
