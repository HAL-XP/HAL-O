import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'grid-wall')
    localStorage.setItem('hal-o-setup-done', '1')
  })
  await page.reload()
  await page.waitForTimeout(4000)
})

test.afterAll(async () => {
  await app?.close()
})

test('grid wall closeup — cards facing camera', async () => {
  // Grid wall layout faces the camera directly — best for reading card content
  // Zoom in significantly
  await page.mouse.move(960, 500)
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/card-closeup-grid.png', fullPage: true })
})

test('grid wall — medium zoom', async () => {
  // Zoom back out a bit
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/card-medium-grid.png', fullPage: true })
})
