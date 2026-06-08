import { useMemo, useState, type ReactNode } from 'react'
import {
  Download, Search, ChevronRight, ExternalLink, FileSpreadsheet,
  RotateCcw, Layers, Table2, AlertTriangle, Link2, Users, Star, LayoutGrid,
} from 'lucide-react'
import {
  buildAudit, STATUS_META, formatValue, formatRaw, stripFor, periodSort,
  companyRank, FOCAL_COMPANY,
  type AuditCell, type AuditStatus, type QaColor, type StripCounts,
} from '@/lib/extractedDataAudit'

// ---------------------------------------------------------------------------
//  Extracted Data Audit — a QA tab (not analysis). It mirrors the Excel/source
//  template cell-by-cell so a reviewer can confirm every value is fetched,
//  normalized, source-linked and routed into the dashboard correctly.
//
//  Scoped to what matters: the SAHI deep-dive (per-insurer financials, Niva
//  Bupa first) leads; the all-company / market data the dashboard only needs at
//  industry level is kept in a separate, secondary scope.
// ---------------------------------------------------------------------------

const QA_STYLE: Record<QaColor, { dot: string; pill: string; tint: string }> = {
  green: { dot: '#2F855A', pill: 'bg-emerald-soft text-emerald', tint: 'bg-emerald-soft/30' },
  yellow: { dot: '#B7791F', pill: 'bg-gold-soft text-gold', tint: 'bg-gold-soft/40' },
  red: { dot: '#C75D54', pill: 'bg-coral-soft text-coral', tint: 'bg-coral-soft/30' },
  grey: { dot: '#94A3B8', pill: 'bg-slate-100 text-slate-500', tint: '' },
  info: { dot: '#6E7BD6', pill: 'bg-lavender-soft text-lavender', tint: 'bg-lavender-soft/30' },
}

type Scope = 'all' | 'sahi' | 'industry'
type GroupMode = 'company' | 'sheet' | 'section'

interface Filters {
  company: string
  period: string
  sourceRole: string
  status: AuditStatus | 'all'
  search: string
}
const EMPTY_FILTERS: Filters = { company: 'all', period: 'all', sourceRole: 'all', status: 'all', search: '' }

