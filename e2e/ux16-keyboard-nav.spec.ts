import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import fs from 'fs'
import path from 'path'

let app: ElectronApplication
let page: Page

const screenshotDir = path.join(__dirname, '../temp/screenshots/qa-ux16-p2')

test.beforeAll(async () => {
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }
  ;({ app, page } = await launchApp())
})

test.afterAll(async () => {
  await app?.close()
})

test('keyboard navigation - arrow right x3', async () => {
  // Wait for app to be ready
  await page.waitForTimeout(3000)
  
  // Press Right arrow 3 times
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
  }
  
  // Verify app is responsive
  const isAlive = await page.evaluate(() => document.title).catch(() => null)
  expect(isAlive).not.toBeNull()
})

test('keyboard navigation - arrow left', async () => {
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(150)
  
  const isAlive = await page.evaluate(() => document.title).catch(() => null)
  expect(isAlive).not.toBeNull()
})

test('keyboard navigation - enter key', async () => {
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  
  const isAlive = await page.evaluate(() => document.title).catch(() => null)
  expect(isAlive).not.toBeNull()
})

test('keyboard navigation - escape key', async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  
  const isAlive = await page.evaluate(() => document.title).catch(() => null)
  expect(isAlive).not.toBeNull()
})

test('keyboard navigation - slash key (search)', async () => {
  await page.keyboard.press('/')
  await page.waitForTimeout(200)
  
  const isAlive = await page.evaluate(() => document.title).catch(() => null)
  expect(isAlive).not.toBeNull()
})

test('capture navigation screenshot', async () => {
  const screenshotPath = path.join(screenshotDir, 'keyboard-nav.png')
  await page.screenshot({ path: screenshotPath })
  
  expect(fs.existsSync(screenshotPath)).toBe(true)
  const stats = fs.statSync(screenshotPath)
  expect(stats.size).toBeGreaterThan(0)
  console.log(`✓ Screenshot: ${screenshotPath} (${stats.size} bytes)`)
})
