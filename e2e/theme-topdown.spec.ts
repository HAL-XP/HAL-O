/**
 * Theme & Sphere Screenshots — Top-down + Close-up Camera Angles.
 *
 * Set 1: 16 theme combos (3D style × color accent) from TOP-DOWN camera
 *   Camera: [0, 25, 0.1] — directly above, looking down at ring platform
 *   Result: Bird's-eye view of entire scene with all cards visible
 *   Demo mode, 40 cards, activity 100, hal-eye sphere
 *
 * Set 2: 8 sphere styles from CLOSE-UP camera
 *   Camera: [0, 2, 6] — intimate angle, slightly above, sphere fills frame
 *   Result: Detailed sphere rendering comparison
 *   Theme fixed: tactical+cyan, sphere style varies
 *
 * Base setup (same for all):
 *   Demo mode, auto-rotate ON at 0.24, 1920x1080, fullscreen
 *   Wait 5s after reload for scene to render
 *   Screenshot at 1920x1080 via page.screenshot()
 *
 * Output:
 *   temp/themes-topdown/   — 16 theme screenshots (NN-style-color.jpg)
 *   temp/sphere-styles/    — 8 sphere style screenshots (NN-stylename.jpg)
 *
 * Run:
 *   npx playwright test e2e/theme-topdown.spec.ts --timeout 600000
 */
import { test } from '@playwright/test'
import { launchApp } from './electron'
import type { ElectronApplication, Page } from 'playwright-core'
import { resolve } from 'path'
import { mkdirSync } from 'fs'

const ROOT = resolve(__dirname, '..')
const OUT_THEMES = resolve(ROOT, 'temp', 'themes-topdown')
const OUT_SPHERE = resolve(ROOT, 'temp', 'sphere-styles')

// Ensure output directories exist
mkdirSync(OUT_THEMES, { recursive: true })
mkdirSync(OUT_SPHERE, { recursive: true })

let app: ElectronApplication
let page: Page

test.setTimeout(600_000)

// The 16 theme combinations: [NN, styleId, colorId, label]
const THEME_COMBOS: [number, string, string, string][] = [
  [1,  'tactical',    'cyan',     'tactical-cyan'],
  [2,  'tactical',    'ruby',     'tactical-ruby'],
  [3,  'holographic', 'cyan',     'holographic-cyan'],
  [4,  'holographic', 'amethyst', 'holographic-amethyst'],
  [5,  'neon',        'cyan',     'neon-cyan'],
  [6,  'neon',        'emerald',  'neon-emerald'],
  [7,  'neon',        'amber',    'neon-amber'],
  [8,  'minimal',     'cyan',     'minimal-cyan'],
  [9,  'minimal',     'slate',    'minimal-slate'],
  [10, 'ember',       'ruby',     'ember-ruby'],
  [11, 'ember',       'sunset',   'ember-sunset'],
  [12, 'ember',       'coral',    'ember-coral'],
  [13, 'arctic',      'cyan',     'arctic-cyan'],
  [14, 'arctic',      'sky',      'arctic-sky'],
  [15, 'holographic', 'gold',     'holographic-gold'],
  [16, 'neon',        'ruby',     'neon-ruby'],
]

// The 8 sphere styles: [NN, styleId, label]
const SPHERE_STYLES: [number, string, string][] = [
  [1, 'wireframe',      'wireframe'],
  [2, 'hal-eye',        'hal-eye'],
  [3, 'animated-core',  'animated-core'],
  [4, 'pulse',          'pulse'],
  [5, 'corona',         'corona'],
  [6, 'particles',      'particles'],
  [7, 'colorshift',     'colorshift'],
  [8, 'lightning',      'lightning'],
]

