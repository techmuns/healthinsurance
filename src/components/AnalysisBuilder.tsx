import { useMemo, useState } from 'react'
import { Plus, X, Search, Wand2, ArrowDown, ArrowUp } from 'lucide-react'
import type { Insurer } from '@/data/types'
import {
  BUILDER_PRESETS,
  bestFirstDir,
  categoriesWithMetrics,
  columnTone,
  formatMetricValue,
  metricByKey,
  valueFor,
  type BuilderMetric,
  type HeatTone,
} from '@/lib/analysisBuilder'

// ── Palette (matches CompetitivePositioning) ────────────────────────────────
const NAVY = '#172B4D'
const NAVY_PRIMARY = '#27457E'
const GOLD = '#B68B3A'
const SLATE = '#94A3B8'
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Heatmap scale — best (dark green) → poor (red), soft premium tiles.
const HEAT: Record<HeatTone, { bg: string; fg: string; ring: string }> = {
  best: { bg: '#1C7A4A', fg: '#FFFFFF', ring: 'transparent' },
  strong: { bg: '#CDE9D6', fg: '#1B6E45', ring: hexA('#1C7A4A', 0.18) },
  neutral: { bg: '#FAEFCF', fg: '#8A6516', ring: hexA('#B68B3A', 0.2) },
  weak: { bg: '#F7DCC4', fg: '#9C5A22', ring: hexA('#9C5A22', 0.18) },
  poor: { bg: '#F5D2CC', fg: '#A8443B', ring: hexA('#A8443B', 0.18) },
  na: { bg: '#F5F7FA', fg: SLATE, ring: hexA(SLATE, 0.18) },
}

const DEFAULT_PRESET = 'quality-investor'

type SortDir = 'asc' | 'desc'

