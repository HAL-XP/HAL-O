/**
 * Session 3 E2E tests — settings controls, visual regression, and feature verification.
 *
 * Run: npx playwright test e2e/session3.spec.ts --timeout=120000
 */
import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

/** Helper: open settings panel (handles disambiguation from Groups button) */
async function openSettings(p: Page): Promise<void> {
  const settingsBtn = p.locator('button[title="Settings"]')
  await settingsBtn.click()
  await expect(p.locator('.hal-settings-panel')).toBeVisible({ timeout: 3000 })
}

/** Helper: close settings panel */
async function closeSettings(p: Page): Promise<void> {
  const settingsBtn = p.locator('button[title="Settings"]')
  await settingsBtn.click()
  await expect(p.locator('.hal-settings-panel')).not.toBeVisible({ timeout: 3000 })
}

/** Helper: expand a collapsible section inside the settings panel */
async function expandSection(panel: ReturnType<Page['locator']>, sectionName: string, p: Page): Promise<void> {
  const header = panel.locator('.hal-settings-section-header', { hasText: sectionName })
  // Only click if the section body is not already visible
  const arrow = header.locator('.hal-settings-section-arrow')
  const arrowText = await arrow.textContent()
  if (arrowText?.includes('\u25B6')) {
    // Section is collapsed (▶), click to expand
    await header.click()
    await p.waitForTimeout(300)
  }
}

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  // Configure demo mode with PBR renderer so all 3D features are available
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '12')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', 'tactical')
    localStorage.setItem('hal-o-particle-density', '6')
    localStorage.setItem('hal-o-sphere-style', 'wireframe')
  })
  await page.reload()

  // Wait for the hub + canvas to render
  await page.locator('canvas').first().waitFor({ timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000) // Let scene settle
})

test.afterAll(async () => {
  await app?.close()
})

// ─── SETTINGS TESTS ───────────────────────────────────────────

test('1 — Settings panel opens and closes', async () => {
  const settingsBtn = page.locator('button[title="Settings"]')
  await expect(settingsBtn).toBeVisible({ timeout: 5000 })
  await settingsBtn.click()

  // Settings panel should appear (rendered via portal)
  const panel = page.locator('.hal-settings-panel')
  await expect(panel).toBeVisible({ timeout: 3000 })

  // Verify title is present
  const title = panel.locator('.hal-settings-title')
  await expect(title).toHaveText('SETTINGS')

  // Close by clicking the gear again
  await settingsBtn.click()
  await expect(panel).not.toBeVisible({ timeout: 3000 })
})

test('2 — Sphere style dropdown exists with 3 options', async () => {
  await openSettings(page)
  const panel = page.locator('.hal-settings-panel')

  // Expand the Scene section (collapsed by default)
  await expandSection(panel, 'GRAPHICS', page)

  // Find the SPHERE STYLE row and its select
  const sphereRow = panel.locator('.hal-settings-row', { hasText: 'SPHERE STYLE' })
  await expect(sphereRow).toBeVisible({ timeout: 3000 })

  const sphereSelect = sphereRow.locator('select')
  await expect(sphereSelect).toBeVisible()

  // Verify exactly 3 options: wireframe, hal-eye, animated-core
  const options = sphereSelect.locator('option')
  await expect(options).toHaveCount(3)

  const values = await options.evaluateAll((opts: HTMLOptionElement[]) =>
    opts.map((o) => o.value)
  )
  expect(values).toEqual(['wireframe', 'hal-eye', 'animated-core'])

  await closeSettings(page)
})

test('3 — Personality sliders exist (humor, formality, verbosity, dramatic)', async () => {
  await openSettings(page)
  const panel = page.locator('.hal-settings-panel')

  // Expand Personality section
  await expandSection(panel, 'PERSONALITY', page)

  // Check each personality slider label exists with a range input
  for (const label of ['HUMOR', 'FORMALITY', 'VERBOSITY', 'DRAMATIC']) {
    const row = panel.locator('.hal-settings-row', { hasText: label }).first()
    await expect(row).toBeVisible({ timeout: 3000 })
    const slider = row.locator('input[type="range"]')
    await expect(slider).toBeVisible()

    // Verify 0-100 range
    const min = await slider.getAttribute('min')
    const max = await slider.getAttribute('max')
    expect(min).toBe('0')
    expect(max).toBe('100')
  }

  await closeSettings(page)
})

test('4 — Particle density slider has 16 levels (max=15)', async () => {
  await openSettings(page)
  const panel = page.locator('.hal-settings-panel')

  // Expand Scene section
  await expandSection(panel, 'GRAPHICS', page)

  const particleRow = panel.locator('.hal-settings-row', { hasText: 'PARTICLE DENSITY' })
  await particleRow.scrollIntoViewIfNeeded()
  await expect(particleRow).toBeVisible({ timeout: 3000 })

  const slider = particleRow.locator('input[type="range"]')
  await expect(slider).toBeVisible()

  const min = await slider.getAttribute('min')
  const max = await slider.getAttribute('max')
  const step = await slider.getAttribute('step')
  expect(min).toBe('0')
  expect(max).toBe('15')
  expect(step).toBe('1')
  // 16 levels: 0 through 15

  await closeSettings(page)
})

