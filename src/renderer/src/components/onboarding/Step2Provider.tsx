import { useState, useCallback } from 'react'

interface Props {
  selected: string | null
  apiKey: string
  onSelect: (provider: string) => void
  onApiKeyChange: (key: string) => void
}

const PROVIDERS = [
  {
    id: 'anthropic',
    title: 'Anthropic',
    description: 'Claude models via API key. Recommended for the best HAL-O experience.',
    pricing: '~$20/mo API usage (pay-as-you-go)',
    badge: 'Recommended',
    needsKey: true,
  },
  {
    id: 'ollama',
    title: 'Ollama (Local)',
    description: 'Run models locally on your machine. Free, private, no API key needed.',
    pricing: 'Free -- runs on your GPU, no internet needed',
    badge: 'Free',
    needsKey: false,
  },
  {
    id: 'openai',
    title: 'OpenAI',
    description: 'GPT models via API key. Good alternative if you already have an account.',
    pricing: '~$20/mo API usage',
    badge: null,
    needsKey: true,
  },
  {
    id: 'skip',
    title: 'Skip for now',
    description: 'Use demo mode without any AI provider. You can set this up later.',
    pricing: 'Use HAL-O features without AI for now',
    badge: null,
    needsKey: false,
  },
]

export function Step2Provider({ selected, apiKey, onSelect, onApiKeyChange }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showApiKeyTooltip, setShowApiKeyTooltip] = useState(false)

  const selectedProvider = PROVIDERS.find(p => p.id === selected)
  const needsKey = selectedProvider?.needsKey ?? false

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      // Use the existing save-api-key + check-prerequisites flow
      const saveResult = await window.api.saveApiKey(apiKey.trim(), 'claude-credentials')
      if (saveResult.success) {
        const status = await window.api.checkPrerequisites()
        if (status.apiKeyFound) {
          setTestResult({ ok: true, message: 'API key saved and verified.' })
        } else {
          setTestResult({ ok: false, message: 'Key saved but could not verify. It may still work.' })
        }
      } else {
        setTestResult({ ok: false, message: saveResult.error || 'Failed to save key.' })
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || 'Connection test failed.' })
    }
    setTesting(false)
  }, [apiKey])

  return (
    <div style={styles.wrapper}>
      <h2 style={styles.heading}>AI Provider</h2>
      <p style={styles.subheading}>How do you want to run AI?</p>
      <p style={styles.changeLater}>You can change this later in Settings. Nothing here is permanent.</p>

      <div style={styles.grid}>
        {PROVIDERS.map((p) => {
          const isSelected = selected === p.id
          return (
            <button
              key={p.id}
              onClick={() => { onSelect(p.id); setTestResult(null) }}
              style={{
                ...styles.card,
                ...(isSelected ? styles.cardSelected : {}),
              }}
            >
              <div style={styles.cardHeader}>
                <h3 style={{
                  ...styles.cardTitle,
                  color: isSelected ? 'var(--primary)' : 'var(--text)',
                }}>
                  {p.title}
                </h3>
                {p.badge && (
                  <span style={{
                    ...styles.badge,
                    background: p.badge === 'Recommended'
                      ? 'color-mix(in srgb, var(--primary) 20%, transparent)'
                      : 'color-mix(in srgb, var(--success) 20%, transparent)',
                    color: p.badge === 'Recommended' ? 'var(--primary)' : 'var(--success)',
                  }}>
                    {p.badge}
                  </span>
                )}
              </div>
              <p style={styles.cardDesc}>{p.description}</p>
              <p style={styles.cardPricing}>{p.pricing}</p>
            </button>
          )
        })}
      </div>

      {/* API key input (shown when a cloud provider is selected) */}
      {selected && needsKey && (
        <div style={styles.keySection}>
          <label style={styles.keyLabel}>
            API Key
            <span
              style={styles.tooltipAnchor}
              onMouseEnter={() => setShowApiKeyTooltip(true)}
              onMouseLeave={() => setShowApiKeyTooltip(false)}
            >
              <span style={styles.tooltipIcon}>?</span>
              {showApiKeyTooltip && (
                <span style={styles.tooltipPopup}>
                  An API key is like a password that lets HAL-O talk to the AI. Get one from the provider's website.
                </span>
              )}
            </span>
          </label>
          <div style={styles.keyRow}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => { onApiKeyChange(e.target.value); setTestResult(null) }}
              placeholder={selected === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              style={styles.keyInput}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={styles.toggleBtn}
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
            <button
              onClick={handleTest}
              disabled={!apiKey.trim() || testing}
              style={{
                ...styles.testBtn,
                ...(!apiKey.trim() || testing ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
              }}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          {testResult && (
            <div style={{
              ...styles.testResult,
              color: testResult.ok ? 'var(--success)' : 'var(--error)',
            }}>
              {testResult.ok ? '  ' : '  '}{testResult.message}
            </div>
          )}
        </div>
      )}

      {/* Help me decide */}
      {!selected && (
        <button
          onClick={() => setShowHelp(h => !h)}
          style={styles.helpBtn}
        >
          {showHelp ? 'Got it, thanks' : 'Not sure which to pick?'}
        </button>
      )}

      {showHelp && !selected && (
        <div style={styles.helpBox}>
          <p style={styles.helpText}>
            <strong>Anthropic</strong> is recommended for the best experience -- Claude models power HAL-O's AI features. Requires an API key (pay-as-you-go).
          </p>
          <p style={styles.helpText}>
            <strong>Ollama</strong> is free and runs entirely on your machine. Great for privacy, but requires a decent GPU (8GB+ VRAM).
          </p>
          <p style={styles.helpTextDim}>
            You can always change providers later in Settings, or skip entirely and use demo mode.
          </p>
        </div>
      )}

      {/* Ollama auto-detect hint */}
      {selected === 'ollama' && (
        <div style={styles.hint}>
          HAL-O will automatically connect to Ollama at localhost:11434.
          Make sure Ollama is running before you continue.
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 24,
    maxWidth: 640,
    margin: '0 auto',
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 6,
    color: 'var(--text)',
  },
  subheading: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  changeLater: {
    fontSize: 12,
    color: 'var(--text-dim)',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    width: '100%',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 18px',
    borderRadius: 'var(--radius)',
    border: '2px solid var(--border)',
    background: 'var(--bg-surface)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left' as const,
    outline: 'none',
  },
  cardSelected: {
    borderColor: 'var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-surface))',
    boxShadow: '0 0 16px color-mix(in srgb, var(--primary) 15%, transparent)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    transition: 'color 0.2s ease',
    margin: 0,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 1.4,
    color: 'var(--text-secondary)',
    margin: 0,
  },
  cardPricing: {
    fontSize: 11,
    lineHeight: 1.4,
    color: 'var(--text-dim)',
    margin: '6px 0 0',
    fontStyle: 'italic',
  },
  keySection: {
    width: '100%',
    marginTop: 20,
    padding: '16px 20px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
  },
  keyLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  tooltipAnchor: {
    position: 'relative' as const,
    display: 'inline-flex',
  },
  tooltipIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '1px solid var(--text-dim)',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-dim)',
    cursor: 'help',
    lineHeight: 1,
  },
  tooltipPopup: {
    position: 'absolute' as const,
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 240,
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
    zIndex: 10,
    pointerEvents: 'none' as const,
    whiteSpace: 'normal' as const,
  },
  keyRow: {
    display: 'flex',
    gap: 8,
  },
  keyInput: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'monospace',
    outline: 'none',
  },
  toggleBtn: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
  },
  testBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  testResult: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: 500,
  },
  hint: {
    width: '100%',
    marginTop: 16,
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-surface))',
    border: '1px solid color-mix(in srgb, var(--primary) 20%, var(--border))',
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  helpBtn: {
    marginTop: 16,
    padding: '6px 16px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'transparent',
    color: 'var(--primary)',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    opacity: 0.85,
    width: '100%',
    textAlign: 'center' as const,
  },
  helpBox: {
    width: '100%',
    padding: '16px 20px',
    borderRadius: 'var(--radius)',
    background: 'color-mix(in srgb, var(--primary) 6%, var(--bg-surface))',
    border: '1px solid color-mix(in srgb, var(--primary) 20%, var(--border))',
    marginTop: 8,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--text)',
    margin: '0 0 8px',
  },
  helpTextDim: {
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--text-dim)',
    margin: 0,
  },
}
