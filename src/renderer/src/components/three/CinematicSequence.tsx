/**
 * CinematicSequence — Scripted camera sequence for marketing videos & trade shows (M2).
 *
 * Features:
 * - Array of keyframes with position, lookAt target, FOV, and optional action triggers
 * - CatmullRom spline interpolation for smooth camera paths (no jank)
 * - Cubic ease-in-out for time progression within each segment
 * - Disables OrbitControls during playback, restores on finish/cancel
 * - Triggers events at specific keyframes (ship flyby, sphere pulse)
 * - Shows subtle "DEMO MODE" badge in corner via Html overlay
 * - Loops seamlessly for trade-show kiosk mode
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { SpaceshipFlybyHandle } from './SpaceshipFlyby'
import { dispatchSphereEvent } from './PbrHoloScene'

// ── Types ──

export type CinematicAction =
  | { type: 'ship-flyby' }
  | { type: 'sphere-pulse'; eventType?: 'success' | 'info' | 'push'; intensity?: number }
  | { type: 'audio-demo'; enabled: boolean }

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
  /** Label shown in the DEMO MODE badge during this segment */
  label?: string
}

// ── Default Cinematic Sequence ──
// Designed for a scene with screens at radius ~8, sphere at [0,1.3,0], floor at y=0.

const DEFAULT_SEQUENCE: CinematicKeyframe[] = [
  // 0: Wide establishing shot — high orbit, full scene visible
  {
    position: [0, 12, 22],
    target: [0, 0.5, 0],
    fov: 48,
    duration: 0, // instant (start position)
    hold: 2.0,
    label: 'ESTABLISHING SHOT',
  },
  // 1: Slow orbit to side — showing depth of scene
  {
    position: [18, 10, 14],
    target: [0, 0.5, 0],
    fov: 46,
    duration: 6.0,
    hold: 1.0,
    label: 'SCENE OVERVIEW',
  },
  // 2: Swoop down toward sphere — dramatic zoom-in
  {
    position: [6, 3.5, 6],
    target: [0, 1.3, 0],
    fov: 38,
    duration: 4.0,
    hold: 2.5,
    actions: [
      { type: 'sphere-pulse', eventType: 'info', intensity: 1.0 },
      { type: 'audio-demo', enabled: true },
    ],
    label: 'HAL SPHERE',
  },
  // 3: Pan across project panels — arc through the screen ring
  {
    position: [-8, 4, 8],
    target: [-5, 2.5, 0],
    fov: 42,
    duration: 5.0,
    hold: 1.5,
    actions: [
      { type: 'audio-demo', enabled: false },
    ],
    label: 'PROJECT PANELS',
  },
  // 4: Ship flyby trigger — pull back to wide angle for dramatic pass
  {
    position: [-14, 8, 12],
    target: [0, 2, 0],
    fov: 50,
    duration: 3.5,
    hold: 0.5,
    actions: [
      { type: 'ship-flyby' },
      { type: 'sphere-pulse', eventType: 'push', intensity: 1.0 },
    ],
    label: 'STAR DESTROYER FLYBY',
  },
  // 5: Follow ship trajectory — track the flyby
  {
    position: [8, 6, 10],
    target: [4, 3, -2],
    fov: 44,
    duration: 5.0,
    hold: 1.5,
    label: 'TRACKING SHOT',
  },
  // 6: Panel closeup — zoom into a specific screen area
  {
    position: [5, 3.0, 6],
    target: [6, 2.5, 2],
    fov: 32,
    duration: 3.5,
    hold: 3.0,
    label: 'PANEL CLOSEUP',
  },
  // 7: Dramatic pull-back to wide finale
  {
    position: [0, 14, 24],
    target: [0, 0.5, 0],
    fov: 48,
    duration: 5.0,
    hold: 3.0,
    actions: [
      { type: 'sphere-pulse', eventType: 'success', intensity: 0.8 },
    ],
    label: 'FINALE',
  },
]

// ── Easing ──

/** Cubic ease-in-out: smooth acceleration/deceleration */
function cubicEaseInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

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

  // Playback state refs (avoid re-renders during animation)
  const stateRef = useRef({
    segmentIndex: 0,       // current segment (keyframe pair)
    segmentTime: 0,        // elapsed time within current segment
    phase: 'move' as 'move' | 'hold', // are we moving or holding?
    actionsTriggered: false,
    wasAutoRotate: true,
    wasFov: 48,
    started: false,
  })

  // Store saved orbit controls state for restoration
  const savedControlsRef = useRef<{
    autoRotate: boolean
    enablePan: boolean
    enableZoom: boolean
    enabled: boolean
  } | null>(null)

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
      stateRef.current.phase = sequence[0].duration === 0 ? 'hold' : 'move'
      stateRef.current.actionsTriggered = sequence[0].duration === 0
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

      // Clean up audio demo
      ;(window as any).__haloAudioDemo = false

      stateRef.current.started = false
      setCurrentLabel('')
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
      }
    }
  }, [flybyRef])

  // ── Frame Update ──
  useFrame((_, rawDelta) => {
    if (!active || !stateRef.current.started) return

    const delta = rawDelta * speed
    const s = stateRef.current
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
            s.phase = sequence[0].duration === 0 ? 'hold' : 'move'
            s.actionsTriggered = sequence[0].duration === 0

            if (sequence[0].duration === 0) {
              const kf = sequence[0]
              camera.position.set(...kf.position)
              const perspCam = camera as THREE.PerspectiveCamera
              perspCam.fov = kf.fov ?? 48
              perspCam.updateProjectionMatrix()
              camera.lookAt(...kf.target)
              triggerActions(kf.actions)
              setCurrentLabel(kf.label || '')
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
        setCurrentLabel(sequence[nextIndex].label || '')
      }
      return
    }

    // ── Moving between keyframes ──
    s.segmentTime += delta
    const targetKf = curKf // We're moving TOWARD segmentIndex (from segmentIndex-1)

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
        gap: 4,
        pointerEvents: 'none',
      }}>
        {/* DEMO MODE badge */}
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
        {/* Current segment label */}
        {currentLabel && (
          <div style={{
            fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: 2,
            color: 'rgba(255, 255, 255, 0.35)',
            textTransform: 'uppercase',
          }}>
            {currentLabel}
          </div>
        )}
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
