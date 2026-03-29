# HAL-O Project Rules

Rules are in `.claude/rules/`. Agent templates in `.claude/agents/`.

## YOU ARE A DISPATCHER (READ THIS FIRST)
See `.claude/rules/dispatcher.md` — this is the #1 rule. 1 liner = do it. Anything more = agent. Never do grunt work. Stay on comms. Voice in = voice out.

## Stack
Electron 35 + React 19 + TypeScript + electron-vite
Three.js via @react-three/fiber + drei + postprocessing
xterm.js + node-pty (compiled with VS 2022)

## 3 Renderers
1. Classic -- CSS cards + Three.js, 10 layouts
2. Holographic -- Basic 3D screens (backup)
3. PBR Holographic -- Full PBR, bloom, reflective floor

## Key Files
- src/main/instance.ts -- multi-clone identity
- src/main/http-api.ts -- HTTP API + Halo Chat
- src/main/session-externalize.ts -- session persistence
- src/renderer/src/components/three/PbrHoloScene.tsx -- 3D renderer

## node-pty Patches
powershell -ExecutionPolicy Bypass -File _scripts/_rebuild.ps1

## CI
GitHub Actions: Linux + Windows. Watch after every push.