/** Set localStorage for theme + sphere, reload, and wait */
async function setupTheme(styleId: string, colorId: string) {
  await page.evaluate(({ style, color }) => {
    localStorage.setItem('hal-o-setup-done', '1')
    localStorage.setItem('hal-o-demo-mode', 'true')
    localStorage.setItem('hal-o-demo-cards', '40')
    localStorage.setItem('hal-o-demo-terminals', '0')
    localStorage.setItem('hal-o-gpu-wizard-done', '1')
    localStorage.setItem('hal-o-renderer', 'pbr-holo')
    localStorage.setItem('hal-o-layout', 'default')
    localStorage.setItem('hal-o-3d-theme', style)
    localStorage.setItem('hal-o-color', color)
    localStorage.setItem('hal-o-sphere-style', 'hal-eye')
    localStorage.setItem('hal-o-split', '100')
    localStorage.setItem('hal-o-hub-font', '18')
    localStorage.setItem('hal-o-tutorial-done', '1')
    localStorage.setItem('hal-o-intro-animation', 'false')
    localStorage.setItem('hal-o-auto-rotate', 'true')
    localStorage.setItem('hal-o-auto-rotate-speed', '0.24')
    localStorage.setItem('hal-o-cards-per-sector', '16')
  }, { style: styleId, color: colorId })

  await page.reload()

  // Maximize window
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.maximize()
  })

  // Wait for scene to fully render
  await page.waitForTimeout(5000)
}

/** Set localStorage for sphere style */
async function setupSphereStyle(sphereStyleId: string) {
  await page.evaluate(({ sphereStyle }) => {
    localStorage.setItem('hal-o-sphere-style', sphereStyle)
  }, { sphereStyle: sphereStyleId })

  await page.reload()

  // Maximize window
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.maximize()
  })

  // Wait for scene to fully render
  await page.waitForTimeout(5000)
}

/** Set camera position via Photo Mode API and OrbitControls */
async function setCamera(x: number, y: number, z: number) {
  await page.evaluate(({ cx, cy, cz }) => {
    const pm = (window as any).__haloPhotoMode
    if (pm) {
      pm.setActivity(100)
      pm.setCamera(cx, cy, cz)
    }

    // Also set OrbitControls target to center and update
    const oc = (window as any).__haloOrbitControls
    if (oc) {
      oc.target.set(0, 0, 0)
      oc.update()
    }
  }, { cx: x, cy: y, cz: z })

  // Wait for camera to settle
  await page.waitForTimeout(1000)

  // Dismiss settings if open
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

test.beforeAll(async () => {
  ;({ app, page } = await launchApp())
  // Initial setup — first theme combo
  await setupTheme(THEME_COMBOS[0][1], THEME_COMBOS[0][2])
})

test.afterAll(async () => {
  await app?.close()
})

test('capture 16 theme combos from top-down camera', async () => {
  console.log('\n=== SET 1: THEME × COLOR COMBOS (TOP-DOWN CAMERA) ===\n')

  for (const [nn, styleId, colorId, label] of THEME_COMBOS) {
    // Skip re-setup for the first combo (already done in beforeAll)
    if (nn > 1) {
      await setupTheme(styleId, colorId)
    }

    // Set TOP-DOWN camera: directly above (Y=25), looking down (Z=0.1)
    await setCamera(0, 25, 0.1)

    const filename = `${String(nn).padStart(2, '0')}-${label}.jpg`
    const filepath = resolve(OUT_THEMES, filename)

    await page.screenshot({
      path: filepath,
      type: 'jpeg',
      quality: 85,
    })

    console.log(`[${nn}/16] Top-down: ${filename}`)
  }

  console.log(`\nAll 16 theme screenshots captured in temp/themes-topdown/\n`)
})

test('capture 8 sphere styles from close-up camera', async () => {
  console.log('\n=== SET 2: SPHERE STYLES (CLOSE-UP CAMERA) ===\n')

  // First, setup base theme (tactical+cyan)
  await setupTheme('tactical', 'cyan')

  for (const [nn, sphereStyleId, label] of SPHERE_STYLES) {
    // Skip re-setup for first sphere style
    if (nn > 1) {
      await setupSphereStyle(sphereStyleId)
    }

    // Set CLOSE-UP camera: intimate angle (Y=2, Z=6)
    await setCamera(0, 2, 6)

    const filename = `${String(nn).padStart(2, '0')}-${label}.jpg`
    const filepath = resolve(OUT_SPHERE, filename)

    await page.screenshot({
      path: filepath,
      type: 'jpeg',
      quality: 85,
    })

    console.log(`[${nn}/8] Close-up: ${filename}`)
  }

  console.log(`\nAll 8 sphere style screenshots captured in temp/sphere-styles/\n`)
})
