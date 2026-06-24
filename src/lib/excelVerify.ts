// ---------------------------------------------------------------------------
//  excelVerify — the engine behind the "Excel Upload Verifier" tool.
//
//  Neha uploads a workbook (the same template the dashboard mirrors). This reads
//  it IN THE BROWSER and checks it cell-by-cell against the dashboard's OWN
//  audited values — the exact AuditModel the Data Audit grid renders
//  (buildAudit → AuditCell), so there is one source of truth and no number is
//  re-derived here.
//
//  Match key: the Excel cell reference. Each AuditCell carries { sheet, cellRef,
//  normalizedValue / calculatedValue, unit, status, sourceName, sourceUrl }. We
//  read the uploaded value at the same Sheet!Cell and classify the pair.
//
//  Honesty rules (CLAUDE.md, load-bearing):
//   • A blank cell is "missing", never a fake 0 — and missing is grey, neutral,
//     not a red error.
//   • A value that differs only because the dashboard uses a different SOURCE or
//     accounting BASIS (investor-presentation-first; 1/n vs ex-1/n; IGAAP vs
//     IFRS; a unit/scale difference) is "source / basis differs" (amber), NOT a
//     mismatch (red). PPT-first policy mirrors auditGrid.ts.
//   • A percentage written as a fraction (0.61) and as a percent (61) is the
//     SAME number — that is a clean match, not a difference.
// ---------------------------------------------------------------------------

import * as XLSX from 'xlsx'
import { buildAudit, formatValue, type AuditCell, type AuditStatus } from '@/lib/extractedDataAudit'

// ─── Status ladder ──────────────────────────────────────────────────────────
export type VerifyStatus =
  | 'matched'
  | 'source_basis'
  | 'mismatch'
  | 'missing_upload'      // dashboard has a value, the uploaded cell is blank
  | 'missing_dashboard'   // uploaded cell has a value, the dashboard has none

export interface VerifyStatusMeta {
  label: string
  short: string
  tone: 'green' | 'amber' | 'red' | 'grey'
  /** Tailwind tints reused from the audit grid's QA palette. */
  cell: string
  text: string
  dot: string
}

export const VERIFY_META: Record<VerifyStatus, VerifyStatusMeta> = {
  matched: { label: 'Matched', short: 'Match', tone: 'green', cell: 'bg-emerald-soft', text: 'text-emerald', dot: '#2F855A' },
  source_basis: { label: 'Source / basis differs', short: 'Source/basis', tone: 'amber', cell: 'bg-gold-soft', text: 'text-gold', dot: '#B7791F' },
  mismatch: { label: 'Mismatched', short: 'Mismatch', tone: 'red', cell: 'bg-coral-soft', text: 'text-coral', dot: '#C75D54' },
  missing_upload: { label: 'Blank in your file', short: 'Missing', tone: 'grey', cell: 'bg-slate-100', text: 'text-slate-500', dot: '#94A3B8' },
  missing_dashboard: { label: 'Not on dashboard', short: 'Missing', tone: 'grey', cell: 'bg-slate-100', text: 'text-slate-500', dot: '#94A3B8' },
}

/** Worst-first order, so problems surface at the top of the report. */
export const VERIFY_SEVERITY: Record<VerifyStatus, number> = {
  mismatch: 0, source_basis: 1, missing_upload: 2, missing_dashboard: 3, matched: 4,
}

export interface VerifyRow {
  id: string                  // "Sheet!Ref"
  sheet: string
  cellRef: string
  metricLabel: string
  entityLabel: string
  period: string
  unit: string
  dashboardField: string
  cellKind: string
  status: VerifyStatus
  dashboardStatus: AuditStatus
  /** The dashboard's final value (what the grid shows). */
  dashboardValue: number | string | null
  dashboardDisplay: string
  /** The value read from the uploaded cell. */
  uploadedValue: number | string | null
  uploadedDisplay: string
  sourceName: string | null
  sourceLabel: string | null  // sourceName trimmed to a clean, viewer-safe label
  sourceUrl: string | null
  /** Plain-English reason for the classification. */
  reason: string
  /** Signed relative difference (upload vs dashboard), for numeric differences. */
  diffPct: number | null
}

