/**
 * Standalone performance test: orbit drag frame timing analysis.
 *
 * Launches HAL-O via Playwright Electron, configures PBR renderer with
 * 8 demo cards / bloom / floor lines / particles=4, simulates a slow
 * circular orbit drag on the 3D canvas, and measures per-frame timing
 * to detect jitter and hitches.
 *
 * Run:  node e2e/perf-orbit-drag.mjs
 */

import { _electron as electron } from 'playwright-core';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main() {
  console.log('=== HAL-O Orbit Drag Performance Test ===\n');
  console.log('Launching Electron app...');

  const app = await electron.launch({
    args: [resolve(ROOT, 'out/main/index.js')],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // ── Step 1: Configure localStorage ──────────────────────────────────
  console.log('Configuring: PBR renderer, 8 demo cards, bloom on, floor lines on, particles=4');
  await page.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1');
    localStorage.setItem('hal-o-demo-mode', 'true');
    localStorage.setItem('hal-o-renderer', 'pbr-holo');
    localStorage.setItem('hal-o-demo-cards', '8');
    localStorage.setItem('hal-o-layout', 'default');
    localStorage.setItem('hal-o-3d-theme', 'tactical');
    localStorage.setItem('hal-o-particle-density', '4');
    localStorage.setItem('hal-o-bloom', 'true');
    localStorage.setItem('hal-o-floor-lines', 'true');
    localStorage.setItem('hal-o-skip-intro', 'true');
  });

  // ── Step 2: Reload and wait for canvas ──────────────────────────────
  console.log('Reloading and waiting for canvas...');
  await page.reload();
  try {
    await page.locator('canvas').first().waitFor({ timeout: 20000 });
    console.log('Canvas found.');
  } catch {
    console.log('WARNING: Canvas not found within 20s, proceeding anyway...');
  }

  console.log('Waiting 8 seconds for scene to settle (textures, shaders, GC)...');
  await page.waitForTimeout(8000);

  // ── Step 3: Inject frame-time profiler ──────────────────────────────
  console.log('Injecting frame-time profiler...');
  await page.evaluate(() => {
    window.__frameTimes = [];
    window.__profilingActive = false;
    const origRAF = window.requestAnimationFrame.bind(window);
    let lastTime = performance.now();
    window.requestAnimationFrame = function (cb) {
      return origRAF((t) => {
        if (window.__profilingActive) {
          window.__frameTimes.push(t - lastTime);
        }
        lastTime = t;
        cb(t);
      });
    };
  });

  // Let a few warmup frames pass with the patched rAF
  await page.waitForTimeout(500);

  // ── Step 4: Simulate slow circular orbit drag ───────────────────────
  console.log('Starting orbit drag simulation (20 steps, 50ms intervals)...');

  const result = await page.evaluate(() => {
    return new Promise((resolve) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        resolve({ error: 'No canvas element found' });
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = Math.min(rect.width, rect.height) * 0.25;

      const STEPS = 20;
      const INTERVAL_MS = 50;

      // Clear any previously collected frames and activate profiling
      window.__frameTimes = [];
      window.__profilingActive = true;

      // Mouse down at center-right (0 degrees on the circle)
      const startX = cx + radius;
      const startY = cy;

      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: startX, clientY: startY,
        button: 0, buttons: 1, bubbles: true, pointerId: 1,
      }));

      let step = 0;

      function nextStep() {
        step++;
        if (step > STEPS) {
          // Mouse up
          canvas.dispatchEvent(new PointerEvent('pointerup', {
            clientX: cx + radius, clientY: cy,
            button: 0, bubbles: true, pointerId: 1,
          }));

          // Record a few more coast frames (500ms worth)
          setTimeout(() => {
            window.__profilingActive = false;
            resolve({ frameTimes: window.__frameTimes.slice(), canvasSize: { w: rect.width, h: rect.height } });
          }, 500);
          return;
        }

        const angle = (step / STEPS) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.4; // flatten vertical for realistic orbit

        canvas.dispatchEvent(new PointerEvent('pointermove', {
          clientX: x, clientY: y,
          button: 0, buttons: 1, bubbles: true, pointerId: 1,
        }));

        setTimeout(nextStep, INTERVAL_MS);
      }

      // Start moving after a brief delay
      setTimeout(nextStep, INTERVAL_MS);
    });
  });

  if (result.error) {
    console.error(`FATAL: ${result.error}`);
    await app.close();
    process.exit(1);
  }

  const { frameTimes, canvasSize } = result;
  console.log(`\nOrbit drag complete. Canvas size: ${canvasSize.w}x${canvasSize.h}`);
  console.log(`Collected ${frameTimes.length} frame samples.\n`);

  // ── Step 5: Analyze frame timing stats ──────────────────────────────
  if (frameTimes.length === 0) {
    console.error('No frame times collected. The rAF profiler may not have captured any frames.');
    await app.close();
    process.exit(1);
  }

  const sorted = [...frameTimes].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = frameTimes.reduce((a, b) => a + b, 0);

  const avg = sum / n;
  const p50 = sorted[Math.floor(n * 0.50)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];
  const max = sorted[n - 1];
  const min = sorted[0];
  const hitches = frameTimes.filter(t => t > 50);

  const round = (v) => Math.round(v * 100) / 100;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         FRAME TIMING RESULTS                    ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Total frames:    ${String(n).padStart(6)}                       ║`);
  console.log(`║  Duration:        ${String(round(sum)).padStart(6)} ms                    ║`);
  console.log(`║  Min frame:       ${String(round(min)).padStart(6)} ms                    ║`);
  console.log(`║  Avg frame:       ${String(round(avg)).padStart(6)} ms                    ║`);
  console.log(`║  P50 (median):    ${String(round(p50)).padStart(6)} ms                    ║`);
  console.log(`║  P95:             ${String(round(p95)).padStart(6)} ms                    ║`);
  console.log(`║  P99:             ${String(round(p99)).padStart(6)} ms                    ║`);
  console.log(`║  Max frame:       ${String(round(max)).padStart(6)} ms                    ║`);
  console.log(`║  Hitches (>50ms): ${String(hitches.length).padStart(6)} frames                   ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (hitches.length > 0) {
    console.log('\n⚠ HITCHES DETECTED (frames > 50ms):');
    hitches.forEach((t, i) => {
      const idx = frameTimes.indexOf(t);
      console.log(`  Hitch #${i + 1}: ${round(t)}ms at frame index ${idx}`);
    });
  } else {
    console.log('\nNo hitches detected. All frames were under 50ms.');
  }

  // Frame time distribution buckets
  const buckets = { '<8ms': 0, '8-16ms': 0, '16-33ms': 0, '33-50ms': 0, '>50ms': 0 };
  for (const t of frameTimes) {
    if (t < 8)       buckets['<8ms']++;
    else if (t < 16) buckets['8-16ms']++;
    else if (t < 33) buckets['16-33ms']++;
    else if (t < 50) buckets['33-50ms']++;
    else              buckets['>50ms']++;
  }

  console.log('\nFrame time distribution:');
  for (const [label, count] of Object.entries(buckets)) {
    const pct = ((count / n) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / n * 40));
    console.log(`  ${label.padEnd(10)} ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }

  // Effective FPS estimate
  const effectiveFps = round(1000 / avg);
  console.log(`\nEffective FPS (from avg frame time): ${effectiveFps}`);

  // ── Step 6: Take screenshot ─────────────────────────────────────────
  const screenshotDir = resolve(ROOT, 'screenshots');
  mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = resolve(screenshotDir, 'perf-orbit-drag.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`\nScreenshot saved: ${screenshotPath}`);

  // ── Step 7: Write raw data to JSON ──────────────────────────────────
  const reportDir = resolve(ROOT, '_devlog', 'perf');
  mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = resolve(reportDir, `orbit-drag-${ts}.json`);
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: {
      renderer: 'pbr-holo',
      demoCards: 8,
      particleDensity: 4,
      bloom: true,
      floorLines: true,
      canvasSize,
    },
    stats: {
      totalFrames: n,
      durationMs: round(sum),
      minFrameMs: round(min),
      avgFrameMs: round(avg),
      p50FrameMs: round(p50),
      p95FrameMs: round(p95),
      p99FrameMs: round(p99),
      maxFrameMs: round(max),
      hitchCount: hitches.length,
      effectiveFps,
    },
    distribution: buckets,
    rawFrameTimes: frameTimes.map(t => round(t)),
  }, null, 2));
  console.log(`Raw data saved: ${reportPath}`);

  // ── Step 8: Verdict ─────────────────────────────────────────────────
  console.log('\n── VERDICT ──');
  if (p95 < 20) {
    console.log('EXCELLENT: P95 < 20ms — consistently above 50 FPS at the 95th percentile.');
  } else if (p95 < 33) {
    console.log('GOOD: P95 < 33ms — maintaining 30+ FPS at the 95th percentile.');
  } else if (p95 < 50) {
    console.log('MARGINAL: P95 < 50ms — some frames drop below 30 FPS.');
  } else {
    console.log('POOR: P95 >= 50ms — significant stutter detected during orbit.');
  }

  if (hitches.length > 0) {
    console.log(`WARNING: ${hitches.length} hitch(es) > 50ms detected — investigate GC pauses or shader compilation.`);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────
  await app.close();
  console.log('\nApp closed. Test complete.');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
