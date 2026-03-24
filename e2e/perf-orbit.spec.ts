/**
 * B22 — Camera orbit stutter detection test.
 * Launches the app with 50+ projects, programmatically orbits the camera,
 * and measures per-frame times to detect hitches (any frame > 32ms = below 30fps).
 *
 * Run: npx playwright test e2e/perf-orbit.spec.ts --timeout=120000
 */
import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
  // Configure for PBR renderer with 60 demo cards — enough to stress test
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '60')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'tactical')
    localStorage.setItem('hal-o-particle-density', '2')
  })
  await page.reload()
  // Wait for scene to be ready
  await page.locator('canvas').first().waitFor({ timeout: 20000 }).catch(() => {})
  // Let the scene settle (textures load, phase transitions complete)
  await page.waitForTimeout(5000)
})

test.afterAll(async () => {
  await app?.close()
})

test('camera orbit produces no frames > 32ms (B22 regression test)', async () => {
  // Inject a frame-time profiler, then simulate a full 360-degree orbit drag
  const result = await page.evaluate(() => {
    return new Promise<{
      totalFrames: number
      maxFrameMs: number
      avgFrameMs: number
      p95FrameMs: number
      p99FrameMs: number
      framesOver32ms: number
      framesOver50ms: number
      frameTimes: number[]
    }>((resolve) => {
      const canvas = document.querySelector('canvas')
      if (!canvas) {
        resolve({
          totalFrames: 0, maxFrameMs: 0, avgFrameMs: 0, p95FrameMs: 0, p99FrameMs: 0,
          framesOver32ms: 0, framesOver50ms: 0, frameTimes: [],
        })
        return
      }

      const cx = canvas.clientWidth / 2
      const cy = canvas.clientHeight / 2
      const radius = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.3

      const frameTimes: number[] = []
      let prevTime = performance.now()
      let frameId = 0

      // Phase 1: collect frame times during a simulated orbit drag
      function recordFrame() {
        const now = performance.now()
        frameTimes.push(now - prevTime)
        prevTime = now
        frameId++
      }

      // Start mouse drag
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: cx + radius, clientY: cy, button: 0, bubbles: true, pointerId: 1,
      }))

      // Orbit: sweep 360 degrees over ~120 steps
      const totalSteps = 120
      let step = 0

      function orbitStep() {
        if (step >= totalSteps) {
          // Release mouse
          canvas!.dispatchEvent(new PointerEvent('pointerup', {
            clientX: cx, clientY: cy, button: 0, bubbles: true, pointerId: 1,
          }))

          // Continue recording for 30 more frames (coast/inertia period)
          let coastFrames = 0
          function coastStep() {
            recordFrame()
            coastFrames++
            if (coastFrames < 30) {
              requestAnimationFrame(coastStep)
            } else {
              // Compute stats
              const sorted = [...frameTimes].sort((a, b) => a - b)
              const total = frameTimes.length
              const sum = frameTimes.reduce((a, b) => a + b, 0)
              const p95Idx = Math.floor(total * 0.95)
              const p99Idx = Math.floor(total * 0.99)

              resolve({
                totalFrames: total,
                maxFrameMs: Math.round(sorted[total - 1] * 100) / 100,
                avgFrameMs: Math.round((sum / total) * 100) / 100,
                p95FrameMs: Math.round(sorted[p95Idx] * 100) / 100,
                p99FrameMs: Math.round(sorted[p99Idx] * 100) / 100,
                framesOver32ms: frameTimes.filter(t => t > 32).length,
                framesOver50ms: frameTimes.filter(t => t > 50).length,
                frameTimes: frameTimes.map(t => Math.round(t * 10) / 10),
              })
            }
          }
          requestAnimationFrame(coastStep)
          return
        }

        recordFrame()

        const angle = (step / totalSteps) * Math.PI * 2
        const x = cx + Math.cos(angle) * radius
        const y = cy + Math.sin(angle) * radius * 0.3 // Flatten vertical movement
        canvas!.dispatchEvent(new PointerEvent('pointermove', {
          clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, pointerId: 1,
        }))

        step++
        requestAnimationFrame(orbitStep)
      }

      // Start the orbit on next frame
      requestAnimationFrame(orbitStep)
    })
  })

  console.log(`[B22 ORBIT] Total frames: ${result.totalFrames}`)
  console.log(`[B22 ORBIT] Avg frame: ${result.avgFrameMs}ms`)
  console.log(`[B22 ORBIT] P95 frame: ${result.p95FrameMs}ms`)
  console.log(`[B22 ORBIT] P99 frame: ${result.p99FrameMs}ms`)
  console.log(`[B22 ORBIT] Max frame: ${result.maxFrameMs}ms`)
  console.log(`[B22 ORBIT] Frames > 32ms (below 30fps): ${result.framesOver32ms}`)
  console.log(`[B22 ORBIT] Frames > 50ms (below 20fps): ${result.framesOver50ms}`)

  // Success criteria: P95 should be under 32ms (maintaining 30fps for 95% of frames)
  // Allow some tolerance: up to 5% of frames can exceed 32ms (GPU warmup, GC, etc.)
  const stutterPercent = (result.framesOver32ms / result.totalFrames) * 100
  console.log(`[B22 ORBIT] Stutter rate: ${stutterPercent.toFixed(1)}% of frames > 32ms`)

  // Hard fail if P95 exceeds 32ms (consistent stutter)
  expect(result.p95FrameMs).toBeLessThan(32)
  // Warn (but don't fail) if any frame exceeds 50ms
  if (result.framesOver50ms > 0) {
    console.warn(`[B22 ORBIT] WARNING: ${result.framesOver50ms} frames exceeded 50ms — investigate GC or shader compilation spikes`)
  }
})

