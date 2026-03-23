import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from './i18n'
import type { Answers, ProjectConfig, ProjectAnalysis } from './types'
import { getActiveSteps } from './steps'
import { useSettings } from './hooks/useSettings'
import { useTerminalSessions } from './hooks/useTerminalSessions'
import { SetupScreen } from './components/SetupScreen'
import { ProjectHub } from './components/ProjectHub'
import { Logo } from './components/Logo'
import { StepProgress } from './components/StepProgress'
import { CompletedStep } from './components/CompletedStep'
import { CurrentStep } from './components/CurrentStep'
import { AnalysisStep } from './components/AnalysisStep'
import { ReviewScreen } from './components/ReviewScreen'
import { CreationProgress } from './components/CreationProgress'
import { ImportScreen } from './components/ImportScreen'
import { TerminalView } from './components/TerminalView'

interface AppState {
  currentStepId: string
  answers: Answers
  showReview: boolean
  isCreating: boolean
  creationLog: string[]
  creationDone: boolean
  createdPath: string | null
}

function answersToConfig(answers: Answers): ProjectConfig {
  const get = (id: string, fallback = '') => String(answers[id]?.value ?? fallback)
  const getArr = (id: string): string[] => {
    const v = answers[id]?.value
    return Array.isArray(v) ? v : []
  }
  const getBool = (id: string) => answers[id]?.value === 'yes'
  const extras = getArr('extras')

  return {
    name: get('project-name'),
    location: get('project-location'),
    description: get('project-description'),
    techStack: get('tech-stack'),
    languages: getArr('languages'),
    styling: get('styling'),
    database: get('database'),
    githubCreate: answers['github-create']?.value === 'yes',
    githubAccount: get('github-account'),
    githubVisibility: get('github-visibility', 'private'),
    claudeMd: get('claude-md', 'full'),
    hooksSetup: getArr('hooks-setup'),
    rulesSetup: getArr('rules-setup'),
    devlog: getArr('devlog'),
    gitignore: true,
    playwrightMcp: extras.includes('playwright-mcp'),
    frontendDesignPlugin: extras.includes('plugin-frontend-design'),
    agentTemplates: extras.includes('agent-templates'),
    memorySeed: extras.includes('memory-seed'),
    readme: extras.includes('readme'),
    agentName: get('agent-name') || get('project-name'),
    sessionName: true,
    skipPermissions: extras.includes('skip-permissions'),
    conventions: getArr('_conventions'),
  }
}

function findNextStepId(answers: Answers, afterId: string): string | null {
  const active = getActiveSteps(answers)
  const idx = active.findIndex((s) => s.id === afterId)
  if (idx === -1 || idx + 1 >= active.length) return null
  return active[idx + 1].id
}

function findPrevStepId(answers: Answers, beforeId: string): string | null {
  const active = getActiveSteps(answers)
  const idx = active.findIndex((s) => s.id === beforeId)
  if (idx <= 0) return null
  return active[idx - 1].id
}

const FIRST_STEP_ID = 'project-name'

type ViewMode = 'setup' | 'hub' | 'wizard' | 'creating' | 'import'

