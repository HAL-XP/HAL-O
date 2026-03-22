import { useState, useCallback, useRef, useEffect } from 'react'
import { TerminalPanel } from './TerminalPanel'

export interface TerminalSession {
  id: string
  projectName: string
  projectPath: string
}

interface Pane {
  id: string
  tabs: string[] // session IDs
  activeTab: string
}

interface Props {
  sessions: TerminalSession[]
  onClose: (id: string) => void
  voiceFocus?: 'hub' | string
  onVoiceFocus?: (sessionId: string) => void
  fontSize?: number
  voiceOut?: boolean
}

type DropZone = 'left' | 'right' | 'full' | null

export function TerminalView({ sessions, onClose, voiceFocus, onVoiceFocus, fontSize = 13, voiceOut = false }: Props) {
  const [panes, setPanes] = useState<Pane[]>([])
  const [draggedTab, setDraggedTab] = useState<string | null>(null)
  const [dropPreview, setDropPreview] = useState<{ paneId: string; zone: DropZone } | null>(null)
  const [dragOverNewZone, setDragOverNewZone] = useState<'left' | 'right' | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync sessions into panes — add new sessions to the last pane, remove closed ones
  useEffect(() => {
    setPanes((prev) => {
      const allTabIds = prev.flatMap((p) => p.tabs)
      const sessionIds = sessions.map((s) => s.id)

      // Add new sessions
      const newIds = sessionIds.filter((id) => !allTabIds.includes(id))
      let updated = [...prev]

      if (newIds.length > 0) {
        if (updated.length === 0) {
          updated = [{ id: 'pane-0', tabs: newIds, activeTab: newIds[0] }]
        } else {
          const lastIdx = updated.length - 1
          updated[lastIdx] = {
            ...updated[lastIdx],
            tabs: [...updated[lastIdx].tabs, ...newIds],
            activeTab: newIds[newIds.length - 1],
          }
        }
      }

      // Remove closed sessions
      updated = updated
        .map((p) => {
          const remaining = p.tabs.filter((t) => sessionIds.includes(t))
          if (remaining.length === p.tabs.length) return p
          return {
            ...p,
            tabs: remaining,
            activeTab: remaining.includes(p.activeTab) ? p.activeTab : remaining[0] || '',
          }
        })
        .filter((p) => p.tabs.length > 0)

      return updated
    })
  }, [sessions])

  const getSession = (id: string) => sessions.find((s) => s.id === id)

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, sessionId: string) => {
    setDraggedTab(sessionId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', sessionId)
    // Make drag image semi-transparent
    const el = e.currentTarget as HTMLElement
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedTab(null)
    setDropPreview(null)
    setDragOverNewZone(null)
  }, [])

  const getDropZone = (e: React.DragEvent, paneElement: HTMLElement): DropZone => {
    const rect = paneElement.getBoundingClientRect()
    const x = e.clientX - rect.left
    const relX = x / rect.width
    if (relX < 0.3) return 'left'
    if (relX > 0.7) return 'right'
    return 'full'
  }

  const handleDragOverPane = useCallback((e: React.DragEvent, paneId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const zone = getDropZone(e, e.currentTarget as HTMLElement)
    setDropPreview({ paneId, zone })
    setDragOverNewZone(null)
  }, [])

  const handleDragOverNewSplit = useCallback((e: React.DragEvent, side: 'left' | 'right') => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverNewZone(side)
    setDropPreview(null)
  }, [])

  const handleDropOnPane = useCallback((e: React.DragEvent, targetPaneId: string) => {
    e.preventDefault()
    const sessionId = e.dataTransfer.getData('text/plain')
    if (!sessionId) return

    const zone = getDropZone(e, e.currentTarget as HTMLElement)

    setPanes((prev) => {
      // Remove tab from its current pane
      let updated = prev.map((p) => ({
        ...p,
        tabs: p.tabs.filter((t) => t !== sessionId),
        activeTab: p.activeTab === sessionId
          ? (p.tabs.filter((t) => t !== sessionId)[0] || '')
          : p.activeTab,
      }))

      if (zone === 'full') {
        // Drop onto existing pane
        updated = updated.map((p) =>
          p.id === targetPaneId
            ? { ...p, tabs: [...p.tabs, sessionId], activeTab: sessionId }
            : p
        )
      } else {
        // Split the target pane
        const targetIdx = updated.findIndex((p) => p.id === targetPaneId)
        if (targetIdx >= 0) {
          const newPane: Pane = {
            id: `pane-${Date.now()}`,
            tabs: [sessionId],
            activeTab: sessionId,
          }
          if (zone === 'left') {
            updated.splice(targetIdx, 0, newPane)
          } else {
            updated.splice(targetIdx + 1, 0, newPane)
          }
        }
      }

      // Remove empty panes
      return updated.filter((p) => p.tabs.length > 0)
    })

    setDraggedTab(null)
    setDropPreview(null)
    setDragOverNewZone(null)
  }, [])

  const handleDropOnNewSplit = useCallback((e: React.DragEvent, side: 'left' | 'right') => {
    e.preventDefault()
    const sessionId = e.dataTransfer.getData('text/plain')
    if (!sessionId) return

    setPanes((prev) => {
      const updated = prev.map((p) => ({
        ...p,
        tabs: p.tabs.filter((t) => t !== sessionId),
        activeTab: p.activeTab === sessionId
          ? (p.tabs.filter((t) => t !== sessionId)[0] || '')
          : p.activeTab,
      })).filter((p) => p.tabs.length > 0)

      const newPane: Pane = { id: `pane-${Date.now()}`, tabs: [sessionId], activeTab: sessionId }
      if (side === 'left') {
        updated.unshift(newPane)
      } else {
        updated.push(newPane)
      }
      return updated
    })

    setDraggedTab(null)
    setDropPreview(null)
    setDragOverNewZone(null)
  }, [])

  const setActiveTab = useCallback((paneId: string, tabId: string) => {
    setPanes((prev) => prev.map((p) => p.id === paneId ? { ...p, activeTab: tabId } : p))
  }, [])

  const closeTab = useCallback((sessionId: string) => {
    onClose(sessionId)
  }, [onClose])

  const popOutToExternal = useCallback((sessionId: string) => {
    const session = getSession(sessionId)
    if (!session) return
    // Launch external terminal with claude --continue, then close internal
    window.api.launchProject(session.projectPath, true)
    onClose(sessionId)
    setContextMenu(null)
  }, [sessions, onClose])

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId })
  }, [])

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  if (sessions.length === 0) return null

  return (
    <div className="hal-split-container" ref={containerRef}>
      {/* Left edge drop zone (only visible when dragging) */}
      {draggedTab && panes.length > 0 && (
        <div
          className={`hal-split-edge-zone left ${dragOverNewZone === 'left' ? 'active' : ''}`}
          onDragOver={(e) => handleDragOverNewSplit(e, 'left')}
          onDrop={(e) => handleDropOnNewSplit(e, 'left')}
          onDragLeave={() => setDragOverNewZone(null)}
        />
      )}

      {panes.map((pane) => (
        <div
          key={pane.id}
          className={`hal-split-pane ${voiceFocus === pane.activeTab ? 'voice-focused' : ''}`}
          style={{ flex: 1 }}
          onClick={() => onVoiceFocus?.(pane.activeTab)}
          onDragOver={(e) => handleDragOverPane(e, pane.id)}
          onDrop={(e) => handleDropOnPane(e, pane.id)}
          onDragLeave={() => setDropPreview(null)}
        >
          {/* Drop preview overlay */}
          {dropPreview?.paneId === pane.id && draggedTab && (
            <div className={`hal-drop-preview ${dropPreview.zone}`}>
              <div className="hal-drop-preview-highlight" />
            </div>
          )}

          {/* Tab bar */}
          <div className="hal-terminal-tabs">
            {pane.tabs.map((tabId) => {
              const session = getSession(tabId)
              if (!session) return null
              return (
                <div
                  key={tabId}
                  className={`hal-terminal-tab ${tabId === pane.activeTab ? 'active' : ''} ${tabId === draggedTab ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, tabId)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setActiveTab(pane.id, tabId)}
                  onContextMenu={(e) => handleContextMenu(e, tabId)}
                >
                  <span className="hal-terminal-tab-dot" />
                  <span className="hal-terminal-tab-name">{session.projectName}</span>
                  <button
                    className="hal-terminal-tab-close"
                    onClick={(e) => { e.stopPropagation(); closeTab(tabId) }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>

          {/* Terminal content */}
          <div className="hal-terminal-content">
            {pane.tabs.map((tabId) => (
              <TerminalPanel key={tabId} sessionId={tabId} active={tabId === pane.activeTab} fontSize={fontSize} voiceOut={voiceOut} />
            ))}
          </div>
        </div>
      ))}

      {/* Right edge drop zone */}
      {draggedTab && panes.length > 0 && (
        <div
          className={`hal-split-edge-zone right ${dragOverNewZone === 'right' ? 'active' : ''}`}
          onDragOver={(e) => handleDragOverNewSplit(e, 'right')}
          onDrop={(e) => handleDropOnNewSplit(e, 'right')}
          onDragLeave={() => setDragOverNewZone(null)}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="hal-tab-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => popOutToExternal(contextMenu.sessionId)}>
            Open in External Terminal
          </button>
          <button onClick={() => { closeTab(contextMenu.sessionId); setContextMenu(null) }}>
            Close Tab
          </button>
        </div>
      )}
    </div>
  )
}
