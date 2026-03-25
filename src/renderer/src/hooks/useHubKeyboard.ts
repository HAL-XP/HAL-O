/**
 * UX16 Phase 2: Hub keyboard navigation hook.
 *
 * When focusZone='hub', arrow keys cycle through project cards by orbital angle,
 * Enter launches the selected card, Escape deselects, and `/` focuses search.
 *
 * Cards are sorted by their angular position around the Y axis (atan2(x, z)).
 * Left/Right cycle counter-clockwise/clockwise within a ring.
 * Up/Down jump between rings (by Y position grouping).
 */
import { useEffect, useCallback, useRef } from 'react'
import type { FocusZone } from './useFocusZone'
import { setSelectedPath, getSelectedPath } from '../components/three/ScreenPanel'
import type { Screen3DPosition } from '../layouts3d'

// ── Module-level store: the 3D position of the currently selected card ──
// Read by CameraEaser inside the R3F Canvas to smoothly orbit the camera.
let _selectedCardPosition: [number, number, number] | null = null
export function getSelectedCardPosition(): [number, number, number] | null {
  return _selectedCardPosition
}
export function setSelectedCardPosition(pos: [number, number, number] | null): void {
  _selectedCardPosition = pos
}

const STORAGE_KEY = 'hal-o-selected-card'

