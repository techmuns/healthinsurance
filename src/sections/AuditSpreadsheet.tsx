import { Fragment, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, FunctionSquare, Info, X } from 'lucide-react'
import {
  STATUS_META, formatValue, formatRaw,
  type AuditModel, type AuditGroup, type AuditCell, type QaColor,
} from '@/lib/extractedDataAudit'
import { HistoricalStockMovement } from '@/sections/HistoricalStockMovement'
import { AnalystCoverage } from '@/sections/AnalystCoverage'

// ---------------------------------------------------------------------------
//  Audit · Spreadsheet view — mirrors the source Excel template tab-for-tab and
//  cell-for-cell, so a reviewer can put their Excel next to this and compare
//  apple-to-apple. Each sheet is reconstructed as a real grid from the cells'
//  Excel references (column letter + row number): rows are the template's line
//  items, columns are its periods. Read-only; no data is changed here.
// ---------------------------------------------------------------------------

// Cell fills are solid (fully opaque) tone-coded tints — the soft tokens are
// already light pastels, so painting them at full opacity reads as a clean,
// decision-grade column rather than a washed-out, see-through one.
const QA: Record<QaColor, { cell: string; ring: string; text: string; dot: string; label: string }> = {
  green: { cell: 'bg-emerald-soft', ring: 'rgba(47,133,90,0.22)', text: 'text-emerald', dot: '#2F855A', label: 'Fetched' },
  yellow: { cell: 'bg-gold-soft', ring: 'rgba(183,121,31,0.22)', text: 'text-gold', dot: '#B7791F', label: 'Adjusted / typed' },
  red: { cell: 'bg-coral-soft', ring: 'rgba(199,93,84,0.22)', text: 'text-coral', dot: '#C75D54', label: 'Missing / not reachable' },
  grey: { cell: 'bg-slate-100', ring: 'rgba(148,163,184,0.25)', text: 'text-slate-500', dot: '#94A3B8', label: 'Not needed / blocked' },
  info: { cell: 'bg-lavender-soft', ring: 'rgba(110,123,214,0.22)', text: 'text-lavender', dot: '#6E7BD6', label: 'Calculated' },
}
const LEGEND: QaColor[] = ['green', 'yellow', 'info', 'red', 'grey']

// ── Source pipelines ─────────────────────────────────────────────────────────
// Every template cell is fed by one of these acquisition pipelines. When a cell
// is empty, this tells the reviewer which pipeline should have filled it.
type PipelineKey = 'irdai' | 'company' | 'screener' | 'capitaliq'
const PIPELINE: Record<PipelineKey, { label: string; short: string; color: string; what: string }> = {
  irdai: { label: 'IRDAI portal', short: 'IRDAI', color: '#27457E', what: 'Industry & regulatory disclosures (GI Council / IRDAI NL forms, monthly business figures)' },
  company: { label: 'Company website · PPT', short: 'PPT', color: '#168E8E', what: 'Company investor presentations & annual reports' },
  screener: { label: 'Screener', short: 'Screener', color: '#B68B3A', what: 'Market price, valuation, shareholding & analyst data' },
  // Enterprise value & long-run average P/E were built with the S&P Capital IQ
  // Excel plug-in in the source workbook (the CIQ() / CIQAVG() formulas). There
  // is no login-free public equivalent, so these stay blank by design — labelled
  // "Capital IQ" rather than counted as a fetch gap we could close.
  capitaliq: { label: 'S&P Capital IQ', short: 'Capital IQ', color: '#7A6CA6', what: 'Enterprise value & 3-year average P/E — from the S&P Capital IQ Excel plug-in in the source workbook. No login-free public source, so these are not auto-fetched.' },
}
const ROLE_PIPELINE: Record<string, PipelineKey> = {
  industry_premium: 'irdai',
  company_premium_quarterly: 'irdai',
  company_premium_monthly: 'irdai',
  distribution: 'irdai',
  company_financials: 'company',
  management_commentary: 'company',
  analyst_coverage: 'screener',
  valuation: 'screener',
  shareholding: 'screener',
  market_quote: 'screener',
  market_cap: 'screener',
}
// The two valuation metrics the source workbook pulled from the Capital IQ
// plug-in and we have no free source for — they read "Capital IQ", not "Screener".
const CAPITALIQ_METRICS = new Set(['enterprise_value', 'pe_3yr_avg'])
function pipelineOf(cell: AuditCell): PipelineKey {
  if (CAPITALIQ_METRICS.has(cell.metricId)) return 'capitaliq'
  return ROLE_PIPELINE[cell.role] ?? 'irdai'
}
// A cell is "fetched & verified" when it carries a value.
function isFetched(cell: AuditCell): boolean {
  return cell.normalizedValue != null || cell.calculatedValue != null
}

