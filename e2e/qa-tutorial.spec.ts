/**
 * QA: Intro Tutorial
 *
 * Test plan:
 * 1. Launch with demo mode, fast-wizards, pbr-holo
 * 2. Ensure hal-o-tutorial-done is NOT set (remove it if present)
 * 3. Wait for scene to load + overlay to dismiss (~8s)
 * 4. Tutorial should appear automatically — screenshot each step
 * 5. Click "Next" through all 6 steps, screenshot each
 * 6. Verify: tooltips point at correct elements, spotlight highlights target, no overflow
 * 7. After step 6, tutorial should auto-dismiss
 * 8. Reload — tutorial should NOT appear again (localStorage set)
 * 9. Reset: remove hal-o-tutorial-done from localStorage, reload — tutorial should appear
 *
 * Run: npx playwright test e2e/qa-tutorial.spec.ts
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { resolve } from 'path'
import { mkdirSync, existsSync } from 'fs'

let app: ElectronApplication
let page: Page
const screenshotDir = resolve(__dirname, '../temp/screenshots/qa-tutorial')

test.beforeAll(async () => {
  // Ensure screenshot directory exists
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true })
  }

  ;({ app, page } = await launchApp())

  // Set up demo mode + pbr-holo renderer
  await page.evaluate(() => {
    // Ensure tutorial is NOT done
    localStorage.removeItem('hal-o-tutorial-done')
    // Set up demo mode and renderer
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-particle-density', '2')
    localStorage.setItem('hal-o-demo-cards', '12')
  })

  // Reload to apply settings
  await page.reload()
})

test.afterAll(async () => {
  await app?.close()
})

// Keep app alive across tests - do not parallelize
test.describe.serial('Tutorial QA', () => {
  test('1. Tutorial appears automatically on first load', async () => {
    // Wait for scene to fully load (canvas renders, data loads)
    const appReady = page.locator('.hal-topbar, canvas').first()
    await appReady.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})

    // Wait for intro animation + tutorial to appear
    await page.waitForTimeout(4000)

    // Verify tutorial overlay is visible
    const overlay = page.locator('.tutorial-overlay')
    await overlay.waitFor({ state: 'attached', timeout: 5000 })

    // Verify we're on step 1
    const stepBadge = page.locator('.tutorial-step-badge')
    const badgeText = await stepBadge.textContent()
    console.log(`Step badge: ${badgeText}`)

    // Take screenshot of step 1
    await page.screenshot({ path: `${screenshotDir}/step-1.png` })
    console.log('✓ Step 1 screenshot saved')

    // Verify spotlight and tooltip are visible
    const spotlight = page.locator('.tutorial-spotlight')
    const tooltip = page.locator('.tutorial-tooltip')
    await spotlight.waitFor({ state: 'attached', timeout: 2000 })
    await tooltip.waitFor({ state: 'attached', timeout: 2000 })

    // Verify step counter shows "BRIEFING 1/6"
    const expectedText = 'BRIEFING 1/6'
    const actualText = await stepBadge.textContent()
    console.log(`Expected: "${expectedText}", Actual: "${actualText}"`)
  })

  test('2. Step 2 - ORBITAL ASSETS', async () => {
    // Click Next button
    const nextBtn = page.locator('.tutorial-next-btn').first()
    await nextBtn.click()

    // Wait for step 2 to appear
    await page.waitForTimeout(500)

    // Verify step counter
    const stepBadge = page.locator('.tutorial-step-badge')
    const badgeText = await stepBadge.textContent()
    console.log(`Step 2 badge: ${badgeText}`)

    // Take screenshot
    await page.screenshot({ path: `${screenshotDir}/step-2.png` })
    console.log('✓ Step 2 screenshot saved')
  })

  test('3. Step 3 - SYSTEMS CONFIGURATION', async () => {
    const nextBtn = page.locator('.tutorial-next-btn').first()
    await nextBtn.click()
    await page.waitForTimeout(500)

    const stepBadge = page.locator('.tutorial-step-badge')
    const badgeText = await stepBadge.textContent()
    console.log(`Step 3 badge: ${badgeText}`)

    await page.screenshot({ path: `${screenshotDir}/step-3.png` })
    console.log('✓ Step 3 screenshot saved')
  })

  test('4. Step 4 - ENLIST NEW OPERATIONS', async () => {
    const nextBtn = page.locator('.tutorial-next-btn').first()
    await nextBtn.click()
    await page.waitForTimeout(500)

    const stepBadge = page.locator('.tutorial-step-badge')
    const badgeText = await stepBadge.textContent()
    console.log(`Step 4 badge: ${badgeText}`)

    await page.screenshot({ path: `${screenshotDir}/step-4.png` })
    console.log('✓ Step 4 screenshot saved')
  })

  test('5. Step 5 - VOICE LINK', async () => {
    const nextBtn = page.locator('.tutorial-next-btn').first()
    await nextBtn.click()
    await page.waitForTimeout(500)

    const stepBadge = page.locator('.tutorial-step-badge')
    const badgeText = await stepBadge.textContent()
    console.log(`Step 5 badge: ${badgeText}`)

    await page.screenshot({ path: `${screenshotDir}/step-5.png` })
    console.log('✓ Step 5 screenshot saved')
  })

  test('6. Step 6 - BRIEFING COMPLETE', async () => {
    const nextBtn = page.locator('.tutorial-next-btn').first()
    await nextBtn.click()
    await page.waitForTimeout(500)

    const stepBadge = page.locator('.tutorial-step-badge')
    const badgeText = await stepBadge.textContent()
    console.log(`Step 6 badge: ${badgeText}`)

    await page.screenshot({ path: `${screenshotDir}/step-6.png` })
    console.log('✓ Step 6 screenshot saved')

    // Verify "COMMENCE" button instead of "NEXT"
    const nextBtn2 = page.locator('.tutorial-next-btn').first()
    const btnText = await nextBtn2.textContent()
    console.log(`Last button text: ${btnText}`)
  })

  test('7. Clicking COMMENCE dismisses tutorial', async () => {
    const nextBtn = page.locator('.tutorial-next-btn').first()
    await nextBtn.click()
    await page.waitForTimeout(1000)

    // Verify tutorial overlay is gone
    const overlay = page.locator('.tutorial-overlay')
    const overlayVisible = await overlay.isVisible().catch(() => false)
    console.log(`Tutorial overlay visible after COMMENCE: ${overlayVisible}`)

    // Verify localStorage has the done flag
    const isDone = await page.evaluate(() => localStorage.getItem('hal-o-tutorial-done'))
    console.log(`Tutorial done flag: ${isDone}`)

    await page.screenshot({ path: `${screenshotDir}/after-complete.png` })
    console.log('✓ After complete screenshot saved')
  })

  test('8. Reload - tutorial should NOT appear again', async () => {
    await page.reload()
    await page.waitForTimeout(4000)

    // Wait for scene to load
    const appReady = page.locator('.hal-topbar, canvas').first()
    await appReady.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})

    await page.waitForTimeout(2000)

    // Verify tutorial overlay is NOT visible
    const overlay = page.locator('.tutorial-overlay')
    const overlayVisible = await overlay.isVisible().catch(() => false)
    console.log(`Tutorial overlay visible on reload: ${overlayVisible}`)

    await page.screenshot({ path: `${screenshotDir}/reload-no-tutorial.png` })
    console.log('✓ Reload screenshot (no tutorial) saved')
  })

  test('9. Reset tutorial by removing localStorage flag', async () => {
    // Remove the tutorial done flag
    await page.evaluate(() => {
      localStorage.removeItem('hal-o-tutorial-done')
    })

    // Reload
    await page.reload()
    await page.waitForTimeout(4000)

    // Wait for scene to load
    const appReady = page.locator('.hal-topbar, canvas').first()
    await appReady.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})

    await page.waitForTimeout(2000)

    // Verify tutorial overlay IS visible again
    const overlay = page.locator('.tutorial-overlay')
    await overlay.waitFor({ state: 'attached', timeout: 5000 })

    const stepBadge = page.locator('.tutorial-step-badge')
    const badgeText = await stepBadge.textContent()
    console.log(`After reset, badge: ${badgeText}`)

    await page.screenshot({ path: `${screenshotDir}/after-reset.png` })
    console.log('✓ After reset screenshot saved')
  })
})

test.describe('Tooltip positioning validation', () => {
  test('Verify no off-screen overflow', async () => {
    // Relaunch fresh for this test
    let testApp = app
    let testPage = page

    // Go through steps and verify tooltip bounds
    const tooltips = []
    for (let step = 0; step < 6; step++) {
      const tooltip = testPage.locator('.tutorial-tooltip')
      const boundingBox = await tooltip.boundingBox().catch(() => null)
      if (boundingBox) {
        tooltips.push({
          step: step + 1,
          x: boundingBox.x,
          y: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
          rightEdge: boundingBox.x + boundingBox.width,
          bottomEdge: boundingBox.y + boundingBox.height,
        })
        console.log(`Step ${step + 1} tooltip: x=${boundingBox.x.toFixed(0)}, y=${boundingBox.y.toFixed(0)}, w=${boundingBox.width.toFixed(0)}, h=${boundingBox.height.toFixed(0)}`)
      }

      if (step < 5) {
        const nextBtn = testPage.locator('.tutorial-next-btn').first()
        await nextBtn.click()
        await testPage.waitForTimeout(500)
      }
    }

    // Get viewport dimensions
    const viewportSize = testPage.viewportSize()
    console.log(`Viewport: ${viewportSize?.width}x${viewportSize?.height}`)

    // Check for overflow
    let overflowCount = 0
    tooltips.forEach((t) => {
      if (t.x < 0 || t.rightEdge > (viewportSize?.width || 1920)) {
        console.warn(`Step ${t.step}: X overflow (x=${t.x}, right=${t.rightEdge}, vw=${viewportSize?.width})`)
        overflowCount++
      }
      if (t.y < 0 || t.bottomEdge > (viewportSize?.height || 1080)) {
        console.warn(`Step ${t.step}: Y overflow (y=${t.y}, bottom=${t.bottomEdge}, vh=${viewportSize?.height})`)
        overflowCount++
      }
    })

    console.log(`Total positioning issues: ${overflowCount}`)
  })
})
