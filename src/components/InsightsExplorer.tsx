import { useMemo, useState } from 'react'
import { Sparkles, Gauge, RotateCcw } from 'lucide-react'
import {
  AUDIT_COMPANIES,
  AUDIT_METRICS,
  AUDIT_YEARS,
  buildAuditGrid,
  type MetricCategory,
} from '@/lib/auditGrid'
import { computeReadout, scopeLabel, isReadyCell, classifySourceClass } from '@/lib/analystReadout'
import { AnalystReadoutDrawer } from '@/components/AnalystReadoutDrawer'

// ---------------------------------------------------------------------------
//  InsightsExplorer — structured, controlled selection over the SAME audited
//  inventory the Data Audit grid uses (buildAuditGrid). Companies × Aspects ×
//  Metrics × Periods × Source layer × Coverage → a cell set fed through the very
//  same Tier-1 readout + Tier-2 AI pipeline (AnalystReadoutDrawer). No separate
//  metric inventory that could drift from Data Audit (build brief §2B, §10).
// ---------------------------------------------------------------------------

const CATS: MetricCategory[] = ['Premium', 'Profitability', 'Ratios', 'Capital', 'Market share', 'Quality']
type SourceFilter = 'all' | 'statutory' | 'exclude_market'

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set)
  if (n.has(v)) n.delete(v)
  else n.add(v)
  return n
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
        active ? 'bg-navy-primary text-white shadow-soft' : 'bg-white text-ink-secondary ring-1 ring-soft-border hover:text-navy-primary'
      }`}
    >
      {children}
    </button>
  )
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[68px] shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-secondary">{label}</span>
      {children}
    </div>
  )
}

export function InsightsExplorer() {
  const grid = useMemo(() => buildAuditGrid(), [])
  const [companies, setCompanies] = useState<Set<string>>(() => new Set(AUDIT_COMPANIES.map((c) => c.id)))
  const [metrics, setMetrics] = useState<Set<string>>(() => new Set(['combined_ratio_igaap', 'solvency_ratio']))
  const [periods, setPeriods] = useState<Set<string>>(() => new Set(['FY25']))
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [readyOnly, setReadyOnly] = useState(false)
  const [open, setOpen] = useState(false)
  const [autoGen, setAutoGen] = useState(false)

  const metricsByCat = useMemo(() => {
    const m = new Map<MetricCategory, typeof AUDIT_METRICS>()
    for (const def of AUDIT_METRICS) {
      const arr = m.get(def.category) ?? []
      arr.push(def)
      m.set(def.category, arr)
    }
    return m
  }, [])

  const cells = useMemo(() => {
    return grid.cells
      .filter((c) => companies.has(c.company) && metrics.has(c.metric) && periods.has(c.year))
      .filter((c) => {
        if (sourceFilter === 'all' || !isReadyCell(c)) return true
        const cls = classifySourceClass(c.chosen)
        if (sourceFilter === 'statutory') return cls === 'statutory'
        return cls !== 'market' // exclude_market
      })
      .filter((c) => !readyOnly || isReadyCell(c))
  }, [grid, companies, metrics, periods, sourceFilter, readyOnly])

  const readout = useMemo(() => computeReadout(cells), [cells])
  const coveragePct = readout.coverage.total ? Math.round((readout.coverage.ready / readout.coverage.total) * 100) : 0

  // Toggle a whole aspect (category) on/off in the metric selection.
  const toggleAspect = (cat: MetricCategory) => {
    const keys = (metricsByCat.get(cat) ?? []).map((m) => m.key)
    const allOn = keys.every((k) => metrics.has(k))
    setMetrics((prev) => {
      const n = new Set(prev)
      for (const k of keys) {
        if (allOn) n.delete(k)
        else n.add(k)
      }
      return n
    })
  }

  const reset = () => {
    setCompanies(new Set(AUDIT_COMPANIES.map((c) => c.id)))
    setMetrics(new Set(['combined_ratio_igaap', 'solvency_ratio']))
    setPeriods(new Set(['FY25']))
    setSourceFilter('all')
    setReadyOnly(false)
  }

  const hasScope = cells.length > 0
  const canAnalyse = readout.coverage.ready > 0

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-soft-border bg-surface-tint p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-soft-blue text-navy-primary ring-1 ring-[#D6E2FA]">
              <Gauge className="h-3.5 w-3.5" />
            </span>
            <div className="leading-tight">
              <h3 className="font-display text-[14px] text-navy-deep">Explorer</h3>
              <p className="text-[10.5px] text-ink-secondary">Build a comparison from the audited inventory — same data as Data Audit.</p>
            </div>
          </div>
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[10.5px] font-semibold text-ink-secondary transition hover:text-navy-deep">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

        <div className="space-y-2">
          <ControlRow label="Companies">
            {AUDIT_COMPANIES.map((c) => (
              <Chip key={c.id} active={companies.has(c.id)} onClick={() => setCompanies((p) => toggle(p, c.id))}>
                {c.label}
              </Chip>
            ))}
          </ControlRow>

          <ControlRow label="Aspects">
            {CATS.map((cat) => {
              const keys = (metricsByCat.get(cat) ?? []).map((m) => m.key)
              const allOn = keys.length > 0 && keys.every((k) => metrics.has(k))
              return (
                <Chip key={cat} active={allOn} onClick={() => toggleAspect(cat)}>
                  {cat}
                </Chip>
              )
            })}
          </ControlRow>

          <ControlRow label="Metrics">
            {AUDIT_METRICS.map((m) => (
              <Chip key={m.key} active={metrics.has(m.key)} onClick={() => setMetrics((p) => toggle(p, m.key))}>
                {m.label}
              </Chip>
            ))}
          </ControlRow>

          <ControlRow label="Periods">
            {AUDIT_YEARS.map((y) => (
              <Chip key={y} active={periods.has(y)} onClick={() => setPeriods((p) => toggle(p, y))}>
                {y}
              </Chip>
            ))}
          </ControlRow>

          <ControlRow label="Sources">
            {([
              ['all', 'All sources'],
              ['statutory', 'Statutory only'],
              ['exclude_market', 'Exclude market'],
            ] as [SourceFilter, string][]).map(([v, l]) => (
              <Chip key={v} active={sourceFilter === v} onClick={() => setSourceFilter(v)}>
                {l}
              </Chip>
            ))}
            <span className="mx-1 h-3 w-px bg-soft-border" />
            <Chip active={readyOnly} onClick={() => setReadyOnly((r) => !r)}>
              Ready cells only
            </Chip>
          </ControlRow>
        </div>
      </div>

      {/* Scope summary + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#9DB4D8] bg-soft-blue/50 px-3 py-2">
        <p className="text-[11.5px] text-navy-primary">
          {hasScope ? (
            <>
              <span className="font-semibold">{scopeLabel(readout)}</span>
              <span className="text-ink-secondary"> · {coveragePct}% audit coverage</span>
            </>
          ) : (
            <span className="text-ink-secondary">Pick at least one company, metric and period to build a scope.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasScope}
            onClick={() => {
              setAutoGen(false)
              setOpen(true)
            }}
            className="rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-deep transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Preview readout
          </button>
          <button
            type="button"
            disabled={!canAnalyse}
            onClick={() => {
              setAutoGen(true)
              setOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#1E4079] to-[#143058] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" /> Generate AI Analysis
          </button>
        </div>
      </div>

      {open && <AnalystReadoutDrawer cells={cells} autoGenerate={autoGen} onClose={() => setOpen(false)} />}
    </div>
  )
}
