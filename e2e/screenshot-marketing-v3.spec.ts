/**
 * Marketing Screenshots v3 — Feedback-driven retakes + new shots
 *
 * APPROVED (kept): #3 spaceship, #4 terminal (base), #5 settings (base)
 * FIXED: #1 hero (closer camera), #2 cards-sphere (closer + layout swap),
 *        #5 settings (bigger font), #6 wide (+ flyby), #7 replaced with closeup-dramatic
 * NEW: terminal variants (full, split, ember), renderer comparison strip (classic, holo, pbr)
 *
 * HARD RULES:
 *   - Demo mode ON always (ZERO EXCEPTIONS)
 *   - Wait 3-5s after reload (10s for terminal shots)
 *   - Vary themes between shots
 *   - All output to temp/screenshots/v3/
 *
 * Run:
 *   npx playwright test --config playwright-screenshots.config.ts e2e/screenshot-marketing-v3.spec.ts
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

const OUT = 'temp/screenshots/v3'

let app: ElectronApplication
let page: Page

test.setTimeout(300_000)

interface SceneOpts {
  theme: string
  layout: string
  sphere: string
  renderer?: string
  split?: string
  cards?: string
  hubFont?: string
}

/** Helper: set localStorage, reload, maximize, wait for 3D to settle */
async function resetScene(opts: SceneOpts) {
  await page.evaluate((o) => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', o.cards || '15')
    localStorage.setItem('hal-o-demo-terminals', '2')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', o.renderer || 'pbr-holo')
    localStorage.setItem('hal-o-layout', o.layout)
    localStorage.setItem('hal-o-3d-theme', o.theme)
    localStorage.setItem('hal-o-sphere-style', o.sphere)
    localStorage.setItem('hal-o-split', o.split || '100')
    if (o.hubFont) localStorage.setItem('hal-o-hub-font', o.hubFont)
  }, opts)
  await page.reload()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(5000) // WebGL init + textures + bloom + settle
}

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
  // Initial scene setup with first shot's config
  await resetScene({ theme: 'neon', layout: 'dual-arc', sphere: 'animated-core' })
})

test.afterAll(async () => {
  await app?.close()
})

// ======================================================================
// FIXED SHOTS
// ======================================================================

// -- 1. Hero v2 -- FIXED: was too flat/far, now uses #5's closer camera angle
// Theme: neon | Layout: dual-arc | Sphere: animated-core
test('1 -- hero-v2', async () => {
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(70)
    pm.setAudioDemo(true)
    pm.resumeAutoRotate()
  })
  // Let auto-rotate show several front-facing cards
  await page.waitForTimeout(3000)

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    pm.pauseAutoRotate()
    // Use #5's camera angle (4, 6, 12) NOT heroAngle which is too far
    pm.setCamera(4, 6, 12)
  })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/hero-v2.png` })
})

// -- 2. Cards + Sphere v2 -- FIXED: closer camera, dual-arc layout instead of spiral
// Theme: tactical | Layout: dual-arc | Sphere: wireframe
test('2 -- cards-sphere-v2', async () => {
  await resetScene({ theme: 'tactical', layout: 'dual-arc', sphere: 'wireframe', cards: '12' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(85)
    pm.setAudioDemo(true)
  })
  await page.waitForTimeout(2000)

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    pm.pauseAutoRotate()
    // Closer than closeUp: (3, 4, 8) — cards MUST be readable
    pm.setCamera(3, 4, 8)
  })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/cards-sphere-v2.png` })
})

