// Reusable market-trend dataset + metric registry powering the Market Trend
// Explorer. Every metric is normalised to the SAME shape — a flat list of
// { company, year, value, unit, source, metricType } points — so the UI is
// fully generic: it renders whatever years exist in the data (nothing is
// hardcoded to a span), and a metric with no points simply reports itself
// as unavailable instead of inventing values.
//
// Sources (two, joined honestly):
//  • FY22–FY24 — the Niva Bupa DRHP (Redseer Report) snapshot. Share figures
//    are reported (Exhibits 40 & 41); GDPI is reported (Exhibit 40).
//  • FY25 onward — computed on the SAME GDPI bases from the GI Council
//    Segment-wise Report's health-portfolio sheet (gic-health-portfolio.json,
//    refreshed by the every-3-days GIC sweep). This is the sheet Redseer built
//    its exhibits from — the FY24 five-SAHI retail base matches the DRHP to
//    the rupee (₹236.38 Bn) — so the series joins cleanly. New fiscal years
//    appear here automatically when the next March edition is ingested; no
//    code edit per year. Each point carries its own source label.

import snapshot from '@/data/snapshots/sahi-share-history.json'
import gicHealthPortfolio from '@/data/snapshots/gic-health-portfolio.json'

export interface CompanyMeta {
  id: string
  name: string
  color: string
}

// One colour per company, reused everywhere (bubble dot, line, table dot,
// sparkline). Matches the rest of the dashboard so a company never changes hue.
export const TREND_COMPANIES: CompanyMeta[] = [
  { id: 'star-health', name: 'Star Health', color: '#B68B3A' }, // muted gold
  { id: 'care-health', name: 'Care Health', color: '#168E8E' }, // teal
  { id: 'niva-bupa', name: 'Niva Bupa', color: '#27457E' }, // blue (focal)
  { id: 'aditya-birla', name: 'Aditya Birla', color: '#3D5F9F' }, // soft royal blue
  { id: 'manipalcigna', name: 'ManipalCigna', color: '#8C97A8' }, // slate grey
]
export const FOCAL_COMPANY_ID = 'niva-bupa'

export const COMPANY_BY_ID: Record<string, CompanyMeta> = Object.fromEntries(
  TREND_COMPANIES.map((c) => [c.id, c]),
)

export type MetricId = 'sahi_share' | 'retail_share' | 'overall_share' | 'gdpi' | 'premium_growth'

/** The one reusable shape every metric is flattened into. */
export interface TrendPoint {
  company: string // company id
  year: string
  value: number | null
  unit: string
  source: string
  metricType: MetricId
}

export interface SourceInfo {
  source_name: string
  source_url?: string
  fetched_at?: string
}

export interface MetricDef {
  id: MetricId
  chip: string
  title: string
  subtitle: string
  unit: string
  /** Display formatter for a single value. */
  format: (v: number) => string
  /** Formatter for the first→latest delta (unit-aware). */
  formatDelta: (d: number) => string
  basisLabel: string
  note: string
  source: SourceInfo
  available: boolean
  /** All company×year points — the reusable structure the UI consumes. */
  points: TrendPoint[]
}

// ── Raw snapshot rows ───────────────────────────────────────────────────────
interface RawRow {
  company_id: string
  short_name: string
  segment_share_pct: Record<string, number | null>
  retail_share_pct: Record<string, number | null>
  overall_share_pct: Record<string, number | null>
  retail_gdpi_inr_bn: Record<string, number | null>
  overall_gdpi_inr_bn: Record<string, number | null>
}

const ROWS = (snapshot.data as RawRow[]).filter((r) => COMPANY_BY_ID[r.company_id])
const SRC = snapshot._meta.source as { source_name: string; source_url: string; fetched_at: string }

