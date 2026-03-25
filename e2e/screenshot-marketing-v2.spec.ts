/**
 * Marketing Screenshots v2 — Close, readable, demo-only shots
 *
 * HARD RULES:
 *   - Demo mode ON → no real project names leak
 *   - Camera close enough to read card content
 *   - Photo Mode API for precise framing
 *
 * Run:
 *   npx playwright test --config playwright-screenshots.config.ts e2e/screenshot-marketing-v2.spec.ts
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

const OUT = 'temp/screenshots'

let app: ElectronApplication
let page: Page

test.setTimeout(120_000)

/** Helper: reload, maximize, wait for 3D to settle */
async function resetScene(opts?: { split?: string }) {
  await page.evaluate((split) => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-demo-terminals', '2')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'neon')
    localStorage.setItem('hal-o-split', split || '100')
  }, opts?.split || '100')
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(5000) // WebGL init + textures + bloom + settle
}

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
  await resetScene()
})

test.afterAll(async () => {
  await app?.close()
})

// ── 1. Hero Shot ──────────────────────────────────────────────────────
// THE money shot. Cards + sphere + ring all visible AND readable.
test('1 — hero shot', async () => {
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    // Let auto-rotate run to get cards into optimal facing position
    pm.resumeAutoRotate()
  })
  // Let auto-rotate show several front-facing cards
  await page.waitForTimeout(3000)

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    pm.pauseAutoRotate()
    // Hero: close enough to read card names, wide enough for full scene
    pm.setCamera(4, 6, 12)
  })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/hero.png` })
})

// ── 2. Card close-up with sphere ──────────────────────────────────────
// Must show 2-3 cards with READABLE text + sphere in background.
// Use fewer cards (8) so each card is physically larger in the ring.
test('2 — card close-up with sphere', async () => {
  // Reload with fewer cards for bigger card panels
  await page.evaluate(() => {
    localStorage.setItem('hal-o-demo-cards', '8')
  })
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(5000)

  // Let auto-rotate settle, then freeze at a good angle
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(80)
    pm.setAudioDemo(true)
  })
  await page.waitForTimeout(2000)

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    pm.pauseAutoRotate()
    // With 8 cards at radius 8, front cards are along the perimeter.
    // Camera at ring edge, card eye-level. One big card fills lower half,
    // sphere + ring scene fills upper half. Card text fully readable.
    pm.setCamera(7, 3.2, 8.5)
  })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/cards-and-sphere.png` })

  // Restore 15 cards for subsequent tests
  await page.evaluate(() => {
    localStorage.setItem('hal-o-demo-cards', '15')
  })
})

// ── 3. Spaceship flyby ───────────────────────────────────────────────
// Ship is mid-flight crossing the scene. Flyby is 18s with quintic easing,
// so peak action (ship near sphere) is ~7-9s into the animation.
// We capture two frames to ensure we catch it.
test('3 — spaceship flyby', async () => {
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.pauseAutoRotate()
    pm.setActivity(50)
    // Camera facing the approach path — ship enters from the left
    // Position slightly right and forward to see the ship cross the sphere
    pm.setCamera(-4, 5, 14)
    pm.triggerFlyby()
  })
  // Frame 1: ~6s — ship approaching the sphere from the left
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${OUT}/spaceship-approach.png` })

  // Frame 2: ~9s — ship near/past the sphere (peak speed)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/spaceship.png` })
})

// ── 4. Terminal split view ───────────────────────────────────────────
// Hub + terminal side by side. Demo terminals auto-populate with fake content.
test('4 — terminal split', async () => {
  await resetScene({ split: '55' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setCamera(4, 6, 12)
      pm.setActivity(50)
    }
  })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/terminal-split.png` })
})

// ── 5. Settings overlay ──────────────────────────────────────────────
// Settings panel floating over the 3D scene.
test('5 — settings overlay', async () => {
  await resetScene()

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setCamera(4, 6, 12)
      pm.setActivity(40)
    }
  })
  await page.waitForTimeout(1000)

  // Open settings
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/settings-overlay.png` })
})

// ── 6. Wide cinematic ────────────────────────────────────────────────
// Full ring visible — the grand overview.
test('6 — wide cinematic', async () => {
  // Fresh reload to clear settings overlay
  await resetScene()

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(40)
    // Wide but not so far that cards become silhouettes
    pm.setCamera(0, 10, 18)
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/wide.png` })
})
