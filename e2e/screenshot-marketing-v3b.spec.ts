/**
 * Marketing Screenshots v3b — Retakes + Category diversity shots
 *
 * RETAKES:
 *   - cards-effects: tactical, dual-arc, wireframe, setCamera(3,4,8), activity 100, audio, 3 rapid captures
 *   - terminal-split-v2: arctic, dual-arc, wireframe, heroAngle, 20s wait
 *   - terminal-ember-v2: ember, spiral, hal-eye, heroAngle, 20s wait
 *
 * NEW CATEGORY SHOTS:
 *   Themes showcase (5): neon, ember, arctic, solar, phantom
 *   Layouts showcase (5): spiral, hemisphere, dna-helix, grid-wall, cascade
 *   Effects showcase (3): idle, busy, sphere-glow
 *
 * HARD RULES:
 *   - Demo mode ON always (ZERO EXCEPTIONS)
 *   - Wait 3-5s after reload, 20s for terminal shots
 *   - setActivity + setAudioDemo need 5s to ramp before capture
 *   - All output to temp/screenshots/v3/
 *
 * Run:
 *   npx playwright test --config playwright-screenshots.config.ts e2e/screenshot-marketing-v3b.spec.ts
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

const OUT = 'temp/screenshots/v3'

let app: ElectronApplication
let page: Page

test.setTimeout(600_000) // 10 min — lots of shots with long waits

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
  // Initial setup — first shot's config
  await resetScene({ theme: 'tactical', layout: 'dual-arc', sphere: 'wireframe' })
})

test.afterAll(async () => {
  await app?.close()
})

// ======================================================================
// RETAKE #2: Cards + Sphere — effects version (3 rapid captures, pick best)
// Theme: tactical | Layout: dual-arc | Sphere: wireframe
// Camera: setCamera(3, 4, 8) | setActivity(100), setAudioDemo(true), pauseAutoRotate()
// ======================================================================

test('retake -- cards-effects', async () => {
  // resetScene already set to tactical/dual-arc/wireframe in beforeAll
  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(100)
    pm.setAudioDemo(true)
    pm.pauseAutoRotate()
    pm.setCamera(3, 4, 8)
  })
  // Wait 5s for effects to ramp up
  await page.waitForTimeout(5000)

  // Take 3 rapid captures — we'll pick the best mid-pulse
  await page.screenshot({ path: `${OUT}/cards-effects-a.png` })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/cards-effects-b.png` })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/cards-effects-c.png` })

  // Also save one as the canonical name
  await page.screenshot({ path: `${OUT}/cards-effects.png` })
})

// ======================================================================
// RETAKE #4b: Terminal Split — longer wait (20s)
// Theme: arctic | Layout: dual-arc | Sphere: wireframe
// Camera: heroAngle() | setActivity(50) | Wait 20s
// ======================================================================

test('retake -- terminal-split-v2', async () => {
  await resetScene({ theme: 'arctic', layout: 'dual-arc', sphere: 'wireframe', split: '50' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.heroAngle()
      pm.setActivity(50)
    }
  })

  // Open a second terminal for the split
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-new-terminal'))
  })

  // Wait 20 seconds for terminal text to fill
  await page.waitForTimeout(20000)
  await page.screenshot({ path: `${OUT}/terminal-split-v2.png` })
})

// ======================================================================
// RETAKE #4c: Terminal Ember — longer wait (20s)
// Theme: ember | Layout: spiral | Sphere: hal-eye
// Camera: heroAngle() | setActivity(65) | Wait 20s
// ======================================================================

test('retake -- terminal-ember-v2', async () => {
  await resetScene({ theme: 'ember', layout: 'spiral', sphere: 'hal-eye', split: '55' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.heroAngle()
      pm.setActivity(65)
    }
  })

  // Wait 20 seconds for terminal text to fill
  await page.waitForTimeout(20000)
  await page.screenshot({ path: `${OUT}/terminal-ember-v2.png` })
})

// ======================================================================
// THEMES SHOWCASE (same heroAngle, different themes + layouts)
// ======================================================================

test('theme -- neon', async () => {
  await resetScene({ theme: 'neon', layout: 'dual-arc', sphere: 'animated-core' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/theme-neon.png` })
})

test('theme -- ember', async () => {
  await resetScene({ theme: 'ember', layout: 'spiral', sphere: 'hal-eye' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/theme-ember.png` })
})

test('theme -- arctic', async () => {
  await resetScene({ theme: 'arctic', layout: 'hemisphere', sphere: 'wireframe' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/theme-arctic.png` })
})

test('theme -- solar', async () => {
  await resetScene({ theme: 'solar', layout: 'arena', sphere: 'animated-core' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/theme-solar.png` })
})

test('theme -- phantom', async () => {
  await resetScene({ theme: 'phantom', layout: 'constellation', sphere: 'wireframe' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/theme-phantom.png` })
})

// ======================================================================
// LAYOUTS SHOWCASE (all tactical theme, different layouts + cameras)
// ======================================================================

test('layout -- spiral', async () => {
  await resetScene({ theme: 'tactical', layout: 'spiral', sphere: 'wireframe' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.closeUp()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/layout-spiral.png` })
})

test('layout -- hemisphere', async () => {
  await resetScene({ theme: 'tactical', layout: 'hemisphere', sphere: 'animated-core' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/layout-hemisphere.png` })
})

test('layout -- dna-helix', async () => {
  await resetScene({ theme: 'tactical', layout: 'dna-helix', sphere: 'hal-eye' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.wideShot()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/layout-dna-helix.png` })
})

test('layout -- grid-wall', async () => {
  await resetScene({ theme: 'tactical', layout: 'grid-wall', sphere: 'wireframe' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/layout-grid-wall.png` })
})

test('layout -- cascade', async () => {
  await resetScene({ theme: 'tactical', layout: 'cascade', sphere: 'animated-core' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(60)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/layout-cascade.png` })
})

// ======================================================================
// EFFECTS SHOWCASE (activity/audio/sphere events)
// ======================================================================

test('effect -- idle', async () => {
  await resetScene({ theme: 'tactical', layout: 'dual-arc', sphere: 'wireframe' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(0)
    pm.setAudioDemo(false)
    pm.heroAngle()
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/effect-idle.png` })
})

test('effect -- busy', async () => {
  await resetScene({ theme: 'tactical', layout: 'dual-arc', sphere: 'animated-core' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(100)
    pm.setAudioDemo(true)
    pm.heroAngle()
  })
  // 5s for effects to ramp to max
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/effect-busy.png` })
})

test('effect -- sphere-glow', async () => {
  await resetScene({ theme: 'ember', layout: 'dual-arc', sphere: 'hal-eye' })

  await page.evaluate(() => {
    const pm = (window as any).__haloPhotoMode
    if (!pm) throw new Error('Photo Mode API not found')
    pm.setActivity(80)
    pm.setAudioDemo(true)
    pm.pauseAutoRotate()
    pm.sphereEvent('warning', 1.0)
    pm.setCamera(3, 4, 8) // Close to see the glow
  })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/effect-sphere-glow.png` })
})
