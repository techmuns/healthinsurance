// Compact semicircle gauge for the Market Concentration card. Pure SVG so it
// stays light and fully on-theme (thin track, rounded cap, band-coded fill).
// `value` is 0–1; the arc fills that fraction of the half-circle.

import type { ConcentrationBand } from '@/lib/industryOverview'

const BAND_STOPS: Record<ConcentrationBand, [string, string]> = {
  Low: ['#3CB1AE', '#168E8E'], // teal — fragmented / competitive
  Moderate: ['#D5B36A', '#B68B3A'], // champagne — moderate
  High: ['#D98A82', '#C0584F'], // coral — concentrated
}

const BAND_TEXT: Record<ConcentrationBand, string> = {
  Low: '#0E6F6D',
  Moderate: '#9C7430',
  High: '#A8453C',
}

interface RadialGaugeProps {
  /** 0–1. */
  value: number
  /** Big centre label, e.g. "0.25". */
  display: string
  /** Small caption under the number, e.g. "HHI · 0–1". */
  caption?: string
  band: ConcentrationBand
}

const W = 220
const R = 88
const STROKE = 15
const CX = W / 2
const CY = R + STROKE / 2 + 6

function polar(angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) }
}

function arc(startDeg: number, endDeg: number) {
  const s = polar(startDeg)
  const e = polar(endDeg)
  const large = startDeg - endDeg > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

export function RadialGauge({ value, display, caption, band }: RadialGaugeProps) {
  const frac = Math.max(0, Math.min(1, value))
  const endDeg = 180 - frac * 180
  const [c0, c1] = BAND_STOPS[band]
  const gradId = `gauge-${band}`
  const knob = polar(endDeg)

  return (
    <div className="relative mx-auto" style={{ width: W, height: CY + 18 }}>
      <svg width={W} height={CY + 18} viewBox={`0 0 ${W} ${CY + 18}`} role="img" aria-label={`Concentration ${display}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c0} />
            <stop offset="100%" stopColor={c1} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={arc(180, 0)} fill="none" stroke="#EDF0F6" strokeWidth={STROKE} strokeLinecap="round" />
        {/* Value */}
        {frac > 0.002 && (
          <path d={arc(180, endDeg)} fill="none" stroke={`url(#${gradId})`} strokeWidth={STROKE} strokeLinecap="round" />
        )}
        {/* Knob */}
        {frac > 0.002 && <circle cx={knob.x} cy={knob.y} r={STROKE / 2 + 1.5} fill="#FFFFFF" stroke={c1} strokeWidth={2.5} />}
      </svg>
      {/* Centre readout */}
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: CY - 40 }}>
        <span className="font-display text-[30px] leading-none" style={{ color: BAND_TEXT[band] }}>
          {display}
        </span>
        {caption && <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink-secondary">{caption}</span>}
      </div>
      {/* Scale ends */}
      <div className="pointer-events-none absolute inset-x-0 flex justify-between px-1 text-[10px] text-ink-secondary" style={{ top: CY + 2 }}>
        <span>0</span>
        <span>1</span>
      </div>
    </div>
  )
}
