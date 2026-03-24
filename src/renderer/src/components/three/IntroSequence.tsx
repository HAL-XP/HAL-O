/**
 * IntroSequence — Cinematic fly-in camera spline on app launch (M2c).
 *
 * When the scene finishes loading, instead of a simple fade, the camera flies in
 * from deep space along a dramatic CatmullRom spline — like approaching a space station.
 * 6 seconds total, quintic ease-out (fast approach, gentle settle), then hands
 * control to OrbitControls at the default position.
 *
 * Reuses the same CatmullRom + easing infrastructure as CinematicSequence.
 * Skip: click anywhere or press any key → jump to final position instantly.
 */
import { useRef, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ── Intro Keyframes ──
// Camera approaches from deep space and settles into the default orbit position.

interface IntroKeyframe {
  position: [number, number, number]
  target: [number, number, number]
  fov?: number
  /** Normalized time 0..1 at which this keyframe occurs */
  t: number
}

const INTRO_KEYFRAMES: IntroKeyframe[] = [
  // KF0 (t=0): Far away, high angle — deep space
  { position: [0, 40, 80], target: [0, 0, 0], fov: 52, t: 0 },
  // KF1 (t=0.3): Swooping in from the side
  { position: [20, 15, 40], target: [0, 1, 0], fov: 50, t: 0.3 },
  // KF2 (t=0.6): Through the particle field
  { position: [-5, 8, 25], target: [0, 1, 0], fov: 48, t: 0.6 },
  // KF3 (t=0.85): Close to final position, panning past panels
  { position: [0, 10, 18], target: [0, 0.5, 0], fov: 48, t: 0.85 },
  // KF4 (t=1.0): Default orbit camera position
  { position: [0, 10, 16], target: [0, 0.3, 0], fov: 48, t: 1.0 },
]

const INTRO_DURATION = 6.0 // seconds

// ── Easing: quintic ease-out — fast approach, gentle settle ──
function quinticEaseOut(t: number): number {
  const p = 1 - t
  return 1 - p * p * p * p * p
}

// ── Scratch vectors (avoid GC) ──
const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _p3 = new THREE.Vector3()
const _t0 = new THREE.Vector3()
const _t1 = new THREE.Vector3()
const _t2 = new THREE.Vector3()
const _t3 = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _camTarget = new THREE.Vector3()

/**
 * CatmullRom interpolation between 4 points at parameter t (0..1).
 */
function catmullRom(
  out: THREE.Vector3,
  p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  const t2 = t * t
  const t3 = t2 * t
  out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
  out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  return out
}

/**
 * Given a global normalized t (0..1), find which keyframe segment we're in
 * and return the local interpolation parameter + the 4 CatmullRom control point indices.
 */
function findSegment(kfs: IntroKeyframe[], globalT: number): {
  i0: number; i1: number; i2: number; i3: number; localT: number
} {
  // Clamp
  const t = Math.max(0, Math.min(1, globalT))

  // Find the segment: the two keyframes globalT falls between
  let segFrom = 0
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i].t >= t) {
      segFrom = i - 1
      break
    }
  }
  const segTo = Math.min(segFrom + 1, kfs.length - 1)

  // Local t within this segment
  const segStart = kfs[segFrom].t
  const segEnd = kfs[segTo].t
  const segLen = segEnd - segStart
  const localT = segLen > 0.0001 ? (t - segStart) / segLen : 0

  // CatmullRom needs 4 points: before-from, from, to, after-to
  const i0 = Math.max(0, segFrom - 1)
  const i3 = Math.min(kfs.length - 1, segTo + 1)

  return { i0, i1: segFrom, i2: segTo, i3, localT }
}

// ── Component ──

interface IntroSequenceProps {
  /** Whether the intro should play (true when scene is ready + intro enabled) */
  active: boolean
  /** Called when the intro finishes or is skipped */
  onComplete: () => void
  /** Override the target camera position [x,y,z] for the final keyframe */
  finalPosition?: [number, number, number]
  /** Override the orbit controls target for the final keyframe */
  finalTarget?: [number, number, number]
}

