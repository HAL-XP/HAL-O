import { useState, useCallback } from 'react'

const STORAGE_KEY = 'hal-o-hidden-projects'

function loadHidden(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHidden(paths: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
}

export interface HiddenProjectsState {
  hiddenPaths: string[]
  hideProject: (path: string) => void
  unhideProject: (path: string) => void
  isHidden: (path: string) => boolean
}

export function useHiddenProjects(): HiddenProjectsState {
  const [hiddenPaths, setHiddenPaths] = useState<string[]>(loadHidden)

  const hideProject = useCallback((path: string) => {
    setHiddenPaths((prev) => {
      if (prev.includes(path)) return prev
      const next = [...prev, path]
      saveHidden(next)
      return next
    })
  }, [])

  const unhideProject = useCallback((path: string) => {
    setHiddenPaths((prev) => {
      const next = prev.filter((p) => p !== path)
      saveHidden(next)
      return next
    })
  }, [])

  const isHidden = useCallback((path: string): boolean => {
    return hiddenPaths.includes(path)
  }, [hiddenPaths])

  return {
    hiddenPaths,
    hideProject,
    unhideProject,
    isHidden,
  }
}
