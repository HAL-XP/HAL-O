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

test('setup screen appears on first launch', async () => {
  // Fresh launch should show the setup screen
  const setupScreen = page.locator('.setup-screen')
  await expect(setupScreen).toBeVisible({ timeout: 10000 })
})

test('setup screen shows Node.js as installed', async () => {
  // Node.js always passes (Electron bundles it)
  const nodeItem = page.locator('.setup-item.ok').first()
  await expect(nodeItem).toBeVisible({ timeout: 5000 })
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
