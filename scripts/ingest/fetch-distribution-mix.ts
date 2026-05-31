// ---------------------------------------------------------------------------
//  One-shot fetch: Niva Bupa distribution channel-mix from official filings.
//
//  The sandbox + web tools can't reach these PDFs (all 403), but GitHub-hosted
//  runners have open egress and reach the company / exchange sites. This script
//  fetches the filings, pulls the channel-mix text, and writes it to
//  data/raw/distribution/ — which the workflow commits, so the real per-year
//  percentages can be read straight from the repo and keyed in as sourced data
//  (no fabrication, no fragile auto-parse writing the dashboard directly).
// ---------------------------------------------------------------------------

import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fetchBuffer, parsePdf } from './parsers'

interface SourceRec {
  id: string
  url: string
  bytes?: number
  matchCount?: number
  matched?: string[]
  error?: string
}

// Official, allowed sources: company annual reports, the DRHP (exchange filing),
// and the investor presentation.
const SOURCES: { id: string; url: string }[] = [
  { id: 'niva-annual-report-FY24', url: 'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2023-24.pdf' },
  { id: 'niva-annual-report-FY25', url: 'https://nsearchives.nseindia.com/annual_reports/AR_27206_NIVABUPA_2024_2025_A_31072025210225.pdf' },
  { id: 'niva-DRHP', url: 'https://www.bseindia.com/corporates/download/383206/Niva%20Bupa%20Health%20Insurance%20Co%20Ltd%20DRHP_20240701153212.pdf' },
  { id: 'niva-investor-presentation-FY25', url: 'https://transactions.nivabupa.com/pages/doc/investor-relations/earning-presentation/2024-2025/Investors-Presentation-Q4-FY2025.pdf' },
]

// Lines that mention a distribution channel AND look quantitative.
const CHANNEL = /(bancassurance|banca|broker|individual agent|corporate agent|direct business|distribution|channel mix|sourcing|GDPI|gross written premium)/i
const QUANT = /%|per\s?cent|\b\d{1,2}\.\d\b/i

async function main(): Promise<void> {
  const out: { fetched_at: string; sources: SourceRec[] } = { fetched_at: new Date().toISOString(), sources: [] }
  for (const s of SOURCES) {
    const rec: SourceRec = { id: s.id, url: s.url }
    try {
      const { buffer } = await fetchBuffer(s.url)
      rec.bytes = buffer.length
      const { text } = await parsePdf(buffer)
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
      const hits: string[] = []
      lines.forEach((ln, i) => {
        if (CHANNEL.test(ln) && QUANT.test(`${ln} ${lines[i + 1] ?? ''}`)) {
          hits.push([lines[i - 1], ln, lines[i + 1]].filter(Boolean).join(' | ').slice(0, 400))
        }
      })
      rec.matchCount = hits.length
      rec.matched = hits.slice(0, 80)
    } catch (e) {
      rec.error = e instanceof Error ? e.message : String(e)
    }
    out.sources.push(rec)
  }
  const dir = resolve('data/raw/distribution')
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, 'niva-channel-mix-extract.json'), `${JSON.stringify(out, null, 2)}\n`)
  // eslint-disable-next-line no-console
  console.log('extract:', out.sources.map((x) => `${x.id}: ${x.error ? 'ERR ' + x.error.slice(0, 40) : (x.matchCount ?? 0) + ' hits'}`).join(' | '))
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exitCode = 1
})
