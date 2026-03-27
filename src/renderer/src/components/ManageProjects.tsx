// ── Manage Projects Page ──
// Tree-based node/card layout for managing dispatchers, projects, agents, and groups.
// Uses the HaloNode tree from the main process via IPC.

import { useState, useEffect, useCallback, useRef } from 'react'

interface HaloNodeConfig {
  model?: string
  voice?: string
  lang?: string
  botToken?: string
  color?: string
  icon?: string
  systemPrompt?: string
  autoStart?: boolean
}

interface HaloNode {
  id: string
  type: 'dispatcher' | 'project' | 'agent' | 'group'
  name: string
  alias?: string
  path?: string
  parentId: string | null
  children: string[]
  config: HaloNodeConfig
  status: 'online' | 'offline' | 'loading' | 'error'
  createdAt: number
  updatedAt: number
}

interface HaloTree {
  version: number
  rootId: string
  nodes: Record<string, HaloNode>
}

// ── Type icons and colors ──
const TYPE_DEFAULTS: Record<string, { icon: string; color: string }> = {
  dispatcher: { icon: '🏢', color: '#00e5ff' },
  project: { icon: '📦', color: '#22c55e' },
  agent: { icon: '🤖', color: '#a78bfa' },
  group: { icon: '📁', color: '#6b7a8d' },
}

interface Props {
  onBack?: () => void
}

