import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from './i18n'
import type { Answers, ProjectConfig, ProjectAnalysis } from './types'
import { getActiveSteps, isQuickCreate } from './steps'
import { useSettings } from './hooks/useSettings'
import { useDemoSettings } from './hooks/useDemoSettings'
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
import { ProjectConfigScreen } from './components/ProjectConfigScreen'
import { TerminalView } from './components/TerminalView'
import { DemoTerminalView } from './components/DemoTerminalView'
import { DockLayout } from './components/DockLayout'
import { BrowserPanel, makeBrowserTabId } from './components/BrowserPanel'
import type { BrowserTab } from './components/BrowserPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GpuWizardModal, isGpuWizardDone } from './components/GpuWizardModal'
import { FirstLaunchWizard } from './components/onboarding'
import type { WizardConfig } from './components/onboarding'
import { useFocusZone } from './hooks/useFocusZone'

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
  const extras = getArr('extras')
  const quickMode = isQuickCreate(answers)

  // Quick-create: derive smart defaults from detected/selected stack
  const stack = get('tech-stack')
  const langs = getArr('languages')

  // Smart hook defaults for quick-create
  let hooksSetup = getArr('hooks-setup')
  if (quickMode && hooksSetup.length === 0) {
    hooksSetup = ['session-start']
    if (langs.some(l => /typescript/i.test(l))) hooksSetup.push('post-tool-tsc')
    if (langs.some(l => /python/i.test(l))) hooksSetup.push('post-tool-pycache')
    hooksSetup.push('telegram-notify')
  }

  // Smart rules defaults for quick-create
  let rulesSetup = getArr('rules-setup')
  if (quickMode && rulesSetup.length === 0) {
    const hasFe = ['web-react', 'fullstack-node', 'fullstack-python', 'electron', 'nextjs', 'sveltekit', 'nuxt', 'remix'].includes(stack) ||
      /react|vue|svelte|next|nuxt|angular|frontend/.test(stack)
    const hasPy = ['python-backend', 'fullstack-python'].includes(stack) || langs.some(l => /python/i.test(l))
    if (hasFe) rulesSetup.push('frontend', 'ux')
    if (hasPy) rulesSetup.push('python-api')
    if (/node|express|nestjs/i.test(stack) || ['fullstack-node', 'node-backend'].includes(stack)) rulesSetup.push('node-api')
    if (/go/i.test(stack) || stack === 'go-backend') rulesSetup.push('go-api')
    if (/rust/i.test(stack) || stack === 'rust-backend') rulesSetup.push('rust-api')
    rulesSetup.push('banned-techniques')
  }

  // Devlog: always all folders for quick-create
  let devlog = getArr('devlog')
  if (quickMode && devlog.length === 0) {
    devlog = ['summaries', 'hours', 'decisions', 'experiments']
  }

  // Quick-create extras: memory seed + agent templates (no readme, no GitHub)
  const hasFrontendStack = ['web-react', 'fullstack-node', 'fullstack-python', 'electron', 'nextjs', 'sveltekit'].includes(stack) ||
    /react|vue|svelte|next|nuxt|angular|frontend/.test(stack)
  const hasPyStack = ['python-backend', 'fullstack-python'].includes(stack) || langs.some(l => /python/i.test(l))
  const memorySeed = quickMode ? true : extras.includes('memory-seed')
  const agentTemplates = quickMode
    ? (hasFrontendStack || hasPyStack)
    : extras.includes('agent-templates')
  const playwrightMcp = quickMode ? hasFrontendStack : extras.includes('playwright-mcp')

  // Token budget: quick-create defaults to 'full'
  const tokenBudget = (quickMode ? 'full' : get('token-budget', 'full')) as 'full' | 'balanced' | 'aggressive'

  return {
    name: get('project-name'),
    location: get('project-location'),
    description: get('project-description'),
    techStack: stack,
    languages: langs,
    styling: get('styling'),
    database: get('database'),
    // Quick-create: always git init locally
    githubCreate: quickMode ? false : answers['github-create']?.value === 'yes',
    githubAccount: get('github-account'),
    githubVisibility: get('github-visibility', 'private'),
    // Quick-create: always full CLAUDE.md
    claudeMd: quickMode ? 'full' : get('claude-md', 'full'),
    hooksSetup,
    rulesSetup,
    devlog,
    gitignore: true,
    playwrightMcp,
    frontendDesignPlugin: extras.includes('plugin-frontend-design'),
    agentTemplates,
    memorySeed,
    readme: quickMode ? false : extras.includes('readme'),
    agentName: get('agent-name') || get('project-name'),
    sessionName: true,
    skipPermissions: extras.includes('skip-permissions'),
    conventions: getArr('_conventions'),
    tokenBudget,
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

const FIRST_STEP_ID = 'wizard-mode'

type ViewMode = 'loading' | 'first-launch' | 'setup' | 'hub' | 'wizard' | 'creating' | 'configure'

// Debug helper — sends to main process log file when --debug is active
function dlog(tag: string, msg: string, data?: unknown) {
  try { window.api?.debugLog(tag, msg, data) } catch { /* preload not ready */ }
}

export function App() {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<ViewMode>('loading')
  dlog('app', 'App() render', { viewMode: 'loading' })
  const [state, setState] = useState<AppState>({
    currentStepId: FIRST_STEP_ID,
    answers: {},
    showReview: false,
    isCreating: false,
    creationLog: [],
    creationDone: false,
    createdPath: null,
  })

  const [configurePath, setConfigurePath] = useState<string | null>(null)
  const [wizardFontSize, setWizardFontSize] = useState(() => parseInt(localStorage.getItem('hal-o-wizard-font') || '14'))
  const chatEndRef = useRef<HTMLDivElement>(null)
  const demo = useDemoSettings()
  const { termSessions, voiceFocus, setVoiceFocus, getHalSessionId, openTerminal, closeTerminal } = useTerminalSessions(demo.enabled)
  // UX16: Focus zone management — 'hub' or 'terminal'
  const { focusZone } = useFocusZone(termSessions.length > 0 || (demo.enabled && (demo.terminalCount ?? 0) > 0))
  const settingsState = useSettings()
  const { hubFontSize, termFontSize, voiceOut, voiceProfile, dockPosition, screenOpacity, camera, cameraTweaking, particleDensity, renderQuality, rendererId, layoutId, threeTheme, shipVfxEnabled, sphereStyle, voiceReactionIntensity, personality, defaultIde, defaultTerminalModel, introAnimation, updateHubFont, updateTermFont, updateVoiceOut, updateVoiceProfile, updateDockPosition, updateScreenOpacity, updateCamera, updateCameraTweaking, resetCamera, updateParticleDensity, updateRenderQuality, updateRenderer, updateLayout, updateThreeTheme, updateShipVfxEnabled, updateSphereStyle, updateVoiceReactionIntensity, updatePersonality, applyPersonalityPreset, updateDefaultIde, updateDefaultTerminalModel, updateIntroAnimation, activityFeedback, updateActivityFeedback, graphicsPreset, updateGraphicsPreset, bloomEnabled, updateBloomEnabled, chromaticAberrationEnabled, updateChromaticAberrationEnabled, floorLinesEnabled, updateFloorLinesEnabled, groupTrailsEnabled, updateGroupTrailsEnabled, autoRotateEnabled, updateAutoRotateEnabled, autoRotateSpeed, updateAutoRotateSpeed, cardsPerSector, updateCardsPerSector, devlogSections, updateDevlogSection, setAllDevlogSections, bloomIntensityOverride, updateBloomIntensityOverride, gridOpacityOverride, updateGridOpacityOverride, particleBrightnessOverride, updateParticleBrightnessOverride, vignetteOverride, updateVignetteOverride } = settingsState

  // ── U11: Embedded browser panel state ──
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([])

  const openBrowserTab = useCallback((projectPath: string, projectName: string) => {
    // Build a default URL: try GitHub pages or just a Google search for the project
    const gitOwner = '' // could be resolved later
    const url = `https://www.google.com/search?q=${encodeURIComponent(projectName + ' documentation')}`
    const tab: BrowserTab = {
      id: makeBrowserTabId(),
      url,
      title: projectName,
      projectPath,
      projectName,
    }
    setBrowserTabs(prev => [...prev, tab])
  }, [])

  const closeBrowserTab = useCallback((id: string) => {
    setBrowserTabs(prev => prev.filter(t => t.id !== id))
  }, [])

  const closeAllBrowserTabs = useCallback(() => {
    setBrowserTabs([])
  }, [])

  const updateWizardFont = useCallback((size: number) => {
    setWizardFontSize(size)
    localStorage.setItem('hal-o-wizard-font', String(size))
    document.documentElement.style.setProperty('--wizard-font-size', `${size}px`)
  }, [])

  // Apply wizard font CSS variable on mount
  useEffect(() => {
    document.documentElement.style.setProperty('--wizard-font-size', `${wizardFontSize}px`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Camera sync: orbit/zoom -> sliders (only when tweaking is enabled)
  // Use a ref to avoid stale closures and prevent render loops
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const handleCameraMove = useCallback((distance: number, angle: number) => {
    updateCamera({ ...cameraRef.current, cameraDistance: Math.round(distance), cameraAngle: Math.round(angle) })
  }, [updateCamera])

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

  // Dock Mode: toggleable dockview-based layout (Phase 2)
  const [dockMode, setDockMode] = useState(() => localStorage.getItem('hal-o-dock-mode') === '1')
  const handleDockModeChange = useCallback((enabled: boolean) => {
    setDockMode(enabled)
    localStorage.setItem('hal-o-dock-mode', enabled ? '1' : '0')
  }, [])

  // GPU wizard: shown once on first hub load (P14b)
  const [showGpuWizard, setShowGpuWizard] = useState(false)
  // Check on mount and when viewMode transitions to 'hub'
  useEffect(() => {
    if (viewMode === 'hub' && !isGpuWizardDone()) {
      setShowGpuWizard(true)
    }
  }, [viewMode])

  const handleGpuWizardAccept = useCallback((preset: 'light' | 'medium' | 'high') => {
    updateGraphicsPreset(preset)
    setShowGpuWizard(false)
  }, [updateGraphicsPreset])

  const handleGpuWizardCustomize = useCallback(() => {
    setShowGpuWizard(false)
    // Dispatch event so SettingsMenu opens itself (no prop drilling needed)
    window.dispatchEvent(new CustomEvent('hal-open-settings'))
  }, [])

  const handleRedetectGpu = useCallback(() => {
    // Clear the done flag and show the wizard again
    localStorage.removeItem('hal-o-gpu-wizard-done')
    setShowGpuWizard(true)
  }, [])

  // Compute derived values (always, even when setup screen is showing)
  const activeSteps = getActiveSteps(state.answers)
  const currentStepIndex = activeSteps.findIndex((s) => s.id === state.currentStepId)
  const currentStep = activeSteps[currentStepIndex]
  const currentPhase = currentStep?.phase || 'basics'

  // ALL hooks must be above any conditional return — React requires stable hook order

  // Continuation message shown briefly when resuming after restart
  const [continuationMsg, setContinuationMsg] = useState<string | null>(null)

  // On mount: check for continuation file, then prerequisites, then decide view
  useEffect(() => {
    if (viewMode !== 'loading') return

    // Safety timeout: if IPC calls hang (e.g. on CI), force exit loading after 15s
    const safetyTimer = setTimeout(() => {
      setViewMode((prev) => {
        if (prev !== 'loading') return prev
        console.warn('[HAL-O] Loading safety timeout -- falling back to setup screen')
        return 'setup'
      })
    }, 15_000)

    // Check for continuation file first (D4)
    window.api.readContinuation().then((continuation) => {
      clearTimeout(safetyTimer)
      if (continuation) {
        // Show a brief "Continuing setup..." message, then go to setup
        setContinuationMsg(continuation.message || 'Continuing setup...')
        setTimeout(() => {
          setContinuationMsg(null)
          setViewMode('setup')
        }, 1500)
        return
      }

      // Check for first-launch wizard before normal boot
      decideView()
    }).catch(() => {
      clearTimeout(safetyTimer)
      decideView()
    })

    function decideView() {
      // First-launch wizard: check if wizard-complete.json exists
      window.api.wizardIsFirstLaunch().then((isFirst) => {
        if (isFirst) {
          setViewMode('first-launch')
          return
        }
        // Wizard already completed — continue to normal flow
        proceedToSetupOrHub()
      }).catch(() => {
        // IPC failed — fall through to existing flow
        proceedToSetupOrHub()
      })
    }

    function proceedToSetupOrHub() {
      const hasSeenSetup = localStorage.getItem('hal-o-setup-done') === '1'
      if (!hasSeenSetup) {
        setViewMode('setup')
        return
      }
      // Returning user — check prerequisites silently
      window.api.checkPrerequisites().then((status) => {
        const coreGood = status.gitInstalled && status.claudeCliInstalled && status.apiKeyFound
        setViewMode(coreGood ? 'hub' : 'setup')
      }).catch(() => {
        setViewMode('setup')
      })
    }

    return () => clearTimeout(safetyTimer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    // U21: Detect subscription type for token budget default
    window.api.detectSubscriptionType?.().then((info) => {
      setState((prev) => ({
        ...prev,
        answers: {
          ...prev.answers,
          '_subscription_type': { value: info.type, label: info.type },
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

  if (viewMode === 'loading') {
    return (
      <div className="app" style={{ background: 'var(--bg-base)' }}>
        {continuationMsg && (
          <div className="continuation-banner">
            <div className="analysis-spinner" style={{ width: 16, height: 16, display: 'inline-block', marginRight: 10 }} />
            {continuationMsg}
          </div>
        )}
      </div>
    )
  }

  if (viewMode === 'first-launch') {
    return (
      <ErrorBoundary>
        <FirstLaunchWizard
          onComplete={(wizardConfig: WizardConfig) => {
            // Write wizard-complete.json via IPC
            window.api.wizardComplete({
              persona: wizardConfig.persona,
              provider: wizardConfig.provider,
              voiceEnabled: wizardConfig.voiceEnabled,
              voiceProfile: wizardConfig.voiceProfile,
              personality: wizardConfig.personality,
              projectCount: wizardConfig.importedProjects.length,
              useDemoMode: wizardConfig.useDemoMode,
            }).catch(() => { /* best effort */ })

            // Apply voice settings from wizard
            if (wizardConfig.voiceEnabled) {
              updateVoiceOut(true)
              if (wizardConfig.voiceProfile !== 'auto') {
                updateVoiceProfile(wizardConfig.voiceProfile)
              }
            }

            // Apply personality settings from wizard
            const p = wizardConfig.personality
            updatePersonality('humor', p.humor)
            updatePersonality('formality', p.formality)
            updatePersonality('verbosity', p.verbosity)
            updatePersonality('dramatic', p.dramatic)

            // If user chose demo mode, set the flag
            if (wizardConfig.useDemoMode) {
              localStorage.setItem('hal-o-demo-mode', 'true')
            }

            // Proceed to setup screen (prerequisites check) or hub
            setViewMode('setup')
          }}
        />
      </ErrorBoundary>
    )
  }

  if (viewMode === 'setup') {
    return (
      <ErrorBoundary>
        <div className="app">
          <div className="chat-area">
            <SetupScreen onReady={() => setViewMode('hub')} />
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  if (viewMode === 'configure' && configurePath) {
    return (
      <ErrorBoundary>
        <ProjectConfigScreen
          projectPath={configurePath}
          onBackToHub={() => { setConfigurePath(null); setViewMode('hub') }}
          onOpenInHub={(path, name) => {
            setConfigurePath(null)
            openTerminal(path, name, false)
            setViewMode('hub')
          }}
        />
      </ErrorBoundary>
    )
  }

  if (viewMode === 'hub') {
    // Shared callbacks for both layout modes
    const hubOnNewProject = () => {
      if (demo.enabled) return
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
    }
    const hubOnConvertProject = async (path: string) => {
      if (demo.enabled) return
      // Add to tree (opt-in) so it persists
      const name = path.split(/[/\\]/).filter(Boolean).pop() || 'project'
      try {
        const tree = await window.api.treeGet()
        await window.api.treeCreate('project', name, tree.rootId, { path })
      } catch {}
      // Also open wizard for full configuration
      setConfigurePath(path)
      setViewMode('configure')
    }

    // ── Dock Mode: dockview-based layout ──
    if (dockMode && !demo.enabled) {
      return (
        <ErrorBoundary>
          <DockLayout
            settings={settingsState}
            onNewProject={hubOnNewProject}
            onConvertProject={hubOnConvertProject}
            onOpenTerminal={openTerminal}
            onVoiceFocusHub={() => setVoiceFocus('hub')}
            onCameraMove={handleCameraMove}
            onRedetectGpu={handleRedetectGpu}
            onOpenBrowser={openBrowserTab}
            wizardFontSize={wizardFontSize}
            onWizardFontSize={updateWizardFont}
            voiceFocus={voiceFocus}
            halSessionId={getHalSessionId()}
            terminalCount={termSessions.length}
            demo={demo}
            focusZone={focusZone}
            termSessions={termSessions}
            onCloseTerminal={closeTerminal}
            onVoiceFocus={(id) => setVoiceFocus(id)}
            dockMode={dockMode}
            onDockModeChange={handleDockModeChange}
          />
          {showGpuWizard && <GpuWizardModal onAccept={handleGpuWizardAccept} onCustomize={handleGpuWizardCustomize} />}
        </ErrorBoundary>
      )
    }

    // ── Classic layout: manual flex + draggable divider ──
    const hasRealTerminals = termSessions.length > 0
    const hasDemoTerminals = demo.enabled && demo.terminalCount > 0
    const hasBrowser = browserTabs.length > 0
    const hasTerminals = hasRealTerminals || hasDemoTerminals || hasBrowser
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
      <ErrorBoundary>
      <div className="app" style={{ display: 'flex', flexDirection: flexDir, height: '100vh' }}>
        <div style={hubStyle}>
          <ProjectHub
            settings={settingsState}
            onNewProject={hubOnNewProject}
            onConvertProject={hubOnConvertProject}
            onOpenTerminal={demo.enabled ? undefined : openTerminal}
            voiceFocus={voiceFocus}
            onVoiceFocusHub={() => setVoiceFocus('hub')}
            hubFontSize={hubFontSize}
            termFontSize={termFontSize}
            wizardFontSize={wizardFontSize}
            onWizardFontSize={updateWizardFont}
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
            particleDensity={particleDensity}
            onParticleDensityChange={updateParticleDensity}
            renderQuality={renderQuality}
            onRenderQualityChange={updateRenderQuality}
            camera={camera}
            onCameraChange={updateCamera}
            onCameraReset={resetCamera}
            onCameraMove={handleCameraMove}
            rendererId={rendererId}
            onRendererChange={updateRenderer}
            layoutId={layoutId}
            onLayoutChange={updateLayout}
            threeTheme={threeTheme}
            onThreeThemeChange={updateThreeTheme}
            shipVfxEnabled={shipVfxEnabled}
            onShipVfxEnabledChange={updateShipVfxEnabled}
            activityFeedback={activityFeedback}
            onActivityFeedbackChange={updateActivityFeedback}
            sphereStyle={sphereStyle}
            onSphereStyleChange={updateSphereStyle}
            voiceReactionIntensity={voiceReactionIntensity}
            onVoiceReactionIntensityChange={updateVoiceReactionIntensity}
            personality={personality}
            onPersonalityChange={updatePersonality}
            onPersonalityPreset={applyPersonalityPreset}
            halSessionId={demo.enabled ? 'demo-hal' : getHalSessionId()}
            terminalCount={demo.enabled ? demo.terminalCount : termSessions.length}
            demo={demo}
            defaultIde={defaultIde}
            onDefaultIdeChange={updateDefaultIde}
            defaultTerminalModel={defaultTerminalModel}
            onDefaultTerminalModelChange={updateDefaultTerminalModel}
            dockMode={dockMode}
            onDockModeChange={handleDockModeChange}
            introAnimation={introAnimation}
            onIntroAnimationChange={updateIntroAnimation}
            graphicsPreset={graphicsPreset}
            onGraphicsPresetChange={updateGraphicsPreset}
            bloomEnabled={bloomEnabled}
            onBloomEnabledChange={updateBloomEnabled}
            chromaticAberrationEnabled={chromaticAberrationEnabled}
            onChromaticAberrationEnabledChange={updateChromaticAberrationEnabled}
            floorLinesEnabled={floorLinesEnabled}
            onFloorLinesEnabledChange={updateFloorLinesEnabled}
            groupTrailsEnabled={groupTrailsEnabled}
            onGroupTrailsEnabledChange={updateGroupTrailsEnabled}
            autoRotateEnabled={autoRotateEnabled}
            onAutoRotateEnabledChange={updateAutoRotateEnabled}
            autoRotateSpeed={autoRotateSpeed}
            onAutoRotateSpeedChange={updateAutoRotateSpeed}
            cardsPerSector={cardsPerSector}
            onCardsPerSectorChange={updateCardsPerSector}
            onRedetectGpu={handleRedetectGpu}
            onOpenBrowser={openBrowserTab}
            devlogSections={devlogSections}
            onDevlogSectionChange={updateDevlogSection}
            onSetAllDevlogSections={setAllDevlogSections}
            focusZone={focusZone}
            bloomIntensityOverride={bloomIntensityOverride}
            onBloomIntensityOverrideChange={updateBloomIntensityOverride}
            gridOpacityOverride={gridOpacityOverride}
            onGridOpacityOverrideChange={updateGridOpacityOverride}
            particleBrightnessOverride={particleBrightnessOverride}
            onParticleBrightnessOverrideChange={updateParticleBrightnessOverride}
            vignetteOverride={vignetteOverride}
            onVignetteOverrideChange={updateVignetteOverride}
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
            {/* Browser panel rendered above terminals when browser tabs exist */}
            {hasBrowser && (
              <div style={{
                height: (hasRealTerminals || hasDemoTerminals) ? '50%' : '100%',
                borderBottom: (hasRealTerminals || hasDemoTerminals) ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <BrowserPanel
                  tabs={browserTabs}
                  onClose={closeBrowserTab}
                  onCloseAll={closeAllBrowserTabs}
                />
              </div>
            )}
            {demo.enabled ? (
              <DemoTerminalView
                terminalCount={demo.terminalCount}
                tabsMin={demo.tabsMin}
                tabsMax={demo.tabsMax}
                fontSize={termFontSize}
              />
            ) : (hasRealTerminals && (
              <div style={{ height: hasBrowser ? '50%' : '100%' }}>
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
            ))}
          </div>
        )}
      </div>
      {showGpuWizard && <GpuWizardModal onAccept={handleGpuWizardAccept} onCustomize={handleGpuWizardCustomize} />}
      </ErrorBoundary>
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
      'tech-stack': { value: analysis.techStack, label: analysis.techStackLabel || analysis.techStack, preDetected: !!analysis.folderDetection },
      'languages': { value: analysis.languages, label: analysis.languages.join(', '), preDetected: !!analysis.folderDetection },
      'styling': { value: analysis.styling || 'none', label: analysis.styling || 'none' },
      'database': { value: analysis.database || 'none', label: analysis.database || 'none' },
    }
    // Store conventions for richer CLAUDE.md generation
    if (analysis.conventions.length > 0) {
      newAnswers['_conventions'] = { value: analysis.conventions, label: analysis.conventions.join('; ') }
    }

    // In quick-create mode: skip to creation immediately after stack is confirmed
    if (isQuickCreate(newAnswers)) {
      setState((prev) => ({
        ...prev,
        answers: newAnswers,
        isCreating: true,
        creationLog: ['Starting quick create...'],
        showReview: false,
      }))
      const config = answersToConfig(newAnswers)
      window.api.createProject(config as unknown as Record<string, unknown>)
        .then((result) => {
          setState((prev) => ({
            ...prev,
            isCreating: false,
            creationLog: result.log,
            creationDone: true,
            createdPath: result.path || null,
          }))
        })
        .catch((err) => {
          setState((prev) => ({
            ...prev,
            isCreating: false,
            creationLog: [...prev.creationLog, `[ERROR] ${err}`],
            creationDone: true,
          }))
        })
      return
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
      <ErrorBoundary>
        <div className="app" style={{ fontSize: 'var(--wizard-font-size, 14px)' }}>
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
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <div className="app" style={{ fontSize: 'var(--wizard-font-size, 14px)' }}>
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
    </ErrorBoundary>
  )
}
