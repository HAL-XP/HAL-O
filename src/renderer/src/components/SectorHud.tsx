/**
 * Sector HUD — bold, always-visible pagination bar at bottom of the hub.
 * Shows big arrow buttons, page dots, and sector label.
 * Dimmed (alpha) when only 1 sector exists, fully visible when multiple.
 */
import { useMemo, useState, useEffect, useRef } from 'react'
import { getSectorHue } from '../hooks/useSectors'

interface Props {
  currentSector: number // 0-based
  totalSectors: number
  sectorProjectCount?: number // number of projects in current sector
  onPrev: () => void
  onNext: () => void
  onJump: (sector: number) => void
  transitioning?: boolean
  sectorHue?: string
}

export function SectorHud({ currentSector, totalSectors, sectorProjectCount = 0, onPrev, onNext, onJump, transitioning, sectorHue }: Props) {
  const multiPage = totalSectors > 1

  // Transition flash message
  const [flashMsg, setFlashMsg] = useState('')
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevSectorRef = useRef(currentSector)

  useEffect(() => {
    if (prevSectorRef.current !== currentSector && multiPage) {
      const msg = `SECTOR ${currentSector + 1} ONLINE \u2014 ${sectorProjectCount} TARGET${sectorProjectCount !== 1 ? 'S' : ''}`
      setFlashMsg(msg)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashMsg(''), 2500)
    }
    prevSectorRef.current = currentSector
  }, [currentSector, multiPage, sectorProjectCount])

  const dots = useMemo(() => {
    const result: { index: number; active: boolean; hue: string }[] = []
    for (let i = 0; i < totalSectors; i++) {
      result.push({ index: i, active: i === currentSector, hue: getSectorHue(i) })
    }
    return result
  }, [totalSectors, currentSector])

  const accentColor = sectorHue || getSectorHue(currentSector)

  // Arrow SVG for left/right
  const Arrow = ({ dir, onClick, disabled }: { dir: 'left' | 'right'; onClick: () => void; disabled?: boolean }) => (
    <button
      className="sector-arrow"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={dir === 'left' ? 'Previous sector  [' : 'Next sector  ]'}
      style={{
        opacity: disabled ? 0.15 : undefined,
        cursor: disabled ? 'default' : undefined,
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'left'
          ? <polyline points="15 18 9 12 15 6" />
          : <polyline points="9 6 15 12 9 18" />
        }
      </svg>
    </button>
  )

  return (
    <>
      <div
        className="sector-bar"
        style={{
          opacity: multiPage ? 1 : 0.25,
          pointerEvents: multiPage ? 'auto' : 'none',
        }}
      >
        {/* Left arrow */}
        <Arrow dir="left" onClick={onPrev} disabled={!multiPage} />

        {/* Center: page info */}
        <div className="sector-center">
          {/* Dot array (up to 20 sectors) */}
          {totalSectors > 1 && totalSectors <= 20 && (
            <div className="sector-dots">
              {dots.map((dot) => (
                <button
                  key={dot.index}
                  className={`sector-dot ${dot.active ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onJump(dot.index) }}
                  style={{
                    '--dot-hue': dot.hue,
                    background: dot.active ? dot.hue : 'transparent',
                    borderColor: dot.hue,
                    boxShadow: dot.active ? `0 0 10px ${dot.hue}88, 0 0 20px ${dot.hue}44` : 'none',
                  } as React.CSSProperties}
                  title={`Sector ${dot.index + 1}`}
                />
              ))}
            </div>
          )}

          {/* Label */}
          <div
            className="sector-label"
            style={{ color: accentColor, textShadow: `0 0 12px ${accentColor}55` }}
          >
            <span className="sector-num" style={{ opacity: transitioning ? 0.4 : 1 }}>
              {currentSector + 1}
            </span>
            <span className="sector-sep">/</span>
            <span className="sector-total">{totalSectors}</span>
          </div>
        </div>

        {/* Right arrow */}
        <Arrow dir="right" onClick={onNext} disabled={!multiPage} />
      </div>

      {/* Flash message floats above the bar */}
      {flashMsg && (
        <div className="sector-flash" style={{ color: accentColor, textShadow: `0 0 16px ${accentColor}66` }}>
          {flashMsg}
        </div>
      )}

      <style>{`
        .sector-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 24px;
          background: linear-gradient(180deg, transparent 0%, rgba(4,7,16,0.85) 40%, rgba(4,7,16,0.95) 100%);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          transition: opacity 0.4s ease;
          user-select: none;
          font-family: 'Cascadia Code', 'Fira Code', monospace;
        }

        .sector-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 8px;
          background: rgba(0,229,255,0.04);
          border: 1px solid rgba(0,229,255,0.1);
          color: rgba(0,229,255,0.7);
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .sector-arrow:hover {
          background: rgba(0,229,255,0.1);
          border-color: rgba(0,229,255,0.25);
          color: #00e5ff;
          box-shadow: 0 0 16px rgba(0,229,255,0.15);
          transform: scale(1.05);
        }
        .sector-arrow:active {
          transform: scale(0.95);
        }

        .sector-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          min-width: 140px;
        }

        .sector-dots {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .sector-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid;
          padding: 0;
          cursor: pointer;
          transition: all 0.3s ease;
          opacity: 0.5;
        }
        .sector-dot.active {
          width: 14px;
          height: 14px;
          opacity: 1;
        }
        .sector-dot:hover {
          opacity: 1;
          transform: scale(1.3);
        }

        .sector-label {
          display: flex;
          align-items: baseline;
          gap: 4px;
          letter-spacing: 2px;
          font-weight: 700;
        }
        .sector-num {
          font-size: 22px;
          transition: opacity 0.3s;
        }
        .sector-sep {
          font-size: 14px;
          opacity: 0.35;
        }
        .sector-total {
          font-size: 14px;
          opacity: 0.5;
        }

        .sector-flash {
          position: absolute;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 21;
          font-family: 'Cascadia Code', 'Fira Code', monospace;
          font-size: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
          white-space: nowrap;
          animation: sectorFlash 2.5s ease-out forwards;
          pointer-events: none;
        }

        @keyframes sectorFlash {
          0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
          12% { opacity: 0.9; transform: translateX(-50%) translateY(0); }
          65% { opacity: 0.7; }
          100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
        }
      `}</style>
    </>
  )
}
