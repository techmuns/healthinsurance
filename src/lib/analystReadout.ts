// ---------------------------------------------------------------------------
//  analystReadout — Tier 1, the instant deterministic readout.
//
//  Computes a grounded readout from a set of selected Data-Audit cells — peer
//  ranking, outliers, min/max/spread, multi-period deltas (only where real),
//  source quality and honest gaps. Runs entirely in the browser, NO API key, NO
//  network — the free layer.
//
//  Input is the Data Audit table's own AuditCell (extractedDataAudit.ts), the
//  single source of truth. Honest by construction: only ready, source-backed,
//  numeric cells feed the statistics (missing/blocked ≠ 0); trends appear only
//  where the SAME company+metric has ≥2 real periods; every asserted number is
//  collected into groundedValues so the AI can never cite a figure the data
//  does not contain.
// ---------------------------------------------------------------------------

import { STATUS_META, formatValue, type AuditCell, type AuditStatus } from '@/lib/extractedDataAudit'
import { mean, median, stdev, zScore, pctChange, round } from '@/insights/stats'
import type {
  SelectionItem,
  MetricStat,
  TrendStat,
  CoverageStat,
  SourceQuality,
  Tier1Readout,
  AnalystRequest,
  RankEntry,
  FormulaNote,
} from '@/insights/analystTypes'

export const DATASET_VERSION = 'audit-spreadsheet-v1'

// A real, present value worth analysing. Calculated cells count only when they
// actually resolved to a number; everything blocked/missing is a gap, never 0.
const READY_STATUSES = new Set<AuditStatus>(['fetched', 'transformed', 'manual_override', 'computed'])

