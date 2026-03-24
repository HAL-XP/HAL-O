import { useState, useEffect, useRef, useMemo } from 'react'
import type { EnlistConfig, EnlistResult } from '../types'
import { TOKEN_BUDGET_OPTIONS, type TokenBudgetId } from '../hooks/useSettings'
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
  communityTools: string[]
}

type Phase = 'scanning' | 'summary' | 'configuring' | 'done'

interface Props {
  projectPath: string
  onBackToHub: () => void
  onOpenInHub: (path: string, name: string) => void
}

/** Badge showing an item's current state */
type FeatureState = 'missing' | 'exists' | 'outdated'

function getFeatureState(exists: boolean, outdated = false): FeatureState {
  if (exists && outdated) return 'outdated'
  if (exists) return 'exists'
  return 'missing'
}

const ESTIMATED_CONFIG_STEPS = 8

const RULES_OPTIONS = [
  { id: 'frontend', label: 'frontend.md', desc: 'Component patterns, styling rules' },
  { id: 'ux', label: 'ux.md', desc: 'UX principles, state-driven UI' },
  { id: 'python-api', label: 'python-api.md', desc: 'FastAPI routes, restart protocol' },
  { id: 'node-api', label: 'node-api.md', desc: 'Express/Node routes, conventions' },
  { id: 'go-api', label: 'go-api.md', desc: 'Go API conventions' },
  { id: 'rust-api', label: 'rust-api.md', desc: 'Rust API conventions' },
  { id: 'game-loop', label: 'game-loop.md', desc: 'Game loop, sprites, assets' },
  { id: 'mobile', label: 'mobile.md', desc: 'Mobile app conventions' },
  { id: 'banned-techniques', label: 'banned-techniques.md', desc: 'Dead ends log — never retry' },
]

const HOOKS_OPTIONS = [
  { id: 'session-start', label: 'SessionStart health check', desc: 'Git status + ACTION line on startup' },
  { id: 'post-tool-tsc', label: 'PostToolUse: tsc', desc: 'Type-check after .ts/.tsx edits' },
  { id: 'post-tool-pycache', label: 'PostToolUse: pycache', desc: 'Clear __pycache__ after .py edits' },
  { id: 'telegram-notify', label: 'Telegram notifications', desc: 'Permission prompts + idle updates' },
]

const DEVLOG_OPTIONS = [
  { id: 'summaries', label: 'summaries/', desc: 'Daily session summaries' },
  { id: 'hours', label: 'hours/', desc: 'Human-equivalent hours tracking' },
  { id: 'decisions', label: 'decisions/', desc: 'Architecture decision records' },
  { id: 'experiments', label: 'experiments/', desc: 'Trial/spike results' },
]

