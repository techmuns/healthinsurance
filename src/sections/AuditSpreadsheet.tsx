import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, FunctionSquare, Info, Building2, X, ArrowLeft, FileCheck2 } from 'lucide-react'
import {
  STATUS_META, formatValue, formatRaw,
  type AuditModel, type AuditGroup, type AuditCell, type QaColor,
} from '@/lib/extractedDataAudit'
import { companyColor, isCompanyEntity, companyShortName } from '@/lib/companyColors'
import { LISTED_INSURERS, LISTED_INSURER_IDS } from '@/lib/listedInsurers'
import { useAuditView, type AuditView } from '@/lib/auditView'
import { classifySource, sourceHref, isLinkable } from '@/lib/sourceHealth'
import type { AuditFocus } from '@/insights/sourceMap'
import { HistoricalStockMovement } from '@/sections/HistoricalStockMovement'
import { AnalystCoverage } from '@/sections/AnalystCoverage'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { CustomizeBar, type TrayChip } from '@/components/CustomizeBar'
import { CompanyFilter, type CompanyOption } from '@/components/CompanyFilter'
import { useVerifyOptional } from '@/state/verifyState'
import type { VerifyResult, VerifyRow, VerifyStatus } from '@/lib/excelVerify'

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
  info: { cell: 'bg-soft-blue', ring: 'rgba(61,125,214,0.20)', text: 'text-navy-primary', dot: '#3D7DD6', label: 'Calculated' },
}
const LEGEND: QaColor[] = ['green', 'yellow', 'info', 'red']

// ── Verification overlay (Excel Upload Verifier) ─────────────────────────────
// When the grid is in verification view, matched cells go neutral and only
// problem cells are tinted by their verify status — distinct, soft premium tones.
// Counts/classification are entirely the verifier's; this is styling only.
const V_OVERLAY: Record<VerifyStatus, { cell: string; text: string; dot: string; ring: string; label: string }> = {
  matched:           { cell: 'bg-white',         text: 'text-ink-primary',  dot: '#2F855A', ring: 'transparent',             label: 'Matched' },
  mismatch:          { cell: 'bg-coral-soft',    text: 'text-coral',        dot: '#C75D54', ring: 'rgba(199,93,84,0.55)',   label: 'Mismatched' },
  source_basis:      { cell: 'bg-gold-soft',     text: 'text-gold',         dot: '#B7791F', ring: 'rgba(183,121,31,0.5)',   label: 'Source / basis differs' },
  missing_upload:    { cell: 'bg-soft-blue/70',  text: 'text-navy-primary', dot: '#5B7FB0', ring: 'rgba(91,127,176,0.55)',  label: 'Blank in your file' },
  missing_dashboard: { cell: 'bg-lavender-soft', text: 'text-lavender',     dot: '#7A6CA6', ring: 'rgba(122,108,166,0.65)', label: 'Missing in dashboard' },
}
// Worst-first, with matched last — drives the verification legend/filter order.
const V_ORDER: VerifyStatus[] = ['mismatch', 'source_basis', 'missing_upload', 'missing_dashboard', 'matched']

/** Verification props threaded into the grid (built once in AuditSpreadsheet). */
interface VerifyGridProps {
  view: boolean
  map: Map<string, VerifyRow>
  filter: VerifyStatus | 'all'
  /** Cell currently doing the one-shot navigation pulse (null = none). */
  pulseId: string | null
  onBackToVerifier: () => void
}

/** Count for a verify status from the summary (drives the legend chips). */
function vCount(s: VerifyResult['summary'], k: VerifyStatus): number {
  switch (k) {
    case 'matched': return s.matched
    case 'mismatch': return s.mismatch
    case 'source_basis': return s.sourceBasis
    case 'missing_upload': return s.missingUpload
    case 'missing_dashboard': return s.missingDashboard
  }
}

