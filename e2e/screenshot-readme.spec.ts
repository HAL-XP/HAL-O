import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  // Enable demo mode with PBR renderer, default layout, tactical style
  await page.evaluate(() => {
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'tactical')
    localStorage.setItem('hal-o-setup-done', '1')
  })
  await page.reload()
  await page.waitForTimeout(2000)

  // Maximize window
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(1000)
})

test.afterAll(async () => {
  await app?.close()
})

test('readme screenshot — default layout (PBR tactical)', async () => {
  // Wait for 3D scene to fully render and settle
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'screenshots/readme-demo-default.png' })
})

test('readme screenshot — spiral layout', async () => {
  await page.evaluate(() => localStorage.setItem('hal-o-layout', 'spiral'))
  await page.reload()
  await page.waitForTimeout(2000)
  // Re-maximize after reload
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'screenshots/readme-demo-spiral.png' })
})

test('readme screenshot — neon 3D style', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'neon')
  })
  await page.reload()
  await page.waitForTimeout(2000)
  // Re-maximize after reload
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'screenshots/readme-demo-neon.png' })
})
