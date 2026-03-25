# Demo Video Brief v2

## HARD RULES
- Mark has priority over development. Pause code changes until video is done.
- Build must be clean and green before recording.
- Record WITH AUDIO (not silent).
- hal-o-demo-mode=true ALWAYS.

## FEEDBACK ON V1 (must fix)
- NO AUDIO was captured — ffmpeg gdigrab only captures video. Need to add audio: either `-f dshow -i audio="Stereo Mix"` or play audio through the app and capture with `-f dshow` audio input
- Timing was perfect — keep the same spawn point and timing
- Zoom IN on the card that's in front of camera (closer than before)
- When shifting to side view, keep same timing
- Settings menu FONT IS TOO SMALL — bump `hal-o-hub-font` to 16 or 18 before opening settings
- Ship version: ship was NOT visible — deprioritize for now, focus on v1

## Video 1: Short Teaser — V9 camera plan (latest)

### CRITICAL FIXES FROM V8 REVIEW:
1. **Buffer frames**: F0-F57 are blank/setup. Trim in post or start recording AFTER scene is ready.
2. **F234 teleport**: animateCamera→stopAnimation causes a hard cut when switching to auto-rotate. FIX: do NOT use animateCamera for the approach. Instead, let auto-rotate run from the start, and ONLY adjust the camera's Y position (vertical) + distance to center the card. The auto-rotate handles horizontal movement naturally. No teleport.
3. **Window capture STILL shows Windows taskbar + other windows**: Must hide taskbar + maximize Electron to exact screen area, OR use Electron's built-in `webContents.capturePage()` instead of ffmpeg gdigrab.

### APPROACH FOR V9:
- Let auto-rotate run the ENTIRE time (never disable it)
- Camera starts at default position [0, 10, 16]
- Smoothly adjust Y and distance to frame a card vertically centered
- The ring spins naturally, cards scroll past
- Audio plays at 2s
- No animateCamera, no stopAnimation, no teleport

### RECORDING TECHNIQUE (permanent)
Use page.screenshot for CLEAN Electron-only frames, but timestamp each one and assemble with real durations:
```js
const frames = []
for (let i = 0; i < targetFrames; i++) {
  const t0 = performance.now()
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
  const elapsed = performance.now() - t0
  fs.writeFileSync(`frames/frame_${i.toString().padStart(5,'0')}.jpg`, buf)
  frames.push({ file: `frame_${i.toString().padStart(5,'0')}.jpg`, duration: elapsed / 1000 })
}
// Write concat file with real durations
const concat = frames.map(f => `file '${f.file}'\nduration ${f.duration.toFixed(4)}`).join('\n')
fs.writeFileSync('frames/concat.txt', concat)
```
Assemble: `ffmpeg -f concat -safe 0 -i frames/concat.txt -c:v libx264 -pix_fmt yuv420p video.mp4`
Mix audio: `ffmpeg -i video.mp4 -i greeting.wav -filter_complex "[1:a]adelay=2000|2000[a]" -map 0:v -map "[a]" -c:v libx264 -c:a aac final.mp4`

This gives: clean Electron-only frames + correct real-time playback + precise audio sync.

## DEPRECATED — V3 camera plan
- 0-3s: Start from intro position (far), fly in CLOSE to a project card — close enough to READ stats, buttons, activity bars
- 3-6s: Smooth lateral transition to side angle where sphere is visible + card still partially in frame
- 6-12s: HAL speaks "Hi, I'm Hal, your personal assistant" — sphere pulses with voice audio
- Total: ~12 seconds
- Camera keyframes: start=[0,10,16] → card closeup=[2,4,7] → side=[5,6,12]
- Use CatmullRom interpolation between positions (same as IntroSequence)
- Record WITH AUDIO: generate greeting with tts.py, play via Web Audio API during recording
- ffmpeg must capture desktop audio: `-f dshow -i audio="Stereo Mix"` or equivalent
- ffmpeg must capture desktop audio too (not just video)

## Video 2: Ship Version (same framing + spaceship)
- Same 12s structure as Video 1
- BUT: a spaceship must be VISIBLE on screen
- Don't just trigger flyby and hope — position camera where the spline path crosses
- The ship path is a CatmullRom curve starting from ~(-40,8,-10) to ~(40,8,-10)
- Best capture window: camera at setCamera(5,8,14), trigger flyby, wait ~8-9 seconds (ship passes through frame)
- Ship doesn't need to be perfectly centered, just clearly visible

## Output
- `D:/GitHub/hal-o/temp/demo-teaser-v1.mp4` (12s, with timecode)
- `D:/GitHub/hal-o/temp/demo-teaser-ship.mp4` (12s, with timecode + ship)
- `D:/GitHub/hal-o/temp/demo-teaser-timing.json`
- Split if >50MB (unlikely at 12s)
