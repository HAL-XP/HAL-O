// ── Manage Projects — Mission Control Node Graph ──
// Infinite canvas with self-contained node cards, pan/zoom, inline editing.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

interface HaloNodeConfig {
  model?: string; voice?: string; lang?: string; botToken?: string
  color?: string; icon?: string; systemPrompt?: string; autoStart?: boolean
}

interface HaloNode {
  id: string; type: 'dispatcher' | 'project' | 'agent' | 'group'
  name: string; alias?: string; path?: string; parentId: string | null
  children: string[]; config: HaloNodeConfig
  status: 'online' | 'offline' | 'loading' | 'error'
  createdAt: number; updatedAt: number
}

interface HaloTree { version: number; rootId: string; nodes: Record<string, HaloNode> }

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  dispatcher: { icon: '◆', color: '#00e5ff', label: 'DISPATCHER' },
  project: { icon: '■', color: '#22c55e', label: 'PROJECT' },
  agent: { icon: '●', color: '#a78bfa', label: 'AGENT' },
  group: { icon: '▣', color: '#6b7a8d', label: 'GROUP' },
}

const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

const VOICES = [
  { value: 'butler', label: 'HAL' },
  { value: 'soft', label: 'Hallie' },
  { value: 'auto', label: 'Auto' },
]

interface Props { onBack?: () => void }

