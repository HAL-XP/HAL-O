/**
 * Shared audio analyser singleton for the HAL-O sphere audio-reactive animation.
 *
 * All TTS playback in the renderer should route through here so the PBR sphere
 * (PbrHoloScene.tsx → readAudioData) receives real FFT data instead of only
 * responding to the demo sine-wave fallback.
 *
 * Exposed window globals (read by readAudioData in PbrHoloScene):
 *   window.__haloAudioAnalyser  — AnalyserNode (V4 API, primary)
 *   window.__halAudioAnalyser   — same node (legacy alias, kept for safety)
 *   window.__halSpeaking        — boolean, true while audio is playing
 */

// Lazy-initialized singleton — created on first use, never destroyed.
let _ctx: AudioContext | null = null
let _analyser: AnalyserNode | null = null

/**
 * Return the shared AudioContext, creating it if needed.
 * Used by procedural audio (engine whoosh, UI sounds) that don't need the analyser chain.
 */
export function getOrCreateContext(): AudioContext {
  if (_ctx) return _ctx
  // Calling getOrCreateAnalyser creates both _ctx and _analyser
  getOrCreateAnalyser()
  return _ctx!
}

function getOrCreateAnalyser(): { ctx: AudioContext; analyser: AnalyserNode } {
  if (_ctx && _analyser) return { ctx: _ctx, analyser: _analyser }

  _ctx = new AudioContext()
  _analyser = _ctx.createAnalyser()
  _analyser.fftSize = 256
  _analyser.connect(_ctx.destination)

  // Register on window so PbrHoloScene can read it every animation frame
  ;(window as any).__haloAudioAnalyser = _analyser
  ;(window as any).__halAudioAnalyser  = _analyser  // legacy alias

  return { ctx: _ctx, analyser: _analyser }
}

/**
 * Play a TTS audio data URL and connect it to the global analyser so the
 * sphere reacts to the audio.  Safe to call from any component.
 *
 * Returns the HTMLAudioElement so callers can attach onended/onerror if needed.
 */
export function playWithAnalyser(url: string): HTMLAudioElement {
  const { ctx, analyser } = getOrCreateAnalyser()

  // Resume suspended context (browsers suspend on first load before user gesture)
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const audio = new Audio(url)

  // createMediaElementSource can only be called once per element — always use
  // a fresh Audio() (which we always do) so this is safe.
  const source = ctx.createMediaElementSource(audio)
  source.connect(analyser)
  // NOTE: analyser is already connected to ctx.destination in getOrCreateAnalyser,
  // so sound will be heard even when we only connect source → analyser.

  ;(window as any).__halSpeaking = true

  audio.onended = () => {
    ;(window as any).__halSpeaking = false
  }
  audio.onerror = () => {
    ;(window as any).__halSpeaking = false
  }

  audio.play().catch(() => {
    ;(window as any).__halSpeaking = false
  })

  return audio
}

/**
 * Connect an existing HTMLAudioElement to the global analyser.
 * Use this when the caller already created an Audio element and manages
 * playback themselves (e.g. SettingsMenu preview, VoiceController).
 *
 * The element must NOT have been connected to a MediaElementSource before —
 * each element can only be connected once.  Pass a freshly-created element.
 */
export function connectAudioElement(audio: HTMLAudioElement): void {
  const { ctx, analyser } = getOrCreateAnalyser()

  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const source = ctx.createMediaElementSource(audio)
  source.connect(analyser)

  ;(window as any).__halSpeaking = true

  const clear = () => {
    ;(window as any).__halSpeaking = false
  }
  audio.addEventListener('ended', clear, { once: true })
  audio.addEventListener('error',  clear, { once: true })
}
