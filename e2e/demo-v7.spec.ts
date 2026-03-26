/**
 * Demo V7 — DEFINITIVE VERSION with VB-Cable Audio Capture
 *
 * CRITICAL IMPROVEMENTS FROM V6-A:
 *   1. VB-Cable audio capture via dshow (real system audio)
 *   2. NO setAudioDemo(true) — sphere reacts to REAL AnalyserNode FFT only
 *   3. ONE combined voice WAV at 1s mark
 *   4. Combined ffmpeg: gdigrab video + dshow audio in single command
 *   5. Post-process: scale 1080p + timecode ONLY (-c:a copy preserves captured audio)
 *
 * LOCKED SPEC (from demo-locked-spec.json):
 *   Theme: tactical, Color: cyan, Sphere: animated-core
 *   40 cards, auto-rotate 0.36, camera smooth 3s approach
 *   60fps in-scene animation via requestAnimationFrame
 *   Camera: [0,6,22] → [0,0,11]
 *
 * FFMPEG COMMAND (UNIFIED VIDEO+AUDIO):
 *   ffmpeg -f gdigrab -framerate 30 -video_size 3840x2160 -i desktop \
 *     -f dshow -i audio="CABLE Output (VB-Audio Virtual Cable)" \
 *     -t 16 -c:v libx264 -preset ultrafast -c:a aac -pix_fmt yuv420p -y output.mp4
 *
 * POST-PROCESS (NO AUDIO MIX):
 *   ffmpeg -y -i raw.mp4 \
 *     -vf "scale=1920:1080,drawtext=..." \
 *     -c:v libx264 -preset fast -c:a copy output.mp4
 *   Note: -c:a copy preserves VB-Cable audio from raw video
 *
 * VERIFICATION:
 *   ffprobe -show_streams output.mp4 → MUST show both video + audio
 *   python _scripts/detect_teleport.py output.mp4 --threshold 12 --fps 10
 *
 * OUTPUT:
 *   temp/demo-v7.mp4 (final with audio + timecode)
 *   temp/demo-v7-raw.mp4 (raw video + audio from VB-Cable)
 *   temp/demo-v7-teleport.json (teleport analysis)
 *
 * RUN:
 *   npx playwright test e2e/demo-v7.spec.ts --timeout 300000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { execSync, spawn } from 'child_process'
import { existsSync, statSync, writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const TEMP = resolve(ROOT, 'temp')

const RAW_VIDEO = resolve(TEMP, 'demo-v7-raw.mp4')
const FINAL_VIDEO = resolve(TEMP, 'demo-v7.mp4')
const DEBUG_SCREENSHOT = resolve(TEMP, 'demo-v7-debug.jpg')
const COMBINED_WAV = 'C:/Users/dindo/AppData/Local/Temp/hal-combined.wav'
const TIMING_LOG = resolve(TEMP, 'demo-v7-timing.json')
const TELEPORT_REPORT = resolve(TEMP, 'demo-v7-teleport.json')

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
// Setup — demo mode, PBR holo, TACTICAL theme, fullscreen, 70/30 split
// ===================================================================
async function setupScene() {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '40')  // V7: 40 cards
    localStorage.setItem('hal-o-demo-terminals', '3')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'tactical')      // V7: tactical (dark blue/gray)
    localStorage.setItem('hal-o-3d-color', 'cyan')          // V7: cyan
    localStorage.setItem('hal-o-sphere-style', 'animated-core')  // V7: animated-core
    localStorage.setItem('hal-o-split', '70')
    localStorage.setItem('hal-o-hub-font', '18')
    localStorage.setItem('hal-o-term-font', '16')
    localStorage.setItem('hal-o-cards-per-sector', '40')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
    localStorage.setItem('hal-o-auto-rotate', 'false')
    localStorage.setItem('hal-o-auto-rotate-speed', '0.36')  // V7: 0.36 (locked)
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
// TEST: Demo V7 — VB-Cable Audio Capture + Real FFT Only
// ===================================================================
test('Demo V7 — VB-Cable audio capture + real AnalyserNode FFT', async () => {
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
    console.log(`[V7 @ ${mm}:${ss}] ${action}`)
  }

  // ── Close settings if open ──
  await page.keyboard.press('Escape')
  await sleep(300)

  // ── V7 CRITICAL: NO setAudioDemo, NO setActivity ──
  // The sphere will react to REAL audio FFT data only
  console.log('[V7] CRITICAL: Skipping setAudioDemo(true) — sphere will read REAL AnalyserNode FFT')
  log('CRITICAL FIX: Audio demo OFF — sphere reacts to REAL voice audio FFT from VB-Cable')

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

  // ── V7: Position camera far away + enable OrbitControls from frame 1 ──
  await page.evaluate(() => {
    const cam = (window as any).__haloCamera
    const oc = (window as any).__haloOrbitControls
    if (!cam || !oc) {
      console.error('[V7] Camera or OrbitControls not available!')
      return
    }

    // Start camera far away and high
    cam.position.set(0, 6, 22)
    cam.lookAt(0, 1.0, 0)
    oc.target.set(0, 1.0, 0)
    oc.update()

    // Auto-rotate ON from frame 1 (slow initial)
    oc.autoRotate = true
    oc.autoRotateSpeed = 0.06
    oc.enabled = true

    console.log('[V7] OrbitControls active from frame 1: pos=[0,6,22], autoRotateSpeed=0.06')
  })
  await sleep(500)
  log('V7: OrbitControls active from frame 1 — camera at [0,6,22], autoRotate=0.06')

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

  // ── Start ffmpeg recording with VB-Cable audio ──
  const rawPath = RAW_VIDEO.replace(/\\/g, '/')
  // dshow requires audio= prefix (no double quotes around the whole device string)
  const ffmpegArgs = [
    '-f', 'gdigrab',
    '-framerate', '30',
    '-video_size', `${DESKTOP_W}x${DESKTOP_H}`,
    '-i', 'desktop',
    '-f', 'dshow',
    '-i', 'audio=CABLE Output (VB-Audio Virtual Cable)',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    '-t', String(REC_DURATION),
    '-y',
    rawPath,
  ]

  log(`RECORDING START — gdigrab ${DESKTOP_W}x${DESKTOP_H} @ 30fps + VB-Cable audio for ${REC_DURATION}s`)

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

  // ── V7: Play combined voice WAV at ~1s into recording ──
  await sleep(500)
  log('Playing combined voice WAV at ~1s mark')

  const combinedUrl = `file:///${COMBINED_WAV.replace(/\\/g, '/').replace(/^\//, '')}`
  await page.evaluate((url: string) => {
    const a = new Audio(url)
    a.volume = 1.0

    // V7 CRITICAL: Connect to REAL AnalyserNode (NOT fake demo signal)
    const analyser = (window as any).__haloAudioAnalyser
    if (analyser) {
      const ctx = analyser.context as AudioContext
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      const source = ctx.createMediaElementSource(a)
      const gainNode = ctx.createGain()
      gainNode.gain.value = 3.0  // V7: 3x boost for sphere sensitivity

      source.connect(gainNode)
      gainNode.connect(analyser)
      console.log('[V7] Combined voice WAV connected via GainNode (3x) → REAL AnalyserNode FFT — sphere will react to actual audio')
    } else {
      console.warn('[V7] No AnalyserNode found — sphere will NOT react to voice audio')
    }
    a.play().catch(e => console.error('[V7] Combined voice play failed:', e))
    ;(window as any).__halSpeaking = true
    a.addEventListener('ended', () => {
      ;(window as any).__halSpeaking = false
    })
  }, combinedUrl)
  log(`Combined voice WAV playback started: ${COMBINED_WAV}`)
  log('NOTE: Sphere reacting to REAL AnalyserNode FFT from actual voice + VB-Cable capture')

  // ── V7 CORE: Smooth 60fps approach via ONE requestAnimationFrame injection ──
  log('V7: Injecting 60fps smooth approach — distance 22→11, height 6→0 over 3s + speed ramp 1s')

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
        // Approach complete — start speed ramp to 0.36
        console.log('[V7] Approach complete — starting speed ramp 0.06→0.36 over 1s')
        const rampStart = performance.now()
        const rampDuration = 1000
        const startSpeed = 0.06, endSpeed = 0.36  // V7: ramp to 0.36
        const ramp = () => {
          const rt = Math.min((performance.now() - rampStart) / rampDuration, 1)
          oc.autoRotateSpeed = startSpeed + (endSpeed - startSpeed) * rt
          if (rt < 1) {
            requestAnimationFrame(ramp)
          } else {
            console.log('[V7] Speed ramp complete — autoRotateSpeed=0.36')
          }
        }
        requestAnimationFrame(ramp)
      }
    }
    requestAnimationFrame(animate)
  })

  // Wait for approach (3s) + speed ramp (1s) + buffer (0.5s) = 4.5s
  await sleep(4500)
  log('V7: 60fps smooth approach + speed ramp complete')

  // ── Wait for the remaining recording time ──
  log('Waiting for remaining recording time...')
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ffmpegProc.kill('SIGTERM')
      reject(new Error('ffmpeg recording timed out after 120s'))
    }, 120_000)

    ffmpegProc.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
      } else {
        console.error('[V7] ffmpeg stderr (last 1000 chars):', ffmpegStderr.slice(-1000))
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

  // ── V7 POST-PROCESS: Scale to 1920x1080 + timecode overlay ONLY
  // Audio was already captured by gdigrab + dshow during recording
  const finalPath = FINAL_VIDEO.replace(/\\/g, '/')

  log('POST — scale to 1920x1080 + timecode overlay only (-c:a copy preserves VB-Cable audio)')
  try {
    execSync(
      `ffmpeg -y -i "${rawPath}" ` +
      `-vf "scale=1920:1080,drawtext=text='%{pts\\:hms} F%{n}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=10:y=10" ` +
      `-c:v libx264 -preset fast -c:a copy "${finalPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    log('Scale + timecode overlay done (-c:a copy)')
  } catch (err: any) {
    console.error('[V7] Post-process failed:', err.stderr?.toString().slice(-500))
    log('FALLBACK — copying raw video as final')
    execSync(`cp "${rawPath}" "${finalPath}"`, { stdio: 'pipe' })
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
    '5s: auto-rotate at 0.36 speed, cards scrolling',
    '10s: more cards scrolled past',
  ]

  const qaFramePaths: string[] = []
  for (let i = 0; i < qaTimestamps.length; i++) {
    const ts = qaTimestamps[i]
    const qaFrame = resolve(TEMP, `demo-v7-qa-${ts}s.jpg`).replace(/\\/g, '/')
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

  // ── V7: Run detect_teleport.py for automated teleport detection ──
  log('V7: Running detect_teleport.py --threshold 12 --fps 10')
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

  // ── Verify audio stream with ffprobe ──
  log('AUDIO VERIFICATION — checking if final video has audio stream')
  try {
    const ffprobeOutput = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1:noinput=1 "${finalPath}"`,
      { stdio: 'pipe', timeout: 30000, encoding: 'utf-8' }
    )
    if (ffprobeOutput.includes('audio')) {
      log('AUDIO: Confirmed — final video has audio stream from VB-Cable')
    } else {
      log('WARNING: No audio stream detected in final video')
    }
  } catch {
    log('WARNING: Could not verify audio stream with ffprobe')
  }

  // ── Save timing log ──
  writeFileSync(TIMING_LOG, JSON.stringify({
    generated: new Date().toISOString(),
    version: 'V7',
    variant: 'DEFINITIVE',
    critical_features: [
      'VB-Cable audio capture via dshow in single ffmpeg command',
      'NO setAudioDemo(true) — sphere reacts to REAL AnalyserNode FFT',
      'Combined voice WAV played through GainNode 3x → AnalyserNode',
      'Single unified ffmpeg: gdigrab video + dshow audio together',
      'Post-process preserves audio via -c:a copy (no audio mixing)',
    ],
    changes_from_v6a: [
      'ffmpeg: Added -f dshow -i audio="CABLE Output (VB-Audio Virtual Cable)" for VB-Cable capture',
      'Post-process: Changed -c:a aac to -c:a copy (preserve captured audio)',
      'Verification: ffprobe now checks for audio stream in final video',
      'All other behavior: identical to V6-A (real FFT, no fake demo)',
    ],
    locked_spec: {
      theme: 'tactical',
      color: 'cyan',
      sphere_style: 'animated-core',
      voice: 'Combined (real audio via VB-Cable)',
      camera_approach: '60fps requestAnimationFrame: distance 22→11, height 6→0 over 3s (smoothstep)',
      camera_after: 'autoRotateSpeed ramp 0.06→0.36 over 1s (also 60fps rAF)',
      cards_per_sector: 40,
      activity: 'NONE — sphere reacts to real audio FFT only',
      audio_file: 'hal-combined.wav at 1s',
      audio_gain: '3.0x via GainNode',
      audio_analyser: 'REAL AnalyserNode FFT (NOT fake demo signal)',
      audio_capture: 'VB-Cable Output (VB-Audio Virtual Cable) via dshow',
      recording: '16s gdigrab 3840x2160 + dshow audio',
      post: '1920x1080 + timecode (-c:a copy preserves VB-Cable audio)',
      teleport_check: 'detect_teleport.py --threshold 12 --fps 10',
    },
    smooth_approach: {
      description: 'Single requestAnimationFrame injection runs at native 60fps inside the Three.js render loop',
      method: 'ONE page.evaluate injects animate() function that calls requestAnimationFrame recursively',
      easing: 'smoothstep: t*t*(3-2*t)',
      approach_duration_ms: 3000,
      ramp_duration_ms: 1000,
      total_animation_ms: 4000,
    },
    capture: {
      method: 'unified gdigrab + dshow',
      desktop_resolution: `${DESKTOP_W}x${DESKTOP_H}`,
      dpi_scaling: '125%',
      framerate: 30,
      duration_seconds: REC_DURATION,
      audio_device: 'CABLE Output (VB-Audio Virtual Cable)',
      audio_codec: 'aac (during recording) → copy in post',
    },
    camera: {
      approach_start_distance: 22,
      approach_start_height: 6,
      approach_end_distance: 11,
      approach_end_height: 0,
      approach_duration_ms: 3000,
      lookAt_target: [0, 1.0, 0],
      auto_rotate_speed_initial: 0.06,
      auto_rotate_speed_final: 0.36,
      ramp_duration_ms: 1000,
    },
    audio: {
      combined_voice: COMBINED_WAV,
      combined_delay_ms: 1000,
      gain_boost: 3.0,
      analyser_connected: 'REAL FFT (NOT fake setAudioDemo)',
      recording_method: 'VB-Cable via dshow + gdigrab (unified)',
      vb_cable_device: 'CABLE Output (VB-Audio Virtual Cable)',
      critical_note: 'Sphere reacts to actual frequency data from voice audio + system audio via VB-Cable, NOT synthetic sine wave',
    },
    video: {
      raw: 'demo-v7-raw.mp4',
      final: 'demo-v7.mp4',
      debug_screenshot: 'demo-v7-debug.jpg',
      resolution: '1920x1080',
      qa_frames: qaTimestamps.map(t => `demo-v7-qa-${t}s.jpg`),
      teleport_report: 'demo-v7-teleport.json',
      events: timingLog,
    },
  }, null, 2))

  // ── QA Summary ──
  console.log('\n[V7] QA CHECKLIST:')
  console.log('  [ ] CRITICAL: VB-Cable audio captured in single ffmpeg command')
  console.log('  [ ] CRITICAL: No setAudioDemo(true) or setActivity() — sphere reacts to REAL audio FFT')
  console.log('  [ ] 0s:   FAR establishing shot — camera high and back (distance=22, height=6)')
  console.log('  [ ] 1.5s: MID-APPROACH — camera visibly closer (distance ~16, height ~3) — 60fps smooth')
  console.log('  [ ] 3s:   ARRIVED at card level (distance=11, height=0)')
  console.log('  [ ] 5s:   Auto-rotate at 0.36 speed, cards scrolling faster than V6-A')
  console.log('  [ ] 10s:  More rotation — different cards visible')
  console.log('  [ ] NO teleport/jump between any consecutive frames (60fps smooth interpolation)')
  console.log('  [ ] Combined voice WAV audible starting at ~1s (from VB-Cable capture)')
  console.log('  [ ] Sphere CLEARLY reacting to voice frequency content (bass → pulsing, highs → glitter)')
  console.log('  [ ] Full screen, no taskbar, 40 cards visible')
  console.log('  [ ] Animated-core sphere visible and pulsing with REAL audio')
  console.log('  [ ] Tactical theme (dark blue/gray) with cyan accents')
  console.log('  [ ] ffprobe confirms audio stream in final video')
  console.log('  [ ] detect_teleport.py PASS with threshold 12')

  // Exit fullscreen before closing
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.setFullScreen(false)
    })
  } catch {}

  log('DEMO V7 — COMPLETE (VB-Cable audio + REAL AnalyserNode FFT)')
  await app?.close()
})
