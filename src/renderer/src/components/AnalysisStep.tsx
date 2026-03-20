import { useState, useEffect } from 'react'
import type { Answers, ProjectAnalysis } from '../types'
import { useI18n } from '../i18n'
import { Logo } from './Logo'

interface Props {
  answers: Answers
  onAccept: (analysis: ProjectAnalysis) => void
  onManual: () => void
  onBack: () => void
  canGoBack: boolean
}

const PROGRESS_STEPS = [
  'analysis.step.scanning',
  'analysis.step.searching',
  'analysis.step.evaluating',
  'analysis.step.finalizing',
]

// Cycle time in ms for each progress message
const STEP_INTERVAL = 2500

export function AnalysisStep({ answers, onAccept, onManual, onBack, canGoBack }: Props) {
  const { t, lang } = useI18n()
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progressIdx, setProgressIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const name = String(answers['project-name']?.value || '')
  const description = String(answers['project-description']?.value || '')
  const location = String(answers['project-location']?.value || '')

  // Progress ticker
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1)
      setProgressIdx((prev) => Math.min(prev + 1, PROGRESS_STEPS.length - 1))
    }, STEP_INTERVAL)
    return () => clearInterval(interval)
  }, [loading])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setProgressIdx(0)
    setElapsed(0)

    window.api.analyzeProject(name, description, location, lang)
      .then((result) => {
        if (!cancelled) {
          const r = result as ProjectAnalysis
          if (r.techStack) {
            setAnalysis(r)
          } else {
            setError(r.reasoning || 'Analysis returned no results.')
          }
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e))
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [name, description, location])

  if (loading) {
    const step = PROGRESS_STEPS[progressIdx]
    const stepText = t(step) !== step ? t(step) : [
      'Scanning project folder...',
      'Searching the web for latest frameworks...',
      'Evaluating best stack options...',
      'Finalizing recommendation...',
    ][progressIdx]

    return (
      <div className="message">
        <div className="message-assistant">
          <div className="message-avatar"><Logo size={22} /></div>
          <div className="message-content">
            <strong>{t('analysis.analyzing')}</strong><br />
            <span style={{ color: 'var(--text-secondary)' }}>{stepText}</span>
            <div className="analysis-spinner" />
            {elapsed > 3 && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                {t('analysis.usingWebSearch') !== 'analysis.usingWebSearch'
                  ? t('analysis.usingWebSearch')
                  : 'Using Sonnet + web search for up-to-date suggestions...'}
              </div>
            )}
          </div>
        </div>
        {canGoBack && (
          <div className="input-row" style={{ marginTop: 12 }}>
            <button className="back-btn" onClick={onBack}>{t('ui.back')}</button>
            <button className="skip-btn" onClick={onManual}>{t('analysis.setupManually')}</button>
          </div>
        )}
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="message">
        <div className="message-assistant">
          <div className="message-avatar"><Logo size={22} /></div>
          <div className="message-content">
            {error && (
              <pre style={{
                color: 'var(--text-secondary)',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                margin: 0,
                lineHeight: 1.6,
              }}>{error}</pre>
            )}
            <br />{t('analysis.manualFallback')}
          </div>
        </div>
        <div className="input-row" style={{ marginTop: 12 }}>
          {canGoBack && <button className="back-btn" onClick={onBack}>Back</button>}
          <button className="submit-btn" onClick={onManual}>{t('analysis.setupManually')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="message">
      <div className="message-assistant">
        <div className="message-avatar"><Logo size={22} /></div>
        <div className="message-content">
          <strong>{t('analysis.suggestion')}</strong>
          {analysis.folderDetected && (
            <span style={{ color: 'var(--success)', fontSize: 12, marginLeft: 8 }}>
              ({t('analysis.detectedFiles')})
            </span>
          )}
          <br />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{analysis.reasoning}</span>
        </div>
      </div>

      <div className="analysis-card">
        <div className="analysis-row">
          <span className="analysis-label">Stack</span>
          <span className="analysis-value">{analysis.techStackLabel || analysis.techStack}</span>
        </div>
        <div className="analysis-row">
          <span className="analysis-label">Languages</span>
          <div className="review-tags" style={{ justifyContent: 'flex-start' }}>
            {analysis.languages.map((l) => (
              <span key={l} className="review-tag">{l}</span>
            ))}
          </div>
        </div>
        {analysis.styling && analysis.styling !== 'none' && (
          <div className="analysis-row">
            <span className="analysis-label">Styling</span>
            <span className="analysis-value">{analysis.styling}</span>
          </div>
        )}
        {analysis.database && analysis.database !== 'none' && (
          <div className="analysis-row">
            <span className="analysis-label">Database</span>
            <span className="analysis-value">{analysis.database}</span>
          </div>
        )}
        {analysis.conventions.length > 0 && (
          <div className="analysis-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span className="analysis-label">Conventions</span>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13 }}>
              {analysis.conventions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="choices-grid" style={{ marginTop: 12 }}>
        <button className="choice-btn selected" onClick={() => onAccept(analysis)}
          style={{ flex: 1, textAlign: 'center', justifyContent: 'center' }}>
          {t('analysis.looksGood')}
        </button>
        <button className="choice-btn" onClick={onManual}
          style={{ textAlign: 'center', justifyContent: 'center' }}>
          {t('analysis.letMeAdjust')}
        </button>
      </div>

      <div className="input-row" style={{ marginTop: 8 }}>
        {canGoBack && <button className="back-btn" onClick={onBack}>Back</button>}
      </div>
    </div>
  )
}
