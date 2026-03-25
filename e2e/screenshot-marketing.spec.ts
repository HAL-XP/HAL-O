import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

const OUT = 'temp/screenshots'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  // Set up demo mode with all wizards completed
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'neon')
  })
  await page.reload()
  await page.waitForTimeout(2000)

  // Maximize window for clean full-size shots
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(1000)
})

test.afterAll(async () => {
  await app?.close()
})

// ── PBR Holographic — Hero Shot ──────────────────────────────────────
test('PBR hero shot', async () => {
  // PBR-holo is already set, just wait for the scene to settle
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/pbr-hero.png` })
})

test('PBR hero shot — rotated angle', async () => {
  // Let auto-rotate turn the scene for a different perspective
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${OUT}/pbr-hero-2.png` })
})

// ── Classic Renderer ─────────────────────────────────────────────────
test('Classic renderer view', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'classic')
    localStorage.setItem('hal-o-layout', 'default')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/classic-view.png` })
})

// ── Holographic Renderer ─────────────────────────────────────────────
test('Holographic renderer view', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'holographic')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/holo-view.png` })
})

// ── Full-Hub Clean Shots (no terminal) ───────────────────────────────
test('PBR full hub — no terminal', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'neon')
    localStorage.setItem('hal-o-split', '100')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/pbr-fullhub.png` })
})

test('PBR full hub — spiral layout', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-layout', 'spiral')
    localStorage.setItem('hal-o-split', '100')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/pbr-spiral.png` })
})

test('Classic full hub — no terminal', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'classic')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-split', '100')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/classic-fullhub.png` })
})

// ── Settings Menu ────────────────────────────────────────────────────
test('Settings menu open', async () => {
  // Switch back to PBR for a nice background behind the settings
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-3d-theme', 'neon')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(3000)

  // Open settings via the event bus
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/settings.png` })
})