export interface VerifySummary {
  comparable: number          // cells where at least one side carries a value
  matched: number
  sourceBasis: number
  mismatch: number
  missing: number             // missingUpload + missingDashboard
  missingUpload: number
  missingDashboard: number
  templateSheets: number
  matchedSheets: number
}

export interface SheetMatch {
  sheet: string               // template sheet name
  matchedTo: string | null    // the uploaded sheet it matched (null = not found)
  cells: number               // comparable cells found on it
}

export interface VerifyResult {
  fileName: string
  rows: VerifyRow[]
  summary: VerifySummary
  sheetMatch: SheetMatch[]
  unmatchedUploadSheets: string[]
  templateName: string
  templateSha: string | null
  generatedAt: string
}

// ─── Numeric helpers ────────────────────────────────────────────────────────

const RATIO_UNITS = new Set(['fraction', 'ratio', 'percent', '%'])
const ratioLike = (u: string | undefined) => RATIO_UNITS.has((u ?? '').toLowerCase())

/** Coerce a cell value to a number, tolerating "₹6,762 cr", "61.22%", "(214)". */
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const neg = /^\(.*\)$/.test(v.trim())
    const cleaned = v.replace(/[₹,%\s]/g, '').replace(/cr\b/i, '').replace(/[()]/g, '').trim()
    if (cleaned === '' || cleaned === '-' || cleaned === '—') return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? (neg ? -n : n) : null
  }
  return null
}

const REL_TOL = 0.01 // 1% — generous enough for deck rounding, strict on real gaps
function absFloor(unit: string | undefined): number {
  const u = (unit ?? '').toLowerCase()
  if (ratioLike(u)) return 0.0015 // ~0.15 percentage points on the fraction scale
  if (u === 'x') return 0.02
  return 0.5 // half a crore / half a unit
}
function close(a: number, b: number, unit: string | undefined): boolean {
  const diff = Math.abs(a - b)
  if (diff <= absFloor(unit)) return true
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9)
  return diff / denom <= REL_TOL
}

/** Do the two values render to the SAME shown figure at this cell's display
 *  precision? The grid rounds (e.g. 6.23% and 6.0% both read "6%"), so two values
 *  that display identically are the same shown value — never a mismatch (Neha:
 *  "mismatch is only where it is the same value but differs"). Ratio cells also
 *  reconcile the 0.06 ⇔ 6% (×100) representation so a fraction and a percent of
 *  the same magnitude count as equal. */
function sameShown(up: number, dash: number, unit: string | undefined): boolean {
  const target = formatValue(dash, unit)
  const ups = ratioLike(unit) ? [up, up * 100, up / 100] : [up]
  return ups.some((u) => formatValue(u, unit) === target)
}

/** Every numeric form the dashboard could legitimately carry for a cell:
 *  the final value, the raw "as printed" value, the computed value — plus the
 *  ×100 / ÷100 forms for ratio cells (0.61 ⇔ 61% is the same number). */
function dashCandidates(cell: AuditCell): number[] {
  const out: number[] = []
  for (const v of [cell.normalizedValue, cell.rawValue, cell.calculatedValue]) {
    const n = toNum(v)
    if (n == null) continue
    out.push(n)
    if (ratioLike(cell.unit)) { out.push(n * 100); out.push(n / 100) }
  }
  return out
}

/** A clean power-of-ten relationship (units differ: lakh vs crore, etc.). */
function powerScale(up: number, dash: number): number | null {
  if (dash === 0 || up === 0) return null
  const r = up / dash
  for (const f of [1000, 100, 10, 0.1, 0.01, 0.001]) {
    if (Math.abs(r - f) / f <= 0.02) return f
  }
  return null
}
const fmtFactor = (f: number) => (f >= 1 ? `${f}` : `1/${Math.round(1 / f)}`)

/** Source is an investor presentation / earnings deck (authoritative on a
 *  mismatch — the PPT-first policy from auditGrid.ts / CLAUDE.md). */
function isPpt(name: string | null, url: string | null): boolean {
  return /presentation|investor deck|earnings call|results deck|earnings deck/i.test(`${name ?? ''} ${url ?? ''}`)
}

/** Is a material numeric difference explainable by source or accounting basis
 *  (so it is "source / basis differs", amber — not a red mismatch)? */
