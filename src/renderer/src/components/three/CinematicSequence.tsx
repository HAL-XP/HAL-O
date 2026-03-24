/**
 * CinematicSequence — Full feature showcase for marketing videos & trade shows (M2).
 *
 * 6-act cinematic script (~42 seconds) that demonstrates ALL visual features:
 * - Act 1: "The Command Center" — wide establishing orbit, particle reveal
 * - Act 2: "The Brain" — HAL sphere zoom, style switch to HAL eye, iris rotation
 * - Act 3: "The Fleet" — ship flyby with camera tracking, engine trail
 * - Act 4: "Mission Control" — panel closeups, terminal activity simulation
 * - Act 5: "The Resolution" — merge conflict graph, resolution VFX, celebration
 * - Act 6: "Finale" — epic wide pullback, full scene, fade to loop
 *
 * Technical:
 * - CatmullRom spline interpolation for smooth camera paths (no jank)
 * - Quintic ease-in-out for cinematic weight
 * - Disables OrbitControls during playback, restores on finish/cancel
 * - Triggers events at specific keyframes (ship flyby, sphere pulse, style switch,
 *   terminal activity, merge simulation)
 * - Shows subtle "CINEMATIC MODE" badge + act label overlay
 * - Loops seamlessly for trade-show kiosk mode
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { SpaceshipFlybyHandle } from './SpaceshipFlyby'
import { dispatchSphereEvent } from './PbrHoloScene'
import { terminalActivityMap, setTerminalActivityMax } from './terminalActivity'

// ── Types ──

export type CinematicAction =
  | { type: 'ship-flyby' }
  | { type: 'sphere-pulse'; eventType?: 'success' | 'error' | 'warning' | 'info' | 'push'; intensity?: number }
  | { type: 'audio-demo'; enabled: boolean }
  | { type: 'sphere-style'; style: 'wireframe' | 'hal-eye' | 'animated-core' }
  | { type: 'activity-boost'; level: number; projectPaths?: string[] }
  | { type: 'activity-clear' }
  | { type: 'merge-simulate' }
  | { type: 'merge-resolve' }
  | { type: 'merge-clear' }
  | { type: 'particle-burst' }

export interface CinematicKeyframe {
  /** Camera world position */
  position: [number, number, number]
  /** Camera lookAt target (orbit target) */
  target: [number, number, number]
  /** Field of view override (degrees), lerped smoothly */
  fov?: number
  /** Duration in seconds to reach THIS keyframe from the previous one */
  duration: number
  /** Hold time in seconds — pause at this keyframe before moving on */
  hold?: number
  /** Actions to trigger when arriving at this keyframe */
  actions?: CinematicAction[]
  /** Actions to trigger at the START of moving toward this keyframe (t=0) */
  earlyActions?: CinematicAction[]
  /** Label shown in the CINEMATIC MODE badge during this segment */
  label?: string
  /** Act number (1-6) for the progress bar display */
  act?: number
}

// ── Act titles for the HUD overlay ──
const ACT_TITLES: Record<number, string> = {
  1: 'THE COMMAND CENTER',
  2: 'THE BRAIN',
  3: 'THE FLEET',
  4: 'MISSION CONTROL',
  5: 'THE RESOLUTION',
  6: 'FINALE',
}

// ── Default Cinematic Sequence — 6-Act Feature Showcase ──
// Scene: screens at radius ~8, sphere at [0,1.3,0], floor at y=0.
// Total runtime: ~42 seconds per loop.

