# HAL-O Development Log

## Session 6 — 2026-03-25 21:00 → 2026-03-26 02:30 CET
- **Human hours**: ~5.5h active (user on Telegram voice, 200+ messages)
- **Agent hours**: ~5.5h continuous + ~30 background agents running parallel
- **Estimated total compute**: ~15h equivalent (parallel agents)
- **Token usage**: 61% of 1M context at 02:30 CET
- **Commits**: 0 (all work uncommitted — demo specs, agents, tools, memory)

### Summary
Demo video production (8 iterations), deep process retrospective, Anthropic integration research, perf analysis, theme exploration. Major debugging breakthrough on sphere audio reaction.

### Key Achievements
- Demo video V8: smooth 60fps approach, sphere reacts to real voice FFT (confirmed via frame comparison)
- detect_teleport.py: automated camera smoothness validation tool
- 4 specialized agents (.claude/agents/): 3d-visual, terminal-core, audio-voice, qa-ux
- Anthropic integration analysis: Agent Teams, Auto Mode, StatusLine, 25 hooks
- Performance analysis: 3 critical issues, 7 quick wins identified
- Memory separation architecture: agent-scoped cascade (9/10 score)
- 16 theme + 8 sphere screenshots with comparison pages
- Voice decision: Hal (butler) + Hallie (soft), no gender labels
- Demo locked spec JSON: single source of truth for recordings
- Frustration hook installed: regex detects repeated failure patterns
- SessionStart hook: auto-resumes after compaction
- 1hr idle loop: autonomous backlog work

### Critical Root Causes Found
1. **AnalyserNode NULL**: lazy init never fires in Playwright (no user interaction). Fix: manual creation.
2. **setAudioDemo override**: line 953 PbrHoloScene.tsx returns fake sine waves, ignoring real FFT. Fix: never call it.
3. **gdigrab no audio**: cannot capture desktop audio without loopback device. VB-Cable installed but routes wrong. Fix: OBS WebSocket.
4. **Camera teleport**: animateCamera→OrbitControls handoff. Fix: zero-handoff, OrbitControls from frame 1.

### Process Failures & Lessons
- **Assumed instead of verified**: shipped 8 videos without checking audio waveform or sphere pixel change
- **Fast mode over diagnosis**: jumped to patches instead of writing 10-line diagnostic test that solved everything
- **Same issue recurring 3+ times**: audio missing, sphere not reacting — each "fixed" but kept coming back
- **The turning point**: audio-debug2.spec.ts proved AnalyserNode was NULL in 10 seconds. One test > 8 iterations.

### Prevention Mechanisms
1. Frustration hook (regex → stop + analyze)
2. Two-strike rule (same issue fails twice → diagnostic test mandatory)
3. Pre-flight validation (audio volume, sphere change, no teleports)
4. Progressive elaboration (fast gut check → deep analysis follow-up)
5. Context-aware compaction (compact after milestones, not just when forced)

### Backlog Items Added
- OBS WebSocket recording integration
- Voice cleanup (Hal + Hallie only)
- Perf quick wins (7 items)
- Theme refactor with sliders (4 params)
- Memory separation implementation (3hr migration)
- Private GitHub repo for HTML hosting
- Settings dockable side pane
- Vidushi Nudge (feedback reminder timer)
- GPU queue (dynamic VRAM check)
- Frustration keyword multilingual (FR + Quebec)

---

## Session 5 — 2026-03-24/25 (massive overnight)
[See MEMORY.md Session 5 section for details]
- B34 teleport fix, 5 skills, Photo Mode API
- UX2-UX11 features, B36-B37 fixes
- Marketing screenshots, 3 teaser videos
- 20+ feedback rules, project vision docs
