// ---------------------------------------------------------------------------
//  Fetcher — per-insurer ANNUAL HISTORY backfill (official company websites).
//
//  Why this exists
//  ---------------
//  ingest-company-disclosures.ts pulls the SINGLE latest fiscal year from each
//  insurer's most-recent filing. That is why only the focal company (Niva Bupa,
//  hand-extracted from its annual-report 5-year table) carries FY22–FY25 while
//  every peer carries only FY25. This fetcher backfills the *earlier* years for
//  every insurer, straight from each company's own annual report, so the
//  Premium Engine / Profitability trends read a full history instead of a single
//  point.
//
//  How it stays honest (no fabrication — see CLAUDE.md)
//  ---------------------------------------------------
//  Indian insurer annual reports carry an IRDAI-mandated multi-year disclosure
//  (the "Summary of Financial Statements" / "Financial Highlights" table) that
//  prints the last several years of GWP, NWP, NEP and PAT in one row each. The
//  hard part of reading those rows blindly is column order (which number is
//  which year?). We solve that WITHOUT guessing:
//
//    • We already trust each insurer's FY25 GWP (it is in the snapshot, sourced
//      and validated). We extract the multi-year GWP row, then ANCHOR it: the
//      column that should be FY25 must match the known FY25 GWP within a small
//      tolerance. The matching end tells us the orientation (most-recent-first
//      vs oldest-first); the rest of the row is then unambiguous.
//    • If neither end matches the FY25 anchor, the row was mis-read — we reject
//      the whole series for that company and emit NOTHING (the missing years
//      stay an honest "n/a", never a fabricated number).
//    • GWP must be strictly increasing toward FY25 (every insurer in this
//      universe grew FY22→FY25); a non-monotonic series signals a mis-parse and
//      is rejected.
//    • NWP / NEP / PAT are filled only when their own row aligns with the
//      validated GWP series (GWP ≥ NWP ≥ NEP per year, PAT within band). Any
//      metric that does not line up is left null for that year.
//
//  Only prior years (≤ FY24) are emitted — the live FY25 row is owned by
//  ingest-company-disclosures. The merge layer's never-overwrite rule, pin
//  guard and validation gate are the final safety net.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { appendLog, isOfflineMode, nowIso, readSnapshot } from './util'
import { fetchHtml, fetchOrLoadRaw, findLinks, parsePdf } from './parsers'

const SOURCE_ID = 'company_annual_history'

// Years we backfill. FY25 stays owned by ingest-company-disclosures; we only
// fill earlier rows so the two fetchers never contend for the same key. The
// latest annual report's multi-year table typically reaches ~FY21; FY20/FY19
// only appear in it when the report prints a longer (7-10yr) highlights table,
// and are otherwise sourced from older reports (see ARCHIVE_HINTS).
const BACKFILL_YEARS = ['FY24', 'FY23', 'FY22', 'FY21', 'FY20', 'FY19'] as const

interface CompanyMaster {
  data: Array<{
    company_id: string
    investor_relations_url: string | null
    financial_disclosure_url: string | null
    pdf_hints?: string[]
  }>
}

interface AnnualSnapshot {
  data: Array<{ company_id: string; fiscal_year: string; gwp?: number | null }>
}

// Multi-year row labels. Kept generous (reports phrase these differently) but
// anchored to the metric name. The trailing `(?![A-Za-z])` is a non-word-char
// lookahead — NOT `\b` — because IRDAI tables fuse the first number straight
// onto the label ("Gross Written Premium2,158,292"), where `\b` would fail.
const ROW_LABELS = {
  gwp: /(?:Gross\s+(?:Written|Direct)\s+Premium(?:\s+Income)?|Gross\s+Premium\s+Income|Gross\s+Premium)(?![A-Za-z])/gi,
  nwp: /(?:Net\s+Written\s+Premium|Net\s+Premium\s+Written|Net\s+Premium(?:\s+Income)?)(?![A-Za-z])/gi,
  nep: /(?:Net\s+Earned\s+Premium|Premium\s+Earned\s*\(Net\)|Earned\s+Premium\s*\(Net\))(?![A-Za-z])/gi,
}

// An insurer's GWP can be quoted on a slightly different basis year-to-year
// (GWP vs GDPI vs "Gross Premium"); allow a modest tolerance on the anchor.
const ANCHOR_TOLERANCE = 0.06

