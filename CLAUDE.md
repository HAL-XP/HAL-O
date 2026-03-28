# HAL-O Project Rules

## Stack
- Electron 35 + React 19 + TypeScript + electron-vite
- Three.js via @react-three/fiber + drei + postprocessing
- xterm.js + node-pty (native, compiled with VS 2022)
- Voice: STT (faster-whisper GPU), TTS (Chatterbox/Voicebox/Edge TTS)

## 3 Renderer Modes
1. **Classic** — CSS cards + Three.js background, 10 layouts
2. **Holographic** — Basic 3D screens (backup)
3. **PBR Holographic** — Full PBR with bloom, reflective floor, ring platform

## Critical Rules

### React Hooks
ALL `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback` MUST be declared BEFORE any conditional return. This has caused crashes 3+ times. No exceptions.

### Process Management
- Never kill `electron.exe` by name — always by PID
- Before app restart: save terminal sessions, pop to external if running inside app
- Clear vite cache before every build/dev: `node_modules/.vite`

### Testing
- Run `npx tsc --noEmit` after every code change
- Smoke test: `npx playwright test e2e/smoke.spec.ts`
- Visual changes require screenshot verification before presenting
- Never self-validate visual work — spawn a QA agent

### Performance
- No `new THREE.Vector3()` or `new THREE.Color()` inside `useFrame` — use module-level scratch objects
- No inline `style={{}}` objects that are constant — use CSS classes
- No setState inside useFrame — use refs for per-frame data

### Voice System
- 2 voices: Hal (butler) + Hallie (soft). Settings shows AUTO, HAL, HALLIE.
- tts.py V9 auto-selection handles mood/tone. Just pass `auto` as profile.
- Special: "zog zog" → orc profile (hardcoded in MicButton.tsx)

### Demo Mode
- Demo cards disable Resume/New/Files/Run — show toast instead
- Demo terminals pre-fill with 40% of feed content on mount
- Demo stats bypass IPC (demoStats prop)

## Multi-Instance (Clones)
HAL-O supports running multiple instances from separate repo clones.
Each clone gets isolated data, ports, and identity.

- **Main instance** (this repo, no `instance.json`): data in `~/.hal-o/`
- **Clone instances** (with `instance.json`): data in `~/.hal-o/instances/<id>/`

### Clone Setup
1. Clone the repo: `git clone https://github.com/HAL-XP/hal-o.git work-assistant`
2. Copy `.gitignore.clone` to `.gitignore` (overwrites the main one)
3. Copy `instance.example.json` to `instance.json`, edit `id`, `name`, `port`
4. Each clone needs a unique `port` (19400=HAL, 19410=work, 19420=personal, etc.)
5. Run `npm install` + rebuild node-pty patches
6. Data (tree, aliases, favorites, model routing) is per-instance in `~/.hal-o/instances/<id>/`
7. OneDrive syncs `~/.hal-o/` for backup across all instances

### Instance Config (`instance.json`)
```json
{"id": "work-assistant", "name": "Work Assistant", "port": 19410}
```
Key: `src/main/instance.ts` — all modules import `dataPath()` and `getPort()` from here.

## Key Files
- `src/renderer/src/components/three/PbrHoloScene.tsx` — Main PBR renderer (~3500 lines)
- `src/renderer/src/hooks/useSettings.ts` — All settings state
- `src/renderer/src/components/SettingsMenu.tsx` — Settings UI
- `src/renderer/src/components/ProjectHub.tsx` — Hub switching renderers
- `src/main/terminal-manager.ts` — PTY lifecycle
- `src/main/ipc-handlers.ts` — All IPC channels

## node-pty Patches
After `npm install`, reapply patches:
```
powershell -ExecutionPolicy Bypass -File _scripts/_rebuild.ps1
```

## CI
- GitHub Actions: Linux + Windows matrix
- Smart TG notifications (first-red + recovery only)
- Watch CI after every push — fix failures before moving on

## Halo Chat (Mobile PWA Bridge)
Messages from Halo Chat arrive as `[halochat] text` or `[halochat:agent] text`.
- `[halochat]` or `[halochat:hal]` → respond as yourself (HAL), full capabilities
- `[halochat:bob]` → respond as Bob, a professional work assistant. Keep it concise, actionable, English.
- `[halochat:karen]` → respond as Karen, a personal assistant. Casual, friendly, French by default.
- Keep responses SHORT and conversational (this is mobile chat, not terminal)
- No markdown, no code blocks, no file paths — plain text only
- The response will be converted to voice audio automatically
- You have full context from this session — use it. Bob/Karen can reference what HAL knows.

## Voice System
- 2 voices: Hal (butler) + Hallie (soft). Pass `auto` to tts.py — V9 handles mood/tone.
- Generate: `python C:/Users/dindo/.claude/scripts/tts.py "<text>" <output.ogg> auto <lang> [--play]`
- Transcribe: `python C:/Users/dindo/.claude/scripts/transcribe.py "<path>"` (faster-whisper GPU)
- Chain: Chatterbox (GPU) → Voicebox → Edge TTS → ElevenLabs (last resort)
- "Zog zog" → orc profile. `[voice: X]` → profile X. French → `fr`.
- Voice rewrite: casual spoken language, no paths/markdown, under 30s, match personality sliders.
- Personality sliders in `~/.claude/hal-o-personality.json` (humor/formality/verbosity/dramatic 0-100).
- Presets: DEFAULT, SERIOUS, TARS, MOVIE, BUTLER, CHAOS.
