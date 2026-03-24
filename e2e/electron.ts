import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { resolve, join } from 'path'
import { tmpdir } from 'os'

const ROOT = resolve(__dirname, '..')

/**
 * Isolated user-data directory for tests.
 * Prevents Playwright tests from polluting the real app's localStorage / settings.
 */
const TEST_USER_DATA_DIR = join(tmpdir(), 'hal-o-test-data')

/** Launch the built Electron app and return the app + first window */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const isCI = !!process.env.CI
  const app = await electron.launch({
    args: [
      resolve(ROOT, 'out/main/index.js'),
      // Isolate test localStorage / userData from the real app (B33)
      `--user-data-dir=${TEST_USER_DATA_DIR}`,
      // GitHub Actions runners require --no-sandbox for Electron
      ...(isCI ? ['--no-sandbox', '--disable-gpu-sandbox'] : []),
    ],
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })

  const page = await app.firstWindow()
  // Wait for the renderer to fully mount
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