export const ingestCompanyAnnualHistory: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Per-insurer annual history backfill (official company annual reports)',
  frequency: 'annual',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const annual = await readSnapshot<AnnualSnapshot>('insurer-annual-snapshot.json')

    // Build the FY25 GWP anchor map. A company with no trusted FY25 GWP cannot
    // be anchored, so we skip it rather than risk an unverified backfill.
    const anchorGwp = new Map<string, number>()
    for (const r of annual.data) {
      if (r.fiscal_year === 'FY25' && typeof r.gwp === 'number' && r.gwp > 0) {
        anchorGwp.set(r.company_id, r.gwp)
      }
    }

    const records: SnapshotRecord[] = []
    const warnings: string[] = []
    let anyError = false

    for (const c of master.data) {
      const anchor = anchorGwp.get(c.company_id)
      if (anchor == null) {
        warnings.push(`${c.company_id}: no trusted FY25 GWP to anchor history — skipped.`)
        continue
      }
      try {
        const found = await resolveAnnualReport(c)
        if (!found) {
          warnings.push(`${c.company_id}: no annual-report PDF discovered for history backfill.`)
          continue
        }
        const { buffer, raw_file, sourceUrl } = found
        const { text } = await parsePdf(buffer)

        const series = extractAnchoredHistory(text, anchor)
        if (!series) {
          warnings.push(
            `${c.company_id}: multi-year table not anchor-validated against FY25 GWP ${anchor} — left as n/a (no guess).`,
          )
          continue
        }

        let emitted = 0
        for (let i = 0; i < series.years.length; i++) {
          const fy = series.years[i] // FY24, FY23, FY22 (FY25 is index -1, not emitted)
          if (!BACKFILL_YEARS.includes(fy as (typeof BACKFILL_YEARS)[number])) continue
          const values: Record<string, number | null> = {
            gwp: series.gwp[i] ?? null,
            nwp: series.nwp[i] ?? null,
            nep: series.nep[i] ?? null,
          }
          if (values.gwp == null) continue
          records.push({
            target: 'insurer-annual-snapshot',
            keys: { company_id: c.company_id, fiscal_year: fy },
            values,
            provenance: {
              source_name: `${c.company_id} ${fy} — multi-year financial summary, ${c.company_id} annual report (anchored to FY25 GWP)`,
              source_url: sourceUrl,
              source_file: raw_file,
              source_period: fy,
              fetched_at,
              parsed_at: nowIso(),
              parser_name: 'ingest-company-annual-history',
              confidence: 'high',
            },
          })
          emitted++
        }

        await appendLog('ingest-company-annual-history.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: emitted > 0 ? 'parsed' : 'no_prior_years',
          anchor,
          years: series.years,
          emitted,
        })
        if (emitted === 0) {
          warnings.push(`${c.company_id}: series anchored but no prior-year GWP within FY22–FY24 to emit.`)
        }
      } catch (err) {
        anyError = true
        const error = err instanceof Error ? err.message : String(err)
        warnings.push(`${c.company_id}: ${error}`)
        await appendLog('ingest-company-annual-history.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: 'error',
          error,
        })
      }
    }

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : anyError ? 'failed' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// ─── Annual-report discovery ─────────────────────────────────────────────────

const ANNUAL_REPORT = /annual[\s_-]*report|integrated[\s_-]*(annual[\s_-]*)?report/i
const DENY = /(mgt[\s_-]*7|grievance|policy[\s_-]*wording|prospectus|brochure|claim[\s_-]*form|kyc|advert|agent[\s_-]*code|charter|nomination|cookie|privacy|terms)/i

interface ResolvedReport {
  buffer: Buffer
  raw_file: string
  sourceUrl: string
}

/**
 * Resolve the insurer's most-recent annual-report PDF (the one carrying the
 * multi-year summary table). Prefers explicit pdf_hints, then walks the
 * disclosure/IR landing page for annual-report links. Offline runs replay the
 * most-recent staged PDF under data/raw/companies/<id>/.
 */
