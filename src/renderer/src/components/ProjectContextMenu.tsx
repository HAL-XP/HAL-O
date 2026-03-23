import { useEffect, useRef } from 'react'
import type { ProjectGroup } from '../hooks/useProjectGroups'

interface Props {
  x: number
  y: number
  projectPath: string
  projectName: string
  onHide: (path: string) => void
  onConfigure: (path: string) => void
  // Group assignment (optional — only shown when groups exist)
  groups?: ProjectGroup[]
  currentGroupId?: string
  onAssignGroup?: (groupId: string | null) => void
  onClose: () => void
}

export function ProjectContextMenu({
  x, y, projectPath, projectName,
  onHide, onConfigure,
  groups = [], currentGroupId, onAssignGroup,
  onClose,
}: Props) {
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

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
    background: 'rgba(10, 15, 20, 0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(132, 204, 22, 0.2)',
    borderRadius: '4px',
    padding: '4px 0',
    minWidth: '160px',
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '5px 10px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '9px',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    textAlign: 'left' as const,
    transition: 'background 0.1s',
  }

  const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
  }
  const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
  }

  return (
    <div ref={ref} className="project-context-menu" style={menuStyle}>
      {/* Header */}
      <div style={{
        padding: '4px 10px 6px',
        fontSize: '8px',
        letterSpacing: '2px',
        color: 'var(--primary)',
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '200px',
      }}>
        {projectName.toUpperCase()}
      </div>

      {/* Hide from hub */}
      <button
        onClick={() => { onHide(projectPath); onClose() }}
        style={itemStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <span style={{ fontSize: '10px' }}>&#x2715;</span>
        HIDE FROM HUB
      </button>

      {/* Configure HAL-O features */}
      <button
        onClick={() => { onConfigure(projectPath); onClose() }}
        style={itemStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <span style={{ fontSize: '10px' }}>&#x2699;</span>
        CONFIGURE HAL-O FEATURES...
      </button>

      {/* Group assignment submenu */}
      {groups.length > 0 && onAssignGroup && (
        <>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
          <div style={{
            padding: '4px 10px 4px',
            fontSize: '8px',
            letterSpacing: '2px',
            color: 'var(--text-dim)',
            fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          }}>
            ASSIGN TO GROUP
          </div>

          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => { onAssignGroup(g.id); onClose() }}
              style={{
                ...itemStyle,
                background: currentGroupId === g.id ? 'rgba(132,204,22,0.08)' : 'transparent',
                color: currentGroupId === g.id ? 'var(--text)' : 'var(--text-secondary)',
              }}
              onMouseEnter={hoverIn}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = currentGroupId === g.id ? 'rgba(132,204,22,0.08)' : 'transparent'
              }}
            >
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: g.color, flexShrink: 0,
                boxShadow: `0 0 4px ${g.color}`,
              }} />
              {g.name}
              {currentGroupId === g.id && (
                <span style={{ marginLeft: 'auto', fontSize: '8px', color: 'var(--primary)' }}>&#x2713;</span>
              )}
            </button>
          ))}

          {currentGroupId && (
            <button
              onClick={() => { onAssignGroup(null); onClose() }}
              style={{ ...itemStyle, color: 'var(--text-dim)' }}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              UNASSIGN
            </button>
          )}
        </>
      )}
    </div>
  )
}
