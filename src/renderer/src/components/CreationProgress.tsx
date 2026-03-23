import { useState, useEffect, useRef } from 'react'
import { Confetti } from './Confetti'
import { useI18n } from '../i18n'
import { playSuccess, playError } from '../hooks/useSounds'

interface Props {
  log: string[]
  done: boolean
  createdPath: string | null
  onBackToHub?: () => void
  onOpenTerminal?: (path: string) => void
}

// Estimate total steps based on typical creation (16 steps in ipc-handlers)
const ESTIMATED_STEPS = 16

type DevToolsChoice = 'pending' | 'yes' | 'later' | 'never' | 'done'

export function CreationProgress({ log, done, createdPath, onBackToHub, onOpenTerminal }: Props) {
  const { t } = useI18n()
  const hasError = log.some((line) => line.startsWith('[ERROR]'))
  const showConfetti = done && createdPath && !hasError

  const [devToolsChoice, setDevToolsChoice] = useState<DevToolsChoice>('pending')
  const [devToolsLog, setDevToolsLog] = useState<string[]>([])
  const [devToolsRunning, setDevToolsRunning] = useState(false)

  const soundPlayed = useRef(false)
  const autoReturnRef = useRef(false)
  useEffect(() => {
    if (done && !soundPlayed.current) {
      soundPlayed.current = true
      if (hasError) playError()
      else if (createdPath) playSuccess()
    }
    // Auto-return to hub after 5s on success — only if dev tools prompt is not active
    if (done && createdPath && !hasError && !autoReturnRef.current && onBackToHub) {
      autoReturnRef.current = true
      setTimeout(() => {
        // Don't auto-return if user is interacting with dev tools prompt
        if (devToolsChoice === 'pending') return
        onBackToHub()
      }, 5000)
    }
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDevToolsYes = async () => {
    if (!createdPath) return
    setDevToolsChoice('yes')
    setDevToolsRunning(true)
    try {
      const result = await window.api.setupDevTools(createdPath)
      setDevToolsLog(result.log)
    } catch (e: any) {
      setDevToolsLog([`[ERROR] ${e.message}`])
    }
    setDevToolsRunning(false)
    setDevToolsChoice('done')
  }

  const handleDevToolsLater = async () => {
    if (createdPath) {
      await window.api.writeDevToolsMeta(createdPath, 'later').catch(() => {})
    }
    setDevToolsChoice('later')
    // Auto-return after brief delay
    setTimeout(() => onBackToHub?.(), 2000)
  }

  const handleDevToolsNever = async () => {
    if (createdPath) {
      await window.api.writeDevToolsMeta(createdPath, 'never').catch(() => {})
    }
    setDevToolsChoice('never')
    // Auto-return after brief delay
    setTimeout(() => onBackToHub?.(), 2000)
  }

  const completedSteps = log.filter((l) => l.startsWith('[OK]')).length
  const progress = done ? 100 : Math.min(95, Math.round((completedSteps / ESTIMATED_STEPS) * 100))

  return (
    <div className="creation-progress">
      {showConfetti && <Confetti />}

      <h2>{done ? (hasError ? t('creation.doneWithErrors') : t('creation.done')) : t('creation.creating')}</h2>

      {/* Progress bar */}
      <div className="progress-bar-track">
        <div
          className={`progress-bar-fill ${done ? 'done' : ''} ${hasError ? 'error' : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {!done && (
        <span className="progress-label">{progress}%</span>
      )}

      <div className="creation-log">
        {log.map((line, i) => {
          const isSuccess = line.startsWith('[OK]')
          const isError = line.startsWith('[ERROR]')
          return (
            <div
              key={i}
              className={`creation-log-line ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''}`}
            >
              {line}
            </div>
          )
        })}
      </div>

      {/* Dev tools prompt — shown after successful creation */}
      {done && createdPath && !hasError && devToolsChoice === 'pending' && (
        <div className="dev-tools-prompt">
          <div className="dev-tools-prompt-text">
            Set up automated testing &amp; dev tools for this project?
          </div>
          <div className="dev-tools-prompt-actions">
            <button className="done-btn primary" onClick={handleDevToolsYes}>
              YES
            </button>
            <button className="done-btn secondary" onClick={handleDevToolsLater}>
              LATER (7d)
            </button>
            <button className="done-btn secondary dev-tools-dismiss" onClick={handleDevToolsNever}>
              DON'T ASK
            </button>
          </div>
        </div>
      )}

      {/* Dev tools setup log */}
      {(devToolsChoice === 'yes' || devToolsChoice === 'done') && (
        <div className="dev-tools-setup-log">
          {devToolsRunning && (
            <div className="dev-tools-running">
              <div className="analysis-spinner" style={{ width: 16, height: 16, display: 'inline-block', marginRight: 8 }} />
              Setting up dev tools...
            </div>
          )}
          {devToolsLog.map((line, i) => {
            const isSuccess = line.startsWith('[OK]')
            const isError = line.startsWith('[ERROR]')
            return (
              <div
                key={i}
                className={`creation-log-line ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''}`}
              >
                {line}
              </div>
            )
          })}
        </div>
      )}

      {done && createdPath && (devToolsChoice !== 'pending' || hasError) && (
        <div className="creation-done">
          {onOpenTerminal && (
            <button
              className="done-btn primary"
              onClick={() => { onOpenTerminal(createdPath); onBackToHub?.() }}
            >
              OPEN IN HAL
            </button>
          )}
          <button
            className="done-btn secondary"
            onClick={() => window.api.openFolder(createdPath)}
          >
            OPEN FOLDER
          </button>
          <button
            className="done-btn secondary"
            onClick={() => onBackToHub ? onBackToHub() : window.location.reload()}
          >
            BACK TO HUB
          </button>
          {(devToolsChoice === 'later' || devToolsChoice === 'never' || devToolsChoice === 'done') && (
            <div className="creation-auto-return">Returning to hub...</div>
          )}
        </div>
      )}
    </div>
  )
}
