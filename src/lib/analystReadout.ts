// ---------------------------------------------------------------------------
//  analystReadout — Tier 1, the instant deterministic readout (build brief §4.1).
//
//  Computes a grounded financial readout from a set of selected audited cells —
//  peer ranking, outliers, min/max/spread, multi-period deltas (only where real
//  multi-period data exists), source quality and honest data gaps. Runs entirely
//  in the browser, with NO API key and NO network — this is the free layer.
//
//  Honesty rules baked in (CLAUDE.md):
//    • Only ready, source-backed cells feed the statistics; missing ≠ 0.
//    • Trends appear ONLY where the SAME company+metric has ≥2 real periods —
//      a single FY cross-section is labelled as such, never implied as a trend.
//    • Disputed (needs_review) and superseded values are carried as gaps, never
//      used to anchor a number.
//    • Every number the readout asserts is collected into `groundedValues`, which
//      becomes the allow-set the AI gate checks its output against.
// ---------------------------------------------------------------------------

import {
  AUDIT_YEARS,
  GRID_STATUS_META,
  type GridCell,
  type SourceRef,
} from '@/lib/auditGrid'
import { mean, median, stdev, zScore, slope, pctChange, round } from '@/insights/stats'
import type {
  SelectionItem,
  MetricStat,
  TrendStat,
  CoverageStat,
  SourceQuality,
  Tier1Readout,
  AnalystRequest,
  RankEntry,
} from '@/insights/analystTypes'

export const DATASET_VERSION = 'audit-grid-v1'

// A real value, trustworthy enough to analyse. basis_mismatch is a real figure on
// a different accounting basis (CLAUDE.md), so it counts; needs_review / superseded
// / missing / not-available do NOT.
const READY_STATUSES = new Set(['filled', 'basis_mismatch'])

// Directional leadership only — this is NOT a quality verdict. The AI is told to
// mix-adjust and never equate premium size with quality.
const LOWER_IS_BETTER = new Set([
  'claims_ratio_igaap',
  'claims_ratio_ifrs',
  'expense_ratio_igaap',
  'commission_ratio_igaap',
  'combined_ratio_igaap',
])
const HIGHER_IS_BETTER = new Set([
  'total_gwp',
  'gross_direct_premium',
  'nwp',
  'nep',
  'pat_igaap',
  'pat_ifrs',
  'solvency_ratio',
  'net_worth_ifrs',
  'sahi_segment_share',
  'retail_health_market_share',
  'overall_health_market_share',
  'settlement_ratio',
  'renewal_rate',
  'customer_retention',
])

function polarity(metric: string): boolean | null {
  if (HIGHER_IS_BETTER.has(metric)) return true
  if (LOWER_IS_BETTER.has(metric)) return false
  return null
}

/** Classify a source layer/name as a true statutory/filing source vs a
 *  market/opinion source (broker / exchange / aggregator). */
export function classifySourceClass(ref: SourceRef | null): 'statutory' | 'market' | 'other' {
  if (!ref) return 'other'
  const hay = `${ref.layer ?? ''} ${ref.sourceName ?? ''} ${ref.sourceUrl ?? ''}`.toLowerCase()
  if (/broker|screener|trendlyne|investing|aggregator|consensus|estimate|street|moneycontrol/.test(hay)) return 'market'
  if (/statutory|annual|ifrs|igaap|filing|official|disclosure|irdai|gi.?council|drhp|presentation|investor|earnings|company|snapshot/.test(hay))
    return 'statutory'
  return 'other'
}

/** A cell whose value is present and trustworthy enough to analyse. */
export function isReadyCell(cell: GridCell): boolean {
  return READY_STATUSES.has(cell.status) && cell.value != null
}

/** Project one audited GridCell into the minimal, serialisable SelectionItem. */
export function toSelectionItem(cell: GridCell): SelectionItem {
  const ready = isReadyCell(cell)
  const src = cell.chosen
  return {
    company: cell.company,
    companyLabel: cell.companyLabel,
    metric: cell.metric,
    metricLabel: cell.metricLabel,
    category: cell.category,
    unit: cell.unit,
    period: cell.year,
    value: cell.value,
    status: cell.status,
    statusLabel: GRID_STATUS_META[cell.status].label,
    ready,
    sourceName: src?.sourceName ?? null,
    sourceLayer: src?.layer ?? null,
    sourceUrl: src?.sourceUrl ?? null,
    confidence: src?.confidence ?? null,
    sourceClass: classifySourceClass(src),
    // A gap reason is shown only to explain an absent / disputed value — never the
    // internal lineage bookkeeping of a filled cell (CLAUDE.md, 2026-06-11).
    gapReason: ready ? null : cell.notes?.trim() || GRID_STATUS_META[cell.status].label,
    conflicts: cell.competing.map((c) => ({ value: c.value, source: c.sourceName ?? c.layer })),
  }
}

// ── Small deterministic string hash (FNV-1a, 32-bit) ─────────────────────────
function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Stable hash of (selection + values + dataset version) — the cache key. Same
 *  selection + same underlying data + same dataset version ⇒ identical signature. */
