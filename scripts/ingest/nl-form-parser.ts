// ---------------------------------------------------------------------------
//  Column-aware IRDAI NL-20 (Analytical Ratios) parser.   Chunks 2C-A + 2C-B.
//
//  IRDAI public-disclosure "FORM NL-20 - ANALYTICAL RATIOS SCHEDULE" prints a
//  fixed multi-column table. After pdf-parse flattens it, the column headers
//  appear in a stable order, each as "(For|Up to) the [Q]uarter ended <date>",
//  followed by the ratio rows. Two real-world layouts are handled:
//
//   * DECIMAL (2C-A, e.g. Care Health): space-separated decimals, solvency is an
//     in-table row.        "10 Combined Ratio  0.97  1.03  0.90  0.95"
//   * PERCENT/** (2C-B, e.g. Niva Bupa): "**"-tagged labels, percentages run
//     together separated only by "%", and solvency lives on a SEPARATE
//     "Solvency Margin Ratio (No. of times) <x>" line (point-in-time, "As at").
//                          "11Combined Ratio**101.30%103.47%101.81%104.73%"
//
//  Column order is always: current standalone, current YTD, prior standalone,
//  prior YTD. The whole point is to put each ratio in the RIGHT period by
//  reading the RIGHT column:
//   * a standalone-quarter cell <- the "For the [Q]uarter ended" column -> QnFY,
//   * a YTD cell                <- the "Up to the [Q]uarter ended" column, whose
//                                  period is H1/9M/FY for a Sep/Dec/Mar filing,
//   * a prior full-year cell    <- the prior "Up to ... 31 March" column,
//   * point-in-time solvency    <- DECIMAL: standalone==YTD in-table (validated);
//                                  PERCENT: the separate line, whose "As at" date
//                                  must match the NL-20 current quarter-end.
//
//  Safety (governing charter, "accuracy > coverage"): if the column headers
//  cannot be resolved, a row's cells don't line up with the column count, a
//  point-in-time value disagrees across its columns, or the table is the
//  SEGMENTAL NL-20 variant (metrics-as-columns, one period, e.g. some ICICI
//  filings), the value is BLOCKED (recorded with a reason) instead of guessed.
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

export type ColumnBasis = 'standalone_quarter' | 'year_to_date' | 'point_in_time'
export type ColumnKind =
  | 'current_standalone' | 'current_ytd' | 'prior_standalone' | 'prior_ytd'

export interface Nl20Column {
  kind: ColumnKind
  basis: 'standalone' | 'ytd'
  isCurrent: boolean
  header: string
  day: number; month: number; year: number
  endQuarter: 1 | 2 | 3 | 4
  fy: number            // Indian FY ending year (e.g. 2025 for FY25)
  periodEnd: string     // ISO yyyy-mm-dd
}

export interface Nl20Value {
  metric: string
  raw_value: number
  period: string        // QnFYyy | FYyy
  period_start: string  // ISO
  period_end: string    // ISO
  column_basis: ColumnBasis
  column_kind: ColumnKind
  column_header: string
  row_label: string
  row_cells: (number | null)[]
  is_point_in_time: boolean
}

export interface Nl20Block {
  metric: string
  reason: string
  detail: string
}

export interface Nl20Result {
  found: boolean
  values: Nl20Value[]
  blocked: Nl20Block[]
  columns: Nl20Column[]
  notes: string[]
}

interface RowSpec { metric: string; label: RegExp; pointInTime: boolean }
type Layout = 'decimal' | 'percent' | 'segmental'

