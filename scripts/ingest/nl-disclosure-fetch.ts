// ---------------------------------------------------------------------------
//  nl-disclosure-fetch — AGENT-FREE deterministic NL / public-disclosure fetcher.
//
//  Goal (Neha, 2026-06-14): fetch the statutory line items with ZERO dependency
//  on the muns chat agent. For each insurer it:
//    1. discovers the period's public-disclosure / audited-financials PDFs from
//       the insurer's disclosures page (period-matched),
//    2. downloads them via the ScraperAPI proxy (bypasses the IRDAI/insurer WAF
//       that 403s a bare runner),
//    3. pdf-parse → text, and
//    4a. RECON mode (NL_RECON=1): prints the text around the key labels so the
//        extraction patterns can be written against the REAL layout, or
//    4b. extracts the line items + ratios → cleaned-<period>.json in the same
//        shape sahi-financials-clean emits, so audit-fill ingests it unchanged.
//
//  Usage (env): FETCH_COMPANY_ID=star-health FETCH_PERIOD=FY25 [NL_RECON=1] \
//                 npx tsx scripts/ingest/nl-disclosure-fetch.ts
//  Leave FETCH_COMPANY_ID empty to sweep all five SAHIs.
// ---------------------------------------------------------------------------

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePdf } from './parsers'
import { extractDisclosure } from './disclosure-extract'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

const COMPANY_ID = (process.env.FETCH_COMPANY_ID || '').trim()
const PERIOD = (process.env.FETCH_PERIOD || 'FY25').trim()
const RECON = process.env.NL_RECON === '1'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const DOWNLOAD_TIMEOUT_MS = 90_000
const RELAYS = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
]

// Canonical public-disclosures page per insurer (mirrors company-master).
const DISCLOSURE_DOCS: Record<string, string> = {
  'niva-bupa': 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
  'star-health': 'https://www.starhealth.in/investors/financial-information/',
  'care-health': 'https://cms.careinsurance.com/cms/public/public_disclosure',
  'aditya-birla': 'https://www.adityabirlacapital.com/healthinsurance/about-us/financials',
  manipalcigna: 'https://www.manipalcigna.com/disclosures/financial-disclosures',
}
const NAMES: Record<string, string> = {
  'niva-bupa': 'Niva Bupa', 'star-health': 'Star Health', 'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla Health', manipalcigna: 'ManipalCigna',
}