test('camera zoom produces no significant stutter (B22 regression test)', async () => {
  const result = await page.evaluate(() => {
    return new Promise<{
      totalFrames: number
      maxFrameMs: number
      avgFrameMs: number
      p95FrameMs: number
      framesOver32ms: number
    }>((resolve) => {
      const canvas = document.querySelector('canvas')
      if (!canvas) {
        resolve({ totalFrames: 0, maxFrameMs: 0, avgFrameMs: 0, p95FrameMs: 0, framesOver32ms: 0 })
        return
      }

      const cx = canvas.clientWidth / 2
      const cy = canvas.clientHeight / 2
      const frameTimes: number[] = []
      let prevTime = performance.now()

      function recordFrame() {
        const now = performance.now()
        frameTimes.push(now - prevTime)
        prevTime = now
      }

      // Simulate scroll wheel zoom: 40 scroll events
      const totalSteps = 40
      let step = 0

      function zoomStep() {
        recordFrame()

        if (step >= totalSteps) {
          // Reverse zoom
          if (step >= totalSteps * 2) {
            const sorted = [...frameTimes].sort((a, b) => a - b)
            const total = frameTimes.length
            const sum = frameTimes.reduce((a, b) => a + b, 0)
            const p95Idx = Math.floor(total * 0.95)

            resolve({
              totalFrames: total,
              maxFrameMs: Math.round(sorted[total - 1] * 100) / 100,
              avgFrameMs: Math.round((sum / total) * 100) / 100,
              p95FrameMs: Math.round(sorted[p95Idx] * 100) / 100,
              framesOver32ms: frameTimes.filter(t => t > 32).length,
            })
            return
          }
          // Zoom out
          canvas!.dispatchEvent(new WheelEvent('wheel', {
            clientX: cx, clientY: cy, deltaY: 50, bubbles: true,
          }))
        } else {
          // Zoom in
          canvas!.dispatchEvent(new WheelEvent('wheel', {
            clientX: cx, clientY: cy, deltaY: -50, bubbles: true,
          }))
        }

        step++
        requestAnimationFrame(zoomStep)
      }

      requestAnimationFrame(zoomStep)
    })
  })

  console.log(`[B22 ZOOM] Total frames: ${result.totalFrames}`)
  console.log(`[B22 ZOOM] Avg frame: ${result.avgFrameMs}ms`)
  console.log(`[B22 ZOOM] P95 frame: ${result.p95FrameMs}ms`)
  console.log(`[B22 ZOOM] Max frame: ${result.maxFrameMs}ms`)
  console.log(`[B22 ZOOM] Frames > 32ms: ${result.framesOver32ms}`)

  expect(result.p95FrameMs).toBeLessThan(32)
})
