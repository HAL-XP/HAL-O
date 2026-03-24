/**
 * FilterBar — Preset project filter buttons for the HUD topbar.
 * Pure client-side filtering, no IPC. Counts computed from project array.
 */
import type { ProjectInfo } from '../types'

export type FilterId = 'all' | 'active' | 'hal' | 'git' | 'untracked' | 'favorites'

interface FilterDef {
  id: FilterId
  label: string
  icon: string
  test: (p: ProjectInfo, isFav: (path: string) => boolean) => boolean
}

const FILTERS: FilterDef[] = [
  { id: 'all', label: 'All', icon: '\u25CF', test: () => true },
  { id: 'active', label: 'Active', icon: '\u26A1', test: (p) => {
    // Active = modified in the last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return (p.lastModified || 0) > weekAgo
  }},
  { id: 'hal', label: 'HAL', icon: '\u2B50', test: (p) => p.configLevel !== 'bare' },
  { id: 'git', label: 'Git', icon: '\uD83D\uDD00', test: (p) => !!p.gitOwner },
  { id: 'untracked', label: 'New', icon: '\u2795', test: (p) => p.configLevel === 'bare' },
  { id: 'favorites', label: 'Fav', icon: '\u2665', test: (_p, isFav) => isFav(_p.path) },
]

interface Props {
  projects: ProjectInfo[]
  activeFilter: FilterId
  onFilterChange: (id: FilterId) => void
  isFavorite: (path: string) => boolean
}

export function FilterBar({ projects, activeFilter, onFilterChange, isFavorite }: Props) {
  return (
    <div className="hal-filter-bar">
      {FILTERS.map(f => {
        const count = f.id === 'all' ? projects.length : projects.filter(p => f.test(p, isFavorite)).length
        const isActive = activeFilter === f.id
        return (
          <button
            key={f.id}
            className={`hal-filter-btn ${isActive ? 'active' : ''}`}
            onClick={() => onFilterChange(isActive ? 'all' : f.id)}
            title={`${f.label} (${count})`}
          >
            <span className="hal-filter-icon">{f.icon}</span>
            <span className="hal-filter-count">{count}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Apply a filter to a project array */
export function applyFilter(projects: ProjectInfo[], filterId: FilterId, isFavorite: (path: string) => boolean): ProjectInfo[] {
  if (filterId === 'all') return projects
  const def = FILTERS.find(f => f.id === filterId)
  if (!def) return projects
  return projects.filter(p => def.test(p, isFavorite))
}
