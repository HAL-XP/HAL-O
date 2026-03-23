import { useState, useCallback } from 'react'

export interface ProjectGroup {
  id: string
  name: string
  color: string
}

export interface GroupPreset {
  id: string
  label: string
  groups: Omit<ProjectGroup, 'id'>[]
}

export const GROUP_COLORS = [
  '#84cc16', // green
  '#f87171', // red
  '#60a5fa', // blue
  '#fbbf24', // amber
  '#c084fc', // purple
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#fb923c', // orange
] as const

export const GROUP_PRESETS: GroupPreset[] = [
  {
    id: 'personal-org',
    label: 'PERSONAL / ORGANIZATION',
    groups: [
      { name: 'Personal', color: '#60a5fa' },
      { name: 'Organization', color: '#c084fc' },
    ],
  },
  {
    id: 'frontend-backend-infra',
    label: 'FRONTEND / BACKEND / INFRA',
    groups: [
      { name: 'Frontend', color: '#22d3ee' },
      { name: 'Backend', color: '#fb923c' },
      { name: 'Infrastructure', color: '#c084fc' },
    ],
  },
  {
    id: 'active-maint-archive',
    label: 'ACTIVE / MAINTENANCE / ARCHIVE',
    groups: [
      { name: 'Active', color: '#84cc16' },
      { name: 'Maintenance', color: '#fbbf24' },
      { name: 'Archive', color: '#f87171' },
    ],
  },
  {
    id: 'custom',
    label: 'CUSTOM (EMPTY)',
    groups: [],
  },
]

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadGroups(): ProjectGroup[] {
  try {
    const raw = localStorage.getItem('hal-o-groups')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadAssignments(): Record<string, string> {
  try {
    const raw = localStorage.getItem('hal-o-project-groups')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveGroups(groups: ProjectGroup[]) {
  localStorage.setItem('hal-o-groups', JSON.stringify(groups))
}

function saveAssignments(assignments: Record<string, string>) {
  localStorage.setItem('hal-o-project-groups', JSON.stringify(assignments))
}

export interface ProjectGroupsState {
  groups: ProjectGroup[]
  assignments: Record<string, string>
  getProjectGroup: (path: string) => ProjectGroup | undefined
  assignProject: (path: string, groupId: string | null) => void
  createGroup: (name: string, color: string) => ProjectGroup
  deleteGroup: (id: string) => void
  renameGroup: (id: string, name: string) => void
  reorderGroups: (ids: string[]) => void
  applyPreset: (preset: GroupPreset) => void
}

export function useProjectGroups(): ProjectGroupsState {
  const [groups, setGroups] = useState<ProjectGroup[]>(loadGroups)
  const [assignments, setAssignments] = useState<Record<string, string>>(loadAssignments)

  const getProjectGroup = useCallback((path: string): ProjectGroup | undefined => {
    const gId = assignments[path]
    if (!gId) return undefined
    return groups.find((g) => g.id === gId)
  }, [groups, assignments])

  const assignProject = useCallback((path: string, groupId: string | null) => {
    setAssignments((prev) => {
      const next = { ...prev }
      if (groupId) {
        next[path] = groupId
      } else {
        delete next[path]
      }
      saveAssignments(next)
      return next
    })
  }, [])

  const createGroup = useCallback((name: string, color: string): ProjectGroup => {
    const group: ProjectGroup = { id: generateId(), name, color }
    setGroups((prev) => {
      const next = [...prev, group]
      saveGroups(next)
      return next
    })
    return group
  }, [])

  const deleteGroup = useCallback((id: string) => {
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id)
      saveGroups(next)
      return next
    })
    // Unassign all projects from the deleted group
    setAssignments((prev) => {
      const next: Record<string, string> = {}
      for (const [path, gId] of Object.entries(prev)) {
        if (gId !== id) next[path] = gId
      }
      saveAssignments(next)
      return next
    })
  }, [])

  const renameGroup = useCallback((id: string, name: string) => {
    setGroups((prev) => {
      const next = prev.map((g) => g.id === id ? { ...g, name } : g)
      saveGroups(next)
      return next
    })
  }, [])

  const reorderGroups = useCallback((ids: string[]) => {
    setGroups((prev) => {
      const map = new Map(prev.map((g) => [g.id, g]))
      const next = ids.map((id) => map.get(id)).filter(Boolean) as ProjectGroup[]
      // Append any groups not in the provided ids (safety)
      for (const g of prev) {
        if (!ids.includes(g.id)) next.push(g)
      }
      saveGroups(next)
      return next
    })
  }, [])

  const applyPreset = useCallback((preset: GroupPreset) => {
    const newGroups = preset.groups.map((g) => ({
      id: generateId(),
      name: g.name,
      color: g.color,
    }))
    setGroups(newGroups)
    saveGroups(newGroups)
  }, [])

  return {
    groups,
    assignments,
    getProjectGroup,
    assignProject,
    createGroup,
    deleteGroup,
    renameGroup,
    reorderGroups,
    applyPreset,
  }
}
