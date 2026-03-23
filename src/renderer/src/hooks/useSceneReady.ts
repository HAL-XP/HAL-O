import { useState, useCallback, useEffect } from 'react'

export function useSceneReady() {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const onSceneReady = useCallback(() => setReady(true), [])
  const reset = useCallback(() => { setReady(false); setDismissed(false) }, [])

  useEffect(() => {
    if (ready) {
      const timer = setTimeout(() => setDismissed(true), 500)
      return () => clearTimeout(timer)
    }
  }, [ready])

  return { ready, dismissed, onSceneReady, reset }
}
