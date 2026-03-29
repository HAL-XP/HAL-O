# Debate Arena 3D Visualization — Design Document

## Overview

When a multi-agent debate is active, five colored orbs materialize above the ring platform, orbiting the HAL sphere. Each orb represents a debate agent with a unique color, name label, and speech bubble showing their response text in real-time. The design is **text-first** — agent content appears as floating text above each orb, with optional TTS audio as a togglable enhancement (not a blocker).

This is a showcase feature. The visual quality bar is AAA.

---

## 1. Component Architecture

### New Files

```
src/renderer/src/components/three/DebateArena.tsx     (~400 lines)
  - DebateArena           — orchestrator: manages orb lifecycle, active speaker, consensus
  - AgentOrb              — single orb: sphere + glow + label + speech bubble
  - SpeechBubble          — Html overlay: scrolling text above orb, typewriter effect
  - ConsensusFlare        — convergence VFX when debate reaches consensus
  - DebateHud             — Html overlay: round counter, topic, timer (top of scene)
```

### Integration Point (existing file)

```
src/renderer/src/components/three/PbrHoloScene.tsx
  - PbrSceneInner renders <DebateArena /> conditionally in Phase 2 block
    (same phase as floor, particles, HUD — needs to be visible before PostFX)
  - Props: debateState, onDebateEvent
  - Gated: {debateState && <DebateArena state={debateState} />}
```

### IPC Bridge (new channels)

```
src/main/ipc-handlers.ts          — register debate IPC handlers
src/preload/index.ts               — expose debate methods on window.api
src/renderer/src/hooks/useDebate.ts — React hook: subscribe to debate state via IPC
```

### No camera changes. No PostFX changes. Uses existing bloom pipeline.

---

## 2. Three.js Approach

### 2.1 AgentOrb Geometry + Materials

Each orb is a `<group>` containing:

```
<group position={orbPosition}>
  <!-- Core sphere -->
  <mesh>
    <sphereGeometry args={[0.5, 32, 32]} />   (shared via useMemo)
    <meshStandardMaterial
      color={agentColor}
      emissive={agentColor}
      emissiveIntensity={isActive ? 3.0 : 0.8}
      metalness={0.3}
      roughness={0.4}
      transparent
      opacity={isActive ? 1.0 : 0.6}
      toneMapped={false}                       (bloom pickup)
    />
  </mesh>

  <!-- Outer glow shell (additive, larger) -->
  <mesh scale={[1.4, 1.4, 1.4]}>
    <sphereGeometry args={[0.5, 16, 16]} />    (lower-poly shell)
    <meshBasicMaterial
      color={agentColor}
      transparent
      opacity={isActive ? 0.25 : 0.08}
      side={THREE.BackSide}
      depthWrite={false}
      toneMapped={false}
    />
  </mesh>

  <!-- Point light inside orb — only when active -->
  {isActive && <pointLight color={agentColor} intensity={2} distance={4} />}

  <!-- Name label (Html) -->
  <Html center distanceFactor={12} style={{ pointerEvents: 'none' }}>
    <div class="debate-orb-label">{agentName}</div>
  </Html>

  <!-- Speech bubble (Html) — rendered above orb when agent has text -->
  <SpeechBubble text={currentText} color={agentColor} visible={hasText} />
</group>
```

**Geometry reuse**: A single `SphereGeometry(0.5, 32, 32)` is created at module level via `useMemo` with empty deps and shared across all 5 orbs. The glow shell uses a second shared `SphereGeometry(0.5, 16, 16)`.

**Material**: Each orb gets its own `MeshStandardMaterial` instance (colors differ), but geometry is shared. Materials are mutated via refs in useFrame — never via React state.

### 2.2 SpeechBubble (Text-First Design)

Each agent's response is displayed as a floating text panel above their orb using drei's `<Html>`:

