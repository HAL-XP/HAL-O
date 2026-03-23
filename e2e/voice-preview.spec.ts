import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())

  // Wait for hub to render
  const hub = page.locator('.project-hub, .hal-topbar, canvas').first()
  await expect(hub).toBeVisible({ timeout: 10000 })

  // If setup screen shows, click through it first
  const setupScreen = page.locator('.setup-screen')
  const isSetup = await setupScreen.isVisible({ timeout: 3000 }).catch(() => false)
  if (isSetup) {
    const continueBtn = page.locator('.create-btn, .submit-btn').first()
    await continueBtn.click()
    await page.waitForTimeout(1000)
  }
})

test.afterAll(async () => {
  await app?.close()
})

test('settings panel opens when gear icon is clicked', async () => {
  // Click the settings gear button (use title="Settings" to disambiguate from other .hal-settings-btn elements)
  const settingsBtn = page.locator('button[title="Settings"]')
  await expect(settingsBtn).toBeVisible({ timeout: 5000 })
  await settingsBtn.click()

  // Settings panel should be visible
  const settingsPanel = page.locator('.hal-settings-panel')
  await expect(settingsPanel).toBeVisible({ timeout: 3000 })
})

test('voice profile selector is present in settings', async () => {
  // Ensure settings is open
  const settingsPanel = page.locator('.hal-settings-panel')
  if (!(await settingsPanel.isVisible().catch(() => false))) {
    await page.locator('button[title="Settings"]').click()
    await expect(settingsPanel).toBeVisible({ timeout: 3000 })
  }

  // Check that VOICE PROFILE label exists
  const voiceLabel = settingsPanel.locator('.hal-settings-label', { hasText: 'VOICE PROFILE' })
  await expect(voiceLabel).toBeVisible()

  // Check that the preview button exists
  const previewBtn = settingsPanel.locator('.hal-settings-preview-btn').first()
  await expect(previewBtn).toBeVisible()
})

test('voice preview button triggers voiceSpeak IPC without crashing', async () => {
  // Ensure settings is open
  const settingsPanel = page.locator('.hal-settings-panel')
  if (!(await settingsPanel.isVisible().catch(() => false))) {
    await page.locator('button[title="Settings"]').click()
    await expect(settingsPanel).toBeVisible({ timeout: 3000 })
  }

  // Collect console errors during the test
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => {
    errors.push(err.message)
  })

  // Click the voice preview play button
  const previewBtn = settingsPanel.locator('.hal-settings-preview-btn').first()
  await expect(previewBtn).toBeEnabled()
  await previewBtn.click()

  // The button should show "..." while generating (or return quickly if TTS unavailable)
  // Wait a moment for IPC round-trip
  await page.waitForTimeout(2000)

  // Verify no renderer crash -- page should still be alive
  const title = await page.title()
  expect(title).toBeTruthy()

  // Verify no file:// protocol errors (the bug we fixed)
  const fileProtocolErrors = errors.filter((e) =>
    e.includes('file://') || e.includes('Not allowed to load local resource')
  )
  expect(fileProtocolErrors).toHaveLength(0)
})

test('voice IPC returns proper audioDataUrl structure', async () => {
  // Directly test the IPC call via evaluate in the renderer context
  const result = await page.evaluate(async () => {
    try {
      const res = await (window as any).api.voiceSpeak('Test', 'narrator', 'en')
      return {
        success: res.success,
        hasAudioDataUrl: !!res.audioDataUrl,
        audioDataUrlPrefix: res.audioDataUrl ? res.audioDataUrl.substring(0, 30) : null,
        hasAudioPath: !!res.audioPath,
        error: res.error || null,
      }
    } catch (err: any) {
      return { success: false, error: err.message, hasAudioDataUrl: false, hasAudioPath: false, audioDataUrlPrefix: null }
    }
  })

  // If TTS is available, it should return a base64 data URL
  if (result.success) {
    expect(result.hasAudioDataUrl).toBe(true)
    expect(result.audioDataUrlPrefix).toMatch(/^data:audio\/ogg;base64,/)
  }
  // If TTS isn't available (no Python/TTS installed), we just verify no crash
  // error is null on success, so guard before checking content
  if (result.error) {
    expect(result.error).not.toContain('file://')
  }
})
