// ---------------------------------------------------------------------------
//  ppt-sweep — search every STAGED investor deck / annual report, page by
//  page, for the SAHIs-comparison cells that are still missing.
//
//  Per Neha (2026-06-11): "fill the sheets with all available data and try to
//  reach those sources in every possible way; if after searching all the PPTs
//  I couldn't find the data, tag it 'not found in ppt' and colour the cell
//  grey."
//
//  What it does (read-only — produces a REVIEW report, never auto-fills):
//   1. Loads the missing-cell worklist (entity × metric × period) produced by
//      `tsx scripts/ingest/audit-fill.ts` callers or passed as --worklist.
//   2. Scans the staged deck locations for PDFs (incl. .ashx and the agent's
//      UUID-named downloads), extracts text PER PAGE (pdf-parse pagerender),
//      and identifies each file's company by reading its first pages — a deck
//      in the wrong company's folder is re-attributed, never trusted blindly.
//   3. For every missing cell, searches that company's decks for the metric's
//      label synonyms and records {file, page, snippet} hits.
//   4. Writes data/processed/ppt-sweep-report.json:
//        hits     — candidate evidence for a human/agent to transcribe
//                   (page-level provenance ready for deck-sourced-values.json)
//        no_hits  — cells whose company decks were ALL searched with zero
//                   matches → candidates for the 'not found in ppt' grey tag
//      It never writes values into the pipeline by itself: transcription
//      stays a reviewed step (honesty rule — no auto-filled numbers from
//      flattened PDF tables).
//
//  Usage:
//    npx tsx scripts/ingest/ppt-sweep.ts                 # sweep + report
//    npx tsx scripts/ingest/ppt-sweep.ts --cells '<json>'  # explicit worklist
// ---------------------------------------------------------------------------

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { resolve, join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require_('pdf-parse') as (b: Buffer, o?: object) => Promise<{ text: string; numpages: number }>

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const OUT = resolve(REPO, 'data/processed/ppt-sweep-report.json')

// Staged deck locations. data/raw/companies/<id> is scanned only for files
// that look like decks/ARs (the 1,500+ NL-form PDFs are the statutory path).
const DECK_DIRS = [
  'data/agent-pulls/sahi-ppt-metrics/sources',
  'data/agent-pulls/sahi-financials/niva-bupa/sources',
  'data/agent-pulls/sahi-financials/star-health/sources',
  'data/agent-pulls/sahi-financials/care-health/sources',
  'data/agent-pulls/sahi-financials/aditya-birla/sources',
  'data/agent-pulls/sahi-financials/manipalcigna/sources',
  'data/agent-pulls/niva-h1fy26-deck',
  'data/agent-pulls/niva-fy25-financials',
]
const RAW_COMPANY_DIRS = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna']
const RAW_DECK_RE = /(presentation|investor|deck|annual[-_]?report|earnings)/i

// Company identification markers (searched in the first pages' text).
const COMPANY_MARKERS: Record<string, RegExp> = {
  'niva-bupa': /niva\s*bupa|max\s*bupa/i,
  'star-health': /star\s*health/i,
  'care-health': /care\s*health|religare/i,
  'aditya-birla': /aditya\s*birla/i,
  manipalcigna: /manipal\s*cigna|manipalcigna/i,
}

// Metric label synonyms (lower-case substring / regex search per page).
const METRIC_SYNONYMS: Record<string, RegExp[]> = {
  eom_igaap: [/expenses?\s+of\s+management/i, /\beom\b/i],
  expense_ratio_ifrs: [/expense\s+ratio/i],
  claims_ratio_ifrs: [/claims?\s+ratio/i, /loss\s+ratio/i],
  expense_ratio_igaap: [/expense\s+ratio/i, /opex\s+ratio/i],
  claims_ratio_igaap: [/claims?\s+ratio/i, /loss\s+ratio/i],
  combined_ratio_igaap: [/combined\s+ratio/i],
  pat_ifrs: [/profit\s+after\s+tax/i, /\bpat\b/i],
  pat_igaap: [/profit\s+after\s+tax/i, /\bpat\b/i],
  investment_aum: [/\baum\b/i, /assets?\s+under\s+management/i, /investment\s+(assets|book|portfolio)/i],
  investment_yield: [/investment\s+yield/i, /yield\s+on\s+(investments?|portfolio)/i, /\byield\b/i],
  nwp: [/net\s+written\s+premium/i, /\bnwp\b/i],
  nep: [/net\s+earned\s+premium/i, /\bnep\b/i],
  net_worth: [/net\s*worth/i],
  total_gwp: [/gross\s+written\s+premium/i, /\bgwp\b/i],
  group_other_gwp: [/group\s+(health\s+)?(gwp|premium|business)/i, /\bgroup\b.{0,30}\bgwp\b/i],
  solvency_ratio: [/solvency/i],
  gross_direct_premium: [/gross\s+direct\s+premium/i, /\bgdpi\b/i],
}
// IFRS cells additionally require an IFRS marker on the same page so an IGAAP
// table can't masquerade as the IFRS figure (basis discipline).
const NEEDS_IFRS_MARKER = new Set(['expense_ratio_ifrs', 'claims_ratio_ifrs', 'pat_ifrs'])
const IFRS_MARKER = /\bifrs\b|ind[\s-]?as/i

// Period tokens a page must ALSO carry for the hit to count for that cell.
// A Q1FY26 cell matches pages mentioning Q1 FY26 / June 2025 quarters etc.
function periodTokens(period: string): RegExp[] {
  const m = period.match(/^(Q1|Q2|Q3|Q4|H1|9M|FY)(FY)?(\d{2})$/)
  if (!m) return [new RegExp(period.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')]
  const yy = m[3]
  const prefix = m[1] === 'FY' ? 'FY' : m[1]
  const fyLong = `20${yy}`
  const fyShort = `${Number(yy) - 1}`.padStart(2, '0') // FY26 = 2025-26
  if (prefix === 'FY') {
    return [
      new RegExp(`fy\\s*'?${yy}`, 'i'),
      new RegExp(`fy\\s*20${yy}`, 'i'),
      new RegExp(`20${fyShort}\\s*[-–—/]\\s*(${yy}|${fyLong})`, 'i'),
    ]
  }
  return [
    new RegExp(`${prefix}\\s*[-' ]?\\s*fy\\s*'?${yy}`, 'i'),
    new RegExp(`${prefix}\\s*[-' ]?\\s*${fyLong}`, 'i'),
    new RegExp(`${prefix}'?${yy}`, 'i'),
  ]
}

interface DeckPage { page: number; text: string }
interface Deck { file: string; company: string | null; pages: DeckPage[]; numpages: number }
interface WorkCell { entity: string; metric: string; period: string; cell?: string }
interface Hit { file: string; page: number; snippet: string }

async function listFiles(): Promise<string[]> {
  const out: string[] = []
  for (const rel of DECK_DIRS) {
    const dir = resolve(REPO, rel)
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (name === 'manifest.json' || name.startsWith('cleaned') || name.endsWith('.json')) continue
      const p = join(dir, name)
      if ((await stat(p)).isFile()) out.push(p)
    }
  }
  for (const id of RAW_COMPANY_DIRS) {
    const dir = resolve(REPO, 'data/raw/companies', id)
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (!RAW_DECK_RE.test(name) || !/\.(pdf|ashx)$/i.test(name)) continue
      out.push(join(dir, name))
    }
  }
  return [...new Set(out)]
}

/** Extract text per page via pdf-parse's pagerender hook. */
async function extractPages(buffer: Buffer): Promise<{ pages: DeckPage[]; numpages: number }> {
  const pages: DeckPage[] = []
  const render = async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
    const tc = await pageData.getTextContent()
    const text = tc.items.map((i) => i.str).join(' ')
    pages.push({ page: pages.length + 1, text })
    return text
  }
  const res = await pdfParse(buffer, { pagerender: render })
  return { pages, numpages: res.numpages }
}

