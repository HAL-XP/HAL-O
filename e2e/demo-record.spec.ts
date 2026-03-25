/**
 * Demo Video Recording — Playwright-orchestrated scene with ffmpeg gdigrab screen capture
 *
 * Produces a 60-second demo video with burned-in timecode for frame-accurate editing.
 *
 * Pipeline:
 *   1. Launch app via Playwright, configure demo mode + PBR Holo + neon theme
 *   2. Wait for scene to load
 *   3. Start ffmpeg gdigrab screen recording (60s, 3840x2160, 30fps)
 *   4. Script the demo over 60 seconds via page.evaluate
 *   5. Wait for ffmpeg to finish
 *   6. Add timecode overlay via ffmpeg drawtext
 *   7. Split into chunks if > 50MB
 *   8. Save timing log as JSON
 *
 * Run:
 *   npx playwright test e2e/demo-record.spec.ts --timeout 300000
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
const RAW_VIDEO = resolve(TEMP, 'demo-raw.mp4')
const TC_VIDEO = resolve(TEMP, 'demo-timecode.mp4')
const TIMING_LOG = resolve(TEMP, 'demo-timing.json')

let app: ElectronApplication
let page: Page

// 5 minutes total timeout — recording takes 60s + post-processing
test.setTimeout(300_000)

/** Sleep helper that returns wall-clock elapsed ms */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Set localStorage, reload, maximize, wait for 3D scene */
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
    localStorage.setItem('hal-o-split', '100') // hub only, no terminal split initially
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  // Wait for WebGL init + textures + bloom + intro spline
  await page.waitForTimeout(5000)
}

/** Change theme via localStorage + reload */
async function switchTheme(theme: string) {
  await page.evaluate((t) => {
    localStorage.setItem('hal-o-demo-mode', 'true') // HARD RULE
    localStorage.setItem('hal-o-3d-theme', t)
  }, theme)
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(2500) // settle
}

/** Change layout via localStorage + reload */
async function switchLayout(layout: string) {
  await page.evaluate((l) => {
    localStorage.setItem('hal-o-demo-mode', 'true') // HARD RULE
    localStorage.setItem('hal-o-layout', l)
  }, layout)
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(2500) // settle
}

