import { useEffect, useRef } from 'react'
import type { ProjectGroup } from '../hooks/useProjectGroups'

interface Props {
  x: number
  y: number
  groups: ProjectGroup[]
  currentGroupId?: string
  onAssign: (groupId: string | null) => void
  onClose: () => void
}

export function GroupContextMenu({ x, y, groups, currentGroupId, onAssign, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const closeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeKey)
    }
  }, [onClose])

  if (groups.length === 0) return null

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000,
        background: 'rgba(10, 15, 20, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(132, 204, 22, 0.2)',
        borderRadius: '4px',
        padding: '4px 0',
        minWidth: '140px',
      }}
    >
      <div style={{
        padding: '4px 10px 6px',
        fontSize: '8px',
        letterSpacing: '2px',
        color: 'var(--primary)',
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      }}>
        ASSIGN TO GROUP
      </div>

      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => { onAssign(g.id); onClose() }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '5px 10px',
            background: currentGroupId === g.id ? 'rgba(132,204,22,0.08)' : 'transparent',
            border: 'none',
            color: currentGroupId === g.id ? 'var(--text)' : 'var(--text-secondary)',
            fontSize: '9px',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            textAlign: 'left',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = currentGroupId === g.id ? 'rgba(132,204,22,0.08)' : 'transparent' }}
        >
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: g.color, flexShrink: 0,
            boxShadow: `0 0 4px ${g.color}`,
          }} />
          {g.name}
          {currentGroupId === g.id && (
            <span style={{ marginLeft: 'auto', fontSize: '8px', color: 'var(--primary)' }}>*</span>
          )}
        </button>
      ))}

      {currentGroupId && (
        <>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
          <button
            onClick={() => { onAssign(null); onClose() }}
            style={{
              display: 'block',
              width: '100%',
              padding: '5px 10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '9px',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            UNASSIGN
          </button>
        </>
      )}
    </div>
  )
}
