// ---------------------------------------------------------------------------
//  Fetcher — Distribution channel mix per insurer (IRDAI NL-36 / NL-40).
//
//  The structured official source for channel-wise business is the
//  "BUSINESS ACQUISITION THROUGH DIFFERENT CHANNELS" form inside every
//  non-life / SAHI public disclosure: per-channel **No. of Policies** and
//  **Premium (Rs lakh)** across four column-groups (current quarter, current
//  up-to-period, and the prior-year pair). The form number changed over time
//  (NL-40 pre-2022, NL-36 since) and insurers order the column-groups
//  differently, so this parser:
//
//    1. Anchors on the CAPTION (not the form number): "business acquisition
//       through different channels" or Niva's "NL-36- BUSINESS -CHANNELS WISE".
//    2. Segments channel rows by label, tokenizing "-" as a printed zero so
//       columns never misalign.
//    3. Picks the CURRENT UP-TO-PERIOD column-group — the pair that dominates
//       the current-quarter pair (cumulative >= its own quarter, equality on a
//       Q1 form), which disambiguates the two known layouts
//       [Q, YTD, PY-Q, PY-YTD] and [Q, PY-Q, YTD, PY-YTD] without trusting
//       any one insurer's print order. The PREMIUM column (not policies)
//       feeds the mix — this is exactly the basis of Neha's workbook
//       (verified to the 4th decimal on Care FY19 + FY24).
//    4. Buckets channels the way the workbook does:
//         Banca   = Corporate Agents - Banks
//         Direct  = Officers/Employees + company-website online + direct-others
//         Others  = micro + CSC + IMF + POS(direct) + MISP + web aggregators
//                   + referral + other
//    5. Gates: bucket premium/policy sums must tie to the printed Total (A)
//       (±0.6%), and the implied avg premium per policy must be sane. A form
//       that fails any gate is SKIPPED with a warning — never guessed.
//
//  Output per (company, period): premium shares (%), per-channel premium
//  (INR cr), per-channel policies, avg premium per policy (INR '000) and the
//  agents-GWP / agents-policies pair the workbook's productivity block uses.
//  Periods are cumulative labels matching the Excel template: Q1FYxx / H1FYxx
//  / 9MFYxx / FYxx.
//
//  OFFLINE-FIRST: scans PDFs already staged under data/raw/companies/<id>/ by
//  the disclosure fetchers. A committed parse cache
//  (data/raw/distribution/nl36-parse-cache.json) keeps scheduled re-runs
//  cheap: only new/changed files are re-parsed (bump PARSER_VERSION after a
//  parser change to force a full re-read).
//
//  Conservative by design: a channel we cannot parse stays `null` (never 0),
//  and we only emit a row when every gate passes (the merge gate re-checks the
//  share sum via validateChannelMixSum).
// ---------------------------------------------------------------------------

import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { RAW_ROOT, appendLog, fileExists, nowIso, readSnapshot } from './util'
import { parsePdf } from './parsers'

const SOURCE_ID = 'distribution_extract'
const PARSER_NAME = 'ingest-distribution'
// Bump to invalidate the committed parse cache after a parser change.
const PARSER_VERSION = 9
const CACHE_FILE = resolve(RAW_ROOT, 'distribution', 'nl36-parse-cache.json')

// PDF filenames that are NOT financial disclosures — skip them outright.
const DENY_FILE =
  /AgentCode|AgentList|CitizenCharter|complain|Grievance|brochure|policy-?wording|prospectus|MGT-?7|kyc|nomination/i
// Filename candidates worth opening: the era-numbered business-acquisition
// forms, anything channel/acquisition-named, and the combined disclosure
// bundles (which carry every NL form in one PDF).
const CANDIDATE_FILE =
  /NL-?36|NL-?40|acquisition|channel|Public.?Disclosure|Disclosures|WebsitePublicDisclosures|Qtr/i

// ─── Form anchors ────────────────────────────────────────────────────────────