export function ProjectConfigScreen({ projectPath, onBackToHub, onOpenInHub }: Props) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // ── Core toggles ──
  const [addClaudeMd, setAddClaudeMd] = useState(true)
  const [enhanceClaudeMd, setEnhanceClaudeMd] = useState(false)
  const [addClaudeDir, setAddClaudeDir] = useState(true)
  const [addLaunchScripts, setAddLaunchScripts] = useState(true)
  const [addHooks, setAddHooks] = useState(true)

  // ── U2: Modular feature picker ──
  const [selectedHooks, setSelectedHooks] = useState<string[]>(['session-start', 'telegram-notify'])
  const [selectedRules, setSelectedRules] = useState<string[]>([])
  const [selectedDevlog, setSelectedDevlog] = useState<string[]>(['summaries', 'hours', 'decisions', 'experiments'])
  const [addMemorySeed, setAddMemorySeed] = useState(true)
  const [addAgentTemplates, setAddAgentTemplates] = useState(false)

  // ── Token budget ──
  const [tokenBudget, setTokenBudget] = useState<TokenBudgetId>(() =>
    (localStorage.getItem('hal-o-token-budget') as TokenBudgetId) || 'full'
  )

  // ── HAL-O self-detection ──
  const isHalO = useMemo(() => {
    const p = projectPath.replace(/\\/g, '/').toLowerCase()
    return p.endsWith('/hal-o') || p.includes('/hal-o/')
  }, [projectPath])

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
        setScan({ ...result, communityTools: result.communityTools ?? [] })

        // Pre-check only missing items
        setAddClaudeMd(!result.hasClaude)
        setAddClaudeDir(!result.hasClaudeDir)
        setAddLaunchScripts(!result.hasBatchFiles)
        setAddHooks(!result.hasHooks)
        setEnhanceClaudeMd(false)

        // Smart defaults for rules based on detected stack/languages
        const lang = result.languages.map(l => l.toLowerCase())
        const stack = result.stack.toLowerCase()
        const smart: string[] = []
        if (/react|vue|svelte|next|nuxt|angular|electron/.test(stack)) {
          smart.push('frontend', 'ux')
        }
        if (lang.includes('typescript')) {
          smart.push('post-tool-tsc')
          if (!selectedHooks.includes('post-tool-tsc')) {
            setSelectedHooks(prev => [...prev, 'post-tool-tsc'])
          }
        }
        if (lang.includes('python') || /python|fastapi|django|flask/.test(stack)) {
          smart.push('python-api')
          if (!selectedHooks.includes('post-tool-pycache')) {
            setSelectedHooks(prev => [...prev, 'post-tool-pycache'])
          }
        }
        if (/go/.test(stack)) smart.push('go-api')
        if (/rust/.test(stack)) smart.push('rust-api')
        if (/node|express/.test(stack)) smart.push('node-api')
        // Filter to rules not already present
        const existingRules = result.rulesList.map(r => r.replace('.md', ''))
        const newRules = smart.filter(r => !existingRules.includes(r))
        if (newRules.length > 0) setSelectedRules(newRules)

        // Memory seed: default on if not already present
        const hasMemory = result.files.includes('MEMORY.md') ||
          result.files.some(f => f.toLowerCase() === 'memory.md')
        setAddMemorySeed(!hasMemory)

        setPhase('summary')
      })
      .catch((err) => {
        setScanError(String(err))
        setPhase('summary')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Compute effective hooks: merge addHooks toggle + selected hooks
    const effectiveHooks = addHooks && !scan.hasHooks ? selectedHooks : []

    const config: EnlistConfig = {
      projectPath: scan.path,
      agentName: scan.name,
      addLaunchScripts: addLaunchScripts && !scan.hasBatchFiles,
      addClaudeDir: addClaudeDir && !scan.hasClaudeDir,
      addClaudeMd: scan.hasClaude
        ? (enhanceClaudeMd ? 'append' : 'skip')
        : (addClaudeMd ? 'create' : 'skip'),
      addHooks: effectiveHooks.length > 0,
      hooksSetup: effectiveHooks,
      techStack: scan.stack,
      languages: scan.languages,
      description: scan.description,
      // U2 modular features
      addRules: selectedRules.length > 0 ? selectedRules : undefined,
      addDevlog: selectedDevlog.length > 0 ? selectedDevlog : undefined,
      addMemorySeed: addMemorySeed,
      addAgentTemplates: addAgentTemplates,
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

  // Count what will be applied
  const getAddCount = (): number => {
    if (!scan) return 0
    let count = 0
    if (!scan.hasClaude && addClaudeMd) count++
    if (scan.hasClaude && enhanceClaudeMd) count++
    if (!scan.hasClaudeDir && addClaudeDir) count++
    if (!scan.hasBatchFiles && addLaunchScripts) count++
    if (!scan.hasHooks && addHooks && selectedHooks.length > 0) count++
    count += selectedRules.length
    count += selectedDevlog.length > 0 ? 1 : 0
    if (addMemorySeed) count++
    if (addAgentTemplates) count++
    return count
  }

  function toggleArr<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
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

  // --- SUMMARY (main configure dashboard) ---
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

  const existingRulesSet = new Set(scan.rulesList.map(r => r.replace('.md', '')))

  return (
    <div className="app">
      <div className="chat-area">
        <div className="config-screen">

          {/* ── HEADER ── */}
          <div className="config-header">
            <div className="config-header-icon">&#x25C8;</div>
            <div>
              <h2>{scan.halOMeta ? 'REVIEW PROJECT SETTINGS' : 'PROJECT CONFIGURATION'}</h2>
              <div className="config-header-sub">
                {scan.halOMeta
                  ? 'Review and adjust your project configuration'
                  : 'Select features to add'}
              </div>
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

          {/* ── COMMUNITY TOOLS NOTICE ── */}
          {scan.communityTools.length > 0 && (
            <div className="config-community-notice">
              <span className="config-community-icon">&#x2139;</span>
              <div>
                <div className="config-community-title">
                  Detected existing setups:{' '}
                  {scan.communityTools
                    .filter(t => t !== 'foreign-claude-md' && t !== 'foreign-rules')
                    .map(t => ({ cursor: 'Cursor', aider: 'Aider', copilot: 'GitHub Copilot', windsurf: 'Windsurf' }[t] ?? t))
                    .join(', ') || null}
                  {(scan.communityTools.includes('foreign-claude-md') || scan.communityTools.includes('foreign-rules'))
                    && ' (existing CLAUDE.md / rules files)'}
                </div>
                <div className="config-community-desc">
                  HAL-O will add alongside, not overwrite. Your existing rules and CLAUDE.md are safe.
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 3: CLAUDE.md ── */}
          <div className="config-section">
            <div className="config-section-label">CLAUDE.md</div>
            <div className="config-checklist">
              {!scan.hasClaude ? (
                <label className="config-check-item">
                  <input type="checkbox" checked={addClaudeMd} onChange={(e) => setAddClaudeMd(e.target.checked)} />
                  <div>
                    <span className="config-check-label">
                      Create CLAUDE.md
                      <span className="config-feature-badge config-feature-missing">missing</span>
                    </span>
                    <span className="config-check-desc">Agent instructions and project context</span>
                  </div>
                </label>
              ) : (
                <>
                  <div className="config-check-item" style={{ cursor: 'default', opacity: 0.6 }}>
                    <input type="checkbox" checked disabled />
                    <div>
                      <span className="config-check-label">
                        CLAUDE.md
                        <span className="config-feature-badge config-feature-exists">exists</span>
                      </span>
                      <span className="config-check-desc">Already present — will not be overwritten</span>
                    </div>
                  </div>
                  <label className="config-check-item">
                    <input type="checkbox" checked={enhanceClaudeMd} onChange={(e) => setEnhanceClaudeMd(e.target.checked)} />
                    <div>
                      <span className="config-check-label">Enhance existing CLAUDE.md</span>
                      <span className="config-check-desc">Append HAL-O best practices (original content preserved)</span>
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* ── SECTION 4: .CLAUDE/ INFRASTRUCTURE ── */}
          {hasMissing && (
            <div className="config-section">
              <div className="config-section-label">INFRASTRUCTURE</div>
              <div className="config-note">Existing files will NOT be modified</div>
              <div className="config-checklist">
                {!scan.hasClaudeDir && (
                  <label className="config-check-item">
                    <input type="checkbox" checked={addClaudeDir} onChange={(e) => setAddClaudeDir(e.target.checked)} />
                    <div>
                      <span className="config-check-label">
                        .claude/ directory
                        <span className="config-feature-badge config-feature-missing">missing</span>
                      </span>
                      <span className="config-check-desc">Settings, commands, and MCP config</span>
                    </div>
                  </label>
                )}
                {!scan.hasBatchFiles && (
                  <label className="config-check-item">
                    <input type="checkbox" checked={addLaunchScripts} onChange={(e) => setAddLaunchScripts(e.target.checked)} />
                    <div>
                      <span className="config-check-label">
                        Launch scripts
                        <span className="config-feature-badge config-feature-missing">missing</span>
                      </span>
                      <span className="config-check-desc">Quick-start batch/shell scripts for Claude</span>
                    </div>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 5: HOOKS ── */}
          <div className="config-section">
            <div className="config-section-label">HOOKS</div>
            {scan.hasHooks ? (
              <div className="config-note" style={{ color: 'var(--success)' }}>
                ✓ .claude/settings.json already configured
              </div>
            ) : (
              <>
                <label className="config-check-item" style={{ marginBottom: 4 }}>
                  <input type="checkbox" checked={addHooks} onChange={(e) => setAddHooks(e.target.checked)} />
                  <div>
                    <span className="config-check-label">
                      Configure hooks
                      <span className="config-feature-badge config-feature-missing">missing</span>
                    </span>
                    <span className="config-check-desc">Create .claude/settings.json with selected hooks</span>
                  </div>
                </label>
                {addHooks && (
                  <div className="config-checklist config-sub-checklist">
                    {HOOKS_OPTIONS.map((hook) => (
                      <label key={hook.id} className="config-check-item config-check-sub">
                        <input
                          type="checkbox"
                          checked={selectedHooks.includes(hook.id)}
                          onChange={() => setSelectedHooks(prev => toggleArr(prev, hook.id))}
                        />
                        <div>
                          <span className="config-check-label">{hook.label}</span>
                          <span className="config-check-desc">{hook.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── SECTION 6: RULES ── */}
          <div className="config-section">
            <div className="config-section-label">RULES (.claude/rules/)</div>
            {scan.hasRules && scan.rulesList.length > 0 && (
              <div className="config-note">
                Existing: {scan.rulesList.join(', ')}
              </div>
            )}
            <div className="config-checklist">
              {RULES_OPTIONS.map((rule) => {
                const alreadyExists = existingRulesSet.has(rule.id)
                const state = getFeatureState(alreadyExists)
                return (
                  <label key={rule.id} className="config-check-item">
                    <input
                      type="checkbox"
                      checked={selectedRules.includes(rule.id)}
                      onChange={() => setSelectedRules(prev => toggleArr(prev, rule.id))}
                    />
                    <div>
                      <span className="config-check-label">
                        {rule.label}
                        {state === 'exists' && (
                          <span className="config-feature-badge config-feature-exists">exists</span>
                        )}
                      </span>
                      <span className="config-check-desc">{rule.desc}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── SECTION 7: DEVLOG ── */}
          <div className="config-section">
            <div className="config-section-label">DEVLOG (_devlog/)</div>
            {scan.hasDevlog && (
              <div className="config-note" style={{ color: 'var(--success)' }}>
                ✓ _devlog/ already present — selecting folders will create any missing ones
              </div>
            )}
            <div className="config-checklist">
              {DEVLOG_OPTIONS.map((folder) => (
                <label key={folder.id} className="config-check-item">
                  <input
                    type="checkbox"
                    checked={selectedDevlog.includes(folder.id)}
                    onChange={() => setSelectedDevlog(prev => toggleArr(prev, folder.id))}
                  />
                  <div>
                    <span className="config-check-label">{folder.label}</span>
                    <span className="config-check-desc">{folder.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── SECTION 8: EXTRAS (memory seed, agent templates) ── */}
          <div className="config-section">
            <div className="config-section-label">EXTRAS</div>
            <div className="config-checklist">
              <label className="config-check-item">
                <input
                  type="checkbox"
                  checked={addMemorySeed}
                  onChange={(e) => setAddMemorySeed(e.target.checked)}
                />
                <div>
                  <span className="config-check-label">
                    MEMORY.md seed
                    {scan.files.some(f => f.toLowerCase() === 'memory.md') && (
                      <span className="config-feature-badge config-feature-exists">exists</span>
                    )}
                  </span>
                  <span className="config-check-desc">Initial memory template for Claude agents</span>
                </div>
              </label>
              <label className="config-check-item">
                <input
                  type="checkbox"
                  checked={addAgentTemplates}
                  onChange={(e) => setAddAgentTemplates(e.target.checked)}
                />
                <div>
                  <span className="config-check-label">Agent templates</span>
                  <span className="config-check-desc">Starter .claude/agents/ files for common tasks</span>
                </div>
              </label>
            </div>
          </div>

          {/* ── SECTION 9: VERSION (if halOMeta) ── */}
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

          {/* ── SECTION: TOKEN BUDGET ── */}
          <div className="config-section">
            <div className="config-section-label">TOKEN BUDGET</div>
            <div className="config-note">
              Controls CLAUDE.md verbosity, compaction thresholds, and subagent model selection
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
              {TOKEN_BUDGET_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setTokenBudget(opt.id)
                    localStorage.setItem('hal-o-token-budget', opt.id)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '8px 12px',
                    background: tokenBudget === opt.id ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${tokenBudget === opt.id ? '#22d3ee55' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: tokenBudget === opt.id ? '#22d3ee' : 'var(--text-secondary, #8b8fa3)',
                    textAlign: 'left',
                    fontSize: '10px',
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                    letterSpacing: '0.5px',
                    width: '100%',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '11px' }}>
                    {tokenBudget === opt.id ? '\u25CF ' : '\u25CB '}{opt.label}
                  </span>
                  <span style={{ opacity: 0.6, marginTop: '2px', fontSize: '9px' }}>{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── HAL-O self-detection notice ── */}
          {isHalO && (
            <div className="config-section">
              <div style={{
                padding: '10px 14px',
                background: 'rgba(132,204,22,0.08)',
                border: '1px solid rgba(132,204,22,0.25)',
                borderRadius: '4px',
                fontSize: '10px',
                lineHeight: '1.6',
                color: 'var(--text-secondary, #8b8fa3)',
                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              }}>
                <div style={{ color: '#84cc16', fontWeight: 700, letterSpacing: '1.5px', marginBottom: '4px', fontSize: '11px' }}>
                  SELF-CONFIGURATION DETECTED
                </div>
                <div>
                  This is the <span style={{ color: '#84cc16' }}>HAL-O</span> project itself.
                  Changes here will optimize HAL-O's own agent rules, hooks, and CLAUDE.md.
                  The existing configuration is already tuned for development — only modify
                  if you know what you want to change.
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
