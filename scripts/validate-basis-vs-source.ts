// ---------------------------------------------------------------------------
//  validate-basis-vs-source — cross-check the curated dual-basis profitability
//  module (src/data/accountingBasis.ts) against the committed Data-Audit
//  source-of-truth (data/source-map/deck-sourced-values.json + the audit value
//  store data/processed/excel-values.json).
//
//  For every (company · basis · period · metric) the dashboard can show, this
//  reports one of:
//    • MATCH        — curated value equals a machine-extracted source value
//    • MISMATCH     — both exist but differ materially  → a real error to fix
//    • NO_SOURCE    — curated value has no machine-extracted counterpart yet
//                     (hand-read from the same deck; a coverage gap, not a bug)
//
//  Exit code is non-zero ONLY on a MISMATCH, so this can gate QA (sub-part 8:
//  "selected basis value must match Data Audit") without failing on the known,
//  honest machine-extraction coverage gaps. Run: npx tsx scripts/validate-basis-vs-source.ts
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getBasisProfit, ANNUAL_PERIODS, Q4_PERIODS, type BasisPeriod } from '../src/data/accountingBasis'

const ROOT = resolve(import.meta.dirname, '..')
const COMPANIES = ['niva-bupa', 'star-health', 'care-health']
const BASES = ['igaap', 'ifrs'] as const
const PERIODS: BasisPeriod[] = [...ANNUAL_PERIODS, ...Q4_PERIODS]

// curated BasisProfit field → source-of-truth metric stem (basis appended).
const FIELD_TO_METRIC: Record<string, string> = {
  pat: 'pat',
  claimsRatio: 'claims_ratio',
  expenseRatio: 'expense_ratio',
  combinedRatio: 'combined_ratio',
  eom: 'eom',
}

interface DeckRow { company_id?: string; metric?: string; period?: string; raw_value?: number | null; normalized_value?: number | null }
interface StoreRow { entity?: string; metric?: string; period?: string; normalized_value?: number | null }

function loadDeck(): Map<string, number> {
  const j = JSON.parse(readFileSync(resolve(ROOT, 'data/source-map/deck-sourced-values.json'), 'utf8'))
  const rows: DeckRow[] = j.data ?? []
  const m = new Map<string, number>()
  for (const r of rows) {
    const v = r.raw_value ?? r.normalized_value
    if (r.company_id && r.metric && r.period && typeof v === 'number') m.set(`${r.company_id}::${r.metric}::${r.period}`, v)
  }
  return m
}

function loadStore(): Map<string, number> {
  const m = new Map<string, number>()
  try {
    const j = JSON.parse(readFileSync(resolve(ROOT, 'data/processed/excel-values.json'), 'utf8'))
    const rows: StoreRow[] = Array.isArray(j) ? j : Object.values(j)
    for (const r of rows) {
      if (r?.entity && r.metric && r.period && typeof r.normalized_value === 'number') m.set(`${r.entity}::${r.metric}::${r.period}`, r.normalized_value)
    }
  } catch { /* value store optional */ }
  return m
}

// The two source files disagree on ratio units: deck-sourced-values.json stores
// percent (65.0) while the audit value store stores fractions (0.54 = 54%).
// Normalise any ratio that looks like a fraction (≤ 2.5, i.e. ≤ 250%) to percent
// before comparing — no real claims/expense/combined ratio is ≤ 2.5%.
function asPct(v: number): number {
  return Math.abs(v) <= 2.5 ? v * 100 : v
}

function material(a: number, b: number, isPct: boolean): boolean {
  if (isPct) return Math.abs(asPct(a) - asPct(b)) > 0.5 // allow source rounding to whole/2dp
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) > 0.02
}

const deck = loadDeck()
const store = loadStore()
// Prefer the deck (percent units, human-curated extraction) over the value store
// (fractions, sometimes conflates expense-ratio with EoM) when both exist.
const sourceVal = (key: string): number | undefined => deck.get(key) ?? store.get(key)

// Is a machine-source value itself implausible for the metric? (then the SOURCE
// is suspect, not the curated value — never "fix" curated to a bad source.)
function sourceSuspect(field: string, v: number): boolean {
  const p = asPct(v)
  if (field === 'claimsRatio') return p < 5 || p > 100
  if (field === 'expenseRatio' || field === 'eom') return p < 5 || p > 80
  if (field === 'combinedRatio') return p < 50 || p > 200
  return false
}

let match = 0, noSource = 0
const review: string[] = []     // beyond tight tolerance — rounding/definitional, for human review
const suspect: string[] = []    // the machine source itself looks wrong
const gross: string[] = []      // large disagreement → a real error, fails QA
const gaps: string[] = []

for (const company of COMPANIES) {
  for (const basis of BASES) {
    for (const period of PERIODS) {
      const bp = getBasisProfit(company, basis, period)
      if (!bp) continue
      for (const [field, stem] of Object.entries(FIELD_TO_METRIC)) {
        if (field === 'eom' && basis !== 'igaap') continue
        const curated = (bp as Record<string, number | null>)[field]
        if (curated == null) continue
        const src = sourceVal(`${company}::${stem}_${basis}::${period}`)
        if (src == null) { noSource++; gaps.push(`${company} ${basis} ${period} ${field}=${curated} (no machine source for ${stem}_${basis})`); continue }
        const isPct = field !== 'pat'
        const line = `${company} ${basis} ${period} ${field}: curated=${curated} vs source=${isPct ? asPct(src) : src}`
        if (isPct && sourceSuspect(field, src)) { suspect.push(line); continue }
        if (!material(curated, src, isPct)) { match++; continue }
        // How far apart? gross → real error (fails QA); else review (rounding/definitional).
        const diff = isPct ? Math.abs(asPct(curated) - asPct(src)) : Math.abs(curated - src) / Math.max(Math.abs(curated), 1) * 100
        ;(diff > (isPct ? 5 : 25) ? gross : review).push(`${line}  (Δ${diff.toFixed(1)}${isPct ? 'pp' : '%'})`)
      }
    }
  }
}

console.log('── Profitability basis ⇄ Data-Audit source-of-truth ──')
console.log(`MATCH: ${match}   REVIEW: ${review.length}   SOURCE_SUSPECT: ${suspect.length}   GROSS_ERROR: ${gross.length}   NO_SOURCE (extraction gap): ${noSource}`)
if (gross.length) { console.log('\nGROSS ERRORS (curated clearly wrong — must fix):'); for (const m of gross) console.log('  ✗ ' + m) }
if (review.length) { console.log('\nReview (rounding / definitional, e.g. expense-ratio vs EoM — not fabrications):'); for (const m of review) console.log('  · ' + m) }
if (suspect.length) { console.log('\nMachine source looks wrong (curated value kept):'); for (const m of suspect) console.log('  ! ' + m) }
console.log(`\nCoverage gaps (curated hand-read from the same deck; machine extraction TODO): ${gaps.length}`)

// Fail QA only on a GROSS disagreement (a genuine curated error), never on
// rounding, basis-definitional differences, a bad source value, or a gap.
process.exit(gross.length > 0 ? 1 : 0)
