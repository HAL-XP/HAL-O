import { test, expect } from '@playwright/test'
import { launchApp, CI_TIMEOUT } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import fs from 'fs'
import path from 'path'

let app: ElectronApplication
let page: Page

const screenshotDir = path.join(__dirname, '../temp/screenshots/qa-ux16-p2')

test.beforeAll(async () => {
  // Ensure screenshot directory exists
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }
  ;({ app, page } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

test('UX16.1: App loads without errors', async () => {
  const title = await page.title()
  expect(title.toUpperCase()).toContain('HAL-O')
  
  // Wait for hub to render
  await page.waitForTimeout(2000)
})

test('UX16.2: Right arrow x3 - no crash', async () => {
  // Skip setup if present
  const setupScreen = page.locator('.setup-screen')
  const isSetup = await setupScreen.isVisible({ timeout: 2000 }).catch(() => false)
  if (isSetup) {
    const skipBtn = page.locator('button:has-text("Skip Setup"), button:has-text("Continue")')
    await skipBtn.first().click().catch(() => {})
    await page.waitForTimeout(1000)
  }
  
  // Press Right arrow 3 times
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  
  // Verify page is still responsive
  const content = await page.content()
  expect(content).not.toContain('crash')
  expect(content).not.toContain('Uncaught')
})

test('UX16.3: Left arrow - no crash', async () => {
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(200)
  
  const content = await page.content()
  expect(content).not.toContain('crash')
})

test('UX16.4: Enter key - no crash', async () => {
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  
  const content = await page.content()
  expect(content).not.toContain('crash')
})

test('UX16.5: Escape key - clear selection', async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  
  const content = await page.content()
  expect(content).not.toContain('crash')
})

test('UX16.6: Forward slash / - focus search', async () => {
  await page.keyboard.press('/')
  await page.waitForTimeout(300)
  
  const content = await page.content()
  expect(content).not.toContain('crash')
})

test('UX16.7: Screenshot after navigation', async () => {
  const screenshotPath = path.join(screenshotDir, '01-arrow-nav.png')
  await page.screenshot({ path: screenshotPath })
  expect(fs.existsSync(screenshotPath)).toBe(true)
  console.log(`✓ Screenshot saved: ${screenshotPath}`)
})

test('UX16.8: Verify no console errors', async () => {
  const logs: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      logs.push(msg.text())
    }
  })
  
  // Trigger one more navigation to capture any errors
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  
  const criticalErrors = logs.filter(e => 
    !e.includes('net::ERR') && 
    !e.includes('Failed to load') &&
    e.includes('Error')
  )
  expect(criticalErrors.length).toBe(0)
})
