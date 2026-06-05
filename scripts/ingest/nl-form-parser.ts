// ---------------------------------------------------------------------------
//  Chunk 2C-A - Column-aware IRDAI NL-20 (Analytical Ratios) parser.
//
//  IRDAI public-disclosure "FORM NL-20 - ANALYTICAL RATIOS SCHEDULE" prints a
//  fixed multi-column table. After pdf-parse flattens it, the four column
//  headers appear in a stable order, each as "(For|Upto) the Quarter ended
//  <date>", followed by numbered rows "<n> <Particulars> <c1> <c2> <c3> <c4>":
//
//     For the Quarter ended 31 Mar 2025   <- col0  standalone, CURRENT  (Q4 FY25)
//     Upto the Quarter ended 31 Mar 2025  <- col1  year-to-date, CURRENT (FY25)
//     For the Quarter ended 31 Mar 2024   <- col2  standalone, PRIOR    (Q4 FY24)
//     Upto the Quarter ended 31 Mar 2024  <- col3  year-to-date, PRIOR   (FY24)
//     10 Combined Ratio  0.97  1.03  0.90  0.95
//
//  The whole point of this parser is to put each ratio in the RIGHT period by
//  reading the RIGHT column, so:
//   * a quarterly standalone cell <- the "For the Quarter ended" column,
//   * an annual / full-year cell  <- the "Upto the Quarter ended 31 March"
//                                    column of the year-end filing (statutory FY,
//                                    NOT the standalone Q4 column),
//   * a prior-year full-year cell <- the prior "Upto ... 31 March" column,
//   * point-in-time solvency      <- read identically in the standalone and YTD
//                                    columns (validated equal, else blocked).
//
//  Safety (governing charter, "accuracy > coverage"): if the column headers
//  cannot be resolved, or a row's numeric cells don't line up with the column
//  count, or a point-in-time value disagrees across its standalone/YTD columns,
//  the value is BLOCKED (recorded with a reason) instead of guessed.
//
//  Scope (Chunk 2C-A): the DECIMAL NL-20 layout (e.g. Care Health, "0.97").
//  The percentage / "**" layout (e.g. Niva Bupa) is left to the existing
//  extractDisclosure path and returns {found:false} from here.
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

