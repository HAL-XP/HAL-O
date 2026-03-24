# V10: ONE HAL VOICE, MANY MOODS

Design proposal for transitioning HAL-O from 20 rotating voice profiles to a single iconic voice with tonal variety.

---

## 1. THE PROBLEM WITH V9

V9 rotates across 20 different voice profiles (buddy, pirate, glados, orc, wizard, etc.) selected by keyword analysis. While this was fun to build, it creates a fundamental identity problem:

- **No voice recognition.** The user can never think "that's HAL" because HAL sounds like a different person every time. Jarvis, FRIDAY, Samantha, HAL-9000 -- every iconic AI voice is ONE voice.
- **Tonal whiplash.** A pirate celebrating your build pass, then a drill sergeant warning about a security issue, then a surfer dude giving instructions. It's a novelty, not an assistant.
- **Emotional disconnect.** The reference audio's emotion (excited pirate sample vs. calm narrator sample) drives the output more than the content does. The user gets the *character's* emotion, not a contextually appropriate one.
- **20x maintenance surface.** 20 profiles x 3 sentiment samples x 2 languages = 120 audio files to record, tune, and maintain. Plus Voicebox UUIDs, ElevenLabs voice IDs, Edge TTS voice names -- all per profile.

## 2. THE V10 VISION

**One voice. Always HAL. Moods, not characters.**

Think Jarvis: you always know it's Jarvis whether he's calmly reading diagnostics, urgently warning about incoming missiles, or dryly cracking a joke. The voice identity never changes -- only the *delivery* does.

V10 replaces "which character speaks?" with "how does HAL say this?"

### What makes a voice iconic

- **Consistency.** Same timbre, same fundamental pitch range, same cadence baseline. Every utterance is unmistakably the same entity.
- **Recognizability in 1 second.** If you hear even a half-second clip, you know it's HAL.
- **Tonal range within identity.** The voice can be warm, urgent, dry, excited -- but the *person* never changes. Like how you recognize a friend's voice whether they're whispering or shouting.

## 3. CHOOSING THE HAL VOICE

### Option A: Pick from existing 20 profiles
Select one of the current profiles as the canonical HAL voice. Best candidates:
- **narrator** -- authoritative, clear, neutral baseline. Good range for mood variation.
- **buddy** -- warm, approachable, conversational. Natural for a daily-driver assistant.
- **butler** -- formal, measured. Fits the "AI assistant" archetype.

### Option B: Custom reference recording (RECOMMENDED)
Record or source a dedicated 15-30 second reference clip that represents "HAL at rest" -- calm, clear, moderate pace, neutral-warm tone. This becomes the single identity anchor.

**Why custom is better:**
- The existing profile samples were recorded *in character* (pirate accent, wizard gravitas, etc.). Even the "neutral" samples carry character DNA.
- A purpose-built reference can be optimized for Chatterbox cloning: clean audio, 24kHz+, no background noise, natural speaking style with slight warmth.
- It avoids "that sounds like the narrator/buddy profile" -- it sounds like *HAL*.

### Recommendation
1. **Start with `narrator`** as an interim HAL voice (it has the most neutral, clear timbre and the best existing sample set: documentary, urgent, conclusion).
2. **Record a custom HAL reference** as a Phase 2 polish step. Even a high-quality synthetic voice (generated via ElevenLabs Voice Design or a carefully chosen stock voice) works -- what matters is that it becomes *the* reference.
3. Store the canonical reference at `~/.claude/voicebox/samples/hal/reference.wav` (and mood variants alongside it).

## 4. HOW TTS ENGINES HANDLE MOOD WITH A FIXED VOICE

### Chatterbox (primary engine, local GPU)

The `generate()` method signature:
```python
model.generate(
    text,
    audio_prompt_path=None,     # Voice identity anchor
    exaggeration=0.5,           # Emotion intensity: 0.25 (flat) to 2.0 (dramatic)
    cfg_weight=0.5,             # Pacing: 0.2 (faster) to 0.8 (slower, deliberate)
    temperature=0.8,            # Randomness/variation
)
```

**Key insight:** Chatterbox's emotional output is shaped by TWO things:
1. The **reference audio's emotional tone** -- a calm sample produces calmer output, an excited sample produces more energetic output, even with identical `exaggeration` values.
2. The **exaggeration parameter** -- amplifies or dampens the emotional intensity.

This means for maximum mood range, HAL needs **multiple reference samples of the same voice in different emotional states**: one calm/neutral, one energetic, one concerned, one warm. The `exaggeration` and `cfg_weight` parameters then fine-tune within that emotional neighborhood.

### ElevenLabs (cloud fallback)

Three levers for mood with a fixed voice ID:
- **stability** (0.0-1.0): Lower = more emotional/dynamic, higher = more consistent. Per-call adjustable.
- **style** (0.0-1.0): Amplifies the original speaker's style. Higher = more expressive.
- **similarity_boost** (0.0-1.0): Keep high (0.75-0.85) to lock identity. Rarely change this.
- **Text tags**: ElevenLabs v3 interprets tags like `[excited]`, `[whispers]`, `[serious]` as emotional cues when prepended to text.

