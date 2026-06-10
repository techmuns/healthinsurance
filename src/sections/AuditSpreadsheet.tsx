import { Fragment, useMemo, useState } from 'react'
import { ExternalLink, FunctionSquare, X } from 'lucide-react'
import {
  STATUS_META, formatValue, formatRaw,
  type AuditModel, type AuditGroup, type AuditCell, type QaColor,
} from '@/lib/extractedDataAudit'

// ---------------------------------------------------------------------------
//  Audit · Spreadsheet view — mirrors the source Excel template tab-for-tab and
//  cell-for-cell, so a reviewer can put their Excel next to this and compare
//  apple-to-apple. Each sheet is reconstructed as a real grid from the cells'
//  Excel references (column letter + row number): rows are the template's line
//  items, columns are its periods. Read-only; no data is changed here.
// ---------------------------------------------------------------------------

const QA: Record<QaColor, { cell: string; ring: string; text: string; dot: string; label: string }> = {
  green: { cell: 'bg-emerald-soft/45', ring: 'rgba(47,133,90,0.22)', text: 'text-emerald', dot: '#2F855A', label: 'Fetched' },
  yellow: { cell: 'bg-gold-soft/45', ring: 'rgba(183,121,31,0.22)', text: 'text-gold', dot: '#B7791F', label: 'Adjusted / typed' },
  red: { cell: 'bg-coral-soft/35', ring: 'rgba(199,93,84,0.22)', text: 'text-coral', dot: '#C75D54', label: 'Missing / not reachable' },
  grey: { cell: 'bg-slate-100/70', ring: 'rgba(148,163,184,0.25)', text: 'text-slate-500', dot: '#94A3B8', label: 'Not needed / blocked' },
  info: { cell: 'bg-lavender-soft/35', ring: 'rgba(110,123,214,0.22)', text: 'text-lavender', dot: '#6E7BD6', label: 'Calculated' },
}
const LEGEND: QaColor[] = ['green', 'yellow', 'info', 'red', 'grey']

function parseRef(ref: string): { col: string; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || '')
  return m ? { col: m[1], row: Number(m[2]) } : null
}
function colIndex(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

interface GridCol { col: string; period: string; entity: string }
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

  // Per Excel column: the period and the (dominant) entity it carries.
  const colMap = new Map<string, { period: string; entity: string }>()
  for (const c of cells) {
    const col = parseRef(c.cellRef)!.col
    if (!colMap.has(col)) colMap.set(col, { period: c.period || col, entity: c.entityLabel || '' })
  }
  const columns = [...colMap.entries()]
    .map(([col, v]) => ({ col, period: v.period, entity: v.entity }))
    .sort((a, b) => colIndex(a.col) - colIndex(b.col))

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

  const rows: GridRow[] = [...rowMap.entries()]
    .map(([rowNum, rc]) => {
      const f = rc[0]
      // Primary label = the dimension that distinguishes this row.
      const primary = entityByRow ? f.entityLabel : f.metricLabel
      const secondary = entityByColumn ? '' : entityByRow ? f.metricLabel : f.entityLabel
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
        <DetailField label="Status">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.cell} ${q.text}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: q.dot }} />{meta.label}
          </span>
        </DetailField>
        <DetailField label="Unit">{cell.unit || '—'}</DetailField>
        <DetailField label="As printed (source)"><span className="font-semibold tabular-nums">{formatRaw(cell.rawValue ?? cell.normalizedValue) || '—'}</span></DetailField>
        <DetailField label="Final value (dashboard)"><span className="font-semibold tabular-nums text-navy-deep">{cell.normalizedValue != null ? formatValue(cell.normalizedValue, cell.unit) : cell.calculatedValue != null ? formatValue(cell.calculatedValue, cell.unit) : '—'}</span></DetailField>
        {cell.formula && (
          <div className="col-span-2">
            <DetailField label="Excel formula">
              <code className="block rounded-md bg-ice/70 px-2 py-1 font-mono text-[11px] text-ink-primary">{cell.formula}</code>
              {cell.calc && <p className="mt-1 text-[11px] text-ink-secondary">{cell.calc}</p>}
            </DetailField>
          </div>
        )}
        {cell.note && (
          <div className="col-span-2">
            <DetailField label="Note">{cell.note}</DetailField>
          </div>
        )}
        <div className="col-span-2">
          <DetailField label="Source">
            {cell.sourceName ? (
              cell.sourceUrl ? (
                <a href={cell.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-navy-primary hover:underline">
                  {cell.sourceName}<ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span>{cell.sourceName}</span>
              )
            ) : '—'}
            {cell.dashboardField && <p className="mt-1 text-[11px] text-ink-secondary">Dashboard: <span className="text-ink-primary">{cell.dashboardField}</span></p>}
          </DetailField>
        </div>
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
                <span className="block font-mono text-[8.5px] font-medium text-ink-secondary/60">{c.col}</span>
                <span className="block text-[11px] font-bold text-navy-deep">{c.period}</span>
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
                  <th className="sticky left-0 z-10 border-b border-r border-soft-border bg-white px-3 py-1.5 text-left align-middle group-hover:bg-ice/50">
                    <span className="block truncate text-[11.5px] font-semibold text-navy-deep" style={{ maxWidth: 210 }} title={r.primary}>{r.primary}</span>
                    {r.secondary && r.secondary !== r.primary && (
                      <span className="block truncate text-[10px] text-ink-secondary" style={{ maxWidth: 210 }} title={r.secondary}>{r.secondary}</span>
                    )}
                  </th>
                  {columns.map((col) => {
                    const cell = r.byCol.get(col.col)
                    if (!cell) return <td key={col.col} className="border-b border-r border-soft-border/60 bg-[#FCFDFE]" />
                    const meta = STATUS_META[cell.status]
                    const q = QA[meta.color]
                    const txt = cellDisplay(cell, raw)
                    const isSel = selected?.id === cell.id
                    const isFormula = cell.cellKind === 'formula'
                    return (
                      <td key={col.col} className="border-b border-r border-soft-border/60 p-0">
                        <button
                          type="button"
                          onClick={() => onSelect(cell)}
                          title={`${cell.metricLabel} · ${cell.period} — ${meta.label}`}
                          className={`relative flex h-full min-h-[34px] w-full items-center justify-end px-2 py-1 text-right tabular-nums transition-all ${q.cell} ${q.text} hover:brightness-95`}
                          style={isSel ? { boxShadow: `inset 0 0 0 2px ${q.dot}` } : undefined}
                        >
                          {isFormula && <FunctionSquare className="absolute left-1 top-1 h-2.5 w-2.5 opacity-40" />}
                          <span className="text-[11.5px] font-semibold">
                            {txt || <span className="h-1 w-1 rounded-full" style={{ display: 'inline-block', background: q.dot }} />}
                          </span>
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
  if (!group) return null

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

      {/* Grid + (optional) detail */}
      <div className={selected ? 'grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]' : ''}>
        <SheetGrid group={group} raw={raw} selected={selected} onSelect={setSelected} />
        {selected && (
          <div className="lg:sticky lg:top-2 lg:self-start">
            <CellDetail cell={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