async function resolveAnnualReport(c: CompanyMaster['data'][number]): Promise<ResolvedReport | null> {
  const landing = c.financial_disclosure_url ?? c.investor_relations_url
  let pdfUrl: string | null = null

  if (!isOfflineMode()) {
    // 1. Explicit annual-report hints win.
    for (const hint of c.pdf_hints ?? []) {
      if (/\.pdf(\?|$)/i.test(hint) && ANNUAL_REPORT.test(hint) && !DENY.test(hint)) {
        pdfUrl = hint
        break
      }
    }
    // 2. Any pdf hint that is at least not denied.
    if (!pdfUrl) {
      for (const hint of c.pdf_hints ?? []) {
        if (/\.pdf(\?|$)/i.test(hint) && !DENY.test(hint)) {
          pdfUrl = hint
          break
        }
      }
    }
    // 3. Walk the landing page for annual-report PDFs (latest first).
    if (!pdfUrl && landing) {
      pdfUrl = await discoverAnnualReportPdf(landing).catch(() => null)
    }
    if (!pdfUrl) return null
  }

  const fallbackName = `${c.company_id}-${new Date().toISOString().slice(0, 10)}.pdf`
  const filename = pdfUrl ? `${c.company_id}-${(pdfUrl.split('/').pop() ?? fallbackName).split('?')[0]}` : fallbackName
  const { buffer, raw_file } = await fetchOrLoadRaw(
    pdfUrl ?? landing ?? '',
    `companies/${c.company_id}`,
    filename,
    /\.pdf$/i,
  )
  return { buffer, raw_file, sourceUrl: pdfUrl ?? landing ?? '' }
}

/** Find the latest annual-report PDF on a disclosure/IR page (one level deep). */
async function discoverAnnualReportPdf(url: string, depth = 0): Promise<string | null> {
  const $ = await fetchHtml(url)
  const pdfs = findLinks($, url, (href) => /\.pdf(\?|$)/i.test(href))
  const reports = pdfs.filter((h) => {
    const last = h.split('/').pop() ?? h
    return ANNUAL_REPORT.test(last) && !DENY.test(last)
  })
  if (reports.length) return reports.sort().reverse()[0]
  if (depth >= 1) return null
  // Recurse into "annual report" / "financials" sub-pages (bounded).
  const subs = findLinks($, url, (href, text) => {
    if (/\.(pdf|xlsx|xls|zip|jpg|png)(\?|$)/i.test(href)) return false
    return /(annual|financial|investor|report|disclosure)/i.test(`${href} ${text}`)
  })
    .filter((u) => safeHost(u) === safeHost(url))
    .slice(0, 4)
  for (const s of subs) {
    const found = await discoverAnnualReportPdf(s, depth + 1).catch(() => null)
    if (found) return found
  }
  return null
}

function safeHost(u: string): string | null {
  try {
    return new URL(u).hostname
  } catch {
    return null
  }
}

// ─── Multi-year series extraction (anchored) ─────────────────────────────────

interface History {
  /** FY labels for the prior columns, most-recent first: FY24, FY23, FY22… */
  years: string[]
  gwp: (number | null)[]
  nwp: (number | null)[]
  nep: (number | null)[]
}

// Native-unit → crore conversion factors tried during anchoring. Indian
// insurer reports quote figures in ₹ crore (factor 1) or ₹ lakh (factor 0.01);
// 0.1 / 10 are kept as long-shots so an unusual unit still has to MATCH the
// FY25 anchor to be accepted — it can never silently mis-scale.
const UNIT_SCALES = [1, 0.01, 0.1, 10] as const

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Extract a multi-year financial history from the report text and anchor it to
 * the known FY25 GWP. Returns the prior-year columns (most-recent first) or
 * null when no GWP row can be anchor-validated.
 */
