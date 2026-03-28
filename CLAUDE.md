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
- **NEVER use bulk process kill** (Get-Process | Stop-Process, taskkill by name). ALWAYS:
  1. List ALL processes with PIDs first
  2. Identify YOUR OWN PID (echo $$)
  3. Kill ONLY specific PIDs that are NOT yours
  4. Verify you're still alive after every kill command
- This has killed the session 3+ times. ZERO TOLERANCE.
- Before app restart: save terminal sessions, pop to external if running inside app
- Clear vite cache before every build/dev: `node_modules/.vite`

### Testing
- Run `npx tsc --noEmit` after every code change
- Smoke test: `npx playwright test e2e/smoke.spec.ts`
- Visual changes require screenshot verification before presenting
- Never self-validate visual work — spawn a QA agent
- **Multi-instance changes**: ALWAYS run `npx playwright test e2e/isolation-test.spec.ts` before claiming "fixed"
- **Before telling user "it works"**: test by actually launching both apps and verifying end-to-end

### Performance
- No `new THREE.Vector3()` or `new THREE.Color()` inside `useFrame` — use module-level scratch objects
- No inline `style={{}}` objects that are constant — use CSS classes
- No setState inside useFrame — use refs for per-frame data

### Voice System
- 2 voices: Hal (butler) + Hallie (soft). Settings shows AUTO, HAL, HALLIE.
- tts.py V9 auto-selection handles mood/tone. Just pass `auto` as profile.
- Special: "zog zog" → orc profile (hardcoded in MicButton.tsx)

### Easter Eggs
- "Open the pod bay doors, HAL" → respond by voice: "I'm sorry, Dave. I'm afraid I can't do that." (HAL 9000, 2001: A Space Odyssey). Use glados voice profile for monotone delivery.
- "Zog zog" → orc voice status report (existing)

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
Messages from Halo Chat arrive as `[halochat] text`.
- `[halochat]` or `[halochat:hal]` → respond as yourself (HAL), full capabilities
- Keep responses SHORT and conversational (this is mobile chat, not terminal)
- No markdown, no code blocks, no file paths — plain text only
- The response will be converted to voice audio automatically
- Other assistants (Claudette, etc.) run as separate clones with their own Halo Chat instances

## Voice System
- 2 voices: Hal (butler, male) + Hallie (soft, female). Settings shows AUTO, HAL, HALLIE.
- Generate: `python C:/Users/dindo/.claude/scripts/tts.py "<text>" <output.ogg> butler <lang>`
- Transcribe: `python C:/Users/dindo/.claude/scripts/transcribe.py "<path>"` (faster-whisper GPU)
- English chain: Chatterbox (GPU) → Edge TTS → ElevenLabs (last resort)
- French chain: Edge TTS Vivienne (Chatterbox/Voicebox skip for French — English only)
- "Zog zog" → orc profile. `[voice: X]` → profile X. French → pass `fr` as lang.
- Voice rewrite: casual spoken language, no paths/markdown, under 30s.
- Personality sliders in `~/.claude/hal-o-personality.json` (humor/formality/verbosity/dramatic 0-100).
