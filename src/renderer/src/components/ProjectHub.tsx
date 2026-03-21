import { useState, useEffect } from 'react'
import type { ProjectInfo } from '../types'
import { useI18n } from '../i18n'
import { HalEye } from './HalEye'

interface Props {
  onNewProject: () => void
  onConvertProject: (path: string) => void
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

export function ProjectHub({ onNewProject, onConvertProject }: Props) {
  const { t } = useI18n()
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.api.scanProjects().then((p) => {
      setProjects(p)
      setLoading(false)
    }).catch(() => setLoading(false))
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

  return (
    <div className="hal-room">
      {/* Ambient grid */}
      <div className="hal-grid-bg" />

      {/* Top HUD bar */}
      <div className="hal-topbar">
        <div className="hal-topbar-left">
          <span className="hal-sys-label">SYS://CLAUDEBORN</span>
          <span className="hal-sys-ver">v1.0</span>
        </div>
        <div className="hal-topbar-right">
          <span className="hal-stat"><span className="hal-stat-n">{projects.length}</span> OPS</span>
          <span className="hal-stat"><span className="hal-stat-n hal-c-ok">{readyCount}</span> READY</span>
          <span className="hal-stat"><span className="hal-stat-n hal-c-warn">{projects.length - readyCount}</span> PENDING</span>
        </div>
      </div>

      {/* Center: HAL eye + status */}
      <div className="hal-center">
        <HalEye size={140} pulseSpeed={1} agentCount={projects.length} />
        <div className="hal-center-label">
          {loading ? 'SCANNING...' : projects.length === 0 ? 'AWAITING ORDERS' : 'OPERATIONAL'}
        </div>
      </div>

      {/* Search */}
      <div className="hal-search-wrap">
        <span className="hal-prompt">&gt;</span>
        <input
          className="hal-search"
          placeholder="SEARCH OPERATIONS..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Project list */}
      <div className="hal-ops-list">
        {loading && (
          <div className="hal-loading">SCANNING FIELD OPERATIONS...</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="hal-loading">NO OPERATIONS DETECTED — INITIATE FIRST DEPLOYMENT</div>
        )}

        {filtered.map((project) => {
          const ready = isFullySetup(project)
          return (
            <div key={project.path} className={`hal-op ${ready ? 'ready' : 'pending'}`}>
              <div className="hal-op-indicator">
                <span className={`hal-dot ${ready ? 'green' : 'amber'}`} />
              </div>
              <div className="hal-op-info">
                <div className="hal-op-top">
                  <span className="hal-op-name">{project.name}</span>
                  {project.stack && <span className="hal-op-stack">{project.stack}</span>}
                  <span className="hal-op-time">{timeAgo(project.lastModified)}</span>
                </div>
                <div className="hal-op-path">{project.path}</div>
                <div className="hal-op-tags">
                  <span className={`hal-tag ${project.hasClaude ? 'on' : ''}`}>CLAUDE.md</span>
                  <span className={`hal-tag ${project.hasClaudeDir ? 'on' : ''}`}>.claude</span>
                  <span className={`hal-tag ${project.hasBatchFiles ? 'on' : ''}`}>SCRIPTS</span>
                </div>
              </div>
              <div className="hal-op-actions">
                <button className="hal-btn deploy" onClick={() => window.api.launchProject(project.path, false)}>
                  DEPLOY
                </button>
                <button className="hal-btn" onClick={() => window.api.launchProject(project.path, true)}>
                  RESUME
                </button>
                <button className="hal-btn" onClick={() => window.api.openFolder(project.path)}>
                  FILES
                </button>
                {!ready && (
                  <button className="hal-btn upgrade" onClick={() => onConvertProject(project.path)}>
                    UPGRADE
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Command bar */}
      <div className="hal-cmdbar">
        <button className="hal-cmd deploy" onClick={onNewProject}>
          + NEW OPERATION
        </button>
        <button className="hal-cmd" onClick={async () => {
          const folder = await window.api.selectFolder()
          if (folder) onConvertProject(folder)
        }}>
          + RECRUIT EXISTING
        </button>
      </div>
    </div>
  )
}