export function signatureFor(items: SelectionItem[], datasetVersion = DATASET_VERSION): string {
  const canon = items
    .map((i) => `${i.company}::${i.metric}::${i.period}=${i.value ?? 'NA'}/${i.status}`)
    .sort()
    .join('|')
  return hashString(`${datasetVersion}#${canon}`)
}

function yearIndex(period: string): number {
  const i = (AUDIT_YEARS as readonly string[]).indexOf(period)
  return i === -1 ? 999 : i
}

function sortedPeriods(periods: string[]): string[] {
  return [...new Set(periods)].sort((a, b) => yearIndex(a) - yearIndex(b) || a.localeCompare(b))
}

// ── Cross-sectional peer statistics, per (metric, period) with ≥2 ready values ─
function metricStatsFor(ready: SelectionItem[]): MetricStat[] {
  const groups = new Map<string, SelectionItem[]>()
  for (const it of ready) {
    const k = `${it.metric}::${it.period}`
    const arr = groups.get(k) ?? []
    arr.push(it)
    groups.set(k, arr)
  }
  const out: MetricStat[] = []
  for (const arr of groups.values()) {
    if (arr.length < 2) continue // no peer comparison with a single company
    const vals = arr.map((a) => a.value as number)
    const m = mean(vals)
    const sd = stdev(vals)
    const hib = polarity(arr[0].metric)
    const dir = hib ?? true // default higher = leads, but flagged null so it isn't read as a verdict
    const ordered = [...arr].sort((a, b) => (dir ? (b.value as number) - (a.value as number) : (a.value as number) - (b.value as number)))
    let rank = 0
    let seen = 0
    let prev: number | null = null
    const ranks: RankEntry[] = ordered.map((it) => {
      seen += 1
      const v = it.value as number
      if (prev === null || v !== prev) rank = seen
      prev = v
      const z = round(zScore(v, m, sd), 2)
      return {
        company: it.company,
        companyLabel: it.companyLabel,
        value: v,
        rank,
        of: arr.length,
        z,
        isOutlier: arr.length >= 3 && Math.abs(z) >= 1.5,
      }
    })
    const lo = arr.reduce((a, b) => ((a.value as number) <= (b.value as number) ? a : b))
    const hi = arr.reduce((a, b) => ((a.value as number) >= (b.value as number) ? a : b))
    out.push({
      metric: arr[0].metric,
      metricLabel: arr[0].metricLabel,
      unit: arr[0].unit,
      period: arr[0].period,
      count: arr.length,
      mean: round(m, 2),
      median: round(median(vals), 2),
      stdev: round(sd, 2),
      min: { company: lo.company, companyLabel: lo.companyLabel, value: lo.value as number },
      max: { company: hi.company, companyLabel: hi.companyLabel, value: hi.value as number },
      spread: round((hi.value as number) - (lo.value as number), 2),
      ranks,
      higherIsBetter: hib,
    })
  }
  // Stable, readable order: by metric label then period.
  return out.sort((a, b) => a.metricLabel.localeCompare(b.metricLabel) || yearIndex(a.period) - yearIndex(b.period))
}

// ── Within-company multi-period deltas — ONLY where real multi-period exists ───
function trendsFor(ready: SelectionItem[]): TrendStat[] {
  const groups = new Map<string, SelectionItem[]>()
  for (const it of ready) {
    const k = `${it.company}::${it.metric}`
    const arr = groups.get(k) ?? []
    arr.push(it)
    groups.set(k, arr)
  }
  const out: TrendStat[] = []
  for (const arr of groups.values()) {
    const periods = sortedPeriods(arr.map((a) => a.period))
    if (periods.length < 2) continue // a single period is not a trend (honest)
    const pts = periods
      .map((p) => {
        const hit = arr.find((a) => a.period === p)
        return hit ? { period: p, value: hit.value as number } : null
      })
      .filter((p): p is { period: string; value: number } => p != null)
    if (pts.length < 2) continue
    const from = pts[0].value
    const to = pts[pts.length - 1].value
    const sl = slope(pts.map((p) => ({ x: yearIndex(p.period), y: p.value })))
    out.push({
      company: arr[0].company,
      companyLabel: arr[0].companyLabel,
      metric: arr[0].metric,
      metricLabel: arr[0].metricLabel,
      unit: arr[0].unit,
      points: pts,
      from,
      to,
      absChange: round(to - from, 2),
      pctChange: pctChange(from, to) == null ? null : round(pctChange(from, to) as number, 2),
      slopePerYear: sl == null ? null : round(sl, 2),
    })
  }
  return out.sort((a, b) => a.companyLabel.localeCompare(b.companyLabel) || a.metricLabel.localeCompare(b.metricLabel))
}

