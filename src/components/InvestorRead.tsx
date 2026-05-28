import { SectionHeading } from './SectionHeading'
import { InsightBox, type InsightLine } from './InsightBox'
import { SourceTag, type SourceLabel, type SourceConfidence, type SourceProvenance } from './SourceTag'

export interface InvestorReadProps {
  /** Signal word (Strong / Improving / Watch / Weak / Fair…) — drives the pill. */
  signal: string
  /** Structured lines: Why / Implication / Watch / Next trigger. */
  lines: InsightLine[]
  /** Section title; defaults to "Investor Read". */
  title?: string
  /** Source tag rendered at the bottom-right of the read block. */
  source?: SourceLabel | string
  sourcePeriod?: string
  sourceConfidence?: SourceConfidence
  sourceProvenance?: SourceProvenance
}

/**
 * Closing "So What?" box — the final step of every section's story rhythm.
 * Reuses the navy InsightBox panel so the read lands as the page's verdict.
 */
export function InvestorRead({
  signal,
  lines,
  title = 'Investor Read',
  source,
  sourcePeriod,
  sourceConfidence,
  sourceProvenance,
}: InvestorReadProps) {
  return (
    <section>
      <SectionHeading eyebrow="So What?" title={title} />
      <InsightBox variant="panel" title="Investor read" signal={signal} lines={lines} />
      {source && (
        <div className="mt-2 flex justify-end">
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