const CAPTIONS = [
  /business\s+acquisition\s+through\s+different\s+channels/gi,
  /business\s*-?\s*channels?\s*wise/gi, // Niva's caption variant
]

// ─── Channel-row labels (label regex → internal key) ────────────────────────
// Order matters only for overlap resolution; position in text drives row order.

interface LabelDef {
  key: string
  re: RegExp
}
const LABELS: LabelDef[] = [
  { key: 'agents', re: /Individual\s+agents?(?![A-Za-z])/gi },
  { key: 'banca', re: /Corporate\s+Agents?\s*[-–]?\s*Banks?(?![A-Za-z])/gi },
  { key: 'corp_others', re: /Corporate\s+Agents?\s*[-–]?\s*Others?(?![A-Za-z])/gi },
  { key: 'brokers', re: /Brokers?(?![A-Za-z])/gi },
  { key: 'micro', re: /Micro\s+Agents?(?![A-Za-z])/gi },
  { key: 'direct_hdr', re: /Direct\s+Business(?![A-Za-z])/gi },
  { key: 'officers', re: /Officers?\s*\/?\s*Employees(?![A-Za-z])/gi },
  { key: 'online', re: /Online\s*\(?\s*Through\s+Company\s*\)?/gi },
  { key: 'csc', re: /Common\s+Service\s+Cent(?:re|er)s?/gi },
  { key: 'imf', re: /Insurance\s+Marketing\s+Firms?(?![A-Za-z])/gi },
  { key: 'pos', re: /Point\s+of\s+sales?\s+persons?(?![A-Za-z])/gi },
  { key: 'misp', re: /MISP(?![A-Za-z])/gi },
  { key: 'webagg', re: /Web\s+Aggregators?(?![A-Za-z])/gi },
  { key: 'referral', re: /Referral\s+Arrangements?(?![A-Za-z])/gi },
  // "13 Other (to be specified)" — tolerate the typo'd "sepcified" print, a
  // bare ordinal-anchored "Other" (blank-cell rows), and digit-glued "Others".
  { key: 'other_row', re: /\bOther\s*\(to\s+be\s+s?[ep]+cified\)|\d\s*Others?\s*(?=[\d\-–(])|\d\s*Other\b/gi },
  { key: 'total_a', re: /Total\s*\(\s*A\s*\)/gi },
  { key: 'outside_india', re: /Business\s+outside\s+India/gi },
  { key: 'grand_total', re: /Grand\s+Total/gi },
]
// "-Others" sub-row of Direct Business has no distinctive caption; it is the
// dash-led "Others" appearing BETWEEN the online sub-row and the next numbered
// channel. We capture it positionally below.
const DIRECT_OTHERS_RE = /[-–]\s*Others?(?![A-Za-z])/g

// Workbook bucket → which internal keys it sums.
const BUCKETS: Record<string, string[]> = {
  banca: ['banca'],
  brokers: ['brokers'],
  agents: ['agents'],
  corp_others: ['corp_others'],
  direct: ['direct_hdr', 'officers', 'online', 'direct_others'],
  others: ['micro', 'csc', 'imf', 'pos', 'misp', 'webagg', 'referral', 'other_row'],
}
const BUCKET_LABELS: Record<string, string> = {
  banca: 'Bancassurance',
  brokers: 'Brokers',
  agents: 'Individual Agents',
  corp_others: 'Corporate Agents - Others',
  direct: 'Direct',
  others: 'Others',
}

// ─── Numeric tokenizing ──────────────────────────────────────────────────────

/** All numeric tokens in a segment; a lone "-"/"–" is a printed zero. Indian
 *  digit grouping (1,23,456.78) and parenthesized negatives are handled. */
export function tokens(seg: string): number[] {
  const out: number[] = []
  // A standalone dash is a printed zero; a dash GLUED to a digit is a minus
  // sign (parens negatives are also handled). "-   1" is zero-then-one.
  const re = /-?\(?\d[\d,]*(?:\.\d+)?\)?%?|[-–](?!\d)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(seg))) {
    const t = m[0]
    if (t === '-' || t === '–') {
      out.push(0)
      continue
    }
    if (t.endsWith('%')) continue // a ratio footnote, not a table value
    const neg = t.startsWith('(') && t.endsWith(')')
    const n = parseFloat(t.replace(/[(),]/g, ''))
    if (Number.isFinite(n)) out.push(neg ? -n : n)
  }
  return out
}