function coverageFor(items: SelectionItem[]): CoverageStat {
  const byStatus: Record<string, number> = {}
  const gapList: CoverageStat['gapList'] = []
  let ready = 0
  for (const it of items) {
    byStatus[it.statusLabel] = (byStatus[it.statusLabel] ?? 0) + 1
    if (it.ready) ready += 1
    else
      gapList.push({
        company: it.company,
        companyLabel: it.companyLabel,
        metric: it.metric,
        metricLabel: it.metricLabel,
        period: it.period,
        reason: it.gapReason ?? it.statusLabel,
      })
  }
  return { total: items.length, ready, gaps: items.length - ready, byStatus, gapList }
}

function sourceQualityFor(items: SelectionItem[]): SourceQuality {
  const byLayer: Record<string, number> = {}
  const byConfidence: Record<string, number> = {}
  const firewall: string[] = []
  let marketOnly = 0
  let conflicts = 0
  for (const it of items) {
    if (!it.ready) continue
    const layer = it.sourceLayer ?? 'unknown'
    byLayer[layer] = (byLayer[layer] ?? 0) + 1
    const conf = it.confidence ?? 'unstated'
    byConfidence[conf] = (byConfidence[conf] ?? 0) + 1
    if (it.conflicts.length > 0) conflicts += 1
    if (it.sourceClass === 'market') {
      marketOnly += 1
      firewall.push(`${it.metricLabel} for ${it.companyLabel} (${it.period}) rests on a market/aggregator source — treat as indicative, not a statutory figure.`)
    }
  }
  return { byLayer, byConfidence, marketOnly, conflicts, firewallWarnings: [...new Set(firewall)] }
}

function collectGroundedValues(readout: Omit<Tier1Readout, 'groundedValues' | 'signature'>, ready: SelectionItem[]): number[] {
  const g: number[] = []
  for (const it of ready) if (it.value != null) g.push(it.value)
  for (const ms of readout.metricStats) {
    g.push(ms.mean, ms.median, ms.stdev, ms.min.value, ms.max.value, ms.spread)
    for (const r of ms.ranks) g.push(r.z, r.value)
  }
  for (const t of readout.trends) {
    g.push(t.from, t.to, t.absChange)
    if (t.pctChange != null) g.push(t.pctChange)
    if (t.slopePerYear != null) g.push(t.slopePerYear)
    for (const p of t.points) g.push(p.value)
  }
  g.push(readout.coverage.total, readout.coverage.ready, readout.coverage.gaps, readout.sourceQuality.marketOnly, readout.sourceQuality.conflicts)
  // Dedupe (tolerance is applied later by the grounding check).
  return [...new Set(g.filter((n) => Number.isFinite(n)))]
}

/** Compute the full Tier-1 readout from a set of selected audited cells. */
export function computeReadout(cells: GridCell[], datasetVersion = DATASET_VERSION): Tier1Readout {
  const items = cells.map(toSelectionItem)
  const ready = items.filter((i) => i.ready)

  const companies = [...new Map(items.map((i) => [i.company, { id: i.company, label: i.companyLabel }])).values()]
  const metrics = [...new Map(items.map((i) => [i.metric, { key: i.metric, label: i.metricLabel, category: i.category }])).values()]
  const periods = sortedPeriods(items.map((i) => i.period))

  const metricStats = metricStatsFor(ready)
  const trends = trendsFor(ready)
  const coverage = coverageFor(items)
  const sourceQuality = sourceQualityFor(items)

  const core = {
    scope: {
      companies,
      metrics,
      periods,
      multiPeriod: periods.length > 1,
      singlePeriod: periods.length === 1,
      trendAvailable: trends.length > 0,
    },
    coverage,
    metricStats,
    trends,
    sourceQuality,
  }
  const groundedValues = collectGroundedValues(core, ready)
  const signature = signatureFor(items, datasetVersion)
  return { ...core, groundedValues, signature }
}

/** A short, plain-English scope line: "Comparing 5 insurers · Ratios · FY25". */
export function scopeLabel(readout: Tier1Readout): string {
  const { companies, metrics, periods } = readout.scope
  const companyPart = companies.length === 1 ? companies[0].label : `${companies.length} insurers`
  const cats = [...new Set(metrics.map((m) => m.category))]
  const metricPart = metrics.length === 1 ? metrics[0].label : cats.length <= 2 ? cats.join(' + ') : `${metrics.length} metrics`
  const periodPart = periods.length === 0 ? '—' : periods.length === 1 ? periods[0] : `${periods[0]}–${periods[periods.length - 1]}`
  const cov = readout.coverage.total ? ` · ${readout.coverage.ready}/${readout.coverage.total} ready` : ''
  return `${companyPart} · ${metricPart} · ${periodPart}${cov}`
}

/** Build the request body POSTed to the server function. Only the computed
 *  signals + audit metadata travel — never raw unnecessary data. */
export function buildAnalystRequest(cells: GridCell[], datasetVersion = DATASET_VERSION): AnalystRequest {
  const readout = computeReadout(cells, datasetVersion)
  return {
    scopeLabel: scopeLabel(readout),
    selection: cells.map(toSelectionItem),
    readout,
    datasetVersion,
  }
}
