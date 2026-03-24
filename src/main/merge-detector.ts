// ── U18: Merge Conflict Detection & Parsing ──
// Pure logic — no IPC or Electron imports. Used by ipc-merge.ts.

import { exec } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// ── Types (duplicated from renderer to avoid cross-boundary imports) ──

type ConflictStatus = 'UU' | 'AA' | 'DD'

interface ConflictChunk {
  id: number
  oursContent: string
  theirsContent: string
  baseContent?: string
  startLine: number
  endLine: number
}

interface ConflictFile {
  path: string
  status: ConflictStatus
  chunks: ConflictChunk[]
}

interface MergeState {
  inMerge: boolean
  mergeType: 'merge' | 'rebase' | 'cherry-pick' | 'none'
  conflictFiles: ConflictFile[]
  ourBranch: string
  theirBranch: string
}

interface CommitNode {
  hash: string
  shortHash: string
  subject: string
  author: string
  timestamp: number
  parents: string[]
  refs: string[]
}

// ── Helpers ──

/** Run a shell command asynchronously, returning trimmed stdout. Rejects on error. */
function runGit(cmd: string, cwd: string): Promise<string> {
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

/** Quiet version — returns empty string on error instead of throwing. */
async function runGitQuiet(cmd: string, cwd: string): Promise<string> {
  try {
    return await runGit(cmd, cwd)
  } catch {
    return ''
  }
}

// ── Conflict Status Codes ──

const CONFLICT_CODES = new Set<string>(['UU', 'AA', 'DD'])

function isConflictStatus(code: string): code is ConflictStatus {
  return CONFLICT_CODES.has(code)
}

// ── Core Detection ──

/**
 * Detect merge state for a git repository.
 * Checks for active merge/rebase/cherry-pick and lists conflicted files.
 */
export async function detectMergeConflicts(projectPath: string): Promise<MergeState> {
  const empty: MergeState = {
    inMerge: false,
    mergeType: 'none',
    conflictFiles: [],
    ourBranch: '',
    theirBranch: '',
  }

  const gitDir = join(projectPath, '.git')
  if (!existsSync(gitDir)) return empty

  // Determine merge type by checking for sentinel files in .git/
  let mergeType: MergeState['mergeType'] = 'none'
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) {
    mergeType = 'merge'
  } else if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
    mergeType = 'rebase'
  } else if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) {
    mergeType = 'cherry-pick'
  }

  if (mergeType === 'none') return empty

  // Get porcelain status to find conflicted files
  const statusOutput = await runGitQuiet('git status --porcelain', projectPath)
  const conflictFiles: ConflictFile[] = []

  for (const line of statusOutput.split('\n')) {
    if (!line || line.length < 4) continue
    // Porcelain v1 format: XY <space> filename
    const xy = line.slice(0, 2)
    if (!isConflictStatus(xy)) continue

    const filePath = line.slice(3).trim()
    // Remove any quotes git adds for special characters
    const cleanPath = filePath.replace(/^"|"$/g, '')

    conflictFiles.push({
      path: cleanPath,
      status: xy,
      chunks: [], // Chunks are parsed lazily via parseConflictFile
    })
  }

  // Get branch names
  const ourBranch = await getOurBranch(projectPath, gitDir, mergeType)
  const theirBranch = await getTheirBranch(projectPath, gitDir, mergeType)

  return {
    inMerge: true,
    mergeType,
    conflictFiles,
    ourBranch,
    theirBranch,
  }
}