```tsx
function SpeechBubble({ text, color, visible, maxChars = 280 }) {
  // Position: 1.2 units above orb center
  // Style: semi-transparent dark background with colored left border
  // Text: typewriter effect (characters revealed over time)
  // Lifecycle: fade in on new text -> hold 6s -> fade to 40% opacity -> hold until replaced

  return (
    <Html center position={[0, 1.2, 0]} distanceFactor={10}
          style={{ pointerEvents: 'none', width: '220px' }}>
      <div className="debate-speech-bubble" style={{ borderColor: color }}>
        <div className="debate-speech-text">{displayText}</div>
        <div className="debate-speech-agent" style={{ color }}>{agentIcon} {agentName}</div>
      </div>
    </Html>
  )
}
```

**Text delivery flow**:
1. Agent starts speaking -> orb pulses, speech bubble appears with "..." typing indicator
2. Text streams in via IPC chunks -> typewriter reveal (15 chars/frame at 60fps = ~900 chars/sec)
3. Streaming complete -> full text visible, bubble holds for 6 seconds at full opacity
4. After 6s -> bubble fades to 40% opacity (still readable on hover/click)
5. Next agent starts -> previous bubble stays dimmed, new bubble appears on active orb

**Back-face optimization**: Speech bubbles use the same `reducedFrame` skip as ScreenPanel. If the orb is behind the camera, the Html updates skip 29/30 frames.

### 2.3 Orb Positioning + Animation

**Orbit positions** (module-level scratch vectors, never allocated in useFrame):

```typescript
// Module-level scratch objects — NEVER allocate in useFrame
const _orbPos = new THREE.Vector3()
const _orbTarget = new THREE.Vector3()
const _lerpPos = new THREE.Vector3()

const ORBIT_RADIUS = 3.0        // Inside the ring platform (radius 8.5)
const ORBIT_Y = 2.5             // Float above floor
const ACTIVE_PULL = 0.8         // How far active orb moves toward center
```

Each orb's base position is evenly distributed on a circle:

```
angle_i = (i / agentCount) * 2PI + elapsedTime * orbitSpeed
x = cos(angle_i) * ORBIT_RADIUS
z = sin(angle_i) * ORBIT_RADIUS
y = ORBIT_Y + sin(elapsedTime * 1.5 + i) * 0.15  (gentle float)
```

**Active speaker animation** (all via refs, zero setState):
- `orbitSpeed`: idle = 0.05 rad/s, active speaker = 0.0 (stops orbiting)
- `scale`: idle = 1.0, active = 1.2 (lerp at rate 4.0/s)
- `emissiveIntensity`: idle = 0.8, active = 3.0 (lerp at rate 6.0/s)
- `position.y`: active orb lifts to ORBIT_Y + 0.3
- `position toward center`: active orb pulls 0.8 units toward origin (lerp)
- Other orbs: fade to 60% opacity, continue slow orbit

### 2.4 Spawn Animation

When the debate starts, orbs appear one by one with a staggered spawn:

```
Agent 0: delay 0.0s, scale 0 -> 1.0 over 0.5s (elastic ease-out)
Agent 1: delay 0.3s
Agent 2: delay 0.6s
Agent 3: delay 0.9s
Agent 4: delay 1.2s
```

Each spawn includes:
- Scale: 0 -> 1.0 with overshoot to 1.15 then settle (elastic)
- Opacity: 0 -> 1.0 (linear, 0.3s)
- A single sonar-pulse ring expands from the spawn point (reuse PulseRing pattern)
- Sphere event dispatched: `dispatchSphereEvent({ type: 'info', intensity: 0.5 })`

### 2.5 Consensus Convergence VFX

When `session.consensus` is set and contains "YES" or "PARTIAL":

1. All orbs stop orbiting (orbitSpeed -> 0)
2. All orbs lerp toward center position [0, 3.5, 0] over 2 seconds
3. As orbs converge, their colors blend toward white (lerp emissive -> white)
4. At convergence point: bright flash (scale 0 -> 3.0 white sphere, opacity 1.0 -> 0, 1.5s)
5. Orbs reform in a tight cluster at center with interconnecting line segments
6. For "PARTIAL" consensus: orbs only converge halfway (stop at radius 1.5), retain original colors

