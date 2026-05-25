import type { ScoreRow } from '@/data/mockData'

const signalBar: Record<string, string> = {
  Strong: 'bg-emerald',
  Improving: 'bg-teal',
  Watch: 'bg-gold',
  Weak: 'bg-coral',
}
const signalText: Record<string, string> = {
  Strong: 'text-emerald',
  Improving: 'text-teal',
  Watch: 'text-gold',
  Weak: 'text-coral',
}

export function PositioningScorecard({ rows }: { rows: ScoreRow[] }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[68px_1fr_auto] items-center gap-2.5">
          <span className="text-[12px] font-medium text-ink-primary">{r.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-ice">
            <div
              className={`h-full rounded-full ${signalBar[r.signal] ?? 'bg-muted-blue'}`}
              style={{ width: `${r.score}%` }}
            />
          </div>
          <span className={`w-[58px] text-right text-[11px] font-semibold ${signalText[r.signal] ?? 'text-navy-primary'}`}>
            #{r.rank}/{r.rankOf}
          </span>
        </div>
      ))}
    </div>
  )
}
