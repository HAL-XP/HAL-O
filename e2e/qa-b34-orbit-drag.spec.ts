/**
 * QA B34 — Spinning/orbit teleport and unresponsive drag
 *
 * Structure: beforeAll launches & navigates to hub, then individual tests
 * run assertions. Uses PNG pixel-diff from Playwright screenshots for
 * motion detection (works with preserveDrawingBuffer=false).
 *
 * Tests per renderer (pbr-holo + holographic):
 * 1. Drag responsiveness — scene changes during drag
 * 2. No teleport — consecutive frame diffs are uniform (no spike)
 * 3. Damping — camera keeps moving after release
 * 4. Second drag responsive 0.5s after first release
 * 5. AutoRotate resumes after 1.5s idle
 */
import { test, expect } from '@playwright/test'
import { launchApp, CI_TIMEOUT } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import * as fs from 'fs'
import * as path from 'path'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots')
const SHOT = (name: string) => path.join(SCREENSHOT_DIR, `qa-b34-${name}.png`)

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

/** Pixel diff fraction 0.0–1.0 between two PNG buffers */
function pngDiff(a: Buffer, b: Buffer): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 1
  const len = Math.min(a.length, b.length)
  let diff = 0
  const step = 16
  const samples = Math.floor(len / step)
  if (samples === 0) return 1
  for (let i = 0; i < len; i += step) {
    if (Math.abs(a[i] - b[i]) > 12) diff++
  }
  return diff / samples
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper to navigate to the 3D hub with a specific renderer
// ─────────────────────────────────────────────────────────────────────────────

async function navigateToHub(page: Page, rendererKey: string, label: string) {
  // Wait for the app's actual HTML file to be loaded (not about:blank)
  // Electron loads index.html via loadFile() — wait for that navigation to complete
  await page.waitForURL((url) => url.protocol === 'file:' || url.protocol === 'http:', { timeout: 30_000 })
    .catch(() => {})

  // Ensure DOM is interactive before touching localStorage
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForTimeout(500)

  // Set all first-run bypass flags and renderer choice
  await page.evaluate((rk: string) => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '12')
    localStorage.setItem('hal-o-renderer', rk)
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-render-quality', '1')
    localStorage.setItem('hal-o-3d-theme', 'tactical')
  }, rendererKey)

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for canvas
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20_000 })

  // Wait for topbar (= hub rendered)
  const topbarVisible = await page.locator('.hal-topbar').waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true).catch(() => false)

  console.log(`[${label}] Hub ready: topbar=${topbarVisible}`)

  // Diagnostic: take a screenshot to confirm we're on hub
  await page.screenshot({ path: SHOT(`${rendererKey}-hub-entry`) })

  // Extra wait for 3D scene to fully load (textures, particles, phase transitions)
  await page.waitForTimeout(8_000)

  return topbarVisible
}