export function ExtractedDataAudit() {
  const model = useMemo(() => buildAudit(), [])
  const [scope, setScope] = useState<Scope>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('sheet')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [exporting, setExporting] = useState(false)

  const allCells = useMemo(() => model.groups.flatMap((g) => g.cells), [model])
  const scopeCounts = useMemo(() => ({
    all: allCells.length,
    sahi: allCells.filter((c) => c.scope === 'sahi').length,
    industry: allCells.filter((c) => c.scope === 'industry').length,
  }), [allCells])

  const switchScope = (s: Scope) => {
    setScope(s)
    setGroupMode(s === 'sahi' ? 'company' : 'sheet')
    setFilters(EMPTY_FILTERS)
    setOpen({})
  }

  const scopedCells = useMemo(() => (scope === 'all' ? allCells : allCells.filter((c) => c.scope === scope)), [allCells, scope])
  const strip = useMemo(() => stripFor(scopedCells), [scopedCells])

  // Filter options come from the active scope so the dropdowns only show what's relevant.
  const options = useMemo(() => {
    const companies = new Map<string, string>()
    const periods = new Set<string>()
    const sources = new Map<string, string>()
    const statuses = new Set<AuditStatus>()
    for (const c of scopedCells) {
      if (c.entityId) companies.set(c.entityId, c.entityLabel)
      if (c.period) periods.add(c.period)
      sources.set(c.role, sourceTypeOf(c.role, model))
      statuses.add(c.status)
    }
    return {
      companies: [...companies.entries()].sort((a, b) => companyRank(a[0]) - companyRank(b[0]) || a[1].localeCompare(b[1])),
      periods: [...periods].sort(periodSort),
      sources: [...sources.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      statuses: [...statuses].sort((a, b) => STATUS_META[a].label.localeCompare(STATUS_META[b].label)),
    }
  }, [scopedCells, model])

  const filterActive =
    filters.company !== 'all' || filters.period !== 'all' || filters.sourceRole !== 'all' ||
    filters.status !== 'all' || filters.search.trim() !== ''

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return scopedCells.filter((c) => {
      if (filters.company !== 'all' && c.entityId !== filters.company) return false
      if (filters.period !== 'all' && c.period !== filters.period) return false
      if (filters.sourceRole !== 'all' && c.role !== filters.sourceRole) return false
      if (filters.status !== 'all' && c.status !== filters.status) return false
      if (q && !`${c.metricLabel} ${c.metricId} ${c.section} ${c.entityLabel} ${c.cellRef} ${c.period}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [scopedCells, filters])

  const sheetOrder = useMemo(() => new Map(model.groups.map((g, i) => [g.sheet, i])), [model])

  const view = useMemo(() => {
    const map = new Map<string, AuditCell[]>()
    const keyOf = (c: AuditCell) => (groupMode === 'company' ? c.entityId : groupMode === 'sheet' ? c.sheet : c.dashboardField)
    for (const c of filtered) {
      const k = keyOf(c)
      const arr = map.get(k)
      if (arr) arr.push(c)
      else map.set(k, [c])
    }
    const groups = [...map.entries()].map(([key, cells]) => ({
      key,
      title: groupMode === 'company' ? cells[0].entityLabel : key,
      focus: groupMode === 'company' && key === FOCAL_COMPANY,
      cells,
      stats: tally(cells),
    }))
    if (groupMode === 'company') {
      groups.sort((a, b) => companyRank(a.key) - companyRank(b.key) || a.title.localeCompare(b.title))
    } else if (groupMode === 'sheet') {
      groups.sort((a, b) => (sheetOrder.get(a.key) ?? 99) - (sheetOrder.get(b.key) ?? 99))
    } else {
      groups.sort((a, b) => b.cells.length - a.cells.length)
    }
    return groups
  }, [filtered, groupMode, sheetOrder])

  const isOpen = (k: string) => open[k] ?? (scope === 'sahi' || filterActive)
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }))

  async function handleExport() {
    setExporting(true)
    try { await exportToExcel(view, model, scope, groupMode) }
    finally { setExporting(false) }
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
              A simple check of our numbers. For every figure the template needs, see if we have it,
              where it came from, and where it's used on the dashboard.
            </p>
            <p className="mt-1 text-[10.5px] text-ink-secondary/80">
              Template: <span className="font-medium text-ink-primary">{model.meta.template_file ?? 'niva-bupa-portfolio-review.xlsx'}</span>
              {model.meta.last_updated && <> · Pipeline updated {model.meta.last_updated.slice(0, 10)}</>}
            </p>
          </div>
        </div>
        <button
          type="button" onClick={handleExport} disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-navy-primary/20 bg-navy-primary px-3 py-2 text-[12px] font-semibold text-white shadow-soft transition-colors hover:bg-navy-deep disabled:opacity-60"
        >
          {exporting ? <FileSpreadsheet className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Building…' : 'Export to Excel'}
        </button>
      </div>

      {/* ── Scope switch — full coverage (default), or a focused lens ────── */}
      <div className="flex flex-wrap gap-2.5">
        <ScopeCard
          active={scope === 'all'} onClick={() => switchScope('all')}
          icon={<LayoutGrid className="h-4 w-4" />}
          title="All · full coverage" sub="Every cell the template defines — nothing excluded" count={scopeCounts.all}
        />
        <ScopeCard
          active={scope === 'sahi'} onClick={() => switchScope('sahi')}
          icon={<Star className="h-4 w-4" />}
          title="SAHI deep-dive" sub="Per-insurer financials · Niva Bupa first" count={scopeCounts.sahi}
        />
        <ScopeCard
          active={scope === 'industry'} onClick={() => switchScope('industry')}
          icon={<Layers className="h-4 w-4" />}
          title="Industry & market" sub="All-company premium, prices, channels" count={scopeCounts.industry}
        />
      </div>

      {/* ── Scoped summary strip ───────────────────────────────────────── */}
      <SummaryStrip strip={strip} scope={scope} />

      {/* ── Filter bar (sticky) ────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-1 rounded-xl border border-soft-border bg-surface/95 px-3 py-2.5 shadow-soft backdrop-blur">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search metric, company, cell…"
              className="w-full rounded-lg border border-soft-border bg-white py-1.5 pl-8 pr-3 text-[12px] text-ink-primary outline-none placeholder:text-ink-secondary/70 focus:border-navy-primary/40"
            />
          </div>
          <Select label="Company" value={filters.company} onChange={(v) => setFilters((f) => ({ ...f, company: v }))}
            options={[{ value: 'all', label: 'All companies' }, ...options.companies.map(([id, label]) => ({ value: id, label: id === FOCAL_COMPANY ? `★ ${label}` : label }))]} />
          <Select label="Period" value={filters.period} onChange={(v) => setFilters((f) => ({ ...f, period: v }))}
            options={[{ value: 'all', label: 'All periods' }, ...options.periods.map((p) => ({ value: p, label: p }))]} />
          <Select label="Source type" value={filters.sourceRole} onChange={(v) => setFilters((f) => ({ ...f, sourceRole: v }))}
            options={[{ value: 'all', label: 'All sources' }, ...options.sources.map(([id, label]) => ({ value: id, label }))]} />
          <Select label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v as AuditStatus | 'all' }))}
            options={[{ value: 'all', label: 'All statuses' }, ...options.statuses.map((s) => ({ value: s, label: STATUS_META[s].label }))]} />

          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-soft-border bg-white p-0.5">
              <GroupToggle active={groupMode === 'sheet'} onClick={() => setGroupMode('sheet')} icon={<Table2 className="h-3.5 w-3.5" />} label="Sheet" />
              <GroupToggle active={groupMode === 'company'} onClick={() => setGroupMode('company')} icon={<Users className="h-3.5 w-3.5" />} label="Company" />
              <GroupToggle active={groupMode === 'section'} onClick={() => setGroupMode('section')} icon={<Layers className="h-3.5 w-3.5" />} label="Dashboard" />
            </div>
            {filterActive && (
              <button type="button" onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex items-center gap-1 rounded-lg border border-soft-border bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-coral/40 hover:text-coral">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-secondary">
          {filterActive && <span>Showing <span className="font-semibold text-ink-primary">{filtered.length.toLocaleString('en-IN')}</span> of {scopedCells.length.toLocaleString('en-IN')} cells.</span>}
          <span className="flex flex-wrap items-center gap-2">What the colours mean:
            {(['green', 'yellow', 'red', 'info', 'grey'] as QaColor[]).map((c) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: QA_STYLE[c].dot }} />
                {c === 'green' ? 'fetched' : c === 'yellow' ? 'fetched (adjusted)' : c === 'red' ? 'missing' : c === 'info' ? 'calculated / extra' : 'not needed'}
              </span>
            ))}
          </span>
        </div>
      </div>

      {/* ── Grouped tables ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        {view.length === 0 && (
          <div className="rounded-xl border border-dashed border-soft-border bg-card/60 px-4 py-10 text-center text-[12.5px] text-ink-secondary">
            No cells match these filters.
          </div>
        )}
        {view.map((g) => (
          <GroupCard
            key={g.key}
            title={g.title}
            focus={g.focus}
            subtitle={groupMode === 'company' ? (g.focus ? 'Focal insurer (the portfolio-review subject)' : 'SAHI peer') : groupMode === 'sheet' ? sheetSub(g.key, model) : `${new Set(g.cells.map((c) => c.sheet)).size} source sheet(s)`}
            cells={g.cells}
            stats={g.stats}
            open={isOpen(g.key)}
            onToggle={() => toggle(g.key)}
          />
        ))}
      </div>

      {/* ── Reconciliation — hidden only in the industry-only lens ───────── */}
      {scope !== 'industry' && (
        <>
          <MappingIssuesTable model={model} />
          <UnusedTable rows={scope === 'sahi' ? model.unused.filter((r) => companyRank(r.entityId) < 2) : model.unused} />
        </>
      )}

      <p className="pt-1 text-center text-[10.5px] text-ink-secondary/80">
        A read-only check. We never guess a number — a blank means we don't have it yet, never a zero. Official sources come first.
      </p>
    </div>
  )
}

// ─── Scope card ─────────────────────────────────────────────────────────────

function ScopeCard({ active, onClick, icon, title, sub, count }: {
  active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string; count: number
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={[
        'group relative flex flex-1 items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all',
        active
          ? 'border-transparent bg-gradient-to-br from-[#1E4079] to-[#143058] text-white shadow-[0_6px_18px_rgba(20,48,88,0.22)]'
          : 'border-soft-border bg-white/80 text-navy-deep hover:border-navy-primary/30 hover:bg-white',
      ].join(' ')}
    >
      <span className={['flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-white/12 text-champagne' : 'bg-champagne-soft text-champagne-deep'].join(' ')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className={['block text-[10px]', active ? 'text-white/65' : 'text-ink-secondary'].join(' ')}>{sub}</span>
      </span>
      <span className={['shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', active ? 'bg-white/15 text-white' : 'bg-surface text-ink-secondary'].join(' ')}>
        {count.toLocaleString('en-IN')}
      </span>
    </button>
  )
}

// ─── Summary strip ──────────────────────────────────────────────────────────

function SummaryStrip({ strip, scope }: { strip: StripCounts; scope: Scope }) {
  const pct = strip.totalExpected ? Math.round((strip.dashboardMapped / strip.totalExpected) * 100) : 0
  const scopeWord = scope === 'all' ? 'template' : scope === 'sahi' ? 'SAHI' : 'industry'
  const tiles: { label: string; value: number; color: QaColor }[] = [
    { label: 'Numbers to fill', value: strip.totalExpected, color: 'grey' },
    { label: 'Fetched', value: strip.fetched, color: 'green' },
    { label: 'Missing', value: strip.missing, color: 'red' },
    { label: "Couldn't read", value: strip.parserIssues, color: 'red' },
    { label: 'Typed by hand', value: strip.manualOverride, color: 'yellow' },
    { label: 'Calculated', value: strip.computed, color: 'info' },
    { label: 'Has a source link', value: strip.sourceLinked, color: 'info' },
    { label: 'Used on dashboard', value: strip.dashboardMapped, color: 'green' },
  ]
  return (
    <div className="rounded-xl border border-soft-border bg-card p-4 shadow-soft">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map((t) => (
          <div key={t.label} className="relative rounded-lg border border-soft-border/70 bg-surface/60 p-3">
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
          {pct}% of the {scopeWord} numbers we need are filled in
          {strip.computed > 0 && <> · {strip.computed.toLocaleString('en-IN')} calculated by the sheet</>}
        </span>
      </div>
    </div>
  )
}

// ─── Group card + table ─────────────────────────────────────────────────────

const ROW_CAP = 250

function GroupCard({ title, subtitle, focus, cells, stats, open, onToggle }: {
  title: string; subtitle: string; focus?: boolean
  cells: AuditCell[]; stats: SheetTally; open: boolean; onToggle: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? cells : cells.slice(0, ROW_CAP)
  return (
    <div className={`overflow-hidden rounded-xl border bg-card shadow-soft ${focus ? 'border-champagne/50 ring-1 ring-champagne/20' : 'border-soft-border'}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface/60">
        <ChevronRight className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${open ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[14px] text-navy-deep">{title}</span>
            {focus && <span className="inline-flex items-center gap-1 rounded-full bg-champagne-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-champagne-deep"><Star className="h-2.5 w-2.5" />Focus</span>}
          </div>
          <p className="truncate text-[10.5px] text-ink-secondary">{subtitle}</p>
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
                  <Th className="min-w-[170px]">What it is</Th>
                  <Th className="min-w-[120px]">Company</Th>
                  <Th className="w-[78px]">Period</Th>
                  <Th className="w-[92px] text-right">As printed</Th>
                  <Th className="w-[110px] text-right">Final value</Th>
                  <Th className="w-[58px]">Unit</Th>
                  <Th className="min-w-[180px]">Source</Th>
                  <Th className="w-[88px]">Updated</Th>
                  <Th className="min-w-[160px]">Used on dashboard</Th>
                  <Th className="min-w-[210px]">Notes / how it's calculated</Th>
                </tr>
              </thead>
              <tbody>{shown.map((c) => <CellRow key={c.id} c={c} />)}</tbody>
            </table>
          </div>
          {cells.length > ROW_CAP && (
            <div className="border-t border-soft-border bg-surface/50 px-3 py-2 text-center">
              <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] font-medium text-navy-primary hover:underline">
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
  const [showCalc, setShowCalc] = useState(false)
  const hasCalc = !!c.formula
  const replicated = hasCalc ? replicateSum(c) : null
  return (
    <>
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
          {c.metricId && c.metricId !== c.metricLabel && <span className="block font-mono text-[9px] text-ink-secondary/70">{c.metricId}</span>}
        </Td>
        <Td className="text-ink-primary">{c.entityLabel}</Td>
        <Td className="whitespace-nowrap text-ink-secondary">{c.period}</Td>
        <Td className="text-right font-mono tabular-nums text-ink-secondary">{formatRaw(c.rawValue)}</Td>
        <Td className="text-right font-mono tabular-nums font-medium text-ink-primary">
          {formatValue(c.normalizedValue, c.unit)}
        </Td>
        <Td className="text-[9.5px] uppercase text-ink-secondary/80">{c.unit || '—'}</Td>
        <Td>
          {c.sourceUrl ? (
            <a href={c.sourceUrl} target="_blank" rel="noreferrer" title={c.sourceName ?? c.sourceUrl}
              className="group inline-flex items-start gap-1 text-muted-blue hover:text-navy-primary hover:underline">
              <span className="line-clamp-2 max-w-[200px] leading-snug">{shortSource(c.sourceName) ?? 'Source link'}</span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
            </a>
          ) : <span className="line-clamp-2 max-w-[200px] leading-snug text-ink-secondary/80">{shortSource(c.sourceName) ?? '—'}</span>}
          {c.sourceDate && <span className="mt-0.5 block text-[9px] text-ink-secondary/70">as of {String(c.sourceDate).slice(0, 10)}</span>}
        </Td>
        <Td className="whitespace-nowrap text-[10px] text-ink-secondary">{c.fetchedAt ? c.fetchedAt.slice(0, 10) : '—'}</Td>
        <Td className="text-[10.5px] text-ink-secondary">{c.dashboardField}</Td>
        <Td className="text-[10px] leading-snug text-ink-secondary">
          {hasCalc ? (
            <div className="space-y-0.5">
              {c.calc && <div className="text-ink-primary">{c.calc}</div>}
              <code className="block break-all rounded bg-slate-100 px-1 py-0.5 font-mono text-[9.5px] text-slate-600">{c.formula}</code>
              {c.inputs && c.inputs.length > 0 && (
                <button type="button" onClick={() => setShowCalc((v) => !v)} className="inline-flex items-center gap-0.5 text-[9.5px] font-medium text-navy-primary hover:underline">
                  <ChevronRight className={`h-2.5 w-2.5 transition-transform ${showCalc ? 'rotate-90' : ''}`} />
                  {showCalc ? 'hide' : 'trace'} {c.inputs.length} input{c.inputs.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          ) : (c.note || '—')}
        </Td>
      </tr>
      {hasCalc && showCalc && c.inputs && (
        <tr className="border-b border-soft-border/60 bg-lavender-soft/15">
          <td colSpan={13} className="px-3 py-2">
            <FormulaDetail c={c} replicated={replicated} />
          </td>
        </tr>
      )}
    </>
  )
}

/** The expandable "where do the numbers come from" panel for a computed cell. */
function FormulaDetail({ c, replicated }: { c: AuditCell; replicated: number | null }) {
  return (
    <div className="rounded-lg border border-lavender/30 bg-white/70 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
        <span className="font-semibold text-navy-deep">How this number is calculated</span>
        {c.calc && <span className="text-ink-secondary">{c.calc}</span>}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{c.formula}</code>
      </div>
      <p className="mb-1.5 text-[10px] text-ink-secondary">The numbers that go into it, and where each one comes from:</p>
      <table className="w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-wide text-ink-secondary">
            <Th className="w-[44px]">Cell</Th><Th className="min-w-[150px]">Input (row)</Th>
            <Th className="w-[120px]">Company</Th><Th className="w-[80px]">Period</Th>
            <Th className="w-[110px] text-right">Value</Th><Th className="min-w-[120px]">Source</Th>
          </tr>
        </thead>
        <tbody>
          {c.inputs!.map((i) => (
            <tr key={i.ref} className="border-t border-soft-border/50">
              <Td className="font-mono text-[9.5px] text-ink-secondary">{i.sheet ? `${i.sheet}!` : ''}{i.ref}</Td>
              <Td className="text-ink-primary">{i.label}{i.metricLabel && i.metricLabel !== i.label && <span className="block font-mono text-[8.5px] text-ink-secondary/70">{i.metricLabel}</span>}</Td>
              <Td className="text-ink-secondary">{i.entityLabel ?? '—'}</Td>
              <Td className="text-ink-secondary">{i.period ?? '—'}</Td>
              <Td className="text-right font-mono tabular-nums font-medium text-ink-primary">{i.value !== null ? formatValue(i.value, i.unit) : <span className="text-ink-secondary/70">—</span>}</Td>
              <Td>{i.sourceUrl ? <a href={i.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-muted-blue hover:underline">source<ExternalLink className="h-2.5 w-2.5" /></a> : <span className="text-ink-secondary/60">derived / —</span>}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      {replicated !== null && (
        <p className="mt-1.5 text-[10px] leading-snug text-ink-secondary">
          Add the inputs up and you get <span className="font-semibold text-ink-primary">{formatValue(replicated, c.unit)}</span>
          {typeof c.normalizedValue === 'number' ? (
            Math.abs(replicated - c.normalizedValue) < 1e-6
              ? <> — same as the reported {formatValue(c.normalizedValue, c.unit)} ✓</>
              : <> — but the reported figure is <span className="font-semibold text-ink-primary">{formatValue(c.normalizedValue, c.unit)}</span>. They don't match, so these pieces are measured a bit differently. We don't auto-fill it.</>
          ) : <> (just a quick check — we don't have a reported figure for this one, so don't rely on the total without confirming).</>}
        </p>
      )}
    </div>
  )
}

/** Safe replication: only when the formula is purely additive (SUM / +) and
 *  every input has a numeric value — e.g. combined ratio = claims + expense.
 *  Anything with −, ×, ÷, ^ is left to the reviewer (no guessing). */
function replicateSum(c: AuditCell): number | null {
  if (!c.formula || !c.inputs || c.inputs.length === 0) return null
  const body = c.formula.replace(/^=/, '').replace(/IFERROR\s*\(/gi, '(')
  if (/[-*/^]/.test(body.replace(/"[^"]*"/g, ''))) return null // any non-additive operator → skip
  let sum = 0
  for (const i of c.inputs) {
    if (typeof i.value !== 'number') return null
    sum += i.value
  }
  return sum
}

// ─── Reconciliation tables ──────────────────────────────────────────────────

function UnusedTable({ rows }: { rows: ReturnType<typeof buildAudit>['unused'] }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  return (
    <CollapsiblePanel open={open} onToggle={() => setOpen((v) => !v)} icon={<Link2 className="h-4 w-4 text-lavender" />}
      title="Extra numbers we have but don't use"
      subtitle={`${rows.length} numbers we've pulled in that the template doesn't have a spot for`}>
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgba(23,43,77,0.08)]">
          <tr className="text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
            <Th className="min-w-[140px]">Company</Th><Th className="min-w-[170px]">Metric</Th><Th className="w-[80px]">Period</Th>
            <Th className="w-[120px] text-right">Value</Th><Th className="min-w-[200px]">Source</Th><Th className="w-[92px]">Fetched</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-soft-border/60 bg-lavender-soft/20 align-top">
              <Td className="text-ink-primary">{r.entityLabel}</Td>
              <Td><span className="font-medium text-ink-primary">{r.metricLabel}</span><span className="block font-mono text-[9px] text-ink-secondary/70">{r.metricId}</span></Td>
              <Td className="text-ink-secondary">{r.period}</Td>
              <Td className="text-right font-mono tabular-nums font-medium text-ink-primary">{formatValue(r.normalizedValue, r.unit)}</Td>
              <Td>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-blue hover:underline"><span className="line-clamp-2 max-w-[220px]">{shortSource(r.sourceName) ?? 'Source'}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : <span className="line-clamp-2 max-w-[220px] text-ink-secondary/80">{shortSource(r.sourceName) ?? '—'}</span>}</Td>
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
    <CollapsiblePanel open={open} onToggle={() => setOpen((v) => !v)}
      icon={<AlertTriangle className={`h-4 w-4 ${rows.length > 0 ? 'text-coral' : 'text-emerald'}`} />}
      title="Numbers we can't trace yet" tone={rows.length > 0 ? 'warn' : 'ok'}
      subtitle={rows.length === 0 ? 'None — every dashboard number can be traced back here' : `${rows.length} numbers on the dashboard we can't trace back here yet`}>
      {rows.length === 0 ? (
        <p className="px-3.5 py-4 text-[12px] text-ink-secondary">Every main dashboard number can be traced back to a source here. ✓</p>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgba(23,43,77,0.08)]">
            <tr className="text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
              <Th className="min-w-[140px]">Company</Th><Th className="min-w-[170px]">Metric</Th><Th className="w-[80px]">Period</Th>
              <Th className="w-[120px] text-right">On dashboard</Th><Th className="min-w-[280px]">What's going on</Th>
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
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="max-w-[180px] rounded-lg border border-soft-border bg-white py-1.5 pl-2 pr-6 text-[11.5px] text-ink-primary outline-none focus:border-navy-primary/40">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function GroupToggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={['inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors', active ? 'bg-navy-primary text-white shadow-soft' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}>
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

interface SheetTally { total: number; valuePresent: number; missing: number; parserIssue: number; blocked: number }
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

function sourceTypeOf(role: string, model: ReturnType<typeof buildAudit>): string {
  const labels: Record<string, string> = {
    industry_premium: 'IRDAI / GI Council',
    company_premium_quarterly: 'IRDAI / company disclosures',
    company_premium_monthly: 'IRDAI / company disclosures',
    company_financials: 'Company disclosures / annual reports',
    valuation: 'Exchange / market data',
    market_quote: 'Exchange (NSE/BSE)',
    shareholding: 'Exchange shareholding filings',
    analyst_coverage: 'Analyst aggregators (backup)',
    distribution: 'Company reports / IRDAI NL forms',
  }
  return labels[role] ?? model.meta.template_file ?? role
}

function sheetSub(sheet: string, model: ReturnType<typeof buildAudit>): string {
  const g = model.groups.find((x) => x.sheet === sheet)
  return g ? `${g.dashboardSection}${g.computedCells ? ` · ${g.computedCells} computed` : ''}` : ''
}

function shortSource(name: string | null): string | null {
  if (!name) return null
  const lead = name.split(/[—–-]\s|\. /)[0].trim()
  return lead.length > 64 ? `${lead.slice(0, 61)}…` : lead
}

// ─── Excel export (reuses the in-repo `xlsx` dep; dynamic import) ────────────

async function exportToExcel(
  view: { key: string; title: string; cells: AuditCell[] }[],
  model: ReturnType<typeof buildAudit>, scope: Scope, groupMode: GroupMode,
) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()

  const scopedCells = scope === 'all' ? model.groups.flatMap((g) => g.cells) : model.groups.filter((g) => g.scope === scope).flatMap((g) => g.cells)
  const s = stripFor(scopedCells)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Extracted Data Audit — summary'],
    ['Scope', scope === 'all' ? 'All — full coverage' : scope === 'sahi' ? 'SAHI deep-dive' : 'Industry & market context'],
    ['Generated', new Date().toISOString()],
    ['Template', model.meta.template_file ?? ''],
    [],
    ['Cells expected', s.totalExpected],
    ['Fetched', s.fetched],
    ['Missing', s.missing],
    ['Parser issues', s.parserIssues],
    ['Manual override', s.manualOverride],
    ['Source-linked', s.sourceLinked],
    ['Dashboard-mapped', s.dashboardMapped],
    ['Computed in Excel', s.computed],
    ['Unused extracted fields', model.unused.length],
    ['Mapping issues', model.mappingIssues.length],
  ]), 'Summary')

  const header = ['Sheet', 'Cell', 'Section', 'Metric', 'Metric id', 'Company', 'Period', 'Raw value', 'Normalized value', 'Unit', 'Status', 'Source name', 'Source URL', 'Source date', 'Fetched at', 'Dashboard field', 'Notes', 'Formula', 'Calculation', 'Calculation inputs']
  const inputsText = (c: AuditCell) => (c.inputs ?? []).map((i) => `${i.ref}=${i.label}${i.period ? ` (${i.period})` : ''}${i.value !== null ? ` [${i.value}]` : ''}`).join('; ')
  const rowOf = (c: AuditCell) => [c.sheet, c.cellRef, c.section, c.metricLabel, c.metricId, c.entityLabel, c.period, c.rawValue ?? '', c.normalizedValue ?? '', c.unit, STATUS_META[c.status].label, c.sourceName ?? '', c.sourceUrl ?? '', c.sourceDate ?? '', c.fetchedAt ?? '', c.dashboardField, c.note, c.formula ?? '', c.calc ?? '', inputsText(c)]
  for (const g of view) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...g.cells.map(rowOf)]), sanitizeSheetName(g.title, used))
  }
  if (scope !== 'industry') {
    if (model.mappingIssues.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Company', 'Metric', 'Period', 'On dashboard', 'Reason'], ...model.mappingIssues.map((r) => [r.entityLabel, r.metricLabel, r.period, r.dashboardValue ?? '', r.reason])]), 'Mapping issues')
    }
    if (model.unused.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Company', 'Metric', 'Metric id', 'Period', 'Value', 'Unit', 'Source name', 'Source URL', 'Fetched at'], ...model.unused.map((r) => [r.entityLabel, r.metricLabel, r.metricId, r.period, r.normalizedValue ?? '', r.unit, r.sourceName ?? '', r.sourceUrl ?? '', r.fetchedAt ?? ''])]), 'Unused extracted')
    }
  }
  void groupMode
  XLSX.writeFile(wb, `extracted-data-audit_${scope}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Sheet'
  let candidate = base
  let i = 2
  while (used.has(candidate.toLowerCase())) candidate = `${base.slice(0, 26)} ${i++}`
  used.add(candidate.toLowerCase())
  return candidate
}
