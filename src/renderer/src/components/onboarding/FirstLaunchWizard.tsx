import { useState, useEffect, useCallback, useRef } from 'react'
import { Step1Welcome } from './Step1Welcome'
import { Step2Provider } from './Step2Provider'
import { Step3Voice } from './Step3Voice'
import { Step4Projects } from './Step4Projects'
import { Step5Ready } from './Step5Ready'

export interface WizardConfig {
  persona: string | null
  provider: string | null
  apiKey: string
  voiceEnabled: boolean
  voiceProfile: string
  importedProjects: string[]
  useDemoMode: boolean
}

interface Props {
  onComplete: (config: WizardConfig) => void
}

const TOTAL_STEPS = 5

const STEP_LABELS = [
  'Welcome',
  'AI Provider',
  'Voice',
  'Projects',
  'Ready',
]

export function FirstLaunchWizard({ onComplete }: Props) {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState<WizardConfig>({
    persona: null,
    provider: null,
    apiKey: '',
    voiceEnabled: false,
    voiceProfile: 'auto',
    importedProjects: [],
    useDemoMode: false,
  })
  const [transitioning, setTransitioning] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Animate step transitions
  const goToStep = useCallback((nextStep: number) => {
    if (nextStep < 1 || nextStep > TOTAL_STEPS) return
    setTransitioning(true)
    setTimeout(() => {
      setStep(nextStep)
      setTransitioning(false)
    }, 200)
  }, [])

  const handleNext = useCallback(() => goToStep(step + 1), [step, goToStep])
  const handleBack = useCallback(() => goToStep(step - 1), [step, goToStep])

  const updateConfig = useCallback((patch: Partial<WizardConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }))
  }, [])

  const handleComplete = useCallback((useDemoMode: boolean) => {
    const finalConfig = { ...config, useDemoMode }
    onComplete(finalConfig)
  }, [config, onComplete])

  // Quick Setup: skip to Step 5 with sensible defaults
  const handleQuickSetup = useCallback(() => {
    setConfig({
      persona: 'developer',
      provider: null,
      apiKey: '',
      voiceEnabled: false,
      voiceProfile: 'auto',
      importedProjects: [],
      useDemoMode: false,
    })
    goToStep(5)
  }, [goToStep])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step > 1) {
        handleBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, handleBack])

  // Determine if Next is enabled per step
  const canProceed = (() => {
    switch (step) {
      case 1: return config.persona !== null
      case 2: return true // provider is optional (can skip)
      case 3: return true // voice is optional
      case 4: return true // projects are optional
      case 5: return true
      default: return false
    }
  })()

  return (
    <div style={styles.container}>
      {/* Step indicator */}
      <div style={styles.stepIndicator}>
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const isActive = stepNum === step
          const isCompleted = stepNum < step
          return (
            <div key={stepNum} style={styles.stepRow}>
              <div
                style={{
                  ...styles.dot,
                  ...(isActive ? styles.dotActive : {}),
                  ...(isCompleted ? styles.dotCompleted : {}),
                }}
              >
                {isCompleted ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#fff' : 'var(--text-dim)' }}>
                    {stepNum}
                  </span>
                )}
              </div>
              <span style={{
                ...styles.stepLabel,
                color: isActive ? 'var(--primary)' : isCompleted ? 'var(--text-secondary)' : 'var(--text-dim)',
                fontWeight: isActive ? 600 : 400,
              }}>
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <div style={{
                  ...styles.connector,
                  background: isCompleted ? 'var(--primary)' : 'var(--border)',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div
        ref={contentRef}
        style={{
          ...styles.content,
          opacity: transitioning ? 0 : 1,
          transform: transitioning ? 'translateY(8px)' : 'translateY(0)',
        }}
      >
        {step === 1 && (
          <Step1Welcome
            selected={config.persona}
            onSelect={(p) => updateConfig({ persona: p })}
            onQuickSetup={handleQuickSetup}
          />
        )}
        {step === 2 && (
          <Step2Provider
            selected={config.provider}
            apiKey={config.apiKey}
            onSelect={(p) => updateConfig({ provider: p })}
            onApiKeyChange={(k) => updateConfig({ apiKey: k })}
          />
        )}
        {step === 3 && (
          <Step3Voice
            enabled={config.voiceEnabled}
            profile={config.voiceProfile}
            onToggle={(v) => updateConfig({ voiceEnabled: v })}
            onProfileChange={(p) => updateConfig({ voiceProfile: p })}
          />
        )}
        {step === 4 && (
          <Step4Projects
            selected={config.importedProjects}
            onSelectionChange={(p) => updateConfig({ importedProjects: p })}
          />
        )}
        {step === 5 && (
          <Step5Ready
            config={config}
            onLaunch={() => handleComplete(false)}
            onDemo={() => handleComplete(true)}
          />
        )}
      </div>

      {/* Navigation */}
      {step < 5 && (
        <div style={styles.nav}>
          <button
            onClick={handleBack}
            disabled={step === 1}
            style={{
              ...styles.navBtn,
              ...(step === 1 ? styles.navBtnDisabled : {}),
            }}
          >
            Back
          </button>
          <div style={styles.navSpacer} />
          {step < 5 && (
            <button
              onClick={handleNext}
              style={styles.skipBtn}
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed}
            style={{
              ...styles.nextBtn,
              ...(!canProceed ? styles.nextBtnDisabled : {}),
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ── Styles ──

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--bg-base)',
    color: 'var(--text)',
    overflow: 'hidden',
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    padding: '24px 32px 16px',
    flexShrink: 0,
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--border)',
    background: 'var(--bg-surface)',
    transition: 'all 0.3s ease',
    flexShrink: 0,
  },
  dotActive: {
    border: '2px solid var(--primary)',
    background: 'var(--primary)',
    boxShadow: '0 0 12px color-mix(in srgb, var(--primary) 40%, transparent)',
  },
  dotCompleted: {
    border: '2px solid var(--primary)',
    background: 'var(--primary)',
  },
  stepLabel: {
    fontSize: 13,
    whiteSpace: 'nowrap' as const,
    transition: 'color 0.3s ease',
  },
  connector: {
    width: 40,
    height: 2,
    marginInline: 8,
    borderRadius: 1,
    transition: 'background 0.3s ease',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '0 48px 24px',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 48px 24px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
  },
  navBtn: {
    padding: '8px 20px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  navBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  navSpacer: {
    flex: 1,
  },
  skipBtn: {
    padding: '8px 20px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontSize: 13,
    cursor: 'pointer',
    marginRight: 8,
  },
  nextBtn: {
    padding: '10px 28px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  nextBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
}
