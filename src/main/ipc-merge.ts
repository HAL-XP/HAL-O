// ── U18: Merge Conflict IPC Handlers ──
// Exposes merge detection and resolution functionality to the renderer via IPC.

import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { exec } from 'child_process'
import { join } from 'path'
import {
  detectMergeConflicts,
  parseConflictFile,
  getCommitGraph,
  buildResolvedContent,
  isInMergeState,
} from './merge-detector'

/** Run a git command asynchronously. */
function runGitAsync(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: 15_000,
      shell: true,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve((stdout || '').trim())
    })
  })
}

export function registerMergeHandlers(): void {

  // ── Detect merge conflicts for a project ──
  ipcMain.handle('detect-merge-conflicts', async (
    _event,
    projectPath: string,
  ): Promise<{
    inMerge: boolean
    mergeType: string
    conflictFiles: Array<{ path: string; status: string; chunks: never[] }>
    ourBranch: string
    theirBranch: string
  }> => {
    if (!projectPath || !existsSync(projectPath)) {
      return { inMerge: false, mergeType: 'none', conflictFiles: [], ourBranch: '', theirBranch: '' }
    }
    return await detectMergeConflicts(projectPath)
  })

  // ── Quick merge state check (lightweight — no git commands, just file existence) ──
  ipcMain.handle('check-merge-state', async (
    _event,
    projectPath: string,
  ): Promise<boolean> => {
    if (!projectPath || !existsSync(projectPath)) return false
    return isInMergeState(projectPath)
  })

  // ── Parse conflict chunks for a specific file ──
  ipcMain.handle('parse-conflict-file', async (
    _event,
    projectPath: string,
    filePath: string,
  ): Promise<Array<{
    id: number; oursContent: string; theirsContent: string; baseContent?: string
    startLine: number; endLine: number
  }>> => {
    if (!projectPath || !filePath || !existsSync(projectPath)) return []
    return await parseConflictFile(projectPath, filePath)
  })

  // ── Resolve a conflict chunk (write resolved content for one chunk in a file) ──
  ipcMain.handle('resolve-conflict-chunk', async (
    _event,
    projectPath: string,
    filePath: string,
    chunkId: number,
    resolution: 'ours' | 'theirs' | 'both' | 'custom',
    customContent?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const fullPath = join(projectPath, filePath)
      if (!existsSync(fullPath)) {
        return { success: false, error: 'File not found' }
      }

      const originalContent = readFileSync(fullPath, 'utf-8')
      const chunks = await parseConflictFile(projectPath, filePath)

      const targetChunk = chunks.find(c => c.id === chunkId)
      if (!targetChunk) {
        return { success: false, error: `Chunk ${chunkId} not found in file` }
      }

      const resolved = buildResolvedContent(originalContent, chunks, [
        { chunkId, resolution, customContent },
      ])

      writeFileSync(fullPath, resolved, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err instanceof Error ? err.message : err) }
    }
  })

  // ── Resolve all chunks in a file at once ──
  ipcMain.handle('resolve-conflict-file', async (
    _event,
    projectPath: string,
    filePath: string,
    resolutions: Array<{ chunkId: number; resolution: 'ours' | 'theirs' | 'both' | 'custom'; customContent?: string }>,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const fullPath = join(projectPath, filePath)
      if (!existsSync(fullPath)) {
        return { success: false, error: 'File not found' }
      }

      const originalContent = readFileSync(fullPath, 'utf-8')
      const chunks = await parseConflictFile(projectPath, filePath)

      // Validate all chunk IDs exist
      for (const res of resolutions) {
        if (!chunks.find(c => c.id === res.chunkId)) {
          return { success: false, error: `Chunk ${res.chunkId} not found` }
        }
      }

      const resolved = buildResolvedContent(originalContent, chunks, resolutions)
      writeFileSync(fullPath, resolved, 'utf-8')

      // Stage the resolved file
      await runGitAsync(`git add "${filePath}"`, projectPath)

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err instanceof Error ? err.message : err) }
    }
  })

  // ── Complete the merge (git add remaining + git commit) ──
  ipcMain.handle('complete-merge', async (
    _event,
    projectPath: string,
    commitMessage?: string,
  ): Promise<{ success: boolean; error?: string; commitHash?: string }> => {
    try {
      if (!projectPath || !existsSync(projectPath)) {
        return { success: false, error: 'Project path does not exist' }
      }

      // Check that no conflict markers remain in any tracked file
      const state = await detectMergeConflicts(projectPath)
      if (state.conflictFiles.length > 0) {
        const unresolved = state.conflictFiles.map(f => f.path).join(', ')
        return { success: false, error: `Unresolved conflicts in: ${unresolved}` }
      }

      // Stage all changes
      await runGitAsync('git add -A', projectPath)

      // Commit — use the merge message if none provided
      const msg = commitMessage || ''
      if (msg) {
        // Escape double quotes in the message for the shell command
        const escapedMsg = msg.replace(/"/g, '\\"')
        await runGitAsync(`git commit -m "${escapedMsg}"`, projectPath)
      } else {
        // --no-edit uses the auto-generated merge commit message
        await runGitAsync('git commit --no-edit', projectPath)
      }

      // Get the resulting commit hash
      const hash = await runGitAsync('git rev-parse --short HEAD', projectPath).catch(() => '')

      return { success: true, commitHash: hash }
    } catch (err) {
      return { success: false, error: String(err instanceof Error ? err.message : err) }
    }
  })

  // ── Abort the merge ──
  ipcMain.handle('abort-merge', async (
    _event,
    projectPath: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!projectPath || !existsSync(projectPath)) {
        return { success: false, error: 'Project path does not exist' }
      }

      const gitDir = join(projectPath, '.git')

      // Detect which type of merge to abort
      if (existsSync(join(gitDir, 'MERGE_HEAD'))) {
        await runGitAsync('git merge --abort', projectPath)
      } else if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
        await runGitAsync('git rebase --abort', projectPath)
      } else if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) {
        await runGitAsync('git cherry-pick --abort', projectPath)
      } else {
        return { success: false, error: 'No merge/rebase/cherry-pick in progress' }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err instanceof Error ? err.message : err) }
    }
  })

  // ── Get commit graph for merge visualization ──
  ipcMain.handle('get-commit-graph', async (
    _event,
    projectPath: string,
    depth?: number,
  ): Promise<Array<{
    hash: string; shortHash: string; subject: string; author: string
    timestamp: number; parents: string[]; refs: string[]
  }>> => {
    if (!projectPath || !existsSync(projectPath)) return []
    return await getCommitGraph(projectPath, depth ?? 30)
  })

  // ── Batch check: which projects are in a merge state? ──
  // Used by the auto-detection hook to check multiple projects at once.
  ipcMain.handle('batch-check-merge-state', async (
    _event,
    projectPaths: string[],
  ): Promise<Record<string, boolean>> => {
    const result: Record<string, boolean> = {}
    for (const p of projectPaths) {
      result[p] = existsSync(p) && isInMergeState(p)
    }
    return result
  })
}
