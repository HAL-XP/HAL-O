import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

test('setup screen or hub appears on launch', async () => {
  // Setup screen shows on first launch; auto-skips to hub if setup was completed before
  const setupOrHub = page.locator('.setup-screen, .hal-topbar, canvas').first()
  await expect(setupOrHub).toBeVisible({ timeout: 10000 })
})

test('setup screen has correct items when visible', async () => {
  const setupScreen = page.locator('.setup-screen')
  const isSetup = await setupScreen.isVisible().catch(() => false)
  if (isSetup) {
    const nodeItem = page.locator('.setup-item.ok').first()
    await expect(nodeItem).toBeVisible({ timeout: 5000 })
  }
})

test('setup screen has continue button', async () => {
  const continueBtn = page.locator('.create-btn')
  await expect(continueBtn).toBeVisible({ timeout: 5000 })
})

test('clicking continue goes to hub', async () => {
  const continueBtn = page.locator('.create-btn')
  await continueBtn.click()
  await page.waitForTimeout(1000)

  // Should now see the hub
  const hub = page.locator('.hal-topbar, canvas').first()
  await expect(hub).toBeVisible({ timeout: 10000 })
})

test('screenshot setup flow result', async () => {
  await page.screenshot({ path: 'screenshots/e2e-setup-fresh.png', fullPage: true })
})