// ─── Period inference ────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Latest date mentioned in the form window ("DATE : 31st March, 2024",
 *  "For the Quarter ended September 30, 2021", …) = the period end. */
function periodEnd(win: string): { y: number; m: number } | null {
  let best: { y: number; m: number } | null = null
  const push = (y: number, m: number) => {
    if (!y || !m || y < 2005 || y > 2100) return
    if (!best || y > best.y || (y === best.y && m > best.m)) best = { y, m }
  }
  // "31st March, 2024" / "March 31, 2024"
  const re1 = /(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,\s]+(\d{4})/g
  const re2 = /([A-Za-z]{3,9})\s+(\d{1,2})\s*(?:st|nd|rd|th)?\s*,\s*(\d{4})/g
  let m: RegExpExecArray | null
  while ((m = re1.exec(win))) push(parseInt(m[3], 10), MONTHS[m[2].toLowerCase().slice(0, 3)] ?? 0)
  while ((m = re2.exec(win))) push(parseInt(m[3], 10), MONTHS[m[1].toLowerCase().slice(0, 3)] ?? 0)
  return best
}

/** Quarter-end month → the template's cumulative period label. */
function periodLabel(y: number, m: number): { period: string; fiscal_year: string } | null {
  const fyEnd = m >= 4 ? y + 1 : y
  const fy = `FY${String(fyEnd % 100).padStart(2, '0')}`
  if (m === 6) return { period: `Q1${fy}`, fiscal_year: fy }
  if (m === 9) return { period: `H1${fy}`, fiscal_year: fy }
  if (m === 12) return { period: `9M${fy}`, fiscal_year: fy }
  if (m === 3) return { period: fy, fiscal_year: fy }
  return null
}

// ─── Table extraction ────────────────────────────────────────────────────────

export interface ParsedForm {
  period: string
  fiscal_year: string
  period_type: 'annual' | 'cumulative'
  /** Per workbook bucket: premium (Rs lakh) and policy count, up-to-period. */
  premium: Record<string, number>
  policies: Record<string, number>
  total_premium: number
  total_policies: number
}

interface RowHit {
  key: string
  at: number
  end: number
}

/** Locate channel-row labels in the window, in print order. */
export function findRows(win: string): RowHit[] {
  const hits: RowHit[] = []
  for (const def of LABELS) {
    def.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = def.re.exec(win))) hits.push({ key: def.key, at: m.index, end: m.index + m[0].length })
  }
  hits.sort((a, b) => a.at - b.at || b.end - a.end)
  // Resolve overlaps (e.g. "Corporate Agents-Banks" also matching "Banks?"
  // variants, "Grand Total" containing "Total (A)" never overlaps; keep the
  // earliest-starting, longest match and drop anything inside it).
  const kept: RowHit[] = []
  for (const h of hits) {
    const last = kept[kept.length - 1]
    if (last && h.at < last.end) continue
    kept.push(h)
  }
  // The dash-led "-Others" sub-row between the online sub-row and the next
  // labelled row belongs to Direct Business.
  const online = kept.find((k) => k.key === 'online')
  if (online) {
    const next = kept.find((k) => k.at > online.end)
    DIRECT_OTHERS_RE.lastIndex = online.end
    const m = DIRECT_OTHERS_RE.exec(win)
    if (m && (!next || m.index < next.at)) {
      kept.push({ key: 'direct_others', at: m.index, end: m.index + m[0].length })
      kept.sort((a, b) => a.at - b.at)
    }
  }
  return kept
}

