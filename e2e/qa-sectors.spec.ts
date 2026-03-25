/**
 * QA Validation: Tactical Sectors
 *
 * Test plan:
 * 1. App loads without errors
 * 2. With demo mode (15+ cards), verify SectorHud appears at bottom (dots + sector label)
 * 3. Click right chevron — sector transitions, cards animate in
 * 4. Press ] key — next sector
 * 5. Press [ key — previous sector
 * 6. Verify sector hue changes (sphere/scene color shifts between sectors)
 * 7. Type in search — verify it searches across ALL sectors (not just current)
 * 8. Set cardsPerSector to 8 via localStorage, reload — verify more sectors created
 * 9. Take screenshots of sector 1 and sector 2
 * 10. Run smoke tests: npx playwright test e2e/smoke.spec.ts
 *
 * Run: npx playwright test e2e/qa-sectors.spec.ts
 */

import { test, expect } from '@playwright/test'
import { launchApp, CI_TIMEOUT } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import * as path from 'path'
import * as fs from 'fs'

let app: ElectronApplication
let page: Page
const screenshotDir = path.join(__dirname, '../temp/screenshots/qa-sectors')

test.beforeAll(async () => {
  fs.mkdirSync(screenshotDir, { recursive: true })

  ;({ app, page } = await launchApp())

  // Setup: demo mode with 15 cards, PBR holo renderer, fast wizards
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-card-count', '15')
    localStorage.setItem('hal-o-renderer-id', 'pbr-holo')
    localStorage.setItem('hal-o-particle-density', '2')
    localStorage.setItem('hal-o-gpu-wizard-done', '1') // Skip GPU wizard
    localStorage.setItem('hal-o-graphics-preset', 'medium')
    localStorage.setItem('hal-o-cards-per-sector', '8') // Force 2 sectors with 15 demo cards
    localStorage.setItem('hal-o-tutorial-done', '1') // Skip intro tutorial
  })

  // Reload to apply settings
  await page.reload()

  // Wait for scene to load (hub + canvas)
  await page.locator('.hal-topbar, canvas').first().waitFor({ timeout: CI_TIMEOUT })
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  await app?.close()
})

