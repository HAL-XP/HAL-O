import { defineConfig } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  // CI runners are slower — give tests generous time.
  // Individual tests can still set tighter timeouts where appropriate.
  timeout: isCI ? 90_000 : 30_000,
  // Default expect timeout — CI runners need more time for element waits
  expect: {
    timeout: isCI ? 45_000 : 10_000,
  },
  // One retry on CI to absorb transient timing flakes; none locally
  retries: isCI ? 1 : 0,
  // Exclude local-only test files from default runs:
  //   perf-*.spec.ts   — manual profiling, needs local GPU/high-res display
  //   screenshot-*.spec.ts — capture reference screenshots, not assertions
  //   visual-qa.spec.ts — cinematic frame capture for human review
  testIgnore: [
    '**/perf-*.spec.ts',
    '**/screenshot-*.spec.ts',
    '**/visual-qa.spec.ts',
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'off',
  },
  projects: [
    {
      name: 'electron',
      use: {},
    },
  ],
})
