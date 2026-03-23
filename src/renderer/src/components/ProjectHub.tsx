import { useState, useEffect, useRef, useMemo } from 'react'
import type { ProjectInfo } from '../types'
import type { VoiceProfileId, DockPosition, CameraSettings } from '../hooks/useSettings'
import { useProjectGroups } from '../hooks/useProjectGroups'
import { SceneRoot } from './three/SceneRoot'
import { HudTopbar } from './HudTopbar'
import { GroupContextMenu } from './GroupContextMenu'
import { PreviewGrid } from './PreviewGrid'
import { LAYOUT_FNS, getLayoutCenter } from '../layouts'
import { HolographicScene } from './three/HolographicScene'
import { PbrHoloScene } from './three/PbrHoloScene'
import { DEMO_PROJECTS } from '../data/demo-projects'
import type { DemoSettings } from '../hooks/useDemoSettings'
// ThreeThemeProvider is used inside PbrHoloScene (within the Canvas)

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
  screenOpacity: number
  onHubFontSize: (size: number) => void
  onTermFontSize: (size: number) => void
  onVoiceOut: (enabled: boolean) => void
  onVoiceProfileChange: (id: VoiceProfileId) => void
  onDockPositionChange: (pos: DockPosition) => void
  onScreenOpacityChange: (opacity: number) => void
  camera: CameraSettings
  cameraTweaking: boolean
  onCameraChange: (cam: CameraSettings) => void
  onCameraTweakingChange: (on: boolean) => void
  onCameraReset: () => void
  rendererId: string
  onRendererChange: (id: string) => void
  layoutId: string
  onLayoutChange: (id: string) => void
  threeTheme: string
  onThreeThemeChange: (id: string) => void
  halSessionId?: string | null
  terminalCount?: number
  demo?: DemoSettings
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

