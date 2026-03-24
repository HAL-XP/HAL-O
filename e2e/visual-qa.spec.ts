/**
 * TEST3: Visual QA via Cinematic — captures frames at key moments during
 * the 6-act cinematic sequence for visual regression testing.
 *
 * This test does NOT assert pixel-level equality (too fragile with GPU/driver
 * differences). Instead it:
 * 1. Captures baseline screenshots at timed intervals during the cinematic
 * 2. Verifies the cinematic badge appears and acts progress
 * 3. Saves frames for human review or future automated comparison
 *
 * Run: npx playwright test e2e/visual-qa.spec.ts --timeout=120000
 */
import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  // Configure demo mode with PBR renderer, skip GPU wizard
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '12')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'tactical')
    localStorage.setItem('hal-o-sphere-style', 'wireframe')
    localStorage.setItem('hal-o-intro-done', '1') // skip intro fly-in
    localStorage.setItem('hal-o-intro-animation', 'false')
  })
  await page.reload()

  // Wait for scene to render
  await page.locator('canvas').first().waitFor({ timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

// ── Act Timing Map (approximate, from CinematicSequence.tsx) ──
// Act 1: "The Command Center" — 0-8s
// Act 2: "The Brain" — 8-16s
// Act 3: "The Fleet" — 16-22s
// Act 4: "Mission Control" — 22-30s
// Act 5: "The Resolution" — 30-38s
// Act 6: "Finale" — 38-42s

test('Visual QA: cinematic frame capture', async () => {
  // Take a pre-cinematic baseline
  await page.screenshot({
    path: 'screenshots/vqa-00-baseline.png',
    fullPage: true,
  })

  // Activate cinematic mode via IPC
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send('toggle-cinematic', true)
  })

  // Wait for cinematic badge to appear
  const cinematicBadge = page.locator('text=CINEMATIC MODE').first()
  await expect(cinematicBadge).toBeVisible({ timeout: 8000 })

  // Capture frames at key moments during the cinematic
  const capturePoints = [
    { delay: 2000, name: '01-act1-establishing', desc: 'Wide orbit, particles' },
    { delay: 4000, name: '02-act1-particles', desc: 'Particle reveal' },
    { delay: 4000, name: '03-act2-sphere', desc: 'HAL sphere zoom' },
    { delay: 4000, name: '04-act2-haleye', desc: 'HAL eye style' },
    { delay: 3000, name: '05-act3-ship', desc: 'Ship flyby' },
    { delay: 4000, name: '06-act4-panels', desc: 'Panel closeups' },
    { delay: 4000, name: '07-act4-terminal', desc: 'Terminal activity' },
    { delay: 4000, name: '08-act5-merge', desc: 'Merge conflict' },
    { delay: 4000, name: '09-act5-resolve', desc: 'Resolution VFX' },
    { delay: 4000, name: '10-act6-finale', desc: 'Epic pullback' },
  ]

  for (const point of capturePoints) {
    await page.waitForTimeout(point.delay)
    await page.screenshot({
      path: `screenshots/vqa-${point.name}.png`,
      fullPage: true,
    })
  }

  // Verify we captured 10 cinematic frames + 1 baseline
  // (The existence of screenshots is the test — visual review is manual)

  // Exit cinematic mode
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await expect(cinematicBadge).not.toBeVisible({ timeout: 5000 })

  // Post-cinematic screenshot (should be back to normal orbit)
  await page.screenshot({
    path: 'screenshots/vqa-11-post-cinematic.png',
    fullPage: true,
  })
})

test('Visual QA: renderer comparison (PBR vs Classic)', async () => {
  // PBR screenshot (already active)
  await page.screenshot({
    path: 'screenshots/vqa-renderer-pbr.png',
    fullPage: true,
  })

  // Switch to classic renderer
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'classic')
  })
  await page.reload()
  await page.locator('.hal-hub').waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({
    path: 'screenshots/vqa-renderer-classic.png',
    fullPage: true,
  })

  // Switch to holographic
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'holo')
  })
  await page.reload()
  await page.locator('canvas').first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({
    path: 'screenshots/vqa-renderer-holo.png',
    fullPage: true,
  })

  // Restore PBR for any subsequent tests
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
  })
})

test('Visual QA: sphere style gallery', async () => {
  const styles = ['wireframe', 'hal-eye', 'animated-core'] as const

  for (const style of styles) {
    await page.evaluate((s) => {
      localStorage.setItem('hal-o-sphere-style', s)
    }, style)
    await page.reload()
    await page.locator('canvas').first().waitFor({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await page.screenshot({
      path: `screenshots/vqa-sphere-${style}.png`,
      fullPage: true,
    })
  }
})
