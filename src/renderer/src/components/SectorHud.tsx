/**
 * Sector HUD — compact indicator showing current sector, total sectors,
 * navigation chevrons, and dot array. Fixed overlay at bottom-center of the hub.
 *
 * Fades to 0 opacity when only 1 sector exists.
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
  const show = totalSectors > 1

  // Transition flash message — shows briefly on sector change
  const [flashMsg, setFlashMsg] = useState('')
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevSectorRef = useRef(currentSector)

  useEffect(() => {
    if (prevSectorRef.current !== currentSector && show) {
      const msg = `[ SECTOR ${currentSector + 1} ONLINE \u2014 ${sectorProjectCount} TARGET${sectorProjectCount !== 1 ? 'S' : ''} ACQUIRED ]`
      setFlashMsg(msg)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashMsg(''), 2000)
    }
    prevSectorRef.current = currentSector
  }, [currentSector, show, sectorProjectCount])

  const dots = useMemo(() => {
    const result: { index: number; active: boolean; hue: string }[] = []
    for (let i = 0; i < totalSectors; i++) {
      result.push({ index: i, active: i === currentSector, hue: getSectorHue(i) })
    }
    return result
  }, [totalSectors, currentSector])

  const accentColor = sectorHue || getSectorHue(currentSector)

  return (
    <div
      className="hal-sector-hud"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        transition: 'opacity 0.4s ease',
        fontFamily: '"Cascadia Code", "Fira Code", monospace',
        userSelect: 'none',
      }}
    >
      {/* Sector label with chevrons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 'calc(var(--hub-font, 10px) + 1px)',
          letterSpacing: 3,
          color: accentColor,
          textShadow: `0 0 8px ${accentColor}44`,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          style={{
            background: 'none',
            border: 'none',
            color: accentColor,
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: 'inherit',
            opacity: 0.7,
            transition: 'opacity 0.2s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.7' }}
          title="Previous sector ([)"
        >
          &#9664;
        </button>

        <span style={{ opacity: transitioning ? 0.5 : 0.9, transition: 'opacity 0.3s' }}>
          SECTOR {currentSector + 1} / {totalSectors}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onNext() }}
          style={{
            background: 'none',
            border: 'none',
            color: accentColor,
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: 'inherit',
            opacity: 0.7,
            transition: 'opacity 0.2s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.7' }}
          title="Next sector (])"
        >
          &#9654;
        </button>
      </div>

      {/* Dot array */}
      {totalSectors > 1 && totalSectors <= 12 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {dots.map((dot) => (
            <button
              key={dot.index}
              onClick={(e) => { e.stopPropagation(); onJump(dot.index) }}
              style={{
                width: dot.active ? 10 : 7,
                height: dot.active ? 10 : 7,
                borderRadius: '50%',
                background: dot.active ? dot.hue : 'transparent',
                border: `1.5px solid ${dot.hue}`,
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.3s ease',
                boxShadow: dot.active ? `0 0 8px ${dot.hue}88` : 'none',
                opacity: dot.active ? 1 : 0.5,
              }}
              title={`Sector ${dot.index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Flash message on sector change */}
      {flashMsg && (
        <div
          style={{
            fontSize: 'calc(var(--hub-font, 10px) - 1px)',
            letterSpacing: 2,
            color: accentColor,
            opacity: 0.75,
            textShadow: `0 0 12px ${accentColor}66`,
            animation: 'sectorFlash 2s ease-out forwards',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {flashMsg}
        </div>
      )}

      {/* Inline keyframes for flash animation */}
      <style>{`
        @keyframes sectorFlash {
          0% { opacity: 0; transform: translateY(4px); }
          15% { opacity: 0.85; transform: translateY(0); }
          70% { opacity: 0.7; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
