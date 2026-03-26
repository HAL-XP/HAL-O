/**
 * Full performance baseline — run before/after PERF tasks or major 3D changes.
 * Captures draw calls, triangles, geometries, textures across:
 *   - 3 renderers × 4 card counts (5, 15, 30, 100)
 *   - Particles NONE vs MAX
 *   - Spaceship flyby idle vs active
 *   - Camera orbit under load
 *
 * Run: npx playwright test e2e/perf-full.spec.ts --timeout=300000
 * Output: _devlog/perf/perf_YYYYMMDD.md
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const RENDERERS = ['classic', 'holographic', 'pbr-holo'] as const
const CARD_COUNTS = [5, 15, 30, 100] as const
const PARTICLE_LEVELS = [
  { id: 0, label: 'NONE' },
  { id: 4, label: 'MAX' },
] as const
const SETTLE_TIME = 4000

interface PerfStats {
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  frameBudgetMs: number
  jsHeapMB: number
  jsHeapLimitMB: number
}

interface PerfRow {
  renderer: string
  cards: number
  variant: string
  fps: number
  drawCalls: number
  triangles: string
  geometries: number
  textures: number
  frameBudgetMs: number
  jsHeapMB: number
}

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-gpu-wizard-dismissed', 'true')
    localStorage.setItem('hal-o-tutorial-done', 'true')
  })
})

test.afterAll(async () => {
  await app?.close()
})

async function collectStats(label: string): Promise<PerfRow> {
  await page.locator('.hal-topbar, canvas').first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(SETTLE_TIME)

  const stats: PerfStats | null = await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      const s = (window as any).__haloPerfStats
      if (s && s.drawCalls > 0) return s
      await new Promise(r => setTimeout(r, 100))
    }
    return (window as any).__haloPerfStats || null
  })

  const fps = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let frames = 0
      const start = performance.now()
      function count() {
        frames++
        if (performance.now() - start < 1000) {
          requestAnimationFrame(count)
        } else {
          resolve(frames)
        }
      }
      requestAnimationFrame(count)
    })
  })

  return {
    renderer: '', cards: 0, variant: label,
    fps,
    drawCalls: stats?.drawCalls ?? 0,
    triangles: stats ? `${(stats.triangles / 1000).toFixed(1)}K` : 'N/A',
    geometries: stats?.geometries ?? 0,
    textures: stats?.textures ?? 0,
    frameBudgetMs: stats?.frameBudgetMs ?? 0,
    jsHeapMB: stats?.jsHeapMB ?? 0,
  }
}

test('1. renderer × card count matrix', async () => {
  const rows: PerfRow[] = []

  for (const renderer of RENDERERS) {
    for (const cards of CARD_COUNTS) {
      await page.evaluate(({ r, c }) => {
        localStorage.setItem('hal-o-renderer', r)
        localStorage.setItem('hal-o-demo-cards', String(c))
        localStorage.setItem('hal-o-layout', 'default')
        localStorage.setItem('hal-o-3d-theme', 'tactical')
        localStorage.setItem('hal-o-particle-density', '2') // MED default
      }, { r: renderer, c: cards })
      await page.reload()

      const row = await collectStats(`${renderer}@${cards}`)
      row.renderer = renderer
      row.cards = cards
      row.variant = 'default'
      rows.push(row)
      console.log(`[PERF] ${renderer} @ ${cards}: FPS=${row.fps}, calls=${row.drawCalls}, tris=${row.triangles}`)
    }
  }

  // Save for report generation
  ;(globalThis as any).__perfRows_matrix = rows
})

test('2. particle density sweep (PBR @ 15 cards)', async () => {
  const rows: PerfRow[] = []

  for (const p of PARTICLE_LEVELS) {
    await page.evaluate(({ density }) => {
      localStorage.setItem('hal-o-renderer', 'pbr-holo')
      localStorage.setItem('hal-o-demo-cards', '15')
      localStorage.setItem('hal-o-layout', 'default')
      localStorage.setItem('hal-o-3d-theme', 'tactical')
      localStorage.setItem('hal-o-particle-density', String(density))
    }, { density: p.id })
    await page.reload()

    const row = await collectStats(`particles-${p.label}`)
    row.renderer = 'pbr-holo'
    row.cards = 15
    row.variant = `particles=${p.label}`
    rows.push(row)
    console.log(`[PERF] particles ${p.label}: FPS=${row.fps}, calls=${row.drawCalls}, tris=${row.triangles}`)
  }

  ;(globalThis as any).__perfRows_particles = rows
})

test('3. spaceship flyby cost (PBR @ 15 cards)', async () => {
  // Baseline: no flyby
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '15')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-particle-density', '2')
  })
  await page.reload()
  const idle = await collectStats('flyby-idle')
  idle.renderer = 'pbr-holo'
  idle.cards = 15
  idle.variant = 'flyby=idle'
  console.log(`[PERF] flyby idle: FPS=${idle.fps}, calls=${idle.drawCalls}, tris=${idle.triangles}`)

  // Trigger flyby by simulating a terminal open event
  await page.evaluate(() => {
    // SpaceshipFlyby listens for terminal count changes — bump it
    localStorage.setItem('hal-o-demo-terminals', '1')
  })
  await page.reload()
  await page.locator('.hal-topbar, canvas').first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000) // Let flyby trigger

  const active = await collectStats('flyby-active')
  active.renderer = 'pbr-holo'
  active.cards = 15
  active.variant = 'flyby=active'
  console.log(`[PERF] flyby active: FPS=${active.fps}, calls=${active.drawCalls}, tris=${active.triangles}`)

  ;(globalThis as any).__perfRows_flyby = [idle, active]
})

test('4. camera orbit stress (PBR @ 100 cards)', async () => {
  await page.evaluate(() => {
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-demo-cards', '100')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-particle-density', '2')
  })
  await page.reload()
  await page.locator('.hal-topbar, canvas').first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(SETTLE_TIME)

  // Measure static first
  const staticRow = await collectStats('orbit-static')
  staticRow.renderer = 'pbr-holo'
  staticRow.cards = 100
  staticRow.variant = 'camera=static'
  console.log(`[PERF] orbit static: FPS=${staticRow.fps}, calls=${staticRow.drawCalls}, tris=${staticRow.triangles}`)

  // Simulate continuous camera drag (orbit) while measuring FPS
  const orbitFps = await page.evaluate(() => {
    return new Promise<number>(async (resolve) => {
      const canvas = document.querySelector('canvas')!
      const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2
      // Simulate mouse drag in a circle
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, button: 0 }))
      let frames = 0
      const start = performance.now()
      const steps = 60
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2
        const x = cx + Math.cos(angle) * 200
        const y = cy + Math.sin(angle) * 50
        canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, button: 0 }))
        await new Promise(r => requestAnimationFrame(r))
        frames++
      }
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: cx, clientY: cy, button: 0 }))
      const elapsed = performance.now() - start
      resolve(Math.round(frames / (elapsed / 1000)))
    })
  })

  const orbitStats = await page.evaluate(() => (window as any).__haloPerfStats)
  const orbitRow: PerfRow = {
    renderer: 'pbr-holo', cards: 100, variant: 'camera=orbiting',
    fps: orbitFps,
    drawCalls: orbitStats?.drawCalls ?? 0,
    triangles: orbitStats ? `${(orbitStats.triangles / 1000).toFixed(1)}K` : 'N/A',
    geometries: orbitStats?.geometries ?? 0,
    textures: orbitStats?.textures ?? 0,
  }
  console.log(`[PERF] orbit moving: FPS=${orbitFps}, calls=${orbitRow.drawCalls}, tris=${orbitRow.triangles}`)

  ;(globalThis as any).__perfRows_orbit = [staticRow, orbitRow]
})

test('5. DPR stress — simulate weak GPU (PBR @ 30 cards)', async () => {
  const rows: PerfRow[] = []
  const DPR_LEVELS = [1, 2, 4] // 1=low-end, 2=retina, 4=stress

  for (const dpr of DPR_LEVELS) {
    await page.evaluate(({ d }) => {
      localStorage.setItem('hal-o-renderer', 'pbr-holo')
      localStorage.setItem('hal-o-demo-cards', '30')
      localStorage.setItem('hal-o-layout', 'default')
      localStorage.setItem('hal-o-particle-density', '2')
      localStorage.setItem('hal-o-dpr-override', String(d))
    }, { d: dpr })
    await page.reload()

    const row = await collectStats(`dpr=${dpr}x`)
    row.renderer = 'pbr-holo'
    row.cards = 30
    row.variant = `dpr=${dpr}x`
    rows.push(row)
    console.log(`[PERF] DPR ${dpr}x: FPS=${row.fps}, calls=${row.drawCalls}, tris=${row.triangles}, frame=${row.frameBudgetMs}ms, heap=${row.jsHeapMB}MB`)
  }

  // Clean up DPR override
  await page.evaluate(() => localStorage.removeItem('hal-o-dpr-override'))

  ;(globalThis as any).__perfRows_dpr = rows
})

test('6. write comprehensive report', async () => {
  const matrix: PerfRow[] = (globalThis as any).__perfRows_matrix || []
  const particles: PerfRow[] = (globalThis as any).__perfRows_particles || []
  const flyby: PerfRow[] = (globalThis as any).__perfRows_flyby || []
  const orbit: PerfRow[] = (globalThis as any).__perfRows_orbit || []
  const dpr: PerfRow[] = (globalThis as any).__perfRows_dpr || []

  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = [
    `# Performance Baseline — ${date}`,
    '',
    `> Auto-generated by \`e2e/perf-full.spec.ts\``,
    `> Machine: ${process.platform} | Demo mode | Default layout | Tactical style`,
    '',
    '## 1. Renderer × Card Count',
    '',
    '| Renderer | Cards | FPS | Draw Calls | Triangles | Geos | Frame ms | Heap MB |',
    '|----------|-------|-----|------------|-----------|------|----------|---------|',
  ]
  for (const r of matrix) {
    lines.push(`| ${r.renderer} | ${r.cards} | ${r.fps} | ${r.drawCalls} | ${r.triangles} | ${r.geometries} | ${r.frameBudgetMs} | ${r.jsHeapMB} |`)
  }

  lines.push('')
  lines.push('## 2. Particle Density (PBR @ 15 cards)')
  lines.push('')
  lines.push('| Density | FPS | Draw Calls | Triangles | Frame ms | Heap MB |')
  lines.push('|---------|-----|------------|-----------|----------|---------|')
  for (const r of particles) {
    lines.push(`| ${r.variant} | ${r.fps} | ${r.drawCalls} | ${r.triangles} | ${r.frameBudgetMs} | ${r.jsHeapMB} |`)
  }

  lines.push('')
  lines.push('## 3. Spaceship Flyby (PBR @ 15 cards)')
  lines.push('')
  lines.push('| State | FPS | Draw Calls | Triangles | Frame ms | Heap MB |')
  lines.push('|-------|-----|------------|-----------|----------|---------|')
  for (const r of flyby) {
    lines.push(`| ${r.variant} | ${r.fps} | ${r.drawCalls} | ${r.triangles} | ${r.frameBudgetMs} | ${r.jsHeapMB} |`)
  }

  lines.push('')
  lines.push('## 4. Camera Orbit Stress (PBR @ 100 cards)')
  lines.push('')
  lines.push('| State | FPS | Draw Calls | Triangles | Frame ms | Heap MB |')
  lines.push('|-------|-----|------------|-----------|----------|---------|')
  for (const r of orbit) {
    lines.push(`| ${r.variant} | ${r.fps} | ${r.drawCalls} | ${r.triangles} | ${r.frameBudgetMs} | ${r.jsHeapMB} |`)
  }

  lines.push('')
  lines.push('## 5. DPR Stress — Weak GPU Simulation (PBR @ 30 cards)')
  lines.push('')
  lines.push('| DPR | FPS | Draw Calls | Triangles | Frame ms | Heap MB |')
  lines.push('|-----|-----|------------|-----------|----------|---------|')
  for (const r of dpr) {
    lines.push(`| ${r.variant} | ${r.fps} | ${r.drawCalls} | ${r.triangles} | ${r.frameBudgetMs} | ${r.jsHeapMB} |`)
  }

  lines.push('')
  lines.push('## Notes')
  lines.push('- FPS measured via requestAnimationFrame over 1 second (vsync-capped at 60)')
  lines.push('- Draw calls / triangles from renderer.info (autoReset=false, manual reset per frame)')
  lines.push('- DPR 1x = low-end laptop, 2x = retina/HiDPI, 4x = stress test (~4K internal at 1080p)')
  lines.push('- Demo mode: no real IPC calls — isolates pure rendering cost')
  lines.push('- For IPC cost (PERF3), run with real projects (non-demo mode)')
  lines.push('- Camera shake removed from spaceship flyby')
  lines.push('')

  const dir = join(process.cwd(), '_devlog', 'perf')
  mkdirSync(dir, { recursive: true })
  const outPath = join(dir, `perf_${date.replace(/-/g, '')}.md`)
  writeFileSync(outPath, lines.join('\n'), 'utf-8')
  console.log(`[PERF] Report written to ${outPath}`)
})