### Edge TTS (free cloud fallback)

Limited to `<prosody>` SSML with rate, pitch, and volume adjustments:
- **rate**: `-20%` to `+30%` (slower for calm/thoughtful, faster for urgent/excited)
- **pitch**: `-50Hz` to `+50Hz` (lower for serious/dramatic, higher for excited/playful)
- **volume**: `-10dB` to `+5dB` (quieter for gentle/whisper, louder for urgent)
- No true emotion control. No `<mstts:express-as>` support via edge-tts library.
- Pick a single Edge voice as the HAL fallback: `en-US-AndrewNeural` (warm, clear, versatile) or `en-US-ChristopherNeural` (authoritative).

## 5. MOOD PALETTE

### Core moods (8 + 1 special)

Each mood maps to specific parameters per engine. The text tone detection from V9 (`_TONE_KEYWORDS`) is reused to auto-select moods.

| Mood | When | Chatterbox exag | Chatterbox cfg | EL stability | EL style | Edge rate | Edge pitch |
|---|---|---|---|---|---|---|---|
| **calm** | General info, status reports | 0.35 | 0.50 | 0.75 | 0.10 | +0% | +0Hz |
| **excited** | Build passed, milestone, celebrations | 0.90 | 0.70 | 0.35 | 0.60 | +15% | +30Hz |
| **urgent** | Errors, crashes, security issues | 0.70 | 0.30 | 0.40 | 0.50 | +20% | -20Hz |
| **thoughtful** | Analysis, explanations, reasoning | 0.30 | 0.60 | 0.70 | 0.15 | -10% | +0Hz |
| **playful** | Jokes, casual banter, humor>70 | 0.75 | 0.55 | 0.40 | 0.50 | +10% | +15Hz |
| **dramatic** | Epic narration, dramatic>70 | 1.20 | 0.35 | 0.25 | 0.80 | -15% | -30Hz |
| **gentle** | Reassurance, late night, soft topics | 0.20 | 0.25 | 0.85 | 0.05 | -15% | -10Hz |
| **authoritative** | Warnings, instructions, formality>70 | 0.45 | 0.45 | 0.65 | 0.30 | -5% | -15Hz |
| **orc** | "Zog zog" trigger only | 1.50 | 0.50 | 0.20 | 0.90 | +10% | -50Hz |

### Reference sample strategy for Chatterbox

Record 4 reference samples of the HAL voice (same speaker, different deliveries):
- `hal_neutral.wav` -- calm, informational reading (used by: calm, thoughtful, authoritative)
- `hal_energetic.wav` -- upbeat, slightly faster delivery (used by: excited, playful)
- `hal_concerned.wav` -- serious, slightly lower, measured (used by: urgent, dramatic, orc)
- `hal_warm.wav` -- gentle, slower, softer (used by: gentle)

This gives Chatterbox the right emotional "seed" while `exaggeration` and `cfg_weight` fine-tune the intensity. Four samples is dramatically less than the current 120.

### Mood detection (reuse from V9)

The existing `_TONE_KEYWORDS` dictionary maps directly to moods:
- `celebratory` -> `excited`
- `urgent` -> `urgent`
- `playful` -> `playful`
- `instructional` -> `authoritative`
- `reassuring` -> `gentle`
- `warning` -> `authoritative`
- `frustrated` -> `urgent`
- `narrative` -> `dramatic`
- No match -> `calm`

Personality sliders modulate the selected mood:
- `dramatic > 70` can promote `calm` -> `dramatic`, `urgent` -> `dramatic`
- `humor > 70` can promote `calm` -> `playful`
- `formality > 70` can promote `calm` -> `authoritative`
- Late night (23:00-06:00) bias toward `gentle`

## 6. ARCHITECTURE CHANGES

### tts.py changes

**Remove:** `VOICEBOX_PROFILES`, `EDGE_VOICES`, `ELEVEN_VOICES` (20-entry dicts), `_PROFILE_DIRS`, `_PROFILE_SAMPLE_MAP`, `ALL_PROFILES`, `_TONE_PROFILES`, `_PERSONALITY_WEIGHTS`, `auto_select_profile()`, `_build_neutral_weights()`.

**Add:**
```
HAL_VOICE_DIR      = ~/.claude/voicebox/samples/hal/
HAL_EDGE_VOICE     = "en-US-AndrewNeural"
HAL_ELEVENLABS_ID  = "<created_voice_id>"
MOOD_PARAMS        = { mood -> {exag, cfg, stab, style, edge_rate, edge_pitch, ref_sample, el_tag} }
auto_select_mood() = reuse _detect_tone() + personality modulation -> mood string
```

