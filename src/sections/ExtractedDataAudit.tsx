import { useMemo, useState, type ReactNode } from 'react'
import {
  Download, Search, ChevronRight, ExternalLink, FileSpreadsheet,
  RotateCcw, Layers, Table2, AlertTriangle, Link2, Target,
} from 'lucide-react'
import {
  buildAudit, STATUS_META, formatValue, formatRaw,
  type AuditCell, type AuditStatus, type QaColor,
} from '@/lib/extractedDataAudit'

// ---------------------------------------------------------------------------
//  Extracted Data Audit — a QA tab (not analysis). It mirrors the Excel/source
//  template cell-by-cell so a reviewer can confirm every value is fetched,
//  normalized, source-linked and routed into the dashboard correctly. It reads
//  the SAME normalized pipeline as the dashboard (src/lib/extractedDataAudit.ts)
//  — no duplicate data logic.
// ---------------------------------------------------------------------------

const QA_STYLE: Record<QaColor, { dot: string; pill: string; tint: string; bar: string }> = {
  green: { dot: '#2F855A', pill: 'bg-emerald-soft text-emerald', tint: 'bg-emerald-soft/30', bar: 'bg-emerald' },
  yellow: { dot: '#B7791F', pill: 'bg-gold-soft text-gold', tint: 'bg-gold-soft/40', bar: 'bg-gold' },
  red: { dot: '#C75D54', pill: 'bg-coral-soft text-coral', tint: 'bg-coral-soft/30', bar: 'bg-coral' },
  grey: { dot: '#94A3B8', pill: 'bg-slate-100 text-slate-500', tint: '', bar: 'bg-slate-300' },
  info: { dot: '#6E7BD6', pill: 'bg-lavender-soft text-lavender', tint: 'bg-lavender-soft/30', bar: 'bg-lavender' },
}

type GroupMode = 'sheet' | 'section'

interface Filters {
  company: string
  period: string
  sourceRole: string
  section: string
  statuses: Set<AuditStatus>
  search: string
}

const EMPTY_FILTERS: Filters = {
  company: 'all', period: 'all', sourceRole: 'all', section: 'all', statuses: new Set(), search: '',
}