// ─────────────────────────────────────────────────────────────────────────────
// PBR Holo renderer tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B34 — PBR Holo renderer', () => {
  test.setTimeout(180_000)

  let app: ElectronApplication
  let page: Page
  const RENDERER = 'pbr-holo'
  const LABEL = 'PBR Holo'

  test.beforeAll(async () => {
    ;({ app, page } = await launchApp())
    // Handle setup screen if it shows (click Continue)
    const isSetup = await page.locator('.setup-screen').isVisible({ timeout: CI_TIMEOUT }).catch(() => false)
    if (isSetup) {
      const btn = page.locator('.create-btn').first()
      await btn.click({ force: true }).catch(() => {})
      await page.waitForTimeout(3_000)
    }
    // Navigate to hub
    await navigateToHub(page, RENDERER, LABEL)
  })

  test.afterAll(async () => {
    await app?.close()
  })

  test('B34.1 PBR — drag is responsive (scene moves during drag)', async () => {
    const canvas = page.locator('canvas').first()
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    const { x, y: cy, width: cw, height: ch } = canvasBox
    const startX = x + cw * 0.2
    const endX   = x + cw * 0.8
    const dragY  = cy + ch * 0.5

    // Baseline
    const f0 = await page.screenshot({ type: 'png' })
    fs.writeFileSync(SHOT(`${RENDERER}-t1-baseline`), f0)

    // Slow drag: 12 steps at 50ms = ~600ms total
    await page.mouse.move(startX, dragY)
    await page.mouse.down()

    const midFrames: Buffer[] = [f0]
    for (let i = 1; i <= 12; i++) {
      const mx = startX + (endX - startX) * (i / 12)
      await page.mouse.move(mx, dragY)
      await page.waitForTimeout(50)
      if (i === 4 || i === 8 || i === 12) {
        const shot = await page.screenshot({ type: 'png' })
        midFrames.push(shot)
        fs.writeFileSync(SHOT(`${RENDERER}-t1-step${i}`), shot)
      }
    }
    await page.mouse.up()

    const totalDiff = pngDiff(midFrames[0], midFrames[midFrames.length - 1])
    console.log(`[${LABEL}] Total drag diff: ${(totalDiff * 100).toFixed(1)}%`)
    expect(totalDiff, `[${LABEL}] DRAG UNRESPONSIVE: scene did not change during drag`).toBeGreaterThan(0.005)
  })

  test('B34.2 PBR — no teleport (uniform consecutive frame diffs)', async () => {
    const canvas = page.locator('canvas').first()
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    const { x, y: cy, width: cw, height: ch } = canvasBox
    const startX = x + cw * 0.25
    const endX   = x + cw * 0.75
    const dragY  = cy + ch * 0.5

    // Capture 7 frames at even intervals during drag
    const frames: Buffer[] = []

    await page.mouse.move(startX, dragY)
    await page.mouse.down()

    for (let i = 0; i <= 6; i++) {
      const mx = startX + (endX - startX) * (i / 6)
      await page.mouse.move(mx, dragY)
      await page.waitForTimeout(100)
      const shot = await page.screenshot({ type: 'png' })
      frames.push(shot)
    }
    await page.mouse.up()

    // Compute consecutive diffs
    const diffs: number[] = []
    for (let i = 1; i < frames.length; i++) {
      diffs.push(pngDiff(frames[i-1], frames[i]))
    }

    const avg = diffs.reduce((a,b)=>a+b,0) / diffs.length
    const max = Math.max(...diffs)
    const ratio = avg > 0.001 ? max / avg : 0

    console.log(`[${LABEL}] Consecutive diffs: ${diffs.map(d=>`${(d*100).toFixed(1)}%`).join(', ')}`)
    console.log(`[${LABEL}] Avg: ${(avg*100).toFixed(2)}%  Max: ${(max*100).toFixed(2)}%  Ratio: ${ratio.toFixed(2)}`)

    fs.writeFileSync(SHOT(`${RENDERER}-t2-drag-start`), frames[0])
    fs.writeFileSync(SHOT(`${RENDERER}-t2-drag-end`), frames[frames.length-1])

    // Teleport check: one frame shouldn't spike >5x the average
    if (avg > 0.002) {
      expect(ratio, `[${LABEL}] TELEPORT: ratio=${ratio.toFixed(2)} (one frame jumped ${ratio.toFixed(1)}x avg)`).toBeLessThan(5.0)
    }
  })

  test('B34.3 PBR — damping visible after release', async () => {
    const f0 = await page.screenshot({ type: 'png' })
    await page.waitForTimeout(200)
    const f1 = await page.screenshot({ type: 'png' })
    await page.waitForTimeout(300)
    const f2 = await page.screenshot({ type: 'png' })

    fs.writeFileSync(SHOT(`${RENDERER}-t3-damp-t0`), f0)
    fs.writeFileSync(SHOT(`${RENDERER}-t3-damp-t200`), f1)
    fs.writeFileSync(SHOT(`${RENDERER}-t3-damp-t500`), f2)

    const d01 = pngDiff(f0, f1)
    const d12 = pngDiff(f1, f2)
    console.log(`[${LABEL}] Damping: 0→200ms=${(d01*100).toFixed(2)}%  200→500ms=${(d12*100).toFixed(2)}%`)

    expect(d01, `[${LABEL}] NO DAMPING: camera stopped dead at release`).toBeGreaterThan(0.001)
  })

  test('B34.4 PBR — 2nd drag responsive 0.5s after release', async () => {
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    const { x, y: cy, width: cw, height: ch } = canvasBox
    const startX = x + cw * 0.3
    const endX   = x + cw * 0.7
    const dragY  = cy + ch * 0.5

    const before = await page.screenshot({ type: 'png' })
    fs.writeFileSync(SHOT(`${RENDERER}-t4-resp-before`), before)

    await page.mouse.move(startX, dragY)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      const mx = startX + (endX - startX) * (i / 8)
      await page.mouse.move(mx, dragY)
      await page.waitForTimeout(50)
    }
    await page.mouse.up()
    await page.waitForTimeout(100)

    const after = await page.screenshot({ type: 'png' })
    fs.writeFileSync(SHOT(`${RENDERER}-t4-resp-after`), after)

    const diff = pngDiff(before, after)
    console.log(`[${LABEL}] Responsiveness diff: ${(diff*100).toFixed(2)}%`)
    expect(diff, `[${LABEL}] 2nd DRAG UNRESPONSIVE: no change 0.5s after first release`).toBeGreaterThan(0.005)
  })

  test('B34.5 PBR — autoRotate resumes after 1.5s idle', async () => {
    // Wait past the 1.2s re-enable delay (use 1.7s to be safe)
    await page.waitForTimeout(1_700)

    const f1 = await page.screenshot({ type: 'png' })
    await page.waitForTimeout(1_000)
    const f2 = await page.screenshot({ type: 'png' })

    fs.writeFileSync(SHOT(`${RENDERER}-t5-autorot-t0`),    f1)
    fs.writeFileSync(SHOT(`${RENDERER}-t5-autorot-t1000`), f2)

    const diff = pngDiff(f1, f2)
    console.log(`[${LABEL}] AutoRotate diff over 1s: ${(diff*100).toFixed(2)}%`)
    expect(diff, `[${LABEL}] AUTOROTATE DID NOT RESUME after 1.7s idle`).toBeGreaterThan(0.005)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Holographic (non-PBR) renderer tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B34 — Holo (non-PBR) renderer', () => {
  test.setTimeout(180_000)

  let app: ElectronApplication
  let page: Page
  const RENDERER = 'holographic'
  const LABEL = 'Holo'

  test.beforeAll(async () => {
    ;({ app, page } = await launchApp())
    // Handle setup screen if it shows (click Continue)
    const isSetup = await page.locator('.setup-screen').isVisible({ timeout: CI_TIMEOUT }).catch(() => false)
    if (isSetup) {
      const btn = page.locator('.create-btn').first()
      await btn.click({ force: true }).catch(() => {})
      await page.waitForTimeout(3_000)
    }
    // Navigate to hub
    await navigateToHub(page, RENDERER, LABEL)
  })

  test.afterAll(async () => {
    await app?.close()
  })

  test('B34.1 Holo — drag is responsive (scene moves during drag)', async () => {
    const canvas = page.locator('canvas').first()
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    const { x, y: cy, width: cw, height: ch } = canvasBox
    const startX = x + cw * 0.2
    const endX   = x + cw * 0.8
    const dragY  = cy + ch * 0.5

    const f0 = await page.screenshot({ type: 'png' })
    fs.writeFileSync(SHOT(`${RENDERER}-t1-baseline`), f0)

    await page.mouse.move(startX, dragY)
    await page.mouse.down()

    const midFrames: Buffer[] = [f0]
    for (let i = 1; i <= 12; i++) {
      const mx = startX + (endX - startX) * (i / 12)
      await page.mouse.move(mx, dragY)
      await page.waitForTimeout(50)
      if (i === 4 || i === 8 || i === 12) {
        const shot = await page.screenshot({ type: 'png' })
        midFrames.push(shot)
        fs.writeFileSync(SHOT(`${RENDERER}-t1-step${i}`), shot)
      }
    }
    await page.mouse.up()

    const totalDiff = pngDiff(midFrames[0], midFrames[midFrames.length - 1])
    console.log(`[${LABEL}] Total drag diff: ${(totalDiff * 100).toFixed(1)}%`)
    expect(totalDiff, `[${LABEL}] DRAG UNRESPONSIVE: scene did not change during drag`).toBeGreaterThan(0.005)
  })

  test('B34.2 Holo — no teleport (uniform consecutive frame diffs)', async () => {
    const canvas = page.locator('canvas').first()
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    const { x, y: cy, width: cw, height: ch } = canvasBox
    const startX = x + cw * 0.25
    const endX   = x + cw * 0.75
    const dragY  = cy + ch * 0.5

    const frames: Buffer[] = []
    await page.mouse.move(startX, dragY)
    await page.mouse.down()

    for (let i = 0; i <= 6; i++) {
      const mx = startX + (endX - startX) * (i / 6)
      await page.mouse.move(mx, dragY)
      await page.waitForTimeout(100)
      const shot = await page.screenshot({ type: 'png' })
      frames.push(shot)
    }
    await page.mouse.up()

    const diffs: number[] = []
    for (let i = 1; i < frames.length; i++) {
      diffs.push(pngDiff(frames[i-1], frames[i]))
    }

    const avg = diffs.reduce((a,b)=>a+b,0) / diffs.length
    const max = Math.max(...diffs)
    const ratio = avg > 0.001 ? max / avg : 0

    console.log(`[${LABEL}] Consecutive diffs: ${diffs.map(d=>`${(d*100).toFixed(1)}%`).join(', ')}`)
    console.log(`[${LABEL}] Avg: ${(avg*100).toFixed(2)}%  Max: ${(max*100).toFixed(2)}%  Ratio: ${ratio.toFixed(2)}`)

    fs.writeFileSync(SHOT(`${RENDERER}-t2-drag-start`), frames[0])
    fs.writeFileSync(SHOT(`${RENDERER}-t2-drag-end`), frames[frames.length-1])

    if (avg > 0.002) {
      expect(ratio, `[${LABEL}] TELEPORT: ratio=${ratio.toFixed(2)}`).toBeLessThan(5.0)
    }
  })

  test('B34.3 Holo — damping visible after release', async () => {
    const f0 = await page.screenshot({ type: 'png' })
    await page.waitForTimeout(200)
    const f1 = await page.screenshot({ type: 'png' })
    await page.waitForTimeout(300)
    const f2 = await page.screenshot({ type: 'png' })

    fs.writeFileSync(SHOT(`${RENDERER}-t3-damp-t0`), f0)
    fs.writeFileSync(SHOT(`${RENDERER}-t3-damp-t200`), f1)
    fs.writeFileSync(SHOT(`${RENDERER}-t3-damp-t500`), f2)

    const d01 = pngDiff(f0, f1)
    const d12 = pngDiff(f1, f2)
    console.log(`[${LABEL}] Damping: 0→200ms=${(d01*100).toFixed(2)}%  200→500ms=${(d12*100).toFixed(2)}%`)

    expect(d01, `[${LABEL}] NO DAMPING: camera stopped dead at release`).toBeGreaterThan(0.001)
  })

  test('B34.4 Holo — 2nd drag responsive 0.5s after release', async () => {
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()
    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Canvas not found')

    const { x, y: cy, width: cw, height: ch } = canvasBox
    const startX = x + cw * 0.3
    const endX   = x + cw * 0.7
    const dragY  = cy + ch * 0.5

    const before = await page.screenshot({ type: 'png' })
    fs.writeFileSync(SHOT(`${RENDERER}-t4-resp-before`), before)

    await page.mouse.move(startX, dragY)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      const mx = startX + (endX - startX) * (i / 8)
      await page.mouse.move(mx, dragY)
      await page.waitForTimeout(50)
    }
    await page.mouse.up()
    await page.waitForTimeout(100)

    const after = await page.screenshot({ type: 'png' })
    fs.writeFileSync(SHOT(`${RENDERER}-t4-resp-after`), after)

    const diff = pngDiff(before, after)
    console.log(`[${LABEL}] Responsiveness diff: ${(diff*100).toFixed(2)}%`)
    expect(diff, `[${LABEL}] 2nd DRAG UNRESPONSIVE: no change 0.5s after first release`).toBeGreaterThan(0.005)
  })

  test('B34.5 Holo — autoRotate resumes after 1.5s idle', async () => {
    await page.waitForTimeout(1_700)

    const f1 = await page.screenshot({ type: 'png' })
    await page.waitForTimeout(1_000)
    const f2 = await page.screenshot({ type: 'png' })

    fs.writeFileSync(SHOT(`${RENDERER}-t5-autorot-t0`),    f1)
    fs.writeFileSync(SHOT(`${RENDERER}-t5-autorot-t1000`), f2)

    const diff = pngDiff(f1, f2)
    console.log(`[${LABEL}] AutoRotate diff over 1s: ${(diff*100).toFixed(2)}%`)
    expect(diff, `[${LABEL}] AUTOROTATE DID NOT RESUME after 1.7s idle`).toBeGreaterThan(0.005)
  })
})
