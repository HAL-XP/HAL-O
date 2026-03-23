import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')

/** Launch the built Electron app and return the app + first window */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const isCI = !!process.env.CI
  const app = await electron.launch({
    args: [
      resolve(ROOT, 'out/main/index.js'),
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
