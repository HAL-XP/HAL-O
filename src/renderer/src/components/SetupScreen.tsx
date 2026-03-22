import { useState, useEffect } from 'react'
import type { PrerequisiteStatus } from '../types'
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

export function SetupScreen({ onReady }: Props) {
  const { t } = useI18n()
  const [status, setStatus] = useState<PrerequisiteStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [saveLocation, setSaveLocation] = useState('env-local-project')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [ghInstallLabel, setGhInstallLabel] = useState('Install')

  const refresh = () => {
    setLoading(true)
    window.api.checkPrerequisites().then((s) => {
      setStatus(s)
      setLoading(false)
    })
  }

  // ALL hooks at the top, before any conditional return
  useEffect(() => {
    refresh()
    window.api.getGhInstallLabel().then(setGhInstallLabel).catch(() => {})
  }, [])

  // Auto-skip if everything's good and user has seen setup before
  useEffect(() => {
    if (loading || !status) return
    const allGood = status.apiKeyFound && status.ghAuthenticated
    const hasSeenSetup = localStorage.getItem('hal-o-setup-done') === '1'
    if (allGood && hasSeenSetup) onReady()
  }, [loading, status])

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

  const allGood = status.apiKeyFound && status.ghAuthenticated

  const handleContinue = () => {
    localStorage.setItem('hal-o-setup-done', '1')
    onReady()
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

  const handleInstallGh = async () => {
    setInstalling(true)
    const result = await window.api.installGhCli()
    setInstalling(false)
    if (result.success) {
      refresh()
    }
  }

  const handleAuthGh = async () => {
    await window.api.authGhCli()
    setTimeout(refresh, 5000)
  }

  return (
    <div className="setup-screen">
      <h2>{t('setup.title')}</h2>
      <p className="setup-subtitle">{t('setup.subtitle')}</p>

      {/* Node.js */}
      <div className="setup-item ok">
        <span className="setup-icon">&#10003;</span>
        <div className="setup-info">
          <span className="setup-label">{t('setup.nodejs')}</span>
          <span className="setup-detail">{status.nodeVersion}</span>
        </div>
      </div>

      {/* gh CLI */}
      <div className={`setup-item ${status.ghAuthenticated ? 'ok' : status.ghInstalled ? 'warn' : 'missing'}`}>
        <span className="setup-icon">
          {status.ghAuthenticated ? '\u2713' : status.ghInstalled ? '!' : '\u2717'}
        </span>
        <div className="setup-info">
          <span className="setup-label">{t('setup.ghCli')}</span>
          <span className="setup-detail">
            {status.ghAuthenticated
              ? t('setup.ghAuthenticated', { user: status.ghUser })
              : status.ghInstalled
                ? t('setup.ghInstalledNotAuth')
                : t('setup.ghNotInstalled')}
          </span>
          {!status.ghInstalled && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={handleInstallGh} disabled={installing}>
                {installing ? t('setup.installing') : ghInstallLabel}
              </button>
              <span className="setup-hint">{t('setup.orInstallManually')}</span>
            </div>
          )}
          {status.ghInstalled && !status.ghAuthenticated && (
            <div className="setup-actions">
              <button className="submit-btn" onClick={handleAuthGh}>
                {t('setup.openTerminalAuth')}
              </button>
              <button className="skip-btn" onClick={refresh} style={{ marginLeft: 8 }}>
                {t('setup.refreshAuth')}
              </button>
            </div>
          )}
          {!status.ghInstalled && (
            <span className="setup-optional">{t('setup.ghOptional')}</span>
          )}
        </div>
      </div>

      {/* API Key */}
      <div className={`setup-item ${status.apiKeyFound ? 'ok' : 'missing'}`}>
        <span className="setup-icon">
          {status.apiKeyFound ? '\u2713' : '\u2717'}
        </span>
        <div className="setup-info">
          <span className="setup-label">{t('setup.apiKey')}</span>
          <span className="setup-detail">
            {status.apiKeyFound
              ? t('setup.apiKeyFound', { source: status.apiKeySource, preview: status.apiKeyPreview })
              : t('setup.apiKeyNotFound')}
          </span>

          {!status.apiKeyFound && (
            <>
              <div className="setup-key-input">
                <input
                  className="text-input"
                  type="password"
                  placeholder={t('setup.apiKeyPlaceholder')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey() }}
                  style={{ marginTop: 8, maxWidth: 400 }}
                />
                <span className="setup-link">
                  {t('setup.getKeyAt')}
                </span>
              </div>

              <div className="setup-location-picker">
                <span className="setup-location-label">{t('setup.saveTo')}</span>
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
                      <span className="setup-location-name">{t(`setup.loc.${loc.id.replace(/-/g, '')}.label`) !== `setup.loc.${loc.id.replace(/-/g, '')}.label` ? t(`setup.loc.${loc.id.replace(/-/g, '')}.label`) : loc.label}</span>
                      <span className="setup-location-desc">{t(`setup.loc.${loc.id.replace(/-/g, '')}.desc`) !== `setup.loc.${loc.id.replace(/-/g, '')}.desc` ? t(`setup.loc.${loc.id.replace(/-/g, '')}.desc`) : loc.description}</span>
                      {loc.risk === 'medium' && (
                        <span className="setup-location-warn">
                          &#9888; {t('setup.riskWarning')}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="setup-actions">
                <button className="submit-btn" onClick={handleSaveKey} disabled={saving || !apiKey.trim()}>
                  {saving ? t('setup.saving') : t('setup.saveKey')}
                </button>
              </div>
              {saveResult && (
                <span className={`setup-save-result ${saveResult.startsWith('Error') ? 'error' : 'success'}`}>
                  {saveResult}
                </span>
              )}
              <span className="setup-optional">{t('setup.apiKeyOptional')}</span>
            </>
          )}
        </div>
      </div>

      {/* Continue */}
      <div className="setup-continue">
        <button className="create-btn" onClick={handleContinue}>
          {allGood ? t('setup.startWizard') : t('setup.continueAnyway')}
        </button>
        {!allGood && (
          <span className="setup-hint" style={{ marginTop: 8 }}>
            {t('setup.missingOptional')}
          </span>
        )}
      </div>
    </div>
  )
}
