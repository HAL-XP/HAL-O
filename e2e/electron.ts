import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { resolve, join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

const ROOT = resolve(__dirname, '..')

/** CI runners are very slow — use generous timeouts */
export const CI_TIMEOUT = process.env.CI ? 45_000 : 15_000

/**
 * Each launchApp() call gets a unique user-data directory.
 * This prevents LevelDB lock contention when Playwright runs multiple
 * test files in parallel (2+ workers), which was the root cause of
 * "elements never appear" failures on CI.
 */
function uniqueUserDataDir(): string {
  return join(tmpdir(), `hal-o-test-${randomBytes(4).toString('hex')}`)
}

/** Launch the built Electron app and return the app + first window */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const isCI = !!process.env.CI
  const app = await electron.launch({
    args: [
      resolve(ROOT, 'out/main/index.js'),
      `--user-data-dir=${uniqueUserDataDir()}`,
      // GitHub Actions runners require --no-sandbox for Electron.
      // --disable-gpu avoids WebGL issues on headless xvfb / CI runners.
      ...(isCI ? ['--no-sandbox', '--disable-gpu-sandbox', '--disable-gpu'] : []),
    ],
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })

  const page = await app.firstWindow()

  // Capture console messages for CI diagnostics
  if (isCI) {
    page.on('console', (msg) => {
      const type = msg.type()
      if (type === 'error' || type === 'warning') {
        console.log(`[electron:${type}] ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => {
      console.log(`[electron:pageerror] ${err.message}`)
    })
  }

  // Wait for the renderer to fully mount (HTML loaded, scripts executing)
  await page.waitForLoadState('domcontentloaded')
  // Also wait for network idle — ensures IPC bridge is established
  await page.waitForLoadState('load').catch(() => {})

  // Wait for the app to exit the "loading" state and render actual content.
  // On CI, the IPC calls (readContinuation, checkPrerequisites) can be very slow,
  // so the app may stay in loading mode for 10-20s before showing setup or hub.
  // The App.tsx has a 15s safety timer that forces exit from loading if IPC hangs.
  const appReady = page.locator('.setup-screen, .hal-topbar, canvas, .project-hub, .chat-area').first()
  await appReady.waitFor({ state: 'attached', timeout: CI_TIMEOUT }).catch(async () => {
    // Diagnostic: dump what actually rendered so we can debug CI failures
    if (isCI) {
      const html = await page.evaluate(() => document.body?.innerHTML?.substring(0, 500) || '(empty)').catch(() => '(eval failed)')
      console.log(`[electron:diag] App did not render expected elements. Body HTML: ${html}`)
    }
  })

  return { app, page }
}
