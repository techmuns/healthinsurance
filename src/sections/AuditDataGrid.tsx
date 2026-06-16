// Extracted Data Audit — the "Data Grid" view: a dashboard-shaped, Excel-like
// Company × Fiscal-Year × Metric grid that fills progressively as real,
// source-linked values land. Honest by construction: missing renders "Missing",
// never 0; conflicts flag "Needs review" and keep both values; every filled cell
// carries its source + which dashboard area consumes it.

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  AUDIT_COMPANIES,
  AUDIT_METRICS,
  AUDIT_YEARS,
  buildAuditGrid,
  formatGridValue,
  GRID_STATUS_META,
  type DashboardArea,
  type GridCell,
  type GridStatus,
  type MetricCategory,
} from '@/lib/auditGrid'

const TONE_CLASS: Record<string, { cell: string; dot: string; text: string }> = {
  green: { cell: 'bg-[#ECF6F4] ring-[#BFE3E1]', dot: 'bg-teal', text: 'text-teal' },
  red: { cell: 'bg-[#FBEDEA] ring-[#F0D2CC]', dot: 'bg-[#C0584F]', text: 'text-[#C0584F]' },
  amber: { cell: 'bg-[#FBF4E4] ring-[#EAD9B6]', dot: 'bg-champagne-deep', text: 'text-champagne-deep' },
  navy: { cell: 'bg-soft-blue ring-[#D6E2FA]', dot: 'bg-navy-primary', text: 'text-navy-primary' },
  grey: { cell: 'bg-ice ring-soft-border', dot: 'bg-ink-secondary', text: 'text-ink-secondary' },
}

const CATEGORIES: MetricCategory[] = ['Premium', 'Profitability', 'Ratios', 'Capital', 'Market share', 'Quality']

function StatusChip({ status }: { status: GridStatus }) {
  const m = GRID_STATUS_META[status]
  const t = TONE_CLASS[m.tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${t.cell} ${t.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {m.label}
    </span>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number | string; tone: keyof typeof TONE_CLASS | 'plain' }) {
  const t = tone === 'plain' ? null : TONE_CLASS[tone]
  return (
    <div className="surface-soft relative overflow-hidden rounded-xl p-3">
      {t && <span className={`absolute inset-y-0 left-0 w-[2.5px] ${t.dot}`} />}
      <p className="pl-1.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className={`mt-1 pl-1.5 font-display text-[22px] leading-none tabular-nums ${t ? t.text : 'text-navy-deep'}`}>{value}</p>
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] text-navy-deep shadow-soft focus:outline-none focus:ring-1 focus:ring-muted-blue"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.l}</option>
        ))}
      </select>
    </label>
  )
}

// ── Cell drawer ──────────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      <span className="min-w-0 text-[11.5px] text-ink-primary">{children}</span>
    </div>
  )
}

