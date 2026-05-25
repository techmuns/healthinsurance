import { ArrowDownRight, ArrowUpRight, Crown } from 'lucide-react'
import type { LeaderRow } from '@/data/mockData'

// Podium accents: gold / steel / bronze-ish, kept muted and institutional.
const podiumStyle = [
  { ring: 'ring-gold/40', chip: 'bg-gold/15 text-gold', badge: 'bg-gold text-white' },
  { ring: 'ring-muted-blue/30', chip: 'bg-soft-blue text-navy-primary', badge: 'bg-muted-blue text-white' },
  { ring: 'ring-coral/30', chip: 'bg-coral/10 text-coral', badge: 'bg-coral text-white' },
]

export function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const top3 = rows.slice(0, 3)
  const rest = rows.slice(3)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        {top3.map((r, i) => {
          const s = podiumStyle[i]
          return (
            <div
              key={r.ticker}
              className={[
                'relative rounded-xl border bg-card p-3 text-center ring-1 transition-shadow hover:shadow-soft',
                r.focal ? 'border-teal/50 ring-teal/40' : `border-soft-border ${s.ring}`,
              ].join(' ')}
            >
              <span className={`absolute -top-2 left-1/2 inline-flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-[11px] font-bold ${s.badge}`}>
                {i === 0 ? <Crown className="h-3 w-3" /> : i + 1}
              </span>
              <p className="mt-1.5 truncate text-[11px] font-semibold text-navy-deep">{r.name}</p>
              <p className="mt-1 font-display text-xl text-navy-deep">{r.value}</p>
              <span
                className={[
                  'mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  r.positive ? 'bg-emerald-soft text-emerald' : 'bg-coral-soft text-coral',
                ].join(' ')}
              >
                {r.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {r.delta}
              </span>
            </div>
          )
        })}
      </div>

      <ul className="space-y-1">
        {rest.map((r, i) => (
          <li
            key={r.ticker}
            className={[
              'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px]',
              r.focal ? 'bg-teal-soft' : 'bg-ice/60',
            ].join(' ')}
          >
            <span className="w-4 text-center font-semibold text-ink-secondary">{i + 4}</span>
            <span className={`flex-1 truncate ${r.focal ? 'font-semibold text-navy-deep' : 'text-ink-primary'}`}>
              {r.name}
            </span>
            <span className="font-semibold tabular-nums text-navy-deep">{r.value}</span>
            <span className={`inline-flex items-center gap-0.5 tabular-nums ${r.positive ? 'text-emerald' : 'text-coral'}`}>
              {r.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {r.delta}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