### 2.6 DebateHud (Round Counter)

Floating Html overlay anchored to world-space above the debate arena:

```
<Html center position={[0, 5.5, 0]} distanceFactor={15}>
  <div className="debate-hud">
    <div className="debate-topic">{topic}</div>
    <div className="debate-round">Round {current}/{total}</div>
    <div className="debate-mode">{mode}</div>
  </div>
</Html>
```

Minimal, translucent, matching the HudScrollText aesthetic (alpha 0.14 scanline look).

---

## 3. IPC Data Flow

### 3.1 New IPC Channels

```
Main -> Renderer (events, via ipcRenderer.on):
  'debate-state-changed'     — full DebateSession snapshot (on create, round complete, score, consensus)
  'debate-agent-speaking'    — { debateId, agentId, round } (agent turn started)
  'debate-agent-chunk'       — { debateId, agentId, chunk } (streaming text chunk)
  'debate-agent-done'        — { debateId, agentId, message: DebateMessage } (agent turn complete)

Renderer -> Main (invoke, via ipcRenderer.invoke):
  'debate-create'            — (topic, mode, agentIds, rounds) -> DebateSession
  'debate-create-from-panel' — (topic, panelId, mode, rounds) -> DebateSession
  'debate-run-round'         — (id) -> DebateMessage[]
  'debate-run-full'          — (id) -> void (fires events as it runs)
  'debate-score'             — (id) -> DebateScore[]
  'debate-consensus'         — (id) -> string | null
  'debate-list'              — () -> DebateSession[]
  'debate-get'               — (id) -> DebateSession | undefined
  'debate-delete'            — (id) -> boolean
```

### 3.2 Orchestrator Integration

In `multi-agent-orchestrator.ts`, the `runDebateRound` and `runFullDebate` functions already accept `onMessage` and `onChunk` callbacks. The IPC handler wires these to `BrowserWindow.webContents.send()`:

```typescript
// In ipc-handlers.ts:
ipcMain.handle('debate-run-full', async (_e, id: string) => {
  const win = BrowserWindow.getFocusedWindow()
  await runFullDebate(
    id,
    (msg) => win?.webContents.send('debate-agent-done', { debateId: id, agentId: msg.agentId, message: msg }),
    (agentId, chunk) => win?.webContents.send('debate-agent-chunk', { debateId: id, agentId, chunk }),
    (round, msgs) => {
      const session = getDebate(id)
      win?.webContents.send('debate-state-changed', session)
    }
  )
  // Auto-score + consensus after full run
  const scores = await scoreDebate(id)
  const consensus = await detectConsensus(id)
  const session = getDebate(id)
  win?.webContents.send('debate-state-changed', session)
})
```

### 3.3 Renderer Hook: `useDebate`

```typescript
// src/renderer/src/hooks/useDebate.ts
export function useDebate() {
  const [activeDebate, setActiveDebate] = useState<DebateSession | null>(null)
  const [speakingAgent, setSpeakingAgent] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState<Record<string, string>>({})

  useEffect(() => {
    const unsubs = [
      window.api.onDebateStateChanged((session) => setActiveDebate(session)),
      window.api.onDebateAgentSpeaking(({ agentId }) => setSpeakingAgent(agentId)),
      window.api.onDebateAgentChunk(({ agentId, chunk }) => {
        setStreamingText(prev => ({
          ...prev,
          [agentId]: (prev[agentId] || '') + chunk
        }))
      }),
      window.api.onDebateAgentDone(({ agentId }) => {
        setSpeakingAgent(null)
        // Clear streaming text for this agent (full text is in activeDebate.messages)
        setStreamingText(prev => { const next = { ...prev }; delete next[agentId]; return next })
      }),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [])

  return { activeDebate, speakingAgent, streamingText }
}
```

### 3.4 Props Flow

```
ProjectHub.tsx
  -> useDebate() hook
  -> passes { debateState, speakingAgent, streamingText } to PbrHoloScene
    -> PbrSceneInner
      -> <DebateArena state={debateState} speakingAgent={speakingAgent} streamingText={streamingText} />
```