test('record 60s demo video with timecode', async () => {
  // ── Phase 1: Launch and configure ──
  ;({ app, page } = await launchApp())
  await setupScene()

  // Ensure temp dir exists
  mkdirSync(TEMP, { recursive: true })

  // Remove old files
  for (const f of [RAW_VIDEO, TC_VIDEO]) {
    try { execSync(`del /f "${f.replace(/\//g, '\\')}"`, { stdio: 'ignore' }) } catch {}
  }

  // ── Phase 2: Start ffmpeg gdigrab screen recording ──
  // 60 seconds, 3840x2160 (physical resolution), 30fps, ultrafast
  const ffmpegArgs = [
    '-f', 'gdigrab',
    '-framerate', '30',
    '-offset_x', '0',
    '-offset_y', '0',
    '-video_size', '3840x2160',
    '-i', 'desktop',
    '-t', '60',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    RAW_VIDEO.replace(/\\/g, '/'),
  ]

  console.log('[demo] Starting ffmpeg screen recording...')
  console.log('[demo] ffmpeg args:', ffmpegArgs.join(' '))

  const ffmpeg: ChildProcess = spawn('ffmpeg', ['-y', ...ffmpegArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let ffmpegStderr = ''
  ffmpeg.stderr?.on('data', (chunk: Buffer) => {
    ffmpegStderr += chunk.toString()
  })

  // Wait 2s for ffmpeg to start capturing
  await sleep(2000)

  // ── Phase 3: Timing log for edit notes ──
  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const recordingStartTime = Date.now()

  function logAction(action: string) {
    const elapsed = (Date.now() - recordingStartTime) / 1000
    const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`
    timingLog.push({ time, seconds: Math.round(elapsed * 10) / 10, action })
    console.log(`[demo @ ${time}] ${action}`)
  }

  // ── Phase 4: Script the 60-second demo ──

  // 0-6s: Intro camera spline plays automatically
  logAction('INTRO — camera spline animation playing')
  await sleep(6000)

  // 6-10s: Auto-rotate shows the scene
  logAction('AUTO-ROTATE — orbiting the scene')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(40)
      pm.resumeAutoRotate()
    }
  })
  await sleep(4000)

  // 10-15s: Open settings, wait 3s, close
  logAction('SETTINGS — opening settings panel')
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })
  await sleep(3000)
  logAction('SETTINGS — closing settings panel')
  await page.keyboard.press('Escape')
  await sleep(2000)

  // 15-20s: Trigger spaceship flyby
  logAction('FLYBY — triggering spaceship flyby VFX')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.triggerFlyby()
  })
  await sleep(5000)

  // 20-30s: Set activity to 100, audio demo on — sphere pulsing
  logAction('ACTIVITY — setting activity to 100 + audio demo ON')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(100)
      pm.setAudioDemo(true)
    }
  })
  // Also trigger a sphere event for visual pop
  await sleep(3000)
  logAction('SPHERE — triggering success event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('success', 1.0)
  })
  await sleep(3000)
  logAction('SPHERE — triggering warning event')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) pm.sphereEvent('warning', 1.0)
  })
  await sleep(4000)

  // 30-40s: Switch themes (neon → ember → arctic) with 3s between each
  logAction('THEME — switching to ember')
  await switchTheme('ember')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) { pm.setActivity(80); pm.setAudioDemo(true) }
  })
  await sleep(3000)

  logAction('THEME — switching to arctic')
  await switchTheme('arctic')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) { pm.setActivity(80); pm.setAudioDemo(true) }
  })
  await sleep(3000)

  // Restore neon for layout showcase
  logAction('THEME — restoring neon')
  await switchTheme('neon')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) { pm.setActivity(60); pm.setAudioDemo(true) }
  })
  await sleep(1000)

  // 40-50s: Switch layouts (dual-arc → spiral → hemisphere)
  logAction('LAYOUT — switching to spiral')
  await switchLayout('spiral')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) { pm.setActivity(60); pm.setAudioDemo(true) }
  })
  await sleep(3000)

  logAction('LAYOUT — switching to hemisphere')
  await switchLayout('hemisphere')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) { pm.setActivity(60); pm.setAudioDemo(true) }
  })
  await sleep(3000)

  // 50-55s: Open terminal (split view in demo mode)
  logAction('TERMINAL — opening terminal split view')
  await page.evaluate(() => {
    localStorage.setItem('hal-o-demo-mode', 'true') // HARD RULE
    localStorage.setItem('hal-o-split', '55')
    localStorage.setItem('hal-o-layout', 'dual-arc')
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(3000)
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) { pm.setActivity(50); pm.setAudioDemo(true) }
  })
  await sleep(2000)

  // 55-60s: Wide shot to finish
  logAction('FINALE — wide shot, full hub view')
  await page.evaluate(() => {
    localStorage.setItem('hal-o-demo-mode', 'true') // HARD RULE
    localStorage.setItem('hal-o-split', '100')
    localStorage.setItem('hal-o-layout', 'dual-arc')
    localStorage.setItem('hal-o-3d-theme', 'neon')
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.wideShot()
      pm.setActivity(80)
      pm.setAudioDemo(true)
    }
  })

  logAction('RECORDING — waiting for ffmpeg to finish (60s total)')

  // ── Phase 5: Wait for ffmpeg to finish ──
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGTERM')
      resolve()
    }, 70000) // 70s safety — ffmpeg records 60s then exits
    ffmpeg.on('exit', (code) => {
      clearTimeout(timeout)
      console.log(`[demo] ffmpeg exited with code ${code}`)
      resolve()
    })
    ffmpeg.on('error', (err) => {
      clearTimeout(timeout)
      console.error(`[demo] ffmpeg error: ${err.message}`)
      resolve() // don't reject — still try post-processing
    })
  })

  logAction('RECORDING — ffmpeg finished')

  // Verify raw video exists
  if (!existsSync(RAW_VIDEO)) {
    console.error('[demo] Raw video not found! ffmpeg stderr:', ffmpegStderr.slice(-500))
    throw new Error('Raw video not created by ffmpeg')
  }

  const rawSize = statSync(RAW_VIDEO).size
  console.log(`[demo] Raw video size: ${(rawSize / 1024 / 1024).toFixed(1)} MB`)

  // ── Phase 6: Add timecode overlay ──
  logAction('POST — adding timecode overlay')
  try {
    execSync(
      `ffmpeg -y -i "${RAW_VIDEO.replace(/\\/g, '/')}" -vf "drawtext=text='%{pts\\:hms} F%{n}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20" -c:v libx264 -preset fast -c:a copy "${TC_VIDEO.replace(/\\/g, '/')}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log('[demo] Timecode video created')
  } catch (err: any) {
    console.error('[demo] Timecode overlay failed:', err.stderr?.toString().slice(-300))
    // Fall back to raw video
    execSync(`cp "${RAW_VIDEO.replace(/\\/g, '/')}" "${TC_VIDEO.replace(/\\/g, '/')}"`)
  }

  // ── Phase 7: Split into 30s chunks if > 50MB ──
  if (existsSync(TC_VIDEO)) {
    const tcSize = statSync(TC_VIDEO).size
    console.log(`[demo] Timecode video size: ${(tcSize / 1024 / 1024).toFixed(1)} MB`)

    if (tcSize > 50 * 1024 * 1024) {
      logAction('POST — splitting into 30s chunks (>50MB)')
      try {
        execSync(
          `ffmpeg -y -i "${TC_VIDEO.replace(/\\/g, '/')}" -t 30 -c copy "${resolve(TEMP, 'demo-part1.mp4').replace(/\\/g, '/')}"`,
          { stdio: 'pipe', timeout: 60000 }
        )
        execSync(
          `ffmpeg -y -i "${TC_VIDEO.replace(/\\/g, '/')}" -ss 30 -c copy "${resolve(TEMP, 'demo-part2.mp4').replace(/\\/g, '/')}"`,
          { stdio: 'pipe', timeout: 60000 }
        )
        console.log('[demo] Split into 2 parts')
      } catch (err: any) {
        console.error('[demo] Split failed:', err.stderr?.toString().slice(-200))
      }
    } else {
      console.log('[demo] Video under 50MB — no split needed')
    }
  }

  // ── Phase 8: Save timing log ──
  logAction('DONE — saving timing log')
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    duration_seconds: 60,
    framerate: 30,
    resolution: '3840x2160',
    raw_video: 'demo-raw.mp4',
    timecode_video: 'demo-timecode.mp4',
    events: timingLog,
  }, null, 2))
  console.log(`[demo] Timing log saved to ${TIMING_LOG}`)

  // Cleanup
  await app?.close()
})