// ── Source pipelines ─────────────────────────────────────────────────────────
// Every template cell is fed by one of these acquisition pipelines. When a cell
// is empty, this tells the reviewer which pipeline should have filled it.
type PipelineKey = 'irdai' | 'company' | 'exchange' | 'computed' | 'aggregator' | 'capitaliq'
const PIPELINE: Record<PipelineKey, { label: string; short: string; color: string; what: string }> = {
  irdai: { label: 'IRDAI portal', short: 'IRDAI', color: '#27457E', what: 'Industry & regulatory disclosures (GI Council / IRDAI NL forms, monthly business figures)' },
  company: { label: 'Company website · PPT', short: 'PPT', color: '#168E8E', what: 'Company investor presentations & annual reports' },
  exchange: { label: 'NSE / BSE', short: 'Exchange', color: '#3D7DD6', what: 'Stock-exchange filings & quotes — market price, market cap and the quarterly shareholding pattern (the official register, not a third-party copy).' },
  computed: { label: 'Computed in-sheet', short: 'Computed', color: '#6E7BD6', what: 'Calculated from other cells in the sheet (e.g. P/E = market cap ÷ profit, P/GWP = market cap ÷ GWP). Not fetched — derived from the sourced inputs.' },
  aggregator: { label: 'Broker aggregator', short: 'Aggregator', color: '#B68B3A', what: 'Analyst targets & ratings from a public research aggregator (Trendlyne) — no official equivalent exists.' },
  // Enterprise value & long-run average P/E were built with the S&P Capital IQ
  // Excel plug-in in the source workbook (the CIQ() / CIQAVG() formulas). There
  // is no login-free public equivalent, so these stay blank by design. A cell
  // that is blank ONLY because one of these CIQ inputs is missing is attributed
  // here too — labelled "Capital IQ", not counted as a fetch gap we could close.
  capitaliq: { label: 'S&P Capital IQ', short: 'Capital IQ', color: '#7A6CA6', what: 'Enterprise value & 3-year average P/E — from the S&P Capital IQ Excel plug-in in the source workbook. No login-free public source, so these (and any cell that needs them) are not auto-fetched.' },
}
// Fallback acquisition pipeline by sheet role — used only when the metric itself
// doesn't pin a more precise source (handled first in pipelineOf).
const ROLE_PIPELINE: Record<string, PipelineKey> = {
  industry_premium: 'irdai',
  company_premium_quarterly: 'irdai',
  company_premium_monthly: 'irdai',
  distribution: 'irdai',
  company_financials: 'company',
  management_commentary: 'company',
  analyst_coverage: 'aggregator',
  valuation: 'company', // Comps financial inputs; market/multiples/EV pinned by metric below
  shareholding: 'exchange',
  market_quote: 'exchange',
  market_cap: 'exchange',
}
// Metrics built with the S&P Capital IQ plug-in — no login-free public source.
const CAPITALIQ_METRICS = new Set(['enterprise_value', 'pe_3yr_avg'])
// Exchange-sourced market data (NSE/BSE quotes).
const EXCHANGE_METRICS = new Set(['market_cap', 'share_price', 'close_price', 'traded_quantity', 'deliverable_quantity'])
// Valuation multiples computed in-sheet from market cap + reported financials.
const COMPUTED_RATIO_RE = /^(price_to_|pe_|pb_|roe_)/
function pipelineOf(cell: AuditCell): PipelineKey {
  const m = cell.metricId
  // Capital IQ: the CIQ-plug-in metrics themselves, or a cell left blank ONLY
  // because one of its inputs is a Capital-IQ-only metric (attribute the gap to
  // CIQ, not to a public source we could otherwise fetch).
  if (CAPITALIQ_METRICS.has(m)) return 'capitaliq'
  if (!isFetched(cell) && (cell.inputs ?? []).some((i) => i.metricId && CAPITALIQ_METRICS.has(i.metricId))) return 'capitaliq'
  // Official stock-exchange filings & quotes (shareholding register, market cap/price).
  if (m.startsWith('shareholding_') || EXCHANGE_METRICS.has(m)) return 'exchange'
  // Broker aggregator (analyst coverage).
  if (m.startsWith('analyst_')) return 'aggregator'
  // Valuation multiples are computed in-sheet, not fetched from anywhere.
  if (cell.cellKind === 'formula' && COMPUTED_RATIO_RE.test(m)) return 'computed'
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

interface GridCol { col: string; period: string; entity: string; entityId: string; metric: string; label: string; top: string }
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
  const colMap = new Map<string, { period: string; entity: string; entityId: string; metric: string }>()
  for (const c of cells) {
    const col = parseRef(c.cellRef)!.col
    if (!colMap.has(col)) colMap.set(col, { period: c.period || col, entity: c.entityLabel || '', entityId: c.entityId || '', metric: c.metricLabel || '' })
  }
  let columns: GridCol[] = [...colMap.entries()]
    .map(([col, v]) => ({ col, period: v.period, entity: v.entity, entityId: v.entityId, metric: v.metric, label: v.period, top: col }))
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
function entityBands(columns: GridCol[]): { entity: string; entityId: string; span: number }[] {
  const bands: { entity: string; entityId: string; span: number }[] = []
  for (const c of columns) {
    const last = bands[bands.length - 1]
    if (last && last.entityId === c.entityId) last.span += 1
    else bands.push({ entity: c.entity, entityId: c.entityId, span: 1 })
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

function CellDetail({ cell, onClose, verifyRow, onBackToVerifier }: { cell: AuditCell; onClose: () => void; verifyRow?: VerifyRow; onBackToVerifier?: () => void }) {
  const meta = STATUS_META[cell.status]
  const q = QA[meta.color]
  const fetched = isFetched(cell)
  const gap = deckGap(cell)
  // Blocked / not-found blank — figure exists but the pipeline can't pull it;
  // a resolved, calm-grey state (with the reason + short tag), not a red "missing".
  const notApplicable = cell.status === 'not_applicable'
  const blocked = !fetched && (cell.status === 'web_blocked' || cell.status === 'not_in_ppt')
  const blockTag = cell.blankTag
    ?? (cell.status === 'web_blocked' ? 'IRDAI' : cell.status === 'not_in_ppt' ? 'Not in PPT' : 'Awaiting source file')
  // not-applicable (the insurer didn't exist this period) renders calm grey with NO
  // source tag — a source pipeline / "expected source" there would wrongly imply a
  // pending pull for a number that is never coming (Neha, 2026-06-22).
  const calm = gap || blocked || notApplicable
  const pipe = PIPELINE[pipelineOf(cell)]
  return (
    <div className="flex flex-col overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-card">
      <div className="flex items-start justify-between gap-2 px-4 py-3" style={{ background: 'linear-gradient(135deg,#172B4D,#27457E)' }}>
        <div className="leading-tight">
          <p className="font-mono text-[10px] uppercase tracking-wide text-white/55">Cell {cell.cellRef} · {cell.sheet}</p>
          <p className="mt-0.5 font-display text-[14.5px] text-white">{cell.metricLabel}</p>
          <p className="text-[11px] text-white/65">{cell.entityLabel} · {cell.period}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" title="Close" className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
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
          {fetched ? 'Fetched & verified' : gap ? 'Not published in the investor deck' : blocked ? blockTag : notApplicable ? 'Not applicable' : 'Not fetched — cell empty'}
        </span>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${calm ? 'bg-slate-100 text-slate-500' : `${q.cell} ${q.text}`}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: calm ? '#94A3B8' : q.dot }} />{gap ? 'Not in deck' : blocked ? blockTag : notApplicable ? 'Not applicable' : meta.label}
        </span>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-3" style={{ maxHeight: '68vh' }}>
        {/* Verification block — uploaded vs dashboard, when arrived via the verifier. */}
        {verifyRow && (
          <div className="rounded-lg border border-soft-border bg-ice/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: V_OVERLAY[verifyRow.status].dot }}>
                <span className="h-2 w-2 rounded-full" style={{ background: V_OVERLAY[verifyRow.status].dot }} />
                {V_OVERLAY[verifyRow.status].label}
              </span>
              {verifyRow.diffPct != null && (
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: V_OVERLAY[verifyRow.status].dot }}>
                  {verifyRow.diffPct > 0 ? '+' : ''}{(verifyRow.diffPct * 100).toFixed(1)}% vs dashboard
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-soft-border bg-white px-2.5 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Your file</p>
                <p className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-navy-deep">{verifyRow.uploadedDisplay}</p>
              </div>
              <div className="rounded-md border border-soft-border bg-white px-2.5 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Dashboard</p>
                <p className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-navy-deep">{verifyRow.dashboardDisplay}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-secondary">{verifyRow.reason}</p>
            {onBackToVerifier && (
              <button type="button" onClick={onBackToVerifier} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-navy-primary/30 bg-soft-blue px-3 py-1 text-[11px] font-semibold text-navy-primary transition-colors hover:border-navy-primary/50">
                <ArrowLeft className="h-3 w-3" /> Back to Verifier row
              </button>
            )}
          </div>
        )}
        {/* Source pipeline + source row are meaningless for a not-applicable cell
            (the insurer didn't exist) — show only the reason, never a source tag. */}
        {!notApplicable && (<>
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
            isLinkable(cell.sourceUrl) ? (
              <a href={sourceHref(cell.sourceUrl)!} target="_blank" rel="noreferrer" title={classifySource(cell.sourceUrl).hint} className="inline-flex items-start gap-1 text-navy-primary hover:underline">
                {cell.sourceName}<ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
            ) : <span>{cell.sourceName}</span>
          ) : gap ? <span>{gap.sourceLabel}</span> : <span className="text-ink-secondary">Not defined</span>}
          {cell.sourceFile && <p className="mt-0.5 break-all font-mono text-[10px] text-ink-secondary/80">{cell.sourceFile}</p>}
        </DetailField>
        </>)}

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
        ) : notApplicable ? (
          <DetailField label="Not applicable">
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
type Grid = ReturnType<typeof buildGrid>

// Apply the view (hidden columns / hidden companies + column order) to the
// sheet's columns. On company-block sheets, companies are kept contiguous (so
// the colour separation never breaks) — reordering happens within a company,
// and a company's place is set by its earliest column in the order.
function viewColumns(columns: GridCol[], view: AuditView, entityByColumn: boolean): GridCol[] {
  const rank = new Map(view.order.map((k, i) => [k, i]))
  const r = (c: GridCol) => (rank.has(c.col) ? rank.get(c.col)! : Number.MAX_SAFE_INTEGER)
  const cols = columns.filter((c) => !view.isHiddenColumn(c.col) && !view.isHiddenCompany(c.entityId))
  if (!entityByColumn) return cols.slice().sort((a, b) => r(a) - r(b))
  const byE = new Map<string, GridCol[]>()
  for (const c of cols) (byE.get(c.entityId) ?? byE.set(c.entityId, []).get(c.entityId)!).push(c)
  const ents = [...byE.keys()].sort((a, b) => Math.min(...byE.get(a)!.map(r)) - Math.min(...byE.get(b)!.map(r)))
  return ents.flatMap((e) => byE.get(e)!.slice().sort((a, b) => r(a) - r(b)))
}

function SheetGrid({ grid, raw, selected, onSelect, view, verify }: { grid: Grid; raw: boolean; selected: AuditCell | null; onSelect: (c: AuditCell) => void; view: AuditView; verify?: VerifyGridProps }) {
  const { rows, entityByColumn } = grid
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const columns = viewColumns(grid.columns, view, entityByColumn)
  const bands = entityByColumn ? entityBands(columns) : []
  const keys = columns.map((c) => c.col)
  // The first visible column of each company block (after the first) — gets a
  // stronger left divider so companies read as clearly separate sections.
  const blockStart = new Set<string>()
  if (entityByColumn) {
    let prev: string | undefined
    for (const c of columns) {
      if (prev !== undefined && c.entityId !== prev) blockStart.add(c.col)
      prev = c.entityId
    }
  }

  // Drag-to-reorder — constrained to within a company on the block sheets, so
  // dragging can rearrange a company's periods but never scramble the groups.
  const sameBand = (aKey: string, bEntityId: string) => {
    if (!entityByColumn) return true
    const a = columns.find((c) => c.col === aKey)
    return a ? a.entityId === bEntityId : false
  }
  const canDrop = (target: GridCol) => dragKey != null && dragKey !== target.col && sameBand(dragKey, target.entityId)
  const onColDrop = (target: GridCol) => {
    if (canDrop(target)) view.reorder(dragKey!, target.col)
    setDragKey(null)
    setOverKey(null)
  }
  const move = (key: string, dir: -1 | 1) => {
    const i = keys.indexOf(key)
    const j = i + dir
    if (i === -1 || j < 0 || j >= keys.length) return
    if (entityByColumn && columns[i].entityId !== columns[j].entityId) return
    view.swap(key, keys[j])
  }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  if (!grid.columns.length || !rows.length) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12px] text-ink-secondary">No template cells reconstructable for this sheet.</div>
  }
  if (!columns.length) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12px] text-ink-secondary">Everything is hidden — use the <span className="font-semibold text-navy-primary">Hidden</span> tray above to restore a column or company.</div>
  }

  // Soft, company-tinted left divider for a block-start column.
  const dividerStyle = (col: GridCol): React.CSSProperties | undefined =>
    blockStart.has(col.col) ? { borderLeft: `2px solid ${companyColor(col.entityId).border}` } : undefined

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
              {bands.map((b, i) => {
                const cc = companyColor(b.entityId)
                return (
                  <th
                    key={`${b.entityId}-${i}`}
                    colSpan={b.span}
                    className="group/band border-b border-r border-soft-border px-2 py-1 text-center text-[10.5px] font-bold"
                    style={{ background: cc.tint, borderBottom: `2.5px solid ${cc.key}`, color: cc.text, ...(i > 0 ? { borderLeft: `2px solid ${cc.border}` } : null) }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: cc.key }} />
                      {b.entity || '—'}
                      <button
                        type="button"
                        title={`Hide ${b.entity || 'this company'}`}
                        onClick={() => view.hideCompany(b.entityId)}
                        className="rounded p-0.5 opacity-0 transition-opacity hover:bg-white/70 group-hover/band:opacity-100"
                        style={{ color: cc.text }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </th>
                )
              })}
            </tr>
          )}
          <tr>
            <th className="sticky left-0 z-30 border-b border-r border-soft-border bg-[#E7EEFA] px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-navy-primary/80" style={{ minWidth: 220 }}>
              Line item
            </th>
            {columns.map((c) => {
              const isDragging = dragKey === c.col
              const isOver = overKey === c.col && canDrop(c)
              return (
                <th
                  key={c.col}
                  draggable
                  onDragStart={(e) => { setDragKey(c.col); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.col) } catch { /* noop */ } }}
                  onDragOver={(e) => { if (canDrop(c)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverKey(c.col) } }}
                  onDragLeave={() => setOverKey((k) => (k === c.col ? null : k))}
                  onDrop={(e) => { e.preventDefault(); onColDrop(c) }}
                  onDragEnd={() => { setDragKey(null); setOverKey(null) }}
                  className="group/col relative cursor-grab border-b border-r border-soft-border bg-[#EDF3FC] px-2.5 py-1 text-center active:cursor-grabbing"
                  style={{ minWidth: 82, opacity: isDragging ? 0.45 : 1, ...dividerStyle(c), ...(isOver ? { boxShadow: 'inset 2px 0 0 #27457E' } : null) }}
                  title="Drag to reorder"
                >
                  {/* Hover controls — move left · hide · move right */}
                  <span className="absolute inset-x-0 top-0 z-10 hidden items-center justify-center gap-0.5 bg-white/85 py-px group-hover/col:flex">
                    <button type="button" title="Move left" onMouseDown={stop} onClick={(e) => { stop(e); move(c.col, -1) }} className="rounded p-0.5 text-ink-secondary hover:bg-ice hover:text-navy-primary"><ChevronLeft className="h-3 w-3" /></button>
                    <button type="button" title={`Hide ${c.label}`} onMouseDown={stop} onClick={(e) => { stop(e); view.hideColumn(c.col) }} className="rounded p-0.5 text-ink-secondary hover:bg-coral-soft hover:text-coral"><X className="h-3 w-3" /></button>
                    <button type="button" title="Move right" onMouseDown={stop} onClick={(e) => { stop(e); move(c.col, 1) }} className="rounded p-0.5 text-ink-secondary hover:bg-ice hover:text-navy-primary"><ChevronRight className="h-3 w-3" /></button>
                  </span>
                  <span className="block font-mono text-[8.5px] font-medium text-ink-secondary/60">{c.top}</span>
                  <span className="block text-[11px] font-bold text-navy-deep">{c.label}</span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const showSection = r.section && r.section !== lastSection
            lastSection = r.section || lastSection
            const zebra = ri % 2 === 1
            return (
              <Fragment key={r.rowNum}>
                {showSection && (
                  <tr>
                    <td colSpan={columns.length + 1} className="border-y border-soft-border bg-gradient-to-r from-navy-primary/[0.09] via-navy-primary/[0.05] to-transparent px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-navy-primary">
                      {r.section}
                    </td>
                  </tr>
                )}
                <tr className="group">
                  <th className={`sticky left-0 z-10 border-b border-r border-soft-border ${zebra ? 'bg-[#F7FAFD]' : 'bg-white'} px-3 py-1.5 text-left align-middle group-hover:bg-ice`}>
                    <span className="block truncate text-[11.5px] font-semibold text-navy-deep" style={{ maxWidth: 210 }} title={r.primary}>{r.primary}</span>
                    {r.secondary && r.secondary !== r.primary && (
                      <span className="block truncate text-[10px] text-ink-secondary" style={{ maxWidth: 210 }} title={r.secondary}>{r.secondary}</span>
                    )}
                  </th>
                  {columns.map((col) => {
                    const cell = r.byCol.get(col.col)
                    if (!cell) return <td key={col.col} className={`border-b border-r border-soft-border/60 ${zebra ? 'bg-[#FAFCFE]' : 'bg-[#FCFDFE]'}`} style={dividerStyle(col)} />
                    const isSel = selected?.id === cell.id        // persistent selection (blue ring)
                    const isPulsing = verify?.pulseId === cell.id // one-shot navigation pulse
                    // ── Verification overlay cell: matched → neutral; only issues tinted ──
                    if (verify?.view) {
                      const vrow = verify.map.get(cell.id)
                      const ov = vrow ? V_OVERLAY[vrow.status] : null
                      const isIssue = !!vrow && vrow.status !== 'matched'
                      const dimmed = verify.filter !== 'all' && !isSel && (!vrow || vrow.status !== verify.filter)
                      const valTxt = cellDisplay(cell, raw)
                      const ring = (isSel || isPulsing)
                        ? { boxShadow: 'inset 0 0 0 2px #1E4079' }
                        : isIssue && ov ? { boxShadow: `inset 0 0 0 1px ${ov.ring}` } : undefined
                      return (
                        <td key={col.col} className="border-b border-r border-soft-border/60 p-0" style={dividerStyle(col)}>
                          <button
                            type="button"
                            data-cell-id={cell.id}
                            onClick={() => onSelect(cell)}
                            title={vrow ? `${cell.metricLabel} · ${cell.period} — ${V_OVERLAY[vrow.status].label}` : `${cell.metricLabel} · ${cell.period}`}
                            className={`relative flex h-full min-h-[34px] w-full items-center justify-end px-2 py-1 text-right tabular-nums transition-all ${isIssue && ov ? ov.cell : 'bg-white'} ${dimmed ? 'opacity-30' : ''} hover:brightness-95`}
                            style={ring}
                          >
                            {isPulsing && <span className="pointer-events-none absolute inset-0 animate-ping rounded-sm bg-navy-primary/10" />}
                            {isIssue && ov && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: ov.dot }} />}
                            <span className={`text-[11.5px] ${isIssue && ov ? `font-semibold ${ov.text}` : valTxt ? 'font-medium text-ink-primary/75' : 'text-ink-secondary/30'}`}>
                              {valTxt || (vrow?.status === 'missing_dashboard' ? '—' : '·')}
                            </span>
                          </button>
                        </td>
                      )
                    }
                    const meta = STATUS_META[cell.status]
                    const gap = deckGap(cell)
                    const fetched = isFetched(cell)
                    const notApplicable = cell.status === 'not_applicable'
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
                    const isFormula = cell.cellKind === 'formula'
                    const pipe = PIPELINE[pipelineOf(cell)]
                    const title = fetched
                      ? `${cell.metricLabel} · ${cell.period} — ${meta.label}`
                      : gap
                        ? `${cell.metricLabel} · ${cell.period} — not published in the investor deck; comes from ${gap.sourceLabel}`
                        : notApplicable
                          ? `${cell.metricLabel} · ${cell.period} — not applicable: ${cell.note}`
                        : tag
                          ? `${cell.metricLabel} · ${cell.period} — ${tag}: ${cell.note}`
                          : `${cell.metricLabel} · ${cell.period} — missing · expected from ${pipe.label}`
                    return (
                      <td key={col.col} className="border-b border-r border-soft-border/60 p-0" style={dividerStyle(col)}>
                        <button
                          type="button"
                          data-cell-id={cell.id}
                          onClick={() => onSelect(cell)}
                          title={title}
                          className={`relative flex h-full min-h-[34px] w-full items-center ${fetched ? 'justify-end text-right' : 'justify-center'} px-2 py-1 tabular-nums transition-all ${q.cell} hover:brightness-95`}
                          style={isPulsing ? { boxShadow: 'inset 0 0 0 2px #1E4079' } : isSel ? { boxShadow: `inset 0 0 0 2px ${q.dot}` } : undefined}
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
                          ) : notApplicable ? (
                            // Insurer didn't exist this period — kept clean, with no
                            // source tag (a pipeline pill would imply a pending pull);
                            // the full reason shows on hover / click.
                            <span className="text-[11px] text-slate-300">—</span>
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

// ── Company-filter empty state ───────────────────────────────────────────────
function CompanyEmptyState({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center">
      <p className="text-[12.5px] text-ink-secondary">
        <span className="font-semibold text-navy-deep">{label}</span> doesn’t appear on this sheet.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-3 py-1 text-[11px] font-medium text-navy-primary shadow-soft transition-colors hover:border-navy-primary/30"
      >
        <Building2 className="h-3.5 w-3.5" /> Show all companies
      </button>
    </div>
  )
}

// ── Grid view (one generic, period-pivot sheet) ──────────────────────────────
// Keyed by sheet + company in the page, so selection/drag state reset cleanly
// when the sheet or company filter changes. The saved "Customize View" is keyed
// by sheet only, so it survives a company-filter change and reloads on return.
function GridView({ group, fullColumns, companyLabel, isFiltered, raw, onRawChange, onClearCompany, verify, selected, onSelect }: {
  group: AuditGroup
  fullColumns: GridCol[]
  companyLabel: string
  isFiltered: boolean
  raw: boolean
  onRawChange: (v: boolean) => void
  onClearCompany: () => void
  verify?: VerifyGridProps
  /** Selection is owned by the page so a verifier-row click can open the panel. */
  selected: AuditCell | null
  onSelect: (c: AuditCell | null) => void
}) {
  const grid = useMemo(() => buildGrid(group), [group])
  const allCols = useMemo(() => fullColumns.map((c) => c.col), [fullColumns])
  const view = useAuditView(group.sheet, allCols)

  // Labels for the Hidden tray come from the FULL sheet, so a hidden column /
  // company still has a readable chip even when the company filter is narrowing.
  const fullEntityByColumn = useMemo(() => new Set(fullColumns.map((c) => c.entityId).filter(Boolean)).size > 1, [fullColumns])
  const colMeta = useMemo(() => new Map(fullColumns.map((c) => [c.col, c] as const)), [fullColumns])
  const companyMeta = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of fullColumns) if (c.entityId) m.set(c.entityId, c.entity)
    return m
  }, [fullColumns])

  const chips: TrayChip[] = [
    ...view.hiddenCompanies
      .filter((id) => companyMeta.has(id))
      .map((id) => ({ id, kind: 'company' as const, label: companyShortName(id, companyMeta.get(id)), color: companyColor(id).key })),
    ...view.hiddenColumns
      .filter((k) => colMeta.has(k))
      .map((k) => {
        const c = colMeta.get(k)!
        const label = fullEntityByColumn && isCompanyEntity(c.entityId) ? `${companyShortName(c.entityId, c.entity)} · ${c.label}` : c.label
        return { id: k, kind: 'column' as const, label }
      }),
  ]
  const restore = (chip: TrayChip) => (chip.kind === 'company' ? view.showCompany(chip.id) : view.showColumn(chip.id))

  // Per-sheet source-pipeline coverage (fetched vs missing), for the summary row.
  // Blanks the deck doesn't publish are pulled into their own "not in deck" count
  // so they don't inflate the PPT pipeline's "missing" tally with pulls that can
  // never happen. Honours the company filter (counts what's shown).
  const pipeStats = useMemo(() => {
    const pipes: Record<PipelineKey, { fetched: number; total: number }> = {
      irdai: { fetched: 0, total: 0 }, company: { fetched: 0, total: 0 },
      exchange: { fetched: 0, total: 0 }, computed: { fetched: 0, total: 0 },
      aggregator: { fetched: 0, total: 0 }, capitaliq: { fetched: 0, total: 0 },
    }
    let notInDeck = 0
    for (const c of group.cells) {
      if (deckGap(c)) { notInDeck += 1; continue }
      const p = pipelineOf(c)
      pipes[p].total += 1
      if (isFetched(c)) pipes[p].fetched += 1
    }
    return { pipes, notInDeck }
  }, [group])

  if (isFiltered && !group.cells.length) {
    return <CompanyEmptyState label={companyLabel} onClear={onClearCompany} />
  }

  return (
    <>
      {/* Toolbar — context · value mode · legend */}
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
                <button key={v} type="button" onClick={() => onRawChange(v === 'raw')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-normal ease-premium ${on ? 'bg-white text-navy-deep shadow-soft' : 'text-ink-secondary hover:text-navy-primary'}`}>
                  {label}
                </button>
              )
            })}
          </div>
          {!verify?.view && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-ink-secondary">
              {LEGEND.map((c) => (
                <span key={c} className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: QA[c].dot, opacity: 0.85 }} />{QA[c].label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Source-pipeline coverage for this sheet — where each source maps and
          how much of it has been fetched. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-soft-border bg-ice/30 px-3 py-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-secondary">Source pipelines</span>
        {(['irdai', 'company', 'exchange', 'computed', 'aggregator', 'capitaliq'] as PipelineKey[]).map((k) => {
          const p = PIPELINE[k]
          const st = pipeStats.pipes[k]
          if (!st.total) return null
          const miss = st.total - st.fetched
          return (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-2 py-0.5 text-[10.5px]" title={p.what}>
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="font-semibold text-navy-deep">{p.label}</span>
              <span className="text-emerald">{st.fetched} fetched</span>
              {miss > 0 && <><span className="text-ink-secondary/40">·</span><span className="text-coral">{miss} missing</span></>}
            </span>
          )
        })}
        {pipeStats.notInDeck > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-2 py-0.5 text-[10.5px]"
            title="Overall health market share isn't given a value in the investor decks (the KPI page shows the retail health share only) — it comes from the GI Council segment report, so a blank here is not a pending deck pull."
          >
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            <span className="font-semibold text-navy-deep">Not in deck</span>
            <span className="text-ink-secondary">{pipeStats.notInDeck} cells</span>
          </span>
        )}
      </div>

      {/* Customize View — the hidden-items tray + Save / Reset. Tap × on a
          company band or a column header to tidy the view; restore from here. */}
      <CustomizeBar
        chips={chips}
        onRestore={restore}
        onRestoreAll={view.restoreAll}
        onSave={view.save}
        onReset={view.reset}
        dirty={view.dirty}
        customized={view.customized}
        hasSaved={view.hasSaved}
      />

      {/* Grid + (optional) detail */}
      <div className={selected ? 'grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]' : ''}>
        <SheetGrid grid={grid} raw={raw} selected={selected} onSelect={onSelect} view={view} verify={verify} />
        {selected && (
          <div className="lg:sticky lg:top-2 lg:self-start">
            <CellDetail
              cell={selected}
              onClose={() => onSelect(null)}
              verifyRow={verify?.view ? verify.map.get(selected.id) : undefined}
              onBackToVerifier={verify?.view ? verify.onBackToVerifier : undefined}
            />
          </div>
        )}
      </div>
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function AuditSpreadsheet({ model, focus }: { model: AuditModel; focus?: AuditFocus | null }) {
  const sheets = model.groups
  const [active, setActive] = useState(sheets[0]?.sheet ?? '')
  const [raw, setRaw] = useState(false)
  const [company, setCompany] = useState('all')

  // ── Excel verification overlay (from the Verify Excel tool) ────────────────
  const vctx = useVerifyOptional()
  const verifyResult = vctx?.result ?? null
  const verifyView = !!vctx?.verifyView && !!verifyResult
  const verifyTarget = vctx?.target ?? null
  const [pulseId, setPulseId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AuditCell | null>(null)
  const [navNote, setNavNote] = useState<string | null>(null)
  const verifyMap = useMemo(() => {
    const m = new Map<string, VerifyRow>()
    if (verifyResult) for (const r of verifyResult.rows) m.set(r.id, r)
    return m
  }, [verifyResult])

  // Arriving from an insight's "Go to Data Audit": pre-select that company so its
  // rows are isolated for verification (an invalid id falls back to "all" below).
  useEffect(() => {
    if (focus?.company) setCompany(focus.company)
  }, [focus])

  // Verifier row → exact cell: switch to that tab, clear the company filter so the
  // cell can't be hidden, then scroll it into view and pulse it for ~1.8s.
  useEffect(() => {
    if (!verifyTarget) return
    setActive(verifyTarget.sheet)
    setCompany('all')
    const grp = sheets.find((g) => g.sheet === verifyTarget.sheet)
    const custom = grp?.role === 'market_quote' || grp?.role === 'analyst_coverage'
    setNavNote(custom ? 'Exact cell mapping unavailable in this section’s custom view — showing the nearest audit section.' : null)
    // Open the compact detail panel for the clicked row, and run a one-shot pulse.
    const tcell = !custom ? (grp?.cells.find((c) => c.id === verifyTarget.cellId) ?? null) : null
    setSelected(tcell)
    setPulseId(tcell ? verifyTarget.cellId : null)
    const scrollT = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-cell-id="${verifyTarget.cellId.replace(/(["\\])/g, '\\$1')}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }, 80)
    const pulseT = setTimeout(() => setPulseId(null), 1900)
    return () => { clearTimeout(scrollT); clearTimeout(pulseT) }
  }, [verifyTarget?.nonce]) // eslint react-hooks rule not configured; nonce-keyed by design

  const group = sheets.find((g) => g.sheet === active) ?? sheets[0]

  // Company filter options. On the Historical Stock Movement (market_quote)
  // sheet only the LISTED insurers are meaningful (the unlisted SAHIs have no
  // tradeable stock), so the dropdown is trimmed to them — Care via its listed
  // parent Religare. Every other sheet lists every company in the audit.
  const companyOptions: CompanyOption[] = useMemo(() => {
    if (group?.role === 'market_quote') {
      return [
        { id: 'all', label: 'All companies' },
        ...LISTED_INSURER_IDS.map((id) => ({ id, label: LISTED_INSURERS[id].short ?? companyShortName(id, LISTED_INSURERS[id].label) })),
      ]
    }
    const seen = new Map<string, string>()
    for (const g of sheets) for (const c of g.cells) if (isCompanyEntity(c.entityId)) seen.set(c.entityId, c.entityLabel)
    const PRIORITY = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna', 'icici-lombard']
    const rank = (id: string) => { const i = PRIORITY.indexOf(id); return i === -1 ? 99 : i }
    const list = [...seen.entries()]
      .map(([id, label]) => ({ id, label: companyShortName(id, label) }))
      .sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label))
    return [{ id: 'all', label: 'All companies' }, ...list]
  }, [sheets, group?.role])

  // The selected company may not be a valid option on the current sheet (e.g. an
  // unlisted SAHI when viewing Historical) — fall back to "all" for this sheet,
  // without losing the underlying selection for sheets where it does apply.
  const effectiveCompany = companyOptions.some((o) => o.id === company) ? company : 'all'
  const companyLabel = companyOptions.find((o) => o.id === effectiveCompany)?.label ?? 'This company'

  // View filter only — narrows which cells are shown; never mutates the data.
  const filteredGroup = useMemo<AuditGroup>(
    () => (effectiveCompany === 'all' ? group : { ...group, cells: group.cells.filter((c) => c.entityId === effectiveCompany) }),
    [group, effectiveCompany],
  )

  // The full (unfiltered) column set for the active sheet — the order universe
  // and chip labels for the Customize View, stable across company-filter changes.
  const fullColumns = useMemo(() => (group ? buildGrid(group).columns : []), [group])

  // Only show the selection (panel + blue ring) when it belongs to the active sheet.
  const selectedOnActive = selected && selected.sheet === active ? selected : null

  const verifyGrid: VerifyGridProps | undefined = verifyResult
    ? {
        view: verifyView,
        map: verifyMap,
        filter: vctx?.gridFilter ?? 'all',
        pulseId: pulseId && verifyTarget?.sheet === active ? pulseId : null,
        onBackToVerifier: () => vctx?.openVerifier(),
      }
    : undefined

  // The custom sheets (Historical Stock Movement, Analyst Coverage) aren't a cell
  // grid, so a clicked verifier row can't pulse an exact cell there. Instead we
  // hand the matched row to the renderer, which shows an honest highlight banner
  // (the value you clicked, your-file vs dashboard) — never a faked cell anchor.
  const customVerifyRow: VerifyRow | null =
    verifyResult && verifyView && verifyTarget?.sheet === active
      ? verifyMap.get(verifyTarget.cellId) ?? null
      : null

  if (!sheets.length) return null

  return (
    <div className="space-y-2.5">
      {/* Excel verification status bar — counts + filter + exit/clear. Only the
          flagged statuses pop in the grid; matched cells go neutral. */}
      {verifyResult && (verifyView ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#C9D6EC] bg-gradient-to-r from-[#EEF3FB] to-card px-3 py-2 shadow-soft">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-primary">
            <FileCheck2 className="h-3.5 w-3.5" /> Excel verification
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', ...V_ORDER] as (VerifyStatus | 'all')[]).map((k) => {
              const on = (vctx?.gridFilter ?? 'all') === k
              const count = k === 'all' ? verifyResult.summary.comparable : vCount(verifyResult.summary, k)
              const dot = k === 'all' ? '#27457E' : V_OVERLAY[k].dot
              const label = k === 'all' ? 'All' : V_OVERLAY[k].label
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => vctx?.setGridFilter(on && k !== 'all' ? 'all' : k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${on ? 'border-navy-primary/40 bg-navy-primary/[0.06] text-navy-deep' : 'border-soft-border bg-card text-ink-secondary hover:border-navy-primary/30'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
                  {label}
                  <span className="rounded-full bg-ice px-1.5 text-[9.5px] font-semibold tabular-nums text-ink-secondary">{count.toLocaleString('en-IN')}</span>
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => vctx?.exitVerifyView()} className="rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-navy-primary/30 hover:text-navy-primary">Exit view</button>
            <button type="button" onClick={() => vctx?.clearVerification()} className="rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-coral/40 hover:text-coral">Clear</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-soft-border bg-ice/40 px-3 py-2 text-[11.5px] text-ink-secondary">
          <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-navy-primary" />
          <span>Verification results are loaded.</span>
          <button type="button" onClick={() => vctx?.setVerifyView(true)} className="rounded-full border border-navy-primary/30 bg-soft-blue px-2.5 py-0.5 text-[11px] font-semibold text-navy-primary transition-colors hover:border-navy-primary/50">Show verification view</button>
          <button type="button" onClick={() => vctx?.clearVerification()} className="rounded-full border border-soft-border bg-white px-2.5 py-0.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-coral/40 hover:text-coral">Clear</button>
        </div>
      ))}

      {/* Nearest-section note when an exact cell can't be addressed. */}
      {navNote && verifyView && (
        <div className="flex items-center gap-1.5 rounded-lg border border-[#E4CE93] bg-[#FBF6EA] px-3 py-1.5 text-[11px] text-champagne-deep">
          <Info className="h-3.5 w-3.5 shrink-0" /> {navNote}
        </div>
      )}

      {/* Verifying-from-insight banner — names the exact company / metric / period /
          value to check; the company is already filtered in. Honest about whether
          this is an exact cell or the closest row. */}
      {focus && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#E4CE93] bg-gradient-to-r from-[#FBF6EA] to-card px-4 py-2.5 shadow-soft">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-champagne-deep">
            <CheckCircle2 className="h-3.5 w-3.5" /> Verifying from insight
          </span>
          <span className="text-[12.5px] text-navy-deep">
            <strong className="font-semibold">{focus.companyLabel ?? 'This company'}</strong>
            {focus.metricLabel && <> · {focus.metricLabel}</>}
            {focus.year && <> · {focus.year}</>}
            {focus.valueLabel && <> = <strong className="font-semibold">{focus.valueLabel}</strong></>}
          </span>
          <span className="text-[11px] leading-snug text-ink-secondary">
            {focus.status === 'exact_cell'
              ? `${focus.companyLabel ?? 'The company'} is pre-selected — find ${focus.metricLabel ?? 'the metric'} for ${focus.year ?? 'the year'} below.`
              : `Closest match — locate the ${focus.metricLabel ?? 'metric'} row${focus.year ? ` for ${focus.year}` : ''} below (exact cell mapping pending).`}
          </span>
        </div>
      )}

      {/* Audit section tabs — a compact premium rail that wraps to a second row
          on narrow widths instead of scrolling sideways, so nothing is cut off. */}
      <div className="flex flex-wrap items-center gap-1 px-0.5 pt-0.5 pb-2">
        {sheets.map((g) => {
          const on = g.sheet === active
          const filled = g.stats.valuePresent
          return (
            <button
              key={g.sheet}
              type="button"
              onClick={() => { setActive(g.sheet); setSelected(null) }}
              title={`${g.sheet} — ${filled}/${g.stats.total} cells with a value`}
              className={[
                'group relative flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] transition-all duration-normal ease-premium',
                on
                  ? 'bg-gradient-to-b from-[#27457E] to-[#1E3A6B] font-semibold text-white shadow-[0_2px_8px_rgba(23,43,77,0.18)]'
                  : 'font-medium text-ink-secondary hover:bg-ice/70 hover:text-navy-primary',
              ].join(' ')}
            >
              <span>{g.sheet}</span>
              <span className={`rounded-full px-1 py-px text-[8.5px] font-semibold tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-ice text-ink-secondary'}`}>
                {filled}/{g.stats.total}
              </span>
              {on && <span className="pointer-events-none absolute inset-x-2.5 bottom-1 h-[2px] rounded-full bg-gradient-to-r from-champagne to-champagne-deep" />}
            </button>
          )
        })}
      </div>

      {/* Page control row — the company filter applies to every sheet type. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CompanyFilter options={companyOptions} value={effectiveCompany} onChange={(c) => { setCompany(c); setSelected(null) }} />
        {effectiveCompany !== 'all' && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: companyColor(effectiveCompany).key }} />
            Showing <span className="font-semibold text-navy-deep">{companyLabel}</span> only
            <button
              type="button"
              onClick={() => { setCompany('all'); setSelected(null) }}
              className="ml-1 rounded-full border border-soft-border bg-white px-2 py-0.5 text-[10px] font-medium text-navy-primary transition-colors hover:border-navy-primary/30"
            >
              Show all
            </button>
          </span>
        )}
      </div>

      {/* Contain a per-sheet render failure to this panel — the tab bar above
          stays live, so one bad sheet can never blank the whole Data Audit page.
          resetKey clears the error when the user switches sheets or company. */}
      <SectionErrorBoundary resetKey={`${group.sheet}::${effectiveCompany}`} sectionLabel={`${group.sheet} sheet`}>
        {group.role === 'market_quote' ? (
          // The Historical Stock Movement sheet is a transposed, date-by-row series
          // (Close / Total Qty / Deliverable Qty / % Delivered) the generic grid
          // can't represent — it gets a dedicated, workbook-faithful renderer.
          <HistoricalStockMovement companyFilter={effectiveCompany} onClearCompany={() => { setCompany('all'); setSelected(null) }} verifyRow={customVerifyRow} />
        ) : group.role === 'analyst_coverage' ? (
          // Analyst coverage is a record list — each row a dated broker note with
          // nine attributes, not a period pivot — so it also gets a dedicated,
          // workbook-faithful renderer (Company/Broker/Date/Reco/CMP/Price/Target/
          // Upside×2, in company blocks closed by Average rows).
          <AnalystCoverage key={effectiveCompany} group={group} companyFilter={effectiveCompany} onClearCompany={() => { setCompany('all'); setSelected(null) }} verifyRow={customVerifyRow} />
        ) : (
          <GridView
            key={`${group.sheet}::${effectiveCompany}`}
            group={filteredGroup}
            fullColumns={fullColumns}
            companyLabel={companyLabel}
            isFiltered={effectiveCompany !== 'all'}
            raw={raw}
            onRawChange={setRaw}
            onClearCompany={() => { setCompany('all'); setSelected(null) }}
            verify={verifyGrid}
            selected={selectedOnActive}
            onSelect={setSelected}
          />
        )}
      </SectionErrorBoundary>
    </div>
  )
}
