import type { Answers, StepDef } from '../types'
import { STEPS } from '../steps'
import { useI18n, type TFunction } from '../i18n'

interface Props {
  answers: Answers
  activeSteps: StepDef[]
  onEdit: (stepIndex: number) => void
  onCreate: () => void
  isCreating: boolean
}

interface Section {
  title: string
  rows: { label: string; value: string; stepIndex: number; tags?: boolean }[]
}

function buildSections(answers: Answers, activeSteps: StepDef[], t: TFunction): Section[] {
  const sections: Section[] = []

  const get = (id: string) => answers[id]?.label || answers[id]?.value || '-'
  const getArr = (id: string) => {
    const v = answers[id]?.value
    return Array.isArray(v) ? v : []
  }
  const stepIdx = (id: string) => activeSteps.findIndex((s) => s.id === id)

  sections.push({
    title: t('review.section.project'),
    rows: [
      { label: t('review.label.name'), value: String(get('project-name')), stepIndex: stepIdx('project-name') },
      { label: t('review.label.location'), value: String(get('project-location')), stepIndex: stepIdx('project-location') },
      { label: t('review.label.description'), value: String(get('project-description')), stepIndex: stepIdx('project-description') },
    ],
  })

  sections.push({
    title: t('review.section.techStack'),
    rows: [
      { label: t('review.label.stack'), value: String(get('tech-stack')), stepIndex: stepIdx('tech-stack') },
      { label: t('review.label.languages'), value: String(answers['languages']?.label || getArr('languages').join(', ') || '-'), stepIndex: stepIdx('languages'), tags: true },
      ...(answers['styling'] ? [{ label: t('review.label.styling'), value: String(get('styling')), stepIndex: stepIdx('styling') }] : []),
      ...(answers['database'] ? [{ label: t('review.label.database'), value: String(get('database')), stepIndex: stepIdx('database') }] : []),
    ],
  })

  const ghCreate = answers['github-create']?.value === 'yes'
  sections.push({
    title: t('review.section.github'),
    rows: [
      { label: t('review.label.createRepo'), value: ghCreate ? t('review.yesGithub') : t('review.noGithub'), stepIndex: stepIdx('github-create') },
      ...(ghCreate ? [
        { label: t('review.label.account'), value: String(get('github-account')), stepIndex: stepIdx('github-account') },
        { label: t('review.label.visibility'), value: String(get('github-visibility')), stepIndex: stepIdx('github-visibility') },
      ] : []),
    ],
  })

  sections.push({
    title: t('review.section.claude'),
    rows: [
      { label: t('review.label.claudeMd'), value: String(get('claude-md')), stepIndex: stepIdx('claude-md') },
      { label: t('review.label.hooks'), value: String(answers['hooks-setup']?.label || getArr('hooks-setup').join(', ') || '-'), stepIndex: stepIdx('hooks-setup'), tags: true },
      { label: t('review.label.rules'), value: String(answers['rules-setup']?.label || getArr('rules-setup').join(', ') || '-'), stepIndex: stepIdx('rules-setup'), tags: true },
      { label: t('review.label.devlog'), value: String(answers['devlog']?.label || getArr('devlog').join(', ') || '-'), stepIndex: stepIdx('devlog'), tags: true },
    ],
  })

  sections.push({
    title: t('review.section.extras'),
    rows: [
      { label: t('review.label.included'), value: String(answers['extras']?.label || getArr('extras').join(', ') || '-'), stepIndex: stepIdx('extras'), tags: true },
    ],
  })

  const agentName = String(answers['agent-name']?.value || answers['project-name']?.value || 'Project')
  sections.push({
    title: t('review.section.batchFiles'),
    rows: [
      { label: t('review.label.agentName'), value: agentName, stepIndex: -1 },
      { label: t('review.label.mode'), value: getArr('extras').includes('skip-permissions') ? '--dangerously-skip-permissions' : t('review.standard'), stepIndex: -1 },
    ],
  })

  return sections
}

export function ReviewScreen({ answers, activeSteps, onEdit, onCreate, isCreating }: Props) {
  const { t } = useI18n()
  const sections = buildSections(answers, activeSteps, t)
  const loc = String(answers['project-location']?.value || '')
  const name = String(answers['project-name']?.value || '')
  const projectPath = loc && name ? `${loc}/${name}` : name

  return (
    <div className="review">
      <h2>{t('review.title')}</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 }}>
        {t('review.projectAt')} <code>{projectPath}</code>
      </p>

      {sections.map((section) => (
        <div key={section.title} className="review-section">
          <div className="review-section-title">{section.title}</div>
          {section.rows.map((row) => (
            <div key={row.label} className="review-row">
              <span className="review-label">{row.label}</span>
              {row.tags && row.value !== '-' && row.value !== 'None' ? (
                <div className="review-tags">
                  {row.value.split(', ').map((t) => (
                    <span key={t} className="review-tag">{t}</span>
                  ))}
                </div>
              ) : (
                <span className={`review-value ${row.value !== '-' ? 'accent' : ''}`}>{row.value}</span>
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="review-actions">
        <button className="create-btn" onClick={onCreate} disabled={isCreating}>
          {isCreating ? t('review.creating') : t('review.createProject')}
        </button>
      </div>
    </div>
  )
}