export function extractAnchoredHistory(text: string, anchorFy25Gwp: number): History | null {
  const gwpFull = anchoredSeries(text, ROW_LABELS.gwp, anchorFy25Gwp)
  if (!gwpFull) return null
  const { values: gwpDesc, scale, reversed } = gwpFull
  // gwpDesc[0] is FY25 (the anchor); subsequent entries are FY24, FY23, FY22…
  const len = gwpDesc.length
  const years: string[] = []
  for (let i = 1; i < len; i++) years.push(`FY${25 - i}`)

  // Companion premiums (NWP, NEP). We can't anchor these to a known value, so
  // we accept a companion row ONLY when it is a clean premium series in its own
  // right — same length as GWP, positive, strictly decreasing backward, and
  // sitting under the metric above it in EVERY column (NWP ≤ GWP, NEP ≤ NWP).
  // A row that fails any column is dropped whole — never partially guessed.
  // (PAT is intentionally NOT backfilled here: it is non-monotonic and has no
  // anchor, so it can't be verified blind to the same standard.)
  const nwpRow = validatedCompanion(companionSeries(text, ROW_LABELS.nwp, len, scale, reversed), gwpDesc)
  const nepRow = validatedCompanion(companionSeries(text, ROW_LABELS.nep, len, scale, reversed), nwpRow ?? gwpDesc)

  const gwp: (number | null)[] = []
  const nwp: (number | null)[] = []
  const nep: (number | null)[] = []
  for (let i = 1; i < len; i++) {
    gwp.push(gwpDesc[i])
    nwp.push(nwpRow ? nwpRow[i] : null)
    nep.push(nepRow ? nepRow[i] : null)
  }
  return { years, gwp, nwp, nep }
}

/**
 * Accept a companion premium row only if it is a clean series under `ref`:
 * present, same length, all positive, ≤ the reference in every column, and
 * strictly decreasing backward (premiums grew, so they fall toward older
 * years). Otherwise return null — the row is most likely mis-aligned.
 */
function validatedCompanion(row: number[] | null, ref: number[]): number[] | null {
  if (!row || row.length !== ref.length) return null
  for (let i = 0; i < row.length; i++) {
    if (!(row[i] > 0) || row[i] > ref[i] * 1.02) return null
  }
  if (!isStrictlyDecreasing(row)) return null
  return row
}

interface AnchoredSeries {
  /** Oriented most-recent-first, converted to ₹ crore. Index 0 = FY25. */
  values: number[]
  /** Native-unit → crore factor that matched the anchor. */
  scale: number
  /** True when the source row was printed oldest-year-first and we reversed it. */
  reversed: boolean
}

/**
 * Read a labelled multi-year row and anchor it to the known FY25 value. Tries
 * both orientations and every unit scale; among all candidates that match the
 * anchor AND form a clean strictly-decreasing growth series, returns the one
 * whose FY25 figure is CLOSEST to the anchor. Picking the closest match is what
 * keeps the backfill on the SAME basis as the stored FY25 number (e.g. GWP vs a
 * slightly different "summary of financials" figure in the same report).
 */
function anchoredSeries(text: string, label: RegExp, anchor: number): AnchoredSeries | null {
  const candidates: Array<AnchoredSeries & { err: number }> = []
  for (const nums of rowNumberCandidates(text, label)) {
    if (nums.length < 2) continue
    for (const reversed of [false, true]) {
      const oriented = reversed ? [...nums].reverse() : nums
      for (const scale of UNIT_SCALES) {
        // Horizon FY25..FY19 at most (7 cols). A 5-year table fills to ~FY21;
        // a longer highlights table reaches FY20/FY19. Anchor + strict-decrease
        // + cliff guard keep the deeper tail honest (garbage is trimmed off).
        const scaled = oriented.slice(0, 7).map((v) => round2(v * scale))
        if (scaled.length < 2) continue
        const first = scaled[0]
        if (!within(first, anchor, ANCHOR_TOLERANCE)) continue
        if (!isStrictlyDecreasing(scaled)) continue
        // No implausible cliff: an insurer's premium never collapses ~99% in a
        // year, so a step below 40% of the prior year is a fused/garbage token
        // (e.g. a trailing "% change" column), not a real prior-year figure.
        // Trim the series there rather than trusting or discarding the whole row.
        const clean = trimAtCliff(scaled, 0.4)
        if (clean.length < 2) continue
        if (clean.some((v) => v <= 0 || v > 200000)) continue
        candidates.push({ values: clean, scale, reversed, err: Math.abs(first - anchor) })
      }
    }
  }
  if (candidates.length === 0) return null
  // Two-pass pick: among candidates that anchor TIGHTLY (same basis as the
  // stored FY25 — within ~1% of the closest match), prefer the LONGEST history.
  // This favours the 5-year financial-summary table over a 2-year "current vs
  // previous" comparative that happens to hit the anchor a hair more exactly.
  const minErr = Math.min(...candidates.map((c) => c.err))
  const band = Math.max(5, anchor * 0.01)
  const tight = candidates.filter((c) => c.err <= minErr + band)
  tight.sort((a, b) => b.values.length - a.values.length || a.err - b.err)
  const best = tight[0]
  return { values: best.values, scale: best.scale, reversed: best.reversed }
}

