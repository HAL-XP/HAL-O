import { useState, useEffect } from 'react'
import type { ProjectInfo } from '../types'

interface ProjectStats {
  lastCommit: string
  lastCommitTime: number
  commitCount30d: number
  fileCount: number
}

interface Props {
  projects: ProjectInfo[]
  isFullySetup: (p: ProjectInfo) => boolean
  onOpenTerminal?: (projectPath: string, projectName: string, resume: boolean) => void
}

const CYAN = '#00d4ff'

function timeAgo(epoch: number): string {
  if (!epoch) return ''
  const diff = Date.now() - epoch
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function activityBars(commitCount: number): number[] {
  const intensity = Math.min(commitCount / 50, 1)
  return Array.from({ length: 7 }, (_, i) => {
    const base = intensity * (0.4 + 0.6 * Math.sin((i + 1) * 1.3 + commitCount * 0.7))
    return Math.max(0.08, Math.min(1, base))
  })
}

function PreviewCard({ project, ready, onOpenTerminal }: {
  project: ProjectInfo
  ready: boolean
  onOpenTerminal?: (projectPath: string, projectName: string, resume: boolean) => void
}) {
  const [stats, setStats] = useState<ProjectStats | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.getProjectStats(project.path).then((s) => {
      if (!cancelled) setStats(s)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [project.path])

  return (
    <div className="preview-grid-card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: ready ? '#4ade80' : '#fbbf24',
          boxShadow: `0 0 8px ${ready ? '#4ade80' : '#fbbf24'}`,
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{
          fontWeight: 700, letterSpacing: '1.5px', fontSize: 13,
          textTransform: 'uppercase', color: '#c8dce8',
        }}>
          {project.name}
        </span>
      </div>

      {/* Stack badge */}
      {project.stack && (
        <div style={{ marginBottom: 8 }}>
          <span style={{
            fontSize: 10, color: CYAN,
            background: 'rgba(0,212,255,0.1)',
            padding: '3px 8px', borderRadius: 3,
            letterSpacing: '1px', border: '1px solid rgba(0,212,255,0.2)',
          }}>
            {project.stack}
          </span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ marginBottom: 8, fontSize: 10, lineHeight: '1.6' }}>
          {stats.lastCommit && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, color: '#6b7a8d' }}>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 200, color: '#8b9bb0',
              }} title={stats.lastCommit}>
                {stats.lastCommit.length > 40 ? stats.lastCommit.slice(0, 38) + '..' : stats.lastCommit}
              </span>
              <span style={{ flexShrink: 0, color: '#4a5568', fontSize: 9 }}>
                {timeAgo(stats.lastCommitTime)}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }} title={`${stats.commitCount30d} commits (30d)`}>
              {activityBars(stats.commitCount30d).map((v, i) => (
                <div key={i} style={{
                  width: 4,
                  height: `${Math.max(3, v * 14)}px`,
                  borderRadius: 1,
                  background: v > 0.6
                    ? `rgba(0, 212, 255, ${0.4 + v * 0.5})`
                    : `rgba(100, 130, 160, ${0.2 + v * 0.4})`,
                }} />
              ))}
              <span style={{ fontSize: 9, color: '#4a5568', marginLeft: 4 }}>
                {stats.commitCount30d > 0 ? `${stats.commitCount30d}` : '0'}
              </span>
            </div>

            {stats.fileCount > 0 && (
              <span style={{
                fontSize: 9, color: '#4a5568',
                background: 'rgba(255,255,255,0.04)',
                padding: '2px 6px', borderRadius: 3,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {stats.fileCount} files
              </span>
            )}
          </div>
        </div>
      )}

      {/* Path */}
      <div style={{
        fontSize: 9, color: '#4a5568', marginBottom: 8,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={project.path}>
        {project.path}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onOpenTerminal?.(project.path, project.name, true)} style={btnPrimary}>RESUME</button>
        <button onClick={() => onOpenTerminal?.(project.path, project.name, false)} style={btnGhost}>NEW</button>
        {project.runCmd && (
          <button onClick={() => window.api.runApp(project.path, project.runCmd)} style={{ ...btnGhost, color: '#22d3ee', borderColor: 'rgba(34,211,238,0.3)' }}>RUN</button>
        )}
        <button onClick={() => window.api.openFolder(project.path)} style={btnGhost}>FILES</button>
      </div>
    </div>
  )
}

export function PreviewGrid({ projects, isFullySetup, onOpenTerminal }: Props) {
  return (
    <div className="preview-grid-container">
      <div className="preview-grid-header">
        <span style={{ letterSpacing: 3, fontSize: 11, color: '#00d4ff' }}>2D PREVIEW MODE</span>
        <span style={{ fontSize: 10, color: '#4a5568' }}>{projects.length} projects</span>
      </div>
      <div className="preview-grid">
        {projects.map((p) => (
          <PreviewCard
            key={p.path}
            project={p}
            ready={isFullySetup(p)}
            onOpenTerminal={onOpenTerminal}
          />
        ))}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '4px 10px', background: CYAN, border: `1px solid ${CYAN}`,
  color: '#000', fontSize: 9, fontWeight: 700, letterSpacing: '1.5px',
  cursor: 'pointer', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  textTransform: 'uppercase', borderRadius: 2,
}

const btnGhost: React.CSSProperties = {
  padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
  color: '#8b8fa3', fontSize: 9, fontWeight: 700, letterSpacing: '1.5px',
  cursor: 'pointer', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  textTransform: 'uppercase', borderRadius: 2,
}
