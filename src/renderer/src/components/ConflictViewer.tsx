// ── U18 Phase 3: Interactive Conflict Viewer with Resolution Controls ──
// Portal-based overlay that shows conflict chunks for a selected file.
// Per-chunk resolution buttons: OURS | THEIRS | BOTH | EDIT
// Apply All, Abort Merge, Complete Merge controls.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { ConflictChunk, MergeState } from '../types'

// ── Types ──

type Resolution = 'ours' | 'theirs' | 'both' | 'custom'

interface ChunkState {
  resolution: Resolution | null
  customContent: string
  editing: boolean
}

interface Props {
  /** The merge state for the project that owns this file */
  mergeState: MergeState
  /** Project root path (for IPC calls) */
  projectPath: string
  /** Relative file path within the project */
  filePath: string
  /** Close the viewer */
  onClose: () => void
  /** Called after all chunks resolved + file written — parent should refresh merge state */
  onResolved: () => void
  /** Called after merge is aborted — parent should refresh merge state */
  onAborted: () => void
  /** Called after merge is completed — parent should refresh + show success */
  onMergeComplete: (commitHash?: string) => void
}

// ── Helpers ──

/** Truncate a file path to last 3 segments for display */
function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  if (parts.length <= 3) return p
  return '.../' + parts.slice(-3).join('/')
}

/** Count lines in a string (min 1) */
function lineCount(s: string): number {
  if (!s) return 1
  return s.split('\n').length
}

// ── Main Component ──

