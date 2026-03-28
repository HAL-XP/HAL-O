// ── HAL-O Tree Data Model ──
// Recursive tree of dispatchers, projects, agents, and groups.
// Persisted to ~/.hal-o/tree.json. Hot-reloadable.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDataDir, dataPath } from './instance'

// ── Types ──

export type NodeType = 'dispatcher' | 'project' | 'agent' | 'group'

export interface HaloNodeConfig {
  model?: string           // AI model override (claude-sonnet-4-6, etc.)
  voice?: string           // TTS voice profile (butler, soft, auto)
  lang?: string            // language (en, fr, etc.)
  botToken?: string        // Telegram bot token (for dispatchers)
  color?: string           // theme color (#00e5ff, #22c55e, etc.)
  icon?: string            // avatar icon/emoji
  systemPrompt?: string    // custom system prompt (overrides CLAUDE.md)
  autoStart?: boolean      // auto-start terminal on app launch
}

export interface HaloNode {
  id: string
  type: NodeType
  name: string
  alias?: string           // short name for voice dispatch ("bob", "karen")
  path?: string            // filesystem path (for projects)
  parentId: string | null  // null = root level
  children: string[]       // child node IDs (recursive!)
  config: HaloNodeConfig
  status: 'online' | 'offline' | 'loading' | 'error'
  createdAt: number
  updatedAt: number
}

export interface HaloTree {
  version: number
  rootId: string           // the root dispatcher node ID (HAL)
  nodes: Record<string, HaloNode>
}

// ── Storage ──

// Data dir resolved via instance config (supports clones)
const getTreePath = () => dataPath('tree.json')

function ensureDir() {
  getDataDir() // auto-creates if missing
}

// ── Default tree (created on first run) ──

function createDefaultTree(): HaloTree {
  const rootId = 'hal-root'
  return {
    version: 1,
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        type: 'dispatcher',
        name: 'HAL',
        alias: 'hal',
        path: undefined,
        parentId: null,
        children: [],
        config: {
          voice: 'butler',
          lang: 'en',
          color: '#00e5ff',
          icon: '👁',
          model: 'claude-sonnet-4-6',
        },
        status: 'offline',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  }
}

// ── Load / Save ──

let _tree: HaloTree | null = null
let _lastLoad = 0
const RELOAD_INTERVAL = 5000 // reload from disk every 5s (hot-editable)

export function loadTree(): HaloTree {
  if (_tree && Date.now() - _lastLoad < RELOAD_INTERVAL) return _tree

  try {
    if (existsSync(getTreePath())) {
      _tree = JSON.parse(readFileSync(getTreePath(), 'utf-8'))
      _lastLoad = Date.now()
      return _tree!
    }
  } catch { /* corrupted file — recreate */ }

  // First run — create default tree
  _tree = createDefaultTree()
  saveTree(_tree)
  _lastLoad = Date.now()
  return _tree
}

export function saveTree(tree: HaloTree): void {
  ensureDir()
  _tree = tree
  _lastLoad = Date.now()
  writeFileSync(getTreePath(), JSON.stringify(tree, null, 2), 'utf-8')
}

// ── CRUD Operations ──

export function getNode(id: string): HaloNode | null {
  const tree = loadTree()
  return tree.nodes[id] || null
}

export function getRootNode(): HaloNode {
  const tree = loadTree()
  return tree.nodes[tree.rootId]
}

export function getChildren(parentId: string): HaloNode[] {
  const tree = loadTree()
  const parent = tree.nodes[parentId]
  if (!parent) return []
  return parent.children.map(cid => tree.nodes[cid]).filter(Boolean)
}

export function getAllNodes(): HaloNode[] {
  const tree = loadTree()
  return Object.values(tree.nodes)
}

export function getNodesByType(type: NodeType): HaloNode[] {
  return getAllNodes().filter(n => n.type === type)
}

export function findNodeByAlias(alias: string): HaloNode | null {
  return getAllNodes().find(n => n.alias?.toLowerCase() === alias.toLowerCase()) || null
}

export function findNodeByPath(path: string): HaloNode | null {
  const normalized = path.toLowerCase().replace(/\\/g, '/')
  return getAllNodes().find(n => n.path?.toLowerCase().replace(/\\/g, '/') === normalized) || null
}

