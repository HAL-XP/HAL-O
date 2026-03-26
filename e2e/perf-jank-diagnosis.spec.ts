/**
 * Perf Jank Diagnosis — automated capture of frame drops, long tasks, GC.
 *
 * Run: npx playwright test e2e/perf-jank-diagnosis.spec.ts --timeout=120000
 * Needs the temp playwright config (perf tests are ignored by default).
 *
 * Captures:
 * - 5s of idle (baseline frame drops)
 * - 5s of orbit drag (stress frame drops)
 * - 5s of settings open/close (React re-render stress)
 * - Long task count and durations
 */
import { test, expect } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-gpu-wizard-dismissed', 'true')
    localStorage.setItem('hal-o-tutorial-done', 'true')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '30')
  })
  await page.reload()
  await page.waitForTimeout(4000) // Wait for scene
})

test.afterAll(async () => {
  await app?.close()
})

test('diagnose jank sources', async () => {
  // Start perf logger
  await page.evaluate(() => {
    ;(window as any).__haloPerfLog?.start()
  })

  // Phase 1: Idle baseline (5s)
  console.log('[JANK] Phase 1: Idle baseline...')
  await page.waitForTimeout(5000)

  // Phase 2: Orbit drag stress (5s)
  console.log('[JANK] Phase 2: Orbit drag stress...')
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let i = 0; i < 150; i++) {
      const angle = (i / 150) * Math.PI * 4
      const x = cx + Math.cos(angle) * 200
      const y = cy + Math.sin(angle) * 30
      await page.mouse.move(x, y)
      await page.waitForTimeout(33) // ~30fps mouse moves
    }
    await page.mouse.up()
  }

  // Phase 3: Wait for damping settle
  console.log('[JANK] Phase 3: Settling...')
  await page.waitForTimeout(2000)

  // Phase 4: Settings open/close stress (toggle 5 times)
  console.log('[JANK] Phase 4: Settings toggle stress...')
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('hal-open-settings')))
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }

  // Collect results
  const results = await page.evaluate(() => {
    const log = (window as any).__haloPerfLog
    if (!log) return null
    log.dump()
    const entries = log.entries as any[]
    const frames = entries.filter((e: any) => e.type === 'frame')
    const longTasks = entries.filter((e: any) => e.type === 'long-task')
    return {
      droppedFrames: frames.length,
      avgFrameMs: frames.length ? frames.reduce((s: number, e: any) => s + e.ms, 0) / frames.length : 0,
      maxFrameMs: frames.length ? Math.max(...frames.map((e: any) => e.ms)) : 0,
      longTaskCount: longTasks.length,
      longTaskMaxMs: longTasks.length ? Math.max(...longTasks.map((e: any) => e.ms)) : 0,
      longTasks: longTasks.slice(0, 20).map((e: any) => ({ ms: e.ms, detail: e.detail, ts: e.ts })),
      totalEntries: entries.length,
    }
  })

  if (results) {
    console.log(`
=== JANK DIAGNOSIS RESULTS ===
Dropped frames (>20ms): ${results.droppedFrames}
  Avg: ${results.avgFrameMs.toFixed(1)}ms
  Max: ${results.maxFrameMs.toFixed(1)}ms

Long tasks (>50ms): ${results.longTaskCount}
  Max: ${results.longTaskMaxMs.toFixed(0)}ms
${results.longTasks.map((t: any) => `  ${t.ms.toFixed(0)}ms — ${t.detail}`).join('\n')}

Total entries: ${results.totalEntries}
==============================
`)

    // Save to file
    writeFileSync(
      resolve(__dirname, '../_devlog/perf/jank-diagnosis.json'),
      JSON.stringify(results, null, 2)
    )
    console.log('[JANK] Results saved to _devlog/perf/jank-diagnosis.json')
  }

  // Stop logger
  await page.evaluate(() => (window as any).__haloPerfLog?.stop())
})
