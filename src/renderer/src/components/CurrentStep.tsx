import { useState, useEffect, useRef } from 'react'
import type { StepDef, Answers, Choice } from '../types'
import { useTypewriter } from '../hooks/useTypewriter'
import { useI18n } from '../i18n'
import { playSelect } from '../hooks/useSounds'
import { Logo } from './Logo'

interface Props {
  step: StepDef
  answers: Answers
  onAnswer: (value: string | string[], label: string) => void
  onSkip: () => void
  onBack: () => void
  canGoBack: boolean
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>')
}

function getChoices(step: StepDef, answers: Answers): Choice[] {
  if (!step.choices) return []
  return typeof step.choices === 'function' ? step.choices(answers) : step.choices
}

function getDefault(step: StepDef, answers: Answers): string | string[] {
  if (!step.defaultValue) return step.type === 'multi-select' ? [] : ''
  return typeof step.defaultValue === 'function' ? step.defaultValue(answers) : step.defaultValue
}

export function CurrentStep({ step, answers, onAnswer, onSkip, onBack, canGoBack }: Props) {
  const { t } = useI18n()
  const choices = getChoices(step, answers)
  const defaultVal = getDefault(step, answers)
  const existingAnswer = answers[step.id]

  const [textValue, setTextValue] = useState(
    existingAnswer ? String(existingAnswer.value) : (typeof defaultVal === 'string' ? defaultVal : '')
  )
  const choiceIds = choices.map((c) => c.id)
  const [selectedMulti, setSelectedMulti] = useState<string[]>(() => {
    const raw = existingAnswer && Array.isArray(existingAnswer.value)
      ? existingAnswer.value
      : (Array.isArray(defaultVal) ? defaultVal : [])
    return raw.filter((id: string) => choiceIds.includes(id))
  })
  const [otherValue, setOtherValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState(
    existingAnswer ? String(existingAnswer.value) : (typeof defaultVal === 'string' ? defaultVal : '')
  )
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Resolve question: try translation first, fall back to step definition
  const rawQuestion = typeof step.question === 'function' ? step.question(answers) : step.question
  const translationKey = `step.${step.id}.question`
  const translated = t(translationKey)
  // If t() returned the key itself, no translation exists — use raw
  const baseQuestion = translated !== translationKey ? translated : rawQuestion
  // Handle dynamic params for translated questions
  const question = step.id === 'project-location'
    ? baseQuestion.replace('{name}', String(answers['project-name']?.value || 'YourProject'))
    : step.id === 'hooks-setup' && baseQuestion === translated
      ? (() => {
          // Inject the stack-specific extra text
          const parts: string[] = []
          const langs = answers['languages']?.value
          if (Array.isArray(langs) && langs.some((l: string) => /typescript/i.test(l))) parts.push('TypeScript type-check')
          const stack = answers['tech-stack']?.value as string || ''
          if (/python|fastapi/i.test(stack) || (Array.isArray(langs) && langs.includes('python'))) parts.push('pycache clearing')
          const extra = parts.length ? t('step.hooks-setup.extra', { parts: parts.join(', ') }) : ''
          return baseQuestion + extra
        })()
      : baseQuestion

  // Feature 1: Typing animation (skip if revisiting a step)
  const { displayText: typedQuestion, isTyping } = useTypewriter({
    text: question,
    speed: 18,
    enabled: !existingAnswer,
  })

  useEffect(() => {
    if (!isTyping && (step.type === 'text' || step.type === 'textarea')) {
      inputRef.current?.focus()
    }
  }, [step.id, isTyping])

  const handleChoiceClick = (choice: Choice) => {
    if (choice.id === '__browse__') {
      window.api.selectFolder(folderPath || '').then((path) => {
        if (path) setFolderPath(path)
      })
      return
    }
    onAnswer(choice.id, choice.label)
  }

  const handleMultiToggle = (id: string) => {
    playSelect()
    setSelectedMulti((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleMultiConfirm = () => {
    const labels = selectedMulti
      .map((id) => choices.find((c) => c.id === id)?.label || id)
      .join(', ')
    onAnswer(selectedMulti, labels || 'None selected')
  }

  const handleTextSubmit = () => {
    const val = textValue.trim()
    if (step.validate) {
      const err = step.validate(val)
      if (err) { setError(err); return }
    }
    if (!val && !step.allowSkip) {
      setError(t('step.project-name.required'))
      return
    }
    setError(null)
    onAnswer(val, val)
  }

  const handleOtherSubmit = () => {
    const val = otherValue.trim()
    if (!val) return
    onAnswer(val, val)
  }

  const handleFolderSubmit = () => {
    if (!folderPath.trim()) return
    onAnswer(folderPath.trim(), folderPath.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (step.type === 'text' || step.type === 'textarea') handleTextSubmit()
      else if (step.type === 'folder') handleFolderSubmit()
    }
  }

  // Resolve choice labels via translation
  function tChoice(choiceId: string, field: 'label' | 'desc', fallback: string): string {
    const key = `choice.${choiceId}${field === 'desc' ? '.desc' : ''}`
    const val = t(key)
    return val !== key ? val : fallback
  }

  const afterChoicesDelay = choices.length * 50 + 100

  return (
    <div className="message">
      {/* Assistant question with typing animation */}
      <div className="message-assistant">
        <div className="message-avatar"><Logo size={22} /></div>
        <div
          className={`message-content ${isTyping ? 'typing' : ''}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(typedQuestion) }}
        />
      </div>

      {/* All interactive elements hidden while typing */}
      {!isTyping && (
        <>
          {step.type === 'choice' && (
            <>
              <div className="choices-grid">
                {choices.map((c, i) => (
                  <button
                    key={c.id}
                    className="choice-btn choice-enter"
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => handleChoiceClick(c)}
                  >
                    {c.icon && <span className="choice-btn-icon">{c.icon}</span>}
                    {tChoice(c.id, 'label', c.label)}
                    {c.description && <span className="choice-btn-desc">{tChoice(c.id, 'desc', c.description)}</span>}
                  </button>
                ))}
              </div>
              {step.allowOther && (
                <div className="input-row choice-enter" style={{ animationDelay: `${afterChoicesDelay}ms` }}>
                  <input
                    className="other-input"
                    placeholder={t('ui.other')}
                    value={otherValue}
                    onChange={(e) => setOtherValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleOtherSubmit() }}
                  />
                  <button className="submit-btn" onClick={handleOtherSubmit} disabled={!otherValue.trim()}>{t('ui.ok')}</button>
                </div>
              )}
            </>
          )}

          {step.type === 'multi-select' && (
            <>
              <div className="choices-grid">
                {choices.map((c, i) => (
                  <button
                    key={c.id}
                    className={`choice-btn choice-enter ${selectedMulti.includes(c.id) ? 'selected' : ''}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => handleMultiToggle(c.id)}
                  >
                    {tChoice(c.id, 'label', c.label)}
                    {c.description && <span className="choice-btn-desc">{tChoice(c.id, 'desc', c.description)}</span>}
                  </button>
                ))}
              </div>
              <div
                className="multi-confirm choice-enter"
                style={{ display: 'flex', gap: 8, alignItems: 'center', animationDelay: `${afterChoicesDelay}ms` }}
              >
                <button className="confirm-btn" onClick={handleMultiConfirm}>
                  {t('ui.confirm', { count: selectedMulti.length })}
                </button>
                {step.allowOther && (
                  <input
                    className="other-input"
                    placeholder={t('ui.addOther')}
                    value={otherValue}
                    onChange={(e) => setOtherValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && otherValue.trim()) {
                        setSelectedMulti((prev) => [...prev, otherValue.trim()])
                        setOtherValue('')
                      }
                    }}
                    style={{ maxWidth: 200 }}
                  />
                )}
              </div>
            </>
          )}

          {(step.type === 'text' || step.type === 'textarea') && (
            <div className="choice-enter" style={{ animationDelay: '50ms' }}>
              {step.type === 'textarea' ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  className="text-input"
                  placeholder={step.placeholder}
                  value={textValue}
                  onChange={(e) => { setTextValue(e.target.value); setError(null) }}
                  onKeyDown={handleKeyDown}
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  className="text-input"
                  placeholder={step.placeholder}
                  value={textValue}
                  onChange={(e) => { setTextValue(e.target.value); setError(null) }}
                  onKeyDown={handleKeyDown}
                />
              )}
              {error && <div className="validation-error">{error}</div>}
              <div className="input-row" style={{ marginTop: 8 }}>
                <button className="submit-btn" onClick={handleTextSubmit}>{t('ui.continue')}</button>
              </div>
            </div>
          )}

          {step.type === 'folder' && (
            <div className="choice-enter" style={{ animationDelay: '50ms' }}>
              <div className="folder-input-row">
                <input
                  className="folder-path"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button className="browse-btn" onClick={() => {
                  window.api.selectFolder(folderPath || '').then((path) => {
                    if (path) setFolderPath(path)
                  })
                }}>
                  {t('ui.browse')}
                </button>
                <button className="submit-btn" onClick={handleFolderSubmit}>{t('ui.ok')}</button>
              </div>
            </div>
          )}

          {/* Action row: Back + Skip */}
          <div className="input-row choice-enter" style={{ marginTop: 10, animationDelay: `${afterChoicesDelay + 50}ms` }}>
            {canGoBack && (
              <button className="back-btn" onClick={onBack}>{t('ui.back')}</button>
            )}
            {(step.allowSkip || step.type === 'multi-select') && (
              <button className="skip-btn" onClick={onSkip}>
                {step.skipLabel || t('ui.skip')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
