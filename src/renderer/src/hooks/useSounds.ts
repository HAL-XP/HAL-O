let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function isMuted(): boolean {
  return !!(typeof window !== 'undefined' && window.__claudebornMuted)
}

function note(freq: number, start: number, duration: number, type: OscillatorType = 'triangle', volume = 0.09) {
  if (isMuted()) return
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    const t = ctx.currentTime + start
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volume, t + 0.01)
    gain.gain.setValueAtTime(volume, t + duration * 0.7)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + duration)
  } catch { /* audio not available */ }
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.08) {
  note(freq, 0, duration, type, volume)
}

export function playClick() {
  playTone(800, 0.06, 'sine', 0.05)
}

export function playSelect() {
  playTone(600, 0.08, 'sine', 0.06)
  setTimeout(() => playTone(900, 0.08, 'sine', 0.06), 50)
}

export function playSuccess() {
  // Victory fanfare — based on the classic FF transcription in C major
  // Notes verified against piano letter notes transcription

  const C5  = 523.25
  const Ab4 = 415.30
  const Bb4 = 466.16
  const G4  = 392.00
  const F4  = 349.23
  const Eb5 = 622.25
  const F5  = 698.46
  const G5  = 783.99

  const vol = 0.07
  const w: OscillatorType = 'triangle'

  // Part 1: "Da da da DA" — the iconic 4-note opening
  note(C5, 0.00, 0.10, w, vol)
  note(C5, 0.11, 0.10, w, vol)
  note(C5, 0.22, 0.10, w, vol)
  note(C5, 0.33, 0.20, w, vol * 1.2)

  // Part 2: Ascending answer — Ab Bb then C held
  note(Ab4, 0.58, 0.14, w, vol)
  note(Bb4, 0.78, 0.14, w, vol)
  note(C5, 0.98, 0.48, w, vol * 1.1)

  // Part 3: Second phrase — "da da da"
  note(C5, 1.54, 0.10, w, vol)
  note(C5, 1.65, 0.10, w, vol)
  note(C5, 1.76, 0.10, w, vol)

  // Part 4: Middle melody — descending then ascending
  note(Bb4, 1.92, 0.12, w, vol)
  note(C5,  2.08, 0.12, w, vol)
  note(G4,  2.24, 0.14, w, vol * 0.9)
  note(F4,  2.42, 0.14, w, vol * 0.9)
  note(G4,  2.60, 0.14, w, vol)

  // Part 5: Final ascending resolution — "DA DA DAAAAAAA"
  note(Bb4, 2.80, 0.12, w, vol)
  note(Bb4, 2.96, 0.12, w, vol)
  note(Eb5, 3.14, 0.14, w, vol * 1.1)
  note(F5,  3.32, 0.14, w, vol * 1.1)
  note(G5,  3.50, 1.20, w, vol * 1.3)

  // Bass harmony layer
  const v2 = 0.03
  note(Ab4 / 2, 0.58, 0.30, 'sine', v2)
  note(C5 / 2,  0.98, 0.48, 'sine', v2)
  note(Bb4 / 2, 2.80, 0.28, 'sine', v2)
  note(Eb5 / 2, 3.14, 0.30, 'sine', v2)
  note(G5 / 2,  3.50, 1.20, 'sine', v2)

  // Chord stabs on resolution
  note(C5,  3.50, 1.00, 'sine', 0.025)
  note(Eb5, 3.50, 1.00, 'sine', 0.02)
}

export function playError() {
  playTone(300, 0.2, 'sawtooth', 0.04)
  setTimeout(() => playTone(250, 0.3, 'sawtooth', 0.04), 150)
}