---

## 4. Visual Mockup (Text-Based Wireframe)

### Top-down view (looking from above)

```
                        DebateHud
                  "Should we use Rust?"
                    Round 2/3 | Round-Robin


           [Evidence Gatherer]        [Creative Strategist]
               (blue orb)                (purple orb)
                 0.5r                       0.5r


                          HAL
      [Critical Analyst] SPHERE  [Devil's Advocate]
         (red orb, 1.2x)  ||      (orange orb)
          ACTIVE >>>       ||
          "I see three     ||
           fundamental     ||
           flaws in..."    ||


                      [Practical Engineer]
                         (green orb)
                           0.5r


    =========== Ring Platform (r=8.5) ===========
    ----------- Floor Reflection ----------------
```

### Side view (camera perspective)

```
    y=5.5    -------- DebateHud: "Round 2/3" --------

    y=3.7    [ Speech bubble: "I see three fundamental  ]
             [ flaws in this approach. First, the       ]
             [ evidence cited by Evidence Gatherer..."   ]
    y=2.8    [*Critical Analyst*]   <- active, 1.2x, bright red glow
                                       pulled 0.8 toward center

    y=2.5     (blue)   (green)   (purple)   (orange)  <- idle orbs, dimmed
                                                          gentle float animation

    y=0.0    ============ RING PLATFORM ============
    y=-0.1   ~~~~~~~~~~~~ REFLECTIVE FLOOR ~~~~~~~~~~
                          (orb reflections visible)
```

### Consensus convergence sequence

```
    Frame 0 (start)        Frame 60 (1s)          Frame 120 (2s)

       B       P              B   P                    BPGCO
      G   C   O              G C O                   (cluster)
         HAL                  HAL                       HAL
                                                    WHITE FLASH!

    B=blue, P=purple, G=green, C=red(critical), O=orange
```

---

## 5. Implementation Estimate

| Phase | Task | Hours | Notes |
|-------|------|-------|-------|
| **P1** | IPC channels + preload bridge | 2h | Wire debate orchestrator to renderer |
| **P2** | `useDebate` hook | 1h | State management, streaming text buffer |
| **P3** | `DebateArena.tsx` — AgentOrb | 3h | Geometry, materials, spawn animation, orbit |
| **P4** | `SpeechBubble` — text overlay | 2h | Typewriter effect, fade lifecycle, back-face skip |
| **P5** | `DebateHud` — round counter | 0.5h | Simple Html overlay |
| **P6** | Active speaker animation | 1.5h | Scale, pull-to-center, glow ramp, orbit pause |
| **P7** | Consensus convergence VFX | 2h | Orb convergence, color blend, flash |
| **P8** | Integration into PbrSceneInner | 1h | Props threading, phase gating |
| **P9** | CSS for speech bubbles + labels | 1h | Theme-aware, translucent, bloom-compatible |
| **P10** | TSC + visual QA | 1h | Type-check, screenshot verification |
| | **Total** | **~15h** | Parallelizable across P1-P2 (IPC) and P3-P7 (3D) |

### Phased Delivery

- **MVP (8h)**: P1 + P2 + P3 + P4 + P5 + P8 — orbs appear, text streams, round counter works
- **Polish (5h)**: P6 + P7 + P9 — active speaker animation, consensus VFX, styled CSS
- **QA (2h)**: P10 — type-check, spawn QA agent for visual verification

---

## 6. Performance Considerations

### Budget: 5 animated orbs at 60fps