export function ConflictViewer({
  mergeState,
  projectPath,
  filePath,
  onClose,
  onResolved,
  onAborted,
  onMergeComplete,
}: Props) {
  // Parsed conflict chunks loaded from the main process
  const [chunks, setChunks] = useState<ConflictChunk[]>([])
  const [chunkStates, setChunkStates] = useState<ChunkState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [focusedChunk, setFocusedChunk] = useState(0)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Load chunks on mount / file change ──
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSuccessMessage(null)

    window.api.parseConflictFile(projectPath, filePath).then((parsed: ConflictChunk[]) => {
      if (cancelled) return
      setChunks(parsed)
      setChunkStates(parsed.map(() => ({
        resolution: null,
        customContent: '',
        editing: false,
      })))
      setFocusedChunk(0)
      setLoading(false)
    }).catch((err: unknown) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [projectPath, filePath])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ESC closes the viewer
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      // Don't intercept keys when editing a textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA') return

      // 1/2/3 = accept ours/theirs/both for focused chunk
      if (e.key === '1') {
        e.preventDefault()
        resolveChunk(focusedChunk, 'ours')
      } else if (e.key === '2') {
        e.preventDefault()
        resolveChunk(focusedChunk, 'theirs')
      } else if (e.key === '3') {
        e.preventDefault()
        resolveChunk(focusedChunk, 'both')
      }

      // Arrow up/down to navigate chunks
      if (e.key === 'ArrowUp' && focusedChunk > 0) {
        e.preventDefault()
        setFocusedChunk(f => Math.max(0, f - 1))
      }
      if (e.key === 'ArrowDown' && focusedChunk < chunks.length - 1) {
        e.preventDefault()
        setFocusedChunk(f => Math.min(chunks.length - 1, f + 1))
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [focusedChunk, chunks.length, onClose])

  // ── Scroll focused chunk into view ──
  useEffect(() => {
    const el = document.getElementById(`conflict-chunk-${focusedChunk}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedChunk])

  // ── Resolution logic ──
  const resolveChunk = useCallback((index: number, resolution: Resolution) => {
    setChunkStates(prev => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = {
        ...next[index],
        resolution,
        editing: resolution === 'custom' ? true : false,
      }
      // Pre-fill custom content from ours if switching to custom for the first time
      if (resolution === 'custom' && !next[index].customContent && chunks[index]) {
        next[index].customContent = chunks[index].oursContent
      }
      return next
    })
  }, [chunks])

  const setCustomContent = useCallback((index: number, content: string) => {
    setChunkStates(prev => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = { ...next[index], customContent: content }
      return next
    })
  }, [])

  const commitEdit = useCallback((index: number) => {
    setChunkStates(prev => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = { ...next[index], editing: false }
      return next
    })
  }, [])

  const cancelEdit = useCallback((index: number) => {
    setChunkStates(prev => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = { ...next[index], resolution: null, editing: false, customContent: '' }
      return next
    })
  }, [])

  // ── Derived state ──
  const allResolved = useMemo(() => {
    return chunkStates.length > 0 && chunkStates.every(s => s.resolution !== null)
  }, [chunkStates])

  const resolvedCount = useMemo(() => {
    return chunkStates.filter(s => s.resolution !== null).length
  }, [chunkStates])

  // Check if ALL files in the merge are resolved (not just the current one)
  const allFilesResolved = useMemo(() => {
    // This file's chunks must all be resolved
    if (!allResolved) return false
    // And there must be only 1 conflict file total (this one)
    return mergeState.conflictFiles.length <= 1
  }, [allResolved, mergeState.conflictFiles.length])

  // ── Apply resolutions ──
  const handleApply = useCallback(async () => {
    if (!allResolved) return
    setApplying(true)
    setError(null)

    try {
      const resolutions = chunkStates.map((state, i) => ({
        chunkId: chunks[i].id,
        resolution: state.resolution!,
        customContent: state.resolution === 'custom' ? state.customContent : undefined,
      }))

      const result = await window.api.resolveConflictFile(projectPath, filePath, resolutions)
      if (!result.success) {
        setError(result.error || 'Resolution failed')
        setApplying(false)
        return
      }

      setSuccessMessage('File resolved and staged')
      setApplying(false)
      // Notify parent to refresh merge state after a brief delay for feedback
      setTimeout(() => onResolved(), 600)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setApplying(false)
    }
  }, [allResolved, chunkStates, chunks, projectPath, filePath, onResolved])

  // ── Apply All: resolve all chunks with one strategy ──
  const handleApplyAll = useCallback((resolution: Resolution) => {
    setChunkStates(prev => prev.map((s, i) => ({
      ...s,
      resolution,
      editing: false,
      customContent: resolution === 'custom' ? (s.customContent || chunks[i]?.oursContent || '') : s.customContent,
    })))
  }, [chunks])

  // ── Abort merge ──
  const handleAbort = useCallback(async () => {
    if (aborting) return
    setAborting(true)
    setError(null)

    try {
      const result = await window.api.abortMerge(projectPath)
      if (!result.success) {
        setError(result.error || 'Abort failed')
        setAborting(false)
        return
      }
      onAborted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setAborting(false)
    }
  }, [aborting, projectPath, onAborted])

  // ── Complete merge ──
  const handleCompleteMerge = useCallback(async () => {
    if (completing) return
    setCompleting(true)
    setError(null)

    try {
      const result = await window.api.completeMerge(projectPath)
      if (!result.success) {
        setError(result.error || 'Merge completion failed')
        setCompleting(false)
        return
      }
      onMergeComplete(result.commitHash)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCompleting(false)
    }
  }, [completing, projectPath, onMergeComplete])

  // ── Merge type label ──
  const mergeTypeLabel = mergeState.mergeType === 'merge' ? 'MERGE'
    : mergeState.mergeType === 'rebase' ? 'REBASE'
    : mergeState.mergeType === 'cherry-pick' ? 'CHERRY-PICK'
    : 'MERGE'

  // ── Render ──
  return createPortal(
    <div
      className="conflict-viewer-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: 'min(900px, 90vw)',
          maxHeight: '85vh',
          background: '#0a0e17',
          border: '1px solid #1e293b',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.15), 0 0 80px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #1e293b',
          background: '#0f1624',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          {/* Merge type badge */}
          <span style={{
            background: '#7f1d1d',
            color: '#fca5a5',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 3,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}>
            {mergeTypeLabel}
          </span>

          {/* File path */}
          <span style={{
            color: '#e2e8f0',
            fontSize: 12,
            fontWeight: 600,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={filePath}>
            {shortPath(filePath)}
          </span>

          {/* Branch labels */}
          <span style={{ color: '#3b82f6', fontSize: 10, fontWeight: 600 }}>
            {mergeState.ourBranch}
          </span>
          <span style={{ color: '#64748b', fontSize: 10 }}>vs</span>
          <span style={{ color: '#a855f7', fontSize: 10, fontWeight: 600 }}>
            {mergeState.theirBranch}
          </span>

          {/* Resolution progress */}
          <span style={{
            color: allResolved ? '#4ade80' : '#94a3b8',
            fontSize: 10,
            fontWeight: 600,
            marginLeft: 8,
          }}>
            {resolvedCount}/{chunks.length}
          </span>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #334155',
              borderRadius: 3,
              color: '#94a3b8',
              fontSize: 11,
              padding: '2px 8px',
              cursor: 'pointer',
              marginLeft: 4,
            }}
            title="Close (ESC)"
          >
            ESC
          </button>
        </div>

        {/* ── Keyboard hint bar ── */}
        <div style={{
          padding: '4px 16px',
          borderBottom: '1px solid #1a2332',
          background: '#0c1220',
          display: 'flex',
          gap: 16,
          fontSize: 9,
          color: '#475569',
          flexShrink: 0,
        }}>
          <span><kbd style={kbdStyle}>1</kbd> Ours</span>
          <span><kbd style={kbdStyle}>2</kbd> Theirs</span>
          <span><kbd style={kbdStyle}>3</kbd> Both</span>
          <span><kbd style={kbdStyle}>Up</kbd>/<kbd style={kbdStyle}>Down</kbd> Navigate</span>
          <span><kbd style={kbdStyle}>ESC</kbd> Close</span>
        </div>

        {/* ── Scrollable chunk list ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
        }}>
          {loading && (
            <div style={{ color: '#64748b', textAlign: 'center', padding: 40, fontSize: 12 }}>
              PARSING CONFLICT MARKERS...
            </div>
          )}

          {error && (
            <div style={{
              background: '#1c0a0a',
              border: '1px solid #7f1d1d',
              borderRadius: 4,
              padding: '8px 12px',
              color: '#fca5a5',
              fontSize: 11,
              marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {successMessage && (
            <div style={{
              background: '#052e16',
              border: '1px solid #14532d',
              borderRadius: 4,
              padding: '8px 12px',
              color: '#4ade80',
              fontSize: 11,
              marginBottom: 12,
              textAlign: 'center',
            }}>
              {successMessage}
            </div>
          )}

          {!loading && chunks.length === 0 && !error && (
            <div style={{ color: '#4ade80', textAlign: 'center', padding: 40, fontSize: 12 }}>
              NO CONFLICT MARKERS FOUND — FILE IS CLEAN
            </div>
          )}

          {chunks.map((chunk, i) => (
            <ConflictChunkCard
              key={chunk.id}
              chunk={chunk}
              index={i}
              total={chunks.length}
              state={chunkStates[i]}
              focused={focusedChunk === i}
              ourBranch={mergeState.ourBranch}
              theirBranch={mergeState.theirBranch}
              onFocus={() => setFocusedChunk(i)}
              onResolve={(res) => resolveChunk(i, res)}
              onSetCustom={(content) => setCustomContent(i, content)}
              onCommitEdit={() => commitEdit(i)}
              onCancelEdit={() => cancelEdit(i)}
            />
          ))}
        </div>

        {/* ── Footer actions ── */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid #1e293b',
          background: '#0f1624',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          {/* Accept All buttons */}
          <span style={{ color: '#475569', fontSize: 9, marginRight: 4 }}>ACCEPT ALL:</span>
          <button onClick={() => handleApplyAll('ours')} style={applyAllBtnStyle('#1e40af', '#3b82f6')}>
            OURS
          </button>
          <button onClick={() => handleApplyAll('theirs')} style={applyAllBtnStyle('#6b21a8', '#a855f7')}>
            THEIRS
          </button>
          <button onClick={() => handleApplyAll('both')} style={applyAllBtnStyle('#065f46', '#10b981')}>
            BOTH
          </button>

          <div style={{ flex: 1 }} />

          {/* Abort merge */}
          <button
            onClick={handleAbort}
            disabled={aborting}
            style={{
              background: aborting ? '#1c0a0a' : '#1a0000',
              border: '1px solid #7f1d1d',
              borderRadius: 3,
              color: aborting ? '#94a3b8' : '#fca5a5',
              fontSize: 10,
              fontWeight: 600,
              padding: '5px 12px',
              cursor: aborting ? 'default' : 'pointer',
              letterSpacing: 0.5,
              fontFamily: 'inherit',
            }}
          >
            {aborting ? 'ABORTING...' : 'ABORT MERGE'}
          </button>

          {/* Apply resolutions */}
          <button
            onClick={handleApply}
            disabled={!allResolved || applying}
            style={{
              background: allResolved
                ? (applying ? '#0a3622' : '#052e16')
                : '#1a1a2e',
              border: `1px solid ${allResolved ? '#14532d' : '#334155'}`,
              borderRadius: 3,
              color: allResolved ? '#4ade80' : '#475569',
              fontSize: 10,
              fontWeight: 700,
              padding: '5px 14px',
              cursor: allResolved && !applying ? 'pointer' : 'default',
              letterSpacing: 0.5,
              fontFamily: 'inherit',
            }}
          >
            {applying ? 'APPLYING...' : 'RESOLVE FILE'}
          </button>

          {/* Complete merge — only visible when all files are resolved */}
          {allFilesResolved && (
            <button
              onClick={handleCompleteMerge}
              disabled={completing}
              style={{
                background: completing ? '#0a2638' : '#0c1f3a',
                border: '1px solid #1e40af',
                borderRadius: 3,
                color: completing ? '#94a3b8' : '#60a5fa',
                fontSize: 10,
                fontWeight: 700,
                padding: '5px 14px',
                cursor: completing ? 'default' : 'pointer',
                letterSpacing: 0.5,
                fontFamily: 'inherit',
                boxShadow: '0 0 8px rgba(59, 130, 246, 0.2)',
              }}
            >
              {completing ? 'COMMITTING...' : 'COMPLETE MERGE'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Conflict Chunk Card ──

interface ChunkCardProps {
  chunk: ConflictChunk
  index: number
  total: number
  state: ChunkState | undefined
  focused: boolean
  ourBranch: string
  theirBranch: string
  onFocus: () => void
  onResolve: (resolution: Resolution) => void
  onSetCustom: (content: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
}

function ConflictChunkCard({
  chunk, index, total, state, focused, ourBranch, theirBranch,
  onFocus, onResolve, onSetCustom, onCommitEdit, onCancelEdit,
}: ChunkCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const resolution = state?.resolution ?? null
  const editing = state?.editing ?? false

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(0, 0)
    }
  }, [editing])

  const resolvedLabel = resolution === 'ours' ? 'OURS'
    : resolution === 'theirs' ? 'THEIRS'
    : resolution === 'both' ? 'BOTH'
    : resolution === 'custom' ? 'CUSTOM'
    : null

  const resolvedColor = resolution === 'ours' ? '#3b82f6'
    : resolution === 'theirs' ? '#a855f7'
    : resolution === 'both' ? '#10b981'
    : resolution === 'custom' ? '#f59e0b'
    : '#64748b'

  return (
    <div
      id={`conflict-chunk-${index}`}
      onClick={onFocus}
      style={{
        marginBottom: 16,
        border: `1px solid ${focused ? '#334155' : '#1e293b'}`,
        borderRadius: 4,
        background: focused ? '#0d1526' : '#0a0e17',
        transition: 'border-color 0.15s, background 0.15s',
        boxShadow: focused ? '0 0 12px rgba(59, 130, 246, 0.08)' : 'none',
      }}
    >
      {/* Chunk header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: '1px solid #1a2332',
        background: '#0c1220',
        borderRadius: '4px 4px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#64748b', fontSize: 10, fontWeight: 600 }}>
            CHUNK {index + 1}/{total}
          </span>
          <span style={{ color: '#475569', fontSize: 9 }}>
            L{chunk.startLine}-{chunk.endLine}
          </span>
          {resolvedLabel && (
            <span style={{
              background: resolvedColor + '22',
              color: resolvedColor,
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 2,
              letterSpacing: 0.5,
            }}>
              {resolvedLabel}
            </span>
          )}
        </div>

        {/* Resolution buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          <ResolutionButton
            label="OURS"
            active={resolution === 'ours'}
            color="#3b82f6"
            onClick={() => onResolve('ours')}
          />
          <ResolutionButton
            label="THEIRS"
            active={resolution === 'theirs'}
            color="#a855f7"
            onClick={() => onResolve('theirs')}
          />
          <ResolutionButton
            label="BOTH"
            active={resolution === 'both'}
            color="#10b981"
            onClick={() => onResolve('both')}
          />
          <ResolutionButton
            label="EDIT"
            active={resolution === 'custom'}
            color="#f59e0b"
            onClick={() => onResolve('custom')}
          />
        </div>
      </div>

      {/* Conflict content — side-by-side ours vs theirs */}
      {!editing ? (
        <div style={{ display: 'flex', minHeight: 40 }}>
          {/* Ours side */}
          <div style={{
            flex: 1,
            borderRight: '1px solid #1a2332',
            padding: '6px 8px',
            background: resolution === 'ours' ? '#172554' + '33' : '#0b1120',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 4,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
              <span style={{ color: '#3b82f6', fontSize: 9, fontWeight: 600 }}>
                {ourBranch || 'OURS'}
              </span>
            </div>
            <CodeBlock content={chunk.oursContent} lineStart={chunk.startLine + 1} />
          </div>

          {/* Theirs side */}
          <div style={{
            flex: 1,
            padding: '6px 8px',
            background: resolution === 'theirs' ? '#581c87' + '22' : '#0d0a17',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 4,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />
              <span style={{ color: '#a855f7', fontSize: 9, fontWeight: 600 }}>
                {theirBranch || 'THEIRS'}
              </span>
            </div>
            <CodeBlock content={chunk.theirsContent} lineStart={chunk.startLine + 1} />
          </div>
        </div>
      ) : (
        /* Editing mode — textarea for custom resolution */
        <div style={{ padding: 8 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 6,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>
              CUSTOM RESOLUTION
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={state?.customContent ?? ''}
            onChange={(e) => onSetCustom(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl+Enter to commit edit
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                onCommitEdit()
              }
              // Escape to cancel edit
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                onCancelEdit()
              }
            }}
            rows={Math.max(4, lineCount(state?.customContent ?? ''))}
            style={{
              width: '100%',
              background: '#0f1624',
              border: '1px solid #334155',
              borderRadius: 3,
              color: '#e2e8f0',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              padding: 8,
              resize: 'vertical',
              lineHeight: 1.5,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={onCancelEdit}
              style={{
                background: 'none',
                border: '1px solid #334155',
                borderRadius: 3,
                color: '#94a3b8',
                fontSize: 9,
                padding: '3px 10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              CANCEL
            </button>
            <button
              onClick={onCommitEdit}
              style={{
                background: '#422006',
                border: '1px solid #92400e',
                borderRadius: 3,
                color: '#fbbf24',
                fontSize: 9,
                fontWeight: 600,
                padding: '3px 10px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              DONE (Ctrl+Enter)
            </button>
          </div>
        </div>
      )}

      {/* Base content (diff3 — if present) */}
      {chunk.baseContent !== undefined && !editing && (
        <div style={{
          borderTop: '1px solid #1a2332',
          padding: '4px 8px',
          background: '#0e0c0a',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 3,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ color: '#f59e0b', fontSize: 8, fontWeight: 600, opacity: 0.7 }}>
              BASE
            </span>
          </div>
          <CodeBlock content={chunk.baseContent} lineStart={chunk.startLine + 1} dim />
        </div>
      )}
    </div>
  )
}

// ── Code Block — renders a preformatted code block with line numbers ──

function CodeBlock({ content, lineStart, dim }: { content: string; lineStart?: number; dim?: boolean }) {
  const lines = content.split('\n')
  const start = lineStart ?? 1

  return (
    <pre style={{
      margin: 0,
      fontSize: 11,
      lineHeight: 1.5,
      color: dim ? '#475569' : '#cbd5e1',
      overflow: 'auto',
      maxHeight: 200,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex' }}>
          <span style={{
            color: '#334155',
            minWidth: 28,
            textAlign: 'right',
            paddingRight: 8,
            userSelect: 'none',
            flexShrink: 0,
            fontSize: 9,
          }}>
            {start + i}
          </span>
          <span>{line || ' '}</span>
        </div>
      ))}
    </pre>
  )
}

// ── Resolution Button ──

function ResolutionButton({ label, active, color, onClick }: {
  label: string
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        background: active ? color + '33' : 'transparent',
        border: `1px solid ${active ? color : '#334155'}`,
        borderRadius: 2,
        color: active ? color : '#64748b',
        fontSize: 9,
        fontWeight: 600,
        padding: '2px 6px',
        cursor: 'pointer',
        letterSpacing: 0.3,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  )
}

// ── Shared styles ──

const kbdStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 2,
  padding: '0 3px',
  fontSize: 8,
  color: '#94a3b8',
  fontFamily: 'inherit',
}

function applyAllBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg + '33',
    border: `1px solid ${bg}`,
    borderRadius: 3,
    color,
    fontSize: 9,
    fontWeight: 600,
    padding: '3px 8px',
    cursor: 'pointer',
    letterSpacing: 0.5,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  }
}