// ── Rows the company investor decks (PPT) do NOT give a value for ────────────
// The whole "SAHIs comparison" tab is wired to one pipeline — the company deck —
// so by default every blank cell here is tagged "• PPT" ("expected from the
// deck, not fetched yet"). For overall health market share that is misleading:
// the deck's KPI page lists the RETAIL health share but leaves overall health
// share blank (verified in Niva's Q4 FY25 deck), and every value we actually
// hold for it comes from the GI Council segment report — so no PPT pull will
// fill it. We mark those blanks honestly and name the real source instead.
//
// NOTE: total GWP is deliberately NOT listed here. The decks DO state it on the
// 1/n basis (Niva FY25 ₹6,762.2 Cr, Care FY26 ₹10,416 Cr, Star FY26 ₹20,369 Cr
// — all read straight from the decks), so a blank GWP cell is a real fill
// opportunity, not a dead end. PPTs are a preferred source, not an excluded one.
const DECK_UNPUBLISHED: Record<string, { sourceLabel: string; reason: string }> = {
  overall_health_market_share: {
    sourceLabel: 'GI Council segment report (industry share)',
    reason:
      "Investor decks don't give a value for overall health market share — the KPI page lists the retail health share only (verified in Niva's Q4 FY25 deck). It's an industry-share figure (the insurer's health premium ÷ all-India health premium), so the values we have come from the GI Council segment report; the blank periods (FY23 and the quarters) aren't published there either.",
  },
}
// An EMPTY cell whose row the deck doesn't publish — the "• PPT" tag is wrong
// for it. Filled cells are untouched: they keep their real value and source,
// including the rare deck that does restate the figure.
function deckGap(cell: AuditCell): { sourceLabel: string; reason: string } | null {
  if (isFetched(cell)) return null
  return DECK_UNPUBLISHED[cell.metricId] ?? null
}

