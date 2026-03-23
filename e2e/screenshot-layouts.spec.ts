import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

const LAYOUTS_3D = [
  'default', 'dual-ring', 'stacked-rings', 'spiral',
  'hemisphere', 'arena', 'grid-wall', 'dna-helix', 'cascade', 'constellation',
]

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  // Skip setup if needed
  const setupScreen = page.locator('.setup-screen')
  const isSetup = await setupScreen.isVisible({ timeout: 3000 }).catch(() => false)
  if (isSetup) {
    const continueBtn = page.locator('.create-btn').first()
    await continueBtn.click()
    await page.waitForTimeout(1000)
  }

  // Switch to PBR renderer
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-setup-done', '1')
  })
  await page.reload()
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  await app?.close()
})

for (const layoutId of LAYOUTS_3D) {
  test(`screenshot layout: ${layoutId}`, async () => {
    await page.evaluate((id) => {
      localStorage.setItem('hal-o-layout', id)
    }, layoutId)
    await page.reload()
    await page.waitForTimeout(3000) // let 3D scene settle
    await page.screenshot({ path: `screenshots/layout-${layoutId}.png`, fullPage: true })
  })
}
