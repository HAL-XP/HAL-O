import { useState, useEffect } from 'react'
import type { ProjectInfo } from '../types'
import { useI18n } from '../i18n'
import { Logo } from './Logo'

interface Props {
  onNewProject: () => void
  onConvertProject: (path: string) => void
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

  return (
    <div className="hub">
      {/* Header */}
      <div className="hub-header">
        <div className="hub-title-row">
          <Logo size={28} />
          <h1 className="hub-title">Claudeborn</h1>
        </div>
        <span className="hub-count">
          {projects.length > 0 ? `${projects.length} projects` : ''}
        </span>
      </div>

      {/* Search */}
      {projects.length > 3 && (
        <input
          className="hub-search"
          placeholder={t('hub.search') !== 'hub.search' ? t('hub.search') : 'Search projects...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="hub-empty">
          <div className="analysis-spinner" />
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="hub-empty">
          <p className="hub-empty-text">
            {t('hub.noProjects') !== 'hub.noProjects'
              ? t('hub.noProjects')
              : 'No projects found. Create your first one!'}
          </p>
        </div>
      )}

      {/* Project list */}
      <div className="hub-grid">
        {filtered.map((project) => (
          <div key={project.path} className="hub-card">
            <div className="hub-card-header">
              <span className="hub-card-name">{project.name}</span>
              {isFullySetup(project) ? (
                <span className="hub-badge ok" title="Fully configured">&#10003;</span>
              ) : (
                <span className="hub-badge warn" title="Missing setup files">&#9888;</span>
              )}
            </div>
            <span className="hub-card-path" title={project.path}>{project.path}</span>
            {project.stack && (
              <span className="hub-card-stack">{project.stack}</span>
            )}
            <div className="hub-card-actions">
              <button className="hub-btn primary" onClick={() => window.api.launchProject(project.path, false)}>
                &#9654; {t('hub.newSession') !== 'hub.newSession' ? t('hub.newSession') : 'New'}
              </button>
              <button className="hub-btn" onClick={() => window.api.launchProject(project.path, true)}>
                &#8635; {t('hub.resume') !== 'hub.resume' ? t('hub.resume') : 'Resume'}
              </button>
              <button className="hub-btn" onClick={() => window.api.openFolder(project.path)}>
                &#128193; {t('hub.openFolder') !== 'hub.openFolder' ? t('hub.openFolder') : 'Open'}
              </button>
              {!isFullySetup(project) && (
                <button className="hub-btn convert" onClick={() => onConvertProject(project.path)}>
                  {t('hub.convert') !== 'hub.convert' ? t('hub.convert') : 'Upgrade'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="hub-footer">
        <button className="create-btn" onClick={onNewProject}>
          + {t('hub.newProject') !== 'hub.newProject' ? t('hub.newProject') : 'New Project'}
        </button>
        <button className="hub-btn" onClick={async () => {
          const folder = await window.api.selectFolder()
          if (folder) onConvertProject(folder)
        }}>
          + {t('hub.addExisting') !== 'hub.addExisting' ? t('hub.addExisting') : 'Add Existing Folder'}
        </button>
      </div>
    </div>
  )
}
