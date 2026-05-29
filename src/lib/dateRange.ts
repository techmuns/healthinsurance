// ---------------------------------------------------------------------------
// Dashboard-wide Data Range.
//
// A single, period-agnostic range model shared by every chart, card and table.
// The range is stored as a pair of *absolute fiscal-month indices* so it stays
// valid when the user flips Period (Annual / Quarterly / Monthly) — the control
// simply edits it at a coarser or finer granularity.
//
// Fiscal convention (Indian insurers): FYxx spans Apr 20(xx-1) → Mar 20xx.
//   • idx 0  = Apr of FY_MIN  (the earliest month the dashboard understands)
//   • each fiscal year = 12 months in fiscal order Apr … Mar
//
// This module is intentionally React-free (pure functions + constants) so it
// can be imported by both state and presentational layers without cycles.
// ---------------------------------------------------------------------------

import type { TimePeriod } from '@/data/types'

/** Months in fiscal order — Apr is month-offset 0, Mar is 11. */
export const FISCAL_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'] as const

// Inclusive fiscal-year window the dashboard exposes in the selector. The mock
// + snapshot data lives in FY21–FY26, so the selectable universe matches that.
export const FY_MIN = 21
export const FY_MAX = 26

/** Largest valid month index (FY_MIN..FY_MAX, inclusive). */
export const IDX_MAX = (FY_MAX - FY_MIN + 1) * 12 - 1

/** A selected range, inclusive, expressed as absolute fiscal-month indices. */
export interface DateRange {
  from: number
  to: number
}

// --- index ⇄ period conversions ---------------------------------------------

export const fyStartIdx = (fy: number) => (fy - FY_MIN) * 12
export const fyEndIdx = (fy: number) => (fy - FY_MIN) * 12 + 11
export const quarterStartIdx = (fy: number, q: number) => (fy - FY_MIN) * 12 + (q - 1) * 3
export const quarterEndIdx = (fy: number, q: number) => quarterStartIdx(fy, q) + 2
export const monthIdx = (fy: number, monthOffset: number) => (fy - FY_MIN) * 12 + monthOffset

export const fyOfIdx = (idx: number) => FY_MIN + Math.floor(idx / 12)
export const monthOffsetOfIdx = (idx: number) => ((idx % 12) + 12) % 12
export const quarterOfIdx = (idx: number) => Math.floor(monthOffsetOfIdx(idx) / 3) + 1

/** Calendar year for a fiscal month — Apr–Dec sit in (FY-1), Jan–Mar in FY. */
export function calendarYearOfIdx(idx: number): number {
  const fy = fyOfIdx(idx)
  return monthOffsetOfIdx(idx) <= 8 ? 2000 + fy - 1 : 2000 + fy
}

// --- label helpers -----------------------------------------------------------

export const fyLabel = (fy: number) => `FY${fy}`
export const quarterLabelOf = (idx: number) => `Q${quarterOfIdx(idx)} FY${fyOfIdx(idx)}`
export const monthLabelOf = (idx: number) => `${FISCAL_MONTHS[monthOffsetOfIdx(idx)]} ${calendarYearOfIdx(idx)}`

const FY_RE = /^FY(\d{2})$/
const Q_RE = /^Q([1-4])\s+FY(\d{2})$/
const M_RE = /^([A-Z][a-z]{2})\s+(\d{4})$/

/** True when a series label looks like a time period we can clip on. */
export function isPeriodLabel(label: string): boolean {
  return FY_RE.test(label) || Q_RE.test(label) || M_RE.test(label)
}

/** The [start, end] month-index span a label covers, or null if not a period. */
function labelSpan(label: string): [number, number] | null {
  let m = FY_RE.exec(label)
  if (m) {
    const fy = +m[1]
    return [fyStartIdx(fy), fyEndIdx(fy)]
  }
  m = Q_RE.exec(label)
  if (m) {
    const q = +m[1]
    const fy = +m[2]
    return [quarterStartIdx(fy, q), quarterEndIdx(fy, q)]
  }
  m = M_RE.exec(label)
  if (m) {
    const mo = (FISCAL_MONTHS as readonly string[]).indexOf(m[1])
    if (mo < 0) return null
    const cal = +m[2]
    const fy = mo <= 8 ? cal - 2000 + 1 : cal - 2000
    const idx = monthIdx(fy, mo)
    return [idx, idx]
  }
  return null
}

/**
 * Whether a period label overlaps the selected range. Non-period labels (e.g.
 * category names on a ranking chart) always pass through unfiltered, so this is
 * safe to apply blindly to any series.
 */
export function labelInRange(label: string, range: DateRange): boolean {
  const span = labelSpan(label)
  if (!span) return true
  return span[0] <= range.to && span[1] >= range.from
}

// --- formatting --------------------------------------------------------------

/** Compact "Showing …" label honouring the active period's vocabulary. */
export function formatRange(range: DateRange, period: TimePeriod, sep = '–'): string {
  if (period === 'Quarterly') return `${quarterLabelOf(range.from)}${sep}${quarterLabelOf(range.to)}`
  if (period === 'Monthly') return `${monthLabelOf(range.from)}${sep}${monthLabelOf(range.to)}`
  return `${fyLabel(fyOfIdx(range.from))}${sep}${fyLabel(fyOfIdx(range.to))}`
}

// --- selector option models --------------------------------------------------

export interface RangeOption {
  /** Stable <select> value. */
  value: string
  label: string
  /** Index this option maps to when chosen as the FROM endpoint. */
  fromIdx: number
  /** Index this option maps to when chosen as the TO endpoint. */
  toIdx: number
}

/** Build the option list for the active period (used by both From and To). */
export function rangeOptions(period: TimePeriod): RangeOption[] {
  const out: RangeOption[] = []
  if (period === 'Annual') {
    for (let fy = FY_MIN; fy <= FY_MAX; fy++) {
      out.push({ value: `fy-${fy}`, label: fyLabel(fy), fromIdx: fyStartIdx(fy), toIdx: fyEndIdx(fy) })
    }
    return out
  }
  if (period === 'Quarterly') {
    for (let fy = FY_MIN; fy <= FY_MAX; fy++) {
      for (let q = 1; q <= 4; q++) {
        out.push({ value: `q-${fy}-${q}`, label: `Q${q} FY${fy}`, fromIdx: quarterStartIdx(fy, q), toIdx: quarterEndIdx(fy, q) })
      }
    }
    return out
  }
  // Monthly
  for (let idx = 0; idx <= IDX_MAX; idx++) {
    out.push({ value: `m-${idx}`, label: monthLabelOf(idx), fromIdx: idx, toIdx: idx })
  }
  return out
}

/** The option that currently represents `idx` as the FROM endpoint. */
export function fromOptionValue(idx: number, period: TimePeriod): string {
  if (period === 'Annual') return `fy-${fyOfIdx(idx)}`
  if (period === 'Quarterly') return `q-${fyOfIdx(idx)}-${quarterOfIdx(idx)}`
  return `m-${idx}`
}

/** The option that currently represents `idx` as the TO endpoint. */
export function toOptionValue(idx: number, period: TimePeriod): string {
  return fromOptionValue(idx, period)
}

/** Default = the full annual span the data covers, so nothing is hidden until
 *  the user deliberately narrows the range. Derived from FY_MIN/FY25 rather
 *  than a hardcoded FY22–FY25 string. */
export const DEFAULT_RANGE: DateRange = { from: fyStartIdx(FY_MIN), to: fyEndIdx(25) }