export function AnalysisBuilder({ rows, focalId }: { rows: Insurer[]; focalId: string }) {
  const initial = BUILDER_PRESETS.find((p) => p.id === DEFAULT_PRESET)?.metricKeys ?? []
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initial)
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULT_PRESET)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [heatmap, setHeatmap] = useState(true)
  const [sortKey, setSortKey] = useState<string>('company')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const selected = useMemo(
    () => selectedKeys.map(metricByKey).filter((m): m is BuilderMetric => !!m),
    [selectedKeys],
  )

  // Per-column non-null values (for ranking / heatmap tones).
  const columnValues = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const m of selected) {
      map[m.key] = rows.map((r) => valueFor(r, m)).filter((v): v is number => v != null)
    }
    return map
  }, [selected, rows])

  // Sorted rows by the active sort column.
  const sortedRows = useMemo(() => {
    const list = [...rows]
    if (sortKey === 'company') {
      list.sort((a, b) => a.shortName.localeCompare(b.shortName))
    } else {
      const m = metricByKey(sortKey)
      if (m) {
        list.sort((a, b) => {
          const va = valueFor(a, m)
          const vb = valueFor(b, m)
          if (va == null && vb == null) return 0
          if (va == null) return 1 // n/a always sinks
          if (vb == null) return -1
          return va - vb
        })
      }
    }
    if (sortDir === 'desc') list.reverse()
    return list
  }, [rows, sortKey, sortDir])

  function applyPreset(id: string) {
    const p = BUILDER_PRESETS.find((x) => x.id === id)
    if (!p) return
    setSelectedKeys(p.metricKeys)
    setActivePreset(id)
    if (!p.metricKeys.includes(sortKey)) {
      setSortKey('company')
      setSortDir('asc')
    }
  }

  function toggleMetric(key: string) {
    setActivePreset(null)
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        if (sortKey === key) {
          setSortKey('company')
          setSortDir('asc')
        }
        return prev.filter((k) => k !== key)
      }
      return [...prev, key]
    })
  }

  function sortBy(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    // default to best-first for metric columns, A–Z for the company column
    setSortDir(key === 'company' ? 'asc' : bestFirstDir(metricByKey(key)!))
  }

  return (
    <div className="space-y-4">
      {/* Preset templates */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-secondary">
          <Wand2 className="h-3.5 w-3.5" style={{ color: GOLD }} />
          Templates
        </span>
        {BUILDER_PRESETS.map((p) => {
          const on = activePreset === p.id
          return (
            <button
              key={p.id}
              type="button"
              title={p.description}
              onClick={() => applyPreset(p.id)}
              className={[
                'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
                on ? 'border-transparent text-white shadow-soft' : 'border-soft-border bg-white text-ink-secondary hover:text-navy-primary hover:border-navy-primary/30',
              ].join(' ')}
              style={on ? { background: NAVY_PRIMARY } : undefined}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Selected metrics + add + heatmap toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-soft-border bg-ice/40 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-secondary">Selected metrics</span>
          {selected.length === 0 && (
            <span className="text-[11.5px] italic text-ink-secondary/70">none yet — add a metric or pick a template</span>
          )}
          {selected.map((m) => (
            <span
              key={m.key}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-navy-deep ring-1 ring-soft-border"
            >
              {m.label}
              <button
                type="button"
                onClick={() => toggleMetric(m.key)}
                className="-mr-0.5 ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full text-ink-secondary transition-colors hover:bg-coral/10 hover:text-coral"
                aria-label={`Remove ${m.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Add metric (opens the searchable picker) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-navy-primary/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-navy-primary transition-colors hover:bg-navy-primary/5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add metric
            </button>
            {pickerOpen && (
              <MetricPicker selectedKeys={selectedKeys} onToggle={toggleMetric} onClose={() => setPickerOpen(false)} search={search} setSearch={setSearch} />
            )}
          </div>
        </div>

        {/* Heatmap toggle */}
        <button
          type="button"
          onClick={() => setHeatmap((h) => !h)}
          aria-pressed={heatmap}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-secondary"
        >
          <span className={['relative h-4 w-7 rounded-full transition-colors', heatmap ? 'bg-emerald-500/80' : 'bg-soft-border'].join(' ')}>
            <span className={['absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all', heatmap ? 'left-3.5' : 'left-0.5'].join(' ')} />
          </span>
          Heatmap
        </button>
      </div>

      {/* Comparison table */}
      {selected.length === 0 ? (
        <div className="grid place-items-center rounded-xl2 border border-dashed border-soft-border bg-card py-12 text-center">
          <p className="text-[13px] font-semibold text-navy-deep">Build your comparison</p>
          <p className="mt-1 max-w-sm text-[11.5px] text-ink-secondary">Add any metric from the picker, or load a template above, to generate a side-by-side peer table.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl2 border border-soft-border bg-card shadow-soft">
          <table className="w-full min-w-[640px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-soft-border">
                <SortHeader label="Company" active={sortKey === 'company'} dir={sortDir} onClick={() => sortBy('company')} align="left" sticky />
                {selected.map((m) => (
                  <SortHeader key={m.key} label={m.label} active={sortKey === m.key} dir={sortDir} onClick={() => sortBy(m.key)} align="right" />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const focal = r.id === focalId
                return (
                  <tr key={r.id} className="border-b border-soft-border/60 last:border-0" style={focal ? { background: hexA(NAVY_PRIMARY, 0.04) } : undefined}>
                    <td className="sticky left-0 z-10 px-3 py-2" style={{ background: focal ? '#F3F6FB' : '#FFFFFF' }}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: focal ? NAVY_PRIMARY : SLATE }} />
                        <span className={['whitespace-nowrap text-[12.5px]', focal ? 'font-bold text-navy-deep' : 'font-medium text-ink-primary'].join(' ')}>{r.shortName}</span>
                        {focal && <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: NAVY_PRIMARY, color: '#fff' }}>Selected</span>}
                      </div>
                    </td>
                    {selected.map((m) => {
                      const v = valueFor(r, m)
                      const tone = columnTone(m, v, columnValues[m.key] ?? [])
                      return (
                        <td key={m.key} className="px-2 py-1.5">
                          {heatmap ? (
                            <div
                              className="flex min-h-[34px] items-center justify-end rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold tabular-nums"
                              style={{ background: HEAT[tone].bg, color: HEAT[tone].fg, boxShadow: `inset 0 0 0 1px ${HEAT[tone].ring}` }}
                            >
                              {formatMetricValue(m, v)}
                            </div>
                          ) : (
                            <div className="px-1 py-1 text-right text-[12.5px] font-semibold tabular-nums" style={{ color: v == null ? SLATE : NAVY }}>
                              {formatMetricValue(m, v)}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Heatmap legend */}
      {heatmap && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-ink-secondary">
          {([['best', 'Best'], ['strong', 'Strong'], ['neutral', 'Neutral'], ['weak', 'Weak'], ['poor', 'Poor'], ['na', 'n/a']] as [HeatTone, string][]).map(([t, l]) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-3.5 rounded-[3px]" style={{ background: HEAT[t].bg, boxShadow: `inset 0 0 0 1px ${HEAT[t].ring}` }} />
              {l}
            </span>
          ))}
          <span className="text-ink-secondary/60">· valuation multiples shown neutral (richness, not strength)</span>
        </div>
      )}
    </div>
  )
}

// ── Sortable column header ───────────────────────────────────────────────────
function SortHeader({ label, active, dir, onClick, align, sticky }: { label: string; active: boolean; dir: SortDir; onClick: () => void; align: 'left' | 'right'; sticky?: boolean }) {
  return (
    <th
      className={['px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide', align === 'left' ? 'text-left' : 'text-right', sticky ? 'sticky left-0 z-10 bg-card' : ''].join(' ')}
    >
      <button
        type="button"
        onClick={onClick}
        className={['inline-flex items-center gap-1 transition-colors', align === 'right' ? 'flex-row-reverse' : '', active ? 'text-navy-deep' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}
      >
        <span className="whitespace-nowrap">{label}</span>
        {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" style={{ color: GOLD }} /> : <ArrowDown className="h-3 w-3" style={{ color: GOLD }} />) : <span className="h-3 w-3 opacity-0" />}
      </button>
    </th>
  )
}

// ── Searchable metric picker (compact, categorized — no big dropdown) ─────────
function MetricPicker({ selectedKeys, onToggle, onClose, search, setSearch }: { selectedKeys: string[]; onToggle: (k: string) => void; onClose: () => void; search: string; setSearch: (s: string) => void }) {
  const q = search.trim().toLowerCase()
  const groups = useMemo(() => {
    return categoriesWithMetrics()
      .map((g) => ({
        category: g.category,
        metrics: q ? g.metrics.filter((m) => m.label.toLowerCase().includes(q) || g.category.toLowerCase().includes(q)) : g.metrics,
      }))
      .filter((g) => g.metrics.length > 0)
  }, [q])

  return (
    <>
      {/* click-away backdrop */}
      <button type="button" aria-label="Close picker" onClick={onClose} className="fixed inset-0 z-20 cursor-default" />
      <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[300px] overflow-hidden rounded-xl2 border border-soft-border bg-white shadow-[0_8px_30px_rgba(23,43,77,0.16)]">
        <div className="flex items-center gap-2 border-b border-soft-border px-3 py-2">
          <Search className="h-3.5 w-3.5 text-ink-secondary" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search metrics…"
            className="w-full bg-transparent text-[12px] text-navy-deep outline-none placeholder:text-ink-secondary/60"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-ink-secondary hover:text-coral" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-2 py-6 text-center text-[11.5px] text-ink-secondary">No metric matches “{search}”.</p>}
          {groups.map((g) => (
            <div key={g.category} className="mb-2 last:mb-0">
              <p className="px-1.5 pb-1 pt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-secondary/80">{g.category}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.metrics.map((m) => {
                  const on = selectedKeys.includes(m.key)
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => onToggle(m.key)}
                      className={[
                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-all',
                        on ? 'border-transparent bg-navy-primary text-white' : 'border-soft-border bg-white text-ink-primary hover:border-navy-primary/40 hover:text-navy-primary',
                      ].join(' ')}
                    >
                      {on ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
