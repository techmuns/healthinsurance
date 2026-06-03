import type { ReactNode } from 'react'
import { ExternalLink, Minus } from 'lucide-react'
import { valSrc } from '@/data/valuationSources'
import type { Rating, ValConfidence } from '@/data/valuationData'

// Shared valuation/street primitives — colours, formatters and the small pills
// reused by both the Valuation page (Company Performance) and the Street View
// page. Extracted verbatim so neither chart is redesigned; only relocated.

// ── Colour psychology (kept subtle, light, source-backed) ────────────────────
export const NAVY = '#27457E'
export const TEAL = '#168E8E'
export const GREEN = '#3F9C6B'
export const GOLD = '#B68B3A'
export const PEER = '#A6B2C6'
export const CORAL = '#C2766B'

export const clamp = (v: number, lo = 16, hi = 96) => Math.max(lo, Math.min(hi, v))
export const fmtCr = (v: number | null) => (v == null ? 'n/a' : v >= 1000 ? `₹${(v / 1000).toFixed(1)}k Cr` : `₹${v.toFixed(0)} Cr`)
export const px = (v: number | null) => (v == null ? 'Pending' : `₹${Number.isInteger(v) ? v : v.toFixed(1)}`)
export const xMult = (v: number | null, d = 2) => (v == null ? 'n/a' : `${v.toFixed(d)}x`)
export const upPct = (v: number | null) => (v == null ? 'Pending' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)

export const ratingTone: Record<Rating, { fg: string; bg: string }> = {
  Buy: { fg: '#0E6F6D', bg: '#E2F4F1' },
  Hold: { fg: '#9A6B12', bg: '#FBF3E2' },
  Sell: { fg: '#B0564A', bg: '#F8ECEC' },
}

const VAL_TONE: Record<ValConfidence, { label: string; fg: string; bg: string; dot: string }> = {
  verified: { label: 'Verified', fg: '#0E6F6D', bg: '#E2F4F1', dot: TEAL },
  secondary: { label: 'Secondary', fg: '#9A6B12', bg: '#FBF3E2', dot: GOLD },
  pending: { label: 'Source pending', fg: '#64748B', bg: '#EEF1F6', dot: '#94A3B8' },
}

/** Verified / Secondary / Source-pending validation status pill. */
export function ValPill({ c, className = '' }: { c: ValConfidence; className?: string }) {
  const t = VAL_TONE[c]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${className}`} style={{ color: t.fg, background: t.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
      {t.label}
    </span>
  )
}

/** Small "Open source" button — one click opens the exact report / filing. */
export function OpenSource({ id }: { id: string }) {
  const s = valSrc(id)
  if (!s || !s.source_url) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium italic text-ink-secondary/70">Source pending</span>
  }
  return (
    <a
      href={s.source_url}
      target="_blank"
      rel="noreferrer"
      title={`${s.report_title} — opens in a new tab`}
      className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-navy-primary transition-all hover:border-muted-blue hover:bg-white hover:text-navy-deep hover:shadow-soft"
    >
      Open source
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  )
}

export function Eyebrow({ label, title, note, right }: { label: string; title: string; note?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-1 h-7 w-1 rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">{label}</p>
          <h2 className="mt-0.5 font-display text-[20px] leading-tight text-navy-deep">{title}</h2>
          {note && <p className="mt-0.5 text-[11.5px] text-ink-secondary">{note}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

/** Analyst target-range strip — where the current price sits Low → Cons → High. */
export function LensRange({ price, target, lo, hi, analysts }: { price: number; target: number | null; lo: number | null; hi: number | null; analysts: number }) {
  if (lo == null || hi == null || hi <= lo) return <p className="mt-3 text-[10px] text-ink-secondary">Target range pending.</p>
  const pct = (v: number) => Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100))
  const near = Math.abs(price - (target ?? price)) / (target ?? price) < 0.04
  const priceTone = near ? GOLD : target != null && price < target ? TEAL : CORAL
  return (
    <div className="mt-3">
      <p className="mb-1 text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">Analyst target range · {analysts} analysts</p>
      <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#F8ECEC,#FBF3E2,#E6F4F1)' }}>
        {target != null && <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-navy-primary/45" style={{ left: `${pct(target)}%` }} />}
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${pct(price)}%`, background: priceTone }} />
      </div>
      <div className="mt-1 flex justify-between text-[8.5px] text-ink-secondary">
        <span>Low {px(lo)}</span>
        <span className="font-semibold text-navy-deep/70">Cons. {px(target)}</span>
        <span>High {px(hi)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[8.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: priceTone }} />Price</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-navy-primary/45" />Consensus</span>
        <span className="inline-flex items-center gap-1"><Minus className="h-2.5 w-2.5" /> {near ? 'near fair value' : target != null && price < target ? 'below target' : 'above target'}</span>
      </div>
    </div>
  )
}
