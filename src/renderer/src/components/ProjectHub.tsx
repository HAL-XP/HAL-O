import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { ProjectInfo } from '../types'
import type { VoiceProfileId, DockPosition, CameraSettings, PersonalitySettings, SphereStyleId } from '../hooks/useSettings'
import { useProjectGroups } from '../hooks/useProjectGroups'
import { useHiddenProjects } from '../hooks/useHiddenProjects'
import { useFavoriteProjects } from '../hooks/useFavoriteProjects'
import { useSceneReady } from '../hooks/useSceneReady'
import { SceneRoot } from './three/SceneRoot'
import { HudTopbar } from './HudTopbar'
import { ProjectContextMenu } from './ProjectContextMenu'
import { UpgradeDialog } from './UpgradeDialog'
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
  wizardFontSize: number
  onWizardFontSize: (size: number) => void
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
  particleDensity: number
  onParticleDensityChange: (v: number) => void
  renderQuality: number
  onRenderQualityChange: (v: number) => void
  camera: CameraSettings
  onCameraChange: (cam: CameraSettings) => void
  onCameraReset: () => void
  onCameraMove?: (distance: number, angle: number) => void
  rendererId: string
  onRendererChange: (id: string) => void
  layoutId: string
  onLayoutChange: (id: string) => void
  threeTheme: string
  onThreeThemeChange: (id: string) => void
  shipVfxEnabled?: boolean
  onShipVfxEnabledChange?: (enabled: boolean) => void
  sphereStyle?: SphereStyleId
  onSphereStyleChange?: (style: SphereStyleId) => void
  voiceReactionIntensity?: number
  onVoiceReactionIntensityChange?: (v: number) => void
  personality: PersonalitySettings
  onPersonalityChange: (key: keyof PersonalitySettings, value: number) => void
  onPersonalityPreset: (presetName: string) => void
  halSessionId?: string | null
  terminalCount?: number
  demo?: DemoSettings
  // IDE (U19)
  defaultIde?: string
  onDefaultIdeChange?: (id: string) => void
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

