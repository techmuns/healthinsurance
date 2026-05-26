import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { QUARTER } from '@/data/mockData'
import type { QuarterlyReview } from '@/data/mockData'
import type { Insurer } from '@/data/types'

function Readout({ title, body, tone }: { title: string; body: string; tone: 'pos' | 'neg' | 'navy' }) {
  const accent = tone === 'pos' ? 'text-emerald' : tone === 'neg' ? 'text-coral' : 'text-navy-primary'
  return (
    <div className="rounded-lg border border-soft-border bg-card p-3">
      <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${accent}`}>{title}</p>
      <p className="mt-1 text-[12px] leading-snug text-ink-primary">{body}</p>
    </div>
  )
}

/** A + D. Quarterly change summary and the PE-style review readout. */
export function QuarterlyChangeCard({ company, review }: { company: Insurer; review?: QuarterlyReview }) {
  if (!review) {
    return (
      <div className="card-surface p-5">
        <p className="font-display text-[17px] text-navy-deep">Quarterly Review</p>
        <p className="mt-2 text-[12px] text-ink-secondary">
          Quarterly review data pending for {company.shortName} (mock dataset).
        </p>
      </div>
    )
  }

  return (
    <div className="card-surface card-interactive p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Quarterly Review</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-ice px-2.5 py-1 text-[11px] font-semibold text-navy-deep">
          {QUARTER.current}
          <span className="font-normal text-ink-secondary">vs {QUARTER.previous}</span>
        </span>
      </div>

      <h3 className="font-display text-[19px] leading-snug text-navy-deep sm:text-[21px]">
        What changed for {company.shortName} this quarter
      </h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">{review.whatChanged}</p>

      {/* Biggest positive / negative */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-[#CDE6D7] bg-[#EAF3EE] p-3">
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald">Biggest positive</p>
            <p className="text-[12px] font-semibold text-navy-deep">{review.biggestPositive.label}</p>
            <p className="text-[11px] leading-snug text-ink-secondary">{review.biggestPositive.detail}</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-[#EBCFCE] bg-[#F8ECEC] p-3">
          <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-coral">Biggest negative</p>
            <p className="text-[12px] font-semibold text-navy-deep">{review.biggestNegative.label}</p>
            <p className="text-[11px] leading-snug text-ink-secondary">{review.biggestNegative.detail}</p>
          </div>
        </div>
      </div>

      {/* D. Readout */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Readout title="What improved" body={review.whatImproved} tone="pos" />
        <Readout title="What worsened" body={review.whatWorsened} tone="neg" />
        <Readout title="What matters next" body={review.whatMattersNext} tone="navy" />
      </div>
    </div>
  )
}
