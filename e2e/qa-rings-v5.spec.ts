/**
 * QA: Rings V5 — capture screenshot with floor-lines, bloom, particles enabled
 * Uses real localStorage (fixed user-data-dir) so settings persist.
 */
import { test } from '@playwright/test'
import { _electron as electron } from 'playwright-core'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')

test('qa-rings-v5: capture screenshot', async () => {
  const app = await electron.launch({
    args: [
      resolve(ROOT, 'out/main/index.js'),
    ],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('load').catch(() => {})

  // Wait for initial render
  const appReady = page.locator('.setup-screen, .hal-topbar, canvas, .project-hub, .chat-area').first()
  await appReady.waitFor({ state: 'attached', timeout: 20000 }).catch(() => {})

  // Set all required localStorage keys
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '8')
    localStorage.setItem('hal-o-intro-animation', 'false')
    localStorage.setItem('hal-o-intro-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-floor-lines', 'true')
    localStorage.setItem('hal-o-bloom', 'true')
    localStorage.setItem('hal-o-particle-density', '3')
  })

  // Reload to apply settings
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Wait for canvas (3D scene)
  await page.locator('canvas').first().waitFor({ timeout: 20000 }).catch(() => {})

  // Wait 8s for full scene render
  await page.waitForTimeout(8000)

  // Take screenshot
  await page.screenshot({ path: 'screenshots/qa-rings-v5.png', fullPage: true })

  await app.close()
})
