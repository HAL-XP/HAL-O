import { useState, useEffect, useCallback } from 'react'

interface Props {
  selected: string[]
  onSelectionChange: (paths: string[]) => void
}

interface ScannedProject {
  name: string
  path: string
  stack: string
  hasClaude: boolean
}

export function Step4Projects({ selected, onSelectionChange }: Props) {
  const [scanning, setScanning] = useState(false)
  const [projects, setProjects] = useState<ScannedProject[]>([])
  const [scanned, setScanned] = useState(false)
  const [addingManual, setAddingManual] = useState(false)

  // Auto-scan on mount
  useEffect(() => {
    handleScan()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = useCallback(async () => {
    setScanning(true)
    try {
      const result = await window.api.scanProjects()
      const mapped: ScannedProject[] = result.map((p: any) => ({
        name: p.name,
        path: p.path,
        stack: p.stack || 'Unknown',
        hasClaude: p.hasClaude || false,
      }))
      setProjects(mapped)
      // Auto-select all by default
      if (selected.length === 0 && mapped.length > 0) {
        onSelectionChange(mapped.map(p => p.path))
      }
    } catch {
      setProjects([])
    }
    setScanning(false)
    setScanned(true)
  }, [selected.length, onSelectionChange])

  const toggleProject = useCallback((path: string) => {
    const next = selected.includes(path)
      ? selected.filter(p => p !== path)
      : [...selected, path]
    onSelectionChange(next)
  }, [selected, onSelectionChange])

  const selectAll = useCallback(() => {
    onSelectionChange(projects.map(p => p.path))
  }, [projects, onSelectionChange])

  const selectNone = useCallback(() => {
    onSelectionChange([])
  }, [onSelectionChange])

  const handleAddFolder = useCallback(async () => {
    setAddingManual(true)
    try {
      const folder = await window.api.selectFolder()
      if (folder) {
        // Add it as a project
        const name = folder.split(/[/\\]/).filter(Boolean).pop() || 'project'
        setProjects(prev => {
          // Avoid duplicates
          if (prev.some(p => p.path === folder)) return prev
          return [...prev, { name, path: folder, stack: 'Custom', hasClaude: false }]
        })
        if (!selected.includes(folder)) {
          onSelectionChange([...selected, folder])
        }
      }
    } catch { /* cancelled */ }
    setAddingManual(false)
  }, [selected, onSelectionChange])

  return (
    <div style={styles.wrapper}>
      <h2 style={styles.heading}>Import Projects</h2>
      <p style={styles.subheading}>
        We scanned common locations for existing projects.
      </p>
      <p style={styles.changeLater}>You can add or remove projects at any time from the main hub.</p>

      {scanning && (
        <div style={styles.scanningRow}>
          <div style={styles.spinner} />
          <span>Scanning for projects...</span>
        </div>
      )}

      {scanned && projects.length === 0 && !scanning && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No projects found in common locations.</p>
          <p style={styles.emptyHint}>
            You can add folders manually, or use demo projects to explore HAL-O.
          </p>
        </div>
      )}

      {projects.length > 0 && (
        <>
          <div style={styles.actionBar}>
            <span style={styles.countLabel}>
              {selected.length} of {projects.length} selected
            </span>
            <button onClick={selectAll} style={styles.linkBtn}>Select All</button>
            <button onClick={selectNone} style={styles.linkBtn}>Select None</button>
          </div>

          <div style={styles.list}>
            {projects.map((p) => {
              const isSelected = selected.includes(p.path)
              return (
                <button
                  key={p.path}
                  onClick={() => toggleProject(p.path)}
                  style={{
                    ...styles.projectRow,
                    ...(isSelected ? styles.projectRowSelected : {}),
                  }}
                >
                  <div style={{
                    ...styles.checkbox,
                    ...(isSelected ? styles.checkboxChecked : {}),
                  }}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div style={styles.projectInfo}>
                    <span style={styles.projectName}>{p.name}</span>
                    <span style={styles.projectPath}>{p.path}</span>
                  </div>
                  <span style={styles.projectStack}>{p.stack}</span>
                  {p.hasClaude && (
                    <span style={styles.claudeBadge}>Claude</span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div style={styles.bottomActions}>
        <button
          onClick={handleAddFolder}
          disabled={addingManual}
          style={styles.addBtn}
        >
          + Add Folder
        </button>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={styles.rescanBtn}
        >
          Rescan
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 24,
    maxWidth: 640,
    margin: '0 auto',
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 6,
    color: 'var(--text)',
    textAlign: 'center' as const,
  },
  subheading: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    textAlign: 'center' as const,
  },
  changeLater: {
    fontSize: 12,
    color: 'var(--text-dim)',
    marginBottom: 16,
    fontStyle: 'italic',
    textAlign: 'center' as const,
  },
  scanningRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  spinner: {
    width: 18,
    height: 18,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '32px 24px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
  },
  emptyText: {
    fontSize: 15,
    color: 'var(--text)',
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 13,
    color: 'var(--text-dim)',
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  countLabel: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    flex: 1,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '2px 4px',
    textDecoration: 'underline',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 320,
    overflowY: 'auto' as const,
    paddingRight: 4,
  },
  projectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textAlign: 'left' as const,
    outline: 'none',
  },
  projectRowSelected: {
    borderColor: 'var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 5%, var(--bg-surface))',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    border: '2px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  checkboxChecked: {
    background: 'var(--primary)',
    borderColor: 'var(--primary)',
  },
  projectInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  projectName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  projectPath: {
    fontSize: 11,
    color: 'var(--text-dim)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  projectStack: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    padding: '2px 8px',
    borderRadius: 10,
    background: 'var(--bg-input)',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  claudeBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 8,
    background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
    color: 'var(--primary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    flexShrink: 0,
  },
  bottomActions: {
    display: 'flex',
    gap: 8,
    marginTop: 16,
    justifyContent: 'center',
  },
  addBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  rescanBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
  },
}
