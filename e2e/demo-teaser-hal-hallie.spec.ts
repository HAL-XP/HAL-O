/**
 * Demo Teaser — Hal (Ember) + Hallie (Holographic) variants
 *
 * Two 12s video recordings with real audio sphere reaction:
 *   Variant A: Hal — ember theme, tactical butler vibe
 *   Variant B: Hallie — holographic theme, soft ethereal vibe
 *
 * Key technical details:
 *   - Manual AnalyserNode injection (NOT __haloAudioDemo which fakes sine waves)
 *   - Audio loaded via base64 to bypass Electron file:// fetch restrictions
 *   - Smooth camera approach via requestAnimationFrame (smoothstep easing)
 *   - ffmpeg gdigrab at 3840x2160, scaled to 1920x1080 in post
 *
 * Run:
 *   npx playwright test e2e/demo-teaser-hal-hallie.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync, writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

// Output paths
const HAL_RAW = resolve(TEMP, 'demo-hal-raw.mp4')
const HAL_FINAL = resolve(TEMP, 'demo-hal.mp4')
const HALLIE_RAW = resolve(TEMP, 'demo-hallie-raw.mp4')
const HALLIE_FINAL = resolve(TEMP, 'demo-hallie.mp4')

// Audio greeting files (full Windows paths — /tmp resolves to D:\tmp in Node.js)
const HAL_AUDIO = 'C:/Users/dindo/AppData/Local/Temp/hal-combined.ogg'
const HALLIE_AUDIO = 'C:/Users/dindo/AppData/Local/Temp/hallie-combined.ogg'

const REC_DURATION = 12 // seconds
const DESKTOP_W = 3840
const DESKTOP_H = 2160

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface VariantConfig {
  name: string
  theme: string
  audioFile: string
  rawPath: string
  finalPath: string
}

// ===================================================================
// Setup scene — demo mode, PBR holo, given theme, fullscreen
// ===================================================================
async function setupScene(app: ElectronApplication, page: Page, theme: string) {
  await page.evaluate((t) => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '40')
    localStorage.setItem('hal-o-demo-terminals', '3')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-gpu-wizard-dismissed', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', t)
    localStorage.setItem('hal-o-sphere-style', 'animated-core')
    localStorage.setItem('hal-o-split', '70')
    localStorage.setItem('hal-o-hub-font', '18')
    localStorage.setItem('hal-o-term-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '40')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
    localStorage.setItem('hal-o-auto-rotate', 'true')
    localStorage.setItem('hal-o-auto-rotate-speed', '0.24')
  }, theme)

  await page.reload()

  // Go TRUE fullscreen
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setFullScreen(true)
      win.focus()
    }
  })
  await page.waitForTimeout(2000)

  // Wait for WebGL init + textures + bloom
  await page.waitForTimeout(10000)
}

// ===================================================================
// Inject AnalyserNode — CRITICAL for real sphere audio reaction
// ===================================================================
async function injectAnalyserNode(page: Page) {
  await page.evaluate(async () => {
    const w = window as any
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.3

    const gain = ctx.createGain()
    gain.gain.value = 3.0
    gain.connect(analyser)
    analyser.connect(ctx.destination)

    // Register on window — PbrHoloScene reads these every frame
    w.__haloAudioAnalyser = analyser
    w.__halAudioAnalyser = analyser
    w.__haloAudioGain = gain
    w.__haloAudioContext = ctx

    console.log('[demo] AnalyserNode injected: fftSize=256, gain=3.0')
  })
}

// ===================================================================
// Play audio through the injected AnalyserNode (base64 approach)
// ===================================================================
async function playAudioThroughAnalyser(page: Page, audioFilePath: string) {
  // Read file as base64 in Node.js, pass to browser
  const audioBuffer = readFileSync(audioFilePath)
  const base64 = audioBuffer.toString('base64')

  await page.evaluate(async (b64: string) => {
    const w = window as any
    const ctx = w.__haloAudioContext as AudioContext
    const gain = w.__haloAudioGain as GainNode
    if (!ctx || !gain) {
      console.error('[demo] No AudioContext or GainNode — cannot play audio')
      return
    }

    // Decode base64 to ArrayBuffer
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const arrayBuf = bytes.buffer

    try {
      const audioBuf = await ctx.decodeAudioData(arrayBuf)
      const source = ctx.createBufferSource()
      source.buffer = audioBuf
      source.connect(gain)
      source.start()
      w.__halSpeaking = true
      source.addEventListener('ended', () => {
        w.__halSpeaking = false
      })
      console.log(`[demo] Audio playing: ${audioBuf.duration.toFixed(1)}s`)
    } catch (err) {
      console.error('[demo] decodeAudioData failed:', err)
      // Fallback: try as blob URL with HTMLAudioElement
      const blob = new Blob([bytes], { type: 'audio/ogg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.volume = 1.0
      w.__halSpeaking = true
      audio.addEventListener('ended', () => {
        w.__halSpeaking = false
        URL.revokeObjectURL(url)
      })
      await audio.play()
      console.log('[demo] Audio playing via fallback HTMLAudioElement')
    }
  }, base64)
}

// ===================================================================
// Camera approach — smooth 60fps via requestAnimationFrame
// ===================================================================
async function startCameraApproach(page: Page) {
  await page.evaluate(() => {
    const w = window as any
    const controls = w.__haloOrbitControls
    if (!controls) {
      console.error('[demo] OrbitControls not available')
      return
    }

    // Disable auto-rotate during approach
    controls.autoRotate = false

    const startDist = 22
    const endDist = 11
    const startY = 6
    const endY = 1.5
    const duration = 3000
    const t0 = performance.now()

    function anim() {
      const elapsed = performance.now() - t0
      const raw = Math.min(elapsed / duration, 1)
      // smoothstep easing
      const t = raw * raw * (3 - 2 * raw)

      const dist = startDist + (endDist - startDist) * t
      const y = startY + (endY - startY) * t
      const az = controls.getAzimuthalAngle()

      controls.object.position.set(
        Math.sin(az) * dist,
        y,
        Math.cos(az) * dist
      )

      // Ramp auto-rotate speed
      controls.autoRotateSpeed = 0.06 + (0.36 - 0.06) * Math.min(elapsed / 1000, 1)

      if (raw < 1) {
        requestAnimationFrame(anim)
      } else {
        // Approach done — enable auto-rotate
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.24
        console.log('[demo] Camera approach complete, auto-rotate enabled')
      }
    }

    requestAnimationFrame(anim)
    console.log('[demo] Camera approach started: 22→11 over 3s')
  })
}

// ===================================================================
// Record a single variant
// ===================================================================
async function recordVariant(config: VariantConfig) {
  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[${config.name} @ ${mm}:${ss}] ${action}`)
  }

  // Launch app
  const { app, page } = await launchApp()
  log('App launched')

  // Setup scene
  await setupScene(app, page, config.theme)
  log(`Scene ready — theme: ${config.theme}, sphere: animated-core, 40 cards`)

  // Close settings/overlays
  await page.keyboard.press('Escape')
  await sleep(300)

  // Set activity for visual energy (but NOT audio demo — we use real audio)
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(80)
      // Do NOT call setAudioDemo(true) — that overrides real FFT with fake sine
    }
  })
  await sleep(300)
  log('Activity set to 80')

  // Inject AnalyserNode
  await injectAnalyserNode(page)
  await sleep(300)
  log('AnalyserNode injected')

  // Clean old files
  for (const f of [config.rawPath, config.finalPath]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  // Schedule sphere events for visual variety
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) return
    setTimeout(() => pm.sphereEvent('success', 1.0), 2000)
    setTimeout(() => pm.sphereEvent('warning', 0.8), 5000)
    setTimeout(() => pm.sphereEvent('success', 0.6), 8000)
    setTimeout(() => pm.sphereEvent('info', 0.8), 11000)
  })
  log('Sphere events scheduled at 2s, 5s, 8s, 11s')

  // Ensure HAL-O is focused and on top
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.focus()
      win.moveTop()
    }
  })
  await sleep(500)
  log('Window focused and on top')

  // Start ffmpeg gdigrab recording
  const rawPath = config.rawPath.replace(/\\/g, '/')
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

  log(`RECORDING START — gdigrab ${DESKTOP_W}x${DESKTOP_H} @ 30fps for ${REC_DURATION}s`)

  const ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let ffmpegStderr = ''
  ffmpegProc.stderr?.on('data', (chunk: Buffer) => {
    ffmpegStderr += chunk.toString()
  })

  // Wait for ffmpeg to stabilize
  await sleep(500)
  log('ffmpeg recording stabilized')

  // Start camera approach
  await startCameraApproach(page)
  log('Camera approach started')

  // Wait 1s then play greeting audio
  await sleep(1000)
  log('Playing greeting audio')
  await playAudioThroughAnalyser(page, config.audioFile)
  log(`Audio playback started: ${config.audioFile}`)

  // Wait for ffmpeg to finish
  log(`Waiting for ffmpeg to finish ${REC_DURATION}s recording...`)
  await new Promise<void>((resolveP, reject) => {
    const timeout = setTimeout(() => {
      ffmpegProc.kill('SIGTERM')
      reject(new Error('ffmpeg recording timed out after 30s'))
    }, 30_000)

    ffmpegProc.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolveP()
      } else {
        console.error(`[${config.name}] ffmpeg stderr (last 1000):`, ffmpegStderr.slice(-1000))
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    ffmpegProc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  if (existsSync(config.rawPath)) {
    const rawSize = (statSync(config.rawPath).size / 1024 / 1024).toFixed(1)
    log(`RECORDING DONE — raw: ${rawSize} MB`)
  } else {
    throw new Error('ffmpeg produced no output file')
  }

  // Post-process: scale to 1920x1080 + embed audio
  const finalPath = config.finalPath.replace(/\\/g, '/')
  const audioPath = config.audioFile.replace(/\\/g, '/')
  const audioDelayMs = 1500 // audio starts ~1.5s into recording

  log('POST — scale to 1920x1080 + audio')
  try {
    execSync(
      `ffmpeg -y -i "${rawPath}" -i "${audioPath}" ` +
      `-filter_complex "[0:v]scale=1920:1080[vout];[1:a]adelay=${audioDelayMs}|${audioDelayMs},apad=whole_dur=${REC_DURATION}[aout]" ` +
      `-map "[vout]" -map "[aout]" ` +
      `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    log('Post-processing done')
  } catch (err: any) {
    console.error(`[${config.name}] Post-processing failed:`, err.stderr?.toString().slice(-500))
    // Fallback: scale only
    log('FALLBACK — scale only (no audio)')
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -vf "scale=1920:1080" -c:v libx264 -preset fast "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
    }
  }

  // Report final file
  const outputPath = existsSync(config.finalPath) ? config.finalPath : config.rawPath
  if (existsSync(outputPath)) {
    const finalSize = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
    log(`Final video: ${finalSize} MB -> ${outputPath}`)
  }

  // QA frames
  log('QA — extracting frames at 0s, 3s, 6s, 10s')
  const qaTimestamps = [0, 3, 6, 10]
  for (const ts of qaTimestamps) {
    const qaFrame = resolve(TEMP, `${config.name}-qa-${ts}s.jpg`).replace(/\\/g, '/')
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

  // Exit fullscreen before closing
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.setFullScreen(false)
    })
  } catch {}

  await sleep(500)
  log(`${config.name} DONE`)
  await app?.close()

  return timingLog
}

// ===================================================================
// TEST: Variant A — Hal (Ember theme)
// ===================================================================
test('Demo teaser — Hal (ember theme, tactical)', async () => {
  const timing = await recordVariant({
    name: 'demo-hal',
    theme: 'ember',
    audioFile: HAL_AUDIO,
    rawPath: HAL_RAW,
    finalPath: HAL_FINAL,
  })

  writeFileSync(
    resolve(TEMP, 'demo-hal-timing.json'),
    JSON.stringify({
      generated: new Date().toISOString(),
      variant: 'Hal',
      theme: 'ember',
      sphere: 'animated-core',
      audio: HAL_AUDIO,
      capture: {
        method: 'gdigrab full desktop',
        desktop_resolution: `${DESKTOP_W}x${DESKTOP_H}`,
        framerate: 30,
        duration_seconds: REC_DURATION,
      },
      output: {
        raw: 'demo-hal-raw.mp4',
        final: 'demo-hal.mp4',
        resolution: '1920x1080',
      },
      events: timing,
    }, null, 2)
  )

  console.log('\n[Hal] QA CHECKLIST:')
  console.log('  [ ] Ember theme — warm orange/red glow')
  console.log('  [ ] Camera approach smooth (22->11 over 3s)')
  console.log('  [ ] Sphere reacts to audio (real FFT, not fake sine)')
  console.log('  [ ] Audio plays ~1.5s into recording')
  console.log('  [ ] Full screen, no taskbar')
  console.log('  [ ] 40 cards visible, animated-core sphere')
})

// ===================================================================
// TEST: Variant B — Hallie (Holographic theme)
// ===================================================================
test('Demo teaser — Hallie (holographic theme, soft)', async () => {
  const timing = await recordVariant({
    name: 'demo-hallie',
    theme: 'holographic',
    audioFile: HALLIE_AUDIO,
    rawPath: HALLIE_RAW,
    finalPath: HALLIE_FINAL,
  })

  writeFileSync(
    resolve(TEMP, 'demo-hallie-timing.json'),
    JSON.stringify({
      generated: new Date().toISOString(),
      variant: 'Hallie',
      theme: 'holographic',
      sphere: 'animated-core',
      audio: HALLIE_AUDIO,
      capture: {
        method: 'gdigrab full desktop',
        desktop_resolution: `${DESKTOP_W}x${DESKTOP_H}`,
        framerate: 30,
        duration_seconds: REC_DURATION,
      },
      output: {
        raw: 'demo-hallie-raw.mp4',
        final: 'demo-hallie.mp4',
        resolution: '1920x1080',
      },
      events: timing,
    }, null, 2)
  )

  console.log('\n[Hallie] QA CHECKLIST:')
  console.log('  [ ] Holographic theme — cyan/blue ethereal glow')
  console.log('  [ ] Camera approach smooth (22->11 over 3s)')
  console.log('  [ ] Sphere reacts to audio (real FFT, not fake sine)')
  console.log('  [ ] Audio plays ~1.5s into recording')
  console.log('  [ ] Full screen, no taskbar')
  console.log('  [ ] 40 cards visible, animated-core sphere')
})
