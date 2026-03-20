import { useEffect, useRef } from 'react'
import { Confetti } from './Confetti'
import { useI18n } from '../i18n'
import { playSuccess, playError } from '../hooks/useSounds'

interface Props {
  log: string[]
  done: boolean
  createdPath: string | null
}

// Estimate total steps based on typical creation (16 steps in ipc-handlers)
const ESTIMATED_STEPS = 16

export function CreationProgress({ log, done, createdPath }: Props) {
  const { t } = useI18n()
  const hasError = log.some((line) => line.startsWith('[ERROR]'))
  const showConfetti = done && createdPath && !hasError

  const soundPlayed = useRef(false)
  useEffect(() => {
    if (done && !soundPlayed.current) {
      soundPlayed.current = true
      if (hasError) playError()
      else if (createdPath) playSuccess()
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
          <button
            className="done-btn primary"
            onClick={() => window.api.openFolder(createdPath)}
          >
            {t('creation.openFolder')}
          </button>
          <button
            className="done-btn secondary"
            onClick={() => window.api.openInClaude(createdPath)}
          >
            {t('creation.launchClaude')}
          </button>
          <button
            className="done-btn secondary"
            onClick={() => window.location.reload()}
          >
            {t('creation.newProject')}
          </button>
        </div>
      )}
    </div>
  )
}
