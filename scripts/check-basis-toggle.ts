// ---------------------------------------------------------------------------
//  Peer-scorecard accounting-basis toggle guard (run: npm run check:basis).
//
//  The Peer Positioning scorecard's IGAAP ⇄ IFRS toggle must stay a true
//  like-for-like comparison and never fabricate a cross-basis number. This
//  fails the build if any of these break:
//
//    • The IFRS lens shows a Combined Ratio for a DIFFERENT fiscal year than the
//      dashboard's canonical annual (FY25-IGAAP vs FY26-IFRS would mislead).
//    • A company that does NOT publish IFRS shows anything but NA under IFRS
//      (no cross-basis fill — missing ≠ a borrowed number).
//    • A dual-basis SAHI (Niva / Star / Care) is missing its IFRS Combined Ratio
//      for the canonical year (the IFRS data went stale / incomplete).
//
//  Basis-neutral columns (premium, share, solvency, valuation) and ROE are out
//  of scope here — only Combined Ratio is dual-basis on the scorecard.
// ---------------------------------------------------------------------------

import { getScorecard, resolveCellSource } from '../src/lib/peerScorecard'
import { getLatestAnnualFyLabel } from '../src/lib/dataLayer'
import { hasBasisData } from '../src/data/accountingBasis'

const fy = getLatestAnnualFyLabel()
const igaap = getScorecard({ peerGroup: 'SAHI', highlightedCompany: 'niva-bupa' }, 'igaap')
const ifrs = getScorecard({ peerGroup: 'SAHI', highlightedCompany: 'niva-bupa' }, 'ifrs')

const errors: string[] = []
console.log(`Basis toggle guard — canonical annual FY = ${fy}\n`)
console.log('company          IGAAP-CR   IFRS-CR   IFRS-source-FY')

for (const row of igaap.rows) {
  const id = row.insurer.id
  const name = row.insurer.shortName
  const ig = row.cells.combinedRatio?.value ?? null
  const fr = ifrs.rows.find((r) => r.insurer.id === id)?.cells.combinedRatio?.value ?? null
  const frSrc = resolveCellSource(id, 'combinedRatio', 'ifrs')
  const frFy = frSrc?.period ?? '—'
  console.log(`${name.padEnd(16)} ${String(ig ?? 'NA').padStart(8)} ${String(fr ?? 'NA').padStart(9)}   ${String(frFy).padStart(6)}`)

  if (hasBasisData(id)) {
    if (ig == null) errors.push(`${name}: IGAAP Combined Ratio missing (reported value expected).`)
    if (fr == null) errors.push(`${name}: IFRS Combined Ratio missing for ${fy} — IFRS dataset is incomplete.`)
    else if (frFy !== fy) errors.push(`${name}: IFRS Combined Ratio is ${frFy} but the scorecard is on ${fy} — not a like-for-like basis comparison.`)
  } else {
    if (fr != null) errors.push(`${name}: shows an IFRS Combined Ratio (${fr}) but does not publish IFRS — must be NA, never a cross-basis fill.`)
  }
}

if (errors.length) {
  console.error('\nBASIS TOGGLE GUARD FAILED:')
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`\nPASS: IGAAP ⇄ IFRS toggle is like-for-like at ${fy}; non-filers are honest NA.`)
