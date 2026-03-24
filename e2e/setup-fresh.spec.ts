import { test, expect } from '@playwright/test'
import { launchApp, CI_TIMEOUT } from './electron'
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
  // Setup screen shows on first launch; auto-skips to hub if setup was completed before.
  // On CI the app may stay in "loading" mode for a long time while IPC calls resolve.
  const setupOrHub = page.locator('.setup-screen, .hal-topbar, canvas').first()
  await expect(setupOrHub).toBeVisible({ timeout: CI_TIMEOUT })
})

test('setup screen has correct items when visible', async () => {
  const setupScreen = page.locator('.setup-screen')
  const isSetup = await setupScreen.isVisible().catch(() => false)
  if (isSetup) {
    const nodeItem = page.locator('.setup-item.ok').first()
    await expect(nodeItem).toBeVisible({ timeout: CI_TIMEOUT })
  }
})

test('setup screen has continue button when visible', async () => {
  const setupScreen = page.locator('.setup-screen')
  const isSetup = await setupScreen.isVisible().catch(() => false)
  if (isSetup) {
    // On setup screen: look for the launch/continue button
    const continueBtn = page.locator('.create-btn, button:has-text("Launch HAL-O"), button:has-text("Continue")')
    await expect(continueBtn.first()).toBeVisible({ timeout: CI_TIMEOUT })
  } else {
    // Already at hub — setup was previously completed, skip assertion
    const hub = page.locator('.hal-topbar, canvas').first()
    await expect(hub).toBeVisible({ timeout: CI_TIMEOUT })
  }
})

test('clicking continue goes to hub', async () => {
  const setupScreen = page.locator('.setup-screen')
  const isSetup = await setupScreen.isVisible().catch(() => false)
  if (isSetup) {
    const continueBtn = page.locator('.create-btn, button:has-text("Launch HAL-O"), button:has-text("Continue")')
    await continueBtn.first().click({ force: true })
    await page.waitForTimeout(2000)
  }

  // Should now see the hub
  const hub = page.locator('.hal-topbar, canvas').first()
  await expect(hub).toBeVisible({ timeout: CI_TIMEOUT })
})

test('screenshot setup flow result', async () => {
  await page.screenshot({ path: 'screenshots/e2e-setup-fresh.png', fullPage: true })
})