export function ManageProjects({ onBack }: Props) {
  const [tree, setTree] = useState<HaloTree | null>(null)
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null)

  // Pan & zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  const loadTree = useCallback(async () => {
    try { setTree(await window.api.treeGet()) } catch {}
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  const handleCreate = async (type: string, name: string, parentId: string, options?: any) => {
    await window.api.treeCreate(type, name, parentId, options)
    await loadTree()
  }

  const handleUpdate = async (id: string, updates: any) => {
    await window.api.treeUpdate(id, updates)
    await loadTree()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this node and all its children?')) return
    await window.api.treeDelete(id)
    await loadTree()
  }

  // ── Pan handlers ──
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.mp-node')) return
    setIsPanning(true)
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])

  const onCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y })
  }, [isPanning])

  const onCanvasMouseUp = useCallback(() => setIsPanning(false), [])

  // ── Zoom handlers ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001)))
  }, [])

  const zoomIn = () => setZoom(z => Math.min(2.5, z + 0.15))
  const zoomOut = () => setZoom(z => Math.max(0.3, z - 0.15))
  const zoomFit = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // ── Layout computation ──
  const NODE_W = 260
  const NODE_H = 180
  const H_GAP = 40
  const V_GAP = 80

  const { layouts, connections } = useMemo(() => {
    if (!tree) return { layouts: [] as any[], connections: [] as any[] }
    const nodes = tree.nodes
    const layouts: Array<{ id: string; x: number; y: number }> = []
    const connections: Array<{ from: string; to: string }> = []

    const matchesSearch = (n: HaloNode) => {
      if (!search) return true
      const q = search.toLowerCase()
      return n.name.toLowerCase().includes(q) || (n.alias || '').toLowerCase().includes(q)
    }

    function subtreeW(id: string): number {
      const n = nodes[id]
      if (!n || !matchesSearch(n)) return 0
      const kids = n.children.filter(c => nodes[c] && matchesSearch(nodes[c]))
      if (!kids.length) return NODE_W
      return Math.max(NODE_W, kids.reduce((s, c) => s + subtreeW(c) + H_GAP, -H_GAP))
    }

    function place(id: string, x: number, y: number) {
      const n = nodes[id]
      if (!n || !matchesSearch(n)) return
      layouts.push({ id, x, y })
      const kids = n.children.filter(c => nodes[c] && matchesSearch(nodes[c]))
      if (!kids.length) return
      const widths = kids.map(c => subtreeW(c))
      const total = widths.reduce((s, w) => s + w + H_GAP, -H_GAP)
      let cx = x + NODE_W / 2 - total / 2
      kids.forEach((c, i) => {
        const childX = cx + widths[i] / 2 - NODE_W / 2
        connections.push({ from: id, to: c })
        place(c, childX, y + NODE_H + V_GAP)
        cx += widths[i] + H_GAP
      })
    }

    // Center tree in canvas
    const rootW = subtreeW(tree.rootId)
    const startX = Math.max(60, (typeof window !== 'undefined' ? window.innerWidth / 2 : 600) - rootW / 2)
    place(tree.rootId, startX, 40)
    return { layouts, connections }
  }, [tree, search])

  if (!tree) return <div className="mp-loading">Loading tree...</div>
  const nodes = tree.nodes

  return (
    <div className="mp-root">
      {/* ── Topbar ── */}
      <div className="mp-topbar">
        <div className="mp-topbar-left">
          {onBack && <button className="mp-back" onClick={onBack}>&#8592;</button>}
          <span className="mp-title">MANAGE PROJECTS</span>
          <input className="mp-search" placeholder="Filter..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="mp-topbar-right">
          <button className="mp-action-btn" onClick={() => setShowImport(true)}>+ Import</button>
          <button className="mp-action-btn" onClick={() => handleCreate('dispatcher', 'New Dispatcher', tree.rootId)}>+ Dispatcher</button>
          <button className="mp-action-btn" onClick={() => handleCreate('group', 'New Group', tree.rootId)}>+ Group</button>
        </div>
      </div>

      {/* ── Infinite canvas ── */}
      <div
        ref={canvasRef}
        className={`mp-canvas ${isPanning ? 'panning' : ''}`}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
        onWheel={onWheel}
      >
        <div className="mp-transform" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* SVG connections */}
          <svg className="mp-svg" style={{ position: 'absolute', top: 0, left: 0, width: 4000, height: 4000, pointerEvents: 'none' }}>
            {connections.map(({ from, to }) => {
              const fl = layouts.find(l => l.id === from)
              const tl = layouts.find(l => l.id === to)
              if (!fl || !tl) return null
              const x1 = fl.x + NODE_W / 2, y1 = fl.y + NODE_H
              const x2 = tl.x + NODE_W / 2, y2 = tl.y
              const my = y1 + V_GAP / 2
              const color = nodes[from]?.config.color || '#00e5ff'
              return (
                <path key={`${from}-${to}`}
                  d={`M${x1} ${y1} L${x1} ${my} L${x2} ${my} L${x2} ${y2}`}
                  fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.6}
                  strokeDasharray="6 4" />
              )
            })}
          </svg>

          {/* ── Node cards ── */}
          {layouts.map(({ id, x, y }) => {
            const node = nodes[id]
            if (!node) return null
            const meta = TYPE_META[node.type] || TYPE_META.project
            const color = node.config.color || meta.color
            const isRoot = id === tree.rootId

            return (
              <div key={id} className="mp-node" style={{ left: x, top: y, width: NODE_W, borderColor: color + '44' }}>
                {/* Header */}
                <div className="mp-node-header" style={{ borderBottomColor: color + '33' }}>
                  <span className="mp-node-icon" style={{ color }}>{meta.icon}</span>
                  <input className="mp-node-name" value={node.name}
                    onChange={e => handleUpdate(id, { name: e.target.value })}
                    style={{ color }} />
                  <span className="mp-node-type" style={{ background: color + '18', color }}>{meta.label}</span>
                  <div className={`mp-node-status ${node.status}`} />
                  {!isRoot && (
                    <button className="mp-node-menu" onClick={() => setMenuNodeId(menuNodeId === id ? null : id)}>⋯</button>
                  )}
                </div>

                {/* Fields grid */}
                <div className="mp-node-fields">
                  <div className="mp-field">
                    <span className="mp-field-label">ALIAS</span>
                    <input className="mp-field-input" value={node.alias || ''} placeholder="—"
                      onChange={e => handleUpdate(id, { alias: e.target.value || undefined })} />
                  </div>
                  <div className="mp-field">
                    <span className="mp-field-label">MODEL</span>
                    <select className="mp-field-select" value={node.config.model || 'claude-sonnet-4-6'}
                      onChange={e => handleUpdate(id, { config: { ...node.config, model: e.target.value } })}>
                      {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="mp-field">
                    <span className="mp-field-label">VOICE</span>
                    <select className="mp-field-select" value={node.config.voice || 'auto'}
                      onChange={e => handleUpdate(id, { config: { ...node.config, voice: e.target.value } })}>
                      {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="mp-field">
                    <span className="mp-field-label">COLOR</span>
                    <input type="color" className="mp-field-color" value={node.config.color || meta.color}
                      onChange={e => handleUpdate(id, { config: { ...node.config, color: e.target.value } })} />
                  </div>
                </div>

                {/* Footer: children count + add button */}
                <div className="mp-node-footer">
                  <span className="mp-node-children">{node.children.length} children</span>
                  <button className="mp-node-add" onClick={() => handleCreate('project', 'New Project', id)}>+ Add</button>
                </div>

                {/* Context menu */}
                {menuNodeId === id && (
                  <div className="mp-node-dropdown">
                    <button onClick={() => { handleCreate('project', 'New Project', id); setMenuNodeId(null) }}>+ Project</button>
                    <button onClick={() => { handleCreate('dispatcher', 'Sub-Dispatcher', id); setMenuNodeId(null) }}>+ Dispatcher</button>
                    <button onClick={() => { handleCreate('agent', 'New Agent', id); setMenuNodeId(null) }}>+ Agent</button>
                    <button className="mp-danger" onClick={() => { handleDelete(id); setMenuNodeId(null) }}>Delete</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Zoom controls ── */}
      <div className="mp-zoom-controls">
        <button onClick={zoomIn}>+</button>
        <span className="mp-zoom-level">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomOut}>−</button>
        <button onClick={zoomFit} className="mp-zoom-fit">Fit</button>
      </div>

      {/* ── Import modal ── */}
      {showImport && <ImportModal tree={tree} nodes={nodes} onImport={async (path, name, pid) => {
        await handleCreate('project', name, pid, { path })
        setShowImport(false)
      }} onClose={() => setShowImport(false)} />}
    </div>
  )
}

function ImportModal({ tree, nodes, onImport, onClose }: {
  tree: HaloTree; nodes: Record<string, HaloNode>
  onImport: (p: string, n: string, pid: string) => void; onClose: () => void
}) {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(tree.rootId)
  const browse = async () => { const f = await window.api.selectFolder(); if (f) { setPath(f); setName(f.split(/[/\\]/).filter(Boolean).pop() || '') } }

  return (
    <div className="mp-modal-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={e => e.stopPropagation()}>
        <h3>Import Project</h3>
        <label>Folder</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={path} onChange={e => setPath(e.target.value)} placeholder="/path/to/project" style={{ flex: 1 }} />
          <button className="mp-action-btn" onClick={browse}>Browse</button>
        </div>
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="project-name" />
        <label>Parent</label>
        <select value={parentId} onChange={e => setParentId(e.target.value)}>
          {Object.values(nodes).filter(n => n.type === 'dispatcher' || n.type === 'group').map(n => (
            <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="mp-action-btn" onClick={() => { if (path && name) onImport(path, name, parentId) }}>Import</button>
          <button className="mp-action-btn" onClick={onClose} style={{ opacity: 0.5 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
