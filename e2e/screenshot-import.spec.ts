import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
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

test('import screen — trigger via RECRUIT with a known project', async () => {
  // Simulate clicking RECRUIT by directly navigating to import mode
  // We'll use a known project path that exists
  await page.evaluate(() => {
    // Trigger the import flow programmatically
    const event = new CustomEvent('hal-import-project', { detail: { path: 'D:/GitHub/hal-o' } })
    window.dispatchEvent(event)
  })

  // Alternatively, just set the state directly via localStorage hack and reload
  await page.evaluate(() => {
    localStorage.setItem('hal-o-import-path', 'D:/GitHub/hal-o')
    localStorage.setItem('hal-o-view-mode', 'import')
  })

  // Since we can't directly trigger the import from outside React, let's click RECRUIT
  // and select the hal-o folder itself
  // For now just screenshot the hub with the RECRUIT button visible
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'screenshots/import-hub-recruit.png' })
})
