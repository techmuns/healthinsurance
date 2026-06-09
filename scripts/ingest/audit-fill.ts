// ---------------------------------------------------------------------------
//  audit-fill — the one-source-at-a-time audit ingest CLI (Step 4).
//
//  Fills the audit overlay (src/data/snapshots/audit-overlay.json) one company /
//  year / metric at a time, applying the strict source-priority + overwrite
//  rules (Step 3):
//
//    • A value is written only if it is non-blank and source-referenced.
//    • It overwrites an existing value only when its source priority is equal or
//      better (lower number) — a weaker/partial pull never downgrades.
//    • A blank NEVER overwrites a sourced value.
//    • When a new value conflicts with an existing one of comparable priority,
//      both are kept and the cell is flagged for review by the grid.
//
//  Live fetching is out of scope here (that runs in GitHub Actions, e.g.
//  scripts/ingest/niva-fy25-financials.ts). This CLI consumes a *cleaned*,
//  structured extraction file via --from, so staging never silently lands
//  un-sourced numbers in the dashboard.
//
//  Usage:
//    tsx scripts/ingest/audit-fill.ts fill --company niva-bupa --year FY25 --from pull.json
//    tsx scripts/ingest/audit-fill.ts fill --company niva-bupa --years FY22,FY23,FY24,FY25 --from pull.json
//    tsx scripts/ingest/audit-fill.ts missing  [--company niva-bupa] [--year FY25]
//    tsx scripts/ingest/audit-fill.ts conflicts
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const STORE_PATH = resolve(REPO, 'data/processed/excel-values.json')
const OVERLAY_PATH = resolve(REPO, 'src/data/snapshots/audit-overlay.json')
const SHARE_PATH = resolve(REPO, 'src/data/snapshots/sahi-share-history.json')
const ANNUAL_PATH = resolve(REPO, 'src/data/snapshots/insurer-annual-snapshot.json')

const COMPANIES = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna']
const YEARS = ['FY22', 'FY23', 'FY24', 'FY25', 'FY26']

// Compact mirror of src/lib/auditGrid.ts AUDIT_METRICS (key → sources + unit).
interface MetricDef {
  key: string
  unit: string
  store?: string
  share?: 'segment_share_pct' | 'retail_share_pct' | 'overall_share_pct'
  annual?: string
}
const METRICS: MetricDef[] = [
  { key: 'total_gwp', unit: 'INR_cr', store: 'total_gwp', annual: 'gwp' },
  { key: 'gross_direct_premium', unit: 'INR_cr', store: 'gross_direct_premium', annual: 'gross_direct_premium' },
  { key: 'nwp', unit: 'INR_cr', store: 'nwp', annual: 'nwp' },
  { key: 'nep', unit: 'INR_cr', store: 'nep', annual: 'nep' },
  { key: 'pat_igaap', unit: 'INR_cr', store: 'pat_igaap', annual: 'pat' },
  { key: 'pat_ifrs', unit: 'INR_cr', store: 'pat_ifrs' },
  { key: 'claims_ratio_igaap', unit: '%', store: 'claims_ratio_igaap', annual: 'claims_ratio' },
  { key: 'claims_ratio_ifrs', unit: '%', store: 'claims_ratio_ifrs' },
  { key: 'expense_ratio_igaap', unit: '%', store: 'expense_ratio_igaap', annual: 'expense_ratio' },
  { key: 'commission_ratio_igaap', unit: '%', store: 'commission_ratio_igaap', annual: 'commission_ratio' },
  { key: 'combined_ratio_igaap', unit: '%', store: 'combined_ratio_igaap', annual: 'combined_ratio' },
  { key: 'solvency_ratio', unit: 'x', store: 'solvency_ratio', annual: 'solvency_ratio' },
  { key: 'net_worth_ifrs', unit: 'INR_cr', store: 'net_worth_ifrs' },
  { key: 'sahi_segment_share', unit: '%', share: 'segment_share_pct' },
  { key: 'retail_health_market_share', unit: '%', store: 'retail_health_market_share', share: 'retail_share_pct' },
  { key: 'overall_health_market_share', unit: '%', store: 'overall_health_market_share', share: 'overall_share_pct' },
  { key: 'settlement_ratio', unit: '%', annual: 'claims_settlement_ratio' },
  { key: 'renewal_rate', unit: '%', annual: 'renewal_rate' },
  { key: 'customer_retention', unit: '%', annual: 'customer_retention' },
]
const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]))