const DEFAULT_SEQUENCE: CinematicKeyframe[] = [
  // ═══════════════════════════════════════════════════════════════
  // ACT 1: "THE COMMAND CENTER" (0-8s)
  // Wide establishing orbit showing full scene — ring platform, particles, panels.
  // Camera slowly rises revealing the scope of the holographic dashboard.
  // ═══════════════════════════════════════════════════════════════

  // KF0: Starting position — slightly below eye level, looking up at the scene
  {
    position: [0, 3, 24],
    target: [0, 1.5, 0],
    fov: 52,
    duration: 0, // instant start
    hold: 0.5,
    actions: [
      { type: 'sphere-style', style: 'wireframe' },
      { type: 'activity-clear' },
      { type: 'merge-clear' },
    ],
    label: 'ESTABLISHING SHOT',
    act: 1,
  },

  // KF1: Rise and orbit right — revealing the full ring of panels
  {
    position: [14, 10, 18],
    target: [0, 0.8, 0],
    fov: 48,
    duration: 4.0,
    hold: 0.3,
    earlyActions: [
      { type: 'sphere-pulse', eventType: 'info', intensity: 0.4 },
    ],
    label: 'REVEALING THE DASHBOARD',
    act: 1,
  },

  // KF2: Continue orbit to show depth — panels visible from the side
  {
    position: [20, 12, 6],
    target: [0, 1.0, 0],
    fov: 46,
    duration: 3.5,
    hold: 0.2,
    label: 'PANORAMIC SWEEP',
    act: 1,
  },

  // ═══════════════════════════════════════════════════════════════
  // ACT 2: "THE BRAIN" (8-14s)
  // Smooth zoom toward HAL sphere. Style switch to HAL eye mid-zoom.
  // Sphere pulse event as camera arrives. Hold on closeup showing iris.
  // ═══════════════════════════════════════════════════════════════

  // KF3: Begin zoom toward sphere — switch to HAL eye during approach
  {
    position: [8, 5, 10],
    target: [0, 1.3, 0],
    fov: 40,
    duration: 2.5,
    hold: 0.0,
    earlyActions: [
      { type: 'sphere-style', style: 'hal-eye' },
      { type: 'audio-demo', enabled: true },
    ],
    label: 'APPROACHING HAL',
    act: 2,
  },

  // KF4: Close-up on HAL sphere — iris rings rotating, core glowing
  {
    position: [3.5, 2.0, 4.5],
    target: [0, 1.3, 0],
    fov: 32,
    duration: 2.0,
    hold: 2.0,
    actions: [
      { type: 'sphere-pulse', eventType: 'info', intensity: 1.0 },
    ],
    label: 'HAL 9000 ONLINE',
    act: 2,
  },

  // KF5: Slight orbit around sphere to show 3D depth of the eye
  {
    position: [-2.5, 2.5, 5.0],
    target: [0, 1.3, 0],
    fov: 34,
    duration: 1.5,
    hold: 0.5,
    actions: [
      { type: 'audio-demo', enabled: false },
    ],
    label: 'IRIS DETAIL',
    act: 2,
  },

  // ═══════════════════════════════════════════════════════════════
  // ACT 3: "THE FLEET" (14-20s)
  // Camera pulls back. Ship flyby crosses through the frame.
  // Camera tracks the ship briefly (follow shot). Engine trail visible.
  // ═══════════════════════════════════════════════════════════════

  // KF6: Pull back to wide angle for dramatic ship entry
  {
    position: [-12, 7, 14],
    target: [0, 2, 0],
    fov: 50,
    duration: 2.0,
    hold: 0.3,
    earlyActions: [
      { type: 'sphere-style', style: 'wireframe' },
    ],
    actions: [
      { type: 'ship-flyby' },
      { type: 'sphere-pulse', eventType: 'push', intensity: 1.0 },
    ],
    label: 'INCOMING TRANSMISSION',
    act: 3,
  },

  // KF7: Track the ship as it passes — camera sweeps to follow
  {
    position: [4, 5, 12],
    target: [8, 3, -2],
    fov: 44,
    duration: 3.0,
    hold: 0.5,
    label: 'TRACKING FLYBY',
    act: 3,
  },

  // KF8: Continue tracking — ship exits, camera settles toward panels
  {
    position: [10, 4, 8],
    target: [6, 2.5, 2],
    fov: 42,
    duration: 1.2,
    hold: 0.0,
    label: 'SHIP DEPARTING',
    act: 3,
  },

  // ═══════════════════════════════════════════════════════════════
  // ACT 4: "MISSION CONTROL" (20-28s)
  // Camera orbits to show panel closeups — git stats, activity bars.
  // Trigger terminal activity simulation for visual edge glow pulsing.
  // Zoom into one panel showing file count, commit info.
  // ═══════════════════════════════════════════════════════════════

  // KF9: Pan to panel area — start activity simulation
  {
    position: [7, 3.0, 6],
    target: [7, 2.5, 1],
    fov: 36,
    duration: 2.0,
    hold: 1.5,
    earlyActions: [
      { type: 'activity-boost', level: 85 },
    ],
    actions: [
      { type: 'sphere-pulse', eventType: 'info', intensity: 0.5 },
    ],
    label: 'PANEL TELEMETRY',
    act: 4,
  },

  // KF10: Close-up on a specific panel — showing enriched content
  {
    position: [6, 2.8, 4.5],
    target: [7.5, 2.5, 0.5],
    fov: 28,
    duration: 1.5,
    hold: 2.0,
    actions: [
      { type: 'activity-boost', level: 95 },
    ],
    label: 'GIT STATS / ACTIVITY',
    act: 4,
  },

  // KF11: Orbit to show another panel cluster
  {
    position: [-5, 3.5, 7],
    target: [-6, 2.5, 1],
    fov: 34,
    duration: 2.0,
    hold: 1.0,
    actions: [
      { type: 'activity-boost', level: 60 },
    ],
    label: 'MULTI-PROJECT VIEW',
    act: 4,
  },

  // ═══════════════════════════════════════════════════════════════
  // ACT 5: "THE RESOLUTION" (28-35s)
  // Merge conflict appearance — warning sphere event.
  // MergeGraph fades in above sphere — branch tubes, red conflict panels.
  // Camera flies through merge graph. Trigger resolution — panels turn green.
  // Success sphere event + ship flyby celebration.
  // ═══════════════════════════════════════════════════════════════

  // KF12: Pull back to see sphere + merge area — trigger merge
  {
    position: [0, 6, 12],
    target: [0, 5, 0],
    fov: 44,
    duration: 2.0,
    hold: 0.5,
    earlyActions: [
      { type: 'activity-clear' },
    ],
    actions: [
      { type: 'merge-simulate' },
      { type: 'sphere-pulse', eventType: 'warning', intensity: 1.0 },
    ],
    label: 'MERGE CONFLICT DETECTED',
    act: 5,
  },

  // KF13: Zoom into the merge graph floating above sphere
  {
    position: [3, 7, 6],
    target: [0, 6, 0],
    fov: 38,
    duration: 2.0,
    hold: 1.5,
    actions: [
      { type: 'sphere-pulse', eventType: 'error', intensity: 0.6 },
    ],
    label: 'CONFLICT GRAPH',
    act: 5,
  },

  // KF14: Orbit around merge graph, then trigger resolution
  {
    position: [-3, 7.5, 5],
    target: [0, 6, 0],
    fov: 40,
    duration: 1.5,
    hold: 1.0,
    actions: [
      { type: 'merge-resolve' },
      { type: 'sphere-pulse', eventType: 'success', intensity: 1.0 },
      { type: 'particle-burst' },
    ],
    label: 'CONFLICTS RESOLVED',
    act: 5,
  },

  // KF15: Celebration — ship flyby + pull back
  {
    position: [0, 8, 14],
    target: [0, 3, 0],
    fov: 48,
    duration: 1.5,
    hold: 0.5,
    actions: [
      { type: 'ship-flyby' },
      { type: 'merge-clear' },
    ],
    label: 'MISSION ACCOMPLISHED',
    act: 5,
  },

  // ═══════════════════════════════════════════════════════════════
  // ACT 6: "FINALE" (35-42s)
  // Camera pulls way back for epic wide shot. All features visible.
  // Slow orbit with full effects. Seamless loop point.
  // ═══════════════════════════════════════════════════════════════

  // KF16: Epic wide pullback — full scene glory
  {
    position: [0, 14, 26],
    target: [0, 0.5, 0],
    fov: 50,
    duration: 3.0,
    hold: 0.5,
    earlyActions: [
      { type: 'sphere-style', style: 'animated-core' },
    ],
    actions: [
      { type: 'sphere-pulse', eventType: 'success', intensity: 0.6 },
    ],
    label: 'FULL SCENE',
    act: 6,
  },

  // KF17: Slow orbit to complete the circle — ends near start position
  {
    position: [-16, 12, 16],
    target: [0, 0.5, 0],
    fov: 48,
    duration: 3.5,
    hold: 0.5,
    label: 'GRAND ORBIT',
    act: 6,
  },

  // KF18: Final position — close to KF0 start for seamless loop
  {
    position: [0, 4, 24],
    target: [0, 1.5, 0],
    fov: 52,
    duration: 3.0,
    hold: 0.0,
    actions: [
      { type: 'sphere-style', style: 'wireframe' },
    ],
    label: 'LOOP POINT',
    act: 6,
  },
]

