/**
 * AutoRotateManager — Imperatively controls OrbitControls autoRotate.
 *
 * B31b: autoRotate MUST NOT be a JSX prop on OrbitControls. React re-renders
 * re-apply declarative props, overriding the imperative disable during drag.
 * This component manages autoRotate via refs + event listeners only.
 */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'

export function AutoRotateManager({ searchActive = false, enabled = true, speed = 0.12 }: { searchActive?: boolean; enabled?: boolean; speed?: number }) {
  const { controls } = useThree()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interactingRef = useRef(false)

  // Imperatively enable auto-rotate on mount and when enabled/speed props change
  useEffect(() => {
    if (!controls) return
    const oc = controls as any
    oc.autoRotate = enabled && !searchActive
    oc.autoRotateSpeed = speed
  }, [controls, enabled, speed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pause/resume on search state changes
  useEffect(() => {
    if (!controls) return
    const oc = controls as any
    if (!enabled || searchActive) {
      oc.autoRotate = false
    } else if (!interactingRef.current) {
      oc.autoRotate = true
    }
  }, [searchActive, controls, enabled])

  useEffect(() => {
    if (!controls) return
    const oc = controls as any

    const onStart = () => {
      interactingRef.current = true
      oc.autoRotate = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }

    const onEnd = () => {
      interactingRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (!enabled || searchActive) return
      // Wait for damping to settle before re-enabling autoRotate.
      // dampingFactor 0.12 settles in ~1s, so 1.2s is safe.
      timeoutRef.current = setTimeout(() => {
        oc.autoRotate = true
      }, 1200)
    }

    oc.addEventListener('start', onStart)
    oc.addEventListener('end', onEnd)

    return () => {
      oc.removeEventListener('start', onStart)
      oc.removeEventListener('end', onEnd)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [controls, searchActive, enabled])

  return null
}
