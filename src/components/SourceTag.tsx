import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ExternalLink, AlertTriangle, ShieldCheck } from 'lucide-react'
import { DataStatusPill, type DataStatus } from './DataStatusPill'
import { classifySource } from '@/lib/sourceHealth'

// ---------------------------------------------------------------------------
//  SourceTag — small, premium source indicator placed at the corner of every
//  card that renders data. Quietly builds trust without dominating the UI.
//
//  Behaviour:
//    • Renders as a compact pill: a confidence dot + "SOURCE · <name> · <period>".
//    • When a source URL exists the whole pill is a link — one click opens the
//      underlying PDF / filing in a new tab (no hover-then-click needed).
//    • On hover/focus a popover surfaces the full provenance: source name, URL,
//      confidence and fetched date.
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

/** Reporting cadence of the underlying source. */
export type SourceFrequency = 'Annual' | 'Quarterly' | 'Monthly' | 'Event-based' | 'Point-in-time'

export interface SourceProvenance {
  source_name?: string
  source_url?: string
  fetched_at?: string | null
}

export interface SourceTagProps {
  source: SourceLabel | string
  /** Optional period suffix, e.g. "FY26" or "Q4 FY25". */
  period?: string
  /** Reporting cadence — shown inline as a quiet chip when set. */
  frequency?: SourceFrequency
  /** Honest data state — shown as a small pill in the hover popover. */
  status?: DataStatus
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

function confLabel(c: SourceConfidence): string {
  if (c === 'high') return 'Verified · high confidence'
  if (c === 'medium') return 'Press release / seeded · medium'
  if (c === 'low') return 'Low confidence'
  return 'UI mock · official snapshot pending'
}

/** Friendly file hint so users know the link opens a document, not a page. */
function linkKind(url: string): string {
  return /\.pdf(\?|#|$)/i.test(url) ? 'Opens the source PDF in a new tab' : 'Opens the source in a new tab'
}

/**
 * Premium, directly-clickable source indicator. When a URL is present the whole
 * chip is an anchor; otherwise it is a quiet, non-interactive pill.
 */
export function SourceTag({
  source,
  period,
  frequency,
  status,
  confidence = 'high',
  provenance,
  align = 'right',
  className = '',
}: SourceTagProps) {
  const [hover, setHover] = useState(false)
  const conf = effectiveConfidence(source, confidence)
  // Source-link health — stabilises broken/session URLs (so the chip never opens
  // a dead page) and decides whether it is safely clickable at all.
  const health = classifySource(provenance?.source_url)
  const url = health.href
  // Drop the dot to a warning tone when the *link* is the problem, not the data.
  const dot = health.state === 'unavailable' ? '#C0533F' : health.state === 'unstable' ? '#B6892F' : DOT_COLOUR[conf]
  const hasPopover = !!(provenance && (provenance.source_name || provenance.source_url))
  const popoverPos: CSSProperties = align === 'right' ? { right: 0 } : { left: 0 }

  // Shared inner content — dot + SOURCE · name · period (+ link glyph when clickable).
  const inner = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      <span className="font-semibold uppercase tracking-[0.08em] text-ink-secondary/80 transition-colors group-hover:text-navy-primary/80">
        Source
      </span>
      <span aria-hidden className="text-ink-secondary/50">·</span>
      <span className="font-medium">{source}</span>
      {period && (
        <>
          <span aria-hidden className="text-ink-secondary/50">·</span>
          <span>{period}</span>
        </>
      )}
      {frequency && (
        <>
          <span aria-hidden className="text-ink-secondary/50">·</span>
          <span className="font-medium text-muted-blue/90">{frequency}</span>
        </>
      )}
      {url && health.state === 'fixed' && <ShieldCheck className="ml-0.5 h-3 w-3 shrink-0 text-teal" aria-label="stabilised source link" />}
      {url && health.state === 'unstable' && <AlertTriangle className="ml-0.5 h-3 w-3 shrink-0 text-[#B6892F]" aria-label="source link may need a manual check" />}
      {url && health.state !== 'fixed' && health.state !== 'unstable' && <ExternalLink className="ml-0.5 h-3 w-3 shrink-0 text-ink-secondary/55 transition-colors group-hover:text-muted-blue" aria-hidden />}
      {!url && health.state === 'unavailable' && <AlertTriangle className="ml-0.5 h-3 w-3 shrink-0 text-[#C0533F]" aria-label="source unavailable" />}
    </>
  )

  // The hover popover with full provenance. Plain text (no nested anchor) so it
  // is safe inside the clickable chip.
  const popover = hover && hasPopover && (
    <span
      className="absolute bottom-full z-30 mb-1.5 w-72 rounded-xl border border-soft-border bg-card p-3 text-left shadow-card"
      style={popoverPos}
    >
      {provenance!.source_name && (
        <span className="block text-[11px] font-semibold leading-snug text-navy-deep">{provenance!.source_name}</span>
      )}
      {url && (
        <span className="mt-1.5 block break-all text-[10px] leading-snug text-muted-blue">{url}</span>
      )}
      {/* Honest link-health note — only when the link isn't a clean verified one. */}
      {health.state !== 'verified' && (
        <span
          className={`mt-1.5 flex items-start gap-1 text-[10px] leading-snug ${
            health.state === 'unavailable' ? 'text-[#A8443B]' : health.state === 'unstable' ? 'text-[#8A6A2B]' : 'text-teal'
          }`}
        >
          {health.state === 'fixed' ? <ShieldCheck className="mt-px h-3 w-3 shrink-0" /> : <AlertTriangle className="mt-px h-3 w-3 shrink-0" />}
          <span>
            {health.hint}
            {(health.state === 'fixed' || health.state === 'unavailable') && health.original && (
              <span className="mt-0.5 block break-all text-ink-secondary/70">On record: {health.original}</span>
            )}
          </span>
        </span>
      )}
      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-secondary">
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
      {(status || frequency) && (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          {status && <DataStatusPill status={status} />}
          {frequency && <span className="text-[10px] font-medium text-ink-secondary">{frequency} cadence</span>}
        </span>
      )}
      {url && (
        <span className="mt-2 flex items-center gap-1 border-t border-soft-border pt-2 text-[9.5px] font-medium italic text-ink-secondary/80">
          <ExternalLink className="h-2.5 w-2.5" aria-hidden />
          {linkKind(url)}
        </span>
      )}
    </span>
  )

  const base =
    'group relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] leading-none text-ink-secondary transition-all duration-200'

  // Clickable variant — the entire chip opens the source document.
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={provenance?.source_name ? `${provenance.source_name} — ${health.hint}` : health.hint}
        className={`${base} border-soft-border bg-white/70 shadow-[0_1px_2px_rgba(23,43,77,0.04)] hover:border-muted-blue hover:bg-white hover:text-navy-deep hover:shadow-soft ${className}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        {inner}
        {popover}
      </a>
    )
  }

  // Non-clickable variant — quiet pill (no URL on record yet).
  return (
    <span
      className={`${base} cursor-default border-transparent ${hasPopover ? 'hover:border-soft-border hover:bg-white/60' : ''} ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={hasPopover ? 0 : -1}
      role="note"
    >
      {inner}
      {popover}
    </span>
  )
}