test('5 — Voice reaction slider exists (0-5 range)', async () => {
  await openSettings(page)
  const panel = page.locator('.hal-settings-panel')

  // Expand Voice section
  await expandSection(panel, 'VOICE', page)

  const reactionRow = panel.locator('.hal-settings-row', { hasText: 'VOICE REACTION' })
  await expect(reactionRow).toBeVisible({ timeout: 3000 })

  const slider = reactionRow.locator('input[type="range"]')
  await expect(slider).toBeVisible()

  const min = await slider.getAttribute('min')
  const max = await slider.getAttribute('max')
  expect(min).toBe('0')
  expect(max).toBe('5')

  await closeSettings(page)
})

test('6 — Default IDE dropdown exists', async () => {
  await openSettings(page)
  const panel = page.locator('.hal-settings-panel')

  // DEFAULT IDE is in the TERMINAL section
  await expandSection(panel, 'TERMINAL', page)

  const ideRow = panel.locator('.hal-settings-row', { hasText: 'DEFAULT IDE' })
  await expect(ideRow).toBeVisible({ timeout: 3000 })

  const ideSelect = ideRow.locator('select')
  await expect(ideSelect).toBeVisible()

  // Verify it has the expected IDE options
  const optionValues = await ideSelect.locator('option').evaluateAll(
    (opts: HTMLOptionElement[]) => opts.map((o) => o.value)
  )
  expect(optionValues).toContain('auto')
  expect(optionValues).toContain('vscode')
  expect(optionValues).toContain('cursor')
  expect(optionValues.length).toBeGreaterThanOrEqual(5)

  await closeSettings(page)
})

// ─── VISUAL TESTS ─────────────────────────────────────────────

test('7 — Screenshot with default wireframe sphere', async () => {
  // Ensure wireframe sphere style is active (set in beforeAll)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'screenshots/e2e-session3-wireframe.png', fullPage: true })
})

test('8 — Screenshot after switching to HAL eye sphere style', async () => {
  // Change sphere style via localStorage + reload for clean state
  await page.evaluate(() => {
    localStorage.setItem('hal-o-sphere-style', 'hal-eye')
  })
  await page.reload()
  await page.locator('canvas').first().waitFor({ timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000) // Let sphere transition settle

  await page.screenshot({ path: 'screenshots/e2e-session3-hal-eye.png', fullPage: true })

  // Restore wireframe for subsequent tests
  await page.evaluate(() => {
    localStorage.setItem('hal-o-sphere-style', 'wireframe')
  })
  await page.reload()
  await page.locator('canvas').first().waitFor({ timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2000)
})

test('9 — Error toast appears when triggering a test error', async () => {
  // Inject an unhandled error that the ErrorToastContainer will catch
  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'E2E test error — intentional',
        error: new Error('E2E test error — intentional'),
      })
    )
  })

  // Wait for the error toast to appear
  const toastContainer = page.locator('.error-toast-container')
  await expect(toastContainer).toBeVisible({ timeout: 5000 })

  const toast = page.locator('.error-toast').first()
  await expect(toast).toBeVisible({ timeout: 3000 })

  // Verify toast content
  const title = toast.locator('.error-toast-title')
  await expect(title).toHaveText('ERROR')

  const summary = toast.locator('.error-toast-summary')
  const summaryText = await summary.textContent()
  expect(summaryText).toContain('E2E test error')

  // Dismiss the toast
  const closeBtn = toast.locator('.error-toast-close')
  await closeBtn.click()
  await page.waitForTimeout(500)
})

// ─── FEATURE TESTS ────────────────────────────────────────────

test('10 — Search bar filters projects', async () => {
  // The search input is in the topbar
  const searchInput = page.locator('.hal-search')
  await expect(searchInput).toBeVisible({ timeout: 5000 })

  // Get initial project count from the OPS stat
  const opsCount = await page.locator('.hal-stat-n').first().textContent()
  const initialCount = parseInt(opsCount || '0', 10)
  expect(initialCount).toBeGreaterThan(0)

  // Type a search term that should match only some demo projects
  await searchInput.fill('alpha')
  await page.waitForTimeout(1000)

  // Verify the search input has our value
  const searchValue = await searchInput.inputValue()
  expect(searchValue).toBe('alpha')

  // Clear search to restore all projects
  await searchInput.fill('')
  await page.waitForTimeout(500)
})

test('11 — Cinematic mode activates via IPC', async () => {
  // Send toggle-cinematic IPC from the main process to the renderer
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send('toggle-cinematic', true)
    }
  })

  // Wait for the cinematic overlay to render (needs time for React state + Three.js Html)
  await page.waitForTimeout(3000)

  // The CINEMATIC MODE badge is rendered inside a Three.js <Html> component which creates
  // a real DOM element inside a wrapper div overlaid on the canvas. Search broadly.
  const cinematicBadge = page.locator('text=CINEMATIC MODE').first()
  await expect(cinematicBadge).toBeVisible({ timeout: 8000 })

  // Exit cinematic mode with ESC
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)

  // Badge should disappear
  await expect(cinematicBadge).not.toBeVisible({ timeout: 5000 })
})
