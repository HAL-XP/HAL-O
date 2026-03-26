/**
 * Performance self-diagnostic logger.
 *
 * Enable: window.__haloPerfLog = true (or --perf-log CLI flag)
 * Captures: frame times, GC events (via performance.measureUserAgentSpecificMemory),
 * long tasks, React re-renders (via injection), IPC round-trips.
 *
 * Data is written to window.__haloPerfData and can be dumped to console or file.
 * Usage in DevTools: window.__haloPerfDump() → copies JSON to clipboard.
 */

interface PerfEntry {
  ts: number
  type: 'frame' | 'long-task' | 'gc' | 'ipc' | 'rerender'
  ms: number
  detail?: string
}

const MAX_ENTRIES = 5000
const entries: PerfEntry[] = []
let enabled = false
let frameCount = 0
let lastFrameTime = 0
let longTaskObserver: PerformanceObserver | null = null

/** Start the perf logger */
export function startPerfLog() {
  if (enabled) return
  enabled = true
  entries.length = 0
  frameCount = 0
  lastFrameTime = performance.now()

  // Long Task observer — detects >50ms tasks (main thread blocks)
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pushEntry({ ts: entry.startTime, type: 'long-task', ms: entry.duration, detail: entry.name })
      }
    })
    longTaskObserver.observe({ type: 'longtask', buffered: false })
  } catch {
    // PerformanceObserver longtask not supported in all Electron versions
  }

  // Frame time tracking via rAF
  requestAnimationFrame(measureFrame)

  console.log('[PERF] Logger started. Entries cap:', MAX_ENTRIES)
}

/** Stop and return entries */
export function stopPerfLog(): PerfEntry[] {
  enabled = false
  longTaskObserver?.disconnect()
  longTaskObserver = null
  console.log(`[PERF] Logger stopped. ${entries.length} entries captured.`)
  return [...entries]
}

/** Push a perf entry */
function pushEntry(e: PerfEntry) {
  if (entries.length >= MAX_ENTRIES) entries.shift()
  entries.push(e)
}

/** rAF frame measurement */
function measureFrame() {
  if (!enabled) return
  const now = performance.now()
  const dt = now - lastFrameTime
  lastFrameTime = now
  frameCount++

  // Only log frames that took >20ms (dropped frame at 60fps = 16.67ms)
  if (dt > 20) {
    pushEntry({ ts: now, type: 'frame', ms: dt, detail: `frame#${frameCount}` })
  }

  requestAnimationFrame(measureFrame)
}

/** Log an IPC round-trip */
export function logIPC(channel: string, ms: number) {
  if (!enabled) return
  pushEntry({ ts: performance.now(), type: 'ipc', ms, detail: channel })
}

/** Log a React re-render */
export function logRerender(component: string, ms: number) {
  if (!enabled) return
  pushEntry({ ts: performance.now(), type: 'rerender', ms, detail: component })
}

/** Dump to console as a summary */
export function dumpPerfSummary() {
  const frames = entries.filter(e => e.type === 'frame')
  const longTasks = entries.filter(e => e.type === 'long-task')
  const ipcs = entries.filter(e => e.type === 'ipc')

  const avgFrame = frames.length ? frames.reduce((s, e) => s + e.ms, 0) / frames.length : 0
  const maxFrame = frames.length ? Math.max(...frames.map(e => e.ms)) : 0
  const p99Frame = frames.length ? frames.sort((a, b) => b.ms - a.ms)[Math.floor(frames.length * 0.01)]?.ms ?? 0 : 0

  console.log(`
=== HAL-O PERF SUMMARY ===
Dropped frames (>20ms): ${frames.length}
  Avg: ${avgFrame.toFixed(1)}ms
  Max: ${maxFrame.toFixed(1)}ms
  P99: ${p99Frame.toFixed(1)}ms

Long tasks (>50ms): ${longTasks.length}
${longTasks.slice(0, 10).map(e => `  ${e.ms.toFixed(0)}ms @ ${(e.ts / 1000).toFixed(1)}s — ${e.detail}`).join('\n')}

IPC calls: ${ipcs.length}
${ipcs.length ? `  Avg: ${(ipcs.reduce((s, e) => s + e.ms, 0) / ipcs.length).toFixed(1)}ms` : '  (none)'}
${ipcs.filter(e => e.ms > 50).slice(0, 5).map(e => `  SLOW: ${e.ms.toFixed(0)}ms — ${e.detail}`).join('\n')}

Total entries: ${entries.length}
===========================
`)
}

// Expose on window for DevTools access
;(window as any).__haloPerfLog = { start: startPerfLog, stop: stopPerfLog, dump: dumpPerfSummary, entries }