| Concern | Mitigation |
|---------|-----------|
| **Vector allocations in useFrame** | All scratch vectors (`_orbPos`, `_orbTarget`, `_lerpPos`) are module-level. Zero `new Vector3()` in any frame callback. |
| **Material updates** | Emissive intensity + opacity mutated via refs (`matRef.current.emissiveIntensity = x`). Zero React re-renders for per-frame animation. |
| **Html overlays (5 labels + 5 speech bubbles)** | drei's Html recalculates CSS transform every frame. Mitigate with: (a) `distanceFactor` to skip tiny-on-screen panels, (b) back-face orbs skip Html update 29/30 frames (same pattern as ScreenPanel), (c) speech bubbles only render when `text.length > 0`. |
| **Geometry** | Two shared `SphereGeometry` instances (32-seg core, 16-seg glow shell). 5 orbs = 10 meshes + 5 point lights. Trivial draw call count. |
| **Point lights** | Only the active speaker has a point light enabled (1 light, not 5). Idle orbs disable their light (`visible={false}`). |
| **Bloom** | Orb emissive materials use `toneMapped={false}` to participate in existing bloom pipeline. No additional EffectComposer passes needed. |
| **State updates from IPC** | `useDebate` batches chunk updates. `streamingText` state only updates when a new chunk arrives (not per-frame). Orb text is read from a ref in useFrame, not from state. |
| **Spawn/despawn** | Orbs are mounted/unmounted via React (conditional rendering), not hidden via opacity. Unmounted orbs have zero GPU cost. |
| **Consensus VFX** | The convergence flash is a single additional mesh (sphere + basic material), alive for 1.5 seconds then unmounted. |

### Worst-case draw call impact

```
Idle scene (no debate):     ~60 draw calls (screens + sphere + floor + particles)
Active debate (5 orbs):     ~72 draw calls (+10 meshes, +1 point light, +1 HUD)
                            = +20% draw calls, well within 60fps budget
```

### Memory

- 5 material instances (~negligible)
- 2 shared geometries (~negligible)
- Streaming text buffer: max ~2KB per agent (truncated at 280 chars display, full text in debate session)
- Total debate overhead: < 1MB

---

## 7. Audio (Optional Enhancement — Pipelined TTS)

### 7.1 Design Philosophy: Text-First, Audio-Optional

The primary content channel is **text**. Speech bubbles stream instantly via IPC chunks. Audio is a **settings toggle** (`Settings > Voice > Debate Audio`) that enhances the experience without blocking it.

When audio is OFF: orbs pulse/glow visually to indicate "who is speaking." Text is the entire UX.

When audio is ON: agent responses are spoken aloud via TTS, but text always leads. The user sees the text first, then hears it moments later. Audio never blocks the debate flow.

### 7.2 TTS Pipeline Architecture (Lookahead Queue)

The key insight: **while Agent 1's audio plays, pre-generate Agent 2's audio in the background.** By the time Agent 1 finishes speaking, Agent 2's audio is already cached and plays instantly.

```
Timeline (round-robin, 5 agents):

Agent 1 text arrives  ---|--- TTS gen (3-5s) ---|--- PLAY audio ---|
Agent 2 text arrives  ---|--- TTS gen (3-5s)    ---|--- PLAY (cached, instant) ---|
Agent 3 text arrives  ---|--- TTS gen (3-5s)         ---|--- PLAY (cached) ---|
Agent 4 text arrives  ---|--- TTS gen                       ---|--- PLAY ---|
Agent 5 text arrives  ---|--- TTS gen                            ---|--- PLAY ---|

                      ^ text streams in     ^ TTS runs in background
                        (instant display)     (pipeline fills ahead of playback)
```

**Only Agent 1 has a TTS wait** (3-5s for Chatterbox). All subsequent agents play from cache.

### 7.3 Implementation: DebateTtsQueue