export function ManageProjects({ onBack }: Props) {
  const [tree, setTree] = useState<HaloTree | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Load tree ──
  const loadTree = useCallback(async () => {
    try {
      const t = await window.api.treeGet()
      setTree(t)
    } catch (err) {
      console.error('Failed to load tree:', err)
    }
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  // ── CRUD handlers ──
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
    if (selectedId === id) setSelectedId(null)
    await loadTree()
  }

  const handleMove = async (id: string, newParentId: string) => {
    await window.api.treeMove(id, newParentId)
    await loadTree()
  }

  if (!tree) return <div className="manage-projects-loading">Loading tree...</div>

  const nodes = tree.nodes
  const root = nodes[tree.rootId]
  const selected = selectedId ? nodes[selectedId] : null

  // ── Filter nodes by search ──
  const matchesSearch = (node: HaloNode): boolean => {
    if (!search) return true
    const q = search.toLowerCase()
    return node.name.toLowerCase().includes(q) ||
      (node.alias?.toLowerCase().includes(q) || false) ||
      (node.path?.toLowerCase().includes(q) || false)
  }

  // ── Layout: compute positions for top-down tree ──
  const NODE_WIDTH = 180
  const NODE_HEIGHT = 90
  const H_GAP = 24
  const V_GAP = 120

  interface LayoutNode {
    id: string
    x: number
    y: number
    width: number
    level: number
  }

  function computeLayout(): { layouts: LayoutNode[]; connections: Array<{ from: string; to: string }> } {
    const layouts: LayoutNode[] = []
    const connections: Array<{ from: string; to: string }> = []

    function getSubtreeWidth(nodeId: string): number {
      const node = nodes[nodeId]
      if (!node || !matchesSearch(node)) return 0
      const visibleChildren = node.children.filter(cid => nodes[cid] && matchesSearch(nodes[cid]))
      if (visibleChildren.length === 0) return NODE_WIDTH
      const childrenWidth = visibleChildren.reduce((sum, cid) => sum + getSubtreeWidth(cid) + H_GAP, -H_GAP)
      return Math.max(NODE_WIDTH, childrenWidth)
    }

    function layoutNode(nodeId: string, x: number, y: number, level: number) {
      const node = nodes[nodeId]
      if (!node || !matchesSearch(node)) return

      layouts.push({ id: nodeId, x, y, width: NODE_WIDTH, level })

      const visibleChildren = node.children.filter(cid => nodes[cid] && matchesSearch(nodes[cid]))
      if (visibleChildren.length === 0) return

      const childWidths = visibleChildren.map(cid => getSubtreeWidth(cid))
      const totalWidth = childWidths.reduce((s, w) => s + w + H_GAP, -H_GAP)
      let cx = x + NODE_WIDTH / 2 - totalWidth / 2

      for (let i = 0; i < visibleChildren.length; i++) {
        const childX = cx + childWidths[i] / 2 - NODE_WIDTH / 2
        connections.push({ from: nodeId, to: visibleChildren[i] })
        layoutNode(visibleChildren[i], childX, y + NODE_HEIGHT + V_GAP, level + 1)
        cx += childWidths[i] + H_GAP
      }
    }

    const rootWidth = getSubtreeWidth(tree.rootId)
    layoutNode(tree.rootId, Math.max(0, 400 - rootWidth / 2), 40, 0)
    return { layouts, connections }
  }

  const { layouts, connections } = computeLayout()

  // ── Render ──
  return (
    <div className="manage-projects" ref={containerRef}>
      {/* Top bar */}
      <div className="mp-topbar">
        {onBack && <button className="mp-back" onClick={onBack}>← Back</button>}
        <span className="mp-title">Manage Projects</span>
        <input
          className="mp-search"
          type="text"
          placeholder="Filter by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="mp-btn" onClick={() => setShowImport(true)}>+ Import Project</button>
        <button className="mp-btn" onClick={() => handleCreate('dispatcher', 'New Dispatcher', tree.rootId)}>+ Dispatcher</button>
        <button className="mp-btn" onClick={() => handleCreate('group', 'New Group', tree.rootId)}>+ Group</button>
      </div>

      {/* Canvas area with cards */}
      <div className="mp-canvas">
        {/* SVG connections */}
        <svg className="mp-connections" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {connections.map(({ from, to }) => {
            const fromLayout = layouts.find(l => l.id === from)
            const toLayout = layouts.find(l => l.id === to)
            if (!fromLayout || !toLayout) return null
            const x1 = fromLayout.x + NODE_WIDTH / 2
            const y1 = fromLayout.y + NODE_HEIGHT
            const x2 = toLayout.x + NODE_WIDTH / 2
            const y2 = toLayout.y
            const midY = (y1 + y2) / 2
            const parentColor = nodes[from]?.config.color || '#00e5ff'
            return (
              <g key={`${from}-${to}`}>
                <path
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke={parentColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.3}
                  strokeDasharray="4 4"
                />
              </g>
            )
          })}
        </svg>

        {/* Node cards */}
        {layouts.map(layout => {
          const node = nodes[layout.id]
          if (!node) return null
          const defaults = TYPE_DEFAULTS[node.type] || TYPE_DEFAULTS.project
          const color = node.config.color || defaults.color
          const icon = node.config.icon || defaults.icon
          const isSelected = selectedId === node.id

          return (
            <div
              key={node.id}
              className={`mp-card ${isSelected ? 'selected' : ''}`}
              style={{
                left: layout.x,
                top: layout.y,
                width: NODE_WIDTH,
                borderColor: isSelected ? color : 'rgba(255,255,255,0.06)',
                boxShadow: isSelected ? `0 0 20px ${color}33` : undefined,
              }}
              onClick={() => setSelectedId(node.id)}
            >
              <div className="mp-card-icon" style={{ color }}>{icon}</div>
              <div className="mp-card-name">{node.name}</div>
              <div className="mp-card-meta">
                <span className="mp-card-type" style={{ background: color + '22', color }}>{node.type}</span>
                {node.alias && <span className="mp-card-alias">@{node.alias}</span>}
              </div>
              <div className={`mp-card-status ${node.status}`} />
            </div>
          )
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mp-panel">
          <button className="mp-panel-close" onClick={() => setSelectedId(null)}>×</button>
          <div className="mp-panel-header">
            <span className="mp-panel-icon" style={{ color: selected.config.color || '#00e5ff' }}>
              {selected.config.icon || TYPE_DEFAULTS[selected.type]?.icon || '📦'}
            </span>
            <div>
              <div className="mp-panel-name">{selected.name}</div>
              <div className="mp-panel-type">{selected.type} {selected.alias ? `(@${selected.alias})` : ''}</div>
            </div>
          </div>

          <div className="mp-panel-fields">
            <label>Name</label>
            <input
              value={selected.name}
              onChange={e => handleUpdate(selected.id, { name: e.target.value })}
            />

            <label>Alias (for voice)</label>
            <input
              value={selected.alias || ''}
              onChange={e => handleUpdate(selected.id, { alias: e.target.value || undefined })}
              placeholder="e.g. bob, karen"
            />

            {selected.type === 'project' && (
              <>
                <label>Path</label>
                <input
                  value={selected.path || ''}
                  onChange={e => handleUpdate(selected.id, { path: e.target.value })}
                  placeholder="/path/to/project"
                />
              </>
            )}

            <label>Model</label>
            <select
              value={selected.config.model || 'claude-sonnet-4-6'}
              onChange={e => handleUpdate(selected.id, { config: { ...selected.config, model: e.target.value } })}
            >
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            </select>

            <label>Voice</label>
            <select
              value={selected.config.voice || 'auto'}
              onChange={e => handleUpdate(selected.id, { config: { ...selected.config, voice: e.target.value } })}
            >
              <option value="butler">HAL (Male)</option>
              <option value="soft">Hallie (Female)</option>
              <option value="auto">Auto</option>
            </select>

            <label>Color</label>
            <input
              type="color"
              value={selected.config.color || '#00e5ff'}
              onChange={e => handleUpdate(selected.id, { config: { ...selected.config, color: e.target.value } })}
            />
          </div>

          <div className="mp-panel-children">
            <label>Children ({selected.children.length})</label>
            {selected.children.map(cid => {
              const child = nodes[cid]
              if (!child) return null
              return (
                <div key={cid} className="mp-panel-child" onClick={() => setSelectedId(cid)}>
                  {child.config.icon || TYPE_DEFAULTS[child.type]?.icon} {child.name}
                </div>
              )
            })}
            <button
              className="mp-btn-small"
              onClick={() => handleCreate('project', 'New Project', selected.id)}
            >+ Add Project</button>
          </div>

          <div className="mp-panel-actions">
            {selected.id !== tree.rootId && (
              <button className="mp-btn-danger" onClick={() => handleDelete(selected.id)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportModal
          tree={tree}
          nodes={nodes}
          onImport={async (path, name, parentId) => {
            await handleCreate('project', name, parentId, { path })
            setShowImport(false)
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

// ── Import Modal ──
function ImportModal({ tree, nodes, onImport, onClose }: {
  tree: HaloTree
  nodes: Record<string, HaloNode>
  onImport: (path: string, name: string, parentId: string) => void
  onClose: () => void
}) {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(tree.rootId)

  const handleBrowse = async () => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setPath(folder)
      setName(folder.split(/[/\\]/).filter(Boolean).pop() || '')
    }
  }

  return (
    <div className="mp-modal-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={e => e.stopPropagation()}>
        <h3>Import Project</h3>
        <label>Folder Path</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={path} onChange={e => setPath(e.target.value)} placeholder="/path/to/project" style={{ flex: 1 }} />
          <button className="mp-btn" onClick={handleBrowse}>Browse</button>
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
          <button className="mp-btn" onClick={() => { if (path && name) onImport(path, name, parentId) }}>Import</button>
          <button className="mp-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
