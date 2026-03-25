const { test } = require('@playwright/test');
const path = require('path');
const os = require('os');
const { _electron: electron } = require('playwright');

test('screenshot pbr with terminal and settings', async ({ }) => {
  test.setTimeout(90000);

  const tmpDir = path.join(os.tmpdir(), 'hal-o-test-' + Date.now());

  console.log('Launching Electron...');
  const electronApp = await electron.launch({
    args: [
      path.join(__dirname, '../out/main/index.js'),
      '--fast-wizards',
      `--user-data-dir=${tmpDir}`
    ]
  });

  console.log('Waiting for first window...');
  const window = await electronApp.firstWindow();

  // Set localStorage flags to skip setup
  console.log('Setting localStorage...');
  await window.evaluate(() => {
    localStorage.setItem('hal-o-setup-done', '1');
    localStorage.setItem('hal-o-demo-mode', 'true');
    localStorage.setItem('hal-o-gpu-wizard-done', '1');
    localStorage.setItem('hal-o-renderer', 'pbr-holo');
  });

  // Reload to apply localStorage
  console.log('Reloading window...');
  await window.reload();

  // Wait for scene to load
  console.log('Waiting 4s for scene to load...');
  await window.waitForTimeout(4000);

  // Try to create a terminal tab by dispatching event
  console.log('Creating terminal...');
  await window.evaluate(() => {
    const evt = new CustomEvent('hal-request-new-terminal', { detail: { cwd: '.' } });
    window.dispatchEvent(evt);
  });

  // Wait a bit for terminal to mount
  console.log('Waiting 2s for terminal to mount...');
  await window.waitForTimeout(2000);

  // Dispatch settings open event
  console.log('Opening settings...');
  await window.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hal-open-settings'));
  });

  // Wait for settings overlay to render
  console.log('Waiting 2s for settings...');
  await window.waitForTimeout(2000);

  // Take screenshot
  const screenshotPath = path.join(__dirname, '../temp/screenshots/pbr-with-terminal.png');
  console.log(`Taking screenshot to ${screenshotPath}...`);
  await window.screenshot({ path: screenshotPath, fullPage: false });

  console.log(`Screenshot saved to ${screenshotPath}`);

  await electronApp.close();
});
