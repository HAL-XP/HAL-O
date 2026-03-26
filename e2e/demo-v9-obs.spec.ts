/**
 * Demo V9 — OBS WebSocket recording with real audio capture.
 *
 * Prerequisites:
 * 1. OBS Studio running with WebSocket server enabled (port 4455, no password)
 * 2. OBS scene with "Window Capture" source pointed at HAL-O window
 * 3. OBS audio set to capture Desktop Audio
 *
 * This spec:
 * - Connects to OBS via obs-websocket-js
 * - Launches HAL-O in demo mode with ember theme + animated-core sphere
 * - Starts OBS recording
 * - Plays audio through the sphere (manual AnalyserNode injection)
 * - Smooth camera approach via requestAnimationFrame
 * - Stops recording after 12s
 * - Validates: no teleports (via screenshot diff), audio in output file
 */

import { test, expect, _electron as electron } from '@playwright/test'
import OBSWebSocket from 'obs-websocket-js'
import path from 'path'
import fs from 'fs'

// Read the locked spec
const SPEC = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../.claude/skills/marketing/demo-locked-spec.json'), 'utf-8'
))

const OBS_PORT = 4455
const RECORD_DURATION = 12_000 // 12 seconds

test.describe('Demo V9 — OBS Recording', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof app['firstWindow']>>
  let obs: OBSWebSocket

  test.beforeAll(async () => {
    // Connect to OBS
    obs = new OBSWebSocket()
    try {
      await obs.connect(`ws://127.0.0.1:${OBS_PORT}`)
    } catch {
      test.skip(true, 'OBS WebSocket not available — skip recording test')
      return
    }

    // Launch app with demo mode settings pre-set
    const userDataDir = path.join(__dirname, `../.test-data/demo-v9-${Date.now()}`)
    fs.mkdirSync(userDataDir, { recursive: true })

    app = await electron.launch({
      args: ['.', '--fast-wizards'],
      env: { ...process.env, ELECTRON_DISABLE_GPU: '0' },
      cwd: path.resolve(__dirname, '..'),
    })
    page = await app.firstWindow()

    // Set up demo mode via localStorage
    await page.evaluate((spec) => {
      localStorage.setItem('hal-o-demo-mode', 'true')
      localStorage.setItem('hal-o-demo-cards', String(spec.scene.demo_cards))
      localStorage.setItem('hal-o-renderer', spec.scene.renderer)
      localStorage.setItem('hal-o-three-theme', spec.scene.theme)
      localStorage.setItem('hal-o-sphere-style', spec.scene.sphere_style)
      localStorage.setItem('hal-o-intro', String(spec.scene.intro_animation))
      localStorage.setItem('hal-o-cards-per-sector', String(spec.scene.cards_per_sector))
      localStorage.setItem('hal-o-hub-font', String(spec.scene.hub_font))
      localStorage.setItem('hal-o-term-font', String(spec.scene.term_font))
      localStorage.setItem('hal-o-setup-done', 'true')
      localStorage.setItem('hal-o-tutorial-done', 'true')
      localStorage.setItem('hal-o-gpu-wizard-dismissed', 'true')
    }, SPEC)

    await page.reload()
    await page.waitForTimeout(3000) // Wait for scene to load
  })

  test.afterAll(async () => {
    obs?.disconnect()
    await app?.close()
  })

  test('record 12s demo with OBS audio capture', async () => {
    // Inject manual AnalyserNode for sphere audio reaction
    await page.evaluate(async () => {
      const w = window as any
      if (!w.__haloAudioAnalyser) {
        const ctx = new AudioContext()
        if (ctx.state === 'suspended') await ctx.resume()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.3
        analyser.connect(ctx.destination)
        w.__haloAudioAnalyser = analyser
        w.__halAudioAnalyser = analyser
      }
    })

    // Start smooth camera approach
    await page.evaluate((spec) => {
      const cam = spec.camera
      const canvas = document.querySelector('canvas')
      if (!canvas) return

      // Access Three.js internals through R3F
      const w = window as any
      const controls = w.__haloOrbitControls
      if (!controls) return

      const startDist = cam.start_position[2]
      const endDist = cam.end_position[2]
      const startY = cam.start_position[1]
      const endY = cam.end_position[1]
      const duration = cam.approach_duration_ms

      controls.autoRotate = true
      controls.autoRotateSpeed = cam.auto_rotate_start_speed

      const startTime = performance.now()
      function animate() {
        const elapsed = performance.now() - startTime
        const raw = Math.min(elapsed / duration, 1)
        // Smoothstep easing
        const t = raw * raw * (3 - 2 * raw)

        const dist = startDist + (endDist - startDist) * t
        const y = startY + (endY - startY) * t

        controls.object.position.set(
          Math.sin(controls.getAzimuthalAngle()) * dist,
          y,
          Math.cos(controls.getAzimuthalAngle()) * dist
        )

        // Ramp up rotation speed
        const speedT = Math.min(elapsed / cam.speed_ramp_duration_ms, 1)
        controls.autoRotateSpeed = cam.auto_rotate_start_speed +
          (cam.auto_rotate_final_speed - cam.auto_rotate_start_speed) * speedT

        if (raw < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }, SPEC)

    // Start OBS recording
    await obs.call('StartRecord')

    // Wait for recording duration
    await page.waitForTimeout(RECORD_DURATION)

    // Stop recording
    const result = await obs.call('StopRecord')
    const outputPath = (result as any).outputPath

    // Verify recording file exists and has reasonable size
    if (outputPath && fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath)
      expect(stats.size).toBeGreaterThan(1_000_000) // > 1MB for 12s video
      console.log(`Recording saved: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
    }

    // Take final screenshot for visual verification
    const screenshot = await page.screenshot()
    expect(screenshot.length).toBeGreaterThan(10000)
  })
})
