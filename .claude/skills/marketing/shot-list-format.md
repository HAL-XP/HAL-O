# HAL-O Video Shot List Format

Every demo recording MUST use a shot list in this format. The Mark agent reads this
and executes each step sequentially. No improvisation.

## Format

```yaml
name: "teaser-v1"
duration: 16s
resolution: 3840x2160
output_resolution: 1920x1080
fps: 30

# Pre-recording setup (not recorded)
setup:
  - demo_mode: true
  - cards: 40
  - activity: 100
  - sphere_style: "hal-eye"
  - theme: "default"
  - font_size: 16

# Debug validation (mandatory, before recording starts)
validate:
  - wireframe: true
  - screenshot: "debug-wireframe.jpg"
  - check: "cards visible, sphere centered, no overlap"
  - wireframe: false

# Recording steps — each has a timestamp and action
shots:
  - t: 0.0s
    action: "set_camera"
    position: [0, 6, 20]
    target: [0, 0, 0]
    tag: "FAR_ESTABLISHING"
    validate: "camera.position.distanceTo(origin) > 15"

  - t: 0.0s
    action: "start_recording"
    method: "gdigrab"

  - t: 0.1s
    action: "animate_camera"
    from: [0, 6, 20]
    to: [0, 0, 11]
    duration: 3s
    easing: "ease-in-out"
    tag: "APPROACH"

  - t: 1.0s
    action: "play_audio"
    file: "greeting.wav"
    tag: "VOICE_GREETING"

  - t: 3.0s
    action: "sync_orbit_controls"
    note: "CRITICAL — sync OrbitControls to current camera BEFORE enabling rotate"
    validate: "frame_diff < 5 between frame N-1 and N"
    tag: "HANDOFF"

  - t: 3.1s
    action: "enable_auto_rotate"
    speed: 0.24

  - t: 16.0s
    action: "stop_recording"

# Post-recording validation (mandatory)
post_validate:
  - run: "python _scripts/detect_teleport.py {output} --threshold 12 --fps 10"
    expect: "PASS"
  - check_frame: { t: 0.0, tag: "FAR_ESTABLISHING", expect: "camera far from cards" }
  - check_frame: { t: 3.0, tag: "HANDOFF", expect: "no visible jump" }
  - check_frame: { t: 5.0, tag: "ROTATING", expect: "smooth orbit, different angle from 3s" }
  - smoothness: "max frame diff spike < 2x rolling average"
```

## Rules

1. Every recording starts with `validate:` debug steps — no recording blind
2. The `HANDOFF` step (animateCamera → OrbitControls) MUST sync camera state:
   - `camera.position.copy(currentPos)`
   - `orbitControls.target.set(0, 0, 0)`
   - `orbitControls.update()`
   - THEN enable autoRotate
3. Post-validation with `detect_teleport.py` is mandatory — FAIL = re-record
4. Threshold for teleport detection: 12 (not 15 — tighter)
5. Smoothness rule: no frame-to-frame diff spike > 2x the 5-frame rolling average
6. Never call a video "final" until post_validate passes
