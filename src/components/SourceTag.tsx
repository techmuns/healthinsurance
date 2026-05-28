import { useState } from 'react'
import type { CSSProperties } from 'react'

// ---------------------------------------------------------------------------
//  SourceTag — small, muted source indicator placed at the corner of every
//  card that renders data. Quietly builds trust without dominating the UI.
//
//  Behaviour:
//    • Renders inline: a coloured dot + "Source · <name> · <period>".
//    • On hover, a small popover surfaces the full provenance: source name,
//      URL, fetched date, confidence.
//    • Dot colour signals confidence (teal = high, gold = medium, grey =
//      pending / mock / unavailable).
//
//  Use one of the well-known source labels where possible so the chip
//  taxonomy stays consistent across the dashboard.
// ---------------------------------------------------------------------------

export type SourceLabel =
  // Direct from official portals / filings
  | 'IRDAI'
  | 'IRDAI public disclosures'
  | 'Company filing'
  | 'Exchange'
  | 'GI Council'
  // Combinations
  | 'IRDAI + Company filing'
  | 'Exchange + Company filing'
  | 'Company filing + IRDAI disclosures'
  | 'Mixed: IRDAI + Company filing'
  // Re-aggregated from IRDAI by a credible third party (CareRatings,
  // Cafemutual, etc.) — used when we haven't pulled from IRDAI directly
  // but the upstream source clearly cites IRDAI's flash / handbook tables.
  | 'Derived from IRDAI'
  | 'Derived'
  // States
  | 'Official snapshot'
  | 'Mock dataset'
  | 'Unavailable'

export type SourceConfidence = 'high' | 'medium' | 'low' | 'pending'

export interface SourceProvenance {
  source_name?: string
  source_url?: string
  fetched_at?: string | null
}

export interface SourceTagProps {
  source: SourceLabel | string
  /** Optional period suffix, e.g. "FY26" or "Q4 FY25". */
  period?: string
  confidence?: SourceConfidence
  provenance?: SourceProvenance
  /** Popover anchor — defaults to right; switch to "left" for left-aligned tags. */
  align?: 'left' | 'right'
  className?: string
}

const DOT_COLOUR: Record<SourceConfidence, string> = {
  high: '#168E8E',
  medium: '#B68B3A',
  low: '#94A3B8',
  pending: '#94A3B8',
}

function effectiveConfidence(source: string, confidence: SourceConfidence): SourceConfidence {
  if (source === 'Mock dataset' || source === 'Unavailable') return 'pending'
  return confidence
}

/**
 * Compact source indicator. Defaults to a low-key inline pill.
 */
export function SourceTag({
  source,
  period,
  confidence = 'high',
  provenance,
  align = 'right',
  className = '',
}: SourceTagProps) {
  const [hover, setHover] = useState(false)
  const conf = effectiveConfidence(source, confidence)
  const dot = DOT_COLOUR[conf]
  const hasPopover = !!(provenance && (provenance.source_name || provenance.source_url))
  const popoverPos: CSSProperties =
    align === 'right' ? { right: 0 } : { left: 0 }

  return (
    <span
      className={`relative inline-flex items-center gap-1 text-[10px] leading-none text-ink-secondary ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={hasPopover ? 0 : -1}
      role="note"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      <span className="font-semibold uppercase tracking-[0.08em] text-ink-secondary/80">Source</span>
      <span aria-hidden>·</span>
      <span>{source}</span>
      {period && (
        <>
          <span aria-hidden>·</span>
          <span>{period}</span>
        </>
      )}
      {hover && hasPopover && (
        <span
          className="absolute bottom-full z-30 mb-1 w-72 rounded-xl border border-soft-border bg-card p-3 text-left shadow-card"
          style={popoverPos}
        >
          {provenance!.source_name && (
            <span className="block text-[11px] font-semibold leading-snug text-navy-deep">
              {provenance!.source_name}
            </span>
          )}
          {provenance!.source_url && (
            <a
              href={provenance!.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 block break-all text-[10px] text-muted-blue hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {provenance!.source_url}
            </a>
          )}
          <span className="mt-2 flex items-center gap-2 text-[10px] text-ink-secondary">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
              {confLabel(conf)}
            </span>
            {provenance!.fetched_at && (
              <>
                <span aria-hidden>·</span>
                <span>Fetched {provenance!.fetched_at.slice(0, 10)}</span>
              </>
            )}
          </span>
        </span>
      )}
    </span>
  )
}

function confLabel(c: SourceConfidence): string {
  if (c === 'high') return 'Verified · high confidence'
  if (c === 'medium') return 'Press release / seeded · medium'
  if (c === 'low') return 'Low confidence'
  return 'UI mock · official snapshot pending'
}
