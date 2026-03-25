import { useState, useCallback, useEffect, useRef } from 'react'

// Witty loading messages — rotate through these while waiting
const LOADING_MESSAGES = [
  'INITIALIZING SYSTEMS...',
  'CALIBRATING SENSORS...',
  'WARMING UP THE FLUX CAPACITOR...',
  'LOADING HOLOGRAPHIC MATRIX...',
  'ALIGNING ORBITAL TRAJECTORIES...',
  'BOOTING NEURAL PATHWAYS...',
  'SYNCING WITH MISSION CONTROL...',
  'TRIANGULATING STAR MAPS...',
  'CHARGING PARTICLE ARRAYS...',
  'ESTABLISHING QUANTUM LINK...',
  'DEFRAGMENTING HYPERSPACE...',
  'POLISHING THE LENS...',
  'SPINNING UP THE WARP DRIVE...',
  'COMPILING STARDUST...',
  'NEGOTIATING WITH THE VOID...',
]

export function useSceneReady() {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0])
  const msgIndex = useRef(0)

  const onSceneReady = useCallback(() => setReady(true), [])
  const reset = useCallback(() => { setReady(false); setDismissed(false); msgIndex.current = 0 }, [])

  // Dismiss 500ms after ready
  useEffect(() => {
    if (ready) {
      const timer = setTimeout(() => setDismissed(true), 500)
      return () => clearTimeout(timer)
    }
  }, [ready])

  // Safety timeout: force dismiss after 10s even if scene never signals ready
  // Prevents stuck black screen on HMR / hot reload / WebGL errors
  useEffect(() => {
    if (dismissed) return
    const safety = setTimeout(() => {
      console.warn('[HAL-O] Scene overlay safety timeout — force dismissing after 10s')
      setReady(true)
      setDismissed(true)
    }, 10_000)
    return () => clearTimeout(safety)
  }, [dismissed])

  // Rotate witty messages every 1.5s while not ready
  useEffect(() => {
    if (ready) return
    const interval = setInterval(() => {
      msgIndex.current = (msgIndex.current + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[msgIndex.current])
    }, 1500)
    return () => clearInterval(interval)
  }, [ready])

  return { ready, dismissed, onSceneReady, reset, loadingMsg }
}