function loadJSON<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback
}

type AnyEntry = Record<string, unknown>
const store = loadJSON<Record<string, AnyEntry>>(STORE_PATH, {})
const overlayFile = loadJSON<{ _meta?: AnyEntry; data?: Record<string, AnyEntry> }>(OVERLAY_PATH, { data: {} })
const overlay = (overlayFile.data ??= {})
const shareRows = loadJSON<{ data: AnyEntry[] }>(SHARE_PATH, { data: [] }).data
const annualRows = loadJSON<{ data: AnyEntry[] }>(ANNUAL_PATH, { data: [] }).data

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

interface Candidate {
  value: number | null
  priority: number
  source: string
}
/** Current best non-blank value across store + share + annual + overlay. */
function currentBest(company: string, m: MetricDef, year: string): Candidate | null {
  const out: Candidate[] = []
  const ov = overlay[`${company}::${m.key}::${year}`] as AnyEntry | undefined
  if (ov && num(ov.value) != null) out.push({ value: num(ov.value), priority: (ov.priority as number) ?? 1, source: 'overlay' })
  if (m.store) {
    const e = store[`${company}::${m.store}::${year}`]
    let sv = e ? num(e.normalized_value ?? e.raw_value) : null
    const su = ((e?.unit as string) ?? '').toLowerCase()
    if (sv != null && m.unit === '%' && (su === 'fraction' || su === 'ratio')) sv = Math.round(sv * 1000) / 10
    if (sv != null) out.push({ value: sv, priority: 1, source: 'value-store' })
  }
  if (m.share) {
    const row = shareRows.find((r) => r.company_id === company) as AnyEntry | undefined
    const v = num((row?.[m.share] as AnyEntry | undefined)?.[year])
    if (v != null) out.push({ value: v, priority: 1, source: 'share-history' })
  }
  if (m.annual) {
    const row = annualRows.find((r) => r.company_id === company && r.fiscal_year === year) as AnyEntry | undefined
    const v = num(row?.[m.annual])
    if (v != null) out.push({ value: v, priority: 2, source: 'annual-snapshot' })
  }
  out.sort((a, b) => a.priority - b.priority)
  return out[0] ?? null
}

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string> } {
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'fill'
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
      flags[k] = v
    }
  }
  return { cmd, flags }
}

function targetYears(flags: Record<string, string>): string[] {
  if (flags.years) return flags.years.split(',').map((s) => s.trim())
  if (flags.year) return [flags.year]
  return YEARS
}

// ── commands ─────────────────────────────────────────────────────────────────
function cmdFill(flags: Record<string, string>) {
  if (!flags.from) {
    console.error('audit-fill: --from <cleaned-extraction.json> is required.')
    console.error('  The file should be an array (or {rows:[...]}) of:')
    console.error('  { "company": "niva-bupa", "year": "FY25", "metric": "total_gwp", "value": 6762.23,')
    console.error('    "unit": "INR_cr", "source_name": "...", "source_url": "...", "source_page": "...",')
    console.error('    "confidence": "high", "priority": 1 }')
    process.exit(1)
  }
  const raw = loadJSON<unknown>(resolve(REPO, flags.from), [])
  const rows = (Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])) as AnyEntry[]
  const onlyCompany = flags.company
  const allowYears = new Set(targetYears(flags))

  let written = 0
  let skippedBlank = 0
  let skippedWeaker = 0
  let flaggedConflict = 0
  const log: string[] = []

  for (const r of rows) {
    const company = (r.company as string) ?? onlyCompany
    const year = (r.year as string) ?? flags.year
    const metric = r.metric as string
    if (!company || !year || !metric) { log.push(`skip (missing company/year/metric): ${JSON.stringify(r)}`); continue }
    if (onlyCompany && company !== onlyCompany) continue
    if (!allowYears.has(year)) continue
    const m = METRIC_BY_KEY.get(metric)
    if (!m) { log.push(`skip (unknown metric ${metric})`); continue }

    const value = num(r.value)
    const key = `${company}::${metric}::${year}`
    if (value == null) { skippedBlank++; log.push(`skip blank → ${key} (a blank never overwrites a sourced value)`); continue }

    const incomingPriority = (r.priority as number) ?? (r.source_url ? 1 : 5)
    const best = currentBest(company, m, year)
    if (best && best.priority < incomingPriority) {
      skippedWeaker++
      log.push(`skip weaker → ${key}: keeping ${best.source} (P${best.priority}) over incoming P${incomingPriority}`)
      continue
    }
    if (best && best.value != null && Math.abs((best.value as number) - value) > (m.unit === '%' || m.unit === 'x' ? 0.1 : Math.max(Math.abs(value), 1) * 0.01)) {
      flaggedConflict++
      log.push(`conflict → ${key}: incoming ${value} vs ${best.source} ${best.value} — written; grid will flag "Needs review" (both kept)`)
    }

    overlay[key] = {
      value,
      unit: (r.unit as string) ?? m.unit,
      source_name: (r.source_name as string) ?? null,
      source_url: (r.source_url as string) ?? null,
      source_file: (r.source_file as string) ?? null,
      source_page: (r.source_page as string) ?? null,
      fetched_at: (r.fetched_at as string) ?? new Date().toISOString(),
      confidence: (r.confidence as string) ?? 'medium',
      priority: incomingPriority,
      layer: (r.layer as string) ?? (incomingPriority <= 1 ? 'official_filing' : 'staging'),
      note: (r.note as string) ?? null,
    }
    written++
  }

  overlayFile._meta = { ...(overlayFile._meta ?? {}), updated_at: new Date().toISOString() }
  writeFileSync(OVERLAY_PATH, JSON.stringify(overlayFile, null, 2) + '\n', 'utf8')

  console.log(log.join('\n'))
  console.log(`\naudit-fill: wrote ${written}, skipped-blank ${skippedBlank}, skipped-weaker ${skippedWeaker}, conflicts-flagged ${flaggedConflict}.`)
  console.log(`Overlay → ${OVERLAY_PATH}. Rebuild the index with: npm run audit:build`)
}