export function ProjectHub({ onNewProject, onConvertProject, onOpenTerminal, voiceFocus, onVoiceFocusHub, hubFontSize, termFontSize, wizardFontSize, onWizardFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, particleDensity, onParticleDensityChange, renderQuality, onRenderQualityChange, camera, onHubFontSize, onTermFontSize, onVoiceOut, onVoiceProfileChange, onDockPositionChange, onScreenOpacityChange, onCameraChange, onCameraReset, onCameraMove, rendererId, onRendererChange, layoutId, onLayoutChange, threeTheme, onThreeThemeChange, shipVfxEnabled = true, onShipVfxEnabledChange, sphereStyle = 'wireframe', onSphereStyleChange, voiceReactionIntensity = 0.5, onVoiceReactionIntensityChange, personality, onPersonalityChange, onPersonalityPreset, halSessionId, terminalCount, demo, defaultIde = 'auto', onDefaultIdeChange }: Props) {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [showPerf, setShowPerf] = useState(false)

  // F2 toggles perf overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'F2') setShowPerf(p => !p) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [externalSessions, setExternalSessions] = useState<Array<{ pid: number; projectPath: string; projectName: string }>>([])
  const [absorbingPid, setAbsorbingPid] = useState<number | null>(null)
  const [absorbToast, setAbsorbToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const absorbToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; projectPath: string; projectName: string; rulesOutdated?: boolean } | null>(null)
  const [upgradeTarget, setUpgradeTarget] = useState<{ path: string; name: string } | null>(null)
  const [preview2d, setPreview2d] = useState(false)
  const [voiceBlocked, setVoiceBlocked] = useState(false)
  const voiceBlockedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scene loading overlay — staged reveal
  const { ready: sceneReady, dismissed: sceneDismissed, onSceneReady, reset: resetSceneReady } = useSceneReady()

  // Reset overlay when renderer changes
  useEffect(() => {
    resetSceneReady()
  }, [rendererId, resetSceneReady])

  // Flash sphere briefly when voice input is blocked (no valid target)
  const handleVoiceBlocked = useCallback(() => {
    setVoiceBlocked(true)
    if (voiceBlockedTimer.current) clearTimeout(voiceBlockedTimer.current)
    voiceBlockedTimer.current = setTimeout(() => setVoiceBlocked(false), 600)
  }, [])

  // S5: Upgrade handler — opens UpgradeDialog
  const handleUpgrade = useCallback((path: string, name: string) => {
    setUpgradeTarget({ path, name })
  }, [])

  const refreshProjects = useCallback(() => {
    if (demo?.enabled) return
    window.api.scanProjects().then(p => setProjects(p)).catch(() => {})
  }, [demo?.enabled])

  // Listen for 2D preview toggle from Dev menu
  useEffect(() => {
    if (!window.api.onToggle2dPreview) return
    const unsub = window.api.onToggle2dPreview((enabled: boolean) => setPreview2d(enabled))
    return unsub
  }, [])

  // M2: Cinematic demo mode — scripted camera sequence
  const [cinematicActive, setCinematicActive] = useState(false)
  useEffect(() => {
    if (!window.api.onToggleCinematic) return
    const unsub = window.api.onToggleCinematic((enabled: boolean) => setCinematicActive(enabled))
    return unsub
  }, [])
  // ESC key exits cinematic mode
  useEffect(() => {
    if (!cinematicActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCinematicActive(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cinematicActive])

  // Project groups
  const {
    groups, assignments, getProjectGroup, assignProject,
    createGroup, deleteGroup, renameGroup, reorderGroups, applyPreset,
  } = useProjectGroups()

  // Hidden projects
  const { hiddenPaths, hideProject, unhideProject, isHidden } = useHiddenProjects()

  // Favorite projects
  const { toggleFavorite, isFavorite } = useFavoriteProjects()

  // ── IDE preference management (U19) ──
  // Per-project IDE stored in localStorage: hal-o-ide-<slug(path)>
  // Slug: replace non-alnum chars with dashes for safe localStorage keys
  const pathToKey = useCallback((p: string) => `hal-o-ide-${p.replace(/[^a-zA-Z0-9]/g, '-')}`, [])
  const [ideLabels, setIdeLabels] = useState<Record<string, string>>({}) // path -> shortLabel

  const getPerProjectIde = useCallback((projectPath: string): string | null => {
    try {
      return localStorage.getItem(pathToKey(projectPath)) || null
    } catch { return null }
  }, [pathToKey])

  const setPerProjectIde = useCallback((projectPath: string, ideId: string | null) => {
    const key = pathToKey(projectPath)
    if (ideId) {
      localStorage.setItem(key, ideId)
    } else {
      localStorage.removeItem(key)
    }
    // Re-resolve the label for this project
    window.api.resolveIde(projectPath, ideId, defaultIde).then((resolved) => {
      setIdeLabels(prev => ({
        ...prev,
        [projectPath]: resolved?.shortLabel || '</>'
      }))
    }).catch(() => {})
  }, [defaultIde])

  // Resolve IDE labels for all projects on mount and when projects/defaultIde change
  useEffect(() => {
    const resolveAll = async () => {
      const labels: Record<string, string> = {}
      for (const project of projects) {
        try {
          const perProject = getPerProjectIde(project.path)
          const resolved = await window.api.resolveIde(project.path, perProject, defaultIde)
          labels[project.path] = resolved?.shortLabel || '</>'
        } catch {
          labels[project.path] = '</>'
        }
      }
      setIdeLabels(labels)
    }
    if (projects.length > 0) resolveAll()
  }, [projects, defaultIde, getPerProjectIde])

  const getIdeLabel = useCallback((projectPath: string): string | undefined => {
    return ideLabels[projectPath]
  }, [ideLabels])

  const handleOpenIde = useCallback((projectPath: string) => {
    const perProject = getPerProjectIde(projectPath)
    // Resolve which IDE to use, then open it directly by id
    window.api.resolveIde(projectPath, perProject, defaultIde).then((resolved) => {
      if (resolved) {
        window.api.openInIde(projectPath, resolved.id)
      } else {
        window.api.openInIde(projectPath)
      }
    }).catch(() => {
      window.api.openInIde(projectPath)
    })
  }, [getPerProjectIde, defaultIde])

  const handleOpenIdeMenu = useCallback((projectPath: string, e: React.MouseEvent) => {
    // Show the context menu with IDE picker at the right-click position
    const perProject = getPerProjectIde(projectPath)
    const projectName = projects.find(p => p.path === projectPath)?.name || 'Project'
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      projectPath,
      projectName,
      rulesOutdated: false,
    })
  }, [getPerProjectIde, projects])

  const handleOpenExternalTerminal = useCallback((projectPath: string) => {
    window.api.openExternalTerminal(projectPath)
  }, [])

  useEffect(() => {
    if (demo?.enabled) {
      const count = demo.cardCount
      if (count <= DEMO_PROJECTS.length) {
        setProjects(DEMO_PROJECTS.slice(0, count))
      } else {
        // Duplicate demo projects to reach requested count
        const expanded: ProjectInfo[] = []
        for (let i = 0; i < count; i++) {
          const src = DEMO_PROJECTS[i % DEMO_PROJECTS.length]
          expanded.push(i < DEMO_PROJECTS.length ? src : {
            ...src,
            name: `${src.name} ${Math.floor(i / DEMO_PROJECTS.length) + 1}`,
            path: `${src.path}-dup-${i}`,
          })
        }
        setProjects(expanded)
      }
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
  // B25 FIX: Compare new sessions with current to avoid unnecessary re-renders.
  // Without this, setExternalSessions triggers a full component tree re-render every 10s
  // (including all ScreenPanel instances), which increases GC pressure from stale closures.
  const externalSessionsRef = useRef(externalSessions)
  externalSessionsRef.current = externalSessions
  useEffect(() => {
    if (demo?.enabled) return // No real sessions to detect in demo
    if (!window.api.detectExternalSessions) return
    let cancelled = false
    const poll = () => {
      window.api.detectExternalSessions().then((sessions) => {
        if (cancelled) return
        // Only update state if the session list actually changed (avoid re-render churn)
        const prev = externalSessionsRef.current
        const changed = sessions.length !== prev.length ||
          sessions.some((s, i) => s.pid !== prev[i]?.pid || s.projectPath !== prev[i]?.projectPath)
        if (changed) setExternalSessions(sessions)
      }).catch(() => {})
    }
    poll() // Initial check
    const interval = setInterval(poll, 10_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [demo?.enabled])

  // Filter out hidden projects first, then apply search
  // In demo mode, skip the hidden filter — demo projects are synthetic
  const visibleProjects = useMemo(
    () => demo?.enabled ? projects : projects.filter((p) => !isHidden(p.path)),
    [projects, isHidden, demo?.enabled],
  )

  const filteredUnsorted = search
    ? visibleProjects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.path.toLowerCase().includes(search.toLowerCase()) ||
        p.stack.toLowerCase().includes(search.toLowerCase())
      )
    : visibleProjects

  // Sort all visible projects by group/favorite/lastModified (no search filter applied).
  // Used by PBR renderer which handles search-aware positioning internally.
  const allSorted = useMemo(() => {
    if (demo?.enabled) return visibleProjects
    if (groups.length === 0) {
      return [...visibleProjects].sort((a, b) => {
        const fa = isFavorite(a.path) ? 0 : 1
        const fb = isFavorite(b.path) ? 0 : 1
        if (fa !== fb) return fa - fb
        return (b.lastModified || 0) - (a.lastModified || 0)
      })
    }
    const groupIdToOrder = new Map(groups.map((g, i) => [g.id, i]))
    return [...visibleProjects].sort((a, b) => {
      const ga = assignments[a.path] ? (groupIdToOrder.get(assignments[a.path]) ?? 999) : 1000
      const gb = assignments[b.path] ? (groupIdToOrder.get(assignments[b.path]) ?? 999) : 1000
      if (ga !== gb) return ga - gb
      const fa = isFavorite(a.path) ? 0 : 1
      const fb = isFavorite(b.path) ? 0 : 1
      if (fa !== fb) return fa - fb
      return (b.lastModified || 0) - (a.lastModified || 0)
    })
  }, [visibleProjects, groups, assignments, isFavorite, demo?.enabled])

  // Sort by group (group order first, ungrouped last), then favorites first within group,
  // then by lastModified within each group.
  // In demo mode, skip group/favorite sorting — demo projects are synthetic.
  const filtered = useMemo(() => {
    if (demo?.enabled) return filteredUnsorted
    if (groups.length === 0) {
      // No groups — just float favorites to the top, then by lastModified
      return [...filteredUnsorted].sort((a, b) => {
        const fa = isFavorite(a.path) ? 0 : 1
        const fb = isFavorite(b.path) ? 0 : 1
        if (fa !== fb) return fa - fb
        return (b.lastModified || 0) - (a.lastModified || 0)
      })
    }
    const groupIdToOrder = new Map(groups.map((g, i) => [g.id, i]))
    return [...filteredUnsorted].sort((a, b) => {
      const ga = assignments[a.path] ? (groupIdToOrder.get(assignments[a.path]) ?? 999) : 1000
      const gb = assignments[b.path] ? (groupIdToOrder.get(assignments[b.path]) ?? 999) : 1000
      if (ga !== gb) return ga - gb
      // Within same group: favorites first, then by lastModified descending
      const fa = isFavorite(a.path) ? 0 : 1
      const fb = isFavorite(b.path) ? 0 : 1
      if (fa !== fb) return fa - fb
      return (b.lastModified || 0) - (a.lastModified || 0)
    })
  }, [filteredUnsorted, groups, assignments, isFavorite, demo?.enabled])

  // A project is "ready" if it has at least CLAUDE.md or .claude/ dir — batch files are optional
  const isFullySetup = (p: ProjectInfo) => p.configLevel ? p.configLevel !== 'bare' : (p.hasClaude || p.hasClaudeDir)
  const readyCount = visibleProjects.filter(isFullySetup).length

  // Layout positioning
  const layoutFn = LAYOUT_FNS[layoutId] || LAYOUT_FNS['dual-arc']
  const layoutCenter = getLayoutCenter(layoutId, dims.w, dims.h)
  const cardW = 220

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

  const showAbsorbToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setAbsorbToast({ message, type })
    if (absorbToastTimer.current) clearTimeout(absorbToastTimer.current)
    absorbToastTimer.current = setTimeout(() => setAbsorbToast(null), type === 'error' ? 5000 : 3000)
  }, [])

  const handleAbsorb = async (extSession: { pid: number; projectPath: string; projectName: string }, project: ProjectInfo) => {
    setAbsorbingPid(extSession.pid)
    try {
      const result = await window.api.absorbSession(extSession)
      if (result.success) {
        // Remove from external sessions immediately
        setExternalSessions((prev) => prev.filter((s) => s.pid !== extSession.pid))
        showAbsorbToast(`Session absorbed: ${project.name}`, 'success')
        // Open embedded terminal with --continue to pick up the conversation
        if (onOpenTerminal) onOpenTerminal(project.path, project.name, true)
      } else {
        showAbsorbToast(result.error || `Failed to absorb ${project.name}`, 'error')
      }
    } catch (err) {
      showAbsorbToast(`Absorption failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error')
    }
    setAbsorbingPid(null)
  }

  // ── Absorption overlay: toast notification + external session alert ──
  const renderAbsorptionOverlay = () => (
    <>
      {/* Toast notification (success/error/info) */}
      {absorbToast && (
        <div className={`hal-absorb-toast hal-absorb-toast--${absorbToast.type}`}>
          <span className="hal-absorb-toast-icon">
            {absorbToast.type === 'success' ? '\u2713' : absorbToast.type === 'error' ? '\u2717' : '\u2139'}
          </span>
          {absorbToast.message}
        </div>
      )}
      {/* External sessions detected — floating alert */}
      {externalSessions.length > 0 && !absorbingPid && (
        <div className="hal-external-alert">
          <span className="hal-external-alert-dot" />
          {externalSessions.length === 1
            ? `External session: ${externalSessions[0].projectName}`
            : `${externalSessions.length} external sessions detected`
          }
        </div>
      )}
    </>
  )

  const renderCard = (project: ProjectInfo, globalIndex: number) => {
    const ready = isFullySetup(project)
    const isBare = (project as any).configLevel === 'bare'
    const pos = layoutFn(globalIndex, { w: dims.w, h: dims.h, total: filtered.length, cardW })
    const isHovered = hovered === project.path
    const extSession = getExternalSession(project.path)
    const isAbsorbing = extSession && absorbingPid === extSession.pid

    const projGroup = getProjectGroup(project.path)

    return (
      <div
        key={project.path}
        className={`hal-arc-card ${isBare ? 'bare' : ready ? 'ready' : 'pending'} ${isHovered ? 'hovered' : ''} ${extSession ? 'has-external' : ''}`}
        style={{ left: pos.left, top: pos.top, transform: pos.transform, transition: 'left 0.5s, top 0.5s, transform 0.5s' }}
        onMouseEnter={() => setHovered(project.path)}
        onMouseLeave={() => setHovered(null)}
        onContextMenu={(e) => {
          {
            e.preventDefault()
            setCtxMenu({ x: e.clientX, y: e.clientY, projectPath: project.path, projectName: project.name, rulesOutdated: project.rulesOutdated })
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
          <span className={`hal-dot ${isBare ? 'dim' : ready ? 'green' : 'amber'}`} />
          <span className="hal-arc-name" title={project.name}>{project.name}</span>
          {isFavorite(project.path) && (
            <span className="favorite-star" title="Favorite">&#x2605;</span>
          )}
          {project.stack && <span className="hal-arc-stack">{project.stack}</span>}
          {extSession && <span className="hal-external-badge">EXT</span>}
          {project.rulesOutdated && (
            <span className="hal-update-badge" title="HAL-O rules update available — right-click to update">UPDATE</span>
          )}
        </div>
        {isHovered && (
          <div className="hal-arc-actions">
            {demo?.enabled ? (
              <span style={{ fontSize: 'calc(var(--hub-font, 10px) - 2px)', letterSpacing: 2, color: '#22d3ee', opacity: 0.6 }}>DEMO PROJECT</span>
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
    const bare = (project as any).configLevel === 'bare'
    const isActive = hovered === project.path

    const midX = (centerX + cardCenterX) / 2
    const midY = (centerY + cardCenterY) / 2
    const dx = cardCenterX - centerX
    const controlOffset = dx > 0 ? -30 : 30

    const dotColor = bare ? '#4a5568' : ready ? '#84cc16' : '#fbbf24'

    return (
      <g key={project.path}>
        <path
          d={`M ${centerX} ${centerY} Q ${midX + controlOffset} ${midY} ${cardCenterX} ${cardCenterY}`}
          fill="none"
          stroke={isActive ? dotColor : 'rgba(132,204,22,0.1)'}
          strokeWidth={isActive ? 1.5 : 0.5}
          strokeDasharray={isActive ? 'none' : '4,6'}
          style={{ transition: 'all 0.5s' }}
        />
        <circle
          cx={cardCenterX}
          cy={cardCenterY}
          r={isActive ? 5 : 3}
          fill={dotColor}
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
          projectCount={visibleProjects.length} readyCount={readyCount}
          hubFontSize={hubFontSize} termFontSize={termFontSize} wizardFontSize={wizardFontSize} onWizardFontSize={onWizardFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          particleDensity={particleDensity} onParticleDensityChange={onParticleDensityChange}
          renderQuality={renderQuality} onRenderQualityChange={onRenderQualityChange}
          camera={camera}
          rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
          shipVfxEnabled={shipVfxEnabled} onShipVfxEnabledChange={onShipVfxEnabledChange}
          sphereStyle={sphereStyle} onSphereStyleChange={onSphereStyleChange}
          voiceReactionIntensity={voiceReactionIntensity} onVoiceReactionIntensityChange={onVoiceReactionIntensityChange}
          personality={personality} onPersonalityChange={onPersonalityChange} onPersonalityPreset={onPersonalityPreset}
          groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
          demo={demo}
          hiddenPaths={hiddenPaths} onUnhide={unhideProject}
          onVoiceBlocked={handleVoiceBlocked}
          defaultIde={defaultIde as any} onDefaultIdeChange={onDefaultIdeChange as any}
        />
        {renderAbsorptionOverlay()}
      </div>
    )
  }

  // S5: Upgrade dialog (position:fixed overlay, rendered once)
  const upgradeDialog = upgradeTarget && (
    <UpgradeDialog
      projectPath={upgradeTarget.path}
      projectName={upgradeTarget.name}
      onClose={() => setUpgradeTarget(null)}
      onUpgradeComplete={refreshProjects}
    />
  )

  // PBR Holographic renderer — reference-quality 3D
  if (rendererId === 'pbr-holo') {
    return (
      <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub} style={{ '--hub-font': `${hubFontSize}px` } as React.CSSProperties}>
        <PbrHoloScene
          projects={allSorted}
          searchQuery={search}
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
          onCameraMove={onCameraMove}
          blockedInput={voiceBlocked}
          screenOpacity={screenOpacity}
          particleDensity={particleDensity}
          renderQuality={renderQuality}
          onProjectContextMenu={(x, y, path, name, rulesOutdated) => setCtxMenu({ x, y, projectPath: path, projectName: name, rulesOutdated })}
          isFavorite={isFavorite}
          showPerf={showPerf}
          onSceneReady={onSceneReady}
          shipVfxEnabled={shipVfxEnabled}
          sphereStyle={sphereStyle}
          voiceReactionIntensity={voiceReactionIntensity}
          externalSessions={externalSessions}
          absorbingPid={absorbingPid}
          onAbsorb={handleAbsorb}
          getIdeLabel={getIdeLabel}
          onOpenIde={handleOpenIde}
          onOpenIdeMenu={handleOpenIdeMenu}
          onOpenExternalTerminal={handleOpenExternalTerminal}
          cinematicActive={cinematicActive}
          onCinematicComplete={() => setCinematicActive(false)}
        />
        {!sceneDismissed && (
          <div className={`hal-scene-overlay${sceneReady ? ' faded' : ''}`}>
            <span className="hal-scene-overlay-text">INITIALIZING SYSTEMS...</span>
          </div>
        )}
        <HudTopbar
          search={search} onSearchChange={setSearch} onNewProject={onNewProject} onConvertProject={onConvertProject}
          voiceFocus={voiceFocus} halSessionId={halSessionId} onListeningChange={setIsListening}
          projectCount={visibleProjects.length} readyCount={readyCount}
          hubFontSize={hubFontSize} termFontSize={termFontSize} wizardFontSize={wizardFontSize} onWizardFontSize={onWizardFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          particleDensity={particleDensity} onParticleDensityChange={onParticleDensityChange}
          renderQuality={renderQuality} onRenderQualityChange={onRenderQualityChange}
          camera={camera}
          rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
          shipVfxEnabled={shipVfxEnabled} onShipVfxEnabledChange={onShipVfxEnabledChange}
          sphereStyle={sphereStyle} onSphereStyleChange={onSphereStyleChange}
          voiceReactionIntensity={voiceReactionIntensity} onVoiceReactionIntensityChange={onVoiceReactionIntensityChange}
          personality={personality} onPersonalityChange={onPersonalityChange} onPersonalityPreset={onPersonalityPreset}
          groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
          demo={demo}
          hiddenPaths={hiddenPaths} onUnhide={unhideProject}
          onVoiceBlocked={handleVoiceBlocked}
          defaultIde={defaultIde as any} onDefaultIdeChange={onDefaultIdeChange as any}
        />
        <div className="hal-center-label">{loading ? 'SCANNING...' : demo?.enabled ? 'DEMO MODE' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}</div>
        {renderAbsorptionOverlay()}
        {ctxMenu && (
          <ProjectContextMenu
            x={ctxMenu.x} y={ctxMenu.y}
            projectPath={ctxMenu.projectPath} projectName={ctxMenu.projectName}
            onHide={hideProject} onConfigure={onConvertProject} onUpgrade={handleUpgrade}
            rulesOutdated={ctxMenu.rulesOutdated}
            isFavorite={isFavorite(ctxMenu.projectPath)}
            onToggleFavorite={toggleFavorite}
            groups={groups} currentGroupId={assignments[ctxMenu.projectPath]}
            onAssignGroup={(groupId) => assignProject(ctxMenu.projectPath, groupId)}
            currentIdeId={getPerProjectIde(ctxMenu.projectPath)}
            onSetProjectIde={(ideId) => setPerProjectIde(ctxMenu.projectPath, ideId)}
            onClose={() => setCtxMenu(null)}
          />
        )}
        {upgradeDialog}
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
          screenOpacity={screenOpacity}
          renderQuality={renderQuality}
          showPerf={showPerf}
          onSceneReady={onSceneReady}
          getIdeLabel={getIdeLabel}
          onOpenIde={handleOpenIde}
          onOpenIdeMenu={handleOpenIdeMenu}
          onOpenExternalTerminal={handleOpenExternalTerminal}
        />
        {!sceneDismissed && (
          <div className={`hal-scene-overlay${sceneReady ? ' faded' : ''}`}>
            <span className="hal-scene-overlay-text">INITIALIZING SYSTEMS...</span>
          </div>
        )}

        <HudTopbar
          search={search} onSearchChange={setSearch} onNewProject={onNewProject} onConvertProject={onConvertProject}
          voiceFocus={voiceFocus} halSessionId={halSessionId} onListeningChange={setIsListening}
          projectCount={visibleProjects.length} readyCount={readyCount}
          hubFontSize={hubFontSize} termFontSize={termFontSize} wizardFontSize={wizardFontSize} onWizardFontSize={onWizardFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
          particleDensity={particleDensity} onParticleDensityChange={onParticleDensityChange}
          renderQuality={renderQuality} onRenderQualityChange={onRenderQualityChange}
          camera={camera}
          rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
          onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
          onCameraChange={onCameraChange} onCameraReset={onCameraReset}
          onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
          shipVfxEnabled={shipVfxEnabled} onShipVfxEnabledChange={onShipVfxEnabledChange}
          sphereStyle={sphereStyle} onSphereStyleChange={onSphereStyleChange}
          voiceReactionIntensity={voiceReactionIntensity} onVoiceReactionIntensityChange={onVoiceReactionIntensityChange}
          personality={personality} onPersonalityChange={onPersonalityChange} onPersonalityPreset={onPersonalityPreset}
          groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
          demo={demo}
          hiddenPaths={hiddenPaths} onUnhide={unhideProject}
          onVoiceBlocked={handleVoiceBlocked}
          defaultIde={defaultIde as any} onDefaultIdeChange={onDefaultIdeChange as any}
        />

        <div className="hal-center-label">{loading ? 'SCANNING...' : demo?.enabled ? 'DEMO MODE' : halSessionId ? 'ONLINE' : 'AWAITING CONNECTION'}</div>
        {renderAbsorptionOverlay()}
        {ctxMenu && (
          <ProjectContextMenu
            x={ctxMenu.x} y={ctxMenu.y}
            projectPath={ctxMenu.projectPath} projectName={ctxMenu.projectName}
            onHide={hideProject} onConfigure={onConvertProject} onUpgrade={handleUpgrade}
            rulesOutdated={ctxMenu.rulesOutdated}
            isFavorite={isFavorite(ctxMenu.projectPath)}
            onToggleFavorite={toggleFavorite}
            groups={groups} currentGroupId={assignments[ctxMenu.projectPath]}
            onAssignGroup={(groupId) => assignProject(ctxMenu.projectPath, groupId)}
            currentIdeId={getPerProjectIde(ctxMenu.projectPath)}
            onSetProjectIde={(ideId) => setPerProjectIde(ctxMenu.projectPath, ideId)}
            onClose={() => setCtxMenu(null)}
          />
        )}
        {upgradeDialog}
      </div>
    )
  }

  // Classic renderer — CSS cards + Three.js background
  return (
    <div className="hal-room" ref={containerRef} onClick={onVoiceFocusHub} style={{ '--hub-font': `${hubFontSize}px` } as React.CSSProperties}>
      <SceneRoot projectCount={visibleProjects.length} listening={isListening && voiceFocus === 'hub'} showPerf={showPerf} onSceneReady={onSceneReady} renderQuality={renderQuality} />
      {!sceneDismissed && (
        <div className={`hal-scene-overlay${sceneReady ? ' faded' : ''}`}>
          <span className="hal-scene-overlay-text">INITIALIZING SYSTEMS...</span>
        </div>
      )}

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
        hubFontSize={hubFontSize} termFontSize={termFontSize} wizardFontSize={wizardFontSize} onWizardFontSize={onWizardFontSize} voiceOut={voiceOut} voiceProfile={voiceProfile} dockPosition={dockPosition} screenOpacity={screenOpacity}
        particleDensity={particleDensity} onParticleDensityChange={onParticleDensityChange}
        renderQuality={renderQuality} onRenderQualityChange={onRenderQualityChange}
        camera={camera}
        rendererId={rendererId} layoutId={layoutId} threeTheme={threeTheme}
        onHubFontSize={onHubFontSize} onTermFontSize={onTermFontSize} onVoiceOut={onVoiceOut} onVoiceProfileChange={onVoiceProfileChange} onDockPositionChange={onDockPositionChange} onScreenOpacityChange={onScreenOpacityChange}
        onCameraChange={onCameraChange} onCameraReset={onCameraReset}
        onRendererChange={onRendererChange} onLayoutChange={onLayoutChange} onThreeThemeChange={onThreeThemeChange}
        shipVfxEnabled={shipVfxEnabled} onShipVfxEnabledChange={onShipVfxEnabledChange}
        voiceReactionIntensity={voiceReactionIntensity} onVoiceReactionIntensityChange={onVoiceReactionIntensityChange}
        personality={personality} onPersonalityChange={onPersonalityChange} onPersonalityPreset={onPersonalityPreset}
        groups={groups} onCreateGroup={createGroup} onDeleteGroup={deleteGroup} onRenameGroup={renameGroup} onReorderGroups={reorderGroups} onApplyPreset={applyPreset}
        demo={demo}
        onVoiceBlocked={handleVoiceBlocked}
        defaultIde={defaultIde as any} onDefaultIdeChange={onDefaultIdeChange as any}
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

      {renderAbsorptionOverlay()}

      {/* Right-click project context menu */}
      {ctxMenu && (
        <ProjectContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          projectPath={ctxMenu.projectPath}
          projectName={ctxMenu.projectName}
          onHide={hideProject}
          onConfigure={onConvertProject}
          onUpgrade={handleUpgrade}
          rulesOutdated={ctxMenu.rulesOutdated}
          isFavorite={isFavorite(ctxMenu.projectPath)}
          onToggleFavorite={toggleFavorite}
          groups={groups}
          currentGroupId={assignments[ctxMenu.projectPath]}
          onAssignGroup={(groupId) => assignProject(ctxMenu.projectPath, groupId)}
          currentIdeId={getPerProjectIde(ctxMenu.projectPath)}
          onSetProjectIde={(ideId) => setPerProjectIde(ctxMenu.projectPath, ideId)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {upgradeDialog}

      {/* HUD corners */}
      <div className="hal-hud-corner tl" />
      <div className="hal-hud-corner tr" />
      <div className="hal-hud-corner bl" />
      <div className="hal-hud-corner br" />
    </div>
  )
}