function identifyCompany(pages: DeckPage[], path: string): string | null {
  const head = pages.slice(0, 4).map((p) => p.text).join(' ')
  const counts: Array<[string, number]> = []
  for (const [id, re] of Object.entries(COMPANY_MARKERS)) {
    const all = pages.map((p) => (p.text.match(new RegExp(re.source, 'gi')) ?? []).length).reduce((a, b) => a + b, 0)
    counts.push([id, all])
  }
  counts.sort((a, b) => b[1] - a[1])
  const [bestId, bestN] = counts[0]
  const second = counts[1]?.[1] ?? 0
  // Strong, dominant marker → that company. A deck mentioning a peer in one
  // comparison slide still attributes correctly via dominance.
  if (bestN >= 3 && bestN >= second * 2) return bestId
  // Fall back to the head pages only.
  for (const [id, re] of Object.entries(COMPANY_MARKERS)) if (re.test(head)) return id
  void path
  return null
}

function snippetAround(text: string, re: RegExp, width = 220): string {
  const m = text.match(re)
  if (!m || m.index == null) return ''
  const start = Math.max(0, m.index - width / 2)
  return text.slice(start, m.index + (m[0]?.length ?? 0) + width / 2).replace(/\s+/g, ' ').trim()
}

async function main() {
  const cellsArg = process.argv.indexOf('--cells')
  let work: WorkCell[]
  if (cellsArg > -1) {
    work = JSON.parse(process.argv[cellsArg + 1])
  } else {
    // Default worklist: the SAHIs-comparison cells the audit marks 'missing'.
    const idx = JSON.parse(await readFile(resolve(REPO, 'src/data/snapshots/extracted-data-audit.json'), 'utf8'))
    const store: Record<string, { normalized_value?: unknown }> = idx.values ?? {}
    const sheet = (idx.sheets as Array<{ sheet: string; cells: Array<Record<string, unknown>> }>).find((s) => s.sheet === 'SAHIs comparison')
    work = []
    for (const c of sheet?.cells ?? []) {
      const entity = String(c.entity ?? '')
      const metric = String(c.metric ?? '')
      const period = String(c.period ?? '')
      if (!entity || !metric || !period) continue
      if (c.cell_kind === 'formula' || c.cell_kind === 'input_na') continue
      if ((c.source_status ?? '') === 'not_applicable') continue
      const k = `${entity}::${metric}::${period}`
      const v = store[k]
      if (v && v.normalized_value !== null && v.normalized_value !== undefined) continue
      if (!METRIC_SYNONYMS[metric]) continue
      work.push({ entity, metric, period, cell: String(c.cell ?? '') })
    }
  }
  console.log(`[ppt-sweep] worklist: ${work.length} missing cells`)

  const files = await listFiles()
  console.log(`[ppt-sweep] candidate documents: ${files.length}`)
  const decks: Deck[] = []
  for (const f of files) {
    try {
      const buf = await readFile(f)
      if (buf.length < 1024) continue
      if (!(buf.subarray(0, 5).toString('latin1') === '%PDF-')) continue
      const { pages, numpages } = await extractPages(buf)
      const company = identifyCompany(pages, f)
      decks.push({ file: f.replace(`${REPO}/`, ''), company, pages, numpages })
      console.log(`[ppt-sweep] ${basename(f)} → ${company ?? 'UNIDENTIFIED'} (${numpages}p)`)
    } catch (err) {
      console.log(`[ppt-sweep] unreadable (${basename(f)}): ${err instanceof Error ? err.message : err}`)
    }
  }

  const hits: Record<string, Hit[]> = {}
  const noHits: Record<string, { searched: string[] }> = {}
  for (const w of work) {
    const key = `${w.entity}::${w.metric}::${w.period}`
    const companyDecks = decks.filter((d) => d.company === w.entity)
    if (companyDecks.length === 0) { noHits[key] = { searched: [] }; continue }
    const syns = METRIC_SYNONYMS[w.metric] ?? []
    const perTokens = periodTokens(w.period)
    const found: Hit[] = []
    for (const d of companyDecks) {
      for (const p of d.pages) {
        const syn = syns.find((re) => re.test(p.text))
        if (!syn) continue
        if (NEEDS_IFRS_MARKER.has(w.metric) && !IFRS_MARKER.test(p.text)) continue
        if (!perTokens.some((re) => re.test(p.text))) continue
        found.push({ file: d.file, page: p.page, snippet: snippetAround(p.text, syn) })
      }
    }
    if (found.length > 0) hits[key] = found.slice(0, 6)
    else noHits[key] = { searched: companyDecks.map((d) => d.file) }
  }

  const report = {
    _meta: {
      artifact: 'ppt-sweep-report',
      generated_at: new Date().toISOString(),
      description:
        'Page-level search of every STAGED investor deck/AR for the missing SAHIs-comparison cells. ' +
        'hits = evidence to transcribe (reviewed step); no_hits = decks searched, metric+period not present ' +
        "(candidates for the 'not found in ppt' grey tag).",
      decks: decks.map((d) => ({ file: d.file, company: d.company, pages: d.numpages })),
    },
    hits,
    no_hits: noHits,
  }
  await writeFile(OUT, JSON.stringify(report, null, 1) + '\n', 'utf8')
  console.log(`[ppt-sweep] hits: ${Object.keys(hits).length} cells | no-hits: ${Object.keys(noHits).length} cells`)
  console.log(`[ppt-sweep] report → ${OUT.replace(`${REPO}/`, '')}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
