import { PHASES } from '../steps'
import type { Answers } from '../types'
import { useI18n } from '../i18n'

interface Props {
  currentPhase: string
  answers: Answers
  fontSize?: number
  onFontSizeChange?: (size: number) => void
}

export function StepProgress({ currentPhase }: Props) {
  const { t } = useI18n()
  const phaseIndex = PHASES.findIndex((p) => p.id === currentPhase)

  return (
    <div className="phase-bar">
      {PHASES.map((phase, i) => {
        const isActive = phase.id === currentPhase
        const isCompleted = i < phaseIndex
        const connectorFilled = i > 0 && i <= phaseIndex

        return (
          <div key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && (
              <div className={`phase-connector ${connectorFilled ? 'filled' : ''}`} />
            )}
            <div
              className={`phase-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            >
              {t(`phase.${phase.id}`)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
