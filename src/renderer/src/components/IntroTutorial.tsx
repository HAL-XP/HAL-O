import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ── UX2: Intro Tutorial — sci-fi mission briefing tooltips ──

const STORAGE_KEY = 'hal-o-tutorial-done'

export function isTutorialDone(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function resetTutorial(): void {
  localStorage.removeItem(STORAGE_KEY)
}

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

interface TutorialStep {
  selector: string
  title: string
  description: string
  position: TooltipPosition
  fallbackPosition?: { top: number; left: number }
}

const STEPS: TutorialStep[] = [
  {
    selector: '.hal-room',
    title: 'MISSION CONTROL',
    description: 'Welcome, Commander. This is your tactical overview — a real-time holographic display of all field operations. Every project in your command is visible from here.',
    position: 'bottom',
    fallbackPosition: { top: 120, left: window.innerWidth / 2 - 180 },
  },
  {
    selector: '.hal-arc-card, [data-tutorial="screen-panel"]',
    title: 'ORBITAL ASSETS',
    description: 'Your projects orbit the central sphere. Each card shows status, tech stack, and session activity. Hover to deploy, resume, or inspect.',
    position: 'left',
  },
  {
    selector: '[data-tutorial="settings-gear"]',
    title: 'SYSTEMS CONFIGURATION',
    description: 'Access the control matrix. Renderers, themes, layouts, voice profiles, graphics presets — every parameter of your command center is tunable.',
    position: 'bottom',
  },
  {
    selector: '[data-tutorial="add-project"]',
    title: 'ENLIST NEW OPERATIONS',
    description: 'Import existing codebases or create new projects from scratch. HAL-O scans your workspace and sets up Claude Code integration automatically.',
    position: 'bottom',
  },
  {
    selector: '.hal-mic',
    title: 'VOICE LINK',
    description: 'Hold CTRL+SPACE to talk to HAL. Voice commands are transcribed and routed to your active terminal. The sphere pulses when listening.',
    position: 'bottom',
  },
  {
    selector: '.hal-center-label',
    title: 'BRIEFING COMPLETE',
    description: 'You are cleared for duty. The sphere shows HAL\'s connection status — open a terminal to bring HAL online. Right-click any project card for advanced operations.',
    position: 'top',
  },
]

interface Props {
  onComplete: () => void
}

export function IntroTutorial({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({})
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const currentStep = STEPS[step]

  const positionTooltip = useCallback(() => {
    if (!currentStep) return

    const el = document.querySelector(currentStep.selector)
    if (!el) {
      // Fallback: use provided position or center of screen
      const fb = currentStep.fallbackPosition || { top: window.innerHeight / 2 - 80, left: window.innerWidth / 2 - 180 }
      setTooltipPos(fb)
      setHighlightRect(null)
      setArrowStyle({ display: 'none' })
      setVisible(true)
      return
    }

    const rect = el.getBoundingClientRect()
    setHighlightRect(rect)

    const tooltipW = 380
    const tooltipH = tooltipRef.current?.offsetHeight || 180
    const margin = 16
    const arrowSize = 10

    let top = 0
    let left = 0
    const arrowCss: React.CSSProperties = { position: 'absolute' }

    switch (currentStep.position) {
      case 'bottom':
        top = rect.bottom + margin + arrowSize
        left = Math.max(margin, Math.min(rect.left + rect.width / 2 - tooltipW / 2, window.innerWidth - tooltipW - margin))
        arrowCss.top = -arrowSize
        arrowCss.left = Math.max(20, Math.min(rect.left + rect.width / 2 - left - arrowSize / 2, tooltipW - 40))
        arrowCss.borderLeft = `${arrowSize}px solid transparent`
        arrowCss.borderRight = `${arrowSize}px solid transparent`
        arrowCss.borderBottom = `${arrowSize}px solid rgba(0, 255, 255, 0.4)`
        break
      case 'top':
        top = rect.top - tooltipH - margin - arrowSize
        left = Math.max(margin, Math.min(rect.left + rect.width / 2 - tooltipW / 2, window.innerWidth - tooltipW - margin))
        arrowCss.bottom = -arrowSize
        arrowCss.left = Math.max(20, Math.min(rect.left + rect.width / 2 - left - arrowSize / 2, tooltipW - 40))
        arrowCss.borderLeft = `${arrowSize}px solid transparent`
        arrowCss.borderRight = `${arrowSize}px solid transparent`
        arrowCss.borderTop = `${arrowSize}px solid rgba(0, 255, 255, 0.4)`
        break
      case 'left':
        left = rect.left - tooltipW - margin - arrowSize
        top = Math.max(margin, Math.min(rect.top + rect.height / 2 - tooltipH / 2, window.innerHeight - tooltipH - margin))
        // If no space on left, flip to right
        if (left < margin) {
          left = rect.right + margin + arrowSize
          arrowCss.left = -arrowSize
          arrowCss.top = Math.max(20, Math.min(rect.top + rect.height / 2 - top - arrowSize / 2, tooltipH - 40))
          arrowCss.borderTop = `${arrowSize}px solid transparent`
          arrowCss.borderBottom = `${arrowSize}px solid transparent`
          arrowCss.borderRight = `${arrowSize}px solid rgba(0, 255, 255, 0.4)`
        } else {
          arrowCss.right = -arrowSize
          arrowCss.top = Math.max(20, Math.min(rect.top + rect.height / 2 - top - arrowSize / 2, tooltipH - 40))
          arrowCss.borderTop = `${arrowSize}px solid transparent`
          arrowCss.borderBottom = `${arrowSize}px solid transparent`
          arrowCss.borderLeft = `${arrowSize}px solid rgba(0, 255, 255, 0.4)`
        }
        break
      case 'right':
        left = rect.right + margin + arrowSize
        top = Math.max(margin, Math.min(rect.top + rect.height / 2 - tooltipH / 2, window.innerHeight - tooltipH - margin))
        arrowCss.left = -arrowSize
        arrowCss.top = Math.max(20, Math.min(rect.top + rect.height / 2 - top - arrowSize / 2, tooltipH - 40))
        arrowCss.borderTop = `${arrowSize}px solid transparent`
        arrowCss.borderBottom = `${arrowSize}px solid transparent`
        arrowCss.borderRight = `${arrowSize}px solid rgba(0, 255, 255, 0.4)`
        break
    }

    setTooltipPos({ top, left })
    setArrowStyle(arrowCss)
    setVisible(true)
  }, [currentStep])

  // Position on step change and window resize
  useEffect(() => {
    // Slight delay so DOM elements are ready after scene loads
    const timer = setTimeout(positionTooltip, 300)
    window.addEventListener('resize', positionTooltip)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', positionTooltip)
    }
  }, [positionTooltip])

  // Re-position after tooltip renders (needs its height)
  useEffect(() => {
    if (visible && tooltipRef.current) {
      rafRef.current = requestAnimationFrame(positionTooltip)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [visible, positionTooltip])

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    onComplete()
  }, [onComplete])

  const handleNext = useCallback(() => {
    setVisible(false)
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      handleSkip()
    }
  }, [step, handleSkip])

  // ESC to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSkip])

  if (!currentStep) return null

  const isLast = step === STEPS.length - 1

  return createPortal(
    <div className="tutorial-overlay">
      {/* Spotlight cutout highlight */}
      {highlightRect && (
        <div
          className="tutorial-spotlight"
          style={{
            top: highlightRect.top - 6,
            left: highlightRect.left - 6,
            width: highlightRect.width + 12,
            height: highlightRect.height + 12,
          }}
        />
      )}

      {/* Tooltip balloon */}
      <div
        ref={tooltipRef}
        className={`tutorial-tooltip ${visible ? 'tutorial-tooltip--visible' : ''}`}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        {/* Arrow */}
        <div className="tutorial-arrow" style={arrowStyle} />

        {/* Scanline decoration */}
        <div className="tutorial-scanline" />

        {/* Header with step counter */}
        <div className="tutorial-header">
          <span className="tutorial-step-badge">
            BRIEFING {step + 1}/{STEPS.length}
          </span>
          <button className="tutorial-skip-btn" onClick={handleSkip} title="Skip tutorial (ESC)">
            SKIP
          </button>
        </div>

        {/* Content */}
        <div className="tutorial-title">{currentStep.title}</div>
        <div className="tutorial-desc">{currentStep.description}</div>

        {/* Navigation */}
        <div className="tutorial-footer">
          <div className="tutorial-progress">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`tutorial-progress-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
              />
            ))}
          </div>
          <button className="tutorial-next-btn" onClick={handleNext}>
            {isLast ? 'COMMENCE' : 'NEXT'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
