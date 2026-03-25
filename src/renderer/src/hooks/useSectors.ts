/**
 * Tactical Sectors — pagination for 100+ project cards in the 3D hub.
 *
 * Projects are organized into numbered sectors (default 16 cards per sector).
 * Sector 1 = favorites + open terminals + recently active (7d). Rest fill alphabetically.
 * Persists currentSector to localStorage. Provides navigation callbacks for keyboard/UI.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { ProjectInfo } from '../types'

const STORAGE_KEY = 'hal-o-current-sector'

// ── Sector Hue Palette ──
// Sector 1: cyan, 2: amber, 3: magenta, 4: green, 5+: cycling HSL at 72° increments
export const SECTOR_HUES: string[] = [
  '#00f5ff', // cyan
  '#f59e0b', // amber
  '#c026d3', // magenta
  '#22c55e', // green
]

/** Get the hue color for a sector index (0-based) */
export function getSectorHue(sectorIndex: number): string {
  if (sectorIndex < SECTOR_HUES.length) return SECTOR_HUES[sectorIndex]
  // Cycling: start from cyan (180°), step 72° per sector beyond the palette
  const hue = (180 + (sectorIndex - SECTOR_HUES.length + 1) * 72) % 360
  return `hsl(${hue}, 80%, 55%)`
}

/** HUD text injection messages per sector switch */
export function getSectorHudText(sectorIndex: number, totalSectors: number, projectCount: number): string {
  return `[ SECTOR ${sectorIndex + 1} ONLINE — ${projectCount} TARGET${projectCount !== 1 ? 'S' : ''} ACQUIRED ]`
}

function loadCurrentSector(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v !== null) {
      const n = parseInt(v)
      if (!isNaN(n) && n >= 0) return n
    }
  } catch { /* */ }
  return 0
}

function saveCurrentSector(sector: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(sector))
  } catch { /* */ }
}

/** Check if a project was recently active (within the last N days) */
function isRecentlyActive(project: ProjectInfo, days: number): boolean {
  if (!project.lastModified) return false
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return project.lastModified > cutoff
}

/**
 * Assign projects into sectors.
 * Phase 1: Priority projects (favorites + recently active 7d) always in Sector 1.
 * Phase 2: Remainder sorted alphabetically, split evenly across sectors.
 */
function assignSectors(
  projects: ProjectInfo[],
  cardsPerSector: number,
  isFavorite: (path: string) => boolean,
): ProjectInfo[][] {
  if (projects.length === 0) return [[]]

  // Phase 1: Priority projects → always Sector 1
  const priority: ProjectInfo[] = []
  const rest: ProjectInfo[] = []

  for (const p of projects) {
    if (isFavorite(p.path) || isRecentlyActive(p, 7)) {
      priority.push(p)
    } else {
      rest.push(p)
    }
  }

  // Phase 2: Remainder sorted alphabetically
  rest.sort((a, b) => a.name.localeCompare(b.name))

  const ordered = [...priority, ...rest]

  // Slice into sectors
  const sectors: ProjectInfo[][] = []
  for (let i = 0; i < ordered.length; i++) {
    const sectorIdx = Math.floor(i / cardsPerSector)
    if (!sectors[sectorIdx]) sectors[sectorIdx] = []
    sectors[sectorIdx].push(ordered[i])
  }

  // Ensure at least one sector exists
  if (sectors.length === 0) sectors.push([])

  return sectors
}

export interface UseSectorsResult {
  /** Current sector index (0-based) */
  currentSector: number
  /** Total number of sectors */
  totalSectors: number
  /** Projects in the current sector */
  sectorProjects: ProjectInfo[]
  /** All sectors (array of project arrays) */
  allSectors: ProjectInfo[][]
  /** Switch to a specific sector (0-based) */
  switchSector: (n: number) => void
  /** Navigate to next sector (wraps) */
  nextSector: () => void
  /** Navigate to previous sector (wraps) */
  prevSector: () => void
  /** True if there are multiple sectors (used to show/hide HUD) */
  hasSectors: boolean
  /** Sector hue color for the current sector */
  sectorHue: string
  /** Whether a sector transition is currently active (for animation) */
  transitioning: boolean
  /** Direction of the last transition: 1 = forward, -1 = backward */
  transitionDirection: number
  /** Timestamp of last sector change (for animation triggers) */
  lastTransitionTime: number
  /** Find which sector a project path belongs to, returns -1 if not found */
  findProjectSector: (projectPath: string) => number
}

export function useSectors(
  projects: ProjectInfo[],
  cardsPerSector: number,
  isFavorite: (path: string) => boolean,
): UseSectorsResult {
  const [currentSector, setCurrentSectorRaw] = useState(loadCurrentSector)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionDirection, setTransitionDirection] = useState(0)
  const [lastTransitionTime, setLastTransitionTime] = useState(0)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Assign projects into sectors
  const allSectors = useMemo(
    () => assignSectors(projects, cardsPerSector, isFavorite),
    [projects, cardsPerSector, isFavorite],
  )

  const totalSectors = allSectors.length

  // Clamp currentSector if it exceeds new sector count
  useEffect(() => {
    if (currentSector >= totalSectors && totalSectors > 0) {
      setCurrentSectorRaw(0)
      saveCurrentSector(0)
    }
  }, [totalSectors, currentSector])

  const safeSector = currentSector >= totalSectors ? 0 : currentSector
  const sectorProjects = allSectors[safeSector] || []
  const sectorHue = getSectorHue(safeSector)
  const hasSectors = totalSectors > 1

  // Transition animation helper
  const triggerTransition = useCallback((direction: number) => {
    setTransitioning(true)
    setTransitionDirection(direction)
    setLastTransitionTime(Date.now())
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    transitionTimerRef.current = setTimeout(() => {
      setTransitioning(false)
    }, 700) // ~600ms transition + 100ms buffer
  }, [])

  const switchSector = useCallback((n: number) => {
    const clamped = ((n % totalSectors) + totalSectors) % totalSectors
    if (clamped === safeSector) return
    const dir = clamped > safeSector ? 1 : -1
    triggerTransition(dir)
    setCurrentSectorRaw(clamped)
    saveCurrentSector(clamped)
  }, [totalSectors, safeSector, triggerTransition])

  const nextSector = useCallback(() => {
    if (totalSectors <= 1) return
    const next = (safeSector + 1) % totalSectors
    triggerTransition(1)
    setCurrentSectorRaw(next)
    saveCurrentSector(next)
  }, [totalSectors, safeSector, triggerTransition])

  const prevSector = useCallback(() => {
    if (totalSectors <= 1) return
    const prev = (safeSector - 1 + totalSectors) % totalSectors
    triggerTransition(-1)
    setCurrentSectorRaw(prev)
    saveCurrentSector(prev)
  }, [totalSectors, safeSector, triggerTransition])

  // Find which sector a project path belongs to
  const findProjectSector = useCallback((projectPath: string): number => {
    for (let s = 0; s < allSectors.length; s++) {
      if (allSectors[s].some(p => p.path === projectPath)) return s
    }
    return -1
  }, [allSectors])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    }
  }, [])

  return {
    currentSector: safeSector,
    totalSectors,
    sectorProjects,
    allSectors,
    switchSector,
    nextSector,
    prevSector,
    hasSectors,
    sectorHue,
    transitioning,
    transitionDirection,
    lastTransitionTime,
    findProjectSector,
  }
}