```typescript
// src/renderer/src/hooks/useDebateTts.ts

interface TtsQueueEntry {
  agentId: string
  text: string
  audioPath: string | null  // null = pending generation
  status: 'generating' | 'ready' | 'playing' | 'done'
}

class DebateTtsQueue {
  private queue: TtsQueueEntry[] = []
  private generating = false
  private playingIdx = -1

  /** Enqueue an agent's text for TTS generation. Starts pipeline immediately. */
  enqueue(agentId: string, text: string): void {
    this.queue.push({ agentId, text, audioPath: null, status: 'generating' })
    this.pumpGeneration()
  }

  /** Generate TTS for the next pending entry (runs in background). */
  private async pumpGeneration(): Promise<void> {
    if (this.generating) return  // already generating one
    const next = this.queue.find(e => e.status === 'generating')
    if (!next) return

    this.generating = true
    try {
      // Use debate-specific voice profiles per agent color:
      //   red -> stern, blue -> calm, green -> neutral, purple -> playful, orange -> provocative
      const profile = AGENT_VOICE_PROFILES[next.agentId] || 'butler'
      const audioPath = await window.api.ttsGenerate(next.text, profile)
      next.audioPath = audioPath
      next.status = 'ready'
    } catch {
      next.status = 'done'  // skip on error, text is already visible
    }
    this.generating = false

    // Immediately start generating next entry (pipeline)
    this.pumpGeneration()

    // If nothing is playing, start playback
    if (this.playingIdx === -1) this.pumpPlayback()
  }

  /** Play the next ready entry. */
  private async pumpPlayback(): Promise<void> {
    const nextReady = this.queue.findIndex(
      (e, i) => i > this.playingIdx && e.status === 'ready'
    )
    if (nextReady === -1) return

    this.playingIdx = nextReady
    const entry = this.queue[nextReady]
    entry.status = 'playing'

    // Signal renderer: this agent is "speaking" (orb reacts to audio)
    window.dispatchEvent(new CustomEvent('debate-audio-speaking', {
      detail: { agentId: entry.agentId }
    }))

    // Play audio through existing Web Audio pipeline (AnalyserNode for orb reactivity)
    await playDebateAudio(entry.audioPath!)

    entry.status = 'done'
    window.dispatchEvent(new CustomEvent('debate-audio-done', {
      detail: { agentId: entry.agentId }
    }))

    // Play next in queue
    this.pumpPlayback()
  }

  /** Clear queue (debate ended or audio toggled off). */
  clear(): void {
    this.queue = []
    this.playingIdx = -1
    this.generating = false
  }
}
```

### 7.4 Audio-Reactive Orbs

When audio is playing for an agent:
- The active orb connects to the existing `AnalyserNode` pipeline (same as PbrHalSphere)
- Orb scale pulses with bass frequency: `scale = 1.0 + bass * 0.3`
- Orb emissive intensity pulses with volume: `emissive = 2.0 + volume * 2.0`
- The glow shell opacity pulses: `opacity = 0.15 + volume * 0.2`
- Other orbs remain visually idle (no audio reactivity)

The AnalyserNode is the **same global instance** used by PbrHalSphere. When a debate is active and audio is playing, the sphere also reacts (intentional — HAL is "listening" to the debate).

### 7.5 Voice Profile Mapping

Each agent gets a distinct TTS voice to make them aurally distinguishable:

```typescript
const AGENT_VOICE_PROFILES: Record<string, string> = {
  'critical-analyst':    'stern',      // authoritative, clipped delivery
  'evidence-gatherer':   'butler',     // measured, calm (HAL's voice)
  'practical-engineer':  'neutral',    // straightforward, no-nonsense
  'creative-strategist': 'narrator',   // warm, expressive
  'devils-advocate':     'glados',     // monotone, unsettling (easter egg tie-in)
}
```

### 7.6 Audio Caching

Generated audio files are cached per debate session:

```
~/.hal-o/cache/debate-audio/{debateId}/
  round-1-critical-analyst.ogg
  round-1-evidence-gatherer.ogg
  round-1-practical-engineer.ogg
  ...
  round-3-devils-advocate.ogg
```

Cache is cleared when the debate is deleted. This means re-playing a debate (review mode) is instant — all audio is already generated.

### 7.7 Settings Integration

```
Settings > Voice > Debate Audio: [OFF] / [ON]
  - OFF (default): Text only. Orbs pulse visually. Zero TTS cost.
  - ON: Text + pipelined TTS. First agent has 3-5s delay, rest are instant.
```

The toggle is a simple boolean in useSettings. DebateArena reads it and conditionally creates the TtsQueue.

---

## 8. CSS Styling

