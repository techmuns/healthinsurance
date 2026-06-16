import { useState } from 'react'
import { SignalBadge } from './SignalBadge'
import { SegmentedControl } from './SegmentedControl'
import type { PromiseCategory, PromiseItem } from '@/lib/promiseTracker'

const categories: ('All' | PromiseCategory)[] = [
  'All',
  'Growth',
  'Profitability',
  'Distribution',
  'Capital',
  'Valuation',
  'Regulation',
]

function SummaryChip({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-soft-border bg-card px-3 py-1.5">
      <span className="font-display text-lg leading-none text-navy-deep">{count}</span>
      <span className={`text-[11px] font-semibold ${tone}`}>{label}</span>
    </div>
  )
}

/** "What did management promise, and what actually happened?" */
export function PromiseTracker({ items, companyName }: { items: PromiseItem[]; companyName: string }) {
  const [category, setCategory] = useState<'All' | PromiseCategory>('All')

  if (items.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-[#EFE2C3] bg-gold-soft/45 px-4 py-10 text-center text-sm text-ink-secondary">
        Promise tracking for {companyName} is not connected yet — source mapped, ingestion not complete.
      </div>
    )
  }

  const delivered = items.filter((p) => p.status === 'Delivered').length
  const onTrack = items.filter((p) => p.status === 'On Track').length
  const attention = items.filter((p) => p.status === 'Delayed' || p.status === 'Missed').length
  const pending =
    items.find((p) => p.status === 'Missed') ??
    items.find((p) => p.status === 'Delayed') ??
    items.find((p) => p.status === 'On Track') ??
    items.find((p) => p.status === 'Not Measurable')

  const filtered = category === 'All' ? items : items.filter((p) => p.category === category)
  const actualFy = items.find((p) => p.actualFy)?.actualFy ?? null

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2">
        <SummaryChip label="Delivered" count={delivered} tone="text-emerald" />
        <SummaryChip label="On track" count={onTrack} tone="text-navy-primary" />
        <SummaryChip label="Delayed / missed" count={attention} tone="text-coral" />
        {pending && (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#F0E1BE] bg-gold-soft px-3 py-1.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gold">Most important pending</span>
            <span className="truncate text-[12px] font-medium text-navy-deep">{pending.promise}</span>
            <SignalBadge label={pending.status} size="sm" />
          </div>
        )}
      </div>

      <SegmentedControl<'All' | PromiseCategory> label="Filter" options={categories} value={category} onChange={setCategory} size="sm" />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl2 border border-soft-border">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-ice text-[10.5px] uppercase tracking-wide text-ink-secondary">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Promise</th>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Metric</th>
              <th className="px-3 py-2.5 font-semibold">Target</th>
              <th className="px-3 py-2.5 font-semibold">Current</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={`${p.metric}-${i}`} className={i % 2 ? 'bg-ice/40' : ''}>
                <td className="px-3 py-2.5 font-medium text-ink-primary">
                  {p.promise}
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-secondary">{p.category}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-ink-secondary">{p.date}</td>
                <td className="px-3 py-2.5 text-ink-secondary">{p.metric}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink-secondary">{p.target}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-navy-deep">{p.current}</td>
                <td className="px-3 py-2.5">
                  <SignalBadge label={p.status} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-[11px]">
                  {p.sourceUrl ? (
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-navy-primary hover:underline">{p.source}</a>
                  ) : (
                    <span className="text-ink-secondary">{p.source}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Source-backed: actuals read live from the audited annual snapshot. */}
      <p className="text-[10.5px] leading-snug text-ink-secondary">
        <span className="font-semibold text-navy-deep">Current</span> = {companyName}&apos;s latest audited full-year figure{actualFy ? ` (${actualFy})` : ''}, read live from the
        annual disclosures and advancing on its own. Promises, targets and dates are management&apos;s own stated guidance — each links its source.
      </p>
    </div>
  )
}
