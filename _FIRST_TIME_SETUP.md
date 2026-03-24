# HAL-O First-Time Setup Guide

## Quick Start

Double-click **`START_HERE.bat`** and follow the prompts. It handles everything automatically.

If something went wrong, read on.

---

## Requirements

| What | Minimum | Recommended | Why |
|------|---------|-------------|-----|
| **Node.js** | 18.0.0 | 22+ LTS | Runtime for Electron |
| **npm** | 8+ | (comes with Node) | Package manager |
| **VS Build Tools** | 2022 | 2022 with C++ workload | Compiles node-pty (terminal engine) |
| **Windows** | 10 (1903+) | 11 | ANSI colors, winget |
| **RAM** | 4 GB | 8+ GB | Three.js + Electron |
| **GPU** | Any | Dedicated GPU | WebGL for 3D renderer |

---

## Step-by-step manual setup

If `START_HERE.bat` didn't work, follow these steps manually.

### 1. Install Node.js

Download from [https://nodejs.org](https://nodejs.org/en/download/) — pick the **LTS** version.

Or via command line:
```
winget install OpenJS.NodeJS.LTS
```

Verify:
```
node --version
npm --version
```

### 2. Install Visual Studio Build Tools

This is needed for **node-pty**, which powers HAL-O's embedded terminal. If you skip this, HAL-O still works but without the terminal feature.

**Option A: winget (recommended)**
```
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

**Option B: Manual download**
1. Go to [https://visualstudio.microsoft.com/visual-cpp-build-tools/](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Download "Build Tools for Visual Studio 2022"
3. In the installer, check **"Desktop development with C++"**
4. Click Install (~2 GB)

### 3. Install dependencies

```
cd D:\GitHub\hal-o
npm install
```

If this fails with node-pty errors, see the **node-pty troubleshooting** section below.

### 4. Patch and rebuild node-pty

HAL-O needs specific patches to node-pty for Windows compatibility. The setup script applies these automatically, but here's the manual process:

**Patch 1: GetCommitHash.bat**

Edit `node_modules/node-pty/deps/winpty/src/shared/GetCommitHash.bat`:
```bat
@echo off
echo none
exit /b 0
```

**Patch 2: GenVersion.h**

Create the file `node_modules/node-pty/deps/winpty/src/gen/GenVersion.h`:
```c
#define VERSION_MAJOR 0
#define VERSION_MINOR 4
#define VERSION_REVISION 3
#define VERSION_BUILD 1
#define GenVersion_Version "0.4.3"
#define GenVersion_Commit "none"
```

**Patch 3: winpty.gyp COMMIT_HASH**

In `node_modules/node-pty/deps/winpty/src/winpty.gyp`, find the line with `WINPTY_COMMIT_HASH` and make sure it reads:
```
'WINPTY_COMMIT_HASH%': 'none',
```

**Patch 4: SpectreMitigation**

In both `node_modules/node-pty/binding.gyp` and `node_modules/node-pty/deps/winpty/src/winpty.gyp`, add inside any `'conditions'` block that has `'OS=="win"'`:
```
'msvs_configuration_attributes': {
    'SpectreMitigation': 'false'
},
```

**Rebuild:**
```
powershell -ExecutionPolicy Bypass -File _scripts/_rebuild.ps1
```

### 5. Build and launch

```
npx electron-vite build
npm run dev
```

---

## Troubleshooting

### node-pty build fails

**Symptom:** `npm install` shows errors about `node-pty`, `gyp`, or `cl.exe`.

**Cause:** Missing C++ compiler.

**Fix:**
1. Install Visual Studio Build Tools (see step 2 above)
2. Open a **new** terminal (the PATH needs to refresh)
3. Delete `node_modules` and run `npm install` again:
   ```
   rmdir /s /q node_modules
   npm install
   ```
4. Apply patches and rebuild (step 4)

### "The term 'cl.exe' is not recognized"

The C++ compiler isn't in your PATH. This is normal — the rebuild script uses `VsDevCmd.bat` to set up the environment. Make sure Visual Studio Build Tools are installed, then run:
```
powershell -ExecutionPolicy Bypass -File _scripts/_rebuild.ps1
```

### npm install hangs or is extremely slow

- Check your internet connection
- Try clearing the npm cache: `npm cache clean --force`
- If behind a corporate proxy, configure npm: `npm config set proxy http://your-proxy:port`

### "EACCES" or permission errors

- Don't run `npm install` as Administrator unless you have to
- If you must, use: `npm install --unsafe-perm`

### App launches but shows white/blank screen

- Run `npx electron-vite build` first, then `npm run dev`
- Check the DevTools console (Ctrl+Shift+I in the app) for errors
- Try deleting `out/` and rebuilding: `rmdir /s /q out && npx electron-vite build`

### App launches but terminal doesn't work

- node-pty wasn't built correctly. Follow step 4 (patch and rebuild)
- Check `_setup.log` for rebuild errors
- The 3D dashboard and all other features still work without node-pty

### "Cannot find module 'electron'"

```
npm install
```

### Build fails with TypeScript errors

```
npx electron-vite build 2>&1
```
Look at the error output. Common fixes:
- `npm install` (missing types)
- Delete `node_modules/.vite` cache

### winget is not recognized

winget is pre-installed on Windows 11 and recent Windows 10. If missing:
1. Open the Microsoft Store
2. Search for "App Installer"
3. Install/update it

Alternatively, install Node.js and VS Build Tools manually from their websites.

### "Execution of scripts is disabled on this system" (PowerShell)

The rebuild script needs PowerShell execution policy. Run:
```
powershell -ExecutionPolicy Bypass -File _scripts/_rebuild.ps1
```
The `-ExecutionPolicy Bypass` flag handles this. If START_HERE.bat already uses it, this shouldn't be an issue.

### Setup log location

Every run of `START_HERE.bat` writes a detailed log to:
```
D:\GitHub\hal-o\_setup.log
```
Include this file if you open a GitHub issue.

---

## After setup

- **Launch HAL-O:** Double-click `_LAUNCH_APP.bat`
- **Create shortcuts:** Run `powershell -File _scripts/_create_shortcut.ps1` for Start Menu and Desktop shortcuts
- **Update:** `git pull && npm install` — then re-run START_HERE.bat if native modules changed

---

## Architecture overview

HAL-O is an Electron app with:
- **Three.js** 3D holographic dashboard (the main view)
- **xterm.js + node-pty** embedded terminal (needs C++ build tools)
- **React 19** UI framework
- **electron-vite** build system

The native module (node-pty) is the only component that needs C++ compilation. Everything else is pure JavaScript/TypeScript.
