import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-setup-done', '1')
  })
  await page.reload()
  await page.waitForTimeout(3000)

  // Maximize window
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(1000)
})

test.afterAll(async () => {
  await app?.close()
})

test('hi-res default view', async () => {
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/hires-default.png' })
})

test('hi-res zoomed on front card', async () => {
  // Zoom in a lot
  await page.mouse.move(960, 540)
  for (let i = 0; i < 15; i++) {
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(50)
  }
  // Drag camera down to face a card
  await page.mouse.move(960, 300)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(960, 500, { steps: 10 })
  await page.mouse.up({ button: 'left' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/hires-zoomed-card.png' })
})

test('hi-res spiral layout', async () => {
  await page.evaluate(() => localStorage.setItem('hal-o-layout', 'spiral'))
  await page.reload()
  await page.waitForTimeout(3000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'screenshots/hires-spiral.png' })
})

test('hi-res dna helix layout', async () => {
  await page.evaluate(() => localStorage.setItem('hal-o-layout', 'dna-helix'))
  await page.reload()
  await page.waitForTimeout(3000)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize()
  })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'screenshots/hires-dna-helix.png' })
})
