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

## Video 1: Short Teaser (12 seconds)
- 0-2s: Close approach to a project card (readable content, stats, buttons)
- 2-4s: Camera pulls back slightly to show sphere + 2-3 cards
- 4-6s: Settings menu opens briefly (1.5s), closes
- 6-12s: HAL speaks "Hi, I'm Hal, your personal assistant" — sphere pulses with voice audio
- Total: ~12 seconds
- Camera should be CLOSE (use closeUp or setCamera(3,5,8))
- Record audio: use tts.py to generate the greeting, play it via Web Audio API during recording
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
