// ── Tree IPC Handlers ──
// Exposes HaloNode tree CRUD to the renderer process and HTTP API.

import { ipcMain } from 'electron'
import {
  loadTree, getNode, getRootNode, getChildren, getAllNodes,
  getNodesByType, findNodeByAlias, createNode, updateNode,
  deleteNode, moveNode, reorderChildren, syncAliasesFromTree,
  migrateFromAliases, type NodeType,
} from './halo-tree'

export function registerTreeHandlers(): void {
  // Migrate existing aliases on first run
  migrateFromAliases()

  // Get full tree
  ipcMain.handle('tree-get', async () => loadTree())

  // Get single node
  ipcMain.handle('tree-get-node', async (_e, id: string) => getNode(id))

  // Get root
  ipcMain.handle('tree-get-root', async () => getRootNode())

  // Get children
  ipcMain.handle('tree-get-children', async (_e, parentId: string) => getChildren(parentId))

  // Get all nodes
  ipcMain.handle('tree-get-all', async () => getAllNodes())

  // Get by type
  ipcMain.handle('tree-get-by-type', async (_e, type: NodeType) => getNodesByType(type))

  // Find by alias
  ipcMain.handle('tree-find-alias', async (_e, alias: string) => findNodeByAlias(alias))

  // Create node
  ipcMain.handle('tree-create', async (_e, type: NodeType, name: string, parentId: string, options?: any) => {
    const node = createNode(type, name, parentId, options)
    syncAliasesFromTree()
    return node
  })

  // Update node
  ipcMain.handle('tree-update', async (_e, id: string, updates: any) => {
    const node = updateNode(id, updates)
    syncAliasesFromTree()
    return node
  })

  // Delete node
  ipcMain.handle('tree-delete', async (_e, id: string) => {
    const result = deleteNode(id)
    syncAliasesFromTree()
    return result
  })

  // Move node
  ipcMain.handle('tree-move', async (_e, id: string, newParentId: string) => {
    const result = moveNode(id, newParentId)
    syncAliasesFromTree()
    return result
  })

  // Reorder children
  ipcMain.handle('tree-reorder', async (_e, parentId: string, orderedIds: string[]) => {
    return reorderChildren(parentId, orderedIds)
  })
}
