import { getPeerRankSnapshot, TONE_STYLE } from '@/lib/review'
import type { Insurer } from '@/data/types'

/** C. Niva Bupa's rank across the key PE metrics, at a glance. */
export function PeerRankSnapshot({ company, list }: { company: Insurer; list: Insurer[] }) {
  const rows = getPeerRankSnapshot(company, list)
  return (
    <div className="card-surface flex h-full flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="font-display text-[15px] text-navy-deep">Peer rank snapshot</p>
        <span className="text-[11px] text-ink-secondary">{company.shortName} vs peers</span>
      </div>

      <ul className="grid flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map((r) => {
          const style = TONE_STYLE[r.tone]
          return (
            <li
              key={r.label}
              className="flex items-center justify-between gap-2 rounded-lg border border-soft-border bg-card px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-secondary">{r.label}</span>
              <span className="text-[12px] font-semibold tabular-nums text-navy-deep">{r.display}</span>
              <span
                className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums"
                style={{ backgroundColor: style.bg, color: style.color }}
              >
                {r.rank ? `#${r.rank}/${r.of}` : 'n/a'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
