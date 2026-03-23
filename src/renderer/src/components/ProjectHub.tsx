import { useState, useEffect, useRef } from 'react'
import type { ProjectInfo } from '../types'
import type { VoiceProfileId, DockPosition } from '../hooks/useSettings'
import { SceneRoot } from './three/SceneRoot'
import { HudTopbar } from './HudTopbar'
import { LAYOUT_FNS, getLayoutCenter } from '../layouts'
import { HolographicScene } from './three/HolographicScene'
import { PbrHoloScene } from './three/PbrHoloScene'

interface Props {
  onNewProject: () => void
  onConvertProject: (path: string) => void
  onOpenTerminal?: (projectPath: string, projectName: string, resume: boolean) => void
  voiceFocus?: 'hub' | string
  onVoiceFocusHub?: () => void
  hubFontSize: number
  termFontSize: number
  voiceOut: boolean
  voiceProfile: VoiceProfileId
  dockPosition: DockPosition
  onHubFontSize: (size: number) => void
  onTermFontSize: (size: number) => void
  onVoiceOut: (enabled: boolean) => void
  onVoiceProfileChange: (id: VoiceProfileId) => void
  onDockPositionChange: (pos: DockPosition) => void
  rendererId: string
  onRendererChange: (id: string) => void
  layoutId: string
  onLayoutChange: (id: string) => void
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

export function ProjectHub({ onNewProject, onConvertProject, onOpenTerminal, voiceFocus, onVoiceFocusHub, hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, rendererId, onRendererChange, layoutId, onLayoutChange, halSessionId }: Props) {
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

  // Layout positioning
  const layoutFn = LAYOUT_FNS[layoutId] || LAYOUT_FNS['dual-arc']
  const layoutCenter = getLayoutCenter(layoutId, dims.w, dims.h)
  const cardW = 200

  const renderCard = (project: ProjectInfo, globalIndex: number) => {
    const ready = isFullySetup(project)
    const pos = layoutFn(globalIndex, { w: dims.w, h: dims.h, total: filtered.length, cardW })
    const isHovered = hovered === project.path

    return (
      <div
        key={project.path}
        className={`hal-arc-card ${ready ? 'ready' : 'pending'} ${isHovered ? 'hovered' : ''}`}
        style={{ left: pos.left, top: pos.top, transform: pos.transform, transition: 'left 0.5s, top 0.5s, transform 0.5s' }}
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
  const { x: centerX, y: centerY } = layoutCenter
  const connectionLines = filtered.map((project, i) => {
    const pos = layoutFn(i, { w: dims.w, h: dims.h, total: filtered.length, cardW })
    const cardCenterX = pos.left + cardW / 2
    const cardCenterY = pos.top + 18
    const ready = isFullySetup(project)
    const isActive = hovered === project.path

    const midX = (centerX + cardCenterX) / 2
    const midY = (centerY + cardCenterY) / 2
    const dx = cardCenterX - centerX
    const controlOffset = dx > 0 ? -30 : 30

    return (
      <g key={project.path}>
        <path
          d={`M ${centerX} ${centerY} Q ${midX + controlOffset} ${midY} ${cardCenterX} ${cardCenterY}`}
          fill="none"
          stroke={isActive ? (ready ? '#84cc16' : '#fbbf24') : 'rgba(132,204,22,0.1)'}
          strokeWidth={isActive ? 1.5 : 0.5}
          strokeDasharray={isActive ? 'none' : '4,6'}
          style={{ transition: 'all 0.5s' }}
        />
        <circle
          cx={cardCenterX}
          cy={cardCenterY}
          r={isActive ? 5 : 3}
          fill={ready ? '#84cc16' : '#fbbf24'}
          opacity={isActive ? 0.8 : 0.4}
          style={{ transition: 'cx 0.5s, cy 0.5s' }}
        />
      </g>
    )
  })

  // PBR Holographic renderer — reference-quality 3D
  if (rendererId === 'pbr-holo') {
    return (
      <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub}>
        <PbrHoloScene
          projects={filtered}
          listening={isListening && voiceFocus === 'hub'}
          isFullySetup={isFullySetup}
          onOpenTerminal={onOpenTerminal}
          halOnline={!!halSessionId}
          layoutId={layoutId}
        />
        <HudTopbar
          search={search} onSearchChange={setSearch} onNewProject={onNewProject} onConvertProject={onConvertProject}
          voiceFocus={voiceFocus} halSessionId={halSessionId} onListeningChange={setIsListening}
          projectCount={projects.length} readyCount={readyCount}
          hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} rendererId={rendererId} layoutId={layoutId}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onRendererChange={onRendererChange} onLayoutChange={onLayoutChange}
        />
        <div className="hal-center-label">{loading ? 'SCANNING...' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}</div>
      </div>
    )
  }

  // Holographic renderer — full 3D scene with floating screens
  if (rendererId === 'holographic') {
    return (
      <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub}>
        <HolographicScene
          projects={filtered}
          listening={isListening && voiceFocus === 'hub'}
          isFullySetup={isFullySetup}
          onOpenTerminal={onOpenTerminal}
          layoutId={layoutId}
        />

        <HudTopbar
          search={search} onSearchChange={setSearch} onNewProject={onNewProject} onConvertProject={onConvertProject}
          voiceFocus={voiceFocus} halSessionId={halSessionId} onListeningChange={setIsListening}
          projectCount={projects.length} readyCount={readyCount}
          hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} rendererId={rendererId} layoutId={layoutId}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onRendererChange={onRendererChange} onLayoutChange={onLayoutChange}
        />

        <div className="hal-center-label">{loading ? 'SCANNING...' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}</div>
      </div>
    )
  }

  // Classic renderer — CSS cards + Three.js background
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
      <HudTopbar
        search={search} onSearchChange={setSearch} onNewProject={onNewProject} onConvertProject={onConvertProject}
        voiceFocus={voiceFocus} halSessionId={halSessionId} onListeningChange={setIsListening}
        projectCount={projects.length} readyCount={readyCount}
        hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} rendererId={rendererId} layoutId={layoutId}
        onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onRendererChange={onRendererChange} onLayoutChange={onLayoutChange}
      />

      {/* Status label */}
      <div className="hal-center-label">
        {loading ? 'SCANNING...' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}
      </div>

      {/* Project cards — positioned by active layout */}
      {!loading && filtered.map((p, i) => renderCard(p, i))}

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
