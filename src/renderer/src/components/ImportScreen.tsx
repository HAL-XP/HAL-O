import { useState, useEffect, useRef } from 'react'
import type { EnlistConfig, EnlistResult } from '../types'
import { Confetti } from './Confetti'
import { playSuccess, playError } from '../hooks/useSounds'

interface ScanResult {
  name: string
  path: string
  hasGit: boolean
  gitRemote: string
  gitBranch: string
  hasClaude: boolean
  hasClaudeDir: boolean
  hasBatchFiles: boolean
  hasHooks: boolean
  hasRules: boolean
  hasDevlog: boolean
  rulesList: string[]
  languages: string[]
  halOMeta: { enlistedAt: string; halOVersion: string; rulesVersion: number } | null
  stack: string
  description: string
  files: string[]
  readme: string
}

type Phase = 'scanning' | 'summary' | 'enlisting' | 'done'

interface Props {
  projectPath: string
  onBackToHub: () => void
  onOpenInHub: (path: string, name: string) => void
}

const ESTIMATED_ENLIST_STEPS = 8

export function ImportScreen({ projectPath, onBackToHub, onOpenInHub }: Props) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // Enlistment options (checkboxes for missing items)
  const [addClaudeMd, setAddClaudeMd] = useState(true)
  const [enhanceClaudeMd, setEnhanceClaudeMd] = useState(false)
  const [addClaudeDir, setAddClaudeDir] = useState(true)
  const [addLaunchScripts, setAddLaunchScripts] = useState(true)
  const [addHooks, setAddHooks] = useState(true)

  // Enlistment progress
  const [enlistLog, setEnlistLog] = useState<string[]>([])
  const [enlistResult, setEnlistResult] = useState<EnlistResult | null>(null)

  const soundPlayed = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Scan on mount
  useEffect(() => {
    if (!window.api) return
    window.api.scanExistingProject(projectPath)
      .then((result) => {
        setScan(result)
        // Pre-check only missing items
        setAddClaudeMd(!result.hasClaude)
        setAddClaudeDir(!result.hasClaudeDir)
        setAddLaunchScripts(!result.hasBatchFiles)
        setAddHooks(!result.hasHooks)
        setEnhanceClaudeMd(false)
        setPhase('summary')
      })
      .catch((err) => {
        setScanError(String(err))
        setPhase('summary')
      })
  }, [projectPath])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [enlistLog])

  // Sound on completion
  useEffect(() => {
    if (phase === 'done' && !soundPlayed.current) {
      soundPlayed.current = true
      if (enlistResult?.success) playSuccess()
      else playError()
    }
  }, [phase, enlistResult])

  const handleEnlist = async () => {
    if (!scan) return
    setPhase('enlisting')
    setEnlistLog(['Initiating enlistment sequence...'])

    const config: EnlistConfig = {
      projectPath: scan.path,
      agentName: scan.name,
      addLaunchScripts: addLaunchScripts && !scan.hasBatchFiles,
      addClaudeDir: addClaudeDir && !scan.hasClaudeDir,
      addClaudeMd: scan.hasClaude
        ? (enhanceClaudeMd ? 'append' : 'skip')
        : (addClaudeMd ? 'create' : 'skip'),
      addHooks: addHooks && !scan.hasHooks,
      hooksSetup: addHooks && !scan.hasHooks ? ['pre-commit-lint', 'pre-push-test'] : [],
      techStack: scan.stack,
      languages: scan.languages,
      description: scan.description,
    }

    try {
      const result = await window.api.enlistProject(config)
      setEnlistLog(result.log)
      setEnlistResult(result)
      setPhase('done')
    } catch (err) {
      setEnlistLog((prev) => [...prev, `[ERROR] ${err}`])
      setEnlistResult({ success: false, log: [], path: scan.path })
      setPhase('done')
    }
  }

  // Count what will be added
  const getAddCount = (): number => {
    if (!scan) return 0
    let count = 0
    if (!scan.hasClaude && addClaudeMd) count++
    if (scan.hasClaude && enhanceClaudeMd) count++
    if (!scan.hasClaudeDir && addClaudeDir) count++
    if (!scan.hasBatchFiles && addLaunchScripts) count++
    if (!scan.hasHooks && addHooks) count++
    return count
  }

  const hasMissing = scan && (!scan.hasClaude || !scan.hasClaudeDir || !scan.hasBatchFiles || !scan.hasHooks)

  // --- SCANNING ---
  if (phase === 'scanning') {
    return (
      <div className="app">
        <div className="chat-area">
          <div className="import-screen">
            <div className="import-scanning">
              <div className="import-scanner-ring" />
              <div className="import-scanner-text">SCANNING TARGET</div>
              <div className="import-scanner-path">{projectPath}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- ERROR ---
  if (scanError || !scan) {
    return (
      <div className="app">
        <div className="chat-area">
          <div className="import-screen">
            <div className="import-header">
              <div className="import-header-icon">!</div>
              <h2>RECONNAISSANCE FAILED</h2>
            </div>
            <div className="import-error-box">
              {scanError || 'Unknown scan error'}
            </div>
            <div className="import-actions">
              <button className="import-cancel-btn" onClick={onBackToHub}>ABORT</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- ENLISTING ---
  if (phase === 'enlisting') {
    const completedSteps = enlistLog.filter((l) => l.startsWith('[OK]')).length
    const progress = Math.min(95, Math.round((completedSteps / ESTIMATED_ENLIST_STEPS) * 100))

    return (
      <div className="app">
        <div className="chat-area">
          <div className="import-screen">
            <div className="import-header">
              <div className="import-header-icon import-header-pulse">&#x25C8;</div>
              <h2>ENLISTING PROJECT</h2>
            </div>

            <div className="progress-bar-track" style={{ marginTop: 16 }}>
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-label">{progress}%</span>

            <div className="creation-log" style={{ marginTop: 12 }}>
              {enlistLog.map((line, i) => {
                const isOk = line.startsWith('[OK]')
                const isErr = line.startsWith('[ERROR]')
                return (
                  <div key={i} className={`creation-log-line ${isOk ? 'success' : ''} ${isErr ? 'error' : ''}`}>
                    {line}
                  </div>
                )
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- DONE ---
  if (phase === 'done') {
    const success = enlistResult?.success
    return (
      <div className="app">
        <div className="chat-area">
          <div className="import-screen">
            {success && <Confetti />}
            <div className="import-header">
              <div className={`import-header-icon ${success ? 'import-header-success' : 'import-header-error'}`}>
                {success ? '\u2713' : '!'}
              </div>
              <h2>{success ? 'ENLISTMENT COMPLETE' : 'ENLISTMENT FAILED'}</h2>
            </div>

            <div className="creation-log" style={{ marginTop: 16 }}>
              {enlistLog.map((line, i) => {
                const isOk = line.startsWith('[OK]')
                const isErr = line.startsWith('[ERROR]')
                return (
                  <div key={i} className={`creation-log-line ${isOk ? 'success' : ''} ${isErr ? 'error' : ''}`}>
                    {line}
                  </div>
                )
              })}
            </div>

            <div className="import-actions" style={{ marginTop: 24 }}>
              {success && (
                <button
                  className="import-enlist-btn"
                  onClick={() => onOpenInHub(scan.path, scan.name)}
                >
                  OPEN IN HUB
                </button>
              )}
              <button className="import-cancel-btn" onClick={onBackToHub}>
                {success ? 'BACK TO HUB' : 'DISMISS'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- SUMMARY (main dashboard) ---
  const statusItems = [
    {
      label: 'Git Repository',
      ok: scan.hasGit,
      detail: scan.hasGit
        ? `${scan.gitBranch}${scan.gitRemote ? ` \u2192 ${scan.gitRemote}` : ''}`
        : 'Not initialized',
    },
    {
      label: 'CLAUDE.md',
      ok: scan.hasClaude,
      detail: scan.hasClaude ? 'Present' : 'Missing',
    },
    {
      label: '.claude/ directory',
      ok: scan.hasClaudeDir,
      detail: scan.hasClaudeDir ? 'Present' : 'Missing',
    },
    {
      label: 'Launch scripts',
      ok: scan.hasBatchFiles,
      detail: scan.hasBatchFiles ? 'Present' : 'Missing',
    },
    {
      label: 'Hooks',
      ok: scan.hasHooks,
      detail: scan.hasHooks ? 'Configured' : 'None',
    },
    {
      label: 'Rules',
      ok: scan.hasRules,
      detail: scan.hasRules ? `${scan.rulesList.length} rule${scan.rulesList.length !== 1 ? 's' : ''}` : 'None',
    },
    {
      label: 'Devlog',
      ok: scan.hasDevlog,
      detail: scan.hasDevlog ? 'Present' : 'None',
    },
  ]

  return (
    <div className="app">
      <div className="chat-area">
        <div className="import-screen">

          {/* ── HEADER ── */}
          <div className="import-header">
            <div className="import-header-icon">&#x25C8;</div>
            <div>
              <h2>PROJECT RECONNAISSANCE</h2>
              <div className="import-header-sub">Target assessment complete</div>
            </div>
          </div>

          {/* ── SECTION 1: PROJECT IDENTITY ── */}
          <div className="import-section">
            <div className="import-section-label">PROJECT IDENTITY</div>
            <div className="import-identity-card">
              <div className="import-identity-name">{scan.name}</div>
              <div className="import-identity-path">{scan.path}</div>
              {scan.stack && (
                <div className="import-identity-row">
                  <span className="import-identity-label">STACK</span>
                  <span className="import-identity-value">{scan.stack}</span>
                </div>
              )}
              {scan.languages.length > 0 && (
                <div className="import-identity-row">
                  <span className="import-identity-label">LANGUAGES</span>
                  <div className="import-lang-badges">
                    {scan.languages.map((lang) => (
                      <span key={lang} className="import-lang-badge">{lang}</span>
                    ))}
                  </div>
                </div>
              )}
              {scan.description && (
                <div className="import-identity-row import-identity-desc-row">
                  <span className="import-identity-label">DESCRIPTION</span>
                  <span className="import-identity-desc">{scan.description}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 2: CURRENT STATUS ── */}
          <div className="import-section">
            <div className="import-section-label">CURRENT STATUS</div>
            <div className="import-status-grid">
              {statusItems.map((item) => (
                <div key={item.label} className="import-status-row">
                  <span className={`import-status-icon ${item.ok ? 'ok' : 'missing'}`}>
                    {item.ok ? '\u2713' : '\u25CF'}
                  </span>
                  <span className="import-status-label">{item.label}</span>
                  <span className={`import-status-detail ${item.ok ? '' : 'dim'}`}>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── SECTION 3: WHAT WILL BE ADDED ── */}
          {hasMissing && (
            <div className="import-section">
              <div className="import-section-label">ENLISTMENT PLAN</div>
              <div className="import-note">Existing files will NOT be modified</div>
              <div className="import-checklist">
                {!scan.hasClaude && (
                  <label className="import-check-item">
                    <input type="checkbox" checked={addClaudeMd} onChange={(e) => setAddClaudeMd(e.target.checked)} />
                    <span className="import-check-label">Create CLAUDE.md</span>
                    <span className="import-check-desc">Agent instructions and project context</span>
                  </label>
                )}
                {scan.hasClaude && (
                  <label className="import-check-item">
                    <input type="checkbox" checked={enhanceClaudeMd} onChange={(e) => setEnhanceClaudeMd(e.target.checked)} />
                    <span className="import-check-label">Enhance existing CLAUDE.md</span>
                    <span className="import-check-desc">Append HAL-O best practices (original content preserved)</span>
                  </label>
                )}
                {!scan.hasClaudeDir && (
                  <label className="import-check-item">
                    <input type="checkbox" checked={addClaudeDir} onChange={(e) => setAddClaudeDir(e.target.checked)} />
                    <span className="import-check-label">Create .claude/ directory</span>
                    <span className="import-check-desc">Settings, commands, and MCP config</span>
                  </label>
                )}
                {!scan.hasBatchFiles && (
                  <label className="import-check-item">
                    <input type="checkbox" checked={addLaunchScripts} onChange={(e) => setAddLaunchScripts(e.target.checked)} />
                    <span className="import-check-label">Add launch scripts</span>
                    <span className="import-check-desc">Quick-start batch/shell scripts for Claude</span>
                  </label>
                )}
                {!scan.hasHooks && (
                  <label className="import-check-item">
                    <input type="checkbox" checked={addHooks} onChange={(e) => setAddHooks(e.target.checked)} />
                    <span className="import-check-label">Configure hooks</span>
                    <span className="import-check-desc">Pre-commit lint and pre-push test hooks</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 4: VERSION (if halOMeta) ── */}
          {scan.halOMeta && (
            <div className="import-section">
              <div className="import-section-label">HAL-O STATUS</div>
              <div className="import-status-grid">
                <div className="import-status-row">
                  <span className="import-status-icon ok">{'\u2713'}</span>
                  <span className="import-status-label">Enlisted</span>
                  <span className="import-status-detail">
                    {new Date(scan.halOMeta.enlistedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="import-status-row">
                  <span className="import-status-icon ok">{'\u2713'}</span>
                  <span className="import-status-label">HAL-O version</span>
                  <span className="import-status-detail">{scan.halOMeta.halOVersion}</span>
                </div>
                <div className="import-status-row">
                  <span className="import-status-icon ok">{'\u2713'}</span>
                  <span className="import-status-label">Rules version</span>
                  <span className="import-status-detail">v{scan.halOMeta.rulesVersion}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── ACTIONS ── */}
          <div className="import-actions">
            <button
              className="import-enlist-btn"
              onClick={handleEnlist}
              disabled={getAddCount() === 0 && !scan.halOMeta}
            >
              {getAddCount() > 0
                ? `ENLIST THIS PROJECT (${getAddCount()} change${getAddCount() !== 1 ? 's' : ''})`
                : scan.halOMeta
                  ? 'RE-ENLIST PROJECT'
                  : 'NOTHING TO ADD'
              }
            </button>
            <button className="import-cancel-btn" onClick={onBackToHub}>CANCEL</button>
          </div>

        </div>
      </div>
    </div>
  )
}
