# Intro Tutorial Design

HAL-guided onboarding for new users. 5 steps, skippable, personality-driven.

---

## Approach: Spotlight + HAL Narration (hybrid)

Not a generic tooltip tour. Not a side panel. A **focused spotlight overlay** where HAL speaks each step -- one element highlighted at a time, dark backdrop on everything else, HAL's voice narrating if voice output is enabled. Think Arc Browser's theatrical intro crossed with Linear's minimal spotlight.

**Why this over alternatives:**
- Tooltip tours (Shepherd.js style) feel like enterprise SaaS -- not HAL
- Side panel walkthroughs (VS Code) break immersion in a 3D scene
- Spotlight + voice lets HAL's personality carry the experience
- The 3D scene stays visible behind the dimmed overlay -- the user sees their dashboard, not a blank onboarding screen

## Trigger

- Fires **after** SetupScreen completes (prerequisites checked, API key saved)
- First launch only -- gate on `localStorage.getItem('hal-tutorial-done')`
- If user has projects already scanned (returning user, fresh install), skip entirely
- Can be re-triggered from Settings > "Replay intro tour"

## Component: `<IntroTutorial />`

Single React component, rendered in App.tsx above everything else (portal to body or high z-index). Self-contained state machine, no prop drilling needed.

### State

```ts
interface TutorialState {
  step: 0 | 1 | 2 | 3 | 4 | null  // null = dismissed
  visible: boolean
}
```

### Rendering

- **Backdrop**: `position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9998`
- **Spotlight cutout**: CSS `clip-path` or `mix-blend-mode` to reveal the target element. Get target rect via `document.querySelector(selector).getBoundingClientRect()`
- **HAL card**: Floating card near the spotlight with HAL's text. Styled like a HUD element (border glow, monospace header, translucent background). Positioned intelligently -- above/below/left/right of target based on available space.
- **Controls**: "Next" button (primary), "Skip tour" link (subtle, always visible), step dots (1-5)
- **Transitions**: Spotlight slides between targets (200ms ease-out), card fades in (150ms)

## The 5 Steps

### Step 0: Welcome
- **Target**: HAL sphere (center of 3D scene)
- **Spotlight**: Circular glow around the sphere
- **HAL says**: "I'm HAL. This is your command center. Let me show you around -- it'll take 30 seconds."
- **Voice** (if enabled): Speak the line via tts.py with `auto` profile
- **Action**: "Let's go" button / "Skip" link
- **Event bus**: None (just framing)

### Step 1: Settings
- **Target**: Settings gear icon (`[data-tutorial="settings-gear"]` -- add this attribute)
- **Spotlight**: Highlight the gear
- **HAL says**: "This is Settings. Renderer, voice, theme, fonts -- everything lives here. Open it."
- **Action**: "Try it" button dispatches `window.dispatchEvent(new CustomEvent('hal-open-settings'))`. Step advances when SettingsMenu opens (listen for DOM change or a return event `hal-settings-opened`). Auto-advance after 3s if user doesn't interact.
- **On advance**: Close settings automatically via `hal-close-settings` event

### Step 2: Search / Command Bar
- **Target**: Search input in HudTopbar (`.hal-search`)
- **Spotlight**: Highlight the search bar
- **HAL says**: "Search your projects here. Type a name and I'll filter in real time."
- **Action**: Focus the search input. Step advances on any keystroke (user tried it) or after 4s timeout.

### Step 3: Push-to-Talk
- **Target**: Mic button next to search bar (`[data-tutorial="mic-button"]` -- add this attribute)
- **Spotlight**: Highlight the mic button
- **HAL says**: "Hold CTRL+SPACE to talk to me. Voice commands work anywhere -- the hub, the terminal, wherever you are."
- **Action**: "Got it" button (don't force voice interaction -- mic permissions are annoying in a tutorial). Show the keybind visually in the card: styled `<kbd>CTRL</kbd> + <kbd>SPACE</kbd>`.

### Step 4: Import a Project
- **Target**: "+" button or import area in HudTopbar (`[data-tutorial="add-project"]` -- add this attribute)
- **Spotlight**: Highlight the button
- **HAL says**: "Bring your projects in. Click here, pick a folder, and I'll analyze it and set things up. That's it -- you're ready."
- **Action**: "Try it" button triggers the import flow. OR "Done" to finish. If they trigger import, tutorial ends and lets the import screen take over.
- **Event bus**: `window.dispatchEvent(new CustomEvent('hal-import-project'))` if user clicks "Try it"

## Implementation Details

### Data-attribute Targeting

Add `data-tutorial="..."` attributes to target elements. This is more stable than class selectors and self-documents intent:

```tsx
// HudTopbar.tsx
<button data-tutorial="settings-gear" ...>
<input data-tutorial="search-bar" className="hal-search" ...>
<MicButton data-tutorial="mic-button" ...>
<button data-tutorial="add-project" ...>
```

### Spotlight Positioning

```ts
function getSpotlightRect(selector: string): DOMRect | null {
  const el = document.querySelector(`[data-tutorial="${selector}"]`)
  return el?.getBoundingClientRect() ?? null
}
```

Recalculate on window resize. Pad the rect by 8px for breathing room.

### HAL Voice Integration

If `voiceOut` is enabled in settings, each step's text is spoken via the existing TTS pipeline. The card text appears simultaneously (don't wait for audio). If voice is off, card text only.

Voice is short -- each line is under 10 seconds of speech. Keep it snappy.

### Skip / Dismiss

- "Skip tour" always visible (bottom-right of card, muted style)
- ESC key dismisses
- Clicking outside the spotlight dismisses
- All paths set `localStorage.setItem('hal-tutorial-done', '1')`

### Re-trigger

Settings menu gets a "Replay intro tour" button that clears the localStorage flag and dispatches a `hal-start-tutorial` event. `<IntroTutorial />` listens for this.

## HAL Personality in Copy

The tutorial text must match the current personality sliders from `hal-o-personality.json`. At tutorial init, read the sliders and adjust tone:

- **High humor**: "I'm HAL. Yes, the eye is a bit much. Let me show you around."
- **High formality**: "Welcome. I am HAL, your operational interface. Shall we proceed?"
- **High dramatic**: "This... is your command center. And I am its voice."
- **Default (balanced)**: "I'm HAL. This is your command center. Let me show you around."

Pre-write 4 variants per step (one per personality extreme). Pick at runtime based on dominant slider. This keeps the tutorial feeling like HAL, not like a product tour written by a PM.

## Estimated Effort

- `IntroTutorial.tsx` component: ~200 lines
- CSS (spotlight, card, transitions): ~80 lines
- `data-tutorial` attributes on 4 elements: 4 one-line changes
- Settings "Replay" button: ~10 lines
- localStorage gate in App.tsx: ~5 lines
- Voice integration (optional, reuses existing TTS path): ~20 lines
- Personality variants (4 per step, 5 steps): 20 short strings in i18n

**Total: ~1-2 hours for a senior dev. No new dependencies.**

## What This Intentionally Avoids

- No progress bars or "3 of 5 complete" gamification
- No forced interaction (every step has a passive advance path)
- No blocking the 3D scene (backdrop is translucent, scene is visible)
- No multi-page flow or separate route
- No third-party tour libraries (Shepherd, Joyride, etc.) -- they all look generic
- No tutorial that takes longer than 45 seconds to complete
