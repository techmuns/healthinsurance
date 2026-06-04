// Reusable market-trend dataset + metric registry powering the Market Trend
// Explorer. Every metric is normalised to the SAME shape — a flat list of
// { company, year, value, unit, source, metricType } points — so the UI is
// fully generic: it renders whatever years exist in the data (nothing is
// hardcoded to FY22–FY24), and a metric with no points simply reports itself
// as unavailable instead of inventing values.
//
// Source of truth: the Niva Bupa DRHP (Redseer Report) snapshot. Share figures
// are reported (Exhibits 40 & 41); GDPI is reported (Exhibit 40); premium
// growth is derived year-on-year from that same GDPI series.

import snapshot from '@/data/snapshots/sahi-share-history.json'

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

type ShareField = 'segment_share_pct' | 'retail_share_pct' | 'overall_share_pct' | 'overall_gdpi_inr_bn'

/** Flatten a per-company {year: value} field into the reusable point list. */
function fieldPoints(field: ShareField, unit: string, metricType: MetricId, source: string): TrendPoint[] {
  const out: TrendPoint[] = []
  for (const r of ROWS) {
    for (const [year, value] of Object.entries(r[field])) {
      out.push({ company: r.company_id, year, value, unit, source, metricType })
    }
  }
  return out
}

/** Year-on-year % growth derived from the overall-health GDPI series. The first
 *  available year has no prior period, so it is honestly left null. */
function growthPoints(source: string): TrendPoint[] {
  const out: TrendPoint[] = []
  for (const r of ROWS) {
    const series = r.overall_gdpi_inr_bn
    const years = sortYears(Object.keys(series))
    years.forEach((year, i) => {
      let value: number | null = null
      if (i > 0) {
        const prev = series[years[i - 1]]
        const cur = series[year]
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

const PROV = { source_url: SRC.source_url, fetched_at: SRC.fetched_at }

function build(id: MetricId, def: Omit<MetricDef, 'points' | 'available'>, points: TrendPoint[]): MetricDef {
  return { ...def, id, points, available: points.some((p) => p.value != null) }
}

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
      note: 'Star still leads the standalone pack but is ceding share; Niva Bupa and Care are the gainers, each now ~16%.',
      source: {
        source_name:
          'Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 41 (retail-health GDPI). Segment shares computed; match the DRHP’s reported Niva Bupa share (16.24% FY24).',
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
      note: 'SAHIs now hold 56% of retail health. Niva Bupa is the #4 player overall — up from 7.0% to 9.1% in two years.',
      source: {
        source_name: 'Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 41 (retail-health market share, reported).',
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
      note: 'On the all-in health market the public insurers still dominate; among standalones, Niva Bupa nearly doubled its slice — 3.8% to 5.1%.',
      source: {
        source_name: 'Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 40 (overall-health market share, reported).',
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
      note: 'Premium scale separates the field: Star ~₹150 Bn vs the chasers. Niva Bupa doubled to ₹55 Bn in two years.',
      source: {
        source_name: 'Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibit 40 (overall-health GDPI, ₹ Bn, reported).',
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
      note: 'All five compounded >17% a year; Care Health and Niva Bupa lead the latest year (~38–39%). The first year is n/a — the DRHP gives no prior-year base.',
      source: {
        source_name: 'Derived from Niva Bupa DRHP · Redseer Report, Exhibit 40 (overall-health GDPI) — year-on-year growth.',
        ...PROV,
      },
    },
    growthPoints('Derived · Niva Bupa DRHP, Exhibit 40'),
  ),
}

export const METRIC_ORDER: MetricId[] = [
  'sahi_share',
  'retail_share',
  'overall_share',
  'gdpi',
  'premium_growth',
]
