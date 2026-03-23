import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  // Ensure we're on PBR renderer, default layout
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-setup-done', '1')
  })
  await page.reload()
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

test('closeup screenshot — default view', async () => {
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/closeup-default.png', fullPage: true })
})

test('closeup screenshot — zoomed on cards', async () => {
  // Use keyboard to zoom in via scroll simulation
  // Scroll to zoom in on the scene
  await page.mouse.move(960, 400)
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/closeup-zoomed.png', fullPage: true })
})

test('closeup screenshot — dual ring layout', async () => {
  await page.evaluate(() => localStorage.setItem('hal-o-layout', 'dual-ring'))
  await page.reload()
  await page.waitForTimeout(3000)
  // Zoom in
  await page.mouse.move(960, 400)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/closeup-dual-ring.png', fullPage: true })
})