/** A row label is printed with its serial number ("7Common Service…") and
 *  sub-rows with a dash prefix ("-Officers/Employees"). Both sit BETWEEN the
 *  previous row's numbers and this label, so the previous segment must end
 *  before them — walk the boundary back over one standalone ordinal or dash. */
// Sub-row labels printed with a leading dash ("-Officers/Employees"). Only
// before these may the boundary walk back over a dash — for every other label
// a preceding standalone dash is the PREVIOUS row's printed zero, not a prefix.
const DASH_PREFIXED = new Set(['officers', 'online'])

function segmentCut(win: string, at: number, nextKey: string): number {
  let j = at
  while (j > 0 && /\s/.test(win[j - 1])) j--
  if (DASH_PREFIXED.has(nextKey)) {
    if (j > 0 && /[-–]/.test(win[j - 1]) && (j - 1 === 0 || /\s/.test(win[j - 2]))) return j - 1
    return at
  }
  let k = j
  let d = 0
  while (k > 0 && /\d/.test(win[k - 1]) && d < 2) {
    k--
    d++
  }
  if (d > 0 && (k === 0 || /\s/.test(win[k - 1]))) return k
  return at
}

/** Parse one form window into per-key numeric vectors. */
export function parseVectors(win: string): { vec: Record<string, number[]>; width: number } | null {
  const rows = findRows(win)
  const totalIdx = rows.findIndex((r) => r.key === 'total_a')
  if (totalIdx < 0) return null
  const usable = rows.slice(0, totalIdx + 1)
  const vec: Record<string, number[]> = {}
  for (let i = 0; i < usable.length; i++) {
    const end = i + 1 < rows.length ? segmentCut(win, rows[i + 1].at, rows[i + 1].key) : usable[i].end + 400
    const seg = win.slice(usable[i].end, Math.max(end, usable[i].end))
    // Strip footnote markers that ride on labels ("*", "**").
    vec[usable[i].key] = tokens(seg.replace(/\*+/g, ' '))
  }
  // Column count = the modal token-length of the CHANNEL rows (the totals row
  // is the last label, so its trailing segment can pick up stray numbers from
  // whatever follows the table — it is truncated to the channel width below).
  const counts = new Map<number, number>()
  for (const r of usable) {
    if (r.key === 'total_a') continue
    const n = vec[r.key].length
    if (n > 0) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  const width = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  if (width < 2 || width % 2 !== 0) return null
  // When the officers/online sub-rows carry the Direct Business numbers, the
  // header row is decoration — some bundles print a PARTIAL run of dashes on
  // it (5 of 8 columns), so discard it rather than fail alignment. It only
  // counts as a data row in the old layout, where no sub-rows exist.
  if (vec.officers?.length === width || vec.online?.length === width) {
    if (vec.direct_hdr && vec.direct_hdr.some((v) => v !== 0)) return null
    vec.direct_hdr = []
  }
  // Channel rows must align; rows that are headers (e.g. "Direct Business" in
  // the modern layout) legitimately carry no numbers.
  for (const r of usable) {
    if (r.key === 'total_a') continue
    const v = vec[r.key]
    if (v.length !== width && v.length !== 0) return null
  }
  const total = vec.total_a
  if (!total || total.length < width) return null
  vec.total_a = total.slice(0, width)
  return { vec, width }
}

/** Element-wise a >= b with small tolerance (cumulative >= own quarter). */
function dominates(a: [number, number], b: [number, number]): boolean {
  return a[0] >= b[0] * 0.999 - 1e-9 && a[1] >= b[1] * 0.999 - 1e-9
}

/**
 * Choose the current up-to-period (policies, premium) column pair.
 * Pairs are (policies, premium) at indices 2k/2k+1. The current quarter is
 * pair 0 in every observed layout; its cumulative partner is pair 1 (modern
 * NL-36) or pair 2 (2019-era NL-40) — whichever dominates pair 0. Equality
 * (a Q1 form) also passes. Ambiguity → null (skip, never guess).
 */
function pickCumulative(total: number[]): number | null {
  const pair = (i: number): [number, number] => [total[2 * i], total[2 * i + 1]]
  const pairs = total.length / 2
  if (pairs === 1) return 0
  if (pairs === 2) return dominates(pair(1), pair(0)) ? 1 : null
  const cand: number[] = []
  for (const i of [1, 2]) if (i < pairs && dominates(pair(i), pair(0))) cand.push(i)
  if (cand.length === 1) return cand[0]
  if (cand.length === 2) {
    // Tie-break: the true partner of a Q1 form EQUALS pair 0 exactly.
    for (const i of cand) {
      const p = pair(i)
      const q = pair(0)
      if (Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6) return i
    }
  }
  return null
}

/** Parse every business-acquisition form in a PDF's text. */
export function extractForms(text: string): { forms: ParsedForm[]; issues: string[] } {
  const forms: ParsedForm[] = []
  const issues: string[] = []
  const anchors: number[] = []
  for (const re of CAPTIONS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) anchors.push(m.index)
  }
  anchors.sort((a, b) => a - b)
  for (const at of anchors) {
    if (anchors.some((b) => b < at && at - b < 200)) continue // same caption, twice-matched
    const win = text.slice(at, at + 6500)
    const dateWin = text.slice(Math.max(0, at - 800), at + 6500)

    const parsed = parseVectors(win)
    if (!parsed) {
      issues.push(`@${at}: table rows did not align — skipped`)
      continue
    }
    const { vec } = parsed
    const col = pickCumulative(vec.total_a)
    if (col === null) {
      issues.push(`@${at}: could not identify the up-to-period column unambiguously — skipped`)
      continue
    }
    const pol = (k: string): number | null => (vec[k] && vec[k].length ? vec[k][2 * col] : null)
    const prem = (k: string): number | null => (vec[k] && vec[k].length ? vec[k][2 * col + 1] : null)

    // Direct Business: the old layout prints numbers on the header row itself;
    // the modern layout zeroes the header and prints sub-rows.
    const sumKeys = (keys: string[], f: (k: string) => number | null): number =>
      keys.reduce((s, k) => s + (f(k) ?? 0), 0)

    const premium: Record<string, number> = {}
    const policies: Record<string, number> = {}
    for (const [bucket, keys] of Object.entries(BUCKETS)) {
      premium[bucket] = sumKeys(keys, prem)
      policies[bucket] = sumKeys(keys, pol)
    }
    const totalPrem = prem('total_a') ?? 0
    const totalPol = pol('total_a') ?? 0
    const sumPrem = Object.values(premium).reduce((s, v) => s + v, 0)
    const sumPol = Object.values(policies).reduce((s, v) => s + v, 0)
    if (totalPrem <= 0 || totalPol <= 0) {
      issues.push(`@${at}: empty Total (A) — skipped`)
      continue
    }
    if (Math.abs(sumPrem - totalPrem) / totalPrem > 0.006 || Math.abs(sumPol - totalPol) / totalPol > 0.006) {
      issues.push(`@${at}: bucket sums do not tie to Total (A) (premium ${sumPrem} vs ${totalPrem}; policies ${sumPol} vs ${totalPol}) — skipped`)
      continue
    }
    // Orientation sanity: avg premium per policy (Rs '000) must be plausible.
    const avgTotal = (totalPrem * 100) / totalPol
    if (!(avgTotal > 0.5 && avgTotal < 500)) {
      issues.push(`@${at}: implied avg premium ₹${avgTotal.toFixed(1)}k per policy is implausible (columns misread?) — skipped`)
      continue
    }
    const end = periodEnd(dateWin)
    if (!end) {
      issues.push(`@${at}: no period-end date found — skipped`)
      continue
    }
    const lbl = periodLabel(end.y, end.m)
    if (!lbl) {
      issues.push(`@${at}: period-end ${end.y}-${end.m} is not a quarter end — skipped`)
      continue
    }
    forms.push({
      period: lbl.period,
      fiscal_year: lbl.fiscal_year,
      period_type: lbl.period === lbl.fiscal_year ? 'annual' : 'cumulative',
      premium,
      policies,
      total_premium: totalPrem,
      total_policies: totalPol,
    })
  }
  return { forms, issues }
}

