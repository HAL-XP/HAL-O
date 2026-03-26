/**
 * UX16 Phase 2 / B39 fix: CameraEaser — smoothly orbits camera to face the
 * selected card at a fixed close-up distance.
 *
 * Reads the selected card's 3D position from the module-level store in
 * useHubKeyboard. Computes a target camera position (same azimuth as the card,
 * fixed distance from the orbit center, fixed polar angle) and smoothly lerps
 * the camera toward it each frame.
 *
 * B39: The previous implementation preserved `camera.position.length()` as the
 * orbit distance, but that measures distance from the WORLD ORIGIN — not from
 * the OrbitControls target. With a non-zero target (e.g. [0, 0.3, 0]) this
 * caused the distance to creep outward with each keypress. The fix:
 *   1. Compute distance from `oc.target`, not from world origin.
 *   2. Interpolate distance toward a fixed close-up value (card radial
 *      distance + CLOSE_UP_OFFSET) instead of preserving the current distance.
 *   3. Lerp both azimuth AND distance simultaneously.
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
// How many units beyond the card's radial distance the close-up camera sits
const CLOSE_UP_OFFSET = 4

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
    startDist: number
    targetDist: number
    startPolar: number
    elapsed: number
    lastPos: [number, number, number] | null
  }>({
    active: false,
    startAzimuth: 0,
    targetAzimuth: 0,
    startDist: 0,
    targetDist: 0,
    startPolar: 0,
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

        // B39: Compute close-up distance from the card's radial distance in the XZ plane.
        // The card sits at screenRadius from center; the camera should orbit just outside it.
        const cardRadialDist = Math.sqrt(targetPos[0] ** 2 + targetPos[2] ** 2)
        const closeUpDist = cardRadialDist + CLOSE_UP_OFFSET

        // B39: Current distance from camera to OrbitControls target (NOT world origin).
        const ocTarget = oc.target
        const dx = camera.position.x - ocTarget.x
        const dy = camera.position.y - ocTarget.y
        const dz = camera.position.z - ocTarget.z
        const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        const azimuthDelta = angleDelta(currentAzimuth, targetAzimuth)
        const distDelta = Math.abs(currentDist - closeUpDist)
        if (Math.abs(azimuthDelta) > MIN_ANGLE_DELTA || distDelta > 0.5) {
          // Temporarily pause auto-rotate during easing
          if (oc.autoRotate) {
            oc.autoRotate = false
          }

          state.active = true
          state.startAzimuth = currentAzimuth
          state.targetAzimuth = targetAzimuth
          state.startDist = currentDist
          state.targetDist = closeUpDist
          state.startPolar = oc.getPolarAngle() as number
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

    // Interpolate azimuthal angle (shortest path)
    const azDelta = angleDelta(state.startAzimuth, state.targetAzimuth)
    const newAzimuth = state.startAzimuth + azDelta * smooth

    // B39: Interpolate distance toward the close-up target
    const newDist = state.startDist + (state.targetDist - state.startDist) * smooth

    // Preserve the polar angle captured at easing start (stable elevation)
    const polarAngle = state.startPolar

    // Spherical to Cartesian (Three.js convention: Y-up)
    // Position is relative to OrbitControls target
    const ocTarget = oc.target
    const sinPolar = Math.sin(polarAngle)
    const cosPolar = Math.cos(polarAngle)

    camera.position.set(
      ocTarget.x + newDist * sinPolar * Math.sin(newAzimuth),
      ocTarget.y + newDist * cosPolar,
      ocTarget.z + newDist * sinPolar * Math.cos(newAzimuth),
    )

    oc.update()

    // Complete easing — B40: explicitly re-enable autoRotate after easing finishes.
    // Previously relied on AutoRotateManager's 1.2s timeout, which caused a visible
    // pause then snap-back during video recording when autoRotate and CameraEaser fought.
    if (t >= 1) {
      state.active = false
      // Re-enable autoRotate immediately (AutoRotateManager won't conflict — its
      // timeout only fires after an interaction 'end' event, not after CameraEaser).
      if (!oc.autoRotate) {
        oc.autoRotate = true
      }
    }
  })

  return null
}