function basisSignal(cell: AuditCell): { amber: boolean; why: string } {
  if (isPpt(cell.sourceName, cell.sourceUrl))
    return { amber: true, why: 'The dashboard takes this from the investor presentation, which is treated as authoritative when sources disagree (PPT-first policy).' }
  const hay = `${cell.note ?? ''} ${cell.transformation ?? ''} ${cell.sourceName ?? ''} ${cell.metricId ?? ''}`.toLowerCase()
  if (/\b(ind[ -]?as|i[ -]?gaap|ifrs|1\/n|ex[ -]?1\/n|gross direct|restated|standalone|consolidated|basis)\b/.test(hay))
    return { amber: true, why: 'The two figures look like different accounting or premium bases (e.g. 1/n vs ex-1/n, IGAAP vs IFRS) rather than a data error.' }
  return { amber: false, why: '' }
}

/** Trim the (often paragraph-long) source_name to a clean, viewer-safe label —
 *  the document, not the embedded lineage prose (CLAUDE.md: lineage stays out of
 *  viewer UI). The full string remains available as the link title. */
function cleanSource(name: string | null): string | null {
  if (!name) return null
  const cut = name.split(/ — | – | \. |\. |\(/)[0].trim()
  return cut.length > 96 ? `${cut.slice(0, 93)}…` : cut
}

const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, '')
const normSheet = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const isRealRef = (ref: string) => /^[A-Z]+\d+$/.test(ref || '')

/** An uploaded cell carrying an Excel error (#NAME?, #REF!, #DIV/0!, #VALUE!,
 *  #N/A, #NUM!, #NULL!, #SPILL!, …) holds NO computed value — so it must read as
 *  "no value in your file", never as a number that mismatches the dashboard.
 *  (SheetJS gives error cells type 'e' with a numeric error code as `v`, which
 *  would otherwise be compared as if it were a real figure.) Returns the error
 *  token to show in the explanation, or null when the cell is a normal value. */
const EXCEL_ERROR_RE = /^#(NAME\?|REF!|DIV\/0!|VALUE!|N\/A|NUM!|NULL!|SPILL!|CALC!|FIELD!|GETTING_DATA|BLOCKED!|CONNECT!|BUSY!|UNKNOWN!)$/i
function excelError(xc: XLSX.CellObject): string | null {
  if (xc.t === 'e') return String(xc.w ?? '').trim() || '#ERROR'
  const s = String(xc.w ?? xc.v ?? '').trim()
  return EXCEL_ERROR_RE.test(s) ? s : null
}

// ─── The verifier ───────────────────────────────────────────────────────────