/** Get the current (ours) branch name. */
async function getOurBranch(projectPath: string, gitDir: string, mergeType: MergeState['mergeType']): Promise<string> {
  if (mergeType === 'rebase') {
    // During rebase, HEAD is detached. The original branch is in rebase-merge/head-name
    const headNameFile = join(gitDir, 'rebase-merge', 'head-name')
    if (existsSync(headNameFile)) {
      try {
        const ref = readFileSync(headNameFile, 'utf-8').trim()
        // Strip refs/heads/ prefix
        return ref.replace(/^refs\/heads\//, '')
      } catch { /* fall through */ }
    }
  }
  // Normal case: just get HEAD
  const branch = await runGitQuiet('git rev-parse --abbrev-ref HEAD', projectPath)
  return branch || 'HEAD'
}

/** Get the incoming (theirs) branch name. */
async function getTheirBranch(_projectPath: string, gitDir: string, mergeType: MergeState['mergeType']): Promise<string> {
  if (mergeType === 'merge') {
    // MERGE_MSG usually contains "Merge branch 'feature' into main"
    const msgFile = join(gitDir, 'MERGE_MSG')
    if (existsSync(msgFile)) {
      try {
        const msg = readFileSync(msgFile, 'utf-8')
        const match = msg.match(/^Merge (?:branch|remote-tracking branch) '([^']+)'/)
          || msg.match(/^Merge (?:branch|remote-tracking branch) "([^"]+)"/)
          || msg.match(/^Merge (\S+) into/)
        if (match) return match[1]
      } catch { /* fall through */ }
    }
    // Fallback: resolve MERGE_HEAD to a branch name
    const mergeHeadFile = join(gitDir, 'MERGE_HEAD')
    if (existsSync(mergeHeadFile)) {
      try {
        const hash = readFileSync(mergeHeadFile, 'utf-8').trim()
        return hash.slice(0, 8) // Short hash as fallback
      } catch { /* */ }
    }
  } else if (mergeType === 'rebase') {
    // The onto commit is the branch we're rebasing onto
    const ontoFile = join(gitDir, 'rebase-merge', 'onto')
    if (existsSync(ontoFile)) {
      try {
        const hash = readFileSync(ontoFile, 'utf-8').trim()
        return hash.slice(0, 8)
      } catch { /* */ }
    }
  } else if (mergeType === 'cherry-pick') {
    const cpFile = join(gitDir, 'CHERRY_PICK_HEAD')
    if (existsSync(cpFile)) {
      try {
        const hash = readFileSync(cpFile, 'utf-8').trim()
        return hash.slice(0, 8)
      } catch { /* */ }
    }
  }
  return 'incoming'
}

// ── Conflict File Parsing ──

/**
 * Parse a file with conflict markers into structured chunks.
 * Handles both standard (2-way) and diff3 (3-way) conflict markers.
 *
 * Standard markers:
 *   <<<<<<< ours-ref
 *   ... ours content ...
 *   =======
 *   ... theirs content ...
 *   >>>>>>> theirs-ref
 *
 * diff3 markers:
 *   <<<<<<< ours-ref
 *   ... ours content ...
 *   ||||||| base-ref
 *   ... base content ...
 *   =======
 *   ... theirs content ...
 *   >>>>>>> theirs-ref
 */
export async function parseConflictFile(projectPath: string, filePath: string): Promise<ConflictChunk[]> {
  const fullPath = join(projectPath, filePath)
  if (!existsSync(fullPath)) return []

  let content: string
  try {
    content = readFileSync(fullPath, 'utf-8')
  } catch {
    return []
  }

  const lines = content.split('\n')
  const chunks: ConflictChunk[] = []
  let chunkId = 0

  let i = 0
  while (i < lines.length) {
    // Look for <<<<<<< marker
    if (lines[i].startsWith('<<<<<<<')) {
      const startLine = i + 1 // 1-based
      const oursLines: string[] = []
      const baseLines: string[] = []
      const theirsLines: string[] = []
      let section: 'ours' | 'base' | 'theirs' = 'ours'
      let hasBase = false
      let endLine = startLine

      i++ // Move past <<<<<<<
      while (i < lines.length) {
        if (lines[i].startsWith('|||||||')) {
          // diff3 base marker
          section = 'base'
          hasBase = true
          i++
          continue
        }
        if (lines[i].startsWith('=======')) {
          section = 'theirs'
          i++
          continue
        }
        if (lines[i].startsWith('>>>>>>>')) {
          endLine = i + 1 // 1-based, inclusive of this marker line
          i++
          break
        }

        switch (section) {
          case 'ours':
            oursLines.push(lines[i])
            break
          case 'base':
            baseLines.push(lines[i])
            break
          case 'theirs':
            theirsLines.push(lines[i])
            break
        }
        i++
      }

      const chunk: ConflictChunk = {
        id: chunkId++,
        oursContent: oursLines.join('\n'),
        theirsContent: theirsLines.join('\n'),
        startLine,
        endLine,
      }
      if (hasBase) {
        chunk.baseContent = baseLines.join('\n')
      }
      chunks.push(chunk)
    } else {
      i++
    }
  }

  return chunks
}

