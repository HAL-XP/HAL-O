import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'hal-o-favorite-projects'

function loadFromLocalStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToLocalStorage(paths: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
}

// B37: Dual-persist — save to both localStorage and file via IPC
function saveToFile(paths: string[]) {
  window.api?.saveFavorites?.(paths).catch(() => { /* silent — file backup is best-effort */ })
}

export interface FavoriteProjectsState {
  favoritePaths: Set<string>
  toggleFavorite: (path: string) => void
  isFavorite: (path: string) => boolean
}

export function useFavoriteProjects(): FavoriteProjectsState {
  const [favoriteList, setFavoriteList] = useState<string[]>(loadFromLocalStorage)

  // B37: On mount, merge localStorage + file backup (file wins if localStorage is empty)
  useEffect(() => {
    window.api?.loadFavorites?.().then((fileFavs: string[]) => {
      if (!fileFavs || fileFavs.length === 0) return
      setFavoriteList(prev => {
        if (prev.length > 0) {
          // Both have data — merge (union, dedupe)
          const merged = [...new Set([...prev, ...fileFavs])]
          saveToLocalStorage(merged)
          saveToFile(merged)
          return merged
        }
        // localStorage was empty, restore from file
        saveToLocalStorage(fileFavs)
        return fileFavs
      })
    }).catch(() => { /* silent */ })
  }, [])

  const favoritePaths = new Set(favoriteList)

  const toggleFavorite = useCallback((path: string) => {
    setFavoriteList((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path]
      saveToLocalStorage(next)
      saveToFile(next)
      return next
    })
  }, [])

  const isFavorite = useCallback((path: string): boolean => {
    return favoriteList.includes(path)
  }, [favoriteList])

  return {
    favoritePaths,
    toggleFavorite,
    isFavorite,
  }
}
