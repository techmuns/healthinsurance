import type { ReactNode } from 'react'
import { SignalBadge } from './SignalBadge'
import { SourceTag, type SourceLabel, type SourceConfidence, type SourceProvenance } from './SourceTag'

export type VerdictTone = 'teal' | 'positive' | 'navy' | 'warning' | 'negative'

const accent: Record<VerdictTone, string> = {
  teal: '#168E8E',
  positive: '#2F855A',
  navy: '#27457E',
  warning: '#B7791F',
  negative: '#B94A48',
}

export interface VerdictStripProps {
  /** Gold eyebrow, e.g. "Industry Pulse" or "Growth Verdict". */
  eyebrow: string
  /** The answer-first headline word/phrase. */
  verdict: string
  tone: VerdictTone
  /** Optional status pill next to the verdict. */
  badge?: string
  /** One-line plain-English support for the verdict. */
  summary: ReactNode
  /** Optional inline headline stats on the right. */
  stats?: { label: string; value: string }[]
  /** Source tag rendered at the bottom-right corner of the strip. */
  source?: SourceLabel | string
  sourcePeriod?: string
  sourceConfidence?: SourceConfidence
  sourceProvenance?: SourceProvenance
}

/**
 * Answer-first page banner — the top of every section's story rhythm. States
 * the verdict, a one-line why, and a couple of headline numbers.
 */
export function VerdictStrip({
  eyebrow,
  verdict,
  tone,
  badge,
  summary,
  stats,
  source,
  sourcePeriod,
  sourceConfidence,
  sourceProvenance,
}: VerdictStripProps) {
  return (
    <section className="card-surface relative overflow-hidden p-4 sm:p-5">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent[tone] }} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pl-2.5">
        <div className="min-w-[190px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">{eyebrow}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-[21px] leading-tight text-navy-deep">{verdict}</h2>
            {badge && <SignalBadge label={badge} tone={tone} size="sm" />}
          </div>
        </div>
        <p className="min-w-[220px] flex-1 text-[13px] leading-relaxed text-ink-secondary">{summary}</p>
        {stats && stats.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {stats.map((s) => (
              <div key={s.label} className="shrink-0">
                <p className="font-display text-[18px] leading-none text-navy-deep">{s.value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-secondary">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {source && (
        <div className="mt-2 flex justify-end pl-2.5">
          <SourceTag
            source={source}
            period={sourcePeriod}
            confidence={sourceConfidence}
            provenance={sourceProvenance}
          />
        </div>
      )}
    </section>
  )
}
