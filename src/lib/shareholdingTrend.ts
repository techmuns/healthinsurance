// ---------------------------------------------------------------------------
//  Shareholding-pattern trend — how each holder's stake has moved across the
//  quarterly exchange filings. Reads the per-holder shareholding snapshot (all
//  periods it carries) and returns each holder's series + period-on-period
//  change. Real, source-backed only: a period exists here only if it was filed
//  and ingested — with one quarter on record the trend is honest about it.
//
//  Bulk/block deals are NOT the source: a "sharp move" is flagged purely from
//  the size of the filed %-point change, as a supporting annotation.
// ---------------------------------------------------------------------------

import shareholdingSnapshot from '@/data/snapshots/shareholding-pattern-snapshot.json'

interface RawRow {
  company_id: string
  holder: string
  period: string
  filing_period?: string
  shares: number | null
  pct: number | null
}
const ROWS = (shareholdingSnapshot as { data?: RawRow[] }).data ?? []

// ── Holder-name normalization ────────────────────────────────────────────────
// Same holder filed under slightly different names across quarters should stay
// one row. We normalize to a key (lower-cased, common suffixes/abbreviations
// folded) and keep the fullest display name seen.
const ABBR: [RegExp, string][] = [
  [/\bmf\b/g, 'mutual fund'],
  [/\bpe\b/g, 'private equity'],
  [/\bcos?\b/g, 'companies'],
  [/\bhold(?:ing)?s?\b/g, 'holdings'],
]
export function holderKey(raw: string): string {
  let s = raw.toLowerCase().replace(/[.,]/g, ' ')
  for (const [re, to] of ABBR) s = s.replace(re, to)
  s = s.replace(/\b(ltd|limited|llp|pvt|private|the|and|&)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return s
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function periodLabel(period: string, filingPeriod?: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(period)
  const date = m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : period
  const fp = filingPeriod?.replace(/^Q(\d)FY(\d{2})$/, 'Q$1 FY$2')
  return fp ? `${fp} · ${date}` : date
}
const shortLabel = (period: string, filingPeriod?: string): string => {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(period)
  if (filingPeriod) return filingPeriod.replace(/^Q(\d)FY(\d{2})$/, "Q$1 '$2")
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}` : period
}

// A move of at least this many %-points period-on-period is "sharp" → annotated.
const SHARP_PP = 1.5

export interface HolderPoint { period: string; filingPeriod: string; pct: number | null; shares: number | null }
export interface HolderSeries {
  name: string
  points: HolderPoint[] // ascending by period, one per period in the window (null where not filed)
  latest: HolderPoint | null
  previous: HolderPoint | null
  deltaPct: number | null
  deltaShares: number | null
  sharp: boolean
}
export interface PeriodMeta { period: string; filingPeriod: string; label: string; short: string }
export interface ShareholdingTrend {
  companyId: string
  periods: PeriodMeta[] // ascending
  holders: HolderSeries[] // ordered by latest holding, descending
  totalPeriods: number // periods available before any window trim
}

/**
 * Build the per-holder trend for a company. `window` keeps only the latest N
 * periods ("last 4 quarters"); omit for the full history ("since listing").
 */
export function getShareholdingTrend(companyId: string, window?: number): ShareholdingTrend {
  const rows = ROWS.filter((r) => r.company_id === companyId)
  const allPeriods = [...new Set(rows.map((r) => r.period))].sort()
  const totalPeriods = allPeriods.length
  const periodsAsc = window && window > 0 ? allPeriods.slice(-window) : allPeriods
  const filingOf = new Map(rows.map((r) => [r.period, r.filing_period ?? '']))

  const periods: PeriodMeta[] = periodsAsc.map((p) => ({
    period: p,
    filingPeriod: filingOf.get(p) ?? '',
    label: periodLabel(p, filingOf.get(p)),
    short: shortLabel(p, filingOf.get(p)),
  }))

  // Group rows by normalized holder; keep the fullest display name.
  const byHolder = new Map<string, { name: string; rows: RawRow[] }>()
  for (const r of rows) {
    const key = holderKey(r.holder)
    const g = byHolder.get(key)
    if (!g) byHolder.set(key, { name: r.holder, rows: [r] })
    else { g.rows.push(r); if (r.holder.length > g.name.length) g.name = r.holder }
  }

  const holders: HolderSeries[] = [...byHolder.values()].map(({ name, rows: hRows }) => {
    const byPeriod = new Map(hRows.map((r) => [r.period, r]))
    const points: HolderPoint[] = periodsAsc.map((p) => {
      const r = byPeriod.get(p)
      return { period: p, filingPeriod: filingOf.get(p) ?? '', pct: r?.pct ?? null, shares: r?.shares ?? null }
    })
    const filled = points.filter((pt) => pt.pct != null)
    const latest = filled.length ? filled[filled.length - 1] : null
    const previous = filled.length > 1 ? filled[filled.length - 2] : null
    const deltaPct = latest?.pct != null && previous?.pct != null ? latest.pct - previous.pct : null
    const deltaShares = latest?.shares != null && previous?.shares != null ? latest.shares - previous.shares : null
    return { name, points, latest, previous, deltaPct, deltaShares, sharp: deltaPct != null && Math.abs(deltaPct) >= SHARP_PP }
  })

  // Order by latest holding (largest first); holders absent in the latest period
  // sink to the bottom but stay on record.
  holders.sort((a, b) => (b.latest?.pct ?? -1) - (a.latest?.pct ?? -1))

  return { companyId, periods, holders, totalPeriods }
}
