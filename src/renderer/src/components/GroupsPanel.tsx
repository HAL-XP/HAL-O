import { useState, useRef, useEffect } from 'react'
import type { ProjectGroup, GroupPreset } from '../hooks/useProjectGroups'
import { GROUP_COLORS, GROUP_PRESETS } from '../hooks/useProjectGroups'

interface Props {
  groups: ProjectGroup[]
  onCreateGroup: (name: string, color: string) => void
  onDeleteGroup: (id: string) => void
  onRenameGroup: (id: string, name: string) => void
  onReorderGroups: (ids: string[]) => void
  onApplyPreset: (preset: GroupPreset) => void
}

export function GroupsPanel({ groups, onCreateGroup, onDeleteGroup, onRenameGroup, onReorderGroups, onApplyPreset }: Props) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [addMode, setAddMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(GROUP_COLORS[0])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const startEdit = (g: ProjectGroup) => {
    setEditingId(g.id)
    setEditName(g.name)
  }

  const confirmEdit = () => {
    if (editingId && editName.trim()) {
      onRenameGroup(editingId, editName.trim())
    }
    setEditingId(null)
    setEditName('')
  }

  const handleAdd = () => {
    if (newName.trim()) {
      onCreateGroup(newName.trim(), newColor)
      setNewName('')
      setNewColor(GROUP_COLORS[(groups.length + 1) % GROUP_COLORS.length])
      setAddMode(false)
    }
  }

  const handleDragStart = (idx: number) => {
    setDragIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) return
    const reordered = [...groups]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    onReorderGroups(reordered.map((g) => g.id))
    setDragIdx(targetIdx)
  }

  const handleDragEnd = () => {
    setDragIdx(null)
  }

  const showPresets = groups.length === 0 && !addMode

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="hal-settings-btn"
        onClick={() => setOpen(!open)}
        title="Project Groups"
        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>

      {open && (
        <div className="hal-settings-panel" style={{ width: '240px' }}>
          <div className="hal-settings-title">GROUPS</div>

          {showPresets && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '6px', fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>
                CHOOSE A PRESET
              </div>
              {GROUP_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    if (preset.id === 'custom') {
                      setAddMode(true)
                    } else {
                      onApplyPreset(preset)
                    }
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 8px',
                    marginBottom: '3px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '3px',
                    color: 'var(--text-secondary)',
                    fontSize: '8px',
                    letterSpacing: '0.8px',
                    cursor: 'pointer',
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(132,204,22,0.3)'
                    e.currentTarget.style.color = 'var(--text)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                >
                  {preset.label}
                  {preset.groups.length > 0 && (
                    <span style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                      {preset.groups.map((g, i) => (
                        <span key={i} style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: g.color, display: 'inline-block',
                          boxShadow: `0 0 4px ${g.color}`,
                        }} />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Group list */}
          {groups.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              {groups.map((g, idx) => (
                <div
                  key={g.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 6px',
                    marginBottom: '2px',
                    background: dragIdx === idx ? 'rgba(132,204,22,0.08)' : 'rgba(255,255,255,0.02)',
                    borderRadius: '3px',
                    cursor: 'grab',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Drag handle */}
                  <span style={{ color: 'var(--text-dim)', fontSize: '8px', cursor: 'grab', flexShrink: 0 }}>
                    :::
                  </span>

                  {/* Color dot */}
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: g.color, flexShrink: 0,
                    boxShadow: `0 0 4px ${g.color}`,
                  }} />

                  {/* Name or edit field */}
                  {editingId === g.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      onBlur={confirmEdit}
                      autoFocus
                      style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(132,204,22,0.3)',
                        borderRadius: '2px',
                        color: 'var(--text)',
                        fontSize: '9px',
                        padding: '2px 4px',
                        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => startEdit(g)}
                      style={{
                        flex: 1,
                        fontSize: '9px',
                        color: 'var(--text)',
                        letterSpacing: '0.5px',
                        cursor: 'text',
                        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                      }}
                    >
                      {g.name}
                    </span>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={() => onDeleteGroup(g.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      padding: '0 2px',
                      lineHeight: 1,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                    title="Delete group"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add group form */}
          {addMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAddMode(false) }}
                autoFocus
                placeholder="GROUP NAME"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '3px',
                  color: 'var(--text)',
                  fontSize: '9px',
                  padding: '4px 6px',
                  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  letterSpacing: '1px',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    style={{
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: c, border: newColor === c ? '2px solid #fff' : '2px solid transparent',
                      cursor: 'pointer', transition: 'border-color 0.15s',
                      boxShadow: newColor === c ? `0 0 6px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={handleAdd}
                  style={{
                    flex: 1,
                    padding: '3px 8px',
                    background: 'var(--primary)',
                    border: 'none',
                    borderRadius: '3px',
                    color: '#000',
                    fontSize: '8px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    cursor: 'pointer',
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  }}
                >
                  ADD
                </button>
                <button
                  onClick={() => setAddMode(false)}
                  style={{
                    padding: '3px 8px',
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '3px',
                    color: 'var(--text-dim)',
                    fontSize: '8px',
                    cursor: 'pointer',
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setAddMode(true)
                setNewColor(GROUP_COLORS[groups.length % GROUP_COLORS.length])
              }}
              style={{
                width: '100%',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '3px',
                color: 'var(--text-dim)',
                fontSize: '8px',
                letterSpacing: '1px',
                cursor: 'pointer',
                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(132,204,22,0.3)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = 'var(--text-dim)'
              }}
            >
              + ADD GROUP
            </button>
          )}
        </div>
      )}
    </div>
  )
}
