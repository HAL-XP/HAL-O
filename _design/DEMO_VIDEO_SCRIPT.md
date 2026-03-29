# HAL-O: 60-Second Demo Video Script

**Duration**: 60 seconds
**Resolution**: 3840x2160 (4K) or 1920x1080
**FPS**: 60
**Format**: MP4 H.264
**Theme**: Amethyst (blue/purple/cyan)

---

## SHOT LIST

### 0:00-0:05: OPENING - The Descent
- **Visual**: Wide shot of HAL sphere from above, descending. Camera [0,25,30] to [0,12,18]. Wireframe globe with cyan equatorial band. Reflective Tron-grid floor (purple). Ring platform. Bloom on glowing elements. Three project screens orbiting.
- **Audio**: Ambient synth pad (Blade Runner vibes). Mechanical hum. Fade music in.
- **Narration**: Meet HAL-O. Your holographic AI command center.

---

### 0:05-0:12: ORBIT - Project Screens Light Up
- **Visual**: Camera orbits sphere (radius 18, height 12). Three project screens illuminate sequentially. Shows: project name, git stats, activity bars, file count.
- **Audio**: Synth pad. Arpeggios layer in. Whoosh as camera orbits. Chime as screens light.
- **Narration**: Visualize all your projects at once. Real-time activity. No dashboard fatigue.

---

### 0:12-0:20: DEBATE - The Ring Awakens
- **Visual**: Camera zooms into ring. Five glowing orbs materialize (cyan, purple, blue, magenta, cyan). Speech bubbles with typewriter text above each. Orbs pulse as they speak.
- **Colors**: Cyan (#00ffff), Purple (#9333ea), Blue (#3b82f6), Magenta (#ec4899)
- **Audio**: Synth intensifies. Electrical crackle as orbs spawn. Typewriter clicks. Thinking drone (40 Hz).
- **Narration**: Compare AI models side-by-side. Instant multi-agent debates. Let them fight your code problems.

---

### 0:20-0:28: VOICE CONTROL - Push-to-Talk
- **Visual**: Camera pulls back. Large mic button (cyan glow) appears lower-left. Waveform visualization (cyan bars) pulses inside button. User question: What frameworks does the API use?
- **Audio**: Waveform SFX syncs with bars. Ding when recording starts. HAL responds (butler voice).
- **Narration**: Voice control. Press CTRL+Space, ask anything. HAL understands context.

---

### 0:28-0:38: SPLIT TERMINAL - Code Flow
- **Visual**: Camera zooms to split terminal (2 panes). Left: git log. Right: JavaScript/TypeScript code (syntax-highlighted). Code flows slowly. Drag indicator shows mid-divider. Right-click menu briefly appears.
- **Audio**: Synth adds metallic plucks. Swishing as divider drags. Keyboard clicks. Menu pop.
- **Narration**: Organize your terminals however you want. Drag. Resize. Context menu. Everything is keyboard-accessible.

---

### 0:38-0:48: MOBILE - Halo Chat
- **Visual**: Camera pulls back. Phone mockup (iPhone style) appears right. Shows Halo Chat PWA: header, message thread, mic button, waveform. User sends message. HAL responds with voice.
- **Audio**: Synth becomes ethereal. Phone notification ping. HAL speaks (female, Hallie profile).
- **Narration**: Voice from your phone. Halo Chat keeps you in the loop, anywhere.

---

### 0:48-0:56: PERSONALITY SLIDERS - Real-Time Tone Shift
- **Visual**: Settings panel slides in. Four sliders: Humor (60), Formality (40), Verbosity (70), Dramatic (80). User drags Humor to 90. Sphere pulses brighter, spins faster, emits particles. Text: HAL is now 90% comedic.
- **Audio**: Synth becomes upbeat. Slider whoosh. Sphere pulse chime.
- **Narration**: Tune HAL to your vibe. Humorous, formal, verbose, dramatic — in real time.

---

### 0:56-1:00: CLOSING - The Tagline
- **Visual**: Camera pulls back to full scene. Sphere, ring, floor glow cyan/purple. Particles drift. Tips bar: HAL-O runs locally. All elements pulse. Fade to black over 2 seconds.
- **Audio**: Final synth chord (major, warm). Fade music. Soft resonant tone.
- **Text** (no voiceover): HAL-O. Your terminal evolved. Download free. Run locally. No limits.

---

## VISUAL STYLE (Amethyst Theme)

### Colors
- Primary Glow: Cyan (#00ffff)
- Secondary: Purple (#9333ea)
- Tertiary: Blue (#3b82f6)
- Accent: Magenta (#ec4899)
- Background: Very dark purple (#1a0033)

### Effects
- Bloom: Threshold 0.3, Intensity 1.8
- Chromatic Aberration: Light
- Vignette: Subtle
- Particles: 200+ cyan/green motes
- Floor: Reflective Tron grid

### Typography
- Headings: Futura/Helvetica, 18px, bright cyan
- Body: Monaco/Courier, 12px, white/cyan
- Chat Bubbles: Semi-transparent dark, cyan border

### Lighting
- Ambient: Very low blue (0x001155, 0.3 intensity)
- Point Lights: Red sphere core (0.8), Cyan orbs (1.2), Purple fill (0.2)
- Emissive: All glowing elements with bloom

---

## PRODUCTION

### Capture at 3840x2160 @ 60 FPS
ffmpeg -f gdigrab -framerate 60 -offset_x 0 -offset_y 0 -video_size 3840x2160 -i desktop -t 60 -c:v libx264 -preset ultrafast -pix_fmt yuv420p output.mp4

### Audio
- Background: Blade Runner synthwave (60s)
- Narration: Record, normalize -3dB
- SFX: Whoosh, chimes, crackle, typewriter (layer in post)
- Voice: Generate with tts.py (butler/hallie profiles)

### Quality Checklist
- Sphere glow and bloom visible
- Project screens readable
- Debate orbs distinct colors
- Voice waveform syncs with narration
- Terminal code readable
- Phone mockup clean
- Slider animations smooth
- Particle drift subtle
- Camera movement smooth
- Colors vibrant, not blown out
- Music and narration clear
- Final tagline readable
- Exactly 60 seconds (3600 frames)

---

## DIRECTOR NOTES

1. First 30s = wow-factor. Last 30s = depth.
2. Tone: Calm, cinematic, confident.
3. Music: Blade Runner/Tron vibes.
4. Voice: Warm, not robotic.
5. Orbs: Distinct colors (no red/green for colorblind-friendly).
6. Phone: Real mockup (iPhone/Samsung).
7. Use real git stats where possible.
8. Particles: Subtle background element.
9. Sphere = logo. Brand by visuals alone.
10. Test on 4K, 1080p, phone.

---

VERSION 1.0 | Created 2026-03-29 | Ready for Playwright + Post-Production
