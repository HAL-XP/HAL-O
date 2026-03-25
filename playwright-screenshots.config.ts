/**
 * Playwright config for screenshot capture tests.
 * The main playwright.config.ts excludes screenshot-*.spec.ts from default runs.
 * Use this config to run them:
 *   npx playwright test --config playwright-screenshots.config.ts e2e/screenshot-marketing-v2.spec.ts
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  use: {
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'electron',
      use: {},
    },
  ],
})
