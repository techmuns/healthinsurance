import { ArrowDownRight, ArrowUpRight, Eye, Minus, TrendingUp } from 'lucide-react'
import { deriveWhatChanged, rankWithin, scorecardMetrics } from '@/lib/review'
import { DATA_FRESHNESS } from '@/data/mockData'
import type { Insurer } from '@/data/types'
import type { ReactNode } from 'react'

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

/**
 * Compact, visual "What Changed" strip — minimal text, delta-driven.
 *
 * Every figure here is derived from the real `insurers` model (peer ranks +
 * reported metrics), never hand-written. The strip shows, for the latest
 * reported fiscal year, the company's strongest and weakest metrics versus its
 * peer set, plus its live share move and the metric to watch next.
 */
export function WhatChangedStrip({
  company,
  list,
}: {
  company: Insurer
  list: Insurer[]
}) {
  const wc = deriveWhatChanged(company, list)
  // Honest basis label: latest fiscal year actually covered by the snapshot.
  const fyTokens = DATA_FRESHNESS.coverage.match(/FY\d{2,4}/g)
  const latestFy = fyTokens ? fyTokens[fyTokens.length - 1] : DATA_FRESHNESS.coverage

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
          <span className="text-[11px] text-ink-secondary">{latestFy} · strongest & weakest vs peer set</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ChangeCard
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          tone="pos"
          label="Biggest Positive"
          metric={wc.biggestPositive.label}
          value={wc.biggestPositive.value}
          note={wc.biggestPositive.note}
        />
        <ChangeCard
          icon={<ArrowDownRight className="h-3.5 w-3.5" />}
          tone="neg"
          label="Biggest Negative"
          metric={wc.biggestNegative.label}
          value={wc.biggestNegative.value}
          note={wc.biggestNegative.note}
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
          metric={wc.nextWatch.label}
          note={wc.nextWatch.note}
        />
      </div>
    </section>
  )
}
