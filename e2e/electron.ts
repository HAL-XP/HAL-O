import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { resolve, join } from 'path'
import { tmpdir } from 'os'

const ROOT = resolve(__dirname, '..')

/**
 * Isolated user-data directory for tests.
 * Prevents Playwright tests from polluting the real app's localStorage / settings.
 */
const TEST_USER_DATA_DIR = join(tmpdir(), 'hal-o-test-data')

/** CI runners are very slow — use generous timeouts */
export const CI_TIMEOUT = process.env.CI ? 45_000 : 15_000

/** Launch the built Electron app and return the app + first window */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const isCI = !!process.env.CI
  const app = await electron.launch({
    args: [
      resolve(ROOT, 'out/main/index.js'),
      // Isolate test localStorage / userData from the real app (B33)
      `--user-data-dir=${TEST_USER_DATA_DIR}`,
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
  // Wait for the renderer to fully mount (HTML loaded, scripts executing)
  await page.waitForLoadState('domcontentloaded')
  // Also wait for network idle — ensures IPC bridge is established
  await page.waitForLoadState('load').catch(() => {})

  // Wait for the app to exit the "loading" state and render actual content.
  // On CI, the IPC calls (readContinuation, checkPrerequisites) can be very slow,
  // so the app may stay in loading mode for 10-20s before showing setup or hub.
  // The App.tsx has a 15s safety timer that forces exit from loading if IPC hangs.
  const appReady = page.locator('.setup-screen, .hal-topbar, canvas, .project-hub, .chat-area').first()
  await appReady.waitFor({ state: 'attached', timeout: CI_TIMEOUT }).catch(() => {
    // Don't throw here — individual tests will handle their own assertions.
    // This is a best-effort wait to give the app time to boot.
  })

  return { app, page }
}
