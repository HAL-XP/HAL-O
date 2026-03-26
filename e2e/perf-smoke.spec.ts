/**
 * Performance smoke test — run often, ~30s.
 * Catches regressions fast with minimal combos.
 *
 * Run: npx playwright test e2e/perf-smoke.spec.ts
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-gpu-wizard-dismissed', 'true')
    localStorage.setItem('hal-o-tutorial-done', 'true')
    localStorage.setItem('hal-o-3d-theme', 'tactical')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-particle-density', '2')
  })
})

test.afterAll(async () => {
  await app?.close()
})

async function measure(label: string) {
  await page.locator('.hal-topbar, canvas').first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(3000)

  const stats = await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      const s = (window as any).__haloPerfStats
      if (s && s.drawCalls > 0) return s
      await new Promise(r => setTimeout(r, 100))
    }
    return (window as any).__haloPerfStats || null
  })

  const fps = await page.evaluate(() => new Promise<number>(resolve => {
    let frames = 0; const start = performance.now()
    function count() { frames++; performance.now() - start < 1000 ? requestAnimationFrame(count) : resolve(frames) }
    requestAnimationFrame(count)
  }))

  const tris = stats ? `${(stats.triangles / 1000).toFixed(1)}K` : 'N/A'
  console.log(`[SMOKE] ${label}: FPS=${fps} | calls=${stats?.drawCalls ?? 0} | tris=${tris} | geos=${stats?.geometries ?? 0}`)
}

test('PBR @ 15 cards (default)', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '15')
  })
  await page.reload()
  await measure('pbr@15')
})

test('PBR @ 100 cards (stress)', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '100')
  })
  await page.reload()
  await measure('pbr@100')
})

test('Classic @ 15 cards (sanity)', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'classic')
    localStorage.setItem('hal-o-demo-cards', '15')
  })
  await page.reload()
  await measure('classic@15')
})