// ── Easing ──

/** Quintic ease-in-out for very smooth, cinematic feel */
function quinticEaseInOut(t: number): number {
  if (t < 0.5) return 16 * t * t * t * t * t
  const p = -2 * t + 2
  return 1 - (p * p * p * p * p) / 2
}

// ── Scratch vectors (avoid GC in animation loop) ──
const _camPos = new THREE.Vector3()
const _camTarget = new THREE.Vector3()
const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _p3 = new THREE.Vector3()
const _t0 = new THREE.Vector3()
const _t1 = new THREE.Vector3()
const _t2 = new THREE.Vector3()
const _t3 = new THREE.Vector3()

/**
 * CatmullRom interpolation between 4 points at parameter t (0..1).
 * Uses centripetal parameterization (alpha=0.5) for smooth curves without cusps.
 */
function catmullRom(out: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number): THREE.Vector3 {
  const t2 = t * t
  const t3 = t2 * t
  out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
  out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  return out
}

// ── Fake merge state for cinematic Act 5 ──
// Dispatched via window event so PbrHoloScene can inject it into the MergeGraph.

function dispatchCinematicMerge(phase: 'start' | 'resolve' | 'clear'): void {
  window.dispatchEvent(new CustomEvent('halo-cinematic-merge', { detail: { phase } }))
}