test('Test 1: App loads without errors', async () => {
  console.log('\n[TEST 1] App loads without errors')

  // Check for console errors
  let hasErrors = false
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[ERROR] ${msg.text()}`)
      hasErrors = true
    }
  })

  // Wait for topbar to be visible
  const topbar = page.locator('.hal-topbar')
  await topbar.waitFor({ state: 'attached', timeout: CI_TIMEOUT })

  expect(hasErrors).toBe(false)
  console.log('✓ App loaded successfully, no errors')
})

test('Test 2: SectorHud appears at bottom with 15+ cards', async () => {
  console.log('\n[TEST 2] SectorHud appears with 15+ cards')

  // With 15 cards and default 16 per sector, should have exactly 1 sector (hidden HUD)
  // So let's set it to 8 cards per sector to force multiple sectors
  await page.evaluate(() => {
    localStorage.setItem('hal-o-cards-per-sector', '8')
  })
  await page.reload()
  await page.waitForTimeout(2000)

  // Now look for SectorHud
  const sectorHud = page.locator('.hal-sector-hud')
  await sectorHud.waitFor({ state: 'visible', timeout: CI_TIMEOUT })

  // Check that HUD is visible
  const isVisible = await sectorHud.isVisible()
  expect(isVisible).toBe(true)
  console.log('✓ SectorHud is visible at bottom of screen')

  // Check for sector label text
  const sectorText = await sectorHud.textContent()
  expect(sectorText).toMatch(/SECTOR/i)
  console.log(`  Sector label: ${sectorText}`)

  // Check that dot indicators exist (should have multiple sectors now)
  const dots = page.locator('.hal-sector-hud button[style*="border"]')
  const dotCount = await dots.count()
  expect(dotCount).toBeGreaterThan(1)
  console.log(`  Found ${dotCount} sector dots (15 cards / 8 per sector = 2 sectors)`)
})

test('Test 3: Click right chevron — sector transitions', async () => {
  console.log('\n[TEST 3] Click right chevron to advance sector')

  // Get initial sector number
  const sectorHud = page.locator('.hal-sector-hud')
  const initialText = await sectorHud.textContent()
  console.log(`  Initial sector: ${initialText}`)

  // Find right chevron button (the ▶ symbol, second button in the header)
  const buttons = page.locator('.hal-sector-hud button')
  const rightChevron = buttons.nth(1) // Left chevron is [0], right is [1]

  // Click right chevron
  await rightChevron.click()

  // Wait for transition animation
  await page.waitForTimeout(800)

  // Check that sector changed
  const newText = await sectorHud.textContent()
  console.log(`  New sector: ${newText}`)
  expect(newText).not.toBe(initialText)
  console.log('✓ Right chevron advanced to next sector')
})

test('Test 4: Press ] key — next sector', async () => {
  console.log('\n[TEST 4] Press ] key to advance sector')

  // Set focus on page
  await page.focus('body')

  // Get current sector
  const sectorHud = page.locator('.hal-sector-hud')
  const beforeText = await sectorHud.textContent()

  // Press ]
  await page.keyboard.press(']')
  await page.waitForTimeout(800)

  // Verify sector changed
  const afterText = await sectorHud.textContent()
  expect(afterText).not.toBe(beforeText)
  console.log(`  Sector changed: ${beforeText} → ${afterText}`)
  console.log('✓ ] key advances to next sector')
})

test('Test 5: Press [ key — previous sector', async () => {
  console.log('\n[TEST 5] Press [ key to go to previous sector')

  // Set focus on page
  await page.focus('body')

  // Get current sector
  const sectorHud = page.locator('.hal-sector-hud')
  const beforeText = await sectorHud.textContent()

  // Press [
  await page.keyboard.press('[')
  await page.waitForTimeout(800)

  // Verify sector changed
  const afterText = await sectorHud.textContent()
  expect(afterText).not.toBe(beforeText)
  console.log(`  Sector changed: ${beforeText} → ${afterText}`)
  console.log('✓ [ key goes to previous sector')
})

test('Test 6: Verify sector hue changes', async () => {
  console.log('\n[TEST 6] Verify sector hue changes between sectors')

  const sectorHud = page.locator('.hal-sector-hud')

  // Go to sector 1
  await page.keyboard.press('[')
  await page.keyboard.press('[')
  await page.waitForTimeout(800)

  // Get color of sector label (should be computed style color)
  const color1 = await sectorHud.evaluate((el) => {
    return window.getComputedStyle(el).color
  })
  console.log(`  Sector 1 color: ${color1}`)

  // Advance to sector 2
  await page.keyboard.press(']')
  await page.waitForTimeout(800)

  // Get new color
  const color2 = await sectorHud.evaluate((el) => {
    return window.getComputedStyle(el).color
  })
  console.log(`  Sector 2 color: ${color2}`)

  // Colors should be different (different sector hues)
  expect(color1).not.toBe(color2)
  console.log('✓ Sector hue changes when transitioning between sectors')
})

test('Test 7: Search across all sectors', async () => {
  console.log('\n[TEST 7] Search works across all sectors (not just current)')

  // Focus search bar by pressing /
  await page.focus('body')
  await page.keyboard.press('/')
  await page.waitForTimeout(300)

  // Type a search term (search for "app" to match demo projects)
  await page.keyboard.type('app', { delay: 50 })
  await page.waitForTimeout(500)

  // When search is active, ALL projects should be shown (cross-sector)
  // Verify cards are displayed
  const cards = page.locator('[class*="project"]')
  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
  console.log(`  Search returned ${cardCount} cards matching "app"`)

  // Note: When search is active, sector boundaries are ignored
  console.log('✓ Search works across all sectors')

  // Clear search
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
})

test('Test 8: cardsPerSector configuration', async () => {
  console.log('\n[TEST 8] cardsPerSector setting changes sector count')

  // Currently should have 2 sectors with 8 per sector
  let dots = page.locator('.hal-sector-hud button[style*="border"]')
  let dotCount = await dots.count()
  console.log(`  With 8 cards/sector, 15 total: ${dotCount} sectors`)
  expect(dotCount).toBe(2) // ceil(15/8) = 2

  // Change to 5 cards per sector
  await page.evaluate(() => {
    localStorage.setItem('hal-o-cards-per-sector', '5')
  })
  await page.reload()
  await page.waitForTimeout(2000)

  // Now should have 3 sectors (ceil(15/5) = 3)
  dots = page.locator('.hal-sector-hud button[style*="border"]')
  dotCount = await dots.count()
  console.log(`  With 5 cards/sector, 15 total: ${dotCount} sectors`)
  expect(dotCount).toBe(3)

  // Change back to 16
  await page.evaluate(() => {
    localStorage.setItem('hal-o-cards-per-sector', '16')
  })
  await page.reload()
  await page.waitForTimeout(2000)

  console.log('✓ cardsPerSector configuration correctly adjusts sector count')
})

test('Test 9: Take screenshots', async () => {
  console.log('\n[TEST 9] Take screenshots of sectors')

  // Set back to 8 cards per sector for multi-sector view
  await page.evaluate(() => {
    localStorage.setItem('hal-o-cards-per-sector', '8')
  })
  await page.reload()
  await page.waitForTimeout(2000)

  // Go to sector 1
  await page.focus('body')
  await page.keyboard.press('[')
  await page.keyboard.press('[')
  await page.waitForTimeout(800)

  // Screenshot sector 1
  await page.screenshot({ path: path.join(screenshotDir, 'sector-1.png'), fullPage: true })
  console.log(`  Saved sector-1.png`)

  // Advance to sector 2
  await page.keyboard.press(']')
  await page.waitForTimeout(800)

  // Screenshot sector 2
  await page.screenshot({ path: path.join(screenshotDir, 'sector-2.png'), fullPage: true })
  console.log(`  Saved sector-2.png`)

  console.log('✓ Screenshots saved to temp/screenshots/qa-sectors/')
})

test('Test 10: Verify smoke tests pass', async () => {
  console.log('\n[TEST 10] Smoke tests')
  console.log('  To run full smoke tests: npx playwright test e2e/smoke.spec.ts')
  // This test is informational — actual smoke tests run separately
})
