import { useState, useCallback, useMemo } from 'react'

// ── Task Model ──

export type TaskStatus = 'todo' | 'in-progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  projectPath?: string  // optional — null = global task
  created: number       // epoch ms
}

const STORAGE_KEY = 'hal-o-tasks'

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveTasks(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

function makeId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export interface TasksState {
  tasks: Task[]
  addTask: (title: string, priority: TaskPriority, projectPath?: string) => void
  updateTask: (id: string, updates: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'projectPath'>>) => void
  deleteTask: (id: string) => void
  moveStatus: (id: string, status: TaskStatus) => void
  getTasksForProject: (projectPath: string) => Task[]
  getTaskCountForProject: (projectPath: string) => { todo: number; inProgress: number; done: number; total: number }
}

export function useTasks(): TasksState {
  const [tasks, setTasks] = useState<Task[]>(loadTasks)

  const persist = useCallback((next: Task[]) => {
    setTasks(next)
    saveTasks(next)
  }, [])

  const addTask = useCallback((title: string, priority: TaskPriority, projectPath?: string) => {
    const task: Task = {
      id: makeId(),
      title: title.trim(),
      status: 'todo',
      priority,
      projectPath: projectPath || undefined,
      created: Date.now(),
    }
    persist([...loadTasks(), task])
  }, [persist])

  const updateTask = useCallback((id: string, updates: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'projectPath'>>) => {
    const current = loadTasks()
    const idx = current.findIndex(t => t.id === id)
    if (idx === -1) return
    current[idx] = { ...current[idx], ...updates }
    persist(current)
  }, [persist])

  const deleteTask = useCallback((id: string) => {
    persist(loadTasks().filter(t => t.id !== id))
  }, [persist])

  const moveStatus = useCallback((id: string, status: TaskStatus) => {
    const current = loadTasks()
    const idx = current.findIndex(t => t.id === id)
    if (idx === -1) return
    current[idx] = { ...current[idx], status }
    persist(current)
  }, [persist])

  const getTasksForProject = useCallback((projectPath: string): Task[] => {
    return tasks.filter(t => t.projectPath === projectPath)
  }, [tasks])

  const getTaskCountForProject = useCallback((projectPath: string) => {
    const proj = tasks.filter(t => t.projectPath === projectPath)
    return {
      todo: proj.filter(t => t.status === 'todo').length,
      inProgress: proj.filter(t => t.status === 'in-progress').length,
      done: proj.filter(t => t.status === 'done').length,
      total: proj.length,
    }
  }, [tasks])

  return useMemo(() => ({
    tasks,
    addTask,
    updateTask,
    deleteTask,
    moveStatus,
    getTasksForProject,
    getTaskCountForProject,
  }), [tasks, addTask, updateTask, deleteTask, moveStatus, getTasksForProject, getTaskCountForProject])
}
