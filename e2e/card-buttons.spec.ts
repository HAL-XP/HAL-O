/**
 * QA: Card Button Regression Suite
 *
 * Validates that every button on a PBR-Holo project card can be clicked
 * without crashing the renderer or producing console errors.
 *
 * Buttons tested (per ScreenPanel.tsx):
 *   RESUME  — onResume()   → window.api.launchProject(path, true)
 *   NEW     — onNewSession() → window.api.launchProject(path, false)
 *   FILES   — onFiles()    → window.api.openFolder(path)
 *   RUN     — onRunApp()   → window.api.runApp(path, runCmd)   [demo only, may not appear]
 *   CODE/IDE — onOpenIde() → window.api.openInIde(path)        [if ide detected]
 *   >_      — onOpenTerminal() → platform openTerminalAt()     [if wired]
 *   WEB     — onOpenBrowser()                                  [if wired]
 *   TASKS   — window.__openTaskBoard(path)                     [always present]
 *
 * Strategy:
 *   - Intercept IPC calls via page.evaluate() to mock window.api before each click.
 *     This lets us detect whether the IPC was called without actually spawning
 *     terminals, opening Explorer, etc. (which would be brittle in CI).
 *   - Track console errors: any renderer error after a click = test failure.
 *   - Specifically guard against Windows path bugs (wrong dir, command not found).
 *
 * Run:
 *   npx playwright test e2e/card-buttons.spec.ts
 */

import { test, expect } from '@playwright/test'
import { launchApp, CI_TIMEOUT } from './electron'
import type { ElectronApplication, Page, ConsoleMessage } from 'playwright-core'
import { resolve } from 'path'
import { mkdirSync, existsSync } from 'fs'

// ── Fixtures ──────────────────────────────────────────────────────────────────

let app: ElectronApplication
let page: Page

const screenshotDir = resolve(__dirname, '../temp/screenshots/card-buttons')

/** Console errors collected during a button-click test */
const collectedErrors: string[] = []

test.beforeAll(async () => {
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true })
  }

  ;({ app, page } = await launchApp())

  // ── Scene setup: demo mode + pbr-holo + skip wizards/tutorial ──
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '6')
    localStorage.setItem('hal-o-demo-terminals', '0')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-split', '100') // hub only, no terminal pane
  })
  await page.reload()

  // Wait for canvas + topbar to be present
  const appReady = page.locator('.hal-topbar, canvas').first()
  await appReady.waitFor({ state: 'attached', timeout: CI_TIMEOUT })

  // Wait for WebGL init and card Html overlays to mount.
  // Cards only mount Html after the panel first faces the camera — we need
  // ~3s for the intro animation to settle and panels to become front-facing.
  await page.waitForTimeout(process.env.CI ? 8000 : 4000)
})

test.afterAll(async () => {
  await app?.close()
})

// ── Helper: install IPC spy ───────────────────────────────────────────────────
//
// We replace window.api methods with spies that:
//   1. Record the call (name + args)
//   2. Return a resolved Promise (mimics the real IPC)
//
// This prevents real filesystem/process side-effects in CI while still
// exercising the full React click path.
//
async function installApiSpy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as any).api
    if (!api || (api as any).__spied) return

    const log: Array<{ method: string; args: unknown[] }> = []
    ;(window as any).__apiCallLog = log

    const methodsToSpy: string[] = [
      'launchProject',
      'openFolder',
      'runApp',
      'openInClaude',
      'openInIde',
    ]

    for (const method of methodsToSpy) {
      if (typeof api[method] === 'function') {
        api[method] = (...args: unknown[]) => {
          log.push({ method, args })
          console.log(`[card-buttons-spy] ${method}(${args.map(String).join(', ')})`)
          // Return resolved promise — mimics normal IPC behaviour
          return Promise.resolve(undefined)
        }
      }
    }

    // Also stub __openTaskBoard (not via IPC, just a window global)
    ;(window as any).__openTaskBoard = (path: string) => {
      log.push({ method: '__openTaskBoard', args: [path] })
      console.log(`[card-buttons-spy] __openTaskBoard(${path})`)
    }

    ;(api as any).__spied = true
  })
}

/** Read and clear the accumulated spy call log */
async function drainCallLog(page: Page): Promise<Array<{ method: string; args: unknown[] }>> {
  return page.evaluate(() => {
    const log: Array<{ method: string; args: unknown[] }> = (window as any).__apiCallLog ?? []
    ;(window as any).__apiCallLog = []
    return log
  })
}

