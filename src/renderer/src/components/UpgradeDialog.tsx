// ── S5: Upgrade Dialog ──
// Full-screen dialog for previewing and applying HAL-O rule upgrades.
// Shows section-by-section diff, lets user accept/reject per section,
// and provides rollback capability.

import { useState, useEffect, useRef, useCallback } from 'react'
import type { UpgradePreview, UpgradeSection, UpgradeDiffLine, UpgradeResult, UpgradeBackupEntry } from '../types'

interface Props {
  projectPath: string
  projectName: string
  onClose: () => void
  /** Called after successful upgrade to refresh project list */
  onUpgradeComplete?: () => void
}

type Phase = 'loading' | 'preview' | 'applying' | 'done' | 'error' | 'rollback-list'

export function UpgradeDialog({ projectPath, projectName, onClose, onUpgradeComplete }: Props) {
  // ── All hooks BEFORE any conditional return ──
  const [phase, setPhase] = useState<Phase>('loading')
  const [preview, setPreview] = useState<UpgradePreview | null>(null)
  const [error, setError] = useState<string>('')
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<UpgradeResult | null>(null)
  const [backups, setBackups] = useState<UpgradeBackupEntry[]>([])
  const [rollingBack, setRollingBack] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Load the upgrade preview
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await window.api.previewUpgrade(projectPath)
        if (cancelled) return

        if (!res.success || !res.preview) {
          setError(res.error || 'Failed to generate upgrade preview')
          setPhase('error')
          return
        }

        setPreview(res.preview)

        // Auto-select all changed sections that don't have user customizations
        const autoSelected = new Set<string>()
        for (const section of res.preview.sections) {
          if (section.hasChanges) {
            autoSelected.add(section.id)
          }
        }
        setSelectedSections(autoSelected)

        // Auto-expand first changed section
        const firstChanged = res.preview.sections.find(s => s.hasChanges)
        if (firstChanged) {
          setExpandedSections(new Set([firstChanged.id]))
          setActiveSectionId(firstChanged.id)
        }

        setPhase('preview')
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Unknown error')
          setPhase('error')
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [projectPath])

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [result?.log])

  const toggleSection = useCallback((id: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setActiveSectionId(id)
  }, [])

  const selectAll = useCallback(() => {
    if (!preview) return
    const all = new Set(preview.sections.filter(s => s.hasChanges).map(s => s.id))
    setSelectedSections(all)
  }, [preview])

  const selectNone = useCallback(() => {
    setSelectedSections(new Set())
  }, [])

  const handleApply = useCallback(async () => {
    if (!preview || selectedSections.size === 0) return

    setPhase('applying')
    try {
      const res = await window.api.applyUpgrade(projectPath, Array.from(selectedSections))
      setResult(res)
      setPhase('done')
      if (res.success && onUpgradeComplete) {
        onUpgradeComplete()
      }
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }, [preview, selectedSections, projectPath, onUpgradeComplete])

  const handleShowBackups = useCallback(async () => {
    try {
      const list = await window.api.listUpgradeBackups(projectPath)
      setBackups(list)
      setPhase('rollback-list')
    } catch (e: any) {
      setError(`Failed to list backups: ${e.message}`)
    }
  }, [projectPath])

  const handleRollback = useCallback(async (backupPath: string) => {
    setRollingBack(true)
    try {
      const res = await window.api.rollbackUpgrade(projectPath, backupPath)
      if (res.success) {
        setResult({
          success: true,
          log: [...res.log, '', '[OK] Rollback complete. Project restored to previous state.'],
          backupPath: '',
          upgradedSections: [],
          skippedSections: [],
        })
        setPhase('done')
        if (onUpgradeComplete) onUpgradeComplete()
      } else {
        setError(`Rollback failed: ${res.log.join('\n')}`)
        setPhase('error')
      }
    } catch (e: any) {
      setError(`Rollback error: ${e.message}`)
      setPhase('error')
    } finally {
      setRollingBack(false)
    }
  }, [projectPath, onUpgradeComplete])

  // ── Styles ──
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-hub, "JetBrains Mono", monospace)',
  }

  const dialogStyle: React.CSSProperties = {
    width: '90vw', maxWidth: '960px',
    maxHeight: '85vh',
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(10, 15, 30, 0.98))',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '12px',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 0 40px rgba(0, 255, 255, 0.1), inset 0 0 20px rgba(0, 255, 255, 0.02)',
  }

  const headerStyle: React.CSSProperties = {
    padding: '20px 24px 16px',
    borderBottom: '1px solid rgba(0, 255, 255, 0.1)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1, overflow: 'auto', padding: '16px 24px',
  }

  const footerStyle: React.CSSProperties = {
    padding: '12px 24px',
    borderTop: '1px solid rgba(0, 255, 255, 0.1)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: '12px',
  }

  const btnStyle = (variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'secondary'): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: '6px',
    border: variant === 'primary' ? '1px solid rgba(0, 255, 255, 0.5)' :
            variant === 'danger' ? '1px solid rgba(255, 100, 100, 0.5)' :
            variant === 'ghost' ? '1px solid transparent' :
            '1px solid rgba(255, 255, 255, 0.15)',
    background: variant === 'primary' ? 'rgba(0, 255, 255, 0.15)' :
                variant === 'danger' ? 'rgba(255, 100, 100, 0.1)' :
                'rgba(255, 255, 255, 0.05)',
    color: variant === 'primary' ? '#00ffff' :
           variant === 'danger' ? '#ff6464' :
           'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'inherit',
    letterSpacing: '0.3px',
    transition: 'all 0.15s',
  })

  // ── Render phases ──

  if (phase === 'loading') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...dialogStyle, padding: '48px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: '14px', color: 'rgba(0, 255, 255, 0.7)', marginBottom: '12px' }}>
            Analyzing upgrade...
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)' }}>
            Comparing current files with latest HAL-O templates
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...dialogStyle, padding: '48px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: '16px', color: '#ff6464', marginBottom: '12px' }}>
            Upgrade Error
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', whiteSpace: 'pre-wrap', marginBottom: '24px' }}>
            {error}
          </div>
          <button style={btnStyle('secondary')} onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  if (phase === 'applying') {
    return (
      <div style={overlayStyle}>
        <div style={{ ...dialogStyle, padding: '48px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: '14px', color: '#00ffff', marginBottom: '12px' }}>
            Applying upgrade...
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)' }}>
            Backing up files and writing new versions
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...dialogStyle, maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
          <div style={headerStyle}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', color: result.success ? '#00ffff' : '#ff6464' }}>
                {result.success ? 'Upgrade Complete' : 'Upgrade Failed'}
              </h2>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '4px' }}>
                {result.upgradedSections.length} sections updated, {result.skippedSections.length} skipped
              </div>
            </div>
          </div>
          <div style={{ ...bodyStyle, maxHeight: '50vh' }}>
            <div style={{
              fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6',
              whiteSpace: 'pre-wrap', color: 'rgba(255, 255, 255, 0.6)',
            }}>
              {result.log.map((line, i) => (
                <div key={i} style={{
                  color: line.startsWith('[OK]') ? '#4ade80' :
                         line.startsWith('[ERROR]') ? '#ff6464' :
                         line.startsWith('[SKIP]') ? '#fb923c' :
                         line.startsWith('[RESTORED]') ? '#60a5fa' :
                         'rgba(255, 255, 255, 0.5)',
                }}>
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
          <div style={footerStyle}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {result.backupPath && (
                <button style={btnStyle('ghost')} onClick={handleShowBackups}>
                  View Backups
                </button>
              )}
            </div>
            <button style={btnStyle('primary')} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'rollback-list') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...dialogStyle, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
          <div style={headerStyle}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#fb923c' }}>
                Rollback to Backup
              </h2>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '4px' }}>
                Select a backup to restore. This will overwrite current files.
              </div>
            </div>
          </div>
          <div style={bodyStyle}>
            {backups.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', padding: '32px' }}>
                No backups found
              </div>
            ) : (
              backups.map((backup, i) => (
                <div key={i} style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>
                      {backup.timestamp}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '2px' }}>
                      Rules v{backup.rulesVersionBefore} | {backup.fileCount} files backed up
                    </div>
                  </div>
                  <button
                    style={btnStyle('danger')}
                    onClick={() => handleRollback(backup.path)}
                    disabled={rollingBack}
                  >
                    {rollingBack ? 'Rolling back...' : 'Restore'}
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={footerStyle}>
            <button style={btnStyle('secondary')} onClick={() => setPhase('preview')}>
              Back to Preview
            </button>
            <button style={btnStyle('ghost')} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Preview Phase (main UI) ──
  if (!preview) return null

  const changedSections = preview.sections.filter(s => s.hasChanges)
  const unchangedSections = preview.sections.filter(s => !s.hasChanges)

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#00ffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>&#x2191;</span>
              Upgrade Available
            </h2>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '6px' }}>
              <strong>{projectName}</strong>
              {' '}&mdash;{' '}
              Rules v{preview.currentVersion} &rarr; v{preview.targetVersion}
              {preview.currentAppVersion !== preview.targetAppVersion && (
                <span> | HAL-O {preview.currentAppVersion} &rarr; {preview.targetAppVersion}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.4)',
              cursor: 'pointer', fontSize: '18px', padding: '4px 8px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Changelog */}
          {preview.changelog.length > 0 && (
            <div style={{
              marginBottom: '16px', padding: '12px 16px',
              background: 'rgba(0, 255, 255, 0.04)',
              border: '1px solid rgba(0, 255, 255, 0.1)',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '12px', color: '#00ffff', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.5px' }}>
                CHANGELOG
              </div>
              {preview.changelog.map((entry, i) => (
                <div key={i} style={{
                  fontSize: '12px',
                  color: entry.startsWith('---') ? 'rgba(0, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.6)',
                  fontWeight: entry.startsWith('---') ? 600 : 400,
                  marginTop: entry.startsWith('---') ? '8px' : '2px',
                  paddingLeft: entry.startsWith('---') ? 0 : '12px',
                }}>
                  {entry.startsWith('---') ? entry : `\u2022 ${entry}`}
                </div>
              ))}
            </div>
          )}

          {/* Section selection controls */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
              {changedSections.length} section{changedSections.length !== 1 ? 's' : ''} with changes
              {selectedSections.size > 0 && (
                <span style={{ color: '#00ffff' }}> ({selectedSections.size} selected)</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={btnStyle('ghost')} onClick={selectAll}>Select All</button>
              <button style={btnStyle('ghost')} onClick={selectNone}>Select None</button>
            </div>
          </div>

          {/* Changed sections */}
          {changedSections.map(section => (
            <SectionCard
              key={section.id}
              section={section}
              selected={selectedSections.has(section.id)}
              expanded={expandedSections.has(section.id)}
              active={activeSectionId === section.id}
              onToggleSelect={() => toggleSection(section.id)}
              onToggleExpand={() => toggleExpand(section.id)}
            />
          ))}

          {/* Unchanged sections (collapsed) */}
          {unchangedSections.length > 0 && (
            <div style={{
              marginTop: '16px', padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '8px',
            }}>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.3)' }}>
                {unchangedSections.length} section{unchangedSections.length !== 1 ? 's' : ''} unchanged:{' '}
                {unchangedSections.map(s => s.label).join(', ')}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {preview.hasExistingBackup && (
              <button style={btnStyle('ghost')} onClick={handleShowBackups}>
                Rollback History
              </button>
            )}
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)' }}>
              Backup created before every upgrade
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={btnStyle('secondary')} onClick={onClose}>
              Cancel
            </button>
            <button
              style={{
                ...btnStyle('primary'),
                opacity: selectedSections.size === 0 ? 0.4 : 1,
                pointerEvents: selectedSections.size === 0 ? 'none' : 'auto',
              }}
              onClick={handleApply}
              disabled={selectedSections.size === 0}
            >
              Apply {selectedSections.size} Update{selectedSections.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section Card ──

function SectionCard({ section, selected, expanded, active, onToggleSelect, onToggleExpand }: {
  section: UpgradeSection
  selected: boolean
  expanded: boolean
  active: boolean
  onToggleSelect: () => void
  onToggleExpand: () => void
}) {
  const borderColor = selected ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.06)'
  const bgColor = active ? 'rgba(0, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.02)'

  return (
    <div style={{
      marginBottom: '8px',
      border: `1px solid ${borderColor}`,
      borderRadius: '8px',
      background: bgColor,
      transition: 'all 0.15s',
    }}>
      {/* Section header */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
          cursor: 'pointer',
        }}
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect() }}
          style={{
            width: '18px', height: '18px',
            border: `1px solid ${selected ? '#00ffff' : 'rgba(255, 255, 255, 0.2)'}`,
            borderRadius: '3px',
            background: selected ? 'rgba(0, 255, 255, 0.2)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {selected && <span style={{ color: '#00ffff', fontSize: '12px', lineHeight: 1 }}>&#10003;</span>}
        </div>

        {/* Type badge */}
        <span style={{
          fontSize: '9px', letterSpacing: '0.8px', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: '3px',
          background: section.type === 'claude-md' ? 'rgba(96, 165, 250, 0.15)' :
                      section.type === 'rule' ? 'rgba(74, 222, 128, 0.15)' :
                      section.type === 'hooks' ? 'rgba(251, 146, 60, 0.15)' :
                      'rgba(255, 255, 255, 0.08)',
          color: section.type === 'claude-md' ? '#60a5fa' :
                 section.type === 'rule' ? '#4ade80' :
                 section.type === 'hooks' ? '#fb923c' :
                 'rgba(255, 255, 255, 0.5)',
        }}>
          {section.type}
        </span>

        {/* Label */}
        <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.85)', flex: 1 }}>
          {section.label}
        </span>

        {/* Warnings */}
        {section.hasUserCustomizations && (
          <span style={{
            fontSize: '10px', color: '#fb923c',
            padding: '2px 6px', borderRadius: '3px',
            background: 'rgba(251, 146, 60, 0.1)',
            border: '1px solid rgba(251, 146, 60, 0.2)',
          }}>
            HAS CUSTOMIZATIONS
          </span>
        )}

        {!section.existsOnDisk && (
          <span style={{
            fontSize: '10px', color: '#4ade80',
            padding: '2px 6px', borderRadius: '3px',
            background: 'rgba(74, 222, 128, 0.1)',
          }}>
            NEW
          </span>
        )}

        {/* Expand indicator */}
        <span style={{
          color: 'rgba(255, 255, 255, 0.3)',
          fontSize: '12px',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }}>
          &#9654;
        </span>
      </div>

      {/* Diff content (expanded) */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          maxHeight: '400px',
          overflow: 'auto',
        }}>
          {section.diffLines.length === 0 ? (
            <div style={{
              padding: '16px', textAlign: 'center',
              fontSize: '12px', color: 'rgba(255, 255, 255, 0.3)',
            }}>
              No changes detected
            </div>
          ) : (
            <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5' }}>
              {section.diffLines.map((line, i) => (
                <DiffLineRow key={i} line={line} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Diff Line Row ──

function DiffLineRow({ line }: { line: UpgradeDiffLine }) {
  const colors: Record<string, { bg: string; fg: string; prefix: string }> = {
    header:  { bg: 'rgba(96, 165, 250, 0.08)', fg: 'rgba(96, 165, 250, 0.7)', prefix: '' },
    context: { bg: 'transparent', fg: 'rgba(255, 255, 255, 0.4)', prefix: ' ' },
    added:   { bg: 'rgba(74, 222, 128, 0.06)', fg: 'rgba(74, 222, 128, 0.8)', prefix: '+' },
    removed: { bg: 'rgba(255, 100, 100, 0.06)', fg: 'rgba(255, 100, 100, 0.7)', prefix: '-' },
  }

  const style = colors[line.type] || colors.context

  return (
    <div style={{
      padding: '0 12px',
      background: style.bg,
      color: style.fg,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      borderLeft: line.type === 'added' ? '2px solid rgba(74, 222, 128, 0.5)' :
                  line.type === 'removed' ? '2px solid rgba(255, 100, 100, 0.5)' :
                  '2px solid transparent',
    }}>
      <span style={{ userSelect: 'none', opacity: 0.5, marginRight: '8px', display: 'inline-block', width: '10px' }}>
        {style.prefix}
      </span>
      {line.content}
    </div>
  )
}
