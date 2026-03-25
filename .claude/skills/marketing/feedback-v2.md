# Marketing Page v2 Feedback

## Must Fix
1. **TOKEN NUMBERS front and center** — show real math: "20 keyword shortcuts = 0 extra tokens", "Haiku subagents = 85% cheaper", "Shared geometry = -91% GPU objects". Make it feel like the product SAVES money, not costs more.
2. **Cost comparison section** — "Human hours vs wall clock. All the mistakes avoided. Auto-QA catches what you miss." ROI math.
3. **Core Features section is boring** — "sad like a rainy monday". Needs energy, animation, visual wow. Each feature should feel like a product launch, not a bullet list.
4. **Screenshots** — Take actual screenshots of the app. Try to frame them nicely. Use the 2D/Classic view for panel screenshots if 3D is hard to capture. Get some real tries as placeholders — user will rework later.
5. **Make the page sexier** — more animations, more visual impact, more "I want this NOW" energy.

## Screenshot Strategy — Photo Mode API

The app exposes `window.__haloPhotoMode` for staging marketing shots. Use via `page.evaluate()`:

```js
// Trigger spaceship flyby
await page.evaluate(() => window.__haloPhotoMode.triggerFlyby())

// Set fake activity on all cards (0-100)
await page.evaluate(() => window.__haloPhotoMode.setActivity(80))

// Trigger sphere glow event
await page.evaluate(() => window.__haloPhotoMode.sphereEvent('info', 1.0))

// Freeze/resume auto-rotation
await page.evaluate(() => window.__haloPhotoMode.pauseAutoRotate())

// Fake audio for sphere pulse effect
await page.evaluate(() => window.__haloPhotoMode.setAudioDemo(true))

// Camera presets
await page.evaluate(() => window.__haloPhotoMode.closeUp())    // [0, 6, 10] — card readable
await page.evaluate(() => window.__haloPhotoMode.heroAngle())   // [5, 8, 14] — dramatic
await page.evaluate(() => window.__haloPhotoMode.wideShot())    // [0, 12, 22] — full scene
await page.evaluate(() => window.__haloPhotoMode.topDown())     // [0, 20, 1] — overview

// Custom camera
await page.evaluate(() => window.__haloPhotoMode.setCamera(x, y, z))
```

### CRITICAL: Demo Mode Enforcement
The v2 page used OLD screenshots that leaked real project names. EVERY screenshot must be retaken with `hal-o-demo-mode=true`. Before embedding ANY screenshot, verify it was taken in demo mode. If unsure, retake it.

### Visual Variety
Each screenshot must look DIFFERENT — vary these between shots:
- **3D theme**: `hal-o-3d-theme` = `tactical` (cyan/green), `neon` (pink/purple), `ember` (orange/red), `arctic` (white/blue), `phantom` (gray/teal), `solar` (gold/amber)
- **Layout**: `hal-o-layout` = `dual-arc`, `spiral`, `hemisphere`, `arena`, `grid-wall`, `dna-helix`, `cascade`, `constellation`
- **Card count**: vary demo project count for density differences
- Never use the same theme+layout combo twice in the same page
- **Sphere styles**: vary between `wireframe`, `hal-eye`, `animated-core` via `hal-o-sphere-style` localStorage
- **Excited sphere**: use Photo Mode to fake activity — `setActivity(90)`, `setAudioDemo(true)`, `sphereEvent('info', 1.0)` — makes the sphere pulse, glow, and react. Don't just show a dormant sphere — show it ALIVE

### Shot List
1. **Hero**: PBR full hub, heroAngle, activity=60, sphere pulsing — THE money shot
2. **Card close-up**: closeUp, activity=80, pause rotation — readable card content
3. **Spaceship**: heroAngle, trigger flyby, wait 2s, capture mid-flight
4. **Terminal split**: pbr-hero.png already captured with terminal visible
5. **Settings**: settings.png already captured
6. **Wide**: wideShot, activity=40 — show the full ring of cards

### Terminal Content
- Terminals in demo mode are empty. To fill them with text, use `page.evaluate` to write fake content via the terminal's write method, or use a real PTY session.
- Camera should be CLOSE ENOUGH to read card content (stats, activity bars, buttons). Use `closeUp()` or `setCamera(0, 6, 10)`.