// -- 3. Spaceship -- APPROVED, keep as-is (re-capture for consistency)
// Theme: ember | Layout: hemisphere | Sphere: hal-eye
test('3 -- spaceship', async () => {
  await resetScene({ theme: 'ember', layout: 'hemisphere', sphere: 'hal-eye' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.pauseAutoRotate()
    pm.setActivity(50)
    pm.setCamera(-4, 5, 14)
    pm.triggerFlyby()
  })
  // Wait ~2.5s for ship to be in mid-flight near sphere
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/spaceship.png` })
})

// ======================================================================
// TERMINAL SHOTS (approved base #4 + new variants)
// ======================================================================

// -- 4a. Terminal full -- Arctic, dual-arc, wireframe, heroAngle, wait 10s for text
test('4a -- terminal-full', async () => {
  await resetScene({ theme: 'arctic', layout: 'dual-arc', sphere: 'wireframe', split: '55' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.heroAngle()
      pm.setActivity(50)
    }
  })
  // Wait 10 seconds for terminal text to fill
  await page.waitForTimeout(10000)
  await page.screenshot({ path: `${OUT}/terminal-full.png` })
})

// -- 4b. Terminal split -- Same theme, 2 terminal panes
test('4b -- terminal-split', async () => {
  await resetScene({ theme: 'arctic', layout: 'dual-arc', sphere: 'wireframe', split: '50' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.heroAngle()
      pm.setActivity(50)
    }
  })

  // Try to open a second terminal tab/split if API supports it
  await page.evaluate(() => {
    // Trigger new terminal via keyboard shortcut or event
    window.dispatchEvent(new CustomEvent('hal-new-terminal'))
  })
  await page.waitForTimeout(10000)
  await page.screenshot({ path: `${OUT}/terminal-split.png` })
})

// -- 4c. Terminal ember -- Different theme + layout for variety
test('4c -- terminal-ember', async () => {
  await resetScene({ theme: 'ember', layout: 'spiral', sphere: 'hal-eye', split: '55' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.heroAngle()
      pm.setActivity(65)
    }
  })
  await page.waitForTimeout(10000)
  await page.screenshot({ path: `${OUT}/terminal-ember.png` })
})

// ======================================================================
// SETTINGS v2 -- FIXED: bigger font size
// ======================================================================

// -- 5. Settings v2 -- phantom, constellation, animated-core, bigger hub font
test('5 -- settings-v2', async () => {
  await resetScene({
    theme: 'phantom',
    layout: 'constellation',
    sphere: 'animated-core',
    hubFont: '14'
  })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setCamera(4, 6, 12)
      pm.setActivity(40)
    }
  })
  await page.waitForTimeout(1500)

  // Open settings overlay
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/settings-v2.png` })
})

// ======================================================================
// WIDE + SPACESHIP -- FIXED: flyby in wide shot
// ======================================================================

// -- 6. Wide + Spaceship -- solar, arena, flyby during wide shot
test('6 -- wide-spaceship', async () => {
  await resetScene({ theme: 'solar', layout: 'arena', sphere: 'wireframe' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(40)
    pm.wideShot()
    pm.triggerFlyby()
  })
  // Wait 3s for flyby to be mid-flight in wide view
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/wide-spaceship.png` })
})

// ======================================================================
// CLOSEUP DRAMATIC -- REPLACES top-down (rejected)
// ======================================================================

// -- 7. Closeup dramatic -- ember, hal-eye, very close, high energy
test('7 -- closeup-dramatic', async () => {
  await resetScene({ theme: 'ember', layout: 'dual-arc', sphere: 'hal-eye' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(90)
    pm.setAudioDemo(true)
    pm.sphereEvent('info', 1.0)
    pm.pauseAutoRotate()
    // Very close camera
    pm.setCamera(4, 3, 7)
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/closeup-dramatic.png` })
})

// ======================================================================
// RENDERER COMPARISON STRIP (3 shots)
// ======================================================================

// -- 8a. Renderer: Classic (CSS)
test('8a -- renderer-classic', async () => {
  await resetScene({
    theme: 'neon',
    layout: 'dual-arc',
    sphere: 'wireframe',
    renderer: 'classic'
  })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(60)
      pm.heroAngle()
    }
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/renderer-classic.png` })
})

// -- 8b. Renderer: Holographic (basic)
test('8b -- renderer-holo', async () => {
  await resetScene({
    theme: 'neon',
    layout: 'dual-arc',
    sphere: 'wireframe',
    renderer: 'holographic'
  })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(60)
      pm.heroAngle()
    }
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/renderer-holo.png` })
})

// -- 8c. Renderer: PBR Holographic (full)
test('8c -- renderer-pbr', async () => {
  await resetScene({
    theme: 'neon',
    layout: 'dual-arc',
    sphere: 'wireframe',
    renderer: 'pbr-holo'
  })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(60)
      pm.heroAngle()
    }
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/renderer-pbr.png` })
})
