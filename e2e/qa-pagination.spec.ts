/**
 * QA: Pagination Bar (SectorHud) Screenshots in Demo Mode
 */
import { test } from '@playwright/test'
import { launchApp, CI_TIMEOUT } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { resolve } from 'path'
import { mkdirSync } from 'fs'

const ROOT = resolve(__dirname, '..')
const SCREENSHOTS_DIR = resolve(ROOT, 'temp/screenshots')

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  ;({ app, page } = await launchApp())

  // Set demo mode + pagination settings THEN reload so the app picks them up
  await page.evaluate(() => {
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '40')
    localStorage.setItem('hal-o-cards-per-sector', '16')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-setup-done', '1')
  })
  await page.reload()
  await page.waitForLoadState('load').catch(() => {})

  // Wait for hub to render (canvas for 3D scene)
  const hub = page.locator('canvas, .project-hub, .hal-room').first()
  await hub.waitFor({ state: 'attached', timeout: CI_TIMEOUT })

  // Wait for scene + cards to fully load
  await page.waitForTimeout(8000)
})

test.afterAll(async () => {
  await app?.close()
})

test('Pagination bar sector 1 screenshot', async () => {
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, 'pagination-demo-1.png') })
})

test('Pagination bar sector 2 screenshot', async () => {
  await page.keyboard.press(']')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, 'pagination-demo-2.png') })
})

test('Pagination bar sector 3 screenshot', async () => {
  await page.keyboard.press(']')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, 'pagination-demo-3.png') })
})