// ── Commit Graph ──

/**
 * Get recent commit topology for the project.
 * Returns an array of CommitNode objects with parent links for graph rendering.
 */
export async function getCommitGraph(projectPath: string, depth: number = 30): Promise<CommitNode[]> {
  const gitDir = join(projectPath, '.git')
  if (!existsSync(gitDir)) return []

  // Custom format with null-byte separators for safe parsing
  // Fields: hash, short hash, subject, author, timestamp, parents, decorations
  const SEP = '%x00'
  const format = `%H${SEP}%h${SEP}%s${SEP}%an${SEP}%ct${SEP}%P${SEP}%D`

  const output = await runGitQuiet(
    `git log --all --topo-order -n ${depth} --format="${format}"`,
    projectPath,
  )

  if (!output) return []

  const nodes: CommitNode[] = []
  for (const line of output.split('\n')) {
    if (!line) continue
    const parts = line.split('\0')
    if (parts.length < 7) continue

    const [hash, shortHash, subject, author, tsStr, parentsStr, refsStr] = parts
    nodes.push({
      hash,
      shortHash,
      subject,
      author,
      timestamp: parseInt(tsStr, 10) || 0,
      parents: parentsStr ? parentsStr.split(' ').filter(Boolean) : [],
      refs: refsStr ? refsStr.split(',').map(r => r.trim()).filter(Boolean) : [],
    })
  }

  return nodes
}

// ── Resolution Helpers ──

/**
 * Build the resolved file content by replacing conflict chunks with chosen resolutions.
 * Non-conflict lines are preserved as-is.
 */
export function buildResolvedContent(
  originalContent: string,
  chunks: ConflictChunk[],
  resolutions: Array<{ chunkId: number; resolution: 'ours' | 'theirs' | 'both' | 'custom'; customContent?: string }>,
): string {
  const lines = originalContent.split('\n')
  const resMap = new Map(resolutions.map(r => [r.chunkId, r]))

  // Work backwards to avoid index shifting when replacing ranges
  const sortedChunks = [...chunks].sort((a, b) => b.startLine - a.startLine)

  for (const chunk of sortedChunks) {
    const res = resMap.get(chunk.id)
    if (!res) continue // Skip unresolved chunks

    let replacement: string
    switch (res.resolution) {
      case 'ours':
        replacement = chunk.oursContent
        break
      case 'theirs':
        replacement = chunk.theirsContent
        break
      case 'both':
        replacement = chunk.oursContent + '\n' + chunk.theirsContent
        break
      case 'custom':
        replacement = res.customContent ?? chunk.oursContent
        break
    }

    // Replace from startLine-1 (0-based, the <<<<<<< line) to endLine-1 (0-based, the >>>>>>> line)
    const start = chunk.startLine - 1  // 0-based index of <<<<<<< line
    const end = chunk.endLine          // 0-based index AFTER >>>>>>> line (exclusive for splice)
    const replacementLines = replacement.split('\n')
    lines.splice(start, end - start, ...replacementLines)
  }

  return lines.join('\n')
}

/**
 * Quick check: does this project have any merge conflicts?
 * Faster than full detectMergeConflicts — just checks for sentinel files.
 */
export function isInMergeState(projectPath: string): boolean {
  const gitDir = join(projectPath, '.git')
  if (!existsSync(gitDir)) return false
  return (
    existsSync(join(gitDir, 'MERGE_HEAD')) ||
    existsSync(join(gitDir, 'rebase-merge')) ||
    existsSync(join(gitDir, 'rebase-apply')) ||
    existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))
  )
}