function parseRef(ref: string): { col: string; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || '')
  return m ? { col: m[1], row: Number(m[2]) } : null
}
function colIndex(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

interface GridCol { col: string; period: string; entity: string; metric: string; label: string; top: string }
interface GridRow {
  rowNum: number
  section: string
  primary: string
  secondary: string
  unit: string
  byCol: Map<string, AuditCell>
}

/** Reconstruct a sheet as a spreadsheet grid from the cells' Excel refs. Some
 *  sheets vary the entity by ROW (e.g. Industry Growth: one row per segment);
 *  others vary it by COLUMN block (e.g. SAHIs comparison: one column block per
 *  insurer). We detect which and label rows/columns accordingly. */
function buildGrid(group: AuditGroup): { columns: GridCol[]; rows: GridRow[]; entityByColumn: boolean } {
  const cells = group.cells.filter((c) => parseRef(c.cellRef))

  // Per Excel column: the period, the (dominant) entity, and the (dominant)
  // metric it carries.
  const colMap = new Map<string, { period: string; entity: string; metric: string }>()
  for (const c of cells) {
    const col = parseRef(c.cellRef)!.col
    if (!colMap.has(col)) colMap.set(col, { period: c.period || col, entity: c.entityLabel || '', metric: c.metricLabel || '' })
  }
  let columns: GridCol[] = [...colMap.entries()]
    .map(([col, v]) => ({ col, period: v.period, entity: v.entity, metric: v.metric, label: v.period, top: col }))
    .sort((a, b) => colIndex(a.col) - colIndex(b.col))

  // When every column shares one period but carries a distinct metric (e.g. the
  // Valuation 'Comps' sheet: Market Cap | Enterprise Value | Net Worth | PAT |
  // …), the columns are distinguished by METRIC, not by time — label them so.
  const distinctPeriods = new Set(columns.map((c) => c.period)).size
  const distinctMetrics = new Set(columns.map((c) => c.metric).filter(Boolean)).size
  const labelByMetric = distinctPeriods <= 1 && distinctMetrics > 1
  if (labelByMetric) columns = columns.map((c) => ({ ...c, label: c.metric || c.period }))

  // Breakdown sheet: every cell is a base metric split by a sub-entity (e.g.
  // 'Captable' = shareholding_pct::<holder> + shareholding_shares::<holder>).
  // Rows are the holders; each COLUMN is one base metric ("% Shareholding",
  // "Shareholding Shares"), so a holder's stake and share count sit side by side.
  const subBreakdown = cells.length > 0 && cells.every((c) => (c.metricId ?? '').includes('::'))
  if (subBreakdown && distinctPeriods <= 1) columns = columns.map((c) => ({ ...c, label: (c.metric || '').split(' · ')[0] || c.label, top: c.period }))

  const rowMap = new Map<number, AuditCell[]>()
  for (const c of cells) {
    const row = parseRef(c.cellRef)!.row
    if (!rowMap.has(row)) rowMap.set(row, [])
    rowMap.get(row)!.push(c)
  }

  // Does the entity vary across COLUMNS (column-block layout) or across ROWS?
  const entityByColumn = new Set(columns.map((c) => c.entity).filter(Boolean)).size > 1
  const rowEntities = new Set([...rowMap.values()].map((rc) => rc[0].entityLabel))
  const entityByRow = !entityByColumn && rowEntities.size > 1
  const singleEntity = rowEntities.size <= 1

  const rows: GridRow[] = [...rowMap.entries()]
    .map(([rowNum, rc]) => {
      const f = rc[0]
      // The sub-entity (holder) for a breakdown row, e.g. "Bupa Singapore Holdings".
      const sub = subBreakdown ? (f.metricLabel || '').split(' · ').slice(1).join(' · ') : ''
      // Primary label = the dimension that distinguishes this row.
      const primary = subBreakdown ? sub || f.metricLabel : entityByRow ? f.entityLabel : f.metricLabel
      // When columns are the metrics (or it's a single-entity breakdown), the
      // row needs no entity / metric subtitle.
      const secondary = entityByColumn || labelByMetric || (subBreakdown && singleEntity) ? '' : entityByRow ? f.metricLabel : f.entityLabel
      return {
        rowNum,
        section: f.section || '',
        primary,
        secondary,
        unit: f.unit,
        byCol: new Map(rc.map((c) => [parseRef(c.cellRef)!.col, c] as const)),
      }
    })
    .sort((a, b) => a.rowNum - b.rowNum)

  return { columns, rows, entityByColumn }
}

/** Group consecutive columns that share an entity, for the column-block band. */
function entityBands(columns: GridCol[]): { entity: string; span: number }[] {
  const bands: { entity: string; span: number }[] = []
  for (const c of columns) {
    const last = bands[bands.length - 1]
    if (last && last.entity === c.entity) last.span += 1
    else bands.push({ entity: c.entity, span: 1 })
  }
  return bands
}

function cellDisplay(c: AuditCell, raw: boolean): string {
  if (raw) return formatRaw(c.rawValue ?? c.normalizedValue)
  if (c.normalizedValue !== null && c.normalizedValue !== undefined) return formatValue(c.normalizedValue, c.unit)
  if (c.calculatedValue != null) return formatValue(c.calculatedValue, c.unit)
  return ''
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">{label}</p>
      <div className="mt-0.5 text-[12px] text-ink-primary">{children}</div>
    </div>
  )
}