// ── Fake terminal activity injection for Act 4 ──
// Writes directly to the global terminalActivityMap so ScreenPanel edge glow reacts.

function injectFakeActivity(level: number, projectPaths?: string[]): void {
  // If specific paths given, use those. Otherwise inject for all known paths,
  // or if the map is empty, create a few synthetic entries.
  const paths = projectPaths ?? Array.from(terminalActivityMap.keys())
  if (paths.length === 0) {
    // Synthetic paths for demo mode — ScreenPanel reads by exact match so these
    // only light up if demo projects match. Use window global as fallback.
    ;(window as any).__haloCinematicActivity = level
  }
  for (const p of paths) {
    terminalActivityMap.set(p, level)
  }
  setTerminalActivityMax(level)
}

function clearFakeActivity(): void {
  // Reset all entries to 0
  for (const key of terminalActivityMap.keys()) {
    terminalActivityMap.set(key, 0)
  }
  setTerminalActivityMax(0)
  ;(window as any).__haloCinematicActivity = 0
}

// ── Component ──

interface CinematicSequenceProps {
  /** Whether the cinematic is currently playing */
  active: boolean
  /** Called when the sequence finishes (if not looping) or is cancelled */
  onComplete?: () => void
  /** Reference to the SpaceshipFlyby component for triggering flyby */
  flybyRef?: React.RefObject<SpaceshipFlybyHandle | null>
  /** Whether to loop the sequence (trade-show mode) */
  loop?: boolean
  /** Custom keyframe sequence (defaults to the built-in cinematic) */
  sequence?: CinematicKeyframe[]
  /** Playback speed multiplier (1.0 = normal, 0.5 = half speed, 2.0 = double) */
  speed?: number
}