export function ProjectHub({ onNewProject, onConvertProject, onOpenTerminal, voiceFocus, onVoiceFocusHub, hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, camera, cameraTweaking, onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, onScreenOpacityChange, onCameraChange, onCameraTweakingChange, onCameraReset, rendererId, onRendererChange, layoutId, onLayoutChange, threeTheme, onThreeThemeChange, halSessionId, terminalCount, demo }: Props) {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [externalSessions, setExternalSessions] = useState<Array<{ pid: number; projectPath: string; projectName: string }>>([])
  const [absorbingPid, setAbsorbingPid] = useState<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; projectPath: string } | null>(null)
  const [preview2d, setPreview2d] = useState(false)

  // Listen for 2D preview toggle from Dev menu
  useEffect(() => {
    if (!window.api.onToggle2dPreview) return
    const unsub = window.api.onToggle2dPreview((enabled: boolean) => setPreview2d(enabled))
    return unsub
  }, [])

  // Project groups
  const {
    groups, assignments, getProjectGroup, assignProject,
    createGroup, deleteGroup, renameGroup, reorderGroups, applyPreset,
  } = useProjectGroups()

  useEffect(() => {
    if (demo?.enabled) {
      setProjects(DEMO_PROJECTS.slice(0, demo.cardCount))
      setLoading(false)
      return
    }
    window.api.scanProjects().then((p) => {
      setProjects(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [demo?.enabled, demo?.cardCount])

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

  // Poll for external Claude CLI sessions every 10 seconds
  useEffect(() => {
    if (!window.api.detectExternalSessions) return
    let cancelled = false
    const poll = () => {
      window.api.detectExternalSessions().then((sessions) => {
        if (!cancelled) setExternalSessions(sessions)
      }).catch(() => {})
    }
    poll() // Initial check
    const interval = setInterval(poll, 10_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const filteredUnsorted = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.path.toLowerCase().includes(search.toLowerCase()) ||
        p.stack.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  // Sort by group (group order first, ungrouped last), then by lastModified within each group
  const filtered = useMemo(() => {
    if (groups.length === 0) return filteredUnsorted
    const groupIdToOrder = new Map(groups.map((g, i) => [g.id, i]))
    return [...filteredUnsorted].sort((a, b) => {
      const ga = assignments[a.path] ? (groupIdToOrder.get(assignments[a.path]) ?? 999) : 1000
      const gb = assignments[b.path] ? (groupIdToOrder.get(assignments[b.path]) ?? 999) : 1000
      if (ga !== gb) return ga - gb
      // Within same group, sort by lastModified descending (most recent first)
      return (b.lastModified || 0) - (a.lastModified || 0)
    })
  }, [filteredUnsorted, groups, assignments])

  const isFullySetup = (p: ProjectInfo) => p.hasClaude && p.hasBatchFiles && p.hasClaudeDir
  const readyCount = projects.filter(isFullySetup).length

  // Layout positioning
  const layoutFn = LAYOUT_FNS[layoutId] || LAYOUT_FNS['dual-arc']
  const layoutCenter = getLayoutCenter(layoutId, dims.w, dims.h)
  const cardW = 200

  // Check if a project has an external session running
  const getExternalSession = (projectPath: string) => {
    const norm = projectPath.replace(/\\/g, '/').toLowerCase()
    return externalSessions.find((s) => {
      const ePath = s.projectPath.replace(/\\/g, '/').toLowerCase()
      return ePath === norm || norm.includes(ePath) || ePath.includes(norm)
    }) || externalSessions.find((s) => {
      const eName = s.projectName.toLowerCase()
      const pName = projectPath.split(/[/\\]/).pop()?.toLowerCase() || ''
      return eName === pName
    })
  }

  const handleAbsorb = async (extSession: { pid: number; projectPath: string; projectName: string }, project: ProjectInfo) => {
    setAbsorbingPid(extSession.pid)
    try {
      await window.api.absorbSession(extSession)
      // Remove from external sessions immediately
      setExternalSessions((prev) => prev.filter((s) => s.pid !== extSession.pid))
      // Open embedded terminal with --continue to pick up the conversation
      if (onOpenTerminal) onOpenTerminal(project.path, project.name, true)
    } catch { /* */ }
    setAbsorbingPid(null)
  }

  const renderCard = (project: ProjectInfo, globalIndex: number) => {
    const ready = isFullySetup(project)
    const pos = layoutFn(globalIndex, { w: dims.w, h: dims.h, total: filtered.length, cardW })
    const isHovered = hovered === project.path
    const extSession = getExternalSession(project.path)
    const isAbsorbing = extSession && absorbingPid === extSession.pid

    const projGroup = getProjectGroup(project.path)

    return (
      <div
        key={project.path}
        className={`hal-arc-card ${ready ? 'ready' : 'pending'} ${isHovered ? 'hovered' : ''} ${extSession ? 'has-external' : ''}`}
        style={{ left: pos.left, top: pos.top, transform: pos.transform, transition: 'left 0.5s, top 0.5s, transform 0.5s' }}
        onMouseEnter={() => setHovered(project.path)}
        onMouseLeave={() => setHovered(null)}
        onContextMenu={(e) => {
          if (groups.length > 0) {
            e.preventDefault()
            setCtxMenu({ x: e.clientX, y: e.clientY, projectPath: project.path })
          }
        }}
      >
        <div className="hal-arc-header">
          {projGroup && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: projGroup.color, display: 'inline-block',
              boxShadow: `0 0 4px ${projGroup.color}`, flexShrink: 0,
            }} />
          )}
          <span className={`hal-dot ${ready ? 'green' : 'amber'}`} />
          <span className="hal-arc-name">{project.name}</span>
          {project.stack && <span className="hal-arc-stack">{project.stack}</span>}
          {extSession && <span className="hal-external-badge">EXT</span>}
        </div>
        {isHovered && (
          <div className="hal-arc-actions">
            {demo?.enabled ? (
              <span style={{ fontSize: 8, letterSpacing: 2, color: '#22d3ee', opacity: 0.6 }}>DEMO PROJECT</span>
            ) : (
              <>
                {extSession && (
                  <button
                    className="hal-btn absorb"
                    disabled={!!isAbsorbing}
                    onClick={(e) => { e.stopPropagation(); handleAbsorb(extSession, project) }}
                  >{isAbsorbing ? 'ABSORBING...' : 'ABSORB'}</button>
                )}
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
              </>
            )}
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

  // 2D Preview Mode — flat grid of all project cards (triggered via Dev menu)
  if (preview2d) {
    return (
      <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub} style={{ '--hub-font': `${hubFontSize}px` } as React.CSSProperties}>
        <PreviewGrid
          projects={filtered}
          isFullySetup={isFullySetup}
          onOpenTerminal={onOpenTerminal}
        />
        <HudTopbar
          search={search} onSearchChange={setSearch} onNewProject={onNewProject} onConvertProject={onConvertProject}
          voiceFocus={voiceFocus} halSessionId={halSessionId} onListeningChange={setIsListening}
          projectCount={projects.length} readyCount={readyCount}
          hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          camera={camera} cameraTweaking={cameraTweaking}
          rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraTweakingChange={onCameraTweakingChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
          groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
          demo={demo}
        />
      </div>
    )
  }

  // PBR Holographic renderer — reference-quality 3D
  if (rendererId === 'pbr-holo') {
    return (
      <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub} style={{ '--hub-font': `${hubFontSize}px` } as React.CSSProperties}>
        <PbrHoloScene
          projects={filtered}
          listening={isListening && voiceFocus === 'hub'}
          isFullySetup={isFullySetup}
          onOpenTerminal={onOpenTerminal}
          halOnline={!!halSessionId}
          layoutId={layoutId}
          terminalCount={terminalCount}
          vfxFrequency={demo?.vfxFrequency}
          groups={groups}
          assignments={assignments}
          camera={camera}
          themeId={threeTheme}
        />
        <HudTopbar
          search={search} onSearchChange={setSearch} onNewProject={onNewProject} onConvertProject={onConvertProject}
          voiceFocus={voiceFocus} halSessionId={halSessionId} onListeningChange={setIsListening}
          projectCount={projects.length} readyCount={readyCount}
          hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          camera={camera} cameraTweaking={cameraTweaking}
          rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraTweakingChange={onCameraTweakingChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
          groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
          demo={demo}
        />
        <div className="hal-center-label">{loading ? 'SCANNING...' : demo?.enabled ? 'DEMO MODE' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}</div>
      </div>
    )
  }

  // Holographic renderer — full 3D scene with floating screens
  if (rendererId === 'holographic') {
    return (
      <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub} style={{ '--hub-font': `${hubFontSize}px` } as React.CSSProperties}>
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
          hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          camera={camera} cameraTweaking={cameraTweaking}
          rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraTweakingChange={onCameraTweakingChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
          groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
          demo={demo}
        />

        <div className="hal-center-label">{loading ? 'SCANNING...' : demo?.enabled ? 'DEMO MODE' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}</div>
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
        hubFontSize={hubFontSize} termFontSize={termFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
        camera={camera} cameraTweaking={cameraTweaking}
        rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
        onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
        onCameraChange={onCameraChange} onCameraTweakingChange={onCameraTweakingChange} onCameraReset={onCameraReset}
        onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
        groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
        demo={demo}
      />

      {/* Status label */}
      <div className="hal-center-label">
        {loading ? 'SCANNING...' : demo?.enabled ? 'DEMO MODE' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}
      </div>

      {/* Project cards — positioned by active layout */}
      {!loading && filtered.map((p, i) => renderCard(p, i))}

      {/* Loading state */}
      {loading && (
        <div className="hal-center-label" style={{ top: '55%' }}>SCANNING FIELD OPERATIONS...</div>
      )}

      {/* Command bar removed — integrated into top bar */}

      {/* Right-click group assignment context menu */}
      {ctxMenu && (
        <GroupContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          groups={groups}
          currentGroupId={assignments[ctxMenu.projectPath]}
          onAssign={(groupId) => assignProject(ctxMenu.projectPath, groupId)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* HUD corners */}
      <div className="hal-hud-corner tl" />
      <div className="hal-hud-corner tr" />
      <div className="hal-hud-corner bl" />
      <div className="hal-hud-corner br" />
    </div>
  )
}
