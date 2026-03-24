import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { GRAPHICS_PRESETS, type GraphicsPresetId, detectGraphicsPreset, getGpuRendererName } from '../hooks/useSettings'

const STORAGE_KEY = 'hal-o-gpu-wizard-done'

const PRESET_DETAILS: Record<string, { icon: string; desc: string; color: string }> = {
  light:  { icon: '\u26A1', desc: 'Bloom off, reduced particles, capped DPI', color: '#4ade80' },
  medium: { icon: '\u2B50', desc: 'Bloom on, balanced particles, normal DPI', color: '#facc15' },
  high:   { icon: '\uD83D\uDD25', desc: 'All effects, full particles, native DPI', color: '#f97316' },
}

interface Props {
  onAccept: (preset: GraphicsPresetId) => void
  onCustomize: () => void
}

export function GpuWizardModal({ onAccept, onCustomize }: Props) {
  const [gpuName, setGpuName] = useState('Detecting...')
  const [recommended, setRecommended] = useState<GraphicsPresetId>('medium')
  const [selected, setSelected] = useState<GraphicsPresetId>('medium')

  useEffect(() => {
    const name = getGpuRendererName()
    const preset = detectGraphicsPreset()
    setGpuName(name)
    setRecommended(preset)
    setSelected(preset)
  }, [])

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    onAccept(selected)
  }

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

        {/* Preset cards */}
        <div className="gpu-wizard-presets">
          {GRAPHICS_PRESETS.map((p) => {
            const detail = PRESET_DETAILS[p.id] || { icon: '', desc: '', color: '#fff' }
            const isSelected = selected === p.id
            const isRec = recommended === p.id
            return (
              <button
                key={p.id}
                className={`gpu-wizard-preset-card ${isSelected ? 'selected' : ''} ${isRec ? 'recommended' : ''}`}
                onClick={() => setSelected(p.id)}
                style={{
                  '--preset-color': detail.color,
                  borderColor: isSelected ? detail.color : undefined,
                } as React.CSSProperties}
              >
                <div className="gpu-wizard-preset-icon">{detail.icon}</div>
                <div className="gpu-wizard-preset-label">{p.label}</div>
                <div className="gpu-wizard-preset-desc">{detail.desc}</div>
                {isRec && <div className="gpu-wizard-preset-badge">RECOMMENDED</div>}
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="gpu-wizard-actions">
          <button className="gpu-wizard-btn-accept" onClick={handleAccept}>
            ACCEPT {selected.toUpperCase()}
          </button>
          <button className="gpu-wizard-btn-customize" onClick={handleCustomize}>
            CUSTOMIZE IN SETTINGS
          </button>
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