export function App() {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<ViewMode>('setup')
  const [state, setState] = useState<AppState>({
    currentStepId: FIRST_STEP_ID,
    answers: {},
    showReview: false,
    isCreating: false,
    creationLog: [],
    creationDone: false,
    createdPath: null,
  })

  const [importPath, setImportPath] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const { termSessions, voiceFocus, setVoiceFocus, getHalSessionId, openTerminal, closeTerminal } = useTerminalSessions()
  const { hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, rendererId, layoutId, updateHubFont, updateTermFont, updateVoiceOut, updateVoiceProfile, updateDockPosition, updateScreenOpacity, updateRenderer, updateLayout } = useSettings()

  // Draggable split ratio between hub and terminal (0-100, percentage for hub)
  const [splitRatio, setSplitRatio] = useState(() => parseInt(localStorage.getItem('hal-o-split') || '50'))
  const splitRef = useRef(splitRatio)

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const isHoriz = dockPosition === 'left' || dockPosition === 'right'
    const startPos = isHoriz ? e.clientX : e.clientY
    const startRatio = splitRef.current

    const onMove = (me: MouseEvent) => {
      const currentPos = isHoriz ? me.clientX : me.clientY
      const totalSize = isHoriz ? window.innerWidth : window.innerHeight
      let deltaPercent = ((currentPos - startPos) / totalSize) * 100
      // For left dock, hub is on the right so dragging left = more terminal
      if (dockPosition === 'left') deltaPercent = -deltaPercent
      const newRatio = Math.max(15, Math.min(85, startRatio + deltaPercent))
      const rounded = Math.round(newRatio)
      splitRef.current = rounded
      setSplitRatio(rounded)
    }

    const onUp = () => {
      localStorage.setItem('hal-o-split', String(splitRef.current))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [dockPosition])

  // Compute derived values (always, even when setup screen is showing)
  const activeSteps = getActiveSteps(state.answers)
  const currentStepIndex = activeSteps.findIndex((s) => s.id === state.currentStepId)
  const currentStep = activeSteps[currentStepIndex]
  const currentPhase = currentStep?.phase || 'basics'

  // ALL hooks must be above any conditional return — React requires stable hook order

  // Fetch dynamic defaults when entering wizard
  useEffect(() => {
    if (viewMode !== 'wizard' || !window.api) return
    Promise.all([
      window.api.getGitHubUser(),
      window.api.getGitHubOrgs(),
    ]).then(([user, orgs]) => {
      setState((prev) => ({
        ...prev,
        answers: {
          ...prev.answers,
          '_gh_user': { value: user, label: user },
          '_gh_orgs': { value: orgs, label: orgs.join(', ') },
        },
      }))
    }).catch(() => {})
    window.api.getDefaultProjectPath().then((path) => {
      setState((prev) => ({
        ...prev,
        answers: {
          ...prev.answers,
          '_default_path': { value: path, label: path },
        },
      }))
    }).catch(() => {})
  }, [viewMode])

  // Auto-scroll to latest message
  useEffect(() => {
    if (viewMode !== 'wizard') return
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [viewMode, state.currentStepId, state.showReview])

  // --- Conditional returns AFTER all hooks ---

  if (viewMode === 'setup') {
    return (
      <div className="app">
        <div className="chat-area">
          <SetupScreen onReady={() => setViewMode('hub')} />
        </div>
      </div>
    )
  }

  if (viewMode === 'import' && importPath) {
    return (
      <ImportScreen
        projectPath={importPath}
        onBackToHub={() => { setImportPath(null); setViewMode('hub') }}
        onOpenInHub={(path, name) => {
          setImportPath(null)
          openTerminal(path, name, false)
          setViewMode('hub')
        }}
      />
    )
  }

  if (viewMode === 'hub') {
    const hasTerminals = termSessions.length > 0
    const isHorizontal = dockPosition === 'left' || dockPosition === 'right'
    const flexDir = isHorizontal ? (dockPosition === 'left' ? 'row-reverse' : 'row') : 'column'
    const hubSize = hasTerminals ? splitRatio : 100
    const termSize = 100 - splitRatio
    const hubStyle = isHorizontal
      ? { flex: `0 0 ${hubSize}%`, minWidth: 0, overflow: 'hidden', position: 'relative' as const }
      : { flex: `0 0 ${hubSize}%`, minHeight: 0, overflow: 'hidden', position: 'relative' as const }
    const termStyle = isHorizontal
      ? { flex: `0 0 ${termSize}%`, minWidth: 100, overflow: 'hidden' }
      : { flex: `0 0 ${termSize}%`, minHeight: 100, overflow: 'hidden' }

    return (
      <div className="app" style={{ display: 'flex', flexDirection: flexDir, height: '100vh' }}>
        <div style={hubStyle}>
          <ProjectHub
            onNewProject={() => {
              setState({
                currentStepId: FIRST_STEP_ID,
                answers: {},
                showReview: false,
                isCreating: false,
                creationLog: [],
                creationDone: false,
                createdPath: null,
              })
              setViewMode('wizard')
            }}
            onConvertProject={(path) => {
              setImportPath(path)
              setViewMode('import')
            }}
            onOpenTerminal={openTerminal}
            voiceFocus={voiceFocus}
            onVoiceFocusHub={() => setVoiceFocus('hub')}
            hubFontSize={hubFontSize}
            termFontSize={termFontSize}
            voiceOut={voiceOut}
            voiceProfile={voiceProfile}
            dockPosition={dockPosition}
            screenOpacity={screenOpacity}
            onHubFontSize={updateHubFont}
            onTermFontSize={updateTermFont}
            onVoiceOut={updateVoiceOut}
            onVoiceProfileChange={updateVoiceProfile}
            onDockPositionChange={updateDockPosition}
            onScreenOpacityChange={updateScreenOpacity}
            rendererId={rendererId}
            onRendererChange={updateRenderer}
            layoutId={layoutId}
            onLayoutChange={updateLayout}
            halSessionId={getHalSessionId()}
            terminalCount={termSessions.length}
          />
        </div>
        {hasTerminals && (
          <div
            className={`hal-split-divider ${isHorizontal ? 'horizontal' : ''}`}
            onMouseDown={handleDividerMouseDown}
          />
        )}
        {hasTerminals && (
          <div style={termStyle}>
            <TerminalView
              sessions={termSessions}
              onClose={closeTerminal}
              voiceFocus={voiceFocus}
              onVoiceFocus={(id) => setVoiceFocus(id)}
              fontSize={termFontSize}
              voiceOut={voiceOut}
              voiceProfile={voiceProfile}
            />
          </div>
        )}
      </div>
    )
  }

  const handleAnswer = (value: string | string[], label: string) => {
    const stepId = state.currentStepId
    const newAnswers = { ...state.answers, [stepId]: { value, label } }
    const nextId = findNextStepId(newAnswers, stepId)

    if (nextId) {
      setState((prev) => ({
        ...prev,
        answers: newAnswers,
        currentStepId: nextId,
        showReview: false,
      }))
    } else {
      setState((prev) => ({
        ...prev,
        answers: newAnswers,
        showReview: true,
      }))
    }
  }

  const handleAnalysisAccept = (analysis: ProjectAnalysis) => {
    // Inject all stack answers from the analysis at once
    const newAnswers: Answers = {
      ...state.answers,
      'stack-analysis': { value: '__accepted__', label: analysis.techStackLabel || analysis.techStack },
      'tech-stack': { value: analysis.techStack, label: analysis.techStackLabel || analysis.techStack },
      'languages': { value: analysis.languages, label: analysis.languages.join(', ') },
      'styling': { value: analysis.styling || 'none', label: analysis.styling || 'none' },
      'database': { value: analysis.database || 'none', label: analysis.database || 'none' },
    }
    // Store conventions for richer CLAUDE.md generation
    if (analysis.conventions.length > 0) {
      newAnswers['_conventions'] = { value: analysis.conventions, label: analysis.conventions.join('; ') }
    }

    // Jump to GitHub phase (skip manual stack steps since they have condition: __manual__)
    const nextSteps = getActiveSteps(newAnswers)
    const githubStep = nextSteps.find((s) => s.phase === 'github')
    const nextId = githubStep?.id || findNextStepId(newAnswers, 'stack-analysis') || state.currentStepId

    setState((prev) => ({
      ...prev,
      answers: newAnswers,
      currentStepId: nextId,
      showReview: false,
    }))
  }

  const handleAnalysisManual = () => {
    // Set analysis to manual mode so conditional stack steps become visible
    const newAnswers = {
      ...state.answers,
      'stack-analysis': { value: '__manual__', label: 'Manual setup' },
    }
    const nextId = findNextStepId(newAnswers, 'stack-analysis')
    setState((prev) => ({
      ...prev,
      answers: newAnswers,
      currentStepId: nextId || state.currentStepId,
      showReview: false,
    }))
  }

  const handleSkip = () => {
    handleAnswer('', 'Skipped')
  }

  const handleBack = () => {
    if (state.showReview) {
      // Go back to last active step
      const lastStep = activeSteps[activeSteps.length - 1]
      setState((prev) => ({ ...prev, showReview: false, currentStepId: lastStep.id }))
      return
    }
    const prevId = findPrevStepId(state.answers, state.currentStepId)
    if (prevId) {
      setState((prev) => ({ ...prev, currentStepId: prevId }))
    }
  }

  const handleEditStep = (stepIndex: number) => {
    const step = activeSteps[stepIndex]
    if (step) {
      setState((prev) => ({ ...prev, currentStepId: step.id, showReview: false }))
    }
  }

  const handleCreate = async () => {
    setState((prev) => ({
      ...prev,
      isCreating: true,
      creationLog: ['Starting project creation...'],
      showReview: false,
    }))

    const config = answersToConfig(state.answers)

    try {
      const result = await window.api.createProject(config as unknown as Record<string, unknown>)
      setState((prev) => ({
        ...prev,
        isCreating: false,
        creationLog: result.log,
        creationDone: true,
        createdPath: result.path || null,
      }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isCreating: false,
        creationLog: [...prev.creationLog, `[ERROR] ${err}`],
        creationDone: true,
      }))
    }
  }

  // Steps completed before current
  const completedSteps = activeSteps.slice(0, currentStepIndex).filter(
    (s) => state.answers[s.id]
  )

  if (state.isCreating || state.creationDone) {
    return (
      <div className="app">
        <StepProgress currentPhase="review" answers={state.answers} />
        <div className="chat-area">
          <CreationProgress
            log={state.creationLog}
            done={state.creationDone}
            createdPath={state.createdPath}
            onBackToHub={() => setViewMode('hub')}
            onOpenTerminal={(path) => {
              const name = path.split(/[/\\]/).pop() || 'Project'
              openTerminal(path, name, false)
              setViewMode('hub')
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <StepProgress currentPhase={state.showReview ? 'review' : currentPhase} answers={state.answers} />

      <div className="chat-area">
        {/* Welcome message */}
        {currentStepIndex === 0 && completedSteps.length === 0 && !state.showReview && (
          <div className="message message-assistant">
            <div className="message-avatar"><Logo size={22} /></div>
            <div className="message-content">
              <strong>{t('welcome.title')}</strong><br />
              {t('welcome.body')}
            </div>
          </div>
        )}

        {/* Completed steps */}
        {!state.showReview && completedSteps.map((step) => {
          const idx = activeSteps.findIndex((s) => s.id === step.id)
          return (
            <CompletedStep
              key={step.id}
              step={step}
              answers={state.answers}
              onEdit={() => handleEditStep(idx)}
            />
          )
        })}

        {/* Current step or review */}
        {state.showReview ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <button className="back-btn" onClick={handleBack}>{t('ui.backToQuestions')}</button>
            </div>
            <ReviewScreen
              answers={state.answers}
              activeSteps={activeSteps}
              onEdit={handleEditStep}
              onCreate={handleCreate}
              isCreating={state.isCreating}
            />
          </>
        ) : currentStep?.type === 'analysis' ? (
          <AnalysisStep
            key={currentStep.id}
            answers={state.answers}
            onAccept={handleAnalysisAccept}
            onManual={handleAnalysisManual}
            onBack={handleBack}
            canGoBack={currentStepIndex > 0}
          />
        ) : currentStep ? (
          <CurrentStep
            key={currentStep.id}
            step={currentStep}
            answers={state.answers}
            onAnswer={handleAnswer}
            onSkip={handleSkip}
            onBack={handleBack}
            canGoBack={currentStepIndex > 0}
          />
        ) : (
          <div className="message message-assistant">
            <div className="message-avatar"><Logo size={22} /></div>
            <div className="message-content">
              {t('ui.noStepFound', { id: state.currentStepId })}
              <br /><button className="submit-btn" style={{ marginTop: 8 }} onClick={() =>
                setState(prev => ({ ...prev, currentStepId: FIRST_STEP_ID, answers: {} }))
              }>{t('ui.restartWizard')}</button>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>
    </div>
  )
}