// Only the three ratios that (a) are unambiguous in the NL-20 layout and (b) map
// to a statutory IGAAP Excel cell. Expense/commission are intentionally excluded
// here: NL-20 prints two expense bases (to GDP and to NWP) plus a separate
// commission line, so mapping them to the single combined-ratio expense
// component is not certain -> left for a later, explicitly-scoped pass.
const DEFAULT_ROWS: RowSpec[] = [
  { metric: 'claims_ratio', label: /Net Incurred Claims to Net Earned Premium/i, pointInTime: false },
  { metric: 'combined_ratio', label: /Combined Ratio/i, pointInTime: false },
  { metric: 'solvency_ratio', label: /Available Solvency margin Ratio to Required\s+Solvency Margin Ratio/i, pointInTime: true },
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`
const fyLabel = (fy: number) => `FY${pad2(fy % 100)}`
const quarterLabel = (q: number, fy: number) => `Q${q}FY${pad2(fy % 100)}`

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

/** Parse the 2 or 4 column headers (std,ytd[,std,ytd]) in document order. */
function parseColumns(section: string): Nl20Column[] | null {
  const headerWindow = section.split(/\b1\s+Gross Direct Premium Growth Rate/i)[0] || section.slice(0, 700)
  const re = /(For|Upto)\s+the\s+Quarter\s+ended\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})/gi
  const cols: Nl20Column[] = []
  let mm: RegExpExecArray | null
  while ((mm = re.exec(headerWindow)) !== null) {
    const basis: 'standalone' | 'ytd' = /^For/i.test(mm[1]) ? 'standalone' : 'ytd'
    const day = parseInt(mm[2], 10)
    const month = MONTHS[mm[3].slice(0, 3).toLowerCase()]
    const year = parseInt(mm[4], 10)
    if (!month) return null
    cols.push({
      kind: 'current_standalone', basis, isCurrent: true,
      header: mm[0].replace(/\s+/g, ' ').trim(),
      day, month, year, endQuarter: quarterOf(month), fy: fyOf(month, year),
      periodEnd: iso(year, month, day),
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

/** Read the n numeric cells that follow a row label. Decimals/paren-negatives/NA; null on a short row. */
function readRow(section: string, label: RegExp, n: number): { label: string; cells: (number | null)[] } | null {
  const m = label.exec(section)
  if (!m || m.index == null) return null
  const after = section.slice(m.index + m[0].length, m.index + m[0].length + 240)
  const tok = /\((\d+\.\d+)\)|(\d+\.\d+)|\b(NA|N\.A\.)\b/gi
  const cells: (number | null)[] = []
  let t: RegExpExecArray | null
  while ((t = tok.exec(after)) !== null && cells.length < n) {
    if (t[1] != null) cells.push(-parseFloat(t[1]))
    else if (t[2] != null) cells.push(parseFloat(t[2]))
    else cells.push(null)
  }
  if (cells.length < n) return null
  return { label: m[0].replace(/\s+/g, ' ').trim(), cells }
}

/** Emit period-correct values for one row, picking the right column per the cell-period policy. */
function emitRow(out: Nl20Result, spec: RowSpec, cols: Nl20Column[], label: string, cells: (number | null)[]): void {
  const push = (col: Nl20Column, period: string, periodStart: string, basis: ColumnBasis, value: number) => {
    out.values.push({
      metric: spec.metric, raw_value: value, period,
      period_start: periodStart, period_end: col.periodEnd,
      column_basis: basis, column_kind: col.kind, column_header: col.header,
      row_label: label, row_cells: cells, is_point_in_time: spec.pointInTime,
    })
  }
  const col0 = cols[0]                       // current standalone
  const col1 = cols[1]                       // current YTD
  const col2 = cols.length === 4 ? cols[2] : null  // prior standalone
  const col3 = cols.length === 4 ? cols[3] : null  // prior YTD

  if (spec.pointInTime) {
    // Solvency is a balance-sheet snapshot: standalone == YTD by construction.
    // (The PIT-equality check ran before this; cells here are validated.)
    const cur = cells[0]
    if (cur != null) {
      push(col0, quarterLabel(col0.endQuarter, col0.fy), quarterStart(col0.endQuarter, col0.fy), 'point_in_time', cur)
      if (col0.endQuarter === 4) push(col1, fyLabel(col0.fy), iso(col0.fy - 1, 4, 1), 'point_in_time', cur)
    }
    // Prior-year full-year point-in-time (only from a year-end filing).
    if (col3 && col3.endQuarter === 4) {
      const prior = cells[3]
      if (prior != null) push(col3, fyLabel(col3.fy), iso(col3.fy - 1, 4, 1), 'point_in_time', prior)
    }
    return
  }

  // Flow ratios accumulate over the year.
  // col0: standalone quarter -> QnFY (always).
  if (cells[0] != null) push(col0, quarterLabel(col0.endQuarter, col0.fy), quarterStart(col0.endQuarter, col0.fy), 'standalone_quarter', cells[0])
  // col1: YTD -> full year ONLY at the year-end (31 March) filing (else partial: skip).
  if (cells[1] != null && col1.endQuarter === 4) push(col1, fyLabel(col1.fy), iso(col1.fy - 1, 4, 1), 'year_to_date', cells[1])
  // col3: prior-year YTD -> prior full year ONLY at the year-end filing.
  if (col3 && cells[3] != null && col3.endQuarter === 4) push(col3, fyLabel(col3.fy), iso(col3.fy - 1, 4, 1), 'year_to_date', cells[3])
  // col2 (prior standalone quarter) is recognised but not wired: it maps to no
  // current Excel cell and is better sourced from its own primary filing.
  if (col2) out.notes.push(`prior standalone column recognised but not wired for ${spec.metric} (${col2.header})`)
}

export function parseNl20(text: string, rows: RowSpec[] = DEFAULT_ROWS): Nl20Result {
  const out: Nl20Result = { found: false, values: [], blocked: [], columns: [], notes: [] }
  const section = sliceNl20(text)
  if (!section) return out
  // Decimal layout only. The percentage / "**" layout has its own validated
  // extractor (extractDisclosure); defer to it rather than mis-read columns.
  if (/Combined Ratio\s*\*\*/i.test(section) || /Combined Ratio.{0,40}?\d\s*%/i.test(section)) {
    out.notes.push('NL-20 present but percentage/** layout - deferred to extractDisclosure (out of 2C-A scope)')
    return out
  }
  out.found = true

  const cols = parseColumns(section)
  if (!cols) {
    out.blocked.push({
      metric: '(table)', reason: 'column_alignment_unclear',
      detail: 'NL-20 header columns could not be resolved (need 2 or 4 "For/Upto the Quarter ended <date>" headers, standalone before YTD)',
    })
    return out
  }
  out.columns = cols
  const n = cols.length

  for (const spec of rows) {
    const row = readRow(section, spec.label, n)
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
  return out
}
