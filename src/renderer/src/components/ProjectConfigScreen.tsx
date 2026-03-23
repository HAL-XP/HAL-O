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

type Phase = 'scanning' | 'summary' | 'configuring' | 'done'

interface Props {
  projectPath: string
  onBackToHub: () => void
  onOpenInHub: (path: string, name: string) => void
}

const ESTIMATED_CONFIG_STEPS = 8

export function ProjectConfigScreen({ projectPath, onBackToHub, onOpenInHub }: Props) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // Configuration options (checkboxes for missing items)
  const [addClaudeMd, setAddClaudeMd] = useState(true)
  const [enhanceClaudeMd, setEnhanceClaudeMd] = useState(false)
  const [addClaudeDir, setAddClaudeDir] = useState(true)
  const [addLaunchScripts, setAddLaunchScripts] = useState(true)
  const [addHooks, setAddHooks] = useState(true)

  // Configuration progress
  const [configLog, setConfigLog] = useState<string[]>([])
  const [configResult, setConfigResult] = useState<EnlistResult | null>(null)

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
  }, [configLog])

  // Sound on completion
  useEffect(() => {
    if (phase === 'done' && !soundPlayed.current) {
      soundPlayed.current = true
      if (configResult?.success) playSuccess()
      else playError()
    }
  }, [phase, configResult])

  const handleApplyConfig = async () => {
    if (!scan) return
    setPhase('configuring')
    setConfigLog(['Applying configuration...'])

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
      setConfigLog(result.log)
      setConfigResult(result)
      setPhase('done')
    } catch (err) {
      setConfigLog((prev) => [...prev, `[ERROR] ${err}`])
      setConfigResult({ success: false, log: [], path: scan.path })
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
          <div className="config-screen">
            <div className="config-scanning">
              <div className="config-scanner-ring" />
              <div className="config-scanner-text">SCANNING PROJECT</div>
              <div className="config-scanner-path">{projectPath}</div>
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
          <div className="config-screen">
            <div className="config-header">
              <div className="config-header-icon">!</div>
              <h2>SCAN FAILED</h2>
            </div>
            <div className="config-error-box">
              {scanError || 'Unknown scan error'}
            </div>
            <div className="config-actions">
              <button className="config-cancel-btn" onClick={onBackToHub}>ABORT</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- CONFIGURING ---
  if (phase === 'configuring') {
    const completedSteps = configLog.filter((l) => l.startsWith('[OK]')).length
    const progress = Math.min(95, Math.round((completedSteps / ESTIMATED_CONFIG_STEPS) * 100))

    return (
      <div className="app">
        <div className="chat-area">
          <div className="config-screen">
            <div className="config-header">
              <div className="config-header-icon config-header-pulse">&#x25C8;</div>
              <h2>APPLYING CONFIGURATION</h2>
            </div>

            <div className="progress-bar-track" style={{ marginTop: 16 }}>
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-label">{progress}%</span>

            <div className="creation-log" style={{ marginTop: 12 }}>
              {configLog.map((line, i) => {
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
    const success = configResult?.success
    return (
      <div className="app">
        <div className="chat-area">
          <div className="config-screen">
            {success && <Confetti />}
            <div className="config-header">
              <div className={`config-header-icon ${success ? 'config-header-success' : 'config-header-error'}`}>
                {success ? '\u2713' : '!'}
              </div>
              <h2>{success ? 'CONFIGURATION COMPLETE' : 'CONFIGURATION FAILED'}</h2>
            </div>

            <div className="creation-log" style={{ marginTop: 16 }}>
              {configLog.map((line, i) => {
                const isOk = line.startsWith('[OK]')
                const isErr = line.startsWith('[ERROR]')
                return (
                  <div key={i} className={`creation-log-line ${isOk ? 'success' : ''} ${isErr ? 'error' : ''}`}>
                    {line}
                  </div>
                )
              })}
            </div>

            <div className="config-actions" style={{ marginTop: 24 }}>
              {success && (
                <button
                  className="config-apply-btn"
                  onClick={() => onOpenInHub(scan.path, scan.name)}
                >
                  OPEN IN HUB
                </button>
              )}
              <button className="config-cancel-btn" onClick={onBackToHub}>
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
        <div className="config-screen">

          {/* ── HEADER ── */}
          <div className="config-header">
            <div className="config-header-icon">&#x25C8;</div>
            <div>
              <h2>PROJECT CONFIGURATION</h2>
              <div className="config-header-sub">Configuration summary</div>
            </div>
          </div>

          {/* ── SECTION 1: PROJECT IDENTITY ── */}
          <div className="config-section">
            <div className="config-section-label">PROJECT IDENTITY</div>
            <div className="config-identity-card">
              <div className="config-identity-name">{scan.name}</div>
              <div className="config-identity-path">{scan.path}</div>
              {scan.stack && (
                <div className="config-identity-row">
                  <span className="config-identity-label">STACK</span>
                  <span className="config-identity-value">{scan.stack}</span>
                </div>
              )}
              {scan.languages.length > 0 && (
                <div className="config-identity-row">
                  <span className="config-identity-label">LANGUAGES</span>
                  <div className="config-lang-badges">
                    {scan.languages.map((lang) => (
                      <span key={lang} className="config-lang-badge">{lang}</span>
                    ))}
                  </div>
                </div>
              )}
              {scan.description && (
                <div className="config-identity-row config-identity-desc-row">
                  <span className="config-identity-label">DESCRIPTION</span>
                  <span className="config-identity-desc">{scan.description}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 2: CURRENT STATUS ── */}
          <div className="config-section">
            <div className="config-section-label">CURRENT STATUS</div>
            <div className="config-status-grid">
              {statusItems.map((item) => (
                <div key={item.label} className="config-status-row">
                  <span className={`config-status-icon ${item.ok ? 'ok' : 'missing'}`}>
                    {item.ok ? '\u2713' : '\u25CF'}
                  </span>
                  <span className="config-status-label">{item.label}</span>
                  <span className={`config-status-detail ${item.ok ? '' : 'dim'}`}>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── SECTION 3: WHAT WILL BE ADDED ── */}
          {hasMissing && (
            <div className="config-section">
              <div className="config-section-label">OPTIONAL ADDITIONS</div>
              <div className="config-note">Existing files will NOT be modified</div>
              <div className="config-checklist">
                {!scan.hasClaude && (
                  <label className="config-check-item">
                    <input type="checkbox" checked={addClaudeMd} onChange={(e) => setAddClaudeMd(e.target.checked)} />
                    <span className="config-check-label">Create CLAUDE.md</span>
                    <span className="config-check-desc">Agent instructions and project context</span>
                  </label>
                )}
                {scan.hasClaude && (
                  <label className="config-check-item">
                    <input type="checkbox" checked={enhanceClaudeMd} onChange={(e) => setEnhanceClaudeMd(e.target.checked)} />
                    <span className="config-check-label">Enhance existing CLAUDE.md</span>
                    <span className="config-check-desc">Append HAL-O best practices (original content preserved)</span>
                  </label>
                )}
                {!scan.hasClaudeDir && (
                  <label className="config-check-item">
                    <input type="checkbox" checked={addClaudeDir} onChange={(e) => setAddClaudeDir(e.target.checked)} />
                    <span className="config-check-label">Create .claude/ directory</span>
                    <span className="config-check-desc">Settings, commands, and MCP config</span>
                  </label>
                )}
                {!scan.hasBatchFiles && (
                  <label className="config-check-item">
                    <input type="checkbox" checked={addLaunchScripts} onChange={(e) => setAddLaunchScripts(e.target.checked)} />
                    <span className="config-check-label">Add launch scripts</span>
                    <span className="config-check-desc">Quick-start batch/shell scripts for Claude</span>
                  </label>
                )}
                {!scan.hasHooks && (
                  <label className="config-check-item">
                    <input type="checkbox" checked={addHooks} onChange={(e) => setAddHooks(e.target.checked)} />
                    <span className="config-check-label">Configure hooks</span>
                    <span className="config-check-desc">Pre-commit lint and pre-push test hooks</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 4: VERSION (if halOMeta) ── */}
          {scan.halOMeta && (
            <div className="config-section">
              <div className="config-section-label">HAL-O STATUS</div>
              <div className="config-status-grid">
                <div className="config-status-row">
                  <span className="config-status-icon ok">{'\u2713'}</span>
                  <span className="config-status-label">Configured</span>
                  <span className="config-status-detail">
                    {new Date(scan.halOMeta.enlistedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="config-status-row">
                  <span className="config-status-icon ok">{'\u2713'}</span>
                  <span className="config-status-label">HAL-O version</span>
                  <span className="config-status-detail">{scan.halOMeta.halOVersion}</span>
                </div>
                <div className="config-status-row">
                  <span className="config-status-icon ok">{'\u2713'}</span>
                  <span className="config-status-label">Rules version</span>
                  <span className="config-status-detail">v{scan.halOMeta.rulesVersion}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── ACTIONS ── */}
          <div className="config-actions">
            <button
              className="config-apply-btn"
              onClick={handleApplyConfig}
              disabled={getAddCount() === 0 && !scan.halOMeta}
            >
              {getAddCount() > 0
                ? `APPLY CONFIGURATION (${getAddCount()} change${getAddCount() !== 1 ? 's' : ''})`
                : scan.halOMeta
                  ? 'RE-CONFIGURE'
                  : 'FULLY CONFIGURED'
              }
            </button>
            <button className="config-cancel-btn" onClick={onBackToHub}>CANCEL</button>
          </div>

        </div>
      </div>
    </div>
  )
}