/**
 * Read a companion premium row (NWP/NEP), orient + unit-scale it to match the
 * anchored GWP series. Returns the full oriented row (length gwpLen, index 0 =
 * FY25) when a length-matching candidate exists, else null. The caller
 * (validatedCompanion) is the gate that decides whether to trust it.
 */
function companionSeries(
  text: string,
  label: RegExp,
  gwpLen: number,
  scale: number,
  reversed: boolean,
): number[] | null {
  for (const nums of rowNumberCandidates(text, label)) {
    let row: number[] | null = null
    if (nums.length === gwpLen) row = nums
    else if (nums.length === gwpLen + 1) row = nums.slice(0, gwpLen)
    if (!row) continue
    const oriented = reversed ? [...row].reverse() : row
    return oriented.map((v) => round2(v * scale))
  }
  return null
}

/**
 * For every occurrence of `label`, tokenize the numbers that follow it on the
 * same row (cut at the first newline, capped to a window). Yields candidate
 * number lists in document order so the caller can pick the best that anchors.
 */
function* rowNumberCandidates(text: string, label: RegExp, allowNegative = false): Generator<number[]> {
  label.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = label.exec(text)) !== null) {
    const start = m.index + m[0].length
    const nl = text.indexOf('\n', start)
    const end = nl >= 0 && nl - start < 200 ? nl : start + 160
    const window = text.slice(start, end)
    yield tokenizeNumbers(window, allowNegative)
  }
}

// Matches ONE number unit: international grouping (2,158,292), Indian grouping
// (21,58,292) or plain (4075) — each optionally wrapped in parens for negatives.
// Because each comma group is length-checked, the engine splits a run the PDF
// flattener fused together ("2,158,2922,063,000") back into separate numbers
// instead of swallowing it as one malformed token.
const NUMBER_UNIT =
  /\(?(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?|\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?)\)?/g

/**
 * Tokenize Indian / international formatted numbers from a string. Handles
 * comma grouping, decimals, parenthesised negatives ((82) → −82) and numbers
 * the PDF flattener fused together. Malformed tokens are dropped, so a fused
 * run that can't be cleanly split fails the anchor check rather than silently
 * producing a wrong value.
 */
export function tokenizeNumbers(s: string, allowNegative: boolean): number[] {
  const out: number[] = []
  NUMBER_UNIT.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUMBER_UNIT.exec(s)) !== null) {
    const tok = m[0]
    const neg = /^\(.*\)$/.test(tok)
    const bare = tok.replace(/[()]/g, '')
    if (!isWellFormedNumber(bare)) continue
    const n = parseFloat(bare.replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    if (n === 0) continue // table padding / placeholder
    const val = neg ? -n : n
    if (!allowNegative && val < 0) continue
    out.push(val)
  }
  return out
}

/** Indian / international grouping: the part after the last comma is 3 digits,
 *  earlier comma-groups are 2–3 digits. Rejects fused runs like "4,0732,810". */
export function isWellFormedNumber(bare: string): boolean {
  if (!bare.includes(',')) return /^\d+(?:\.\d+)?$/.test(bare)
  const intPart = bare.split('.')[0]
  const groups = intPart.split(',')
  const last = groups[groups.length - 1]
  if (last.length !== 3) return false
  if (groups[0].length < 1 || groups[0].length > 3) return false
  for (let i = 1; i < groups.length - 1; i++) {
    if (groups[i].length !== 2 && groups[i].length !== 3) return false
  }
  return true
}

function within(v: number, target: number, tol: number): boolean {
  return Math.abs(v - target) <= target * tol
}

function isStrictlyDecreasing(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) if (!(arr[i] < arr[i - 1])) return false
  return true
}

/** Keep the leading run while each step stays ≥ `floor`× the previous value;
 *  cut at the first implausible cliff (a sign of a fused/garbage token). */
function trimAtCliff(arr: number[], floor: number): number[] {
  const out = [arr[0]]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] >= arr[i - 1] * floor) out.push(arr[i])
    else break
  }
  return out
}