export function IntroSequence({
  active,
  onComplete,
  finalPosition,
  finalTarget,
}: IntroSequenceProps) {
  const { camera, controls } = useThree()

  const stateRef = useRef({
    elapsed: 0,
    started: false,
    completed: false,
  })

  // Merge final position overrides into keyframes
  const keyframes = useRef(INTRO_KEYFRAMES)
  useEffect(() => {
    // Clone and override last keyframe if needed
    const kfs = INTRO_KEYFRAMES.map(kf => ({ ...kf }))
    if (finalPosition) {
      kfs[kfs.length - 1].position = finalPosition
    }
    if (finalTarget) {
      kfs[kfs.length - 1].target = finalTarget
    }
    keyframes.current = kfs
  }, [finalPosition, finalTarget])

  // Skip handler: click or keypress jumps to final position
  const skipToEnd = useCallback(() => {
    if (!stateRef.current.started || stateRef.current.completed) return
    stateRef.current.completed = true

    const kfs = keyframes.current
    const final = kfs[kfs.length - 1]

    // Snap camera to final position
    camera.position.set(...final.position)
    camera.lookAt(...final.target)
    const perspCam = camera as THREE.PerspectiveCamera
    perspCam.fov = final.fov ?? 48
    perspCam.updateProjectionMatrix()

    // Re-enable orbit controls
    if (controls) {
      const oc = controls as any
      oc.enabled = true
      oc.autoRotate = true
      oc.target.set(...final.target)
      oc.update?.()
    }

    onComplete()
  }, [camera, controls, onComplete])

  // ── Activate/Deactivate ──
  useEffect(() => {
    if (!active) {
      stateRef.current.started = false
      stateRef.current.completed = false
      stateRef.current.elapsed = 0
      return
    }

    if (!controls) return

    const oc = controls as any
    const s = stateRef.current

    // Start the intro
    s.elapsed = 0
    s.started = true
    s.completed = false

    // Disable orbit controls during intro
    oc.enabled = false
    oc.autoRotate = false

    // Snap to first keyframe position
    const kfs = keyframes.current
    const first = kfs[0]
    camera.position.set(...first.position)
    camera.lookAt(...first.target)
    const perspCam = camera as THREE.PerspectiveCamera
    perspCam.fov = first.fov ?? 52
    perspCam.updateProjectionMatrix()

    // Register skip listeners
    const onKey = (e: KeyboardEvent) => {
      // Don't skip on modifier keys alone
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return
      skipToEnd()
    }
    const onClick = () => skipToEnd()

    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
    }
  }, [active, controls, camera, skipToEnd])

  // ── Frame Update ──
  useFrame((_, delta) => {
    const s = stateRef.current
    if (!s.started || s.completed) return

    s.elapsed += delta
    const rawT = Math.min(1, s.elapsed / INTRO_DURATION)
    const easedT = quinticEaseOut(rawT)

    const kfs = keyframes.current
    const { i0, i1, i2, i3, localT } = findSegment(kfs, easedT)

    // Interpolate camera position via CatmullRom
    _p0.set(...kfs[i0].position)
    _p1.set(...kfs[i1].position)
    _p2.set(...kfs[i2].position)
    _p3.set(...kfs[i3].position)
    catmullRom(_camPos, _p0, _p1, _p2, _p3, localT)
    camera.position.copy(_camPos)

    // Interpolate camera target via CatmullRom
    _t0.set(...kfs[i0].target)
    _t1.set(...kfs[i1].target)
    _t2.set(...kfs[i2].target)
    _t3.set(...kfs[i3].target)
    catmullRom(_camTarget, _t0, _t1, _t2, _t3, localT)
    camera.lookAt(_camTarget)

    // Interpolate FOV
    const perspCam = camera as THREE.PerspectiveCamera
    const fromFov = kfs[i1].fov ?? 48
    const toFov = kfs[i2].fov ?? 48
    perspCam.fov = fromFov + (toFov - fromFov) * localT
    perspCam.updateProjectionMatrix()

    // Check completion
    if (rawT >= 1.0) {
      s.completed = true

      // Snap to exact final position
      const final = kfs[kfs.length - 1]
      camera.position.set(...final.position)
      camera.lookAt(...final.target)
      perspCam.fov = final.fov ?? 48
      perspCam.updateProjectionMatrix()

      // Re-enable orbit controls
      if (controls) {
        const oc = controls as any
        oc.enabled = true
        oc.autoRotate = true
        oc.target.set(...final.target)
        oc.update?.()
      }

      onComplete()
    }
  })

  return null
}
