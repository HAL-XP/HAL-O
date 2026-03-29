import { useState, useCallback } from 'react'

interface Props {
  selected: string | null
  onSelect: (persona: string) => void
  onQuickSetup: () => void
}

const PERSONAS = [
  {
    id: 'developer',
    title: 'Developer Brain',
    description: 'Terminal, multi-project management, git, voice commands, AI pair programming.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="6" width="24" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M9 14L13 17L9 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="15" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'assistant',
    title: 'Personal Assistant',
    description: 'Calendar, notes, email integration, voice-first interaction, daily briefing.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
        <path d="M8 26C8 21.5817 11.5817 18 16 18C20.4183 18 24 21.5817 24 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'workhub',
    title: 'Work Hub',
    description: 'Team projects, status dashboard, integrations, code review workflows.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="4" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="18" y="4" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="4" y="18" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="18" y="18" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
]

export function Step1Welcome({ selected, onSelect, onQuickSetup }: Props) {
  const [showHelp, setShowHelp] = useState(false)

  const handleClick = useCallback((id: string) => {
    onSelect(id)
  }, [onSelect])

  return (
    <div style={styles.wrapper}>
      <h1 style={styles.heading}>Welcome to HAL-O</h1>

      {/* "What is HAL-O?" intro -- explain before asking questions */}
      <div style={styles.introBox}>
        <p style={styles.introItem}>
          <strong>Your AI-powered development hub</strong> -- manage multiple projects, terminals, and AI assistants from one interface.
        </p>
        <p style={styles.introItem}>
          <strong>Built-in AI pair programming</strong> -- connect your preferred AI provider (Anthropic, OpenAI, or local models) to get intelligent code assistance.
        </p>
        <p style={styles.introItem}>
          <strong>Voice-optional, keyboard-first</strong> -- use voice commands if you want, but everything works with keyboard and mouse too.
        </p>
      </div>

      <p style={styles.subheading}>What do you want to build?</p>

      <div style={styles.grid}>
        {PERSONAS.map((p) => {
          const isSelected = selected === p.id
          return (
            <button
              key={p.id}
              onClick={() => handleClick(p.id)}
              style={{
                ...styles.card,
                ...(isSelected ? styles.cardSelected : {}),
              }}
            >
              <div style={{
                ...styles.iconWrap,
                color: isSelected ? 'var(--primary)' : 'var(--text-secondary)',
              }}>
                {p.icon}
              </div>
              <h3 style={{
                ...styles.cardTitle,
                color: isSelected ? 'var(--primary)' : 'var(--text)',
              }}>
                {p.title}
              </h3>
              <p style={styles.cardDesc}>{p.description}</p>
            </button>
          )
        })}
      </div>

      {/* Help me decide */}
      <button
        onClick={() => { setShowHelp(h => !h) }}
        style={styles.helpBtn}
      >
        {showHelp ? 'Got it, thanks' : 'Not sure what to pick?'}
      </button>

      {showHelp && (
        <div style={styles.helpBox}>
          <p style={styles.helpText}>
            <strong>Start with Developer Brain</strong> -- it gives you the full experience with terminals, AI pair programming, and project management. You can always switch later.
          </p>
          <p style={styles.helpTextDim}>
            Personal Assistant and Work Hub tailor the interface for non-coding workflows, but all features remain accessible regardless of your choice.
          </p>
          <button
            onClick={() => { onSelect('developer'); setShowHelp(false) }}
            style={styles.helpSelectBtn}
          >
            Go with Developer Brain
          </button>
        </div>
      )}

      <p style={styles.changeLater}>
        You can change this later in Settings. This just tailors your initial experience.
      </p>

      {/* Quick Setup for power users */}
      <button onClick={onQuickSetup} style={styles.quickBtn}>
        Quick Setup -- skip wizard with sensible defaults
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 20,
    maxWidth: 700,
    margin: '0 auto',
  },
  heading: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 16,
    color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  introBox: {
    width: '100%',
    padding: '16px 20px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    marginBottom: 24,
  },
  introItem: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    margin: '0 0 8px',
  },
  subheading: {
    fontSize: 17,
    color: 'var(--text-secondary)',
    marginBottom: 16,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    width: '100%',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '28px 20px 24px',
    borderRadius: 'var(--radius)',
    border: '2px solid var(--border)',
    background: 'var(--bg-surface)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center' as const,
    outline: 'none',
  },
  cardSelected: {
    borderColor: 'var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-surface))',
    boxShadow: '0 0 20px color-mix(in srgb, var(--primary) 20%, transparent)',
  },
  iconWrap: {
    marginBottom: 16,
    transition: 'color 0.2s ease',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 8,
    transition: 'color 0.2s ease',
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
    margin: 0,
  },
  changeLater: {
    fontSize: 12,
    color: 'var(--text-dim)',
    marginTop: 12,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  quickBtn: {
    padding: '8px 20px',
    borderRadius: 'var(--radius-sm)',
    border: '1px dashed var(--border)',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
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
    transition: 'opacity 0.2s ease',
  },
  helpBox: {
    width: '100%',
    padding: '16px 20px',
    borderRadius: 'var(--radius)',
    background: 'color-mix(in srgb, var(--primary) 6%, var(--bg-surface))',
    border: '1px solid color-mix(in srgb, var(--primary) 20%, var(--border))',
    marginTop: 8,
    textAlign: 'center' as const,
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
    margin: '0 0 12px',
  },
  helpSelectBtn: {
    padding: '6px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
    color: 'var(--primary)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
}