```css
/* Debate speech bubble — dark translucent card with colored accent */
.debate-speech-bubble {
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  border-left: 3px solid; /* color set inline from agent color */
  border-radius: 6px;
  padding: 8px 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.9);
  max-height: 120px;
  overflow: hidden;
  transition: opacity 0.5s ease;
}

.debate-speech-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.debate-speech-agent {
  font-size: 9px;
  margin-top: 4px;
  opacity: 0.7;
}

.debate-orb-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  text-transform: uppercase;
  letter-spacing: 1px;
  text-shadow: 0 0 8px currentColor;
  white-space: nowrap;
  pointer-events: none;
}

.debate-hud {
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.6);
  pointer-events: none;
}

.debate-topic {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 4px;
}

.debate-round {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
}
```

---

## 9. Data Types (Renderer-Side)

```typescript
// Minimal renderer-side types (mirroring main process types)
// These go in src/renderer/src/types/debate.ts

export interface DebateAgentState {
  presetId: string
  name: string
  color: string
  icon: string
}

export interface DebateMessageState {
  agentId: string
  agentName: string
  agentColor: string
  round: number
  content: string
  timestamp: number
}

export interface DebateScoreState {
  agentId: string
  agentName: string
  score: number
  strengths: string[]
  weaknesses: string[]
}

export interface DebateState {
  id: string
  topic: string
  mode: 'round-robin' | 'concurrent' | 'devils-advocate'
  agents: DebateAgentState[]
  totalRounds: number
  currentRound: number
  messages: DebateMessageState[]
  scores: DebateScoreState[] | null
  consensus: string | null
  status: 'created' | 'running' | 'paused' | 'completed' | 'error'
}
```

---

## 10. Open Questions / Decisions Needed

1. **Where does the user trigger a debate?** Options:
   - (a) Right-click a project card -> "Debate this project"
   - (b) Command palette / HAL voice command: "Start a debate about X"
   - (c) Dedicated button in settings or topbar
   - Recommendation: (b) via HAL command, with (c) as a visible entry point

2. **Debate while screens are visible?** The orbs float between the sphere and the screen ring. They don't overlap with screen panels (radius 3 vs screen radius 8+). Both can coexist.

3. **Max concurrent debates?** Only one active debate visualized at a time. Multiple can exist in storage but only one renders orbs.

4. **Mobile / Halo Chat trigger?** `[halochat] start debate about X` could create and run a debate, with results sent back as text. The 3D visualization only shows on desktop.

---

## 11. File Dependency Graph

```
debate-presets.ts (existing)
    |
    v
multi-agent-orchestrator.ts (existing)
    |
    v
ipc-handlers.ts (add debate handlers)
    |
    v
preload/index.ts (expose debate API)
    |
    v
hooks/useDebate.ts (new)
    |
    v
ProjectHub.tsx (thread props)
    |
    v
PbrHoloScene.tsx (thread to PbrSceneInner)
    |
    v
DebateArena.tsx (new)
  |- AgentOrb
  |- SpeechBubble
  |- ConsensusFlare
  |- DebateHud
```

No circular dependencies. DebateArena is a leaf component — it reads state, renders 3D, dispatches no actions upstream.

---

## 12. UX Refinements (Post-Design Review)

### No Labels — Color-Coded Text Is The Identity
- No floating name labels above orbs (clean look)
- Agent name appears as header in speech bubble text, IN the orb's color
- No legend needed — color in text = color of orb = identity

### Chat Display — Hybrid (Option 3)
- Active speaker: text floats above orb in 3D (wow factor)
- Collapsible chat log panel at bottom (full context on demand)
- Previous messages fade to 40% opacity in 3D

### Sphere Styles = User Customization
- **Two birds, one stone:** the visual styles designed for debate agents
  (particles, colors, glow patterns) become selectable options for the
  main HAL sphere in Settings
- Users pick their sphere personality: engineer green (geometric particles),
  creative purple (swirling), analyst red (sharp pulses), etc.
- During debates, each agent auto-uses its preset style
- This unifies the sphere visual system across personal use + debate