function CellDetail({ cell, onClose }: { cell: AuditCell; onClose: () => void }) {
  const meta = STATUS_META[cell.status]
  const q = QA[meta.color]
  const fetched = isFetched(cell)
  const gap = deckGap(cell)
  // Blocked / not-found blank — figure exists but the pipeline can't pull it;
  // a resolved, calm-grey state (with the reason + short tag), not a red "missing".
  const blocked = !fetched && (cell.status === 'web_blocked' || cell.status === 'not_in_ppt')
  const blockTag = cell.blankTag
    ?? (cell.status === 'web_blocked' ? 'IRDAI' : cell.status === 'not_in_ppt' ? 'Not in PPT' : 'Awaiting source file')
  const calm = gap || blocked // both render as calm grey, not coral
  const pipe = PIPELINE[pipelineOf(cell)]
  return (
    <div className="flex flex-col overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-card">
      <div className="flex items-start justify-between gap-2 px-4 py-3" style={{ background: 'linear-gradient(135deg,#172B4D,#27457E)' }}>
        <div className="leading-tight">
          <p className="font-mono text-[10px] uppercase tracking-wide text-white/55">Cell {cell.cellRef} · {cell.sheet}</p>
          <p className="mt-0.5 font-display text-[14.5px] text-white">{cell.metricLabel}</p>
          <p className="text-[11px] text-white/65">{cell.entityLabel} · {cell.period}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Fetched / Not-in-deck / Missing banner */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${fetched ? 'bg-emerald-soft/40' : calm ? 'bg-slate-100' : 'bg-coral-soft/30'}`}>
        {fetched
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald" />
          : calm
            ? <Info className="h-4 w-4 shrink-0 text-slate-500" />
            : <AlertCircle className="h-4 w-4 shrink-0 text-coral" />}
        <span className={`text-[12px] font-semibold ${fetched ? 'text-emerald' : calm ? 'text-slate-600' : 'text-coral'}`}>
          {fetched ? 'Fetched & verified' : gap ? 'Not published in the investor deck' : blocked ? blockTag : 'Not fetched — cell empty'}
        </span>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${calm ? 'bg-slate-100 text-slate-500' : `${q.cell} ${q.text}`}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: calm ? '#94A3B8' : q.dot }} />{gap ? 'Not in deck' : blocked ? blockTag : meta.label}
        </span>
      </div>

      <div className="space-y-3 px-4 py-3">
        {/* Pipeline — the real source for a row the deck doesn't publish */}
        <DetailField label="Source pipeline">
          {gap ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold text-white" style={{ background: PIPELINE.irdai.color }}>
                {gap.sourceLabel}
              </span>
              <p className="mt-1 text-[11px] text-ink-secondary">Not a deck metric — the investor presentation doesn’t carry this number, so it isn’t a pending PPT pull.</p>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold text-white" style={{ background: pipe.color }}>
                {pipe.label}
              </span>
              <p className="mt-1 text-[11px] text-ink-secondary">{pipe.what}</p>
            </>
          )}
        </DetailField>

        {/* Source — actual when fetched, expected (or "comes from") when empty */}
        <DetailField label={fetched ? 'Source (verified)' : gap ? 'Comes from' : 'Expected source'}>
          {cell.sourceName ? (
            cell.sourceUrl ? (
              <a href={cell.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-navy-primary hover:underline">
                {cell.sourceName}<ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
            ) : <span>{cell.sourceName}</span>
          ) : gap ? <span>{gap.sourceLabel}</span> : <span className="text-ink-secondary">Not defined</span>}
          {cell.sourceFile && <p className="mt-0.5 break-all font-mono text-[10px] text-ink-secondary/80">{cell.sourceFile}</p>}
        </DetailField>

        {fetched ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <DetailField label="As printed (source)"><span className="font-semibold tabular-nums">{formatRaw(cell.rawValue ?? cell.normalizedValue) || '—'}</span></DetailField>
            <DetailField label="Final value (dashboard)"><span className="font-semibold tabular-nums text-navy-deep">{cell.normalizedValue != null ? formatValue(cell.normalizedValue, cell.unit) : formatValue(cell.calculatedValue ?? null, cell.unit)}</span></DetailField>
          </div>
        ) : gap ? (
          <DetailField label="Why it's blank">
            <span className="text-ink-secondary">{gap.reason}</span>
          </DetailField>
        ) : blocked ? (
          <DetailField label="Why it's blank">
            <span className="text-ink-secondary">{cell.note}</span>
          </DetailField>
        ) : (
          <DetailField label="Why it's missing">
            <span className="text-coral-deep">{cell.note || `No value yet — should be fetched from ${pipe.label}.`}</span>
          </DetailField>
        )}

        {/* Internal lineage notes (seeds, supersession, basis bookkeeping) never
            surface on fetched cells — viewer-facing panel (Neha, 2026-06-11). */}

        {cell.formula && (
          <DetailField label="Excel formula">
            <code className="block rounded-md bg-ice/70 px-2 py-1 font-mono text-[11px] text-ink-primary">{cell.formula}</code>
            {cell.calc && <p className="mt-1 text-[11px] text-ink-secondary">{cell.calc}</p>}
          </DetailField>
        )}
        {cell.dashboardField && (
          <DetailField label="Dashboard field">{cell.dashboardField}</DetailField>
        )}
      </div>
    </div>
  )
}

// ── Grid ─────────────────────────────────────────────────────────────────────
function SheetGrid({ group, raw, selected, onSelect }: { group: AuditGroup; raw: boolean; selected: AuditCell | null; onSelect: (c: AuditCell) => void }) {
  const { columns, rows, entityByColumn } = useMemo(() => buildGrid(group), [group])
  const bands = useMemo(() => (entityByColumn ? entityBands(columns) : []), [entityByColumn, columns])

  if (!columns.length || !rows.length) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12px] text-ink-secondary">No template cells reconstructable for this sheet.</div>
  }

  let lastSection = ''
  return (
    <div className="overflow-auto rounded-xl2 border border-soft-border bg-card shadow-soft" style={{ maxHeight: '70vh' }}>
      <table className="border-separate" style={{ borderSpacing: 0 }}>
        <thead className="sticky top-0 z-20">
          {entityByColumn && (
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-soft-border bg-[#EAEFF7] px-3 py-1 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-ink-secondary" style={{ minWidth: 220 }}>
                Insurer →
              </th>
              {bands.map((b, i) => (
                <th key={`${b.entity}-${i}`} colSpan={b.span} className="border-b border-r border-soft-border bg-[#EAEFF7] px-2 py-1 text-center text-[10.5px] font-bold text-navy-primary">
                  {b.entity || '—'}
                </th>
              ))}
            </tr>
          )}
          <tr>
            <th className="sticky left-0 z-30 border-b border-r border-soft-border bg-[#F3F6FB] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-ink-secondary" style={{ minWidth: 220 }}>
              Line item
            </th>
            {columns.map((c) => (
              <th key={c.col} className="border-b border-r border-soft-border bg-[#F3F6FB] px-2.5 py-1.5 text-center" style={{ minWidth: 78 }}>
                <span className="block font-mono text-[8.5px] font-medium text-ink-secondary/60">{c.top}</span>
                <span className="block text-[11px] font-bold text-navy-deep">{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const showSection = r.section && r.section !== lastSection
            lastSection = r.section || lastSection
            return (
              <Fragment key={r.rowNum}>
                {showSection && (
                  <tr>
                    <td colSpan={columns.length + 1} className="border-b border-soft-border bg-navy-primary/[0.05] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-navy-primary">
                      {r.section}
                    </td>
                  </tr>
                )}
                <tr className="group">
                  <th className="sticky left-0 z-10 border-b border-r border-soft-border bg-white px-3 py-1.5 text-left align-middle group-hover:bg-ice">
                    <span className="block truncate text-[11.5px] font-semibold text-navy-deep" style={{ maxWidth: 210 }} title={r.primary}>{r.primary}</span>
                    {r.secondary && r.secondary !== r.primary && (
                      <span className="block truncate text-[10px] text-ink-secondary" style={{ maxWidth: 210 }} title={r.secondary}>{r.secondary}</span>
                    )}
                  </th>
                  {columns.map((col) => {
                    const cell = r.byCol.get(col.col)
                    if (!cell) return <td key={col.col} className="border-b border-r border-soft-border/60 bg-[#FCFDFE]" />
                    const meta = STATUS_META[cell.status]
                    const gap = deckGap(cell)
                    const fetched = isFetched(cell)
                    // Honest short tag for a blank: the curated blankTag ("1/n data
                    // not found" / "Not in PPT" / "IRDAI"), or a sensible default
                    // from the status. A tagged blank reads as a resolved, calm-grey
                    // state with the full reason on hover/click — not a pending blank.
                    const tag = fetched
                      ? null
                      : cell.blankTag
                        ?? (cell.status === 'web_blocked' ? 'IRDAI' : cell.status === 'not_in_ppt' ? 'Not in PPT' : null)
                    const q = gap || tag ? QA.grey : QA[meta.color]
                    const txt = cellDisplay(cell, raw)
                    const isSel = selected?.id === cell.id
                    const isFormula = cell.cellKind === 'formula'
                    const pipe = PIPELINE[pipelineOf(cell)]
                    const title = fetched
                      ? `${cell.metricLabel} · ${cell.period} — ${meta.label}`
                      : gap
                        ? `${cell.metricLabel} · ${cell.period} — not published in the investor deck; comes from ${gap.sourceLabel}`
                        : tag
                          ? `${cell.metricLabel} · ${cell.period} — ${tag}: ${cell.note}`
                          : `${cell.metricLabel} · ${cell.period} — missing · expected from ${pipe.label}`
                    return (
                      <td key={col.col} className="border-b border-r border-soft-border/60 p-0">
                        <button
                          type="button"
                          onClick={() => onSelect(cell)}
                          title={title}
                          className={`relative flex h-full min-h-[34px] w-full items-center ${fetched ? 'justify-end text-right' : 'justify-center'} px-2 py-1 tabular-nums transition-all ${q.cell} hover:brightness-95`}
                          style={isSel ? { boxShadow: `inset 0 0 0 2px ${q.dot}` } : undefined}
                        >
                          {isFormula && <FunctionSquare className="absolute left-1 top-1 h-2.5 w-2.5 opacity-40" />}
                          {fetched ? (
                            <span className={`text-[11.5px] font-semibold ${q.text}`}>{txt}</span>
                          ) : gap ? (
                            // The deck doesn't carry this number — say so, plainly,
                            // instead of implying a "• PPT" pull is still pending.
                            <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-slate-400">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: q.dot }} />not in PPT
                            </span>
                          ) : tag ? (
                            // Honest short reason ("1/n data not found" / "Not in PPT"
                            // / "IRDAI"), resolved grey — full reason on hover/click.
                            <span className="inline-flex items-center gap-1 text-[8px] font-semibold tracking-tight text-slate-400">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />{tag}
                            </span>
                          ) : (
                            // Empty cell → show which pipeline should have filled it.
                            <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-ink-secondary/75">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pipe.color }} />{pipe.short}
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function AuditSpreadsheet({ model }: { model: AuditModel }) {
  const sheets = model.groups
  const [active, setActive] = useState(sheets[0]?.sheet ?? '')
  const [raw, setRaw] = useState(false)
  const [selected, setSelected] = useState<AuditCell | null>(null)

  const group = sheets.find((g) => g.sheet === active) ?? sheets[0]

  // Per-sheet source-pipeline coverage (fetched vs missing), for the summary row.
  // Blanks the deck doesn't publish are pulled into their own "not in deck" count
  // so they don't inflate the PPT pipeline's "missing" tally with pulls that can
  // never happen.
  const pipeStats = useMemo(() => {
    const pipes: Record<PipelineKey, { fetched: number; total: number }> = {
      irdai: { fetched: 0, total: 0 }, company: { fetched: 0, total: 0 },
      screener: { fetched: 0, total: 0 }, capitaliq: { fetched: 0, total: 0 },
    }
    let notInDeck = 0
    for (const c of group?.cells ?? []) {
      if (deckGap(c)) { notInDeck += 1; continue }
      const p = pipelineOf(c)
      pipes[p].total += 1
      if (isFetched(c)) pipes[p].fetched += 1
    }
    return { pipes, notInDeck }
  }, [group])

  if (!sheets.length) return null

  return (
    <div className="space-y-3">
      {/* Excel-style sheet tabs */}
      <div className="flex flex-wrap items-end gap-1 border-b border-soft-border">
        {sheets.map((g) => {
          const on = g.sheet === active
          const filled = g.stats.valuePresent
          return (
            <button
              key={g.sheet}
              type="button"
              onClick={() => { setActive(g.sheet); setSelected(null) }}
              className={[
                'group relative -mb-px flex items-center gap-1.5 rounded-t-lg border px-3 py-1.5 text-[12px] transition-colors',
                on
                  ? 'border-soft-border border-b-white bg-white font-semibold text-navy-deep'
                  : 'border-transparent bg-transparent font-medium text-ink-secondary hover:bg-ice/60 hover:text-navy-primary',
              ].join(' ')}
            >
              {on && <span className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-gradient-to-r from-champagne to-champagne-deep" />}
              {g.sheet}
              <span className={`rounded-full px-1.5 text-[9.5px] font-semibold tabular-nums ${on ? 'bg-emerald-soft text-emerald' : 'bg-ice text-ink-secondary'}`}>
                {filled}/{g.stats.total}
              </span>
            </button>
          )
        })}
      </div>

      {group.role === 'market_quote' ? (
        // The Historical Stock Movement sheet is a transposed, date-by-row series
        // (Close / Total Qty / Deliverable Qty / % Delivered) the generic grid
        // can't represent — it gets a dedicated, workbook-faithful renderer.
        <HistoricalStockMovement />
      ) : group.role === 'analyst_coverage' ? (
        // Analyst coverage is a record list — each row a dated broker note with
        // nine attributes, not a period pivot — so it also gets a dedicated,
        // workbook-faithful renderer (Company/Broker/Date/Reco/CMP/Price/Target/
        // Upside×2, in four company blocks closed by Average rows).
        <AnalystCoverage group={group} />
      ) : (
      <>
      {/* ───────── grid view ───────── */}

      {/* Toolbar — value mode + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-secondary">{group.dashboardSection || group.role}</span>
          <span className="text-ink-secondary/40">·</span>
          <span className="text-[11px] text-ink-secondary">{group.dimensions}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-full border border-soft-border bg-ice/60 p-0.5">
            {([['final', 'Final value'], ['raw', 'As printed']] as const).map(([v, label]) => {
              const on = (v === 'raw') === raw
              return (
                <button key={v} type="button" onClick={() => setRaw(v === 'raw')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${on ? 'bg-white text-navy-deep shadow-soft' : 'text-ink-secondary hover:text-navy-primary'}`}>
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-ink-secondary">
            {LEGEND.map((c) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: QA[c].dot, opacity: 0.85 }} />{QA[c].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Source-pipeline coverage for this sheet — where each source maps and
          how much of it has been fetched. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-soft-border bg-ice/40 px-3 py-2">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-secondary">Source pipelines</span>
        {(['irdai', 'company', 'screener', 'capitaliq'] as PipelineKey[]).map((k) => {
          const p = PIPELINE[k]
          const st = pipeStats.pipes[k]
          if (!st.total) return null
          const miss = st.total - st.fetched
          return (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px]" title={p.what}>
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="font-semibold text-navy-deep">{p.label}</span>
              <span className="text-emerald">{st.fetched} fetched</span>
              {miss > 0 && <><span className="text-ink-secondary/40">·</span><span className="text-coral">{miss} missing</span></>}
            </span>
          )
        })}
        {pipeStats.notInDeck > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px]"
            title="Overall health market share isn't given a value in the investor decks (the KPI page shows the retail health share only) — it comes from the GI Council segment report, so a blank here is not a pending deck pull."
          >
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            <span className="font-semibold text-navy-deep">Not in deck</span>
            <span className="text-ink-secondary">{pipeStats.notInDeck} cells</span>
          </span>
        )}
      </div>

      {/* Grid + (optional) detail */}
      <div className={selected ? 'grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]' : ''}>
        <SheetGrid group={group} raw={raw} selected={selected} onSelect={setSelected} />
        {selected && (
          <div className="lg:sticky lg:top-2 lg:self-start">
            <CellDetail cell={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
