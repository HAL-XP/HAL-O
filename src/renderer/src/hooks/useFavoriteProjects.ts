import { useState, useCallback } from 'react'

const STORAGE_KEY = 'hal-o-favorite-projects'

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveFavorites(paths: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
}

export interface FavoriteProjectsState {
  favoritePaths: Set<string>
  toggleFavorite: (path: string) => void
  isFavorite: (path: string) => boolean
}

export function useFavoriteProjects(): FavoriteProjectsState {
  const [favoriteList, setFavoriteList] = useState<string[]>(loadFavorites)

  const favoritePaths = new Set(favoriteList)

  const toggleFavorite = useCallback((path: string) => {
    setFavoriteList((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path]
      saveFavorites(next)
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