/** Sort year labels by their numeric suffix (FY22 < FY23 < …) — never lexically. */
export function yearNum(y: string): number {
  const m = y.match(/\d+/g)
  return m ? Number(m[m.length - 1]) : 0
}
export function sortYears(years: Iterable<string>): string[] {
  return [...new Set(years)].sort((a, b) => yearNum(a) - yearNum(b))
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

// ── GI Council extension (years after the DRHP's last reported year) ────────

interface GicRow {
  fiscal_year: string
  entity: string
  carrier_group: string
  health_retail: number | null
  health_total: number | null
}

const GIC_ROWS = gicHealthPortfolio.data as GicRow[]
const GIC_META = (gicHealthPortfolio as { _meta?: { last_updated?: string } })._meta
const GIC_SOURCE_LABEL = 'GI Council Segment-wise Report · health portfolio (computed)'
const GIC_SOURCE_URL = 'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/'

const DRHP_YEARS = sortYears(ROWS.flatMap((r) => Object.keys(r.overall_gdpi_inr_bn)))
const LAST_DRHP_FY = DRHP_YEARS[DRHP_YEARS.length - 1] ?? 'FY24'

const FIVE = TREND_COMPANIES.map((c) => c.id)
const gicRow = (fy: string, entity: string) => GIC_ROWS.find((r) => r.fiscal_year === fy && r.entity === entity)
const gicIndustry = (fy: string) =>
  GIC_ROWS.find((r) => r.fiscal_year === fy && r.carrier_group === 'aggregate' && r.entity === 'INDUSTRY')

/** Fiscal years beyond the DRHP for which every base is sourced: all five
 *  majors' retail & total health premium, plus the printed industry totals.
 *  Sorted ascending — extends automatically as new editions ingest. */
const EXT_YEARS: string[] = sortYears(GIC_ROWS.map((r) => r.fiscal_year)).filter((fy) => {
  if (yearNum(fy) <= yearNum(LAST_DRHP_FY)) return false
  const ind = gicIndustry(fy)
  if (ind?.health_retail == null || ind.health_total == null) return false
  return FIVE.every((c) => {
    const r = gicRow(fy, c)
    return r?.health_retail != null && r.health_total != null
  })
})

// Per-field {company → {year → value}} maps for the extension years, computed
// on the DRHP's own bases (all premiums ₹ Cr in the sheet; GDPI shown in ₹ Bn):
//   segment share = retail ÷ five-major retail base (the DRHP segment base)
//   retail share  = retail ÷ industry retail health
//   overall share = total  ÷ industry health (incl. group & government)
type ExtField = Record<string, Record<string, number>>
const extSegment: ExtField = {}
const extRetail: ExtField = {}
const extOverall: ExtField = {}
const extGdpiBn: ExtField = {}
for (const fy of EXT_YEARS) {
  const ind = gicIndustry(fy)!
  const fiveBase = FIVE.reduce((s, c) => s + (gicRow(fy, c)?.health_retail ?? 0), 0)
  if (fiveBase <= 0) continue
  for (const c of FIVE) {
    const r = gicRow(fy, c)!
    ;(extSegment[c] ??= {})[fy] = round2((r.health_retail! / fiveBase) * 100)
    ;(extRetail[c] ??= {})[fy] = round2((r.health_retail! / ind.health_retail!) * 100)
    ;(extOverall[c] ??= {})[fy] = round2((r.health_total! / ind.health_total!) * 100)
    ;(extGdpiBn[c] ??= {})[fy] = round2(r.health_total! / 100) // ₹ Cr → ₹ Bn
  }
}

/** GIC overall-health GDPI (₹ Bn) for ALL sheet years — used as the prior-year
 *  base when deriving growth for a GIC-sourced year, so growth is never
 *  computed across the two sources' (slightly different) company totals. */
const gicOverallBn = (c: string, fy: string): number | null => {
  const v = gicRow(fy, c)?.health_total
  return v == null ? null : round2(v / 100)
}

export const TREND_YEARS: string[] = [...DRHP_YEARS, ...EXT_YEARS]
export const TREND_SPAN = {
  first: TREND_YEARS[0] ?? '—',
  last: TREND_YEARS[TREND_YEARS.length - 1] ?? '—',
}

/** Both sources, with their honest year ranges — for panel-level tags. */
export const TREND_SOURCES = {
  drhp: { ...SRC, span: `${DRHP_YEARS[0] ?? '—'}–${LAST_DRHP_FY}` },
  gic: {
    source_name: 'GI Council Segment-wise Report (health portfolio) — shares computed on the DRHP bases',
    source_url: GIC_SOURCE_URL,
    fetched_at: GIC_META?.last_updated ?? '',
    span: EXT_YEARS.length ? `${EXT_YEARS[0]}–${EXT_YEARS[EXT_YEARS.length - 1]}` : '',
  },
}

type ShareField = 'segment_share_pct' | 'retail_share_pct' | 'overall_share_pct' | 'overall_gdpi_inr_bn'
const EXT_BY_FIELD: Record<ShareField, ExtField> = {
  segment_share_pct: extSegment,
  retail_share_pct: extRetail,
  overall_share_pct: extOverall,
  overall_gdpi_inr_bn: extGdpiBn,
}

/** Flatten a per-company {year: value} field into the reusable point list —
 *  DRHP years from the snapshot, later years from the GI Council extension,
 *  each point labelled with its own source. */
function fieldPoints(field: ShareField, unit: string, metricType: MetricId, drhpSource: string): TrendPoint[] {
  const out: TrendPoint[] = []
  const ext = EXT_BY_FIELD[field]
  for (const r of ROWS) {
    for (const [year, value] of Object.entries(r[field])) {
      out.push({ company: r.company_id, year, value, unit, source: drhpSource, metricType })
    }
    for (const year of EXT_YEARS) {
      const value = ext[r.company_id]?.[year] ?? null
      out.push({ company: r.company_id, year, value, unit, source: GIC_SOURCE_LABEL, metricType })
    }
  }
  return out
}

/** Year-on-year % growth from the overall-health GDPI series. Priors come from
 *  the SAME source as the year being grown (DRHP years grow off DRHP, GIC years
 *  off the GIC sheet — which also carries the overlap years), so a ~0.4% basis
 *  difference between the two sources never leaks into a growth figure. The
 *  first available year has no prior period and is honestly left null. */
function growthPoints(source: string): TrendPoint[] {
  const out: TrendPoint[] = []
  for (const r of ROWS) {
    const drhpSeries = r.overall_gdpi_inr_bn
    const years = TREND_YEARS
    years.forEach((year, i) => {
      let value: number | null = null
      if (i > 0) {
        const prevYear = years[i - 1]
        const isExt = yearNum(year) > yearNum(LAST_DRHP_FY)
        const cur = isExt ? extGdpiBn[r.company_id]?.[year] ?? null : drhpSeries[year] ?? null
        const prev = isExt ? gicOverallBn(r.company_id, prevYear) : drhpSeries[prevYear] ?? null
        if (prev != null && cur != null && prev !== 0) value = round1(((cur - prev) / prev) * 100)
      }
      out.push({ company: r.company_id, year, value, unit: '%', source, metricType: 'premium_growth' })
    })
  }
  return out
}

const pct = (v: number) => `${v.toFixed(1)}%`
const pctDelta = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} pp`
const inr = (v: number) => `₹${v.toFixed(1)} Bn`
const inrDelta = (d: number) => `${d >= 0 ? '+' : '−'}₹${Math.abs(d).toFixed(1)} Bn`

const PROV = { source_url: SRC.source_url, fetched_at: GIC_META?.last_updated ?? SRC.fetched_at }
const DUAL_SUFFIX = ` ${LAST_DRHP_FY === TREND_SPAN.last ? '' : `· ${EXT_YEARS[0]}+ computed from the GI Council Segment-wise Report (health portfolio) on the same GDPI bases — the FY24 five-SAHI retail base matches the DRHP to the rupee.`}`

// ── Computed story notes (never go stale: derived from the latest year) ─────

interface MergedSeries {
  first: { year: string; value: number } | null
  last: { year: string; value: number } | null
}
function mergedSeries(field: ShareField, company: string): MergedSeries {
  const row = ROWS.find((r) => r.company_id === company)
  const vals: { year: string; value: number }[] = []
  for (const y of TREND_YEARS) {
    const isExt = yearNum(y) > yearNum(LAST_DRHP_FY)
    const v = isExt ? EXT_BY_FIELD[field][company]?.[y] ?? null : row?.[field][y] ?? null
    if (v != null) vals.push({ year: y, value: v })
  }
  return { first: vals[0] ?? null, last: vals[vals.length - 1] ?? null }
}
const nameOf = (id: string) => COMPANY_BY_ID[id]?.name ?? id

function noteSahiShare(): string {
  const stats = FIVE.map((c) => ({ c, s: mergedSeries('segment_share_pct', c) })).filter((x) => x.s.last)
  if (!stats.length) return ''
  const leader = [...stats].sort((a, b) => b.s.last!.value - a.s.last!.value)[0]
  const gainers = [...stats]
    .map((x) => ({ ...x, d: x.s.first && x.s.last ? x.s.last.value - x.s.first.value : 0 }))
    .sort((a, b) => b.d - a.d)
  const leaderCeding = (leader.s.first?.value ?? 0) > leader.s.last!.value
  const g = gainers.filter((x) => x.c !== leader.c && x.d > 0).slice(0, 2)
  const gTxt = g.map((x) => `${nameOf(x.c)} +${x.d.toFixed(1)} pp`).join(', ')
  return `${nameOf(leader.c)} leads the standalone pack at ${leader.s.last!.value.toFixed(1)}% (${leader.s.last!.year})${leaderCeding ? ' but is ceding share' : ''}; the gainers since ${TREND_SPAN.first}: ${gTxt}.`
}
function noteRetailShare(): string {
  const five = FIVE.map((c) => mergedSeries('retail_share_pct', c)).filter((s) => s.last)
  if (!five.length) return ''
  const fy = five[0].last!.year
  const sum = five.reduce((s, x) => s + x.last!.value, 0)
  const focal = mergedSeries('retail_share_pct', FOCAL_COMPANY_ID)
  const focalTxt =
    focal.first && focal.last
      ? ` ${nameOf(FOCAL_COMPANY_ID)} has climbed ${focal.first.value.toFixed(1)}% → ${focal.last.value.toFixed(1)}%.`
      : ''
  return `The five SAHIs hold ${sum.toFixed(0)}% of all-India retail health (${fy}).${focalTxt}`
}
function noteOverallShare(): string {
  const s = mergedSeries('overall_share_pct', FOCAL_COMPANY_ID)
  if (!s.first || !s.last) return ''
  return `On the all-in health market the public insurers still dominate; ${nameOf(FOCAL_COMPANY_ID)}'s slice has grown ${s.first.value.toFixed(1)}% → ${s.last.value.toFixed(1)}% (${s.first.year}→${s.last.year}).`
}
function noteGdpi(): string {
  const stats = FIVE.map((c) => ({ c, s: mergedSeries('overall_gdpi_inr_bn', c) })).filter((x) => x.s.last)
  if (!stats.length) return ''
  const leader = [...stats].sort((a, b) => b.s.last!.value - a.s.last!.value)[0]
  const focal = mergedSeries('overall_gdpi_inr_bn', FOCAL_COMPANY_ID)
  const focalTxt =
    focal.first && focal.last
      ? ` ${nameOf(FOCAL_COMPANY_ID)} has gone ₹${focal.first.value.toFixed(0)} → ₹${focal.last.value.toFixed(0)} Bn (${focal.first.year}→${focal.last.year}).`
      : ''
  return `Premium scale separates the field: ${nameOf(leader.c)} ~₹${leader.s.last!.value.toFixed(0)} Bn (${leader.s.last!.year}) vs the chasers.${focalTxt}`
}
function noteGrowth(points: TrendPoint[]): string {
  const lastYear = TREND_YEARS[TREND_YEARS.length - 1]
  const latest = points.filter((p) => p.year === lastYear && p.value != null)
  if (!latest.length) return `${TREND_SPAN.first} is n/a — the source gives no prior-year base.`
  const top = [...latest].sort((a, b) => b.value! - a.value!).slice(0, 2)
  const topTxt = top.map((p) => `${nameOf(p.company)} +${p.value!.toFixed(1)}%`).join(' and ')
  return `${topTxt} lead ${lastYear} growth. ${TREND_SPAN.first} is n/a — the source gives no prior-year base.`
}

