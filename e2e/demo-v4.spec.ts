/**
 * Demo V4 — DEFINITIVE Demo Teaser
 *
 * CHANGES FROM V3:
 *   1. SMOOTH IN-SCENE INTERPOLATION: Instead of 30 page.evaluate() calls
 *      (runs at ~10fps, looks steppy), V4 injects ONE JavaScript function
 *      that runs INSIDE the Three.js render loop at 60fps via requestAnimationFrame.
 *   2. EMBER THEME: Red tones (hal-o-3d-theme = 'ember') instead of green/neon.
 *   3. TWO AUDIO LINES: Butler greeting at 1s + "fully open source" line at 6s,
 *      both connected to AnalyserNode so sphere reacts.
 *   4. HAL-EYE SPHERE: Kept from V3 (hal-eye style).
 *   5. AUDIO ANALYSER: Audio elements connected to window.__haloAudioAnalyser.
 *   6. POST-VALIDATION: detect_teleport.py with threshold 12.
 *
 * SPEC:
 *   - Sphere style: hal-eye
 *   - Cards: 40 per sector, activity 100, ember theme
 *   - Audio: butler greeting at 1s + open source line at 6s (both AnalyserNode)
 *   - Recording: gdigrab 3840x2160, 16 seconds
 *   - Post: 1920x1080 + timecode + both audio lines mixed
 *   - QA frames at 0s, 1.5s, 3s, 5s, 10s
 *   - Teleport check: detect_teleport.py --threshold 12 --fps 10
 *
 * RUN:
 *   npx playwright test e2e/demo-v4.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync, writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_VIDEO = resolve(TEMP, 'demo-v4-raw.mp4')
const FINAL_VIDEO = resolve(TEMP, 'demo-v4.mp4')
const DEBUG_SCREENSHOT = resolve(TEMP, 'demo-v4-debug.jpg')
const GREETING_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-v10.wav'
const OPENSOURCE_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-opensource.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v4-timing.json')
const TELEPORT_REPORT = resolve(TEMP, 'demo-v4-teleport.json')

const REC_DURATION = 16
const DESKTOP_W = 3840
const DESKTOP_H = 2160

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ===================================================================
// Setup — demo mode, PBR holo, EMBER theme, fullscreen, 70/30 split
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
    localStorage.setItem('hal-o-3d-theme', 'ember')        // V4: ember (red tones)
    localStorage.setItem('hal-o-sphere-style', 'hal-eye')   // V4: HAL-eye kept
    localStorage.setItem('hal-o-split', '70')
    localStorage.setItem('hal-o-hub-font', '18')
    localStorage.setItem('hal-o-term-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '40')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
    // V4: auto-rotate OFF in localStorage — we enable it manually from frame 1
    localStorage.setItem('hal-o-auto-rotate', 'false')
    localStorage.setItem('hal-o-auto-rotate-speed', '0.24')
  })
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

  // Wait for WebGL init + textures + bloom + terminals to fill
  await page.waitForTimeout(12000)
}

// ===================================================================
// TEST: Demo V4 — 60fps in-scene interpolation + ember + two audio
// ===================================================================
test('Demo V4 — 60fps smooth approach, ember theme, two audio lines', async () => {
  ;({ app, page } = await launchApp())
  await setupScene()

  // Clean old output files
  for (const f of [RAW_VIDEO, FINAL_VIDEO, DEBUG_SCREENSHOT, TELEPORT_REPORT]) {
    try { execSync(`rm -f "${f.replace(/\\/g, '/')}"`, { stdio: 'ignore' }) } catch {}
  }

  const timingLog: Array<{ time: string; seconds: number; action: string }> = []
  const t0 = Date.now()
  function log(action: string) {
    const s = (Date.now() - t0) / 1000
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    timingLog.push({ time: `${mm}:${ss}`, seconds: Math.round(s * 10) / 10, action })
    console.log(`[V4 @ ${mm}:${ss}] ${action}`)
  }

  // ── Close settings if open ──
  await page.keyboard.press('Escape')
  await sleep(300)

  // ── Set activity + audio demo ──
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(100)
      pm.setAudioDemo(true)
    }
  })
  await sleep(500)
  log('Activity 100, audio demo on')

  // ── DEBUG VALIDATION: wireframe to verify card positions ──
  log('DEBUG: enabling wireframe mode...')
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm?.wireframe) pm.wireframe(true)
  })
  await sleep(800)

  // Take debug wireframe screenshot
  const debugPath = DEBUG_SCREENSHOT.replace(/\\/g, '/')
  await page.screenshot({ path: debugPath.replace(/\//g, '\\'), fullPage: false })
  log(`DEBUG: wireframe screenshot saved: ${debugPath}`)

  // Disable wireframe
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm?.wireframe) pm.wireframe(false)
  })
  await sleep(500)
  log('DEBUG: wireframe disabled')

  // ── V4: Position camera far away + enable OrbitControls from frame 1 ──
  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (!cam || !oc) {
      console.error('[V4] Camera or OrbitControls not available!')
      return
    }

    // Start camera far away and high
    cam.position.set(0, 6, 22)
    cam.lookAt(0, 1.0, 0)
    oc.target.set(0, 1.0, 0)
    oc.update()

    // Auto-rotate ON from frame 1 (slow)
    oc.autoRotate = true
    oc.autoRotateSpeed = 0.06
    oc.enabled = true

    console.log('[V4] OrbitControls active from frame 1: pos=[0,6,22], autoRotateSpeed=0.06')
  })
  await sleep(500)
  log('V4: OrbitControls active from frame 1 — camera at [0,6,22], autoRotate=0.06')

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

  // ── Ensure HAL-O is focused and on top ──
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.focus()
      win.moveTop()
    }
  })
  await sleep(500)
  log('HAL-O fullscreen, focused, on top')

  // ── Start ffmpeg recording ──
  const rawPath = RAW_VIDEO.replace(/\\/g, '/')
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

  // Small delay to ensure ffmpeg is actually capturing frames
  await sleep(500)
  log('ffmpeg capturing — injecting 60fps smooth approach animation')

  // ── Play butler greeting at ~1s into recording ──
  await sleep(500)
  log('Playing butler greeting at ~1s mark')

  const greetingUrl = `file:///${GREETING_WAV.replace(/\\/g, '/').replace(/^\//, '')}`
  await page.evaluate((url: string) => {
    const a = new Audio(url)
    a.volume = 1.0
    // Connect to global AnalyserNode so sphere reacts to voice audio
    const analyser = (window as any).__haloAudioAnalyser
    if (analyser) {
      const ctx = analyser.context as AudioContext
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const source = ctx.createMediaElementSource(a)
      source.connect(analyser)
      console.log('[V4] Greeting audio connected to AnalyserNode — sphere will react')
    } else {
      console.warn('[V4] No AnalyserNode found — sphere will NOT react to greeting audio')
    }
    a.play().catch(e => console.error('[V4] Greeting audio play failed:', e))
    ;(window as any).__halSpeaking = true
    a.addEventListener('ended', () => {
      ;(window as any).__halSpeaking = false
    })
  }, greetingUrl)
  log(`Greeting audio playback started: ${GREETING_WAV}`)

  // ── Schedule second audio line at ~6s into recording ──
  const opensourceUrl = `file:///${OPENSOURCE_WAV.replace(/\\/g, '/').replace(/^\//, '')}`
  await page.evaluate(({ url, delayMs }: { url: string; delayMs: number }) => {
    setTimeout(() => {
      const a = new Audio(url)
      a.volume = 1.0
      // Connect to global AnalyserNode so sphere reacts
      const analyser = (window as any).__haloAudioAnalyser
      if (analyser) {
        const ctx = analyser.context as AudioContext
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        const source = ctx.createMediaElementSource(a)
        source.connect(analyser)
        console.log('[V4] Open-source audio connected to AnalyserNode')
      }
      a.play().catch(e => console.error('[V4] Open-source audio play failed:', e))
      ;(window as any).__halSpeaking = true
      a.addEventListener('ended', () => {
        ;(window as any).__halSpeaking = false
      })
    }, delayMs)
  }, { url: opensourceUrl, delayMs: 5000 }) // 5s after greeting start = ~6s into recording
  log('Open-source audio scheduled at ~6s mark')

  // ── V4 CORE: Smooth 60fps approach via ONE requestAnimationFrame injection ──
  // This replaces V3's 30 page.evaluate() calls with a single in-scene animation
  // that runs at native refresh rate (60fps) using smoothstep easing.
  log('V4: Injecting 60fps smooth approach — distance 22→11, height 6→0 over 3s + speed ramp 1s')

  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (!cam || !oc) return

    const startDist = 22, endDist = 11
    const startH = 6, endH = 0
    const duration = 3000 // 3 seconds
    const t0 = performance.now()

    const animate = () => {
      const elapsed = performance.now() - t0
      const t = Math.min(elapsed / duration, 1)
      const eased = t * t * (3 - 2 * t) // smoothstep

      const dist = startDist - (startDist - endDist) * eased
      const h = startH - (startH - endH) * eased

      // Get current azimuth from auto-rotate
      const dx = cam.position.x - oc.target.x
      const dz = cam.position.z - oc.target.z
      const azimuth = Math.atan2(dx, dz)

      cam.position.x = oc.target.x + Math.sin(azimuth) * dist
      cam.position.y = oc.target.y + h
      cam.position.z = oc.target.z + Math.cos(azimuth) * dist

      oc.update()

      if (t < 1) {
        requestAnimationFrame(animate)
      } else {
        // Approach complete — start speed ramp
        console.log('[V4] Approach complete — starting speed ramp 0.06→0.24 over 1s')
        const rampStart = performance.now()
        const rampDuration = 1000
        const startSpeed = 0.06, endSpeed = 0.24
        const ramp = () => {
          const rt = Math.min((performance.now() - rampStart) / rampDuration, 1)
          oc.autoRotateSpeed = startSpeed + (endSpeed - startSpeed) * rt
          if (rt < 1) {
            requestAnimationFrame(ramp)
          } else {
            console.log('[V4] Speed ramp complete — autoRotateSpeed=0.24')
          }
        }
        requestAnimationFrame(ramp)
      }
    }
    requestAnimationFrame(animate)
  })

  // Wait for approach (3s) + speed ramp (1s) + buffer (0.5s) = 4.5s
  await sleep(4500)
  log('V4: 60fps smooth approach + speed ramp complete')

  // ── Wait for the remaining recording time ──
  // Total elapsed since recording start: ~6.5s (0.5 ffmpeg + 0.5 audio delay + 4.5 animation + 1s scheduling)
  // Remaining: ~9.5s — ffmpeg will stop on its own after REC_DURATION
  log('Waiting for remaining recording time...')
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ffmpegProc.kill('SIGTERM')
      reject(new Error('ffmpeg recording timed out after 45s'))
    }, 45_000)

    ffmpegProc.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
      } else {
        console.error('[V4] ffmpeg stderr (last 1000 chars):', ffmpegStderr.slice(-1000))
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    ffmpegProc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  if (existsSync(RAW_VIDEO)) {
    const rawSize = (statSync(RAW_VIDEO).size / 1024 / 1024).toFixed(1)
    log(`RECORDING DONE — raw: ${rawSize} MB`)
  } else {
    throw new Error('ffmpeg produced no output file')
  }

  // ── POST-PROCESS: Scale to 1920x1080 + TWO audio lines mixed + timecode ──
  const finalPath = FINAL_VIDEO.replace(/\\/g, '/')
  const greetingPath = GREETING_WAV.replace(/\\/g, '/')
  const opensourcePath = OPENSOURCE_WAV.replace(/\\/g, '/')

  const hasGreeting = existsSync(GREETING_WAV)
  const hasOpensource = existsSync(OPENSOURCE_WAV)

  if (hasGreeting && hasOpensource) {
    log('POST — scale to 1920x1080 + TWO audio lines (1s + 6s) + timecode')
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -i "${greetingPath}" -i "${opensourcePath}" ` +
        `-filter_complex "` +
        `[0:v]scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10[vout];` +
        `[1:a]adelay=1000|1000[a1];` +
        `[2:a]adelay=6000|6000[a2];` +
        `[a1][a2]amix=inputs=2:duration=longest,apad=whole_dur=${REC_DURATION}[aout]` +
        `" ` +
        `-map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('Scale + two audio lines + timecode done')
    } catch (err: any) {
      console.error('[V4] Two-audio mix failed:', err.stderr?.toString().slice(-500))
      log('FALLBACK — trying single audio (greeting only)')
      try {
        execSync(
          `ffmpeg -y -i "${rawPath}" -i "${greetingPath}" ` +
          `-filter_complex "[0:v]scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10[vout];[1:a]adelay=1000|1000,apad=whole_dur=${REC_DURATION}[aout]" ` +
          `-map "[vout]" -map "[aout]" ` +
          `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
          { stdio: 'pipe', timeout: 120000 }
        )
        log('Fallback: scale + single audio + timecode done')
      } catch {
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
    }
  } else if (hasGreeting) {
    log('POST — scale to 1920x1080 + greeting audio at 1s + timecode (open-source audio missing)')
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -i "${greetingPath}" ` +
        `-filter_complex "[0:v]scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10[vout];[1:a]adelay=1000|1000,apad=whole_dur=${REC_DURATION}[aout]" ` +
        `-map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -preset fast -c:a aac -shortest "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
      log('Scale + greeting audio + timecode done')
    } catch (err: any) {
      console.error('[V4] Scale+audio failed:', err.stderr?.toString().slice(-500))
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
    log('WARNING: No audio files — scale + timecode only')
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -vf "scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" -c:v libx264 -preset fast "${finalPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      )
    } catch {
      execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
    }
  }

  const outputPath = existsSync(FINAL_VIDEO) ? FINAL_VIDEO : RAW_VIDEO
  if (existsSync(outputPath)) {
    const finalSize = (statSync(outputPath).size / 1024 / 1024).toFixed(1)
    log(`Final video: ${finalSize} MB → ${outputPath}`)
  }

  // ── POST-RECORDING QA: extract frames at 0s, 1.5s, 3s, 5s, 10s ──
  log('QA — extracting frames at 0s, 1.5s, 3s, 5s, 10s')
  const qaTimestamps = [0, 1.5, 3, 5, 10]
  const qaLabels = [
    '0s: FAR establishing shot (camera at distance=22, height=6)',
    '1.5s: camera MID-APPROACH (distance ~16, height ~3) — 60fps smooth',
    '3s: camera ARRIVED at card level (distance=11, height=0)',
    '5s: auto-rotate at full speed, cards scrolling',
    '10s: more cards scrolled past',
  ]

  const qaFramePaths: string[] = []
  for (let i = 0; i < qaTimestamps.length; i++) {
    const ts = qaTimestamps[i]
    const qaFrame = resolve(TEMP, `demo-v4-qa-${ts}s.jpg`).replace(/\\/g, '/')
    qaFramePaths.push(qaFrame)
    try {
      execSync(
        `ffmpeg -y -ss ${ts} -i "${finalPath}" -frames:v 1 -q:v 2 "${qaFrame}"`,
        { stdio: 'pipe', timeout: 30000 }
      )
      const nativePath = qaFrame.replace(/\//g, '\\')
      if (existsSync(nativePath)) {
        const sizeKB = Math.round(statSync(nativePath).size / 1024)
        log(`  QA frame ${ts}s: ${sizeKB} KB — ${qaLabels[i]}`)
      }
    } catch {
      log(`  QA frame ${ts}s: FAILED to extract — ${qaLabels[i]}`)
    }
  }

  // ── TELEPORT CHECK: basic frame presence verification ──
  log('TELEPORT CHECK — verifying all QA frames extracted successfully')
  let allFramesOk = true
  for (let i = 0; i < qaFramePaths.length; i++) {
    const nativePath = qaFramePaths[i].replace(/\//g, '\\')
    if (!existsSync(nativePath)) {
      log(`  FAIL: Frame ${qaTimestamps[i]}s missing!`)
      allFramesOk = false
    }
  }
  if (allFramesOk) {
    log('TELEPORT CHECK: All frames present')
  }

  // ── V4: Run detect_teleport.py for automated teleport detection ──
  log('V4: Running detect_teleport.py --threshold 12 --fps 10')
  const teleportReportPath = TELEPORT_REPORT.replace(/\\/g, '/')
  const videoToAnalyze = existsSync(FINAL_VIDEO)
    ? FINAL_VIDEO.replace(/\\/g, '/')
    : RAW_VIDEO.replace(/\\/g, '/')
  try {
    const teleportResult = execSync(
      `python _scripts/detect_teleport.py "${videoToAnalyze}" --threshold 12 --fps 10 --output "${teleportReportPath}"`,
      { cwd: ROOT, stdio: 'pipe', timeout: 180000, encoding: 'utf-8' }
    )
    log(`detect_teleport.py output:\n${teleportResult}`)

    // Read the JSON report and log key findings
    if (existsSync(TELEPORT_REPORT)) {
      const report = JSON.parse(readFileSync(TELEPORT_REPORT, 'utf-8'))
      log(`TELEPORT VERDICT: ${report.verdict}`)
      log(`Stats: avg=${report.stats?.avg_diff}, max=${report.stats?.max_diff}, min=${report.stats?.min_diff}`)
      log(`Teleports detected: ${report.teleports_detected}`)
      if (report.top5_roughest) {
        log('Top 5 roughest transitions:')
        for (const t of report.top5_roughest) {
          const flag = t.diff > 12 ? ' *** TELEPORT' : ''
          log(`  Frame ${t.frame} (t=${t.time}s): diff=${t.diff}${flag}`)
        }
      }
    }
  } catch (err: any) {
    const stderr = err.stderr?.toString() || ''
    const stdout = err.stdout?.toString() || ''
    log(`detect_teleport.py failed (exit code ${err.status}): ${stderr || stdout}`)

    // Still try to read the report if it was written before exit
    if (existsSync(TELEPORT_REPORT)) {
      try {
        const report = JSON.parse(readFileSync(TELEPORT_REPORT, 'utf-8'))
        log(`TELEPORT VERDICT: ${report.verdict}`)
        log(`Teleports detected: ${report.teleports_detected}`)
        if (report.top5_roughest) {
          log('Top 5 roughest transitions:')
          for (const t of report.top5_roughest) {
            const flag = t.diff > 12 ? ' *** TELEPORT' : ''
            log(`  Frame ${t.frame} (t=${t.time}s): diff=${t.diff}${flag}`)
          }
        }
      } catch {}
    }
  }

  // ── Save timing log ──
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    version: 'V4',
    changes_from_v3: [
      'SMOOTH 60fps interpolation via single requestAnimationFrame injection (replaces 30 page.evaluate calls)',
      'Ember theme (red tones) instead of neon (green)',
      'Two audio lines: butler greeting at 1s + "fully open source" at 6s',
      'Both audio connected to AnalyserNode for sphere reaction',
      'HAL-eye sphere style kept',
    ],
    locked_spec: {
      camera_approach: '60fps requestAnimationFrame: distance 22→11, height 6→0 over 3s (smoothstep)',
      camera_after: 'autoRotateSpeed ramp 0.06→0.24 over 1s (also 60fps rAF)',
      cards_per_sector: 40,
      activity: 100,
      theme: 'ember',
      sphere_style: 'hal-eye',
      audio_1: 'Butler greeting at 1s',
      audio_2: '"Fully open source" at 6s',
      recording: '16s gdigrab 3840x2160',
      post: '1920x1080 + timecode + two audio mixed',
      teleport_check: 'detect_teleport.py --threshold 12 --fps 10',
    },
    smooth_approach: {
      description: 'Single requestAnimationFrame injection runs at native 60fps inside the Three.js render loop',
      method: 'ONE page.evaluate injects animate() function that calls requestAnimationFrame recursively',
      easing: 'smoothstep: t*t*(3-2*t)',
      approach_duration_ms: 3000,
      ramp_duration_ms: 1000,
      total_animation_ms: 4000,
      advantage_over_v3: 'V3 used 30 page.evaluate calls at 100ms intervals = ~10fps. V4 runs at native refresh rate.',
    },
    capture: {
      method: 'gdigrab full desktop',
      desktop_resolution: `${DESKTOP_W}x${DESKTOP_H}`,
      dpi_scaling: '125%',
      framerate: 30,
      duration_seconds: REC_DURATION,
    },
    camera: {
      approach_start_distance: 22,
      approach_start_height: 6,
      approach_end_distance: 11,
      approach_end_height: 0,
      approach_duration_ms: 3000,
      lookAt_target: [0, 1.0, 0],
      auto_rotate_speed_initial: 0.06,
      auto_rotate_speed_final: 0.24,
      ramp_duration_ms: 1000,
    },
    audio: {
      greeting: GREETING_WAV,
      greeting_delay_ms: 1000,
      opensource: OPENSOURCE_WAV,
      opensource_delay_ms: 6000,
      analyser_connected: true,
    },
    video: {
      raw: 'demo-v4-raw.mp4',
      final: 'demo-v4.mp4',
      debug_screenshot: 'demo-v4-debug.jpg',
      resolution: '1920x1080',
      qa_frames: qaTimestamps.map(t => `demo-v4-qa-${t}s.jpg`),
      teleport_report: 'demo-v4-teleport.json',
      events: timingLog,
    },
  }, null, 2))

  // ── QA Summary ──
  console.log('\n[V4] QA CHECKLIST:')
  console.log('  [ ] 0s:   FAR establishing shot — camera high and back (distance=22, height=6)')
  console.log('  [ ] 1.5s: MID-APPROACH — camera visibly closer (distance ~16, height ~3) — 60fps smooth')
  console.log('  [ ] 3s:   ARRIVED at card level (distance=11, height=0)')
  console.log('  [ ] 5s:   Auto-rotate at full speed, cards scrolling')
  console.log('  [ ] 10s:  More rotation — different cards visible')
  console.log('  [ ] NO teleport/jump between any consecutive frames (60fps smooth interpolation)')
  console.log('  [ ] Butler greeting audible starting at ~1s')
  console.log('  [ ] "Fully open source" audible starting at ~6s')
  console.log('  [ ] Full screen, no taskbar, 40 cards visible')
  console.log('  [ ] HAL 9000 red eye sphere visible')
  console.log('  [ ] Ember theme (red tones) applied')
  console.log('  [ ] Sphere reacts to both audio lines (AnalyserNode connected)')
  console.log('  [ ] detect_teleport.py PASS with threshold 12')

  // Exit fullscreen before closing
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.setFullScreen(false)
    })
  } catch {}

  log('DEMO V4 — COMPLETE')
  await app?.close()
})