function cmdMissing(flags: Record<string, string>) {
  const cs = flags.company ? [flags.company] : COMPANIES
  const ys = targetYears(flags)
  let n = 0
  for (const c of cs) for (const y of ys) for (const m of METRICS) {
    if (currentBest(c, m, y) == null) { console.log(`MISSING  ${c.padEnd(13)} ${y}  ${m.key}`); n++ }
  }
  console.log(`\n${n} missing cell(s) across ${cs.length} compan${cs.length === 1 ? 'y' : 'ies'} × ${ys.length} year(s) × ${METRICS.length} metrics.`)
}

function cmdConflicts() {
  let n = 0
  for (const c of COMPANIES) for (const y of YEARS) for (const m of METRICS) {
    // A conflict = an overlay value that materially disagrees with a store/share/annual value.
    const ov = overlay[`${c}::${m.key}::${y}`] as AnyEntry | undefined
    const ovVal = ov ? num(ov.value) : null
    if (ovVal == null) continue
    const best = currentBest(c, m, y)
    // compare overlay vs the best NON-overlay candidate
    const others: number[] = []
    if (m.store) { const e = store[`${c}::${m.store}::${y}`]; let v = e ? num(e.normalized_value ?? e.raw_value) : null; const su = ((e?.unit as string) ?? '').toLowerCase(); if (v != null && m.unit === '%' && (su === 'fraction' || su === 'ratio')) v = Math.round(v * 1000) / 10; if (v != null) others.push(v) }
    if (m.share) { const row = shareRows.find((r) => r.company_id === c) as AnyEntry | undefined; const v = num((row?.[m.share] as AnyEntry | undefined)?.[y]); if (v != null) others.push(v) }
    if (m.annual) { const row = annualRows.find((r) => r.company_id === c && r.fiscal_year === y) as AnyEntry | undefined; const v = num(row?.[m.annual]); if (v != null) others.push(v) }
    const tol = m.unit === '%' || m.unit === 'x' ? 0.1 : Math.max(Math.abs(ovVal), 1) * 0.01
    const disagreeing = others.filter((v) => Math.abs(v - ovVal) > tol)
    if (disagreeing.length) { console.log(`REVIEW   ${c.padEnd(13)} ${y}  ${m.key}: overlay ${ovVal} vs ${disagreeing.join(', ')}  (best=${best?.source})`); n++ }
  }
  console.log(`\n${n} cell(s) need review (conflicting sources kept).`)
}

const { cmd, flags } = parseArgs(process.argv.slice(2))
if (cmd === 'fill') cmdFill(flags)
else if (cmd === 'missing') cmdMissing(flags)
else if (cmd === 'conflicts') cmdConflicts()
else { console.error(`Unknown command "${cmd}". Use: fill | missing | conflicts`); process.exit(1) }