function build(id: MetricId, def: Omit<MetricDef, 'points' | 'available'>, points: TrendPoint[]): MetricDef {
  return { ...def, id, points, available: points.some((p) => p.value != null) }
}

const GROWTH_POINTS = growthPoints('Derived · DRHP Exhibit 40 + GI Council health portfolio (same-source priors)')

export const METRICS: Record<MetricId, MetricDef> = {
  sahi_share: build(
    'sahi_share',
    {
      id: 'sahi_share',
      chip: 'SAHI Share',
      title: 'SAHI Segment Share',
      subtitle: 'Each standalone insurer’s slice of the standalone-health-insurer segment',
      unit: '%',
      format: pct,
      formatDelta: pctDelta,
      basisLabel: 'Share among the five SAHIs (% of their combined retail-health premiums)',
      note: noteSahiShare(),
      source: {
        source_name: `Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 41 (retail-health GDPI), ${TREND_SOURCES.drhp.span}.${DUAL_SUFFIX}`,
        ...PROV,
      },
    },
    fieldPoints('segment_share_pct', '%', 'sahi_share', 'Niva Bupa DRHP · Exhibit 41 (computed)'),
  ),
  retail_share: build(
    'retail_share',
    {
      id: 'retail_share',
      chip: 'Retail Health Share',
      title: 'Retail Health Market Share',
      subtitle: 'Share of the whole all-India retail-health insurance market',
      unit: '%',
      format: pct,
      formatDelta: pctDelta,
      basisLabel: '% of all-India retail-health premiums (all insurers)',
      note: noteRetailShare(),
      source: {
        source_name: `Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 41 (retail-health market share, reported), ${TREND_SOURCES.drhp.span}.${DUAL_SUFFIX}`,
        ...PROV,
      },
    },
    fieldPoints('retail_share_pct', '%', 'retail_share', 'Niva Bupa DRHP · Exhibit 41'),
  ),
  overall_share: build(
    'overall_share',
    {
      id: 'overall_share',
      chip: 'Overall Health Share',
      title: 'Overall Health Market Share',
      subtitle: 'Share of the entire health market, incl. group & government',
      unit: '%',
      format: pct,
      formatDelta: pctDelta,
      basisLabel: '% of all-India health premiums (incl. group & government)',
      note: noteOverallShare(),
      source: {
        source_name: `Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 40 (overall-health market share, reported), ${TREND_SOURCES.drhp.span}.${DUAL_SUFFIX}`,
        ...PROV,
      },
    },
    fieldPoints('overall_share_pct', '%', 'overall_share', 'Niva Bupa DRHP · Exhibit 40'),
  ),
  gdpi: build(
    'gdpi',
    {
      id: 'gdpi',
      chip: 'GDPI Premium',
      title: 'Health Premium (GDPI)',
      subtitle: 'Overall-health gross direct premium income, ₹ Bn',
      unit: '₹ Bn',
      format: inr,
      formatDelta: inrDelta,
      basisLabel: 'Overall-health GDPI, ₹ Bn — premiums written (not profit)',
      note: noteGdpi(),
      source: {
        source_name: `Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 40 (overall-health GDPI, ₹ Bn, reported), ${TREND_SOURCES.drhp.span}.${DUAL_SUFFIX}`,
        ...PROV,
      },
    },
    fieldPoints('overall_gdpi_inr_bn', '₹ Bn', 'gdpi', 'Niva Bupa DRHP · Exhibit 40'),
  ),
  premium_growth: build(
    'premium_growth',
    {
      id: 'premium_growth',
      chip: 'Company Premium Growth',
      title: 'Premium Growth (YoY)',
      subtitle: 'Year-on-year growth in overall-health premium',
      unit: '%',
      format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
      formatDelta: pctDelta,
      basisLabel: 'YoY growth in overall-health GDPI · earliest year has no prior-year base (n/a)',
      note: noteGrowth(GROWTH_POINTS),
      source: {
        source_name: `Derived year-on-year from overall-health GDPI — DRHP Exhibit 40 (${TREND_SOURCES.drhp.span}), GI Council health portfolio after that (priors always taken from the same source as the year grown).`,
        ...PROV,
      },
    },
    GROWTH_POINTS,
  ),
}

export const METRIC_ORDER: MetricId[] = [
  'sahi_share',
  'retail_share',
  'overall_share',
  'gdpi',
  'premium_growth',
]
