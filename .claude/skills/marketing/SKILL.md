---
name: marketing
description: "Generate HAL-O marketing/landing page from current project state. /marketing [variant]"
argument-hint: "[landing|features|changelog|pitch]"
user-invocable: true
---

# HAL-O Marketing Page Generator

Generate a production-grade marketing HTML page for HAL-O. Always reads current state from:
- `MEMORY.md` (project memory — architecture, features, components)
- `project_todo_backlog.md` (what's new, what's coming)
- `README.md` (existing copy)
- Recent `git log --oneline -20` (latest work)

## Positioning

ALWAYS read `positioning.md` from this skill's directory first. It defines the three audiences (hardcore devs, casual devs, newcomers), killer differentiators vs raw CLI, and the emotional pitch. Every page must speak to at least two of the three audiences.

## Brand Identity

- **Name**: HAL-O
- **Tagline**: "Mission Control for Developers"
- **Logo**: `https://raw.githubusercontent.com/HAL-XP/HAL-O/master/build/icon.png`
- **Palette**: Dark (#07080d), Cyan (#00e5ff), Green (#39ff14), Red (#ff3366), Amber (#ffb300)
- **Fonts**: Orbitron (headers), JetBrains Mono (code), Inter or similar sans-serif (body)
- **Tone**: Sci-fi mission control meets developer tool. Confident, technical, slightly dramatic. NOT corporate. NOT generic AI slop.
- **Repo**: https://github.com/HAL-XP/HAL-O

## Key Selling Points (always include)

1. **3D Holographic Hub** — PBR renderer with bloom, reflective floor, orbital screen panels
2. **Embedded Terminal** — xterm.js + node-pty, split panes, drag tabs, voice output
3. **20 Voice Profiles** — Chatterbox TTS, push-to-talk, personality sliders (TARS system)
4. **3 Renderers** — PBR Holographic, Basic Holographic, Classic CSS+Three.js
5. **Telegram Integration** — voice messages, AFK mode, remote control
6. **/hal Command Center** — single slash command for 20+ actions
7. **Zero-Config Import** — scan, summarize, enlist projects in seconds
8. **10 Layouts** — dual-arc, spiral, DNA helix, hemisphere, arena, grid-wall...
9. **GPU Auto-Detection** — preset wizard, auto-dismiss countdown
10. **Open Source** — fork it, extend it, make it yours

## Variants

- **`landing`** (default): Full marketing landing page — hero, features, screenshots placeholders, architecture, getting started, community. Animated particles, scroll reveals, parallax.
- **`features`**: Deep-dive feature showcase — one section per major feature with technical details, animated demos where possible.
- **`changelog`**: What's new page — reads git log + backlog, groups by session, highlights with screenshots.
- **`pitch`**: One-pager elevator pitch — hero + 3 killer features + CTA. Ultra-concise, shareable.

## Output

Save to `<project-root>/temp/marketing-<variant>.html` and open in browser automatically.

## HARD RULES
- **ALWAYS demo mode — ZERO EXCEPTIONS** — set `hal-o-demo-mode=true` in localStorage BEFORE any screenshot or page generation. NEVER leak real project names, paths, or repo URLs. This is a SECURITY rule, not a preference. Violation = leaked business info. Before embedding ANY image, verify it contains only demo project names. If in doubt, retake.
- **Camera close enough** — cards must be READABLE in screenshots (stats, buttons, activity bars visible). Use `window.__haloPhotoMode.closeUp()` or `heroAngle()`.
- **Accurate commands** — our keywords are PLAIN TEXT (no `/` prefix): `test`, `push`, `nuke`, `clean`, `qa`, `perf`, `wazzup`, etc. The `/hal` skill is the menu. NEVER invent commands that don't exist. Read `hal-slash-command-menu.txt` for the real list.
- **"Hal" in voice text** — write "Hal" not "HAL-O" when text will be spoken by TTS.

## Screenshot Review Page
After taking screenshots, ALWAYS generate an HTML review page at `<project-root>/temp/marketing-review.html` with:
- Each screenshot displayed at readable size
- Three buttons per shot: YES (approve), NO (reject), OTHER (alternative angle/setting)
- A text input per shot for feedback/notes (e.g. "too far", "wrong theme", "love this one")
- A "Generate Prompt" button that compiles all feedback into a copy-pasteable prompt for the next iteration
- The page saves state to localStorage so feedback isn't lost on refresh

## Versioned Shot Script
After generating any marketing page or screenshots, ALWAYS save a manifest file at `<project-root>/temp/marketing-manifest-<YYYYMMDD>.json` containing:
```json
{
  "date": "2026-03-25",
  "version": "v3",
  "screenshots": [
    { "file": "hero.png", "theme": "tactical", "layout": "dual-arc", "sphereStyle": "wireframe", "cardCount": 15, "activity": 60, "camera": [5, 8, 14], "photoMode": ["setActivity(60)", "setAudioDemo(true)"] },
    ...
  ],
  "pageFile": "marketing-landing-v3.html",
  "demoMode": true,
  "notes": "..."
}
```
This lets us reproduce the exact same shots with new features without guessing. Previous manifests stay for history.

## Ambition Standard (HARD RULE)
Default target: 8-9/10 on the ambition meter. The user rates their OWN best ideas as 5/10 — that's your FLOOR, not your ceiling. If the user's instinct is already a 5, your job is to take it to 8-9. Never present something at or below the user's self-assessed level.

Before finalizing ANY section:
1. Rate the obvious version (if ≤ user's level, reject it)
2. Ask "what would make someone stop scrolling?"
3. Design the EXPERIENCE, not the feature
4. Connect multiple capabilities into one moment
5. Generate 3-5 variations, pick the best

Read `project_vision.md` and `feedback_ambition_process.md` from project memory for the full framework.

## Quality Bar

- Must look like it belongs on Product Hunt or Hacker News front page
- Animated elements: particle canvas, glitch text, smooth scroll reveals, parallax
- Responsive (mobile-friendly)
- Every section should make someone want to `git clone` immediately
- Reference `html-rules.md` from this project's skills for layout rules (actions near content, grid over stack, etc.)
- NOT generic — if it looks like every other AI-generated landing page, start over
