/**
 * Sector HUD — compact indicator showing current sector, total sectors,
 * navigation chevrons, and dot array. Fixed overlay at bottom-center of the hub.
 *
 * Fades to 0 opacity when only 1 sector exists.
 */
import { useMemo } from 'react'
import { getSectorHue } from '../hooks/useSectors'

interface Props {
  currentSector: number // 0-based
  totalSectors: number
  onPrev: () => void
  onNext: () => void
  onJump: (sector: number) => void
  transitioning?: boolean
  sectorHue?: string
}

export function SectorHud({ currentSector, totalSectors, onPrev, onNext, onJump, transitioning, sectorHue }: Props) {
  const show = totalSectors > 1

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
    </div>
  )
}
