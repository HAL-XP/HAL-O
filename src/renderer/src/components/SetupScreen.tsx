import { useState, useEffect, useRef } from 'react'
import type { PrerequisiteStatus, InstallLabels } from '../types'
import { useI18n } from '../i18n'

interface Props {
  onReady: () => void
}

const API_KEY_LOCATIONS = [
  {
    id: 'env-local-project',
    label: '.env.local (HAL-O folder)',
    description: 'Only this app can see it. Gitignored. Safest for trying things out.',
    risk: 'low',
  },
  {
    id: 'env-project',
    label: '.env (HAL-O folder)',
    description: 'Only this app. May be committed if you forget to gitignore.',
    risk: 'low',
  },
  {
    id: 'env-home',
    label: '~/.env (home directory)',
    description: 'Any tool or script that reads ~/.env will see this key. Convenient but broad.',
    risk: 'medium',
  },
  {
    id: 'claude-credentials',
    label: '~/.claude_credentials (user-wide)',
    description: 'All your Claude Code sessions and hooks can source this file. The standard location if you use Claude Code across many projects.',
    risk: 'medium',
  },
]

type InstallingTool = 'git' | 'gh' | 'python' | 'claude-cli' | 'ffmpeg' | null

export function SetupScreen({ onReady }: Props) {
  const { t } = useI18n()
  const [status, setStatus] = useState<PrerequisiteStatus | null>(null)
  const [labels, setLabels] = useState<InstallLabels | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [saveLocation, setSaveLocation] = useState('claude-credentials')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [installing, setInstalling] = useState<InstallingTool>(null)
  const [needsRestart, setNeedsRestart] = useState(false)
  const [statuslineInfo, setStatuslineInfo] = useState<{ exists: boolean; hasStatusline: boolean } | null>(null)
  const [statuslineConfiguring, setStatuslineConfiguring] = useState(false)
  const [statuslineResult, setStatuslineResult] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    window.api.checkPrerequisites().then((s) => {
      setStatus(s)
      setLoading(false)
    })
  }

  useEffect(() => {
    refresh()
    window.api.getInstallLabels().then(setLabels).catch(() => {})
    // Check statusline config (D8)
    window.api.checkStatusline().then(setStatuslineInfo).catch(() => {})
  }, [])

  // Auto-skip if core tools are present and user has seen setup before
  useEffect(() => {
    if (loading || !status) return
    const coreGood = status.gitInstalled && status.claudeCliInstalled && status.apiKeyFound
    const hasSeenSetup = localStorage.getItem('hal-o-setup-done') === '1'
    if (coreGood && hasSeenSetup) onReady()
  }, [loading, status]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Conditional return AFTER all hooks ---

  if (loading || !status) {
    return (
      <div className="setup-screen">
        <h2>{t('setup.title')}</h2>
        <p className="setup-subtitle">{t('setup.checking')}</p>
        <div className="analysis-spinner" style={{ margin: '24px auto', display: 'block' }} />
      </div>
    )
  }

  const coreReady = status.gitInstalled && status.claudeCliInstalled
  const allGood = coreReady && status.apiKeyFound && status.ghAuthenticated && status.pythonInstalled

  // Auto-launch countdown when all prerequisites are green
  const [countdown, setCountdown] = useState(allGood ? 10 : -1)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!allGood) { setCountdown(-1); return }
    setCountdown(10)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          localStorage.setItem('hal-o-setup-done', '1')
          onReady()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [allGood]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleContinue = () => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    localStorage.setItem('hal-o-setup-done', '1')
    onReady()
  }

  const handleInstall = async (tool: InstallingTool) => {
    if (!tool || installing) return
    setInstalling(tool)
    try {
      let result: { success: boolean; needsRestart?: boolean; error?: string }
      switch (tool) {
        case 'git': result = await window.api.installGit(); break
        case 'gh': result = await window.api.installGhCli(); break
        case 'python': result = await window.api.installPython(); break
        case 'claude-cli': result = await window.api.installClaudeCli(); break
        case 'ffmpeg': result = await window.api.installFfmpeg(); break
        default: return
      }
      if (result.needsRestart) {
        setNeedsRestart(true)
        // D4: Write continuation file so app resumes setup after relaunch
        const toolName = tool === 'claude-cli' ? 'Claude CLI' : tool.charAt(0).toUpperCase() + tool.slice(1)
        await window.api.writeContinuation({
          step: 'setup',
          reason: `${tool}-installed`,
          message: `${toolName} was installed. Relaunch to continue setup.`,
        }).catch(() => {})
      }
      setTimeout(refresh, 1000)
    } catch { /* */ }
    setInstalling(null)
  }

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveResult(null)
    const result = await window.api.saveApiKey(apiKey.trim(), saveLocation)
    setSaving(false)
    if (result.success) {
      setSaveResult(`Saved to ${result.path}`)
      setApiKey('')
      refresh()
    } else {
      setSaveResult(`Error: ${result.error}`)
    }
  }

  const handleAuthGh = async () => {
    await window.api.authGhCli()
    setTimeout(refresh, 5000)
  }

  const handleConfigureStatusline = async () => {
    setStatuslineConfiguring(true)
    setStatuslineResult(null)
    try {
      const result = await window.api.configureStatusline()
      if (result.success) {
        setStatuslineResult('Statusline configured')
        setStatuslineInfo({ exists: true, hasStatusline: true })
      } else {
        setStatuslineResult(`Error: ${result.error}`)
      }
    } catch (e: any) {
      setStatuslineResult(`Error: ${e.message}`)
    }
    setStatuslineConfiguring(false)
  }

  const itemClass = (ok: boolean, warn?: boolean) =>
    `setup-item ${ok ? 'ok' : warn ? 'warn' : 'missing'}`
  const icon = (ok: boolean, warn?: boolean) =>
    ok ? '\u2713' : warn ? '!' : '\u2717'

  return (
    <div className="setup-screen">
      <h2>{t('setup.title')}</h2>
      <p className="setup-subtitle">HAL-O checks your system and helps install anything missing.</p>

      {needsRestart && (
        <div className="setup-restart-banner">
          Some tools need a restart to update your PATH. Close and relaunch HAL-O to continue.
        </div>
      )}

      {/* -- Essential Tools -- */}
      <div className="setup-section-label">ESSENTIAL</div>

      {/* Node.js — always OK since Electron bundles it */}
      <div className="setup-item ok">
        <span className="setup-icon">{'\u2713'}</span>
        <div className="setup-info">
          <span className="setup-label">Node.js</span>
          <span className="setup-detail">{status.nodeVersion}</span>
        </div>
      </div>

      {/* git */}
      <div className={itemClass(status.gitInstalled)}>
        <span className="setup-icon">{icon(status.gitInstalled)}</span>
        <div className="setup-info">
          <span className="setup-label">Git</span>
          <span className="setup-detail">
            {status.gitInstalled ? status.gitVersion : 'Not found — required for version control'}
          </span>
          {!status.gitInstalled && labels && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={() => handleInstall('git')} disabled={!!installing}>
                {installing === 'git' ? 'Installing...' : labels.git}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Claude CLI */}
      <div className={itemClass(status.claudeCliInstalled)}>
        <span className="setup-icon">{icon(status.claudeCliInstalled)}</span>
        <div className="setup-info">
          <span className="setup-label">Claude CLI</span>
          <span className="setup-detail">
            {status.claudeCliInstalled ? status.claudeCliVersion : 'Not found — this is the core agent tool'}
          </span>
          {!status.claudeCliInstalled && labels && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={() => handleInstall('claude-cli')} disabled={!!installing}>
                {installing === 'claude-cli' ? 'Installing...' : labels.claudeCli}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* API Key */}
      <div className={itemClass(status.apiKeyFound)}>
        <span className="setup-icon">{icon(status.apiKeyFound)}</span>
        <div className="setup-info">
          <span className="setup-label">Anthropic API Key</span>
          <span className="setup-detail">
            {status.apiKeyFound
              ? `Found in ${status.apiKeySource} (${status.apiKeyPreview})`
              : 'Not found — needed for Claude agents to work'}
          </span>

          {!status.apiKeyFound && (
            <>
              <div className="setup-key-input">
                <input
                  className="text-input"
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey() }}
                  style={{ marginTop: 8, maxWidth: 400 }}
                />
                <span className="setup-link">
                  Get your key at console.anthropic.com
                </span>
              </div>

              <div className="setup-location-picker">
                <span className="setup-location-label">Save to:</span>
                {API_KEY_LOCATIONS.map((loc) => (
                  <label key={loc.id} className={`setup-location-option ${saveLocation === loc.id ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="api-key-location"
                      value={loc.id}
                      checked={saveLocation === loc.id}
                      onChange={() => setSaveLocation(loc.id)}
                    />
                    <div>
                      <span className="setup-location-name">{loc.label}</span>
                      <span className="setup-location-desc">{loc.description}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="setup-actions">
                <button className="submit-btn" onClick={handleSaveKey} disabled={saving || !apiKey.trim()}>
                  {saving ? 'Saving...' : 'Save Key'}
                </button>
              </div>
              {saveResult && (
                <span className={`setup-save-result ${saveResult.startsWith('Error') ? 'error' : 'success'}`}>
                  {saveResult}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* -- Recommended Tools -- */}
      <div className="setup-section-label">RECOMMENDED</div>

      {/* Python */}
      <div className={itemClass(status.pythonInstalled, false)}>
        <span className="setup-icon">{icon(status.pythonInstalled)}</span>
        <div className="setup-info">
          <span className="setup-label">Python 3</span>
          <span className="setup-detail">
            {status.pythonInstalled
              ? status.pythonVersion
              : 'Strongly recommended — Claude agents use Python for scripts, automation, data processing, and tool execution'}
          </span>
          {!status.pythonInstalled && (
            <span className="setup-python-warning">
              Without Python, Claude agents lose access to most automation tools, voice transcription, and data processing capabilities.
            </span>
          )}
          {!status.pythonInstalled && labels && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={() => handleInstall('python')} disabled={!!installing}>
                {installing === 'python' ? 'Installing...' : labels.python}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* gh CLI */}
      <div className={itemClass(status.ghAuthenticated, status.ghInstalled)}>
        <span className="setup-icon">{icon(status.ghAuthenticated, status.ghInstalled)}</span>
        <div className="setup-info">
          <span className="setup-label">GitHub CLI</span>
          <span className="setup-detail">
            {status.ghAuthenticated
              ? `Authenticated as ${status.ghUser}`
              : status.ghInstalled
                ? 'Installed but not authenticated'
                : 'Not found — enables GitHub repo creation and management'}
          </span>
          {!status.ghInstalled && labels && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={() => handleInstall('gh')} disabled={!!installing}>
                {installing === 'gh' ? 'Installing...' : labels.gh}
              </button>
            </div>
          )}
          {status.ghInstalled && !status.ghAuthenticated && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={handleAuthGh}>
                Login with GitHub
              </button>
              <button className="skip-btn" onClick={refresh} style={{ marginLeft: 8 }}>
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ffmpeg */}
      <div className={itemClass(status.ffmpegInstalled)}>
        <span className="setup-icon">{icon(status.ffmpegInstalled)}</span>
        <div className="setup-info">
          <span className="setup-label">FFmpeg</span>
          <span className="setup-detail">
            {status.ffmpegInstalled
              ? 'Installed'
              : 'Optional — needed for voice features (TTS audio processing)'}
          </span>
          {!status.ffmpegInstalled && labels && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={() => handleInstall('ffmpeg')} disabled={!!installing}>
                {installing === 'ffmpeg' ? 'Installing...' : labels.ffmpeg}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -- Configuration -- */}
      <div className="setup-section-label">CONFIGURATION</div>

      {/* Statusline (D8) */}
      {statuslineInfo && (
        <div className={itemClass(statuslineInfo.hasStatusline, statuslineInfo.exists && !statuslineInfo.hasStatusline)}>
          <span className="setup-icon">{icon(statuslineInfo.hasStatusline, statuslineInfo.exists && !statuslineInfo.hasStatusline)}</span>
          <div className="setup-info">
            <span className="setup-label">Claude Code Statusline</span>
            <span className="setup-detail">
              {statuslineInfo.hasStatusline
                ? 'Statusline configured'
                : 'Not configured — shows agent status in your terminal prompt'}
            </span>
            {!statuslineInfo.hasStatusline && (
              <div className="setup-actions">
                <button
                  className="submit-btn"
                  onClick={handleConfigureStatusline}
                  disabled={statuslineConfiguring}
                >
                  {statuslineConfiguring ? 'Configuring...' : 'Configure Statusline'}
                </button>
              </div>
            )}
            {statuslineResult && (
              <span className={`setup-save-result ${statuslineResult.startsWith('Error') ? 'error' : 'success'}`}>
                {statuslineResult}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Continue */}
      <div className="setup-continue">
        <button className="create-btn" onClick={handleContinue}>
          {allGood ? (countdown > 0 ? `Launch HAL-O (${countdown})` : 'Launch HAL-O') : coreReady ? 'Continue' : 'Skip Setup'}
        </button>
        {!allGood && (
          <span className="setup-hint" style={{ marginTop: 8 }}>
            {!coreReady
              ? 'Some essential tools are missing — install them for the best experience'
              : 'Recommended tools are optional but enhance the Claude agent experience'}
          </span>
        )}
      </div>
    </div>
  )
}
