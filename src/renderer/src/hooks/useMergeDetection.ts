// ── U18: Auto-detection hook for merge conflicts ──
// Periodically checks all loaded projects for merge state.
// Piggybacks on the same ~10s cadence as the external session scanner.

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ProjectInfo, MergeState, CommitNode } from '../types'

/** Merge state keyed by project path */
export type MergeStates = Record<string, MergeState>

/** Commit graphs keyed by project path */
export type CommitGraphs = Record<string, CommitNode[]>

/** Lightweight boolean map: path → inMerge (from batch check) */
type MergeFlagMap = Record<string, boolean>

const POLL_INTERVAL = 10_000 // 10 seconds — same as external session scanner

/**
 * Hook that monitors all projects for merge conflicts.
 *
 * Phase 1 strategy:
 *   1. Every 10s, call batchCheckMergeState with all project paths (cheap — just file existence checks).
 *   2. For any project that IS in a merge state, fetch full MergeState (branch names, file list).
 *   3. Expose the map so ScreenPanel can show a merge indicator and ProjectHub can open the resolver.
 *
 * @param projects - The current project list (from scanProjects)
 * @param enabled  - Set to false to disable polling (e.g. in demo mode)
 */
export function useMergeDetection(projects: ProjectInfo[], enabled: boolean = true) {
  const [mergeStates, setMergeStates] = useState<MergeStates>({})
  const [commitGraphs, setCommitGraphs] = useState<CommitGraphs>({})
  const [mergeFlags, setMergeFlags] = useState<MergeFlagMap>({})
  const prevFlagsRef = useRef<MergeFlagMap>({})

  // Keep a ref to the latest projects to avoid stale closures in the interval
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  // Full fetch for projects that have conflicts — also fetches commit graphs for 3D visualization
  const fetchFullStates = useCallback(async (pathsInMerge: string[]) => {
    if (pathsInMerge.length === 0) {
      setMergeStates({})
      setCommitGraphs({})
      return
    }
    const results: MergeStates = {}
    const graphs: CommitGraphs = {}
    // Fetch in parallel — each is a separate IPC roundtrip
    const promises = pathsInMerge.map(async (path) => {
      try {
        const state = await window.api.detectMergeConflicts(path)
        if (state.inMerge) {
          results[path] = state
          // Phase 2: also fetch commit graph for 3D visualization (shallow — 20 commits)
          try {
            const graph = await window.api.getCommitGraph(path, 20)
            graphs[path] = graph
          } catch {
            graphs[path] = [] // graph is optional — visualization works without it
          }
        }
      } catch {
        // Silently ignore failures for individual projects
      }
    })
    await Promise.all(promises)
    setMergeStates(results)
    setCommitGraphs(graphs)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setMergeFlags({})
      setMergeStates({})
      return
    }
    if (!window.api.batchCheckMergeState) return

    let cancelled = false

    const poll = async () => {
      const paths = projectsRef.current.map(p => p.path)
      if (paths.length === 0) return

      try {
        const flags = await window.api.batchCheckMergeState(paths)
        if (cancelled) return

        // Only update state if something changed
        const prev = prevFlagsRef.current
        const changed = Object.keys(flags).some(k => flags[k] !== prev[k]) ||
          Object.keys(prev).some(k => prev[k] !== flags[k])

        if (changed) {
          prevFlagsRef.current = flags
          setMergeFlags(flags)

          // Fetch full state for projects that are in merge
          const inMerge = Object.entries(flags).filter(([, v]) => v).map(([k]) => k)
          await fetchFullStates(inMerge)
        }
      } catch {
        // Batch check failed — silently ignore
      }
    }

    poll() // Initial check
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(interval) }
  }, [enabled, fetchFullStates])

  /** Check if a specific project path has an active merge */
  const isProjectInMerge = useCallback((path: string): boolean => {
    return mergeFlags[path] === true
  }, [mergeFlags])

  /** Get the full merge state for a project (or undefined if not in merge) */
  const getMergeState = useCallback((path: string): MergeState | undefined => {
    return mergeStates[path]
  }, [mergeStates])

  /** Count of projects currently in merge state */
  const mergeCount = Object.values(mergeFlags).filter(Boolean).length

  /** Get the commit graph for a project (or empty array if not in merge / not loaded) */
  const getCommitGraph = useCallback((path: string): CommitNode[] => {
    return commitGraphs[path] || []
  }, [commitGraphs])

  /** Force an immediate re-poll (e.g. after resolving a conflict or completing a merge) */
  const refetch = useCallback(async () => {
    const paths = projectsRef.current.map(p => p.path)
    if (paths.length === 0) return
    if (!window.api.batchCheckMergeState) return

    try {
      const flags = await window.api.batchCheckMergeState(paths)
      prevFlagsRef.current = flags
      setMergeFlags(flags)
      const inMerge = Object.entries(flags).filter(([, v]) => v).map(([k]) => k)
      await fetchFullStates(inMerge)
    } catch {
      // Silently ignore
    }
  }, [fetchFullStates])

  return {
    mergeStates,
    commitGraphs,
    mergeFlags,
    mergeCount,
    isProjectInMerge,
    getMergeState,
    getCommitGraph,
    refetch,
  }
}