// ─── Parse cache ─────────────────────────────────────────────────────────────

interface CacheEntry {
  size: number
  version: number
  forms: ParsedForm[]
  issues?: string[]
}
interface CacheFile {
  _meta: { description: string; parser_version: number; updated_at: string }
  files: Record<string, CacheEntry>
}

async function loadCache(): Promise<CacheFile> {
  try {
    const raw = JSON.parse(await readFile(CACHE_FILE, 'utf8')) as CacheFile
    if (raw && raw.files) return raw
  } catch {
    /* fresh cache */
  }
  return {
    _meta: {
      description:
        'Parse cache for the NL-36/NL-40 business-acquisition scan (ingest-distribution). ' +
        'Keyed by repo-relative path; entries are reused while file size and parser version match.',
      parser_version: PARSER_VERSION,
      updated_at: nowIso(),
    },
    files: {},
  }
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

interface CompanyMaster {
  data: Array<{ company_id: string }>
}

const round = (v: number, dp: number): number => {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

export const ingestDistribution: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Distribution channel mix (IRDAI NL-36/NL-40 business acquisition)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const cache = await loadCache()
    let cacheDirty = false

    const records: SnapshotRecord[] = []
    const warnings: string[] = []
    // (company::period) → source file, for dedupe + cross-file consistency.
    const seen = new Map<string, { file: string; premiumShare: Record<string, number> }>()

    for (const c of master.data) {
      const dir = resolve(RAW_ROOT, 'companies', c.company_id)
      if (!(await fileExists(dir))) continue
      let pdfs: string[]
      try {
        pdfs = (await walkPdfs(dir)).filter((p) => {
          const name = p.split('/').pop() ?? p
          return !DENY_FILE.test(name) && CANDIDATE_FILE.test(name)
        })
      } catch {
        continue
      }
      if (pdfs.length === 0) continue
      pdfs.sort() // deterministic order

      for (const pdfPath of pdfs) {
        const rel = relative(RAW_ROOT, pdfPath)
        let size = 0
        try {
          size = (await stat(pdfPath)).size
        } catch {
          continue
        }
        let entry = cache.files[rel]
        if (!entry || entry.size !== size || entry.version !== PARSER_VERSION) {
          try {
            const buffer = await readFile(pdfPath)
            const { text } = await parsePdf(buffer)
            const { forms, issues } = extractForms(text)
            entry = { size, version: PARSER_VERSION, forms, ...(issues.length ? { issues } : {}) }
          } catch (err) {
            warnings.push(`${c.company_id} (${rel.split('/').pop()}): ${errMsg(err)}`)
            entry = { size, version: PARSER_VERSION, forms: [] }
          }
          cache.files[rel] = entry
          cacheDirty = true
        }

        for (const form of entry.forms) {
          const dedupeKey = `${c.company_id}::${form.period}`
          const share = (b: string): number => round((form.premium[b] / form.total_premium) * 100, 4)
          const shares: Record<string, number> = {}
          for (const b of Object.keys(BUCKETS)) shares[b] = share(b)
          const prior = seen.get(dedupeKey)
          if (prior) {
            const drift = Object.keys(shares).some((b) => Math.abs(shares[b] - prior.premiumShare[b]) > 0.2)
            if (drift) {
              warnings.push(
                `${c.company_id} ${form.period}: ${rel.split('/').pop()} disagrees with ${prior.file} on the channel mix — kept the first parse, flag for review.`,
              )
            }
            continue
          }
          seen.set(dedupeKey, { file: rel.split('/').pop() ?? rel, premiumShare: shares })

          const avg = (b: string): number | null =>
            form.policies[b] > 0 ? round((form.premium[b] * 100) / form.policies[b], 4) : null
          const largest = Object.entries(shares).sort((a, b) => b[1] - a[1])[0]

          records.push({
            target: 'distribution-channel-mix',
            keys: { company_id: c.company_id, period: form.period, fiscal_year: form.fiscal_year },
            values: {
              period_type: form.period_type,
              // Premium shares of Total (A), up-to-period column (%).
              banca_share: shares.banca,
              broker_share: shares.brokers,
              agent_share: shares.agents,
              corporate_agent_share: shares.corp_others,
              direct_share: shares.direct,
              online_share: null, // folded into direct_share (workbook basis)
              others_share: shares.others,
              total_share: round(Object.values(shares).reduce((s, v) => s + v, 0), 4),
              // Per-channel premium (INR cr) and policy counts.
              banca_premium_cr: round(form.premium.banca / 100, 2),
              broker_premium_cr: round(form.premium.brokers / 100, 2),
              agent_premium_cr: round(form.premium.agents / 100, 2),
              corporate_agent_premium_cr: round(form.premium.corp_others / 100, 2),
              direct_premium_cr: round(form.premium.direct / 100, 2),
              others_premium_cr: round(form.premium.others / 100, 2),
              total_premium_cr: round(form.total_premium / 100, 2),
              banca_policies: Math.round(form.policies.banca),
              broker_policies: Math.round(form.policies.brokers),
              agent_policies: Math.round(form.policies.agents),
              corporate_agent_policies: Math.round(form.policies.corp_others),
              direct_policies: Math.round(form.policies.direct),
              others_policies: Math.round(form.policies.others),
              total_policies: Math.round(form.total_policies),
              // Avg premium per policy (INR '000): premium ÷ policies.
              banca_avg_premium: avg('banca'),
              broker_avg_premium: avg('brokers'),
              agent_avg_premium: avg('agents'),
              corporate_agent_avg_premium: avg('corp_others'),
              direct_avg_premium: avg('direct'),
              others_avg_premium: avg('others'),
              total_avg_premium: round((form.total_premium * 100) / form.total_policies, 4),
              largest_channel: BUCKET_LABELS[largest[0]],
              basis_note:
                'Premium share of Total (A), up-to-period column of the IRDAI NL-36/NL-40 business-acquisition form. ' +
                'Direct includes officers/employees + company-website online + direct-others; Others = micro agents + CSC + IMF + POS + MISP + web aggregators + referral + other. Premium metrics (not profit).',
            },
            provenance: {
              source_name: `${c.company_id} IRDAI NL-36/NL-40 business acquisition — channel premium, up-to-period column (${form.period})`,
              source_url: `file://${pdfPath}`,
              source_file: pdfPath,
              source_period: form.period,
              fetched_at,
              parsed_at: nowIso(),
              parser_name: PARSER_NAME,
              confidence: 'high',
            },
          })
          await appendLog('ingest-distribution.log', {
            source: SOURCE_ID,
            company_id: c.company_id,
            status: 'parsed',
            file: rel.split('/').pop(),
            period: form.period,
            largest_channel: BUCKET_LABELS[largest[0]],
          })
        }
      }
    }

    if (cacheDirty) {
      cache._meta.parser_version = PARSER_VERSION
      cache._meta.updated_at = nowIso()
      await mkdir(resolve(RAW_ROOT, 'distribution'), { recursive: true })
      await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 1)}\n`)
    }

    await appendLog('ingest-distribution.log', {
      source: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      records: records.length,
    })

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

async function walkPdfs(dir: string, depth = 0): Promise<string[]> {
  if (depth > 2) return []
  const out: string[] = []
  const entries = await readdir(dir).catch(() => [] as string[])
  for (const name of entries) {
    const full = resolve(dir, name)
    let isDir = false
    try {
      isDir = (await stat(full)).isDirectory()
    } catch {
      continue
    }
    if (isDir) out.push(...(await walkPdfs(full, depth + 1)))
    else if (/\.pdf$/i.test(name)) out.push(full)
  }
  return out
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