function numericValue(cell: AuditCell): number | null {
  const v = cell.normalizedValue ?? cell.calculatedValue ?? cell.rawValue
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** A cell whose value is present and trustworthy enough to analyse. */
export function isReadyAuditCell(cell: AuditCell): boolean {
  return READY_STATUSES.has(cell.status) && numericValue(cell) != null
}

// Directional leadership only — NOT a quality verdict. Mix-adjust before reading.
function polarity(label: string): boolean | null {
  if (/combined ratio|claims ratio|loss ratio|expense ratio|commission ratio|cost ratio/i.test(label)) return false
  if (/solvency|premium|\bnep\b|\bnwp\b|\bgwp\b|settlement|renewal|retention|market share|\bpat\b|profit|net worth|\broe\b|persistency/i.test(label)) return true
  return null
}

function classifySourceClass(name: string | null, url: string | null): 'statutory' | 'market' | 'other' {
  const hay = `${name ?? ''} ${url ?? ''}`.toLowerCase()
  if (/broker|screener|trendlyne|investing|aggregator|consensus|estimate|moneycontrol/.test(hay)) return 'market'
  if (/statutory|annual|ifrs|igaap|filing|official|disclosure|irdai|gi.?council|drhp|presentation|investor|earnings|company|exchange|nse|bse/.test(hay)) return 'statutory'
  return 'other'
}

// Plain-language formulas for the common ratios/metrics — used in the readout and
// passed to the AI as a hint (it must not invent its own).
const METRIC_FORMULA: { test: RegExp; note: FormulaNote }[] = [
  { test: /combined ratio/i, note: { title: 'Combined ratio', body: 'Combined Ratio = Claims Ratio + Expense Ratio (incl. commission). Below 100% is an underwriting profit; above 100% means claims + costs exceed premium.' } },
  { test: /claims ratio|loss ratio/i, note: { title: 'Claims ratio', body: 'Claims Ratio = Net Claims ÷ Net Earned Premium. Lower is better — less of each premium rupee is paid out as claims.' } },
  { test: /expense ratio/i, note: { title: 'Expense ratio', body: 'Expense Ratio = Operating Expenses ÷ Net Written Premium. Lower means leaner operations.' } },
  { test: /commission ratio/i, note: { title: 'Commission ratio', body: 'Commission Ratio = Commissions ÷ Premium — part of the acquisition cost inside the combined ratio.' } },
  { test: /solvency/i, note: { title: 'Solvency ratio', body: 'Solvency Ratio = Available Solvency Margin ÷ Required Margin. The regulatory floor is 1.5x; higher is a thicker capital buffer.' } },
  { test: /settlement ratio/i, note: { title: 'Claim settlement ratio', body: 'Claims Settlement Ratio = Claims Paid ÷ Claims Reported. Higher signals more reliable claims payment.' } },
  { test: /renewal/i, note: { title: 'Renewal rate', body: 'Renewal rate ≈ policies renewed ÷ policies due. Higher means stickier customers (embedded value).' } },
  { test: /\bnep\b|net earned premium/i, note: { title: 'Net earned premium', body: 'NEP is premium earned over the period — a scale measure, not profit.' } },
  { test: /\bgwp\b|gross.*premium/i, note: { title: 'Gross written premium', body: 'GWP is total premium booked — a scale measure, not profit.' } },
]

function formulaFor(metricLabels: string[]): FormulaNote | null {
  for (const label of metricLabels) for (const f of METRIC_FORMULA) if (f.test.test(label)) return f.note
  return null
}

/** Project one audited cell into the minimal, serialisable SelectionItem. */
export function toSelectionItem(cell: AuditCell): SelectionItem {
  const ready = isReadyAuditCell(cell)
  return {
    company: cell.entityId,
    companyLabel: cell.entityLabel,
    metric: cell.metricId,
    metricLabel: cell.metricLabel,
    unit: cell.unit,
    period: cell.period,
    value: numericValue(cell),
    status: cell.status,
    statusLabel: STATUS_META[cell.status].label,
    ready,
    sourceName: cell.sourceName,
    sourceUrl: cell.sourceUrl,
    confidence: cell.confidence,
    sourceClass: classifySourceClass(cell.sourceName, cell.sourceUrl),
    gapReason: ready ? null : cell.note?.trim() || cell.blankTag || STATUS_META[cell.status].label,
  }
}

export function selectionFromAuditCells(cells: AuditCell[]): SelectionItem[] {
  return cells.map(toSelectionItem)
}

// ── Period ordering — handles FYxx, Qn FYxx, H1/H2 FYxx, 9M FYxx ──────────────
function periodSortKey(p: string): number {
  const fy = p.match(/FY\s?(\d{2})/i)
  const year = fy ? 2000 + Number(fy[1]) : 0
  let frac = 0.9 // a full FY sorts after that FY's interim periods
  const q = p.match(/Q\s?([1-4])/i)
  if (q) frac = Number(q[1]) / 10
  else if (/H1/i.test(p)) frac = 0.25
  else if (/9\s?M/i.test(p)) frac = 0.35
  else if (/H2/i.test(p)) frac = 0.45
  return year + frac
}

function sortedPeriods(periods: string[]): string[] {
  return [...new Set(periods)].sort((a, b) => periodSortKey(a) - periodSortKey(b) || a.localeCompare(b))
}

// ── Small deterministic string hash (FNV-1a, 32-bit) — the cache key ─────────
function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function signatureFor(items: SelectionItem[], datasetVersion = DATASET_VERSION): string {
  const canon = items
    .map((i) => `${i.company}::${i.metric}::${i.period}=${i.value ?? 'NA'}/${i.status}`)
    .sort()
    .join('|')
  return hashString(`${datasetVersion}#${canon}`)
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
    if (arr.length < 2) continue
    const vals = arr.map((a) => a.value as number)
    const m = mean(vals)
    const sd = stdev(vals)
    const hib = polarity(arr[0].metricLabel)
    const dir = hib ?? true
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
      return { company: it.company, companyLabel: it.companyLabel, value: v, rank, of: arr.length, z, isOutlier: arr.length >= 3 && Math.abs(z) >= 1.5 }
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
  return out.sort((a, b) => a.metricLabel.localeCompare(b.metricLabel) || periodSortKey(a.period) - periodSortKey(b.period))
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
    if (periods.length < 2) continue
    const pts = periods
      .map((p) => {
        const hit = arr.find((a) => a.period === p)
        return hit ? { period: p, value: hit.value as number } : null
      })
      .filter((p): p is { period: string; value: number } => p != null)
    if (pts.length < 2) continue
    const from = pts[0].value
    const to = pts[pts.length - 1].value
    const pc = pctChange(from, to)
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
      pctChange: pc == null ? null : round(pc, 2),
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
    else gapList.push({ companyLabel: it.companyLabel, metricLabel: it.metricLabel, period: it.period, reason: it.gapReason ?? it.statusLabel })
  }
  return { total: items.length, ready, gaps: items.length - ready, byStatus, gapList }
}

function sourceQualityFor(items: SelectionItem[]): SourceQuality {
  const byConfidence: Record<string, number> = {}
  const firewall: string[] = []
  let marketOnly = 0
  for (const it of items) {
    if (!it.ready) continue
    const conf = it.confidence ?? 'unstated'
    byConfidence[conf] = (byConfidence[conf] ?? 0) + 1
    if (it.sourceClass === 'market') {
      marketOnly += 1
      firewall.push(`${it.metricLabel} for ${it.companyLabel} (${it.period}) rests on a market/aggregator source — treat as indicative, not a statutory figure.`)
    }
  }
  return { byConfidence, marketOnly, firewallWarnings: [...new Set(firewall)] }
}