/** Create a new node under a parent. Returns the created node. */
export function createNode(
  type: NodeType,
  name: string,
  parentId: string,
  options?: Partial<Pick<HaloNode, 'alias' | 'path' | 'config'>>
): HaloNode {
  const tree = loadTree()
  const parent = tree.nodes[parentId]
  if (!parent) throw new Error(`Parent node ${parentId} not found`)

  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const node: HaloNode = {
    id,
    type,
    name,
    alias: options?.alias,
    path: options?.path,
    parentId,
    children: [],
    config: {
      color: type === 'dispatcher' ? '#00e5ff' : type === 'project' ? '#22c55e' : '#6b7a8d',
      ...options?.config,
    },
    status: 'offline',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  tree.nodes[id] = node
  parent.children.push(id)
  parent.updatedAt = Date.now()
  saveTree(tree)
  return node
}

/** Update a node's properties. Merges with existing. */
export function updateNode(id: string, updates: Partial<Pick<HaloNode, 'name' | 'alias' | 'path' | 'config' | 'status'>>): HaloNode | null {
  const tree = loadTree()
  const node = tree.nodes[id]
  if (!node) return null

  if (updates.name !== undefined) node.name = updates.name
  if (updates.alias !== undefined) node.alias = updates.alias
  if (updates.path !== undefined) node.path = updates.path
  if (updates.status !== undefined) node.status = updates.status
  if (updates.config) node.config = { ...node.config, ...updates.config }
  node.updatedAt = Date.now()

  saveTree(tree)
  return node
}

/** Delete a node and all its descendants. */
export function deleteNode(id: string): boolean {
  const tree = loadTree()
  const node = tree.nodes[id]
  if (!node) return false
  if (id === tree.rootId) return false // can't delete root

  // Recursively delete children
  const deleteRecursive = (nodeId: string) => {
    const n = tree.nodes[nodeId]
    if (!n) return
    for (const childId of n.children) {
      deleteRecursive(childId)
    }
    delete tree.nodes[nodeId]
  }
  deleteRecursive(id)

  // Remove from parent's children
  if (node.parentId) {
    const parent = tree.nodes[node.parentId]
    if (parent) {
      parent.children = parent.children.filter(cid => cid !== id)
      parent.updatedAt = Date.now()
    }
  }

  saveTree(tree)
  return true
}

/** Move a node to a new parent. */
export function moveNode(id: string, newParentId: string): boolean {
  const tree = loadTree()
  const node = tree.nodes[id]
  const newParent = tree.nodes[newParentId]
  if (!node || !newParent) return false
  if (id === tree.rootId) return false

  // Prevent circular: can't move into own descendant
  let check: string | null = newParentId
  while (check) {
    if (check === id) return false // circular!
    check = tree.nodes[check]?.parentId || null
  }

  // Remove from old parent
  if (node.parentId) {
    const oldParent = tree.nodes[node.parentId]
    if (oldParent) {
      oldParent.children = oldParent.children.filter(cid => cid !== id)
      oldParent.updatedAt = Date.now()
    }
  }

  // Add to new parent
  node.parentId = newParentId
  newParent.children.push(id)
  newParent.updatedAt = Date.now()
  node.updatedAt = Date.now()

  saveTree(tree)
  return true
}

/** Reorder children of a parent. */
export function reorderChildren(parentId: string, orderedChildIds: string[]): boolean {
  const tree = loadTree()
  const parent = tree.nodes[parentId]
  if (!parent) return false

  // Validate all IDs belong to this parent
  const currentSet = new Set(parent.children)
  if (orderedChildIds.length !== currentSet.size) return false
  if (!orderedChildIds.every(id => currentSet.has(id))) return false

  parent.children = orderedChildIds
  parent.updatedAt = Date.now()
  saveTree(tree)
  return true
}

// ── Tree → Aliases bridge ──
// Generates ~/.hal-o/aliases.json from the tree (backward compat with dispatcher)

export function syncAliasesFromTree(): void {
  const tree = loadTree()
  const aliases: Record<string, { project: string; voice?: string }> = {}

  for (const node of Object.values(tree.nodes)) {
    if (node.alias && (node.type === 'dispatcher' || node.type === 'agent')) {
      aliases[node.alias] = {
        project: node.path ? node.path.split(/[/\\]/).pop() || node.name : node.name,
        ...(node.config.voice ? { voice: node.config.voice } : {}),
      }
    }
  }

  const aliasPath = dataPath('aliases.json')
  writeFileSync(aliasPath, JSON.stringify(aliases, null, 2), 'utf-8')
}

// ── Import: migrate existing aliases.json → tree ──

export function migrateFromAliases(): void {
  const tree = loadTree()
  const aliasPath = dataPath('aliases.json')

  if (!existsSync(aliasPath)) return
  if (Object.keys(tree.nodes).length > 1) return // already has nodes beyond root

  try {
    const raw = JSON.parse(readFileSync(aliasPath, 'utf-8'))
    for (const [alias, entry] of Object.entries(raw)) {
      const e = typeof entry === 'string' ? { project: entry } : entry as any
      if (alias === 'hal') continue // skip root

      createNode('dispatcher', alias.charAt(0).toUpperCase() + alias.slice(1), tree.rootId, {
        alias,
        path: join('D:/GitHub', e.project),
        config: {
          voice: e.voice,
          color: alias === 'bob' ? '#22c55e' : alias === 'karen' ? '#f472b6' : '#00e5ff',
        },
      })
    }
  } catch { /* migration failed, no big deal */ }
}
