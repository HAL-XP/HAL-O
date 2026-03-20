import type { StepDef, Answers } from '../types'
import { useI18n } from '../i18n'

interface Props {
  step: StepDef
  answers: Answers
  onEdit: () => void
}

export function CompletedStep({ step, answers, onEdit }: Props) {
  const { t } = useI18n()
  const answer = answers[step.id]
  if (!answer) return null

  const label = answer.label || String(answer.value)
  // Try translation, fall back to raw question
  const key = `step.${step.id}.question`
  const translated = t(key)
  const raw = translated !== key ? translated : (typeof step.question === 'function' ? step.question(answers) : step.question)
  const question = raw.replace(/\*\*/g, '').replace(/\n.*/s, '').replace(/\{name\}/g, String(answers['project-name']?.value || '')).slice(0, 60)

  return (
    <div className="completed-step" onClick={onEdit}>
      <span className="completed-step-q">{question}</span>
      <span className="completed-step-a" title={label}>{label}</span>
      <button className="completed-step-edit" onClick={(e) => { e.stopPropagation(); onEdit() }}>
        {t('ui.edit')}
      </button>
    </div>
  )
}
