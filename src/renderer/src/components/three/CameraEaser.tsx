/**
 * UX16 Phase 2: CameraEaser — smoothly orbits camera to face the selected card.
 *
 * Reads the selected card's 3D position from the module-level store in useHubKeyboard.
 * Computes the target azimuthal angle and smoothly lerps OrbitControls toward it.
 *
 * This component lives INSIDE the R3F Canvas (as a sibling of OrbitControls)
 * so it can use useFrame and useThree.
 */
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { getSelectedCardPosition } from '../../hooks/useHubKeyboard'

// Easing duration in seconds
const EASE_DURATION = 0.5
// Minimum angle difference (radians) to trigger easing — avoids micro-corrections
const MIN_ANGLE_DELTA = 0.02

/** Normalize angle to [-PI, PI] range */
function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/** Shortest angular distance from `from` to `to`, signed */
function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from)
}

export function CameraEaser() {
  const { camera, controls } = useThree()
  const easingRef = useRef<{
    active: boolean
    startAzimuth: number
    targetAzimuth: number
    elapsed: number
    lastPos: [number, number, number] | null
  }>({
    active: false,
    startAzimuth: 0,
    targetAzimuth: 0,
    elapsed: 0,
    lastPos: null,
  })

  useFrame((_, delta) => {
    const oc = controls as any
    if (!oc || !('getAzimuthalAngle' in oc)) return

    const targetPos = getSelectedCardPosition()
    const state = easingRef.current

    // Detect when a new card is selected (position changed)
    if (targetPos) {
      const posChanged = !state.lastPos ||
        targetPos[0] !== state.lastPos[0] ||
        targetPos[1] !== state.lastPos[1] ||
        targetPos[2] !== state.lastPos[2]

      if (posChanged) {
        state.lastPos = [targetPos[0], targetPos[1], targetPos[2]]

        // Compute the target azimuthal angle from the card's position.
        // OrbitControls azimuthal angle is measured from +Z axis toward +X axis.
        // atan2(x, z) gives the angle from +Z axis clockwise (matching OrbitControls convention).
        const targetAzimuth = Math.atan2(targetPos[0], targetPos[2])

        // Get current azimuthal angle from OrbitControls
        const currentAzimuth = oc.getAzimuthalAngle() as number

        const delta2 = angleDelta(currentAzimuth, targetAzimuth)
        if (Math.abs(delta2) > MIN_ANGLE_DELTA) {
          // Temporarily pause auto-rotate during easing
          if (oc.autoRotate) {
            oc.autoRotate = false
          }

          state.active = true
          state.startAzimuth = currentAzimuth
          state.targetAzimuth = targetAzimuth
          state.elapsed = 0
        }
      }
    } else {
      // No selection — clear tracking state, stop easing
      state.lastPos = null
      if (state.active) {
        state.active = false
      }
      return
    }

    // Run easing animation
    if (!state.active) return

    state.elapsed += delta
    const t = Math.min(state.elapsed / EASE_DURATION, 1)

    // Smooth step easing (ease-in-out)
    const smooth = t * t * (3 - 2 * t)

    // Compute interpolated azimuthal angle
    const delta3 = angleDelta(state.startAzimuth, state.targetAzimuth)
    const newAzimuth = state.startAzimuth + delta3 * smooth

    // Apply: set camera position on the orbit sphere at the new azimuthal angle
    // Preserve the current polar angle and distance
    const currentDist = camera.position.length()
    const polarAngle = oc.getPolarAngle() as number

    // Spherical to Cartesian (Three.js convention: Y-up)
    // Target is OrbitControls.target (usually [0, 0.3, 0])
    const target = oc.target
    const sinPolar = Math.sin(polarAngle)
    const cosPolar = Math.cos(polarAngle)

    camera.position.set(
      target.x + currentDist * sinPolar * Math.sin(newAzimuth),
      target.y + currentDist * cosPolar,
      target.z + currentDist * sinPolar * Math.cos(newAzimuth),
    )

    oc.update()

    // Complete easing
    if (t >= 1) {
      state.active = false
      // Note: AutoRotateManager will re-enable autoRotate via its timeout
    }
  })

  return null
}
