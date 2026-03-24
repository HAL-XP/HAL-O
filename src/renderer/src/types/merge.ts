// ── U18: Merge Conflict Types ──
// Shared types for the 3D merge conflict resolver.
// Used by: main/merge-detector.ts, main/ipc-merge.ts, renderer hooks, ScreenPanel overlay

/** Git conflict file status codes from `git status --porcelain` */
export type ConflictStatus = 'UU' | 'AA' | 'DD'

/** A single conflict hunk within a file — the ours/theirs (and optional base) content blocks */
export interface ConflictChunk {
  /** Monotonic index within the file (0-based) */
  id: number
  /** "Ours" side content (current branch) */
  oursContent: string
  /** "Theirs" side content (incoming branch) */
  theirsContent: string
  /** Three-way merge base content (present when diff3 conflict style is used) */
  baseContent?: string
  /** 1-based line number where this conflict starts in the raw file */
  startLine: number
  /** 1-based line number where this conflict ends (inclusive of the >>>>>>> marker) */
  endLine: number
  /** User's chosen resolution: 'ours' | 'theirs' | 'both' | 'custom', or undefined if unresolved */
  resolution?: 'ours' | 'theirs' | 'both' | 'custom'
  /** Custom content when resolution is 'custom' */
  customContent?: string
}

/** A file that has merge conflicts */
export interface ConflictFile {
  /** Relative path from repo root (forward slashes) */
  path: string
  /** Git status code */
  status: ConflictStatus
  /** Parsed conflict hunks (empty for DD — both-deleted files) */
  chunks: ConflictChunk[]
}

/** Top-level merge state for a project */
export interface MergeState {
  /** True when the repo is in an active merge/rebase/cherry-pick */
  inMerge: boolean
  /** Type of merge operation detected */
  mergeType: 'merge' | 'rebase' | 'cherry-pick' | 'none'
  /** List of files with conflicts */
  conflictFiles: ConflictFile[]
  /** Current branch name (ours) */
  ourBranch: string
  /** Incoming branch/ref name (theirs) */
  theirBranch: string
}

/** A single node in the commit graph */
export interface CommitNode {
  hash: string
  shortHash: string
  subject: string
  author: string
  timestamp: number
  /** Parent commit hashes */
  parents: string[]
  /** Ref names (branch/tag labels) */
  refs: string[]
}
