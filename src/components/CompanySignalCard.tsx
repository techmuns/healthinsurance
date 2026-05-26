import { SignalBadge } from './SignalBadge'
import { getCompanySignals } from '@/lib/review'
import type { QuarterlyReview } from '@/data/mockData'
import type { Insurer } from '@/data/types'

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">{label}</span>
      <SignalBadge label={value} size="sm" />
    </div>
  )
}

/** B. Signal card for the selected company — overall + growth/profit/valuation. */
export function CompanySignalCard({
  company,
  list,
  review,
}: {
  company: Insurer
  list: Insurer[]
  review?: QuarterlyReview
}) {
  const s = getCompanySignals(company, list)
  return (
    <div className="card-surface flex h-full flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="font-display text-[15px] text-navy-deep">{company.shortName} signal</p>
        <SignalBadge label={s.overall} size="sm" />
      </div>

      <div className="space-y-2 border-y border-soft-border py-3">
        <SignalRow label="Growth" value={s.growth} />
        <SignalRow label="Profitability" value={s.profitability} />
        <SignalRow label="Valuation" value={s.valuation} />
      </div>

      <p className="mt-3 text-[11.5px] leading-snug text-ink-secondary">
        <span className="font-semibold text-navy-deep">Peer rank:</span> {s.peerRankSummary}
      </p>

      {review && (
        <div className="mt-auto space-y-1.5 pt-3 text-[11.5px] leading-snug">
          <p className="text-ink-secondary">
            <span className="font-semibold text-coral">Top risk:</span> {review.topRisk}
          </p>
          <p className="text-ink-secondary">
            <span className="font-semibold text-navy-primary">Next trigger:</span> {review.nextTrigger}
          </p>
        </div>
      )}
    </div>
  )
}
