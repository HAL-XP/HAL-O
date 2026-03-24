import { _electron } from 'playwright-core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'screenshots');

async function testLayout(cardCount, label) {
  console.log(`\n=== Testing with ${cardCount} cards (${label}) ===`);
  
  const app = await _electron.launch({
    args: ['.'],
    cwd: __dirname
  });
  
  try {
    const page = await app.firstWindow();
    await new Promise(r => setTimeout(r, 2000));
    
    // Set up demo mode with specific card count
    await page.evaluate((count) => {
      localStorage.setItem('hal-o-setup-done', '1');
      localStorage.setItem('hal-o-gpu-wizard-done', '1');
      localStorage.setItem('hal-o-demo-mode', 'true');
      localStorage.setItem('hal-o-renderer', 'pbr-holo');
      localStorage.setItem('hal-o-demo-cards', count.toString());
      localStorage.setItem('hal-o-intro-animation', 'false');
      localStorage.setItem('hal-o-bloom', 'false');
      localStorage.setItem('hal-o-particle-density', '0');
      localStorage.setItem('hal-o-floor-lines', 'false');
      localStorage.setItem('hal-o-vfx-frequency', '0');
    }, cardCount);
    
    await page.reload();
    
    // Wait for scene to render
    await new Promise(r => setTimeout(r, 4000));
    
    // Default camera angle screenshot
    const filename1 = `qa-ux3-${label}-default.png`;
    const filepath1 = path.join(OUTPUT_DIR, filename1);
    await page.screenshot({ path: filepath1, fullPage: false });
    console.log(`✓ Screenshot (default): ${filename1}`);
    
    // Zoom out via keyboard
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.dispatchEvent(new WheelEvent('wheel', {
          deltaY: 300,
          bubbles: true,
          clientX: canvas.width / 2,
          clientY: canvas.height / 2
        }));
      }
    });
    
    await new Promise(r => setTimeout(r, 500));
    
    const filename2 = `qa-ux3-${label}-zoomed.png`;
    const filepath2 = path.join(OUTPUT_DIR, filename2);
    await page.screenshot({ path: filepath2, fullPage: false });
    console.log(`✓ Screenshot (zoomed out): ${filename2}`);
    
    await app.close();
  } catch (err) {
    console.error(`Error testing ${label}:`, err.message);
    try { await app.close(); } catch {}
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  await testLayout(10, '10cards-single-ring');
  await testLayout(35, '35cards-multi-ring');
  await testLayout(50, '50cards-stress');
  
  console.log('\n=== QA Test Complete ===');
  console.log(`Screenshots: ${OUTPUT_DIR}`);
}

main().catch(console.error);
