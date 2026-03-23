import { useState, useMemo } from 'react'
import { DemoTerminalPanel } from './DemoTerminalPanel'
import { ALL_FEEDS } from '../data/demo-feed'
import { DEMO_PROJECTS } from '../data/demo-projects'

interface DemoTab {
  id: string
  name: string
  feedIndex: number
  offset: number
}

interface DemoPane {
  id: string
  tabs: DemoTab[]
  activeTabId: string
}

interface Props {
  terminalCount: number
  tabsMin: number
  tabsMax: number
  fontSize?: number
}

/**
 * Deterministic pseudo-random from seed (simple LCG).
 * Used so the same settings always produce the same layout.
 */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

export function DemoTerminalView({ terminalCount, tabsMin, tabsMax, fontSize = 13 }: Props) {
  const panes = useMemo(() => {
    const rng = seededRandom(42)
    const result: DemoPane[] = []
    let tabCounter = 0

    for (let p = 0; p < terminalCount; p++) {
      const tabCount = Math.floor(rng() * (tabsMax - tabsMin + 1)) + tabsMin
      const tabs: DemoTab[] = []

      for (let t = 0; t < tabCount; t++) {
        const projectIdx = tabCounter % DEMO_PROJECTS.length
        const feedIdx = tabCounter % ALL_FEEDS.length
        const offset = Math.floor(rng() * ALL_FEEDS[feedIdx].length)
        tabs.push({
          id: `demo-tab-${tabCounter}`,
          name: DEMO_PROJECTS[projectIdx].name,
          feedIndex: feedIdx,
          offset,
        })
        tabCounter++
      }

      result.push({
        id: `demo-pane-${p}`,
        tabs,
        activeTabId: tabs[0].id,
      })
    }

    return result
  }, [terminalCount, tabsMin, tabsMax])

  const [activeTabs, setActiveTabs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const pane of panes) {
      initial[pane.id] = pane.activeTabId
    }
    return initial
  })

  if (panes.length === 0) return null

  return (
    <div className="hal-split-container">
      {panes.map((pane) => {
        const activeTabId = activeTabs[pane.id] || pane.tabs[0].id
        return (
          <div key={pane.id} className="hal-split-pane" style={{ flex: 1 }}>
            {/* Tab bar */}
            <div className="hal-terminal-tabs">
              {pane.tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`hal-terminal-tab ${tab.id === activeTabId ? 'active' : ''}`}
                  onClick={() => setActiveTabs((prev) => ({ ...prev, [pane.id]: tab.id }))}
                >
                  <span className="hal-terminal-tab-dot" />
                  <span className="hal-terminal-tab-name">{tab.name}</span>
                </div>
              ))}
              <div className="hal-terminal-tab" style={{ opacity: 0.4, cursor: 'default', pointerEvents: 'none' }}>
                <span className="hal-terminal-tab-name" style={{ fontSize: '8px', letterSpacing: '1px' }}>DEMO</span>
              </div>
            </div>

            {/* Terminal content */}
            <div className="hal-terminal-content">
              {pane.tabs.map((tab) => (
                <DemoTerminalPanel
                  key={tab.id}
                  feedEntries={ALL_FEEDS[tab.feedIndex]}
                  active={tab.id === activeTabId}
                  fontSize={fontSize}
                  startOffset={tab.offset}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