export function ExtractedDataAudit() {
  const model = useMemo(() => buildAudit(), [])
  const [groupMode, setGroupMode] = useState<GroupMode>('sheet')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [exporting, setExporting] = useState(false)

  const allCells = useMemo(() => model.groups.flatMap((g) => g.cells), [model])

  // Per-sheet metadata for the sheet grouping header.
  const sheetMeta = useMemo(() => {
    const m = new Map<string, { role: string; section: string; computed: number; dims: string | null }>()
    for (const g of model.groups) m.set(g.sheet, { role: g.role, section: g.dashboardSection, computed: g.computedCells, dims: g.dimensions })
    return m
  }, [model])

  const filterActive =
    filters.company !== 'all' || filters.period !== 'all' || filters.sourceRole !== 'all' ||
    filters.section !== 'all' || filters.statuses.size > 0 || filters.search.trim() !== ''

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return allCells.filter((c) => {
      if (filters.company !== 'all' && c.entityId !== filters.company) return false
      if (filters.period !== 'all' && c.period !== filters.period) return false
      if (filters.sourceRole !== 'all' && c.role !== filters.sourceRole) return false
      if (filters.section !== 'all' && c.dashboardField !== filters.section) return false
      if (filters.statuses.size > 0 && !filters.statuses.has(c.status)) return false
      if (q) {
        const hay = `${c.metricLabel} ${c.metricId} ${c.section} ${c.entityLabel} ${c.cellRef} ${c.period}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allCells, filters])

  // Sheet display order = the original template order (so the tab mirrors the
  // Excel structure); section order = the dashboard reading order.
  const sheetOrder = useMemo(() => new Map(model.groups.map((g, i) => [g.sheet, i])), [model])

  // Group the filtered cells by the chosen dimension.
  const view = useMemo(() => {
    const map = new Map<string, AuditCell[]>()
    for (const c of filtered) {
      const k = groupMode === 'sheet' ? c.sheet : c.dashboardField
      const arr = map.get(k)
      if (arr) arr.push(c)
      else map.set(k, [c])
    }
    const groups = [...map.entries()].map(([key, cells]) => ({ key, cells, stats: tally(cells) }))
    if (groupMode === 'sheet') {
      groups.sort((a, b) => (sheetOrder.get(a.key) ?? 99) - (sheetOrder.get(b.key) ?? 99))
    } else {
      groups.sort((a, b) => b.cells.length - a.cells.length)
    }
    return groups
  }, [filtered, groupMode, sheetOrder])

  const isOpen = (k: string) => open[k] ?? (filterActive && filtered.length < 400)
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }))
  const toggleStatus = (s: AuditStatus) =>
    setFilters((f) => {
      const next = new Set(f.statuses)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return { ...f, statuses: next }
    })

  async function handleExport() {
    setExporting(true)
    try {
      await exportToExcel(view, model, groupMode)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 h-8 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
          <div className="leading-tight">
            <h1 className="font-display text-[20px] text-navy-deep">Extracted Data Audit</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] text-ink-secondary">
              A quality check, not analysis. Confirm — cell by cell — that every value the source template
              expects is fetched, normalized, source-linked and routed to the right place on the dashboard.
            </p>
            <p className="mt-1 text-[10.5px] text-ink-secondary/80">
              Template: <span className="font-medium text-ink-primary">{model.meta.template_file ?? 'niva-bupa-portfolio-review.xlsx'}</span>
              {model.meta.last_updated && <> · Pipeline updated {model.meta.last_updated.slice(0, 10)}</>}
              {model.meta.template_sha256 && <> · sha {model.meta.template_sha256.slice(0, 8)}</>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-navy-primary/20 bg-navy-primary px-3 py-2 text-[12px] font-semibold text-white shadow-soft transition-colors hover:bg-navy-deep disabled:opacity-60"
        >
          {exporting ? <FileSpreadsheet className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Building…' : 'Export to Excel'}
        </button>
      </div>

      {/* ── Summary strip ──────────────────────────────────────────────── */}
      <SummaryStrip model={model} />

      {/* ── Legend + reconciliation ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-soft-border bg-card/70 px-3 py-2 shadow-soft">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary">Status — click to filter</span>
          {model.filterOptions.statuses.map((s) => {
            const meta = STATUS_META[s]
            const on = filters.statuses.has(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10.5px] font-medium transition-all',
                  on ? 'border-navy-primary/40 ring-1 ring-navy-primary/20' : 'border-soft-border hover:border-navy-primary/30',
                  QA_STYLE[meta.color].pill,
                ].join(' ')}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: QA_STYLE[meta.color].dot }} />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      <ReconStrip model={model} />

      {/* ── Filter bar (sticky) ────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-1 rounded-xl border border-soft-border bg-surface/95 px-3 py-2.5 shadow-soft backdrop-blur">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search metric, section, company, cell…"
              className="w-full rounded-lg border border-soft-border bg-white py-1.5 pl-8 pr-3 text-[12px] text-ink-primary outline-none placeholder:text-ink-secondary/70 focus:border-navy-primary/40"
            />
          </div>
          <Select label="Company" value={filters.company} onChange={(v) => setFilters((f) => ({ ...f, company: v }))}
            options={[{ value: 'all', label: 'All companies' }, ...model.filterOptions.companies.map((c) => ({ value: c.id, label: c.label }))]} />
          <Select label="Period" value={filters.period} onChange={(v) => setFilters((f) => ({ ...f, period: v }))}
            options={[{ value: 'all', label: 'All periods' }, ...model.filterOptions.periods.map((p) => ({ value: p, label: p }))]} />
          <Select label="Source type" value={filters.sourceRole} onChange={(v) => setFilters((f) => ({ ...f, sourceRole: v }))}
            options={[{ value: 'all', label: 'All sources' }, ...model.filterOptions.sourceTypes.map((s) => ({ value: s.id, label: s.label }))]} />
          <Select label="Dashboard section" value={filters.section} onChange={(v) => setFilters((f) => ({ ...f, section: v }))}
            options={[{ value: 'all', label: 'All sections' }, ...model.filterOptions.sections.map((s) => ({ value: s, label: s }))]} />

          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-soft-border bg-white p-0.5">
              <GroupToggle active={groupMode === 'sheet'} onClick={() => setGroupMode('sheet')} icon={<Table2 className="h-3.5 w-3.5" />} label="Excel sheet" />
              <GroupToggle active={groupMode === 'section'} onClick={() => setGroupMode('section')} icon={<Layers className="h-3.5 w-3.5" />} label="Dashboard" />
            </div>
            {filterActive && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex items-center gap-1 rounded-lg border border-soft-border bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-coral/40 hover:text-coral"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>
        {filterActive && (
          <p className="mt-1.5 text-[10.5px] text-ink-secondary">
            Showing <span className="font-semibold text-ink-primary">{filtered.length.toLocaleString('en-IN')}</span> of{' '}
            {allCells.length.toLocaleString('en-IN')} cells across {view.length} {groupMode === 'sheet' ? 'sheet(s)' : 'section(s)'}.
          </p>
        )}
      </div>

      {/* ── Grouped tables ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        {view.length === 0 && (
          <div className="rounded-xl border border-dashed border-soft-border bg-card/60 px-4 py-10 text-center text-[12.5px] text-ink-secondary">
            No cells match these filters.
          </div>
        )}
        {view.map((g) => {
          const meta = groupMode === 'sheet' ? sheetMeta.get(g.key) : undefined
          return (
            <GroupCard
              key={g.key}
              title={g.key}
              subtitle={groupMode === 'sheet' ? meta?.section ?? '' : `${new Set(g.cells.map((c) => c.sheet)).size} source sheet(s)`}
              dims={groupMode === 'sheet' ? meta?.dims ?? null : null}
              computed={groupMode === 'sheet' ? meta?.computed ?? 0 : 0}
              cells={g.cells}
              stats={g.stats}
              open={isOpen(g.key)}
              onToggle={() => toggle(g.key)}
            />
          )
        })}
      </div>

      {/* ── Reconciliation tables ──────────────────────────────────────── */}
      <UnusedTable model={model} />
      <MappingIssuesTable model={model} />

      <p className="pt-1 text-center text-[10.5px] text-ink-secondary/80">
        Read-only QA view · values join the template cell contract to the normalized value store ·
        missing ≠ zero · official sources first · the template is treated as layout only.
      </p>
    </div>
  )
}

// ─── Summary strip ──────────────────────────────────────────────────────────

function SummaryStrip({ model }: { model: ReturnType<typeof buildAudit> }) {
  const s = model.summary
  const pct = s.totalExpected ? Math.round((s.dashboardMapped / s.totalExpected) * 100) : 0
  const tiles: { label: string; value: number; color: QaColor; hint?: string }[] = [
    { label: 'Cells expected', value: s.totalExpected, color: 'grey', hint: 'Fillable input cells in the template' },
    { label: 'Fetched', value: s.fetched, color: 'green', hint: 'Have a normalized value' },
    { label: 'Missing', value: s.missing, color: 'red', hint: 'No source value yet (pending fetch)' },
    { label: 'Parser issues', value: s.parserIssues, color: 'red', hint: 'Extraction / sanity gate failed' },
    { label: 'Manual override', value: s.manualOverride, color: 'yellow', hint: 'Hand-transcribed / curated' },
    { label: 'Source-linked', value: s.sourceLinked, color: 'info', hint: 'Cell carries a clickable source' },
    { label: 'Dashboard-mapped', value: s.dashboardMapped, color: 'green', hint: 'Value routed to a dashboard field' },
  ]
  return (
    <div className="rounded-xl border border-soft-border bg-card p-4 shadow-soft">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="relative rounded-lg border border-soft-border/70 bg-surface/60 p-3" title={t.hint}>
            <span className="absolute left-0 top-2.5 h-[calc(100%-1.25rem)] w-[3px] rounded-full" style={{ background: QA_STYLE[t.color].dot }} />
            <p className="pl-2 text-[20px] font-semibold leading-none text-navy-deep tabular-nums">{t.value.toLocaleString('en-IN')}</p>
            <p className="mt-1 pl-2 text-[10.5px] font-medium leading-tight text-ink-secondary">{t.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald to-teal transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[11px] font-medium text-ink-secondary">
          {pct}% of expected cells mapped to the dashboard
        </span>
      </div>
    </div>
  )
}

function ReconStrip({ model }: { model: ReturnType<typeof buildAudit> }) {
  const { summary } = model
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-lavender/30 bg-lavender-soft/40 px-3 py-1.5 text-[11.5px]">
        <Link2 className="h-3.5 w-3.5 text-lavender" />
        <span className="font-semibold text-navy-deep">{summary.unusedExtracted}</span>
        <span className="text-ink-secondary">extracted values with no template cell (unused)</span>
      </div>
      <div className={[
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11.5px]',
        summary.mappingIssues > 0 ? 'border-coral/40 bg-coral-soft/40' : 'border-emerald/30 bg-emerald-soft/40',
      ].join(' ')}>
        <Target className={`h-3.5 w-3.5 ${summary.mappingIssues > 0 ? 'text-coral' : 'text-emerald'}`} />
        <span className="font-semibold text-navy-deep">{summary.mappingIssues}</span>
        <span className="text-ink-secondary">dashboard values not traced here (mapping issues)</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-soft-border bg-card/60 px-3 py-1.5 text-[11.5px]">
        <span className="font-semibold text-navy-deep">{summary.computed.toLocaleString('en-IN')}</span>
        <span className="text-ink-secondary">computed-in-Excel cells (recomputed by the dashboard — not fetched)</span>
      </div>
    </div>
  )
}

// ─── Group card + table ─────────────────────────────────────────────────────

const ROW_CAP = 250

function GroupCard({
  title, subtitle, dims, computed, cells, stats, open, onToggle,
}: {
  title: string; subtitle: string; dims: string | null; computed: number
  cells: AuditCell[]; stats: SheetTally; open: boolean; onToggle: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? cells : cells.slice(0, ROW_CAP)
  return (
    <div className="overflow-hidden rounded-xl border border-soft-border bg-card shadow-soft">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface/60"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${open ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[14px] text-navy-deep">{title}</span>
            {dims && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">{dims}</span>}
          </div>
          <p className="truncate text-[10.5px] text-ink-secondary">
            {subtitle}
            {computed > 0 && <> · {computed} computed cell(s)</>}
          </p>
        </div>
        <MiniStat n={stats.valuePresent} color="green" label="fetched" />
        <MiniStat n={stats.missing} color="red" label="missing" />
        <MiniStat n={stats.parserIssue + stats.blocked} color="yellow" label="flagged" />
        <span className="ml-1 shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">{cells.length}</span>
      </button>

      {open && (
        <div className="border-t border-soft-border">
          <div className="max-h-[72vh] overflow-auto scroll-thin">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgba(23,43,77,0.08)]">
                <tr className="text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
                  <Th className="w-[120px]">Status</Th>
                  <Th className="w-[52px]">Cell</Th>
                  <Th className="min-w-[150px]">Section</Th>
                  <Th className="min-w-[170px]">Metric (row)</Th>
                  <Th className="min-w-[120px]">Company</Th>
                  <Th className="w-[78px]">Period</Th>
                  <Th className="w-[96px] text-right">Raw</Th>
                  <Th className="w-[110px] text-right">Normalized</Th>
                  <Th className="w-[60px]">Unit</Th>
                  <Th className="min-w-[180px]">Source</Th>
                  <Th className="w-[92px]">Fetched</Th>
                  <Th className="min-w-[170px]">Dashboard field</Th>
                  <Th className="min-w-[220px]">Notes</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => <CellRow key={c.id} c={c} />)}
              </tbody>
            </table>
          </div>
          {cells.length > ROW_CAP && (
            <div className="border-t border-soft-border bg-surface/50 px-3 py-2 text-center">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-[11px] font-medium text-navy-primary hover:underline"
              >
                {showAll ? `Show first ${ROW_CAP}` : `Show all ${cells.length.toLocaleString('en-IN')} rows`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CellRow({ c }: { c: AuditCell }) {
  const style = QA_STYLE[c.qaColor]
  return (
    <tr className={`border-b border-soft-border/60 align-top ${style.tint} hover:bg-soft-blue/40`}>
      <Td>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${style.pill}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.dot }} />
          {STATUS_META[c.status].label}
        </span>
      </Td>
      <Td className="font-mono text-[10px] text-ink-secondary">{c.cellRef}</Td>
      <Td className="text-ink-secondary">{c.section}</Td>
      <Td>
        <span className="font-medium text-ink-primary">{c.metricLabel}</span>
        {c.metricId && c.metricId !== c.metricLabel && (
          <span className="block font-mono text-[9px] text-ink-secondary/70">{c.metricId}</span>
        )}
      </Td>
      <Td className="text-ink-primary">{c.entityLabel}</Td>
      <Td className="whitespace-nowrap text-ink-secondary">{c.period}</Td>
      <Td className="text-right font-mono tabular-nums text-ink-secondary">{formatRaw(c.rawValue)}</Td>
      <Td className="text-right font-mono tabular-nums font-medium text-ink-primary">{formatValue(c.normalizedValue, c.unit)}</Td>
      <Td className="text-[9.5px] uppercase text-ink-secondary/80">{c.unit || '—'}</Td>
      <Td>
        {c.sourceUrl ? (
          <a href={c.sourceUrl} target="_blank" rel="noreferrer"
            title={c.sourceName ?? c.sourceUrl}
            className="group inline-flex items-start gap-1 text-muted-blue hover:text-navy-primary hover:underline">
            <span className="line-clamp-2 max-w-[200px] leading-snug">{shortSource(c.sourceName) ?? 'Source link'}</span>
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
          </a>
        ) : (
          <span className="line-clamp-2 max-w-[200px] leading-snug text-ink-secondary/80">{shortSource(c.sourceName) ?? '—'}</span>
        )}
        {c.sourceDate && <span className="mt-0.5 block text-[9px] text-ink-secondary/70">as of {String(c.sourceDate).slice(0, 10)}</span>}
      </Td>
      <Td className="whitespace-nowrap text-[10px] text-ink-secondary">{c.fetchedAt ? c.fetchedAt.slice(0, 10) : '—'}</Td>
      <Td className="text-[10.5px] text-ink-secondary">{c.dashboardField}</Td>
      <Td className="text-[10px] leading-snug text-ink-secondary">{c.note || '—'}</Td>
    </tr>
  )
}

// ─── Reconciliation tables ──────────────────────────────────────────────────

function UnusedTable({ model }: { model: ReturnType<typeof buildAudit> }) {
  const [open, setOpen] = useState(false)
  const rows = model.unused
  if (rows.length === 0) return null
  return (
    <CollapsiblePanel
      open={open} onToggle={() => setOpen((v) => !v)}
      icon={<Link2 className="h-4 w-4 text-lavender" />}
      title="Unused extracted fields"
      subtitle={`${rows.length} values were extracted & normalized but aren't placed in any template cell`}
    >
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgba(23,43,77,0.08)]">
          <tr className="text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
            <Th className="min-w-[140px]">Company</Th>
            <Th className="min-w-[170px]">Metric</Th>
            <Th className="w-[80px]">Period</Th>
            <Th className="w-[120px] text-right">Value</Th>
            <Th className="min-w-[200px]">Source</Th>
            <Th className="w-[92px]">Fetched</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-soft-border/60 bg-lavender-soft/20 align-top">
              <Td className="text-ink-primary">{r.entityLabel}</Td>
              <Td><span className="font-medium text-ink-primary">{r.metricLabel}</span><span className="block font-mono text-[9px] text-ink-secondary/70">{r.metricId}</span></Td>
              <Td className="text-ink-secondary">{r.period}</Td>
              <Td className="text-right font-mono tabular-nums font-medium text-ink-primary">{formatValue(r.normalizedValue, r.unit)}</Td>
              <Td>
                {r.sourceUrl ? (
                  <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-blue hover:underline">
                    <span className="line-clamp-2 max-w-[220px]">{shortSource(r.sourceName) ?? 'Source'}</span><ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : <span className="line-clamp-2 max-w-[220px] text-ink-secondary/80">{shortSource(r.sourceName) ?? '—'}</span>}
              </Td>
              <Td className="text-[10px] text-ink-secondary">{r.fetchedAt ? r.fetchedAt.slice(0, 10) : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </CollapsiblePanel>
  )
}

function MappingIssuesTable({ model }: { model: ReturnType<typeof buildAudit> }) {
  const [open, setOpen] = useState(false)
  const rows = model.mappingIssues
  return (
    <CollapsiblePanel
      open={open} onToggle={() => setOpen((v) => !v)}
      icon={<AlertTriangle className={`h-4 w-4 ${rows.length > 0 ? 'text-coral' : 'text-emerald'}`} />}
      title="Mapping issues"
      subtitle={rows.length === 0
        ? 'None — every canonical dashboard value is traceable here'
        : `${rows.length} dashboard values can't be traced to a source-backed cell`}
      tone={rows.length > 0 ? 'warn' : 'ok'}
    >
      {rows.length === 0 ? (
        <p className="px-3.5 py-4 text-[12px] text-ink-secondary">
          Every canonical financial value the dashboard renders (annual snapshot) is backed by a traced value in this audit. ✓
        </p>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgba(23,43,77,0.08)]">
            <tr className="text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
              <Th className="min-w-[140px]">Company</Th>
              <Th className="min-w-[170px]">Metric</Th>
              <Th className="w-[80px]">Period</Th>
              <Th className="w-[120px] text-right">On dashboard</Th>
              <Th className="min-w-[280px]">Why it's flagged</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-soft-border/60 bg-coral-soft/20 align-top">
                <Td className="text-ink-primary">{r.entityLabel}</Td>
                <Td><span className="font-medium text-ink-primary">{r.metricLabel}</span></Td>
                <Td className="text-ink-secondary">{r.period}</Td>
                <Td className="text-right font-mono tabular-nums font-medium text-ink-primary">{r.dashboardValue?.toLocaleString?.('en-IN') ?? String(r.dashboardValue)}</Td>
                <Td className="text-[10px] leading-snug text-ink-secondary">{r.reason}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CollapsiblePanel>
  )
}

// ─── Small UI atoms ─────────────────────────────────────────────────────────

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`px-2 py-1.5 font-semibold ${className}`}>{children}</th>
}
function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 ${className}`}>{children}</td>
}

function MiniStat({ n, color, label }: { n: number; color: QaColor; label: string }) {
  return (
    <span className="hidden shrink-0 items-center gap-1 sm:inline-flex" title={`${n} ${label}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: QA_STYLE[color].dot }} />
      <span className="text-[10.5px] font-semibold tabular-nums text-ink-primary">{n}</span>
    </span>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[180px] rounded-lg border border-soft-border bg-white py-1.5 pl-2 pr-6 text-[11.5px] text-ink-primary outline-none focus:border-navy-primary/40"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function GroupToggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
        active ? 'bg-navy-primary text-white shadow-soft' : 'text-ink-secondary hover:text-navy-primary',
      ].join(' ')}
    >
      {icon}{label}
    </button>
  )
}