export function CinematicSequence({
  active,
  onComplete,
  flybyRef,
  loop = true,
  sequence = DEFAULT_SEQUENCE,
  speed = 1.0,
}: CinematicSequenceProps) {
  const { camera, controls } = useThree()
  const [currentLabel, setCurrentLabel] = useState('')
  const [currentAct, setCurrentAct] = useState(0)
  const [totalElapsed, setTotalElapsed] = useState(0)

  // Playback state refs (avoid re-renders during animation)
  const stateRef = useRef({
    segmentIndex: 0,       // current segment (keyframe pair)
    segmentTime: 0,        // elapsed time within current segment
    phase: 'move' as 'move' | 'hold', // are we moving or holding?
    actionsTriggered: false,
    earlyActionsTriggered: false,
    wasAutoRotate: true,
    wasFov: 48,
    started: false,
    totalTime: 0,          // total elapsed time for progress bar
  })

  // Pre-compute total sequence duration for progress bar
  const totalDuration = sequence.reduce((sum, kf) => sum + kf.duration + (kf.hold ?? 0), 0)

  // Store saved orbit controls state for restoration
  const savedControlsRef = useRef<{
    autoRotate: boolean
    enablePan: boolean
    enableZoom: boolean
    enabled: boolean
  } | null>(null)

  // Store original sphere style for restoration
  const savedSphereStyleRef = useRef<string | null>(null)

  // ── Activate/Deactivate ──
  useEffect(() => {
    if (!controls) return
    const oc = controls as any

    if (active) {
      // Save orbit controls state
      savedControlsRef.current = {
        autoRotate: oc.autoRotate ?? true,
        enablePan: oc.enablePan ?? false,
        enableZoom: oc.enableZoom ?? true,
        enabled: oc.enabled ?? true,
      }

      // Disable orbit controls during cinematic
      oc.enabled = false
      oc.autoRotate = false

      // Save camera FOV
      const perspCam = camera as THREE.PerspectiveCamera
      stateRef.current.wasFov = perspCam.fov

      // Reset playback state
      stateRef.current.segmentIndex = 0
      stateRef.current.segmentTime = 0
      stateRef.current.totalTime = 0
      stateRef.current.phase = sequence[0].duration === 0 ? 'hold' : 'move'
      stateRef.current.actionsTriggered = sequence[0].duration === 0
      stateRef.current.earlyActionsTriggered = false
      stateRef.current.started = true

      // Snap to first keyframe if instant (duration = 0)
      if (sequence[0].duration === 0) {
        const kf = sequence[0]
        camera.position.set(...kf.position)
        perspCam.fov = kf.fov ?? 48
        perspCam.updateProjectionMatrix()
        camera.lookAt(...kf.target)

        // Trigger first-keyframe actions
        triggerActions(kf.actions)
        setCurrentLabel(kf.label || '')
        setCurrentAct(kf.act || 0)
      }
    } else if (stateRef.current.started) {
      // Restore orbit controls
      if (savedControlsRef.current) {
        oc.enabled = savedControlsRef.current.enabled
        oc.autoRotate = savedControlsRef.current.autoRotate
        oc.enablePan = savedControlsRef.current.enablePan
        oc.enableZoom = savedControlsRef.current.enableZoom
        oc.update?.()
      }
      // Restore FOV
      const perspCam = camera as THREE.PerspectiveCamera
      perspCam.fov = stateRef.current.wasFov
      perspCam.updateProjectionMatrix()

      // Clean up all cinematic side effects
      ;(window as any).__haloAudioDemo = false
      ;(window as any).__haloCinematicActivity = 0
      clearFakeActivity()
      dispatchCinematicMerge('clear')

      // Restore sphere style
      if (savedSphereStyleRef.current) {
        window.dispatchEvent(new CustomEvent('halo-cinematic-sphere-style', {
          detail: { style: savedSphereStyleRef.current },
        }))
        savedSphereStyleRef.current = null
      }

      stateRef.current.started = false
      setCurrentLabel('')
      setCurrentAct(0)
      setTotalElapsed(0)
    }
  }, [active, controls, camera, sequence])

  // ── Action Trigger ──
  const triggerActions = useCallback((actions?: CinematicAction[]) => {
    if (!actions) return
    for (const action of actions) {
      switch (action.type) {
        case 'ship-flyby':
          flybyRef?.current?.trigger()
          break

        case 'sphere-pulse':
          dispatchSphereEvent({
            type: action.eventType ?? 'info',
            intensity: action.intensity ?? 1.0,
          })
          break

        case 'audio-demo':
          ;(window as any).__haloAudioDemo = action.enabled
          break

        case 'sphere-style':
          // Save original style on first switch
          if (!savedSphereStyleRef.current) {
            savedSphereStyleRef.current = localStorage.getItem('hal-o-sphere-style') || 'wireframe'
          }
          // Dispatch event for ProjectHub to pick up
          window.dispatchEvent(new CustomEvent('halo-cinematic-sphere-style', {
            detail: { style: action.style },
          }))
          break

        case 'activity-boost':
          injectFakeActivity(action.level, action.projectPaths)
          // Also trigger a sphere pulse for visual feedback
          if (action.level > 70) {
            dispatchSphereEvent({ type: 'info', intensity: (action.level / 100) * 0.4 })
          }
          break

        case 'activity-clear':
          clearFakeActivity()
          break

        case 'merge-simulate':
          dispatchCinematicMerge('start')
          break

        case 'merge-resolve':
          dispatchCinematicMerge('resolve')
          break

        case 'merge-clear':
          dispatchCinematicMerge('clear')
          break

        case 'particle-burst':
          // Dispatch a rapid succession of sphere events for a burst effect
          dispatchSphereEvent({ type: 'success', intensity: 1.0 })
          setTimeout(() => dispatchSphereEvent({ type: 'info', intensity: 0.8 }), 150)
          setTimeout(() => dispatchSphereEvent({ type: 'push', intensity: 0.6 }), 300)
          break
      }
    }
  }, [flybyRef])

  // ── Frame Update ──
  useFrame((_, rawDelta) => {
    if (!active || !stateRef.current.started) return

    const delta = rawDelta * speed
    const s = stateRef.current

    // Track total elapsed time for progress bar
    s.totalTime += delta
    // Update React state at ~4fps for progress bar (avoid per-frame re-render)
    if (Math.floor(s.totalTime * 4) !== Math.floor((s.totalTime - delta) * 4)) {
      setTotalElapsed(s.totalTime)
    }

    const numKeyframes = sequence.length

    // Current keyframe
    const curKf = sequence[s.segmentIndex]

    if (s.phase === 'hold') {
      // Holding at current keyframe
      s.segmentTime += delta
      const holdDur = curKf.hold ?? 0
      if (s.segmentTime >= holdDur) {
        // Move to next segment
        const nextIndex = s.segmentIndex + 1
        if (nextIndex >= numKeyframes) {
          // End of sequence
          if (loop) {
            // Reset to beginning
            s.segmentIndex = 0
            s.segmentTime = 0
            s.totalTime = 0
            s.phase = sequence[0].duration === 0 ? 'hold' : 'move'
            s.actionsTriggered = sequence[0].duration === 0
            s.earlyActionsTriggered = false

            if (sequence[0].duration === 0) {
              const kf = sequence[0]
              camera.position.set(...kf.position)
              const perspCam = camera as THREE.PerspectiveCamera
              perspCam.fov = kf.fov ?? 48
              perspCam.updateProjectionMatrix()
              camera.lookAt(...kf.target)
              triggerActions(kf.actions)
              setCurrentLabel(kf.label || '')
              setCurrentAct(kf.act || 0)
            }
          } else {
            onComplete?.()
          }
          return
        }
        s.segmentIndex = nextIndex
        s.segmentTime = 0
        s.phase = 'move'
        s.actionsTriggered = false
        s.earlyActionsTriggered = false
        setCurrentLabel(sequence[nextIndex].label || '')
        setCurrentAct(sequence[nextIndex].act || 0)
      }
      return
    }

    // ── Moving between keyframes ──
    s.segmentTime += delta

    // Trigger early actions at the start of the move phase
    if (!s.earlyActionsTriggered) {
      s.earlyActionsTriggered = true
      const kf = sequence[s.segmentIndex]
      triggerActions(kf.earlyActions)
    }

    // When segmentIndex is 0 with duration 0, we already handled that.
    // For segments 1..N, we interpolate from segmentIndex-1 to segmentIndex.
    const fromIndex = Math.max(0, s.segmentIndex - 1)
    const toIndex = s.segmentIndex
    const fromKf = sequence[fromIndex]
    const toKf = sequence[toIndex]
    const duration = toKf.duration

    // Progress 0..1 through this segment
    const rawT = Math.min(1, s.segmentTime / Math.max(0.001, duration))
    const easedT = quinticEaseInOut(rawT)

    // ── Camera Position: CatmullRom spline through 4 control points ──
    // p0 = keyframe before 'from', p1 = from, p2 = to, p3 = keyframe after 'to'
    const beforeIndex = Math.max(0, fromIndex - 1)
    const afterIndex = Math.min(numKeyframes - 1, toIndex + 1)

    _p0.set(...sequence[beforeIndex].position)
    _p1.set(...sequence[fromIndex].position)
    _p2.set(...sequence[toIndex].position)
    _p3.set(...sequence[afterIndex].position)

    catmullRom(_camPos, _p0, _p1, _p2, _p3, easedT)
    camera.position.copy(_camPos)

    // ── Camera Target: CatmullRom spline for smooth target tracking ──
    _t0.set(...sequence[beforeIndex].target)
    _t1.set(...sequence[fromIndex].target)
    _t2.set(...sequence[toIndex].target)
    _t3.set(...sequence[afterIndex].target)

    catmullRom(_camTarget, _t0, _t1, _t2, _t3, easedT)
    camera.lookAt(_camTarget)

    // ── FOV: linear lerp ──
    const perspCam = camera as THREE.PerspectiveCamera
    const fromFov = fromKf.fov ?? 48
    const toFov = toKf.fov ?? 48
    perspCam.fov = fromFov + (toFov - fromFov) * easedT
    perspCam.updateProjectionMatrix()

    // ── Trigger actions when arriving (t >= 0.95) ──
    if (rawT >= 0.95 && !s.actionsTriggered) {
      s.actionsTriggered = true
      triggerActions(toKf.actions)
    }

    // ── Segment complete ──
    if (rawT >= 1.0) {
      // Snap to exact final position
      camera.position.set(...toKf.position)
      camera.lookAt(...toKf.target)
      perspCam.fov = toKf.fov ?? 48
      perspCam.updateProjectionMatrix()

      // Transition to hold phase
      s.segmentTime = 0
      s.phase = 'hold'

      // Ensure actions triggered
      if (!s.actionsTriggered) {
        s.actionsTriggered = true
        triggerActions(toKf.actions)
      }
    }
  })

  // ── Demo Mode Badge (HTML overlay inside R3F) ──
  if (!active) return null

  const progress = totalDuration > 0 ? Math.min(1, totalElapsed / totalDuration) : 0
  const actTitle = ACT_TITLES[currentAct] || ''

  return (
    <Html
      fullscreen
      style={{
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        pointerEvents: 'none',
      }}>
        {/* CINEMATIC MODE badge */}
        <div style={{
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 3,
          color: '#ff4444',
          background: 'rgba(255, 68, 68, 0.08)',
          border: '1px solid rgba(255, 68, 68, 0.25)',
          padding: '4px 12px',
          borderRadius: 2,
          animation: 'cinematicPulse 2s ease-in-out infinite',
          textTransform: 'uppercase',
        }}>
          CINEMATIC MODE
        </div>

        {/* Act number + title */}
        {currentAct > 0 && (
          <div style={{
            fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 2,
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase',
          }}>
            ACT {currentAct} &mdash; {actTitle}
          </div>
        )}

        {/* Current segment label */}
        {currentLabel && (
          <div style={{
            fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: 2,
            color: 'rgba(255, 255, 255, 0.3)',
            textTransform: 'uppercase',
          }}>
            {currentLabel}
          </div>
        )}

        {/* Progress bar */}
        <div style={{
          width: 120,
          height: 2,
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 1,
          overflow: 'hidden',
          marginTop: 2,
        }}>
          <div style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: 'rgba(255, 68, 68, 0.5)',
            borderRadius: 1,
            transition: 'width 0.25s linear',
          }} />
        </div>

        <style>{`
          @keyframes cinematicPulse {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>

      {/* ESC to exit hint — bottom center */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        fontSize: 9,
        letterSpacing: 2,
        color: 'rgba(255, 255, 255, 0.2)',
        pointerEvents: 'none',
        textTransform: 'uppercase',
      }}>
        ESC TO EXIT
      </div>
    </Html>
  )
}