function loadSelectedCard(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

function saveSelectedCard(path: string | null): void {
  try {
    if (path) {
      localStorage.setItem(STORAGE_KEY, path)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch { /* */ }
}

/** Orbital entry: project path + angle + ring index (Y-based grouping) */
interface OrbitalEntry {
  path: string
  angle: number
  ring: number
  index: number // index into the positions array (same as project index)
}

/**
 * Sort project cards into orbital order.
 * Groups cards into rings by Y position (within 2.0 units = same ring),
 * then sorts within each ring by angular position (atan2(x, z)).
 */
function computeOrbitalOrder(
  projectPaths: string[],
  positions: Screen3DPosition[],
): OrbitalEntry[] {
  if (projectPaths.length === 0 || positions.length === 0) return []

  // Compute angles
  const entries: OrbitalEntry[] = projectPaths.map((path, i) => {
    const pos = positions[i]
    if (!pos) return { path, angle: 0, ring: 0, index: i }
    const [x, y, z] = pos.position
    // atan2(x, z) gives angle from +Z axis, clockwise when viewed from above
    const angle = Math.atan2(x, z)
    return { path, angle, y: y, ring: 0, index: i }
  }) as (OrbitalEntry & { y?: number })[]

  // Group into rings by Y position
  // Sort by Y first to identify ring boundaries
  const sortedByY = [...entries].sort((a, b) => (a as any).y - (b as any).y)
  let currentRing = 0
  let ringY = (sortedByY[0] as any)?.y ?? 0

  for (const entry of sortedByY) {
    const y = (entry as any).y ?? 0
    if (Math.abs(y - ringY) > 2.0) {
      currentRing++
      ringY = y
    }
    entry.ring = currentRing
  }

  // Sort: primary by ring (ascending), secondary by angle (ascending = counter-clockwise)
  entries.sort((a, b) => {
    if (a.ring !== b.ring) return a.ring - b.ring
    return a.angle - b.angle
  })

  return entries
}

export interface UseHubKeyboardOptions {
  focusZone: FocusZone | undefined
  projectPaths: string[]
  positions: Screen3DPosition[]
  onResume: (projectPath: string) => void
}

export function useHubKeyboard({
  focusZone,
  projectPaths,
  positions,
  onResume,
}: UseHubKeyboardOptions): void {
  const orbitalRef = useRef<OrbitalEntry[]>([])
  const pathSetRef = useRef<Set<string>>(new Set())

  // Recompute orbital order when positions/paths change
  useEffect(() => {
    orbitalRef.current = computeOrbitalOrder(projectPaths, positions)
    pathSetRef.current = new Set(projectPaths)
  }, [projectPaths, positions])

  // On mount, restore selection from localStorage (handle deleted projects)
  useEffect(() => {
    const saved = loadSelectedCard()
    if (saved && pathSetRef.current.has(saved)) {
      setSelectedPath(saved)
      // Set the 3D position for camera easing
      const idx = projectPaths.indexOf(saved)
      if (idx >= 0 && positions[idx]) {
        setSelectedCardPosition(positions[idx].position)
      }
    } else if (saved) {
      // Project was deleted — clear stale selection
      saveSelectedCard(null)
      setSelectedPath(null)
      setSelectedCardPosition(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When projectPaths change and current selection is no longer valid, clear it
  useEffect(() => {
    const current = getSelectedPath()
    if (current && !pathSetRef.current.has(current)) {
      setSelectedPath(null)
      setSelectedCardPosition(null)
      saveSelectedCard(null)
    }
  }, [projectPaths])

  const selectByOrbitalIndex = useCallback((orbIdx: number) => {
    const orbital = orbitalRef.current
    if (orbital.length === 0) return
    const clamped = ((orbIdx % orbital.length) + orbital.length) % orbital.length
    const entry = orbital[clamped]
    setSelectedPath(entry.path)
    saveSelectedCard(entry.path)
    // Update 3D position for camera easing
    const pos = positions[entry.index]
    if (pos) {
      setSelectedCardPosition(pos.position)
    }
  }, [positions])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle keys when hub zone is active
    if (focusZone !== 'hub') return

    // Don't capture when an input/textarea has focus (e.g. search bar, settings)
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const orbital = orbitalRef.current
    if (orbital.length === 0 && e.key !== '/' && e.key !== 'Escape') return

    const currentPath = getSelectedPath()
    const currentIdx = currentPath
      ? orbital.findIndex((o) => o.path === currentPath)
      : -1

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault()
        if (orbital.length === 0) return
        if (currentIdx < 0) {
          // Nothing selected — select first card
          selectByOrbitalIndex(0)
        } else {
          // Next card clockwise (higher angle)
          selectByOrbitalIndex(currentIdx + 1)
        }
        break
      }

      case 'ArrowLeft': {
        e.preventDefault()
        if (orbital.length === 0) return
        if (currentIdx < 0) {
          selectByOrbitalIndex(orbital.length - 1)
        } else {
          selectByOrbitalIndex(currentIdx - 1)
        }
        break
      }

      case 'ArrowUp': {
        e.preventDefault()
        if (orbital.length === 0 || currentIdx < 0) return
        const currentRing = orbital[currentIdx].ring
        // Find the previous ring (lower ring index)
        const prevRingEntries = orbital.filter((o) => o.ring < currentRing)
        if (prevRingEntries.length === 0) {
          // Wrap to highest ring
          const maxRing = Math.max(...orbital.map((o) => o.ring))
          if (maxRing === currentRing) return // only one ring
          const highRingEntries = orbital.filter((o) => o.ring === maxRing)
          // Find closest angle match in that ring
          const closest = findClosestAngle(highRingEntries, orbital[currentIdx].angle)
          const idx = orbital.indexOf(closest)
          selectByOrbitalIndex(idx)
        } else {
          // Jump to highest ring below current
          const targetRing = Math.max(...prevRingEntries.map((o) => o.ring))
          const ringEntries = orbital.filter((o) => o.ring === targetRing)
          const closest = findClosestAngle(ringEntries, orbital[currentIdx].angle)
          const idx = orbital.indexOf(closest)
          selectByOrbitalIndex(idx)
        }
        break
      }

      case 'ArrowDown': {
        e.preventDefault()
        if (orbital.length === 0 || currentIdx < 0) return
        const currentRing2 = orbital[currentIdx].ring
        // Find the next ring (higher ring index)
        const nextRingEntries = orbital.filter((o) => o.ring > currentRing2)
        if (nextRingEntries.length === 0) {
          // Wrap to lowest ring
          const minRing = Math.min(...orbital.map((o) => o.ring))
          if (minRing === currentRing2) return // only one ring
          const lowRingEntries = orbital.filter((o) => o.ring === minRing)
          const closest = findClosestAngle(lowRingEntries, orbital[currentIdx].angle)
          const idx = orbital.indexOf(closest)
          selectByOrbitalIndex(idx)
        } else {
          const targetRing = Math.min(...nextRingEntries.map((o) => o.ring))
          const ringEntries = orbital.filter((o) => o.ring === targetRing)
          const closest = findClosestAngle(ringEntries, orbital[currentIdx].angle)
          const idx = orbital.indexOf(closest)
          selectByOrbitalIndex(idx)
        }
        break
      }

      case 'Enter': {
        if (!currentPath) return
        e.preventDefault()
        onResume(currentPath)
        break
      }

      case 'Escape': {
        e.preventDefault()
        setSelectedPath(null)
        setSelectedCardPosition(null)
        saveSelectedCard(null)
        break
      }

      case '/': {
        e.preventDefault()
        // Focus the search input in the topbar
        const searchInput = document.querySelector('.hal-search') as HTMLInputElement | null
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
        break
      }

      default:
        break
    }
  }, [focusZone, selectByOrbitalIndex, onResume])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/** Find the entry with the closest angular position to the target angle */
function findClosestAngle(entries: OrbitalEntry[], targetAngle: number): OrbitalEntry {
  let best = entries[0]
  let bestDist = Infinity
  for (const entry of entries) {
    // Angular distance with wrapping
    let dist = Math.abs(entry.angle - targetAngle)
    if (dist > Math.PI) dist = 2 * Math.PI - dist
    if (dist < bestDist) {
      bestDist = dist
      best = entry
    }
  }
  return best
}
