import { useState, useEffect, useRef, useCallback } from 'react'
import type { ProjectInfo } from '../types'
import { SceneRoot } from './three/SceneRoot'
import { MicButton } from './MicButton'
import { SettingsMenu } from './SettingsMenu'

interface Props {
  onNewProject: () => void
  onConvertProject: (path: string) => void
  onOpenTerminal?: (projectPath: string, projectName: string, resume: boolean) => void
  voiceFocus?: 'hub' | string
  onVoiceFocusHub?: () => void
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  onHubFontSize: (size: number) => void
  onTermFontSize: (size: number) => void
  onVoiceOut: (enabled: boolean) => void
  halSessionId?: string | null
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function ProjectHub({ onNewProject, onConvertProject, onOpenTerminal, voiceFocus, onVoiceFocusHub, hubFontSize, termFontSize, voiceOut, onHubFontSize, onTermFontSize, onVoiceOut, halSessionId }: Props) {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    window.api.scanProjects().then((p) => {
      setProjects(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Track CONTAINER size, not window size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDims({ w: width, h: height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const filtered = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.path.toLowerCase().includes(search.toLowerCase()) ||
        p.stack.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  const isFullySetup = (p: ProjectInfo) => p.hasClaude && p.hasBatchFiles && p.hasClaudeDir
  const readyCount = projects.filter(isFullySetup).length

  // Split into left and right arcs
  const half = Math.ceil(filtered.length / 2)
  const leftArc = filtered.slice(0, half)
  const rightArc = filtered.slice(half)

  // Arc positioning
  const cx = dims.w / 2
  const cy = dims.h * 0.5
  const arcRadius = Math.min(dims.h * 0.35, dims.w * 0.3, 350)

  const getArcPosition = useCallback((index: number, total: number, side: 'left' | 'right') => {
    const startAngle = side === 'left' ? Math.PI * 0.6 : -Math.PI * 0.4
    const endAngle = side === 'left' ? Math.PI * 1.4 : Math.PI * 0.4
    const t = total <= 1 ? 0.5 : index / (total - 1)
    const angle = startAngle + t * (endAngle - startAngle)
    return {
      x: cx + Math.cos(angle) * arcRadius,
      y: cy + Math.sin(angle) * arcRadius,
    }
  }, [cx, cy, arcRadius])

  const renderCard = (project: ProjectInfo, index: number, side: 'left' | 'right', total: number) => {
    const ready = isFullySetup(project)
    const pos = getArcPosition(index, total, side)
    const cardWidth = 200
    const left = side === 'left' ? pos.x - cardWidth - 15 : pos.x + 15
    const top = pos.y - 20
    const isHovered = hovered === project.path

    return (
      <div
        key={project.path}
        className={`hal-arc-card ${ready ? 'ready' : 'pending'} ${isHovered ? 'hovered' : ''}`}
        style={{ left, top }}
        onMouseEnter={() => setHovered(project.path)}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="hal-arc-header">
          <span className={`hal-dot ${ready ? 'green' : 'amber'}`} />
          <span className="hal-arc-name">{project.name}</span>
          {project.stack && <span className="hal-arc-stack">{project.stack}</span>}
        </div>
        {isHovered && (
          <div className="hal-arc-actions">
            <button className="hal-btn deploy" onClick={() => {
              if (onOpenTerminal) onOpenTerminal(project.path, project.name, true)
              else window.api.launchProject(project.path, true)
            }}>RESUME</button>
            <button className="hal-btn" onClick={() => {
              if (onOpenTerminal) onOpenTerminal(project.path, project.name, false)
              else window.api.launchProject(project.path, false)
            }}>NEW</button>
            {project.runCmd && (
              <button className="hal-btn run" onClick={() => window.api.runApp(project.path, project.runCmd)}>RUN</button>
            )}
            <button className="hal-btn" onClick={() => window.api.openFolder(project.path)}>FILES</button>
          </div>
        )}
      </div>
    )
  }

  // Build SVG connection lines
  const connectionLines = filtered.map((project, i) => {
    const side = i < half ? 'left' : 'right'
    const idx = side === 'left' ? i : i - half
    const total = side === 'left' ? leftArc.length : rightArc.length
    const pos = getArcPosition(idx, total, side)
    const ready = isFullySetup(project)
    const isActive = hovered === project.path

    const midX = (cx + pos.x) / 2
    const midY = (cy + pos.y) / 2
    const controlOffset = side === 'left' ? -40 : 40

    return (
      <g key={project.path}>
        <path
          d={`M ${cx} ${cy} Q ${midX + controlOffset} ${midY} ${pos.x} ${pos.y}`}
          fill="none"
          stroke={isActive ? (ready ? '#84cc16' : '#fbbf24') : 'rgba(132,204,22,0.1)'}
          strokeWidth={isActive ? 1.5 : 0.5}
          strokeDasharray={isActive ? 'none' : '4,6'}
        />
        <circle
          cx={pos.x}
          cy={pos.y}
          r={isActive ? 5 : 3}
          fill={ready ? '#84cc16' : '#fbbf24'}
          opacity={isActive ? 0.8 : 0.4}
        />
      </g>
    )
  })

  return (
    <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub} style={{ '--hub-font': `${hubFontSize}px` } as React.CSSProperties}>
      <SceneRoot projectCount={projects.length} listening={isListening && voiceFocus === 'hub'} />

      {/* SVG connection lines */}
      <svg className="hal-connections" viewBox={`0 0 ${dims.w} ${dims.h}`}>
        {connectionLines}
      </svg>

      {/* Edge readouts */}
      <div className="hal-edge left">SYS.MEM 47.2% | GPU 12% | UPTIME 04:32:11</div>
      <div className="hal-edge right">SYNC 99.7% | ALL CHANNELS OPEN</div>
      <div className="hal-edge bl">DUAL-ARC TOPOLOGY :: NOMINAL</div>
      <div className="hal-edge br">SESSION {new Date().toISOString().slice(0, 10)}</div>

      {/* Top HUD bar */}
      <div className="hal-topbar">
        <div className="hal-topbar-left">
          <span className="hal-sys-label">SYS://CLAUDEBORN</span>
          <span className="hal-sys-ver">v1.0</span>
          <button className="hal-cmd deploy" onClick={onNewProject} style={{ marginLeft: 16, padding: '3px 10px', fontSize: '9px' }}>
            + NEW
          </button>
          <button className="hal-cmd" onClick={async () => {
            const folder = await window.api.selectFolder()
            if (folder) onConvertProject(folder)
          }} style={{ padding: '3px 10px', fontSize: '9px' }}>
            + RECRUIT
          </button>
        </div>
        <div className="hal-topbar-center">
          <span className="hal-prompt">&gt;</span>
          <input
            className="hal-search"
            placeholder="SEARCH... (CTRL+SPACE to talk)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <MicButton
            onTranscript={(text) => {
              // Hub focus → send to HAL (the Claudeborn terminal = this session)
              // Terminal focus → send to that specific terminal
              const target = voiceFocus === 'hub' ? halSessionId : voiceFocus
              if (target) {
                window.api.ptyInput(target, `[voice] ${text}\r`).catch(() => {})
              }
              // If no target, voice has nowhere to go (no Claudeborn terminal open)
            }}
            onListeningChange={setIsListening}
          />
          <span className="hal-voice-target">{voiceFocus === 'hub' ? (halSessionId ? 'HAL' : 'NO LINK') : 'TERM'}</span>
        </div>
        <div className="hal-topbar-right">
          <SettingsMenu
            hubFontSize={hubFontSize}
            termFontSize={termFontSize}
            voiceOut={voiceOut}
            onHubFontSize={onHubFontSize}
            onTermFontSize={onTermFontSize}
            onVoiceOut={onVoiceOut}
          />
          <span className="hal-stat"><span className="hal-stat-n">{projects.length}</span> OPS</span>
          <span className="hal-stat"><span className="hal-stat-n hal-c-ok">{readyCount}</span> READY</span>
          <span className="hal-stat"><span className="hal-stat-n hal-c-warn">{projects.length - readyCount}</span> PENDING</span>
        </div>
      </div>

      {/* Status label */}
      <div className="hal-center-label">
        {loading ? 'SCANNING...' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}
      </div>

      {/* Arc cards */}
      {!loading && leftArc.map((p, i) => renderCard(p, i, 'left', leftArc.length))}
      {!loading && rightArc.map((p, i) => renderCard(p, i, 'right', rightArc.length))}

      {/* Loading state */}
      {loading && (
        <div className="hal-center-label" style={{ top: '55%' }}>SCANNING FIELD OPERATIONS...</div>
      )}

      {/* Command bar removed — integrated into top bar */}

      {/* HUD corners */}
      <div className="hal-hud-corner tl" />
      <div className="hal-hud-corner tr" />
      <div className="hal-hud-corner bl" />
      <div className="hal-hud-corner br" />
    </div>
  )
}
