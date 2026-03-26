import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const STYLES = ['wireframe', 'hal-eye', 'animated-core', 'pulse', 'colorshift', 'corona', 'particles', 'lightning'] as const

test.describe('Sphere Styles', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let page: Awaited<ReturnType<typeof app['firstWindow']>>

  test.beforeAll(async () => {
    const userDataDir = path.join(__dirname, `../.test-data/sphere-styles-${Date.now()}`)
    fs.mkdirSync(userDataDir, { recursive: true })

    app = await electron.launch({
      args: ['.', '--fast-wizards'],
      env: { ...process.env, ELECTRON_DISABLE_GPU: '0' },
      cwd: path.resolve(__dirname, '..'),
    })
    page = await app.firstWindow()
    await page.waitForTimeout(3000) // Wait for scene to load
  })

  test.afterAll(async () => {
    await app?.close()
  })

  for (const style of STYLES) {
    test(`sphere style "${style}" renders without errors`, async () => {
      // Set the sphere style via localStorage
      await page.evaluate((s) => {
        localStorage.setItem('hal-o-sphere-style', s)
      }, style)

      // Reload to apply
      await page.reload()
      await page.waitForTimeout(2000)

      // Check no unhandled errors
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      // Wait for scene to stabilize
      await page.waitForTimeout(1000)

      // Take a screenshot for visual verification
      const screenshot = await page.screenshot()
      expect(screenshot.length).toBeGreaterThan(10000) // Not a blank/tiny image

      // No JS errors
      expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
    })
  }
})
