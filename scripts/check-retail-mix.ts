// ---------------------------------------------------------------------------
//  Retail Mix consistency check (run: npm run check:retail-mix).
//
//  Fails the build if the Product Mix chart and the peer grid would show
//  different Retail Mix values for any company/FY, if a retail/group split does
//  not sum to 100%, or if a company's GI-Council health components do not
//  reconstruct the printed total. This is the guard behind the goal: the
//  dashboard must never silently show two different Retail Mix numbers.
// ---------------------------------------------------------------------------

import { buildRetailMixAudit, retailMixValidationErrors } from '../src/lib/retailMixAudit'

const rows = buildRetailMixAudit()
const errors = retailMixValidationErrors()

const verified = rows.filter((r) => r.status === 'verified').length
const missing = rows.filter((r) => r.status === 'missing').length

console.log(`Retail Mix audit: ${verified} verified · ${missing} no-source · ${errors.length} mismatch (of ${rows.length} companies)`)
for (const r of rows) {
  const mark = r.status === 'verified' ? '✓' : r.status === 'missing' ? '·' : '✗'
  const chart = r.chartPct == null ? 'n/a' : `${r.chartPct}%`
  const grid = r.gridPct == null ? 'n/a' : `${r.gridPct}%`
  console.log(`  ${mark} ${r.company.padEnd(16)} ${(r.fy ?? '—').padEnd(5)} chart ${chart.padStart(4)} · grid ${grid.padStart(4)}`)
}

if (errors.length) {
  console.error('\nRETAIL MIX VALIDATION FAILED:')
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log('\nAll surfaces consistent — chart, peer grid and Data Audit agree on Retail Mix.')
