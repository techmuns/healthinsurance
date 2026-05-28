import { useState } from 'react'
import { Crown } from 'lucide-react'
import { leaderMetricDefs } from '@/lib/insurers'
import type { Insurer } from '@/data/types'

// Rank-coded medal palette — #1 champagne prestige, #2 cool slate-blue,
// #3 muted teal. Highlighted company always overrides with navy.
const rankBadge = [
  'bg-gradient-to-br from-champagne to-champagne-deep text-white shadow-soft ring-1 ring-[#EAD9B6]',
  'bg-gradient-to-br from-[#7E8AA1] to-[#5E6C82] text-white shadow-soft ring-1 ring-[#CBD3DE]',
  'bg-gradient-to-br from-teal to-[#0E6F6D] text-white shadow-soft ring-1 ring-[#BFE3E1]',
]
const peerBarFill = [
  'linear-gradient(90deg, #D5B36A 0%, #B68B3A 100%)', // #1 champagne
  'linear-gradient(90deg, #A0ACC0 0%, #6E7E96 100%)', // #2 slate
  'linear-gradient(90deg, #3CB1AE 0%, #168E8E 100%)', // #3 teal
]
const peerTrack = [
  'rgba(182,139,58,0.10)',
  'rgba(110,126,150,0.10)',
  'rgba(22,142,142,0.10)',
]

export function IndustryLeaders({
  insurers,
  highlightId,
  onSelect,
}: {
  insurers: Insurer[]
  highlightId: string
  onSelect?: (id: string) => void
}) {
  const [metricId, setMetricId] = useState(leaderMetricDefs[0].id)
  const def = leaderMetricDefs.find((m) => m.id === metricId) ?? leaderMetricDefs[0]

  const top3 = [...insurers].sort((a, b) => b[def.key] - a[def.key]).slice(0, 3)
  const max = Math.max(...top3.map((r) => r[def.key]), 1)
  const leaderId = top3[0]?.id

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-display text-[15px] text-navy-deep">Industry Leaders</p>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
          <Crown className="h-3.5 w-3.5 fill-champagne/25 text-champagne" /> leads {def.label}
        </p>
      </div>

      {/* Metric tabs */}
      <div className="mb-3 flex flex-wrap gap-1">
        {leaderMetricDefs.map((m) => {
          const on = m.id === metricId
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetricId(m.id)}
              className={[
                'rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-all duration-200',
                on
                  ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft ring-1 ring-[#1B3260]'
                  : 'bg-ice text-ink-secondary hover:bg-soft-blue hover:text-navy-primary',
              ].join(' ')}
              aria-pressed={on}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Top ranked bars */}
      <div className="space-y-2">
        {top3.map((r, i) => {
          const focal = r.id === highlightId
          const barFill = focal
            ? 'linear-gradient(90deg, #315AA9 0%, #1F3F7F 100%)'
            : peerBarFill[i]
          const trackBg = focal ? 'rgba(49,90,169,0.10)' : peerTrack[i]
          return (
            <div
              key={r.id}
              role="button"
              title={`Select ${r.shortName}`}
              onClick={() => onSelect?.(r.id)}
              className={`relative cursor-pointer rounded-md px-1.5 py-1 transition-all duration-200 ${focal ? 'focal-mark' : 'hover:-translate-y-0.5 hover:bg-ice/70'}`}
            >
              {r.id === leaderId && (
                <Crown
                  className="absolute -top-2 left-1/2 z-10 h-4 w-4 -translate-x-1/2 fill-champagne/25 text-champagne"
                  aria-label={`Leads ${def.label}`}
                />
              )}
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    focal ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft ring-1 ring-[#1B3260]' : rankBadge[i]
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`flex-1 truncate text-[12px] ${focal ? 'font-semibold text-navy-deep' : 'text-ink-primary'}`}>
                  {r.shortName}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-navy-deep">{def.format(r[def.key])}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: trackBg }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((r[def.key] / max) * 100)}%`, background: barFill }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
