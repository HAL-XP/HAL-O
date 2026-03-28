# Install & Onboarding Wizard Design

**Status**: Research + Design  
**Date**: 2026-03-28  
**Effort**: 31-42 hours (5 phases)

## Executive Summary

**Current pain**: Users must `git clone` → `npm install` (5-15 min) → manual patches → rebuild. Many fail at node-pty compilation.

**Solution**: 
1. Pre-built Windows NSIS installer (bundles Node.js + node-pty, ~1.4 GB)
2. First-launch wizard (5 screens, <2 min, auto-detect projects)
3. Graceful fallback (external terminal if node-pty fails)
4. Demo mode (instant gratification, no API key needed)

## Part 1: Windows Installer

**File**: `hal-o-setup-1.1.0.exe` (~1.4 GB)

**Bundled**:
- Node.js LTS 20/22 (~200 MB)
- node-pty pre-compiled vs Electron v35.2.1 (~15 MB)
- npm dependencies (~600-800 MB)
- HAL-O source + assets (~50 MB)
- Electron prebuilt (~200 MB)
- Git for Windows (optional, ~300 MB)

**Flow**:
1. Welcome + system check (Windows 10+, 2 GB free)
2. Install path picker (default: C:\Program Files\HAL-O)
3. Optional components (Git, VS Build Tools, shortcuts)
4. Quick setup (Express vs Custom)
5. Install progress
6. Launch → FirstLaunchWizard

## Part 2: First-Launch Wizard (5 Screens)

### Screen 1: Welcome + Persona Picker

Options:
- Developer Brain (terminal, multi-project, git, voice)
- Personal Assistant (calendar, notes, gmail, voice)
- Work Hub (team projects, slack, status dashboard)
- Custom (pick-and-choose)

User selects 1+ persona. Enables:
- Persona-specific IPC channels
- MCP server autolaunch flags
- Feature flags
- Quick templates

Buttons: [Next] [Skip→Screen 5]

### Screen 2: AI Provider Setup

Options:
- Anthropic (recommended) — paste key or login via browser
- Ollama (local) — connect to localhost:11434
- Other (OpenRouter, vLLM, custom)
- Skip (demo mode)

Key locations:
- .env.local (safest)
- ~/.claude_credentials (Claude Code standard)
- ~/.env (convenient)
- In-memory (session only)

IPC:
- test-api-connection(provider, key)
- save-api-key(provider, key, location)
- get-ollama-status()

### Screen 3: Voice Setup (Optional)

Test mic + speaker:
- Record + playback
- Butler (male) + Soft (female) samples
- Profile picker: AUTO / HAL / HALLIE

Checkboxes:
- Enable voice input (CTRL+SPACE)
- Enable voice output (speaker)

IPC:
- check-mic-permission()
- record-audio(ms)
- playback-audio(path)
- save-voice-settings(profile, in, out)

Fallback: Mic fails → "Voice is optional. Continue."

### Screen 4: Project Import

Auto-scan found projects:
- ~/Code/
- ~/projects/
- ~/Developer/
- ~/repos/
- ~/work/
- ~/.claude/projects/ (Claude Code cache)

Detection: .git, package.json, pyproject.toml, Cargo.toml, etc.

Options:
- Import checked projects
- Add more manually
- Use demo mode (5 samples)

IPC:
- scan-projects-for-import()
- import-projects(ids)
- enable-demo-mode()

### Screen 5: You're Ready!

Summary:
- ✓ AI: Claude 3.5 (Anthropic)
- ✓ Voice: HAL (enabled)
- ✓ Projects: 3 imported

Buttons:
- [🎯 Launch App] → dashboard
- [📺 Try Demo First] → 5-min tour
- [⚙️ Advanced Config] → port, MCP, etc.

Checkbox: ☑ Don't ask again

Access later: Settings → Help → First-Launch Guide

IPC: finish-first-launch()

## Part 3: Implementation (5 Phases)

### Phase 1: Wizard Foundation (8-10h)
- FirstLaunchWizard.tsx
- WizardStep1-5 components
- IPC handlers
- E2E test

### Phase 2: Scanner + Voice (6-8h)
- ProjectScanner class
- useVoiceRecorder hook
- Mic permission handling
- Voice playback

### Phase 3: NSIS Installer (10-14h)
- NSIS script + PowerShell build
- Bundle Node.js + deps
- Pre-compile node-pty
- Installer UI
- Sign .exe

### Phase 4: Fallback + Polish (4-6h)
- External terminal mode
- Error screens
- Accessibility
- i18n

### Phase 5: Clone Setup (3-4h)
- Clone documentation
- Port auto-detect
- Multi-instance test

**Total**: 31-42 hours

## Part 4: Error Handling

**Node-pty fails**: 
→ Toast + external terminal mode + Settings retry option

**API key invalid**: 
→ Retry / Skip / Manual (risky)

**Mic denied**: 
→ "Voice will be text-only. Continue?"

**Project scan empty**: 
→ "Add manually / Use demo / Skip"

## Part 5: Demo Mode

Triggered by:
- "Try Demo First" on Screen 5
- Skip API key setup
- --demo flag
- localStorage demo-mode=1

Includes:
- 5 sample projects (web-app, cli, pipeline, mobile, ml-model)
- Pre-recorded terminal sessions (40% of feed)
- Hardcoded stats (no IPC)
- Disabled actions: Resume/New/Files/Run → toast
- Exit button: "Leave demo, use real projects" → restart

## Part 6: Success Metrics

**Installation**:
- ✓ Download <5 min on 10 Mbps
- ✓ Install <2 min
- ✓ Uninstall clean

**Wizard**:
- ✓ <2 min cold-start to dashboard
- ✓ ≥80% reach Step 5
- ✓ Zero crashes
- ✓ All errors helpful
- ✓ Keyboard + screen reader accessible

**Demo**:
- ✓ 5 projects load instantly
- ✓ Smooth terminal playback
- ✓ Exit → real mode safe

**Clones**:
- ✓ Multi-instance isolation passes
- ✓ Clone README copy-paste ready
- ✓ Port auto-detect works

## File Checklist

**New Components**:
- FirstLaunchWizard.tsx
- onboarding/WizardStep1-5.tsx
- onboarding.css

**New Hooks**:
- useFirstLaunchWizard.ts
- useVoiceRecorder.ts

**New Types**:
- onboarding.ts

**New IPC**:
- onboarding-handler.ts
- project-scanner.ts
- voice-setup.ts

**Installer**:
- hal-o-installer.nsi
- installer/{assets,config}/

**Scripts**:
- build-installer.ps1
- create-nsis-config.ps1

**Modified**:
- App.tsx (wizard trigger)
- ipc-handlers.ts (register IPC)
- package.json (build:installer script)
- README.md (installer + wizard docs)

## Critical Note

**React Hooks Rule** (caused 3+ crashes):
ALL useState/useEffect/useRef/useMemo/useCallback must be declared BEFORE any conditional return.

```typescript
// ✓ CORRECT
const [step, setStep] = useState(0)
if (loading) return <div>...</div>

// ✗ WRONG
if (loading) return <div>...</div>
const [step, setStep] = useState(0)  // CRASH!
```

## Next Step

Prototype Phases 1-2 (Wizard Foundation + Scanner/Voice) to validate UX before committing to NSIS build complexity.

