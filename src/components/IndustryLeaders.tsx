import { useState } from 'react'
import { LeaderDot } from './LeaderDot'
import { leaderMetricDefs } from '@/lib/insurers'
import type { Insurer } from '@/data/types'

// Neutral medal tones; navy is reserved for the highlighted company's bar.
const rankBadge = ['bg-champagne text-white', 'bg-[#9AA3AF] text-white', 'bg-[#BCC2CB] text-white']
const peerBar = ['bg-teal', 'bg-[#6E7E96]', 'bg-[#9FB1C6]']

export function IndustryLeaders({ insurers, highlightId }: { insurers: Insurer[]; highlightId: string }) {
  const [metricId, setMetricId] = useState(leaderMetricDefs[0].id)
  const [hover, setHover] = useState<string | null>(null)
  const def = leaderMetricDefs.find((m) => m.id === metricId) ?? leaderMetricDefs[0]

  const top3 = [...insurers].sort((a, b) => b[def.key] - a[def.key]).slice(0, 3)
  const max = Math.max(...top3.map((r) => r[def.key]), 1)
  const leaderId = top3[0]?.id

  const hovered = top3.find((r) => r.id === hover)
  const interpSource = hovered ?? top3.find((r) => r.id === highlightId) ?? top3[0]

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-display text-[15px] text-navy-deep">Industry Leaders</p>
        <p className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
          <LeaderDot title="Leader" /> leads {def.label}
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
                  ? 'bg-navy-primary text-white shadow-soft'
                  : 'bg-ice text-ink-secondary hover:text-navy-primary',
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
          return (
            <div
              key={r.id}
              className={`rounded-md px-1.5 py-1 transition-colors ${focal ? 'focal-mark' : ''}`}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${rankBadge[i]}`}>
                  {i + 1}
                </span>
                <span className={`flex-1 truncate text-[12px] ${focal ? 'font-semibold text-navy-deep' : 'text-ink-primary'}`}>
                  {r.shortName}
                </span>
                {r.id === leaderId && <LeaderDot title={`Leads ${def.label}`} />}
                <span className="text-[12px] font-semibold tabular-nums text-navy-deep">{def.format(r[def.key])}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ice">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${focal ? 'bg-navy-primary' : peerBar[i % peerBar.length]}`}
                  style={{ width: `${Math.round((r[def.key] / max) * 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Hover interpretation — short investor line. */}
      {interpSource && (
        <p className="mt-3 border-t border-soft-border pt-2.5 text-[11.5px] leading-snug text-ink-secondary">
          <span className="font-semibold text-navy-primary">{interpSource.shortName}:</span> {interpSource.takeaway}
        </p>
      )}
    </div>
  )
}
