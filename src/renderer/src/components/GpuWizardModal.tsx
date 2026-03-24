import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { GRAPHICS_PRESETS, type GraphicsPresetId, detectGraphicsPreset, getGpuRendererName } from '../hooks/useSettings'

const STORAGE_KEY = 'hal-o-gpu-wizard-done'

const PRESET_DETAILS: Record<string, { icon: string; desc: string; color: string }> = {
  light:  { icon: '\u26A1', desc: 'Bloom off, reduced particles, capped DPI', color: '#4ade80' },
  medium: { icon: '\u2B50', desc: 'Bloom on, balanced particles, normal DPI', color: '#facc15' },
  high:   { icon: '\uD83D\uDD25', desc: 'All effects, full particles, native DPI', color: '#f97316' },
  customize: { icon: '\u2699', desc: 'Fine-tune every setting yourself', color: '#60a5fa' },
}

interface Props {
  onAccept: (preset: GraphicsPresetId) => void
  onCustomize: () => void
}

export function GpuWizardModal({ onAccept, onCustomize }: Props) {
  const [gpuName, setGpuName] = useState('Detecting...')
  const [recommended, setRecommended] = useState<GraphicsPresetId>('medium')
  const [selected, setSelected] = useState<GraphicsPresetId>('medium') // brief visual highlight before dismiss

  useEffect(() => {
    const name = getGpuRendererName()
    const preset = detectGraphicsPreset()
    setGpuName(name)
    setRecommended(preset)
    setSelected(preset)
  }, [])

  const handleCustomize = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    onCustomize()
  }

  return createPortal(
    <div className="gpu-wizard-backdrop">
      <div className="gpu-wizard-modal">
        {/* Header with scan lines */}
        <div className="gpu-wizard-header">
          <div className="gpu-wizard-scanline" />
          <div className="gpu-wizard-title">GPU DETECTED</div>
          <div className="gpu-wizard-gpu-name">{gpuName}</div>
        </div>

        {/* Recommendation */}
        <div className="gpu-wizard-recommended">
          RECOMMENDED PRESET: <span className="gpu-wizard-recommended-value" style={{ color: PRESET_DETAILS[recommended]?.color }}>{recommended.toUpperCase()}</span>
        </div>

        {/* Preset cards — one click selects AND accepts */}
        <div className="gpu-wizard-presets">
          {GRAPHICS_PRESETS.map((p) => {
            const detail = PRESET_DETAILS[p.id] || { icon: '', desc: '', color: '#fff' }
            const isRec = recommended === p.id
            return (
              <button
                key={p.id}
                className={`gpu-wizard-preset-card ${isRec ? 'recommended' : ''}`}
                onClick={() => { setSelected(p.id); localStorage.setItem(STORAGE_KEY, '1'); onAccept(p.id) }}
                style={{ '--preset-color': detail.color } as React.CSSProperties}
              >
                <div className="gpu-wizard-preset-icon">{detail.icon}</div>
                <div className="gpu-wizard-preset-label">{p.label}</div>
                <div className="gpu-wizard-preset-desc">{detail.desc}</div>
                {isRec && <div className="gpu-wizard-preset-badge">RECOMMENDED</div>}
              </button>
            )
          })}
          {/* Customize card — same style, opens settings */}
          <button
            className="gpu-wizard-preset-card"
            onClick={handleCustomize}
            style={{ '--preset-color': PRESET_DETAILS.customize.color } as React.CSSProperties}
          >
            <div className="gpu-wizard-preset-icon">{PRESET_DETAILS.customize.icon}</div>
            <div className="gpu-wizard-preset-label">Customize</div>
            <div className="gpu-wizard-preset-desc">{PRESET_DETAILS.customize.desc}</div>
          </button>
        </div>

        {/* Reassurance */}
        <div className="gpu-wizard-hint" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '11px', marginTop: '8px' }}>
          You can always change this later in Settings &rarr; Graphics
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Check if GPU wizard has been completed. */
export function isGpuWizardDone(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

/** Reset GPU wizard so it shows again. */
export function resetGpuWizard(): void {
  localStorage.removeItem(STORAGE_KEY)
}
