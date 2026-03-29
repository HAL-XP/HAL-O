import type { WizardConfig } from './FirstLaunchWizard'

interface Props {
  config: WizardConfig
  onLaunch: () => void
  onDemo: () => void
}

const PERSONA_LABELS: Record<string, string> = {
  developer: 'Developer Brain',
  assistant: 'Personal Assistant',
  workhub: 'Work Hub',
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  ollama: 'Ollama (Local)',
  openai: 'OpenAI',
  skip: 'None (Demo mode)',
}

export function Step5Ready({ config, onLaunch, onDemo }: Props) {
  const summaryItems = [
    {
      label: 'Persona',
      value: config.persona ? PERSONA_LABELS[config.persona] || config.persona : 'Not set',
      ok: !!config.persona,
    },
    {
      label: 'AI Provider',
      value: config.provider ? PROVIDER_LABELS[config.provider] || config.provider : 'Not set',
      ok: !!config.provider && config.provider !== 'skip',
    },
    {
      label: 'Voice',
      value: config.voiceEnabled
        ? `Enabled (${config.voiceProfile === 'auto' ? 'Auto' : config.voiceProfile.toUpperCase()})`
        : 'Disabled',
      ok: true, // Voice is optional, always OK
    },
    {
      label: 'Projects',
      value: config.importedProjects.length > 0
        ? `${config.importedProjects.length} project${config.importedProjects.length === 1 ? '' : 's'}`
        : 'None imported',
      ok: config.importedProjects.length > 0,
    },
  ]

  return (
    <div style={styles.wrapper}>
      <div style={styles.heroIcon}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="var(--primary)" strokeWidth="3" />
          <path d="M16 24L22 30L33 18" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 style={styles.heading}>You're Ready</h2>
      <p style={styles.subheading}>
        Here's a summary of your setup. You can change any of these in Settings later.
      </p>

      {/* Summary cards */}
      <div style={styles.summary}>
        {summaryItems.map((item) => (
          <div key={item.label} style={styles.summaryRow}>
            <span style={{
              ...styles.checkMark,
              color: item.ok ? 'var(--success)' : 'var(--text-dim)',
            }}>
              {item.ok ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <span style={styles.summaryLabel}>{item.label}</span>
            <span style={styles.summaryValue}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={styles.actions}>
        <button onClick={onLaunch} style={styles.launchBtn}>
          Launch HAL-O
        </button>
        <button onClick={onDemo} style={styles.demoBtn}>
          Try Demo First
        </button>
      </div>

      <p style={styles.settingsHint}>
        Access the wizard again anytime: Settings &gt; Help &gt; First-Launch Guide
      </p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 24,
    maxWidth: 500,
    margin: '0 auto',
  },
  heroIcon: {
    marginBottom: 16,
    opacity: 0.9,
  },
  heading: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
    color: 'var(--text)',
  },
  subheading: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    marginBottom: 28,
    textAlign: 'center' as const,
  },
  summary: {
    width: '100%',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    marginBottom: 32,
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 18px',
    borderBottom: '1px solid var(--border)',
  },
  checkMark: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    width: 100,
    flexShrink: 0,
  },
  summaryValue: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    flex: 1,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    maxWidth: 300,
    marginBottom: 20,
  },
  launchBtn: {
    padding: '14px 32px',
    borderRadius: 'var(--radius)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 16px color-mix(in srgb, var(--primary) 30%, transparent)',
    textAlign: 'center' as const,
  },
  demoBtn: {
    padding: '10px 24px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center' as const,
  },
  settingsHint: {
    fontSize: 12,
    color: 'var(--text-dim)',
    textAlign: 'center' as const,
  },
}