**Function signature change:**
- `tts_chatterbox(text, out_path, profile, lang)` -> `tts_chatterbox(text, out_path, mood, lang)`
- Same for voicebox, elevenlabs, edge
- `main()` argv: `tts.py <text> <output.ogg> <mood|auto> <lang>` (backward compatible: old profile names silently map to `calm`)

### ipc-voice.ts changes

Minimal. The `voice-speak` handler already passes a `profile` string to tts.py. Rename to `mood` internally but the IPC channel stays the same. The tts.py script handles the interpretation.

### Settings UI changes

Replace the 20-profile voice picker dropdown with:
- **HAL Voice** row: shows "HAL" (non-editable for now, later: voice casting page)
- **Mood** dropdown: `AUTO (CONTEXT)`, `CALM`, `EXCITED`, `URGENT`, `THOUGHTFUL`, `PLAYFUL`, `DRAMATIC`, `GENTLE`, `AUTHORITATIVE`
- **Preview** button: still works, speaks a sample phrase in the selected mood
- Remove the 20-voice grid/picker entirely

### CLAUDE.md changes

The voice selection instructions simplify from "always pass `auto` as the profile" to "always pass `auto` as the mood" with the same zero-model-involvement guarantee. The `[voice: X]` override syntax changes from profile names to mood names (e.g., `[voice: dramatic]`).

## 7. MIGRATION PATH

### Phase 1: Voice selection (30 min)
- Decide on HAL voice (narrator interim or custom)
- Record/source 4 mood reference samples (neutral, energetic, concerned, warm)
- Place in `~/.claude/voicebox/samples/hal/`

### Phase 2: tts.py rewrite (1.5 hr)
- Add `MOOD_PARAMS` dict with per-engine parameters
- Add `auto_select_mood()` function (reuses `_detect_tone()` + personality slider modulation)
- Rewrite `tts_chatterbox()` to use mood params + HAL reference samples
- Rewrite `tts_elevenlabs()` to use single voice ID + mood-adjusted stability/style/tags
- Rewrite `tts_edge()` to use single voice + SSML prosody adjustments
- Backward compat: old profile names in argv silently map to `calm`
- Keep `orc` as a special case (still uses orc reference sample + max exaggeration)

### Phase 3: Generate + listen test (30 min)
- Generate all 9 moods x 1 test phrase each via CLI
- Listen, compare, adjust parameters
- This is the critical tuning step -- numbers in the table above are starting points

### Phase 4: Frontend migration (1 hr)
- Replace voice profile dropdown/grid with mood picker in SettingsMenu.tsx
- Update `useSettings.ts`: remove `VOICE_PROFILES`, add `MOOD_PRESETS`
- Update `ipc-voice.ts` to pass mood instead of profile
- Wire preview button to new mood system

### Phase 5: Documentation + cleanup (30 min)
- Update CLAUDE.md voice instructions
- Update MEMORY.md
- Remove unused voice sample directories (keep backups)
- Full test: all moods on Chatterbox, Edge TTS fallback, and "zog zog" override

### Total estimated effort: ~4 hours

## 8. WHAT WE LOSE AND HOW WE COMPENSATE

| V9 had | V10 answer |
|---|---|
| 20 distinct character voices | 1 voice with 8+ distinct moods -- more appropriate emotional range |
| "Fun surprise" of random characters | Personality sliders + mood variety provide engagement without identity whiplash |
| Orc mode (zog zog) | Preserved as a special mood -- same orc reference, max exaggeration, no change |
| Voice preview grid in Settings | Mood preview with same HAL voice, hear the range |
| Late night soft/asmr profiles | Late night -> `gentle` mood (same effect, one voice) |
| Profile rotation (never repeat) | No longer needed -- moods repeat naturally based on context |

The key reframe: V9's variety was *character* variety. V10's variety is *emotional* variety. The latter is what real AI assistants need. Nobody wants their GPS to switch between Morgan Freeman and a pirate depending on whether you're on a highway or lost.

## 9. FUTURE EXTENSIONS

- **Voice casting page**: Let users audition different base voices (record their own, pick from library) and set THE HAL voice. The mood system stays the same regardless of which voice is chosen.
- **Mood blending**: Instead of discrete moods, interpolate between two moods (e.g., 60% calm + 40% playful). The MOOD_PARAMS values are all floats, so linear interpolation is trivial.
- **Per-context mood memory**: Track which moods worked well for which types of content (build results, code explanations, errors) and auto-tune the mood detection weights over time.
- **CosyVoice2 integration**: When French support lands, CosyVoice2 can use the same mood parameter architecture with its own emotion control knobs.
- **Streaming TTS**: Chatterbox streaming (davidbrowne17/chatterbox-streaming) would let moods respond in real-time to content changes mid-sentence.

---

*Design created 2026-03-24. Based on research into Chatterbox (exaggeration + cfg_weight params), ElevenLabs (stability + style + text tags), and Edge TTS (SSML prosody). Incorporates findings from the V10 voice casting prototype at `temp/20260324/`.*