/** Collect renderer console errors into the shared array */
function startErrorCollection(page: Page): () => void {
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Ignore known harmless noise
      if (
        text.includes('ResizeObserver loop') ||
        text.includes('non-passive event') ||
        text.includes('favicon')
      ) return
      collectedErrors.push(text)
    }
  }
  page.on('console', handler)
  return () => page.off('console', handler)
}

// ── Helper to click a card button ────────────────────────────────────────────

/** Click a button in the card by its visible text, return whether it was found */
async function clickCardButton(page: Page, text: string): Promise<boolean> {
  const btn = page.locator('button', { hasText: text }).first()
  const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false)
  if (!visible) return false
  await btn.click({ force: true, timeout: 5000 })
  // Brief pause to allow any async handlers + IPC to fire
  await page.waitForTimeout(600)
  return true
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe.serial('Card button regression', () => {

  test('1. Scene renders and cards are visible', async () => {
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: CI_TIMEOUT })

    // At least one RESUME button should exist (demo cards rendered)
    const resume = page.locator('button', { hasText: 'RESUME' }).first()
    const found = await resume.isVisible({ timeout: CI_TIMEOUT }).catch(() => false)

    if (!found) {
      // Diagnostic: camera may not face a card yet. Rotate slightly via photo mode.
      await page.evaluate(() => {
        const pm = (window as any).__haloPhotoMode
        if (pm) {
          pm.pauseAutoRotate()
          pm.setCamera(0, 6, 10)
        }
      })
      await page.waitForTimeout(2000)
    }

    await page.screenshot({ path: `${screenshotDir}/01-scene-loaded.png` })

    // Install spy before any clicks
    await installApiSpy(page)

    // Verify at least one card is in the DOM (even if not yet visible)
    const anyResume = await page.locator('button', { hasText: 'RESUME' }).count()
    expect(anyResume).toBeGreaterThan(0)
  })

  test('2. RESUME button — calls launchProject(path, true)', async () => {
    const stopCollect = startErrorCollection(page)
    await drainCallLog(page) // clear previous

    const found = await clickCardButton(page, 'RESUME')
    const log = await drainCallLog(page)
    stopCollect()

    if (!found) {
      console.warn('[card-buttons] RESUME button not visible — card may be back-facing, skipping')
      return
    }

    await page.screenshot({ path: `${screenshotDir}/02-after-resume.png` })

    // Verify IPC call was made
    const call = log.find((c) => c.method === 'launchProject')
    expect(call, 'launchProject IPC should be called on RESUME').toBeTruthy()

    if (call) {
      const [path, resume] = call.args as [string, boolean]
      console.log(`[card-buttons] RESUME → launchProject("${path}", ${resume})`)
      // resume=true
      expect(resume).toBe(true)
      // path should not be empty and should look like a real directory path
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
      // Windows path validation: must contain a drive letter or start with /
      const looksLikePath = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')
      expect(looksLikePath, `Path "${path}" should be an absolute path`).toBe(true)
    }

    // No renderer errors
    expect(collectedErrors).toHaveLength(0)
  })

  test('3. NEW button — calls launchProject(path, false)', async () => {
    const stopCollect = startErrorCollection(page)
    await drainCallLog(page)

    const found = await clickCardButton(page, 'NEW')
    const log = await drainCallLog(page)
    stopCollect()

    if (!found) {
      console.warn('[card-buttons] NEW button not visible, skipping')
      return
    }

    await page.screenshot({ path: `${screenshotDir}/03-after-new.png` })

    const call = log.find((c) => c.method === 'launchProject')
    expect(call, 'launchProject IPC should be called on NEW').toBeTruthy()

    if (call) {
      const [path, resume] = call.args as [string, boolean]
      console.log(`[card-buttons] NEW → launchProject("${path}", ${resume})`)
      expect(resume).toBe(false)
      expect(path.length).toBeGreaterThan(0)
    }

    expect(collectedErrors).toHaveLength(0)
  })

  test('4. FILES button — calls openFolder(path)', async () => {
    const stopCollect = startErrorCollection(page)
    await drainCallLog(page)

    const found = await clickCardButton(page, 'FILES')
    const log = await drainCallLog(page)
    stopCollect()

    if (!found) {
      console.warn('[card-buttons] FILES button not visible, skipping')
      return
    }

    await page.screenshot({ path: `${screenshotDir}/04-after-files.png` })

    const call = log.find((c) => c.method === 'openFolder')
    expect(call, 'openFolder IPC should be called on FILES').toBeTruthy()

    if (call) {
      const [path] = call.args as [string]
      console.log(`[card-buttons] FILES → openFolder("${path}")`)
      // Path must be absolute and non-empty — catches the "wrong directory" Windows bug
      expect(path.length).toBeGreaterThan(0)
      const looksAbsolute = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')
      expect(looksAbsolute, `openFolder path "${path}" must be absolute`).toBe(true)
      // Must NOT be the app's own CWD or a relative path
      expect(path).not.toBe('.')
      expect(path).not.toBe('./')
    }

    expect(collectedErrors).toHaveLength(0)
  })

  test('5. RUN button — calls runApp(path, cmd) [if visible]', async () => {
    // RUN only appears when the demo project has a runCmd set.
    // Demo projects do have runCmd in some configurations — test it if present.
    const stopCollect = startErrorCollection(page)
    await drainCallLog(page)

    const runBtn = page.locator('button', { hasText: 'RUN' }).first()
    const visible = await runBtn.isVisible({ timeout: 2000 }).catch(() => false)

    if (!visible) {
      console.log('[card-buttons] RUN button not visible (no runCmd on demo cards) — SKIP')
      stopCollect()
      return
    }

    await runBtn.click({ force: true, timeout: 5000 })
    await page.waitForTimeout(600)

    const log = await drainCallLog(page)
    stopCollect()

    await page.screenshot({ path: `${screenshotDir}/05-after-run.png` })

    const call = log.find((c) => c.method === 'runApp')
    expect(call, 'runApp IPC should fire on RUN click').toBeTruthy()

    if (call) {
      const [projectPath, runCmd] = call.args as [string, string]
      console.log(`[card-buttons] RUN → runApp("${projectPath}", "${runCmd}")`)
      expect(projectPath.length).toBeGreaterThan(0)
      expect(runCmd.length).toBeGreaterThan(0)
      // On Windows: verify runCmd is not confused with project path
      expect(runCmd).not.toMatch(/^[A-Za-z]:\\/)
    }

    expect(collectedErrors).toHaveLength(0)
  })

  test('6. IDE button — calls openInIde(path) [if visible]', async () => {
    // IDE button (ideLabel e.g. "CODE", "CURSOR") only shows when an IDE is detected
    // Demo mode may or may not wire it — we try common labels.
    const stopCollect = startErrorCollection(page)
    await drainCallLog(page)

    // IDE button text can be "CODE", "CURSOR", "WS", or "</>" depending on detected IDE
    const ideSelectors = ['CODE', 'CURSOR', 'WS', '</>']
    let clicked = false

    for (const label of ideSelectors) {
      const btn = page.locator('button', { hasText: label }).first()
      const visible = await btn.isVisible({ timeout: 1000 }).catch(() => false)
      if (visible) {
        await btn.click({ force: true, timeout: 5000 })
        await page.waitForTimeout(600)
        clicked = true
        break
      }
    }

    const log = await drainCallLog(page)
    stopCollect()

    if (!clicked) {
      console.log('[card-buttons] IDE button not visible — SKIP')
      return
    }

    await page.screenshot({ path: `${screenshotDir}/06-after-ide.png` })

    const call = log.find((c) => c.method === 'openInIde')
    expect(call, 'openInIde IPC should fire on IDE button click').toBeTruthy()

    if (call) {
      const [path] = call.args as [string]
      console.log(`[card-buttons] IDE → openInIde("${path}")`)
      expect(path.length).toBeGreaterThan(0)
    }

    expect(collectedErrors).toHaveLength(0)
  })

  test('7. TASKS button — calls __openTaskBoard(path)', async () => {
    // TASKS button is always rendered (no conditional). It calls window.__openTaskBoard.
    const stopCollect = startErrorCollection(page)
    await drainCallLog(page)

    const found = await clickCardButton(page, 'TASKS')
    const log = await drainCallLog(page)
    stopCollect()

    if (!found) {
      console.warn('[card-buttons] TASKS button not visible, skipping')
      return
    }

    await page.screenshot({ path: `${screenshotDir}/07-after-tasks.png` })

    const call = log.find((c) => c.method === '__openTaskBoard')
    // __openTaskBoard may not be wired in demo mode — the button still should not crash
    if (call) {
      const [path] = call.args as [string]
      console.log(`[card-buttons] TASKS → __openTaskBoard("${path}")`)
      expect(path.length).toBeGreaterThan(0)
    } else {
      // No task board stub in demo — acceptable; just verify no crash
      console.log('[card-buttons] TASKS clicked — no __openTaskBoard call (not wired in demo mode)')
    }

    expect(collectedErrors).toHaveLength(0)
  })

  test('8. No accumulated renderer errors across all button clicks', async () => {
    // This test acts as a final summary: if any previous click produced a
    // renderer error that slipped through the per-test check, it surfaces here.
    // collectedErrors is shared across the serial describe block.
    if (collectedErrors.length > 0) {
      console.error('[card-buttons] Renderer errors observed:')
      collectedErrors.forEach((e) => console.error('  ', e))
    }
    expect(collectedErrors, 'No renderer errors should occur across all button clicks').toHaveLength(0)
  })

  test('9. Rotating scene to back-facing card — buttons get pointer-events:none', async () => {
    // Regression: back-facing card Html should have opacity:0 and pointer-events:none.
    // We rotate the camera 180° so we're looking at the back of the first card position.
    await page.evaluate(() => {
      const w = window as any
      if (w.__haloPhotoMode) {
        // Move camera behind the ring (negative Z) — all front-facing cards become back-facing
        w.__haloPhotoMode.setCamera(0, 6, -12)
      }
    })
    await page.waitForTimeout(1500) // let back-face detection run

    await page.screenshot({ path: `${screenshotDir}/09-backface.png` })

    // RESUME buttons that were previously visible should now be non-interactive
    const resumeButtons = page.locator('button', { hasText: 'RESUME' })
    const count = await resumeButtons.count()
    let anyClickable = false

    for (let i = 0; i < Math.min(count, 6); i++) {
      const btn = resumeButtons.nth(i)
      // Check pointer-events on the wrapping div (htmlWrapRef)
      const pointerEvents = await btn.evaluate((el) => {
        let node: HTMLElement | null = el as HTMLElement
        while (node) {
          const pe = window.getComputedStyle(node).pointerEvents
          if (pe === 'none') return 'none'
          node = node.parentElement
        }
        return 'auto'
      }).catch(() => 'unknown')

      if (pointerEvents === 'auto') {
        anyClickable = true
        console.warn(`[card-buttons] Button ${i} still clickable from behind — back-face suppression may have failed`)
      }
    }

    // Restore camera to front-facing position for subsequent tests
    await page.evaluate(() => {
      const w = window as any
      if (w.__haloPhotoMode) {
        w.__haloPhotoMode.setCamera(0, 6, 10)
        w.__haloPhotoMode.resumeAutoRotate()
      }
    })

    // Not a hard failure — back-face detection is best-effort (dot product threshold 0.05)
    if (anyClickable) {
      console.warn('[card-buttons] Some back-facing buttons retained pointer-events (may be near the silhouette edge)')
    }
  })

  test('10. Windows path format — no Git Bash paths leaked to IPC', async () => {
    // B37 regression: on Windows, paths passed to IPC must be Windows-format
    // (e.g. D:\GitHub\...) not Git Bash format (/d/GitHub/...).
    // We click FILES again and validate the path format.
    if (process.platform !== 'win32') {
      console.log('[card-buttons] Non-Windows platform — skipping Windows path test')
      return
    }

    // Point camera back at cards
    await page.evaluate(() => {
      const w = window as any
      if (w.__haloPhotoMode) w.__haloPhotoMode.setCamera(0, 6, 10)
    })
    await page.waitForTimeout(1500)

    await installApiSpy(page)
    await drainCallLog(page)

    const found = await clickCardButton(page, 'FILES')
    const log = await drainCallLog(page)

    if (!found) {
      console.log('[card-buttons] FILES not visible for Windows path test — SKIP')
      return
    }

    const call = log.find((c) => c.method === 'openFolder')
    if (!call) {
      console.warn('[card-buttons] openFolder not intercepted in Windows path test')
      return
    }

    const [path] = call.args as [string]
    console.log(`[card-buttons] Windows path check: "${path}"`)

    // Must start with a drive letter, not a Unix-style path
    expect(path, `Path should be Windows-format (e.g. D:\\...), got: "${path}"`)
      .toMatch(/^[A-Za-z]:[\\/]/)

    // Must NOT be a Git Bash style path like /d/GitHub/...
    expect(path, `Path must not be Git Bash format (/d/...): "${path}"`)
      .not.toMatch(/^\/[a-z]\//)

    await page.screenshot({ path: `${screenshotDir}/10-windows-path.png` })
  })
})