// --- period helpers (mirror sahi-financials-agent) ---------------------------
function fyYear(period: string): number {
  const fm = period.match(/FY\s*'?(\d{2,4})/i)
  if (fm) return Number(fm[1]) % 100
  const n = period.match(/\d+/)
  return n ? Number(n[0]) % 100 : 0
}
function periodTokens(period: string): { year: string[]; hint: string[] } {
  const yy = fyYear(period)
  const fyFull = 2000 + yy
  const prev = fyFull - 1
  const y2 = String(yy).padStart(2, '0')
  const p2 = String(prev % 100).padStart(2, '0')
  const year = [`fy${y2}`, `fy${fyFull}`, `${prev}-${y2}`, `${prev}-${fyFull}`, `${prev}_${y2}`, `${p2}-${y2}`, `${p2}_${y2}`]
  const tag = (/(Q[1-4]|H1|9M|FY)/i.exec(period) || [, 'FY'])[1]!.toUpperCase()
  const hints: Record<string, string[]> = {
    Q1: ['q1', 'jun'], H1: ['h1', 'sep'], Q2: ['h1', 'sep'],
    '9M': ['9m', 'dec'], Q3: ['9m', 'dec'], Q4: ['q4', 'mar', 'annual', 'audited'], FY: ['annual', 'mar', 'q4', 'audited'],
  }
  return { year: year.map((t) => t.toLowerCase()), hint: (hints[tag] || []).map((t) => t.toLowerCase()) }
}

// --- fetch helpers (ScraperAPI proxy first) ----------------------------------
function relayTemplates(): string[] {
  const key = (process.env.SCRAPERAPI_KEY || '').trim()
  const custom = (process.env.INGEST_FETCH_PROXY || '').trim()
  const t: string[] = []
  if (key) t.push(`https://api.scraperapi.com/?api_key=${key}&url={url}`)
  if (custom && (custom.includes('{url}') || custom.includes('{raw}'))) t.push(custom)
  return t.length ? t : [...RELAYS]
}
async function fetchOnce(target: string): Promise<Buffer | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' }, signal: ctrl.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch { return null } finally { clearTimeout(timer) }
}
function looksLikePdf(buf: Buffer): boolean {
  return buf.length > 1000 && buf.slice(0, 5).toString('latin1') === '%PDF-'
}
async function downloadPdf(url: string): Promise<Buffer | null> {
  const direct = await fetchOnce(url)
  if (direct && looksLikePdf(direct)) return direct
  const enc = encodeURIComponent(url)
  for (const tmpl of relayTemplates()) {
    const buf = await fetchOnce(tmpl.replace('{url}', enc).replace('{raw}', url))
    if (buf && looksLikePdf(buf)) return buf
  }
  return null
}
async function fetchPageHtml(url: string): Promise<string | null> {
  const looksHtml = (b: Buffer) => b.length > 200 && /<a\s|<html|<!doctype/i.test(b.slice(0, 4000).toString('latin1'))
  const direct = await fetchOnce(url)
  if (direct && looksHtml(direct)) return direct.toString('utf8')
  const enc = encodeURIComponent(url)
  for (const tmpl of relayTemplates()) {
    const buf = await fetchOnce(tmpl.replace('{url}', enc).replace('{raw}', url))
    if (buf && looksHtml(buf)) return buf.toString('utf8')
  }
  return null
}
async function discoverDocs(companyId: string, period: string): Promise<string[]> {
  const pageUrl = DISCLOSURE_DOCS[companyId]
  if (!pageUrl) return []
  let html: string | null = null
  try { html = await fetchPageHtml(pageUrl) } catch { html = null }
  if (!html) return []
  let base: URL; try { base = new URL(pageUrl) } catch { return [] }
  const cand = new Set<string>()
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+\.(?:pdf|ashx)(?:\?[^"']*)?)["']/gi)) {
    try { cand.add(new URL(m[1], base).href) } catch { /* skip */ }
  }
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]+?\.(?:pdf|ashx)(?:\?[^\s"'<>)]*)?/gi)) cand.add(m[0])
  if (RECON) {
    console.log(`  [recon] ${cand.size} candidate PDF link(s) on the page:`)
    ;[...cand].slice(0, 50).forEach((u) => console.log(`      ${u}`))
  }
  const { year, hint } = periodTokens(period)
  // Separator-agnostic match: "FSQ_4_FY_2025" / "FY 2024-25" / "fy2025" all
  // collapse to alphanumerics so the period tokens hit regardless of _ - space.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const ny = year.map(norm)
  const nh = hint.map(norm)
  return [...cand]
    .map((u) => {
      const s = norm(u)
      const raw = u.toLowerCase()
      const yh = ny.some((t) => s.includes(t))
      const hh = nh.some((t) => s.includes(t))
      // Prefer machine-generated results/disclosure forms (text) over audited
      // financials / annual reports (Star scans those — no text layer).
      const resultish = /\b(fsq|frq|fr|fs|financial.?result|public.?disclos|nl[-_ ]?\d|quarterly)/.test(raw)
      const scanrisk = /audited|annual.?report|\bar[_ ]/.test(raw)
      return { u, ok: yh, score: (yh ? 3 : 0) + (hh ? 2 : 0) + (resultish ? 2 : 0) - (scanrisk ? 1 : 0) }
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.u)
}

// --- recon: show the text around the figures we need -------------------------
const RECON_LABELS = [
  'Gross Direct Premium', 'Gross Written Premium', 'Premium earned', 'Net Premium', 'Net Written Premium',
  'Net Earned Premium', 'Premium Earned (Net)', 'Profit After Tax', 'Profit / (Loss)', 'Profit before tax',
  'Net worth', 'Reserves and Surplus', 'Share Capital', 'Investments', 'Total Assets',
  'Combined Ratio', 'Solvency', 'Expenses of Management', 'Commission',
]
function dumpRecon(text: string): void {
  console.log(`    --- text ${text.length} chars ---`)
  if (text.length > 400) {
    // First ~1400 chars reveals the real layout for a text-based form.
    console.log('    SAMPLE>>> ' + text.slice(0, 1400).replace(/\s+/g, ' ').trim())
  }
  let hits = 0
  for (const lab of RECON_LABELS) {
    const m = text.search(new RegExp(lab.replace(/[()/]/g, '.'), 'i'))
    if (m >= 0) { console.log(`    [${lab}] …${text.slice(m, m + 170).replace(/\s+/g, ' ').trim()}…`); hits++ }
  }
  console.log(`    --- ${hits}/${RECON_LABELS.length} labels present ---`)
}

// --- cleaned-row emit (matches sahi-financials-clean schema) ------------------
interface CleanRow {
  company: string; year: string; metric: string; value: number; unit: string
  source_name: string; source_url: string | null; source_page: string | null
  confidence: string; priority: number; note: string
}
function row(company: string, year: string, metric: string, value: number, unit: string, url: string): CleanRow {
  return {
    company, year, metric, value, unit,
    source_name: `${NAMES[company] || company} IRDAI public disclosure / audited financials ${year}`,
    source_url: url, source_page: null, confidence: 'high', priority: 1,
    note: `Statutory figure parsed directly from the insurer's public-disclosure / audited-financials PDF (agent-free NL fetch).`,
  }
}

async function processCompany(companyId: string): Promise<number> {
  const docs = await discoverDocs(companyId, PERIOD)
  console.log(`${companyId} ${PERIOD}: discovered ${docs.length} doc(s)`) // eslint-disable-line no-console
  docs.forEach((u) => console.log(`  • ${u}`))
  const rows: CleanRow[] = []
  for (const url of docs) {
    const buf = await downloadPdf(url)
    if (!buf) { console.log(`  download failed (WAF/relay): ${basename(url)}`); continue }
    let text = ''
    try { text = (await parsePdf(buf)).text } catch { console.log(`  pdf-parse failed: ${basename(url)}`); continue }
    console.log(`  ${basename(url)} → ${buf.length}B pdf, ${text.length} chars text`)
    if (RECON) { dumpRecon(text); continue }
    // Ratios via the validated NL-form extractor (quarterly "**" layout).
    const r = extractDisclosure(text)
    if (r) {
      for (const [k, key] of [['combined_ratio', 'combined_ratio_igaap'], ['claims_ratio', 'claims_ratio_igaap'], ['commission_ratio', 'commission_ratio_igaap'], ['expense_ratio', 'expense_ratio_igaap'], ['solvency_ratio', 'solvency_ratio']] as const) {
        const v = r[k]
        if (v != null) rows.push(row(companyId, PERIOD, key, v, key === 'solvency_ratio' ? 'x' : '%', url))
      }
    }
    // NOTE: premium / PAT / net-worth line-item patterns are added after the
    // RECON pass reveals the audited-financials layout (next iteration).
  }
  if (!RECON && rows.length) {
    const dir = resolve(REPO_ROOT, 'data/agent-pulls/nl-disclosures', companyId)
    await mkdir(dir, { recursive: true })
    const out = resolve(dir, `cleaned-${PERIOD.replace(/[^A-Za-z0-9]+/g, '-')}.json`)
    await writeFile(out, JSON.stringify(rows, null, 2) + '\n', 'utf8')
    console.log(`  wrote ${rows.length} value(s) → ${out}`)
  }
  return rows.length
}

async function main(): Promise<number> {
  const companies = COMPANY_ID ? [COMPANY_ID] : Object.keys(DISCLOSURE_DOCS)
  if (COMPANY_ID && !DISCLOSURE_DOCS[COMPANY_ID]) {
    console.error(`unknown FETCH_COMPANY_ID '${COMPANY_ID}' (expected one of: ${Object.keys(DISCLOSURE_DOCS).join(', ')})`)
    return 1
  }
  console.log(`nl-disclosure-fetch — ${RECON ? 'RECON' : 'EXTRACT'} mode — ${companies.join(', ')} ${PERIOD}`)
  for (const cid of companies) {
    try { await processCompany(cid) } catch (e) { console.error(`  ${cid} failed: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return 0
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1) })