function collectGroundedValues(core: Omit<Tier1Readout, 'groundedValues' | 'signature'>, ready: SelectionItem[]): number[] {
  const g: number[] = []
  for (const it of ready) if (it.value != null) g.push(it.value)
  for (const ms of core.metricStats) {
    g.push(ms.mean, ms.median, ms.stdev, ms.min.value, ms.max.value, ms.spread)
    for (const r of ms.ranks) g.push(r.z, r.value)
  }
  for (const t of core.trends) {
    g.push(t.from, t.to, t.absChange)
    if (t.pctChange != null) g.push(t.pctChange)
    for (const p of t.points) g.push(p.value)
  }
  g.push(core.coverage.total, core.coverage.ready, core.coverage.gaps, core.sourceQuality.marketOnly)
  return [...new Set(g.filter((n) => Number.isFinite(n)))]
}

/** Compute the full Tier-1 readout from a set of selected audited cells. */
export function computeReadout(items: SelectionItem[], datasetVersion = DATASET_VERSION): Tier1Readout {
  const ready = items.filter((i) => i.ready)
  const companies = [...new Map(items.map((i) => [i.company, { id: i.company, label: i.companyLabel }])).values()]
  const metrics = [...new Map(items.map((i) => [i.metric, { key: i.metric, label: i.metricLabel }])).values()]
  const periods = sortedPeriods(items.map((i) => i.period))

  const metricStats = metricStatsFor(ready)
  const trends = trendsFor(ready)
  const coverage = coverageFor(items)
  const sourceQuality = sourceQualityFor(items)
  const formula = formulaFor(metrics.map((m) => m.label))

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
    formula,
  }
  const groundedValues = collectGroundedValues(core, ready)
  const signature = signatureFor(items, datasetVersion)
  return { ...core, groundedValues, signature }
}

/** A short, plain-English scope line: "5 insurers · Combined ratio · FY25". */
export function scopeLabel(readout: Tier1Readout): string {
  const { companies, metrics, periods } = readout.scope
  const companyPart = companies.length === 1 ? companies[0].label : `${companies.length} insurers`
  const metricPart = metrics.length === 1 ? metrics[0].label : `${metrics.length} metrics`
  const periodPart = periods.length === 0 ? '—' : periods.length === 1 ? periods[0] : `${periods[0]}–${periods[periods.length - 1]}`
  const cov = readout.coverage.total ? ` · ${readout.coverage.ready}/${readout.coverage.total} ready` : ''
  return `${companyPart} · ${metricPart} · ${periodPart}${cov}`
}

/** Build the request body POSTed to the server function — computed signals +
 *  audit metadata only, never raw unnecessary data. */
export function buildAnalystRequest(items: SelectionItem[], datasetVersion = DATASET_VERSION): AnalystRequest {
  const readout = computeReadout(items, datasetVersion)
  return { scopeLabel: scopeLabel(readout), selection: items, readout, datasetVersion }
}

/** A few plain-language analysis points computed in the browser — the always-on
 *  read shown with or without AI. Honest: only grounded values, no fabrication,
 *  no trend implied from a single period. */
export function localQuickRead(readout: Tier1Readout, items: SelectionItem[]): string[] {
  const out: string[] = []
  const fmt = (v: number, u: string) => formatValue(v, u)

  for (const m of readout.metricStats.slice(0, 3)) {
    if (m.higherIsBetter == null) {
      out.push(`${m.metricLabel} ranges from ${m.min.companyLabel} at ${fmt(m.min.value, m.unit)} to ${m.max.companyLabel} at ${fmt(m.max.value, m.unit)} (median ${fmt(m.median, m.unit)}).`)
    } else {
      const best = m.higherIsBetter ? m.max : m.min
      const worst = m.higherIsBetter ? m.min : m.max
      out.push(`${best.companyLabel} leads on ${m.metricLabel} at ${fmt(best.value, m.unit)}; ${worst.companyLabel} lags at ${fmt(worst.value, m.unit)} (median ${fmt(m.median, m.unit)}).`)
    }
    const outlier = m.ranks.find((r) => r.isOutlier)
    if (outlier) out.push(`${outlier.companyLabel} stands apart from the group on ${m.metricLabel} at ${fmt(outlier.value, m.unit)}.`)
  }

  for (const t of readout.trends.slice(0, 2)) {
    const dir = t.absChange > 0 ? 'rose' : t.absChange < 0 ? 'eased' : 'held flat'
    out.push(`${t.companyLabel}'s ${t.metricLabel} ${dir} from ${fmt(t.from, t.unit)} to ${fmt(t.to, t.unit)} over ${t.points[0].period}–${t.points[t.points.length - 1].period}.`)
  }

  // Nothing comparative — state the selected values plainly.
  if (out.length === 0) {
    for (const r of items.filter((i) => i.ready && i.value != null).slice(0, 4)) {
      out.push(`${r.companyLabel} · ${r.metricLabel} (${r.period}): ${fmt(r.value as number, r.unit)}.`)
    }
  }

  if (readout.scope.singlePeriod && readout.scope.periods[0] && out.length > 0) {
    out.push(`${readout.scope.periods[0]} only — not enough history to call a trend.`)
  }

  return out.slice(0, 6)
}
