import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { Task, TaskStatus, TaskPriority, TasksState } from '../hooks/useTasks'

interface Props {
  open: boolean
  onClose: () => void
  tasks: TasksState
  /** When set, board opens pre-filtered to this project */
  filterProject?: string | null
  /** All project paths+names for the filter dropdown */
  projects?: Array<{ path: string; name: string }>
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  'todo': 'TODO',
  'in-progress': 'IN PROGRESS',
  'done': 'DONE',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  'todo': '#64748b',
  'in-progress': '#22d3ee',
  'done': '#22c55e',
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#64748b',
  medium: '#eab308',
  high: '#ef4444',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  'todo': 'in-progress',
  'in-progress': 'done',
  'done': 'todo',
}

const PREV_STATUS: Record<TaskStatus, TaskStatus> = {
  'todo': 'done',
  'in-progress': 'todo',
  'done': 'in-progress',
}

export function TaskBoard({ open, onClose, tasks, filterProject, projects = [] }: Props) {
  const [selectedProject, setSelectedProject] = useState<string | null>(filterProject ?? null)
  const [addTitle, setAddTitle] = useState('')
  const [addPriority, setAddPriority] = useState<TaskPriority>('medium')
  const [addOpen, setAddOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync filter when filterProject changes (e.g., opened from ScreenPanel badge)
  useEffect(() => {
    if (filterProject !== undefined) {
      setSelectedProject(filterProject)
    }
  }, [filterProject])

  // Focus input when add form opens
  useEffect(() => {
    if (addOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [addOpen])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid the button click triggering immediate close
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handler)
    }, 50)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handler)
    }
  }, [open, onClose])

  // Filter tasks
  const filtered = useMemo(() => {
    if (!selectedProject) return tasks.tasks
    return tasks.tasks.filter(t => t.projectPath === selectedProject)
  }, [tasks.tasks, selectedProject])

  // Group by status
  const columns: Record<TaskStatus, Task[]> = useMemo(() => {
    const cols: Record<TaskStatus, Task[]> = { 'todo': [], 'in-progress': [], 'done': [] }
    for (const t of filtered) {
      cols[t.status].push(t)
    }
    // Sort by priority (high first) then by created (newest first)
    const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }
    for (const col of Object.values(cols)) {
      col.sort((a, b) => {
        const pd = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (pd !== 0) return pd
        return b.created - a.created
      })
    }
    return cols
  }, [filtered])

  const handleAdd = () => {
    if (!addTitle.trim()) return
    tasks.addTask(addTitle.trim(), addPriority, selectedProject || undefined)
    setAddTitle('')
    setAddOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  if (!open) return null

  const projectName = selectedProject
    ? (projects.find(p => p.path === selectedProject)?.name || selectedProject.split(/[/\\]/).pop() || 'Unknown')
    : null

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10001,
        width: 'min(900px, 90vw)',
        maxHeight: '80vh',
        background: 'rgba(8, 12, 18, 0.96)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(34, 211, 238, 0.2)',
        borderRadius: '6px',
        padding: '16px 20px',
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        color: '#c8dce8',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 0 40px rgba(0, 0, 0, 0.8), 0 0 2px rgba(34, 211, 238, 0.15)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', color: '#22d3ee', textTransform: 'uppercase' }}>
            MISSION CONTROL
          </span>
          {projectName && (
            <span style={{
              fontSize: '9px', letterSpacing: '1px', color: '#22d3ee',
              background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)',
              padding: '2px 8px', borderRadius: '2px',
            }}>
              {projectName}
            </span>
          )}
          <span style={{ fontSize: '9px', color: '#4a5568' }}>
            {filtered.length} TASK{filtered.length !== 1 ? 'S' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Filter dropdown */}
          <select
            value={selectedProject || '__all__'}
            onChange={e => setSelectedProject(e.target.value === '__all__' ? null : e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#8b9bb0',
              fontSize: '9px',
              fontFamily: 'inherit',
              padding: '3px 6px',
              borderRadius: '3px',
              cursor: 'pointer',
              letterSpacing: '0.5px',
            }}
          >
            <option value="__all__">ALL PROJECTS</option>
            {projects.map(p => (
              <option key={p.path} value={p.path}>{p.name.toUpperCase()}</option>
            ))}
          </select>
          {/* Add task button */}
          <button
            onClick={() => setAddOpen(!addOpen)}
            style={{
              background: addOpen ? 'rgba(34,211,238,0.15)' : 'transparent',
              border: '1px solid rgba(34,211,238,0.3)',
              color: '#22d3ee',
              fontSize: '9px',
              fontWeight: 700,
              fontFamily: 'inherit',
              letterSpacing: '1px',
              padding: '3px 10px',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            + ADD
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#64748b',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'inherit',
              padding: '2px 8px',
              borderRadius: '3px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
      </div>

      {/* Add task form */}
      {addOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '12px', flexShrink: 0,
          padding: '8px 10px',
          background: 'rgba(34,211,238,0.04)',
          border: '1px solid rgba(34,211,238,0.12)',
          borderRadius: '4px',
        }}>
          <input
            ref={inputRef}
            type="text"
            value={addTitle}
            onChange={e => setAddTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Task title..."
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#c8dce8',
              fontSize: '10px',
              fontFamily: 'inherit',
              padding: '5px 8px',
              borderRadius: '3px',
              outline: 'none',
            }}
          />
          {/* Priority selector */}
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['low', 'medium', 'high'] as TaskPriority[]).map(p => (
              <button
                key={p}
                onClick={() => setAddPriority(p)}
                style={{
                  background: addPriority === p ? `${PRIORITY_COLORS[p]}22` : 'transparent',
                  border: `1px solid ${addPriority === p ? PRIORITY_COLORS[p] : 'rgba(255,255,255,0.08)'}`,
                  color: addPriority === p ? PRIORITY_COLORS[p] : '#4a5568',
                  fontSize: '7px',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  letterSpacing: '1px',
                  padding: '3px 6px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={!addTitle.trim()}
            style={{
              background: addTitle.trim() ? '#22d3ee' : 'rgba(34,211,238,0.2)',
              border: 'none',
              color: addTitle.trim() ? '#000' : '#4a5568',
              fontSize: '9px',
              fontWeight: 700,
              fontFamily: 'inherit',
              letterSpacing: '1px',
              padding: '5px 12px',
              borderRadius: '3px',
              cursor: addTitle.trim() ? 'pointer' : 'default',
            }}
          >
            CREATE
          </button>
        </div>
      )}

      {/* Kanban columns */}
      <div style={{ display: 'flex', gap: '12px', flex: 1, overflow: 'hidden' }}>
        {(['todo', 'in-progress', 'done'] as TaskStatus[]).map(status => (
          <div key={status} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '4px',
            border: `1px solid ${STATUS_COLORS[status]}18`,
          }}>
            {/* Column header */}
            <div style={{
              padding: '8px 10px',
              borderBottom: `1px solid ${STATUS_COLORS[status]}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: STATUS_COLORS[status],
                  boxShadow: `0 0 6px ${STATUS_COLORS[status]}`,
                  display: 'inline-block',
                }} />
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px',
                  color: STATUS_COLORS[status],
                }}>
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <span style={{ fontSize: '9px', color: '#4a5568' }}>
                {columns[status].length}
              </span>
            </div>

            {/* Task cards */}
            <div style={{ flex: 1, overflow: 'auto', padding: '6px' }}>
              {columns[status].length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '20px 8px',
                  color: '#2a3040', fontSize: '8px', letterSpacing: '1px',
                }}>
                  NO TASKS
                </div>
              )}
              {columns[status].map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  projects={projects}
                  showProject={!selectedProject}
                  onMoveForward={() => tasks.moveStatus(task.id, NEXT_STATUS[task.status])}
                  onMoveBack={() => tasks.moveStatus(task.id, PREV_STATUS[task.status])}
                  onDelete={() => tasks.deleteTask(task.id)}
                  onCyclePriority={() => {
                    const cycle: TaskPriority[] = ['low', 'medium', 'high']
                    const next = cycle[(cycle.indexOf(task.priority) + 1) % cycle.length]
                    tasks.updateTask(task.id, { priority: next })
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CRT scanline overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 6px)',
        borderRadius: '6px',
      }} />
    </div>,
    document.body
  )
}

// ── Task Card ──

interface TaskCardProps {
  task: Task
  projects: Array<{ path: string; name: string }>
  showProject: boolean
  onMoveForward: () => void
  onMoveBack: () => void
  onDelete: () => void
  onCyclePriority: () => void
}

function TaskCard({ task, projects, showProject, onMoveForward, onMoveBack, onDelete, onCyclePriority }: TaskCardProps) {
  const [hovered, setHovered] = useState(false)
  const projectName = task.projectPath
    ? (projects.find(p => p.path === task.projectPath)?.name || task.projectPath.split(/[/\\]/).pop() || '')
    : null

  const age = useMemo(() => {
    const diff = Date.now() - task.created
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    return `${days}d`
  }, [task.created])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 8px 6px',
        marginBottom: '4px',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
        borderRadius: '3px',
        transition: 'all 0.15s ease',
        borderLeft: `2px solid ${PRIORITY_COLORS[task.priority]}`,
      }}
    >
      {/* Title */}
      <div style={{
        fontSize: '9px',
        lineHeight: '1.4',
        color: task.status === 'done' ? '#4a5568' : '#c8dce8',
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
        marginBottom: '6px',
        wordBreak: 'break-word',
      }}>
        {task.title}
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Priority badge (clickable to cycle) */}
          <button
            onClick={onCyclePriority}
            title="Cycle priority"
            style={{
              background: `${PRIORITY_COLORS[task.priority]}15`,
              border: `1px solid ${PRIORITY_COLORS[task.priority]}40`,
              color: PRIORITY_COLORS[task.priority],
              fontSize: '6px',
              fontWeight: 700,
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              letterSpacing: '0.5px',
              padding: '1px 4px',
              borderRadius: '2px',
              cursor: 'pointer',
              lineHeight: '1.2',
            }}
          >
            {PRIORITY_LABELS[task.priority]}
          </button>
          {/* Project label (when showing all) */}
          {showProject && projectName && (
            <span style={{
              fontSize: '6px', color: '#3a4a5a', letterSpacing: '0.5px',
              background: 'rgba(255,255,255,0.03)',
              padding: '1px 4px', borderRadius: '2px',
              border: '1px solid rgba(255,255,255,0.05)',
              maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {projectName}
            </span>
          )}
          {/* Age */}
          <span style={{ fontSize: '6px', color: '#2a3040' }}>{age}</span>
        </div>

        {/* Action buttons — visible on hover */}
        <div style={{
          display: 'flex', gap: '2px',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}>
          <button
            onClick={onMoveBack}
            title="Move back"
            style={actionBtnStyle}
          >
            {'<'}
          </button>
          <button
            onClick={onMoveForward}
            title="Move forward"
            style={actionBtnStyle}
          >
            {'>'}
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            style={{ ...actionBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
          >
            x
          </button>
        </div>
      </div>
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#64748b',
  fontSize: '8px',
  fontWeight: 700,
  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  padding: '1px 5px',
  borderRadius: '2px',
  cursor: 'pointer',
  lineHeight: '1.2',
}