export function verifyWorkbook(data: ArrayBuffer, fileName: string): VerifyResult {
  const model = buildAudit()

  // Read the uploaded workbook; index its sheets by a normalized name so a
  // straight-vs-curly apostrophe or stray spacing never breaks the match.
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
  const uploadSheets = new Map<string, { name: string; ws: XLSX.WorkSheet }>()
  for (const name of wb.SheetNames) uploadSheets.set(normSheet(name), { name, ws: wb.Sheets[name] })
  const usedUpload = new Set<string>()

  const rows: VerifyRow[] = []
  const sheetMatch: SheetMatch[] = []

  for (const group of model.groups) {
    const up = uploadSheets.get(normSheet(group.sheet))
    if (up) usedUpload.add(up.name)
    let cellsOnSheet = 0

    // Cells with a real Excel reference (skip the "extra" rows with cellRef "—").
    const cells = group.cells.filter((c) => isRealRef(c.cellRef) && c.cellKind !== 'extra')

    for (const cell of cells) {
      // The dashboard's final, displayed value (what the grid shows).
      const dashFinal: number | string | null =
        cell.normalizedValue != null && cell.normalizedValue !== ''
          ? cell.normalizedValue
          : cell.calculatedValue != null
            ? cell.calculatedValue
            : null
      const dashHas = dashFinal != null && dashFinal !== ''

      // The uploaded value at the same reference (only if this sheet is present).
      let upNum: number | null = null
      let upStr = ''
      let upError = '' // an Excel error in your file (#NAME?, #REF!, …) — no value to compare
      if (up) {
        const xc = up.ws[cell.cellRef] as XLSX.CellObject | undefined
        if (xc && xc.v != null && xc.v !== '') {
          const err = excelError(xc)
          if (err) {
            // The cell errored in your workbook, so it has no computed value. Keep
            // upNum/upStr empty so it reads as "no value" (never a mismatch); the
            // token is surfaced in the explanation and the "your file" column below.
            upError = err
          } else if (xc.t === 'd' || xc.v instanceof Date) {
            upStr = xc.w ?? String(xc.v) // a date — compared as text, never coerced to a number
          } else if (xc.t === 'n' || typeof xc.v === 'number') {
            upNum = toNum(xc.v)
            upStr = xc.w ?? String(xc.v)
          } else {
            upStr = String(xc.w ?? xc.v)
            upNum = toNum(upStr)
          }
        }
      }
      const upHas = upNum != null || upStr.trim() !== ''

      // Both blank → nothing to verify; if the sheet itself is missing from the
      // upload, the dashboard-only cells are covered by the sheet-coverage note
      // rather than flooding the report with hundreds of "blank in your file".
      if (!dashHas && !upHas) continue
      if (!up && dashHas) continue

      let status: VerifyStatus
      let reason = ''
      let diffPct: number | null = null

      if (dashHas && !upHas) {
        status = 'missing_upload'
        reason = upError
          ? `Your file shows an Excel error (${upError}) here — the cell has no computed value, so there is nothing to compare. This is not a mismatch.`
          : 'The dashboard has a value here, but this cell is blank in your file.'
      } else if (!dashHas && upHas) {
        status = 'missing_dashboard'
        reason = 'Your file has a value here, but the dashboard has no audited value for this cell.'
      } else {
        // Both sides carry a value.
        const cands = dashCandidates(cell)
        if (upNum != null && cands.length) {
          const primary = toNum(dashFinal) ?? cands[0]
          if (cands.some((d) => close(upNum as number, d, cell.unit))) {
            status = 'matched'
            reason = 'Your value matches the dashboard.'
          } else if (sameShown(upNum, primary, cell.unit)) {
            // Both sides show the same figure once rounded to the displayed
            // precision (e.g. 6.0% vs 6%) — the same value, not a mismatch.
            status = 'matched'
            reason = 'Your value matches the dashboard at the shown precision (the tiny underlying difference rounds to the same figure).'
          } else {
            diffPct = primary !== 0 ? (upNum - primary) / Math.abs(primary) : null
            const sig = basisSignal(cell)
            const ps = powerScale(upNum, primary)
            if (sig.amber) {
              status = 'source_basis'
              reason = sig.why
            } else if (ps && !ratioLike(cell.unit)) {
              status = 'source_basis'
              reason = `Looks like a unit / scale difference (about ×${fmtFactor(ps)}) rather than a wrong number — please confirm the units.`
            } else {
              status = 'mismatch'
              reason = 'Your value differs from the dashboard’s audited value.'
            }
          }
        } else {
          // At least one side is non-numeric text — compare leniently.
          const a = canon(upStr)
          const b = canon(String(dashFinal))
          if (a && b && a === b) {
            status = 'matched'
            reason = 'Your value matches the dashboard.'
          } else {
            const sig = basisSignal(cell)
            status = sig.amber ? 'source_basis' : 'mismatch'
            reason = sig.amber ? sig.why : 'Your value differs from the dashboard’s audited value.'
          }
        }
      }

      cellsOnSheet += 1
      rows.push({
        id: cell.id,
        sheet: cell.sheet,
        cellRef: cell.cellRef,
        metricLabel: cell.metricLabel,
        entityLabel: cell.entityLabel,
        period: cell.period,
        unit: cell.unit,
        dashboardField: cell.dashboardField,
        cellKind: cell.cellKind,
        status,
        dashboardStatus: cell.status,
        dashboardValue: dashFinal,
        dashboardDisplay: dashHas ? formatValue(dashFinal, cell.unit) : '—',
        uploadedValue: upError || (upNum ?? (upStr.trim() ? upStr.trim() : null)),
        uploadedDisplay: upError || (upHas ? (upStr.trim() || (upNum != null ? formatValue(upNum, cell.unit) : '—')) : '—'),
        sourceName: cell.sourceName,
        sourceLabel: cleanSource(cell.sourceName),
        sourceUrl: cell.sourceUrl,
        reason,
        diffPct,
      })
    }

    sheetMatch.push({ sheet: group.sheet, matchedTo: up?.name ?? null, cells: cellsOnSheet })
  }

  // Sort worst-first, then by sheet and cell, so errors lead the report.
  rows.sort(
    (a, b) =>
      VERIFY_SEVERITY[a.status] - VERIFY_SEVERITY[b.status] ||
      a.sheet.localeCompare(b.sheet) ||
      refOrder(a.cellRef) - refOrder(b.cellRef),
  )

  const count = (s: VerifyStatus) => rows.filter((r) => r.status === s).length
  const missingUpload = count('missing_upload')
  const missingDashboard = count('missing_dashboard')
  const summary: VerifySummary = {
    comparable: rows.length,
    matched: count('matched'),
    sourceBasis: count('source_basis'),
    mismatch: count('mismatch'),
    missing: missingUpload + missingDashboard,
    missingUpload,
    missingDashboard,
    templateSheets: model.groups.length,
    matchedSheets: sheetMatch.filter((s) => s.matchedTo).length,
  }

  return {
    fileName,
    rows,
    summary,
    sheetMatch,
    unmatchedUploadSheets: wb.SheetNames.filter((n) => !usedUpload.has(n)),
    templateName: model.meta.template_file ?? 'dashboard template',
    templateSha: model.meta.template_sha256 ?? null,
    generatedAt: new Date().toISOString(),
  }
}

