---
description: Multi-instance clone architecture
---
- Main instance (no instance.json): data in ~/.hal-o/
- Clone instances (with instance.json): data in ~/.hal-o/instances/<id>/
- Each clone: unique port (19400=HAL, 19410=work, 19420=personal)
- Key: src/main/instance.ts — dataPath() and getPort()
- After npm install: powershell -ExecutionPolicy Bypass -File _scripts/_rebuild.ps1