function CollapsiblePanel({ open, onToggle, icon, title, subtitle, tone = 'neutral', children }: {
  open: boolean; onToggle: () => void; icon: ReactNode; title: string; subtitle: string
  tone?: 'neutral' | 'warn' | 'ok'; children: ReactNode
}) {
  const border = tone === 'warn' ? 'border-coral/30' : tone === 'ok' ? 'border-emerald/30' : 'border-soft-border'
  return (
    <div className={`overflow-hidden rounded-xl border ${border} bg-card shadow-soft`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface/60">
        <ChevronRight className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${open ? 'rotate-90' : ''}`} />
        {icon}
        <div className="min-w-0 flex-1">
          <span className="font-display text-[14px] text-navy-deep">{title}</span>
          <p className="truncate text-[10.5px] text-ink-secondary">{subtitle}</p>
        </div>
      </button>
      {open && <div className="max-h-[72vh] overflow-auto scroll-thin border-t border-soft-border">{children}</div>}
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

interface SheetTally {
  total: number; valuePresent: number; missing: number; parserIssue: number; blocked: number
}
function tally(cells: AuditCell[]): SheetTally {
  const s: SheetTally = { total: cells.length, valuePresent: 0, missing: 0, parserIssue: 0, blocked: 0 }
  for (const c of cells) {
    if (c.normalizedValue !== null && c.normalizedValue !== undefined) s.valuePresent++
    if (c.status === 'missing') s.missing++
    else if (c.status === 'parser_issue') s.parserIssue++
    else if (c.status === 'blocked') s.blocked++
  }
  return s
}

/** Trim a long provenance string to a readable lead (the table tooltips keep the full text). */
function shortSource(name: string | null): string | null {
  if (!name) return null
  const lead = name.split(/[—–-]\s|\. /)[0].trim()
  return lead.length > 64 ? `${lead.slice(0, 61)}…` : lead
}

// ─── Excel export (reuses the in-repo `xlsx` dep; dynamic import keeps it out of
//     the initial bundle) ─────────────────────────────────────────────────────

async function exportToExcel(
  view: { key: string; cells: AuditCell[] }[],
  model: ReturnType<typeof buildAudit>,
  groupMode: GroupMode,
) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>() // unique, ≤31-char worksheet names per export

  // Summary sheet.
  const s = model.summary
  const summaryAoa = [
    ['Extracted Data Audit — summary'],
    ['Generated', new Date().toISOString()],
    ['Template', model.meta.template_file ?? ''],
    ['Pipeline updated', model.meta.last_updated ?? ''],
    [],
    ['Cells expected', s.totalExpected],
    ['Fetched (value present)', s.fetched],
    ['Missing', s.missing],
    ['Parser issues', s.parserIssues],
    ['Source unavailable', s.sourceUnavailable],
    ['Manual override', s.manualOverride],
    ['Transformed / adjusted', s.transformed],
    ['Blocked / withheld', s.blocked],
    ['Source-linked', s.sourceLinked],
    ['Dashboard-mapped', s.dashboardMapped],
    ['Computed in Excel (not fetched)', s.computed],
    ['Unused extracted fields', s.unusedExtracted],
    ['Mapping issues', s.mappingIssues],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), 'Summary')

  const header = [
    'Sheet', 'Cell', 'Section', 'Metric', 'Metric id', 'Company', 'Period',
    'Raw value', 'Normalized value', 'Unit', 'Status', 'Source name', 'Source URL',
    'Source date', 'Fetched at', 'Dashboard field', 'Notes',
  ]
  const rowOf = (c: AuditCell) => [
    c.sheet, c.cellRef, c.section, c.metricLabel, c.metricId, c.entityLabel, c.period,
    c.rawValue ?? '', c.normalizedValue ?? '', c.unit, STATUS_META[c.status].label,
    c.sourceName ?? '', c.sourceUrl ?? '', c.sourceDate ?? '', c.fetchedAt ?? '', c.dashboardField, c.note,
  ]

  for (const g of view) {
    const aoa = [header, ...g.cells.map(rowOf)]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sanitizeSheetName(g.key, usedNames))
  }

  if (model.unused.length) {
    const aoa = [
      ['Company', 'Metric', 'Metric id', 'Period', 'Value', 'Unit', 'Source name', 'Source URL', 'Fetched at'],
      ...model.unused.map((r) => [r.entityLabel, r.metricLabel, r.metricId, r.period, r.normalizedValue ?? '', r.unit, r.sourceName ?? '', r.sourceUrl ?? '', r.fetchedAt ?? '']),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Unused extracted')
  }
  if (model.mappingIssues.length) {
    const aoa = [
      ['Company', 'Metric', 'Period', 'On dashboard', 'Reason'],
      ...model.mappingIssues.map((r) => [r.entityLabel, r.metricLabel, r.period, r.dashboardValue ?? '', r.reason]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Mapping issues')
  }

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `extracted-data-audit_${groupMode}_${stamp}.xlsx`)
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Sheet'
  let candidate = base
  let i = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 26)} ${i++}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}