/** Stable cell-ref ordering: column letters then row number (A2 before B1? no —
 *  row-major reads naturally, so row then column). */
function refOrder(ref: string): number {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return Number.MAX_SAFE_INTEGER
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return Number(m[2]) * 1000 + col
}

// ─── Report export (CSV + XLSX) ─────────────────────────────────────────────

const HEADERS = [
  'Sheet', 'Cell', 'Line item', 'Entity', 'Period', 'Unit', 'Status',
  'Uploaded value', 'Dashboard value', 'Difference %', 'Source', 'Notes',
]
function rowToArray(r: VerifyRow): (string | number)[] {
  return [
    r.sheet,
    r.cellRef,
    r.metricLabel,
    r.entityLabel,
    r.period,
    r.unit,
    VERIFY_META[r.status].label,
    r.uploadedDisplay,
    r.dashboardDisplay,
    r.diffPct != null ? `${(r.diffPct * 100).toFixed(1)}%` : '',
    r.sourceLabel ?? '',
    r.reason,
  ]
}

export function verifyRowsToCsv(result: VerifyResult): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [HEADERS.map(esc).join(',')]
  for (const r of result.rows) lines.push(rowToArray(r).map(esc).join(','))
  return lines.join('\r\n')
}

export function verifyReportToXlsx(result: VerifyResult): Uint8Array {
  const s = result.summary
  const summaryAoa: (string | number)[][] = [
    ['Excel Upload Verifier — report'],
    ['File checked', result.fileName],
    ['Template', result.templateName],
    ['Generated', result.generatedAt],
    [],
    ['Cells compared', s.comparable],
    ['Matched', s.matched],
    ['Source / basis differs', s.sourceBasis],
    ['Mismatched', s.mismatch],
    ['Missing (blank in your file)', s.missingUpload],
    ['Missing (not on dashboard)', s.missingDashboard],
    ['Template sheets matched', `${s.matchedSheets} of ${s.templateSheets}`],
  ]
  const detailAoa: (string | number)[][] = [HEADERS, ...result.rows.map(rowToArray)]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), 'Summary')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailAoa), 'Verifier report')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

/** Browser download helper (mirrors pptExport's Blob → object-URL pattern). */
export function downloadVerifyReport(result: VerifyResult, format: 'csv' | 'xlsx'): void {
  const base = `Excel-verify-${(result.fileName || 'report').replace(/\.[^.]+$/, '')}`
  const blob =
    format === 'csv'
      ? new Blob([verifyRowsToCsv(result)], { type: 'text/csv;charset=utf-8' })
      : new Blob([verifyReportToXlsx(result) as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${base}.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