// In-table rows that are unambiguous in the NL-20 layout and map to a statutory
// IGAAP cell. Net Commission (single line) is included; expense is excluded - the
// form prints two/three expense bases, so mapping to the cell is not certain.
// Solvency is an in-table row in the DECIMAL layout; in the PERCENT layout it is
// read from a separate point-in-time line (see extractSeparateSolvency).
const DEFAULT_ROWS: RowSpec[] = [
  { metric: 'claims_ratio', label: /Net Incurred Claims to Net Earned Premium/i, pointInTime: false },
  { metric: 'combined_ratio', label: /Combined Ratio/i, pointInTime: false },
  { metric: 'commission_ratio', label: /Net Commission Ratio/i, pointInTime: false },
  { metric: 'solvency_ratio', label: /Available Solvency margin Ratio to Required\s+Solvency Margin Ratio/i, pointInTime: true },
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`
const fyLabel = (fy: number) => `FY${pad2(fy % 100)}`
const quarterLabel = (q: number, fy: number) => `Q${q}FY${pad2(fy % 100)}`
/** YTD period label for a column whose quarter ends in endQuarter (Q1==std, Q2->H1, Q3->9M, Q4->FY). */
function ytdLabel(endQuarter: 1 | 2 | 3 | 4, fy: number): string {
  if (endQuarter === 1) return quarterLabel(1, fy)
  if (endQuarter === 2) return `H1FY${pad2(fy % 100)}`
  if (endQuarter === 3) return `9MFY${pad2(fy % 100)}`
  return fyLabel(fy)
}
const ytdStart = (fy: number) => iso(fy - 1, 4, 1)

function quarterOf(month: number): 1 | 2 | 3 | 4 {
  if (month >= 4 && month <= 6) return 1
  if (month >= 7 && month <= 9) return 2
  if (month >= 10 && month <= 12) return 3
  return 4
}
/** Indian FY ends 31 March: Apr-Dec belong to FY(year+1), Jan-Mar to FY(year). */
function fyOf(month: number, year: number): number {
  return month >= 4 ? year + 1 : year
}
function quarterStart(q: 1 | 2 | 3 | 4, fy: number): string {
  if (q === 1) return iso(fy - 1, 4, 1)
  if (q === 2) return iso(fy - 1, 7, 1)
  if (q === 3) return iso(fy - 1, 10, 1)
  return iso(fy, 1, 1)
}

/** Parse a header/as-at date in either "30th June, 2024" or "September 30, 2024" order. */
function parseDate(s: string): { day: number; month: number; year: number } | null {
  const t = s.trim()
  let m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/)  // day month year
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return { day: +m[1], month: mo, year: +m[3] } }
  m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/)      // month day year
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return { day: +m[2], month: mo, year: +m[3] } }
  return null
}
const DATE_RE = '(\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]+\\.?,?\\s+\\d{4}|[A-Za-z]+\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})'

/** Locate the NL-20 analytical-ratios schedule and return its whitespace-normalized text. */
function sliceNl20(text: string): string | null {
  const m = /FORM\s+NL[-\s]*20\b[\s\S]{0,80}?ANALYTICAL\s+RATIOS/i.exec(text)
  if (!m || m.index == null) return null
  const start = m.index
  const rest = text.slice(start + 40)
  const nxt = /FORM\s+NL[-\s]*\d+/i.exec(rest)
  const end = nxt ? start + 40 + nxt.index : Math.min(text.length, start + 6000)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

/**
 * Which NL-20 layout this section is:
 *  - 'segmental' : metrics-as-columns, per-segment Current/Previous rows, single
 *                  period (e.g. some ICICI filings) -> not a standalone/YTD grid.
 *  - 'percent'   : "**"-tagged labels, values printed as percentages.
 *  - 'decimal'   : space-separated decimals (Care Health).
 */
function detectLayout(section: string): Layout {
  if (/Segmental\s+Reporting/i.test(section) || /Total\s*-?\s*Current Period/i.test(section) ||
      (/\bCurrent Period\b/i.test(section) && /\bPrevious Period\b/i.test(section))) return 'segmental'
  if (/Combined Ratio\s*\*\*/i.test(section) || /\d(?:\.\d+)?\s*%/.test(section)) return 'percent'
  return 'decimal'
}

/** Parse the 2 or 4 column headers (std,ytd[,std,ytd]) in document order. Both date orders + "Up to"/"Upto"/"on". */
function parseColumns(section: string): Nl20Column[] | null {
  const headerWindow = section.split(/\b1\s*Gross Direct Premium Growth Rate/i)[0] || section.slice(0, 700)
  const re = new RegExp(`(For|Up\\s?to)\\s+the\\s+quarter\\s+ended\\s+(?:on\\s+)?${DATE_RE}`, 'gi')
  const cols: Nl20Column[] = []
  let mm: RegExpExecArray | null
  while ((mm = re.exec(headerWindow)) !== null) {
    const basis: 'standalone' | 'ytd' = /^For/i.test(mm[1]) ? 'standalone' : 'ytd'
    const d = parseDate(mm[2])
    if (!d) return null
    cols.push({
      kind: 'current_standalone', basis, isCurrent: true,
      header: mm[0].replace(/\s+/g, ' ').trim(),
      day: d.day, month: d.month, year: d.year,
      endQuarter: quarterOf(d.month), fy: fyOf(d.month, d.year), periodEnd: iso(d.year, d.month, d.day),
    })
  }
  if (cols.length !== 2 && cols.length !== 4) return null
  const order: ColumnKind[] = cols.length === 4
    ? ['current_standalone', 'current_ytd', 'prior_standalone', 'prior_ytd']
    : ['current_standalone', 'current_ytd']
  cols.forEach((c, i) => { c.kind = order[i]; c.isCurrent = i < 2 })
  // The form's invariant: col0 is the standalone quarter, col1 the YTD.
  if (cols[0].basis !== 'standalone' || cols[1].basis !== 'ytd') return null
  if (cols.length === 4 && (cols[2].basis !== 'standalone' || cols[3].basis !== 'ytd')) return null
  return cols
}

/**
 * Read the n numeric cells that follow a row label. DECIMAL cells are bare
 * decimals; PERCENT cells are "<x>%" run together. Paren = negative, NA = null,
 * short row = null (caller treats that as "absent", never a guess).
 */
function readRow(section: string, label: RegExp, n: number, layout: Layout): { label: string; cells: (number | null)[] } | null {
  const m = label.exec(section)
  if (!m || m.index == null) return null
  const after = section.slice(m.index + m[0].length, m.index + m[0].length + 260)
  const tok = layout === 'percent'
    ? /\((\d+(?:\.\d+)?)\)\s*%|(\d+(?:\.\d+)?)\s*%|\b(NA|N\.A\.)\b/gi
    : /\((\d+\.\d+)\)|(\d+\.\d+)|\b(NA|N\.A\.)\b/gi
  const cells: (number | null)[] = []
  let t: RegExpExecArray | null
  while ((t = tok.exec(after)) !== null && cells.length < n) {
    if (t[1] != null) cells.push(-parseFloat(t[1]))
    else if (t[2] != null) cells.push(parseFloat(t[2]))
    else cells.push(null)
  }
  if (cells.length < n) return null
  // PERCENT cells are reported as percentages (e.g. 101.30); normalizeValue
  // downstream divides by 100. DECIMAL cells are already fractions.
  return { label: m[0].replace(/\s+/g, ' ').trim(), cells }
}

/** Emit period-correct values for one in-table row, picking the right column per the cell-period policy. */
function emitRow(out: Nl20Result, spec: RowSpec, cols: Nl20Column[], label: string, cells: (number | null)[]): void {
  const push = (col: Nl20Column, period: string, periodStart: string, basis: ColumnBasis, value: number) => {
    out.values.push({
      metric: spec.metric, raw_value: value, period,
      period_start: periodStart, period_end: col.periodEnd,
      column_basis: basis, column_kind: col.kind, column_header: col.header,
      row_label: label, row_cells: cells, is_point_in_time: spec.pointInTime,
    })
  }
  const col0 = cols[0]                              // current standalone
  const col1 = cols[1]                              // current YTD
  const col2 = cols.length === 4 ? cols[2] : null   // prior standalone
  const col3 = cols.length === 4 ? cols[3] : null   // prior YTD
  const q0 = quarterLabel(col0.endQuarter, col0.fy)

  if (spec.pointInTime) {
    // Solvency is a balance-sheet snapshot: standalone == YTD by construction
    // (validated by the caller). The same value labels both the quarter and YTD.
    const cur = cells[0]
    if (cur != null) {
      push(col0, q0, quarterStart(col0.endQuarter, col0.fy), 'point_in_time', cur)
      const yl = ytdLabel(col0.endQuarter, col0.fy)
      if (yl !== q0) push(col1, yl, ytdStart(col0.fy), 'point_in_time', cur)
    }
    if (col3 && col3.endQuarter === 4 && cells[3] != null) push(col3, fyLabel(col3.fy), ytdStart(col3.fy), 'point_in_time', cells[3])
    return
  }

  // Flow ratios accumulate over the year.
  // col0: standalone quarter -> QnFY (always).
  if (cells[0] != null) push(col0, q0, quarterStart(col0.endQuarter, col0.fy), 'standalone_quarter', cells[0])
  // col1: YTD -> H1 / 9M / FY by the quarter it ends in (Q1 == standalone: skip dup).
  if (cells[1] != null) {
    const yl = ytdLabel(col1.endQuarter, col1.fy)
    if (yl !== q0) push(col1, yl, ytdStart(col1.fy), 'year_to_date', cells[1])
  }
  // col3: prior-year YTD -> prior full year ONLY at the year-end (31 March) filing.
  if (col3 && cells[3] != null && col3.endQuarter === 4) push(col3, fyLabel(col3.fy), ytdStart(col3.fy), 'year_to_date', cells[3])
  // col2 (prior standalone quarter) is recognised but not wired: it maps to no
  // current Excel cell and is better sourced from its own primary filing.
  if (col2) out.notes.push(`prior standalone column recognised but not wired for ${spec.metric} (${col2.header})`)
}

/**
 * PERCENT-layout solvency: the modern NL-form prints it on a separate
 * "Solvency Margin Ratio (No. of times) <x>" line, point-in-time as at the
 * quarter-end. The "As at <date>" of the solvency statement MUST match the
 * NL-20 current quarter-end, else the period basis is unconfirmed -> block.
 */
function extractSeparateSolvency(text: string, cols: Nl20Column[], out: Nl20Result): void {
  const cur = cols[0]
  const mv = /(?<!Required\s)Solvency Margin Ratio\s*\(No\.?\s*of\s*times\)\s*([\d]+(?:\.\d+)?)/i.exec(text)
  if (!mv) return  // no solvency line -> absent (not blocked)
  const v = parseFloat(mv[1])
  if (!(v > 0) || v > 10) {
    out.blocked.push({ metric: 'solvency_ratio', reason: 'solvency_out_of_range', detail: `solvency ${v} outside the plausible 0-10x band - withheld` })
    return
  }
  const md = new RegExp(`SOLVENCY MARGIN[\\s\\S]{0,200}?As at\\s+${DATE_RE}`, 'i').exec(text)
  const asat = md ? parseDate(md[1]) : null
  if (!asat || asat.month !== cur.month || asat.year !== cur.year) {
    out.blocked.push({
      metric: 'solvency_ratio', reason: 'solvency_period_unverified',
      detail: `solvency 'As at' date (${md ? md[1] : 'not found'}) does not confirm the NL-20 current quarter-end ${cur.periodEnd}; withheld`,
    })
    return
  }
  const q0 = quarterLabel(cur.endQuarter, cur.fy)
  const header = `Solvency Margin Ratio (No. of times) - As at ${md![1].replace(/\s+/g, ' ').trim()}`
  const mk = (period: string, periodStart: string, kind: ColumnKind) => out.values.push({
    metric: 'solvency_ratio', raw_value: v, period, period_start: periodStart, period_end: cur.periodEnd,
    column_basis: 'point_in_time', column_kind: kind, column_header: header,
    row_label: 'Solvency Margin Ratio (No. of times)', row_cells: [v], is_point_in_time: true,
  })
  mk(q0, quarterStart(cur.endQuarter, cur.fy), 'current_standalone')
  const yl = ytdLabel(cur.endQuarter, cur.fy)
  if (yl !== q0) mk(yl, ytdStart(cur.fy), 'current_ytd')
}

export function parseNl20(text: string, rows: RowSpec[] = DEFAULT_ROWS): Nl20Result {
  const out: Nl20Result = { found: false, values: [], blocked: [], columns: [], notes: [] }
  const section = sliceNl20(text)
  if (!section) return out
  out.found = true

  const layout = detectLayout(section)
  if (layout === 'segmental') {
    out.blocked.push({
      metric: '(table)', reason: 'segmental_nl20_layout',
      detail: 'NL-20 segmental variant (metrics-as-columns, per-segment Current/Previous rows, single reporting period); company-total ratios are not in a standalone/YTD column structure - withheld',
    })
    return out
  }

  const cols = parseColumns(section)
  if (!cols) {
    out.blocked.push({
      metric: '(table)', reason: 'column_alignment_unclear',
      detail: 'NL-20 header columns could not be resolved (need 2 or 4 "For/Up to the quarter ended <date>" headers, standalone before YTD)',
    })
    return out
  }
  out.columns = cols
  const n = cols.length

  for (const spec of rows) {
    // In the percent layout solvency is not an in-table row - it is read from the
    // separate point-in-time line below.
    if (layout === 'percent' && spec.pointInTime) continue
    const row = readRow(section, spec.label, n, layout)
    if (!row) continue  // row simply absent in this form -> missing, not blocked
    if (spec.pointInTime) {
      const c0 = row.cells[0], c1 = row.cells[1]
      if (c0 == null || c1 == null || Math.abs(c0 - c1) > 1e-9) {
        out.blocked.push({
          metric: spec.metric, reason: 'pit_column_mismatch',
          detail: `point-in-time value differs across the standalone/YTD columns (${c0} vs ${c1}); column alignment uncertain - value withheld`,
        })
        continue
      }
    }
    emitRow(out, spec, cols, row.label, row.cells)
  }
  if (layout === 'percent') extractSeparateSolvency(text, cols, out)
  return out
}

// ---------------------------------------------------------------------------
//  Chunk 2E - NL-1 Revenue Account (statutory) parser.
//
//  "FORM NL-1-B-RA  REVENUE ACCOUNT FOR THE PERIOD ENDED ON <date>" carries the
//  statutory net premium figures. Its header is the same column grid as NL-20,
//  but DOUBLED (e.g. 8 columns = the 4 periods printed twice: segment block +
//  total block, which are identical for a mono-line health insurer). Amounts are
//  in the unit stated by the "(Amount in Rs. Lakhs)" marker.
//
//  Scope (2E): extract ONLY "Premiums earned (Net)" -> NEP, which is the one
//  revenue-account line whose basis is unambiguous (net earned premium = the NEP
//  cell). GWP/GDPI (NL-4, segmented, GDPI!=GWP scope) and PAT (NL-2 P&L, blank in
//  these web disclosures) are NOT taken here - they are reported, held.
//
//  Safety: if the unit marker is missing -> unit_unclear; if the column count is
//  not 4 or 8, or a doubled (8-col) block's halves disagree, or the cell count
//  doesn't match the columns -> column alignment uncertain -> BLOCK, never guess.
// ---------------------------------------------------------------------------

export interface Nl1Value {
  metric: string
  raw_value: number          // amount AS PRINTED (e.g. lakhs)
  normalized_crore: number   // converted to INR crore
  unit_label: string         // e.g. "Rs. Lakhs"
  period: string
  period_start: string
  period_end: string
  column_basis: ColumnBasis
  column_kind: ColumnKind
  column_header: string
  row_label: string
  row_cells: number[]
}
export interface Nl1Result {
  found: boolean
  unit_label: string | null
  to_crore: number | null    // multiply printed amount by this to get crore
  values: Nl1Value[]
  blocked: Nl20Block[]
  notes: string[]
}

/** Stated-unit -> factor to convert a printed amount to INR crore. */
function unitToCrore(text: string): { label: string; factor: number } | null {
  if (/\(?\s*Amount\s+in\s+Rs\.?\s*Lakhs/i.test(text) || /Rs\.?\s*in\s*Lakhs|₹\s*in\s*Lakhs/i.test(text)) return { label: 'Rs. Lakhs', factor: 0.01 }
  if (/\(?\s*Amount\s+in\s+Rs\.?\s*Crore/i.test(text) || /Rs\.?\s*in\s*Crore|₹\s*in\s*Crore/i.test(text)) return { label: 'Rs. Crore', factor: 1 }
  if (/Rs\.?\s*in\s*(?:'?000|Thousands)|Amount\s+in\s+(?:Rs\.?\s*)?(?:'?000|Thousands)/i.test(text)) return { label: "Rs. '000", factor: 0.0001 }
  return null
}

/** Parse the revenue-account period columns (accepts 4, or 8 = a validated doubled block). */
function raColumns(section: string): Nl20Column[] | null {
  const headerWindow = section.split(/\b1\s*Premiums?\s+earned/i)[0] || section.slice(0, 900)
  const re = new RegExp(`(For|Up\\s?to)\\s+the\\s+quarter\\s+ended\\s+(?:on\\s+)?${DATE_RE}`, 'gi')
  const all: Nl20Column[] = []
  let mm: RegExpExecArray | null
  while ((mm = re.exec(headerWindow)) !== null) {
    const basis: 'standalone' | 'ytd' = /^For/i.test(mm[1]) ? 'standalone' : 'ytd'
    const d = parseDate(mm[2]); if (!d) return null
    all.push({
      kind: 'current_standalone', basis, isCurrent: true, header: mm[0].replace(/\s+/g, ' ').trim(),
      day: d.day, month: d.month, year: d.year, endQuarter: quarterOf(d.month), fy: fyOf(d.month, d.year), periodEnd: iso(d.year, d.month, d.day),
    })
  }
  if (all.length !== 4 && all.length !== 8) return null
  // For a doubled (8-col) block the second half must repeat the first (same period dates).
  if (all.length === 8) {
    for (let i = 0; i < 4; i++) if (all[i].periodEnd !== all[i + 4].periodEnd || all[i].basis !== all[i + 4].basis) return null
  }
  const cols = all.slice(0, 4)
  const order: ColumnKind[] = ['current_standalone', 'current_ytd', 'prior_standalone', 'prior_ytd']
  cols.forEach((c, i) => { c.kind = order[i]; c.isCurrent = i < 2 })
  if (cols[0].basis !== 'standalone' || cols[1].basis !== 'ytd') return null
  return cols
}

/** Indian-format integer amounts (e.g. "1,42,205" or "142205"; "(x)" negative). Skips schedule refs like "NL-4". */
function readAmounts(after: string, n: number): number[] | null {
  const tok = /\((\d{1,2}(?:,\d{2,3})+|\d{4,})\)|(\d{1,2}(?:,\d{2,3})+|\d{4,})/g
  const out: number[] = []
  let t: RegExpExecArray | null
  while ((t = tok.exec(after)) !== null && out.length < n) {
    const raw = (t[1] ?? t[2]).replace(/,/g, '')
    out.push(t[1] != null ? -parseInt(raw, 10) : parseInt(raw, 10))
  }
  return out.length < n ? null : out
}

export function parseRevenueAccount(text: string): Nl1Result {
  const out: Nl1Result = { found: false, unit_label: null, to_crore: null, values: [], blocked: [], notes: [] }
  const m = /FORM\s+NL\W*1\W*[A-Z]?\W*RA\b/i.exec(text)
  if (!m || m.index == null) return out
  const rest = text.slice(m.index + 40)
  const nxt = /FORM\s+NL[-\s]*[2-9]/i.exec(rest)
  const section = text.slice(m.index, nxt ? m.index + 40 + nxt.index : Math.min(text.length, m.index + 4000)).replace(/\s+/g, ' ').trim()
  out.found = true

  // The "(Amount in Rs. Lakhs)" marker is a document-level property of the NL
  // schedules (IRDAI prints it once); scan the whole document for it.
  const unit = unitToCrore(text)
  if (!unit) { out.blocked.push({ metric: 'nep', reason: 'unit_unclear', detail: 'no "(Amount in Rs. Lakhs/Crore/000)" unit marker found near NL-1 - withheld' }); return out }
  out.unit_label = unit.label; out.to_crore = unit.factor

  const cols = raColumns(section)
  if (!cols) { out.blocked.push({ metric: 'nep', reason: 'column_alignment_unclear', detail: 'NL-1 revenue-account columns could not be resolved (need 4, or a validated doubled 8, "For/Up to the quarter ended <date>" headers)' }); return out }

  // "Premiums earned (Net)" row. After the label there may be a schedule ref (NL-4) - readAmounts skips it.
  const lm = /Premiums?\s+earned\s*\(\s*Net\s*\)/i.exec(section)
  if (!lm || lm.index == null) { out.notes.push('NL-1 found but "Premiums earned (Net)" row not located'); return out }
  // The row prints a schedule ref ("NL-4") that pdf-parse may fuse to the first
  // amount ("NL-41,21,322"). Strip a single leading "NL-<digit>" so the ref digit
  // is not read as part of the first value.
  const after = section.slice(lm.index + lm[0].length, lm.index + lm[0].length + 360).replace(/^\s*NL\W*\d/i, ' ')
  // Read up to 8 cells; if 8 present, validate the doubled block.
  const probe = readAmounts(after, 8)
  let cells = probe
  if (probe && probe.length === 8) {
    for (let i = 0; i < 4; i++) if (probe[i] !== probe[i + 4]) { out.blocked.push({ metric: 'nep', reason: 'doubled_block_mismatch', detail: `NL-1 doubled segment/total block disagree at column ${i} (${probe[i]} vs ${probe[i + 4]}) - withheld` }); return out }
    cells = probe.slice(0, 4)
  }
  if (!cells || cells.length < 4) { cells = readAmounts(after, 4) }
  if (!cells || cells.length < 4) { out.blocked.push({ metric: 'nep', reason: 'column_alignment_unclear', detail: 'NL-1 "Premiums earned (Net)" cells did not line up with the columns - withheld' }); return out }

  const label = lm[0].replace(/\s+/g, ' ').trim()
  const push = (col: Nl20Column, period: string, periodStart: string, basis: ColumnBasis, lakhs: number) => out.values.push({
    metric: 'nep', raw_value: lakhs, normalized_crore: +(lakhs * unit.factor).toFixed(2), unit_label: unit.label,
    period, period_start: periodStart, period_end: col.periodEnd, column_basis: basis, column_kind: col.kind,
    column_header: col.header, row_label: label, row_cells: cells!.slice(0, 4),
  })
  const c0 = cols[0], c1 = cols[1], c3 = cols[3]
  const q0 = quarterLabel(c0.endQuarter, c0.fy)
  if (cells[0] != null) push(c0, q0, quarterStart(c0.endQuarter, c0.fy), 'standalone_quarter', cells[0])
  if (cells[1] != null) { const yl = ytdLabel(c1.endQuarter, c1.fy); if (yl !== q0) push(c1, yl, ytdStart(c1.fy), 'year_to_date', cells[1]) }
  if (cells[3] != null && c3.endQuarter === 4) push(c3, fyLabel(c3.fy), ytdStart(c3.fy), 'year_to_date', cells[3])
  return out
}
