import { useEffect, useRef } from 'react'
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

export function CreationProgress({ log, done, createdPath, onBackToHub, onOpenTerminal }: Props) {
  const { t } = useI18n()
  const hasError = log.some((line) => line.startsWith('[ERROR]'))
  const showConfetti = done && createdPath && !hasError

  const soundPlayed = useRef(false)
  const autoReturnRef = useRef(false)
  useEffect(() => {
    if (done && !soundPlayed.current) {
      soundPlayed.current = true
      if (hasError) playError()
      else if (createdPath) playSuccess()
    }
    // Auto-return to hub after 5s on success
    if (done && createdPath && !hasError && !autoReturnRef.current && onBackToHub) {
      autoReturnRef.current = true
      setTimeout(() => onBackToHub(), 5000)
    }
  }, [done])

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

      {done && createdPath && (
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
          <div className="creation-auto-return">Returning to hub in 5 seconds...</div>
        </div>
      )}
    </div>
  )
}
