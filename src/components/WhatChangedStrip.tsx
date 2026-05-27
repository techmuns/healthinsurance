import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Eye, Minus, TrendingUp } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { rankWithin, scorecardMetrics } from '@/lib/review'
import { QUARTER } from '@/data/mockData'
import type { QuarterlyReview } from '@/data/mockData'
import type { Insurer } from '@/data/types'
import type { ReactNode } from 'react'

type Period = 'Quarterly' | 'Monthly'

type Tone = 'pos' | 'neg' | 'watch' | 'navy'
const toneClass: Record<Tone, { card: string; icon: string }> = {
  pos: { card: 'border-[#CDE6D7] bg-[#EAF3EE]', icon: 'text-emerald' },
  neg: { card: 'border-[#EBCFCE] bg-[#F8ECEC]', icon: 'text-coral' },
  watch: { card: 'border-[#F0E1BE] bg-gold-soft', icon: 'text-gold' },
  navy: { card: 'border-[#D6E2FA] bg-soft-blue/50', icon: 'text-navy-primary' },
}

function ChangeCard({
  icon,
  tone,
  label,
  metric,
  value,
  note,
  chip,
}: {
  icon: ReactNode
  tone: Tone
  label: string
  metric: string
  value?: string
  note: string
  chip?: ReactNode
}) {
  const t = toneClass[tone]
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${t.card}`}>
      <div className="flex items-center gap-1.5">
        <span className={t.icon}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-secondary">{label}</span>
      </div>
      <p className="mt-1 text-[12px] font-semibold text-navy-deep">{metric}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        {value && <span className="text-[13px] font-semibold tabular-nums text-navy-deep">{value}</span>}
        {chip}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{note}</p>
    </div>
  )
}

/** C. Compact, visual "What Changed" strip — minimal text, delta-driven. */
export function WhatChangedStrip({
  company,
  list,
  review,
}: {
  company: Insurer
  list: Insurer[]
  review?: QuarterlyReview
}) {
  const [period, setPeriod] = useState<Period>('Quarterly')

  const periodLabel = period === 'Quarterly' ? `${QUARTER.current} vs ${QUARTER.previous}` : 'Mar FY25 vs Feb FY25'

  const growthCfg = scorecardMetrics.find((m) => m.key === 'growth')!
  const gr = rankWithin(growthCfg, company, list)
  const dir = company.marketShareChange > 0 ? 'up' : company.marketShareChange < 0 ? 'down' : 'flat'
  const shareNote = dir === 'up' ? 'Gaining share' : dir === 'down' ? 'Losing share' : 'Holding share'
  const shareChip = (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${
        dir === 'up' ? 'bg-[#E1F2F1] text-teal' : dir === 'down' ? 'bg-[#F8ECEC] text-coral' : 'bg-ice text-ink-secondary'
      }`}
    >
      {dir === 'up' ? <ArrowUpRight className="h-3 w-3" /> : dir === 'down' ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {company.marketShareChange > 0 ? '+' : ''}
      {company.marketShareChange} pp
    </span>
  )

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">What Changed</span>
          <span className="text-[11px] text-ink-secondary">{periodLabel}</span>
        </div>
        <SegmentedControl<Period> options={['Quarterly', 'Monthly'] as Period[]} value={period} onChange={setPeriod} size="sm" />
      </div>

      {period === 'Monthly' && (
        <p className="mb-2 inline-flex items-center rounded-full bg-gold-soft px-2 py-0.5 text-[10.5px] font-semibold text-gold ring-1 ring-[#F0E1BE]">
          Monthly data pending — showing latest quarterly read (mock)
        </p>
      )}

      {review ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ChangeCard
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            tone="pos"
            label="Biggest Positive"
            metric={review.biggestPositive.label}
            value={review.biggestPositive.value}
            note={review.biggestPositive.note}
          />
          <ChangeCard
            icon={<ArrowDownRight className="h-3.5 w-3.5" />}
            tone="neg"
            label="Biggest Negative"
            metric={review.biggestNegative.label}
            value={review.biggestNegative.value}
            note={review.biggestNegative.note}
          />
          <ChangeCard
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            tone="navy"
            label="Rank Move"
            metric="GWP Growth"
            value={gr ? `#${gr.rank}/${gr.of}` : 'n/a'}
            chip={shareChip}
            note={shareNote}
          />
          <ChangeCard
            icon={<Eye className="h-3.5 w-3.5" />}
            tone="watch"
            label="Next Trigger"
            metric={review.nextWatch.label}
            note={review.nextWatch.note}
          />
        </div>
      ) : (
        <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-6 text-center text-[12px] text-ink-secondary">
          Quarterly change data pending for {company.shortName} (mock dataset).
        </div>
      )}
    </section>
  )
}