function CellDrawer({ cell, onClose }: { cell: GridCell; onClose: () => void }) {
  const src = cell.chosen
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-navy-deep/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative h-full w-full max-w-md overflow-y-auto border-l border-soft-border bg-card p-5 shadow-card">
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-soft-border pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-champagne-deep">{cell.companyLabel} · {cell.year}</p>
            <h3 className="mt-0.5 font-display text-[16px] leading-tight text-navy-deep">{cell.metricLabel}</h3>
            <div className="mt-1.5"><StatusChip status={cell.status} /></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-ink-secondary hover:bg-ice"><X className="h-4 w-4" /></button>
        </div>

        <Row label="Value">
          {cell.value != null ? <span className="font-display text-[18px] text-navy-deep">{formatGridValue(cell.value, cell.unit)}</span> : <span className="italic text-ink-secondary">Missing in source</span>}
        </Row>
        <Row label="Unit">{cell.unit}</Row>
        <Row label="Category">{cell.category}</Row>
        {src && (
          <>
            <Row label="Source">{src.sourceName ?? '—'}</Row>
            {src.page && <Row label="Page / sec">{src.page}</Row>}
            <Row label="Source link">
              {src.sourceUrl ? (
                <a href={src.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-teal underline decoration-dotted">{src.sourceUrl}</a>
              ) : src.sourceFile ? (
                <span className="break-all text-ink-secondary">{src.sourceFile}</span>
              ) : '—'}
            </Row>
            <Row label="Layer">{src.layer} · priority {src.priority}</Row>
            <Row label="Confidence">{src.confidence ?? '—'}</Row>
            <Row label="Last fetched">{src.fetchedAt ? src.fetchedAt.slice(0, 10) : '—'}</Row>
          </>
        )}
        {/* A note surfaces only to explain an absent value. Internal lineage notes
            on filled cells (seeds, supersession, policy picks) are bookkeeping,
            not viewer content (Neha, 2026-06-11). */}
        {cell.value == null && cell.notes && <Row label="Why it's blank">{cell.notes}</Row>}
        {cell.competing.length > 0 && (
          <Row label="Conflicts">
            <ul className="space-y-0.5">
              {cell.competing.map((c, i) => (
                <li key={i} className="text-[11px] text-ink-secondary">
                  <span className="font-semibold text-navy-deep">{formatGridValue(c.value, c.unit)}</span> — {c.sourceName ?? c.layer}
                </li>
              ))}
            </ul>
          </Row>
        )}
        <Row label="Dashboard">
          {cell.usage.length ? (
            <span className="flex flex-wrap gap-1">
              {cell.usage.map((u) => (
                <span key={u} className="rounded-full bg-teal-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-teal ring-1 ring-[#BFE3E1]">{u}</span>
              ))}
            </span>
          ) : (
            <span className="italic text-ink-secondary">Not currently used</span>
          )}
        </Row>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function AuditDataGrid() {
  const model = useMemo(() => buildAuditGrid(), [])
  const [view, setView] = useState<'matrix' | 'ledger'>('matrix')
  const [company, setCompany] = useState('all')
  const [year, setYear] = useState('all')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<GridCell | null>(null)

  const byKey = useMemo(() => {
    const m = new Map<string, GridCell>()
    for (const c of model.cells) m.set(`${c.company}::${c.metric}::${c.year}`, c)
    return m
  }, [model])

  const companies = company === 'all' ? AUDIT_COMPANIES : AUDIT_COMPANIES.filter((c) => c.id === company)
  const years = year === 'all' ? [...AUDIT_YEARS] : AUDIT_YEARS.filter((y) => y === year)
  const metrics = category === 'all' ? AUDIT_METRICS : AUDIT_METRICS.filter((m) => m.category === category)

  const ledger = useMemo(
    () =>
      model.cells.filter(
        (c) =>
          (company === 'all' || c.company === company) &&
          (year === 'all' || c.year === year) &&
          (category === 'all' || c.category === category) &&
          (status === 'all' || c.status === status),
      ),
    [model, company, year, category, status],
  )

  const s = model.summary
  return (
    <div className="space-y-4">
      {/* Header + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] leading-tight text-navy-deep">Data Grid · cell-by-cell extraction</h2>
          <p className="text-[11.5px] text-ink-secondary">
            {AUDIT_COMPANIES.length} insurers × {AUDIT_YEARS.length} years × {AUDIT_METRICS.length} metrics — real, source-linked values only.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-full border border-soft-border bg-ice/60 p-0.5">
          {(['matrix', 'ledger'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-all ${view === v ? 'bg-white text-navy-deep shadow-soft' : 'text-ink-secondary hover:text-navy-primary'}`}
            >
              {v === 'matrix' ? 'Metric × Year' : 'Cell ledger'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <SummaryCard label="Expected cells" value={s.expected} tone="plain" />
        <SummaryCard label="Filled" value={s.filled} tone="green" />
        <SummaryCard label="Missing" value={s.missing} tone="red" />
        <SummaryCard label="Not available" value={s.notAvailable} tone="grey" />
        <SummaryCard label="Needs review" value={s.needsReview} tone="amber" />
        <SummaryCard label="Auto-resolved" value={s.autoResolved} tone="navy" />
        <SummaryCard label="Coverage" value={`${(s.coverage * 100).toFixed(0)}%`} tone="plain" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-soft-border bg-ice/40 p-3">
        <Select label="Company" value={company} onChange={setCompany} options={[{ v: 'all', l: 'All' }, ...AUDIT_COMPANIES.map((c) => ({ v: c.id, l: c.label }))]} />
        <Select label="Year" value={year} onChange={setYear} options={[{ v: 'all', l: 'All' }, ...AUDIT_YEARS.map((y) => ({ v: y, l: y }))]} />
        <Select label="Category" value={category} onChange={setCategory} options={[{ v: 'all', l: 'All' }, ...CATEGORIES.map((c) => ({ v: c, l: c }))]} />
        <Select label="Status" value={status} onChange={setStatus} options={[{ v: 'all', l: 'All' }, ...Object.values(GRID_STATUS_META).map((m) => ({ v: m.key, l: m.label }))]} />
      </div>

      {/* Matrix view — metric rows × year columns, one block per company. */}
      {view === 'matrix' && (
        <div className="space-y-5">
          {companies.map((c) => (
            <div key={c.id} className="card-surface overflow-x-auto p-4">
              <p className="mb-2 font-display text-[14px] text-navy-deep">{c.label}</p>
              <table className="w-full min-w-[560px] border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-soft-border text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
                    <th className="py-2 pr-2 font-semibold">Metric</th>
                    <th className="py-2 pr-2 font-semibold">Category</th>
                    {years.map((y) => <th key={y} className="px-2 py-2 text-center font-semibold">{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.key} className="border-b border-[#F1F3F8]">
                      <td className="py-1.5 pr-2 font-medium text-navy-deep">{m.label}</td>
                      <td className="py-1.5 pr-2 text-ink-secondary">{m.category}</td>
                      {years.map((y) => {
                        const cell = byKey.get(`${c.id}::${m.key}::${y}`)
                        if (!cell) return <td key={y} className="px-1 py-1" />
                        const tone = TONE_CLASS[GRID_STATUS_META[cell.status].tone]
                        const dim = status !== 'all' && cell.status !== status
                        return (
                          <td key={y} className="px-1 py-1">
                            <button
                              type="button"
                              onClick={() => setSelected(cell)}
                              title={`${GRID_STATUS_META[cell.status].label}${cell.chosen?.sourceName ? ' · ' + cell.chosen.sourceName : ''}`}
                              className={`flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-center ring-1 transition hover:brightness-[0.97] ${tone.cell} ${dim ? 'opacity-30' : ''}`}
                            >
                              {cell.value != null ? (
                                <span className={`font-semibold tabular-nums ${tone.text}`}>{formatGridValue(cell.value, cell.unit)}</span>
                              ) : (
                                <span className={`text-[9.5px] font-medium ${tone.text}`}>{cell.displayTag ?? GRID_STATUS_META[cell.status].label}</span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Ledger view — flat, filterable cell list. */}
      {view === 'ledger' && (
        <div className="card-surface overflow-x-auto p-4">
          <table className="w-full min-w-[680px] border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-soft-border bg-ice/60 text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
                <th className="py-2 pl-2 font-semibold">Company</th>
                <th className="py-2 pl-2 font-semibold">Year</th>
                <th className="py-2 pl-2 font-semibold">Metric</th>
                <th className="py-2 pl-2 font-semibold">Category</th>
                <th className="py-2 pl-2 text-right font-semibold">Value</th>
                <th className="py-2 pl-2 font-semibold">Status</th>
                <th className="py-2 pl-2 font-semibold">Source</th>
                <th className="py-2 pl-2 font-semibold">Dashboard</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((cell) => (
                <tr key={`${cell.company}-${cell.metric}-${cell.year}`} onClick={() => setSelected(cell)} className="cursor-pointer border-b border-[#F1F3F8] hover:bg-ice/40">
                  <td className="py-1.5 pl-2 text-navy-deep">{cell.companyLabel}</td>
                  <td className="py-1.5 pl-2 text-ink-secondary">{cell.year}</td>
                  <td className="py-1.5 pl-2 font-medium text-navy-deep">{cell.metricLabel}</td>
                  <td className="py-1.5 pl-2 text-ink-secondary">{cell.category}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{cell.value != null ? formatGridValue(cell.value, cell.unit) : <span className="text-ink-secondary/50">—</span>}</td>
                  <td className="py-1.5 pl-2"><StatusChip status={cell.status} /></td>
                  <td className="max-w-[180px] truncate py-1.5 pl-2 text-ink-secondary" title={cell.chosen?.sourceName ?? ''}>{cell.chosen?.sourceName ?? '—'}</td>
                  <td className="py-1.5 pl-2 text-ink-secondary">{cell.usage.map((u: DashboardArea) => u.replace(' Analysis', '').replace(' Insights', '')).join(', ') || '—'}</td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-[12px] text-ink-secondary">No cells match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && <CellDrawer cell={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
