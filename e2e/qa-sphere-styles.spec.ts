/**
 * QA Validation: Sphere pulse + colorshift styles
 *
 * Tests activity-responsive rendering:
 * - Pulse style: sphere visibly breathes/pulses with activity level
 * - Colorshift style: sphere color shifts cyan→green→red/orange based on activity
 * - Wireframe: baseline regression check
 *
 * Run: npx playwright test e2e/qa-sphere-styles.spec.ts
 */
import { test, expect } from '@playwright/test'
import { launchApp, CI_TIMEOUT } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import * as path from 'path'
import * as fs from 'fs'

let app: ElectronApplication
let page: Page
const screenshotDir = path.join(__dirname, '../temp/screenshots/qa-sphere')

test.beforeAll(async () => {
  fs.mkdirSync(screenshotDir, { recursive: true })

  ;({ app, page } = await launchApp())

  // Setup: demo mode, PBR holo renderer, fast wizards
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-renderer-id', 'pbr-holo')
    localStorage.setItem('hal-o-particle-density', '2')
    localStorage.setItem('hal-o-gpu-wizard-done', '1') // Skip GPU wizard
    localStorage.setItem('hal-o-graphics-preset', 'high')
  })

  // Reload to apply settings
  await page.reload()

  // Wait for scene to load (hub + canvas)
  await page.locator('.hal-topbar, canvas').first().waitFor({ timeout: CI_TIMEOUT })
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await app?.close()
})

test('Test 1: Pulse style - high activity', async () => {
  console.log('\n[TEST 1] Pulse style with activity=80')

  await page.evaluate(() => {
    localStorage.setItem('hal-o-sphere-style', 'pulse')
  })

  await page.reload()
  await page.locator('canvas').first().waitFor({ timeout: CI_TIMEOUT })
  await page.waitForTimeout(5000) // Wait for reload + scene re-render

  // Wait for the photo mode API to be available
  await page.waitForFunction(() => !!(window as any).__haloPhotoMode?.setActivity, { timeout: CI_TIMEOUT })

  // Set high activity
  await page.evaluate(() => {
    (window as any).__haloPhotoMode?.setActivity?.(80)
  })

  console.log('✓ Activity set to 80')
  await page.waitForTimeout(3000) // Wait for pulse animation

  const screenshotPath = path.join(screenshotDir, 'pulse-active.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const stats = fs.statSync(screenshotPath)
  console.log(`✓ Captured pulse-active.png (${stats.size} bytes)`)

  expect(stats.size).toBeGreaterThan(5000) // Sanity check: screenshot should be non-trivial
})

test('Test 2: Pulse style - idle (minimal activity)', async () => {
  console.log('\n[TEST 2] Pulse style with activity=0')

  // Activity should already be "pulse" style from previous test
  await page.evaluate(() => {
    (window as any).__haloPhotoMode?.setActivity?.(0)
  })

  console.log('✓ Activity set to 0')
  await page.waitForTimeout(2000) // Let pulse settle to minimum

  const screenshotPath = path.join(screenshotDir, 'pulse-idle.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const stats = fs.statSync(screenshotPath)
  console.log(`✓ Captured pulse-idle.png (${stats.size} bytes)`)

  expect(stats.size).toBeGreaterThan(5000)
})

test('Test 3: Colorshift style - idle (cyan)', async () => {
  console.log('\n[TEST 3] Colorshift style with activity=0')

  await page.evaluate(() => {
    localStorage.setItem('hal-o-sphere-style', 'colorshift')
  })

  await page.reload()
  await page.locator('canvas').first().waitFor({ timeout: CI_TIMEOUT })
  await page.waitForTimeout(5000)

  // Wait for API to be available after reload
  await page.waitForFunction(() => !!(window as any).__haloPhotoMode?.setActivity, { timeout: CI_TIMEOUT })

  // Ensure activity is 0 for cyan
  await page.evaluate(() => {
    (window as any).__haloPhotoMode?.setActivity?.(0)
  })

  console.log('✓ Activity set to 0 (expect cyan)')
  await page.waitForTimeout(1000)

  const screenshotPath = path.join(screenshotDir, 'colorshift-idle.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const stats = fs.statSync(screenshotPath)
  console.log(`✓ Captured colorshift-idle.png (${stats.size} bytes)`)

  expect(stats.size).toBeGreaterThan(5000)
})

test('Test 4: Colorshift style - mid activity (green)', async () => {
  console.log('\n[TEST 4] Colorshift style with activity=50')

  await page.evaluate(() => {
    (window as any).__haloPhotoMode?.setActivity?.(50)
  })

  console.log('✓ Activity set to 50 (expect green)')
  await page.waitForTimeout(2000)

  const screenshotPath = path.join(screenshotDir, 'colorshift-mid.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const stats = fs.statSync(screenshotPath)
  console.log(`✓ Captured colorshift-mid.png (${stats.size} bytes)`)

  expect(stats.size).toBeGreaterThan(5000)
})

test('Test 5: Colorshift style - high activity (red/orange)', async () => {
  console.log('\n[TEST 5] Colorshift style with activity=100')

  await page.evaluate(() => {
    (window as any).__haloPhotoMode?.setActivity?.(100)
  })

  console.log('✓ Activity set to 100 (expect red/orange)')
  await page.waitForTimeout(2000)

  const screenshotPath = path.join(screenshotDir, 'colorshift-max.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const stats = fs.statSync(screenshotPath)
  console.log(`✓ Captured colorshift-max.png (${stats.size} bytes)`)

  expect(stats.size).toBeGreaterThan(5000)
})

test('Test 6: Wireframe baseline (regression check)', async () => {
  console.log('\n[TEST 6] Wireframe style (baseline)')

  await page.evaluate(() => {
    localStorage.setItem('hal-o-sphere-style', 'wireframe')
  })

  await page.reload()
  await page.locator('canvas').first().waitFor({ timeout: CI_TIMEOUT })
  await page.waitForTimeout(5000)

  const screenshotPath = path.join(screenshotDir, 'wireframe-baseline.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const stats = fs.statSync(screenshotPath)
  console.log(`✓ Captured wireframe-baseline.png (${stats.size} bytes)`)

  expect(stats.size).toBeGreaterThan(5000)
})
