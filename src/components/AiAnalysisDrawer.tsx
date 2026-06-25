import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { X, Copy, Check, Loader2, AlertTriangle, Trash2 } from 'lucide-react'
import { formatValue, type AuditCell } from '@/lib/extractedDataAudit'
import { selectionFromAuditCells, computeReadout, scopeLabel, buildAnalystRequest, localQuickRead, periodSortKey } from '@/lib/analystReadout'
import { generateAnalysis } from '@/lib/insightApi'
import type { AnalystResult, Conviction, Tier1Readout } from '@/insights/analystTypes'

// ---------------------------------------------------------------------------
//  AiAnalysisDrawer — the AI Analysis panel for a drag-selection of audit cells.
//
//  This panel IS the analysis: coverage → quick chart → quick read → formula →
//  source note. It tries the secure server function for a sharper read; if that
//  isn't available it silently falls back to the computed readout (a small muted
//  note at the bottom only). No nested "AI summary" button, no plumbing.
// ---------------------------------------------------------------------------

const PALETTE = ['#234A84', '#148A87', '#B68B3A', '#4D7EA8', '#6E7BD6']

const CONV: Record<Conviction, { cls: string; dot: string }> = {
  High: { cls: 'bg-teal-soft text-teal ring-[#BFE3E1]', dot: 'bg-teal' },
  Medium: { cls: 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]', dot: 'bg-champagne' },
  Low: { cls: 'bg-ice text-ink-secondary ring-soft-border', dot: 'bg-ink-secondary' },
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-1 text-[10px] font-semibold text-navy-deep transition hover:border-muted-blue"
    >
      {copied ? <Check className="h-3 w-3 text-teal" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function axisFmt(v: number, unit: string): string {
  if (unit === '%' || unit === 'x') return `${v}`
  return Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
}

// Compact line (time-series) or bar (peer) chart — a quick visual aid only.
function MiniChart({ readout }: { readout: Tier1Readout }) {
  const kind: 'line' | 'bar' | null =
    readout.scope.metrics.length === 1 && readout.scope.multiPeriod && readout.trends.length >= 1
      ? 'line'
      : readout.scope.metrics.length === 1 && !readout.scope.multiPeriod && readout.metricStats.length >= 1
        ? 'bar'
        : null
  if (!kind) return null

  if (kind === 'line') {
    const series = readout.trends.slice(0, 5)
    const unit = series[0].unit
    const periods = [...new Set(series.flatMap((t) => t.points.map((p) => p.period)))].sort((a, b) => periodSortKey(a) - periodSortKey(b))
    const data = periods.map((p) => {
      const row: Record<string, number | string> = { period: p }
      for (const t of series) {
        const pt = t.points.find((x) => x.period === p)
        if (pt) row[t.companyLabel] = pt.value
      }
      return row
    })
    return (
      <div className="rounded-xl border border-soft-border bg-card p-2">
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 2 }}>
              <CartesianGrid vertical={false} stroke="#ECEFF5" strokeDasharray="2 4" />
              <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: '#ECEFF5' }} tick={{ fontSize: 9.5, fill: '#6B7280' }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v: number) => axisFmt(v, unit)} tickLine={false} axisLine={false} tick={{ fontSize: 9.5, fill: '#6B7280' }} width={34} />
              <Tooltip formatter={(v: number | string) => formatValue(typeof v === 'number' ? v : null, unit)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              {series.map((t, i) => (
                <Line key={t.companyLabel} type="monotone" dataKey={t.companyLabel} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.8} dot={{ r: 2 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  const m = readout.metricStats[0]
  const data = [...m.ranks].sort((a, b) => a.rank - b.rank).map((r) => ({ name: r.companyLabel, value: r.value }))
  return (
    <div className="rounded-xl border border-soft-border bg-card p-2">
      <p className="mb-0.5 px-1 text-[10px] font-semibold text-navy-deep">{m.metricLabel} · {m.period}</p>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 2 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="#ECEFF5" strokeDasharray="2 4" />
            <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#ECEFF5' }} tick={{ fontSize: 9, fill: '#6B7280' }} interval={0} />
            <YAxis tickFormatter={(v: number) => axisFmt(v, m.unit)} tickLine={false} axisLine={false} tick={{ fontSize: 9.5, fill: '#6B7280' }} width={34} />
            <Tooltip formatter={(v: number | string) => formatValue(typeof v === 'number' ? v : null, m.unit)} cursor={{ fill: 'rgba(39,69,126,0.05)' }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Bar dataKey="value" fill="#234A84" radius={[3, 3, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const fyNum = (p: string) => {
  const m = p.match(/FY\s?(\d{2})/i)
  return m ? Number(m[1]) : null
}

// Growth % and (for annual ranges) CAGR — only for a single time-series.
function growthFormulas(readout: Tier1Readout): { lines: string[]; copy: string[] } | null {
  if (!(readout.trends.length === 1 && readout.scope.metrics.length === 1 && readout.scope.companies.length === 1)) return null
  const t = readout.trends[0]
  if (!(t.from > 0)) return null
  const lines: string[] = []
  if (t.pctChange != null) lines.push(`Growth % = (End ÷ Start − 1) × 100 = ${t.pctChange > 0 ? '+' : ''}${t.pctChange}%`)
  const a = fyNum(t.points[0].period)
  const b = fyNum(t.points[t.points.length - 1].period)
  if (a != null && b != null && b - a >= 1) {
    const cagr = (Math.pow(t.to / t.from, 1 / (b - a)) - 1) * 100
    lines.push(`CAGR = (End ÷ Start)^(1/${b - a}) − 1 = ${cagr > 0 ? '+' : ''}${cagr.toFixed(1)}% (${b - a} yrs)`)
  }
  return lines.length ? { lines, copy: lines } : null
}

function CoverageCard({ readout }: { readout: Tier1Readout }) {
  const { coverage } = readout
  const pct = coverage.total ? Math.round((coverage.ready / coverage.total) * 100) : 0
  const tone = pct >= 80 ? 'bg-teal' : pct >= 50 ? 'bg-champagne' : 'bg-coral'
  return (
    <div className="rounded-xl border border-soft-border bg-surface-tint p-3">
      <p className="text-[11.5px] font-semibold text-navy-deep">
        {coverage.total} cell{coverage.total === 1 ? '' : 's'} selected · <span className="text-teal">{coverage.ready} ready</span>
        {coverage.gaps > 0 && <span className="text-coral"> · {coverage.gaps} gap{coverage.gaps > 1 ? 's' : ''}</span>}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ice">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AiAnalysisDrawer({ cells, autoGenerate, onClose, onClear }: { cells: AuditCell[]; autoGenerate?: boolean; onClose: () => void; onClear?: () => void }) {
  const items = useMemo(() => selectionFromAuditCells(cells), [cells])
  const readout = useMemo(() => computeReadout(items), [items])
  const label = useMemo(() => scopeLabel(readout), [readout])
  const localPoints = useMemo(() => localQuickRead(readout, items), [readout, items])
  const formulas = useMemo(() => growthFormulas(readout), [readout])

  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<AnalystResult | null>(null)
  const canGenerate = readout.coverage.ready > 0

  const generate = async (force = false) => {
    setState('loading')
    const resp = await generateAnalysis(buildAnalystRequest(items), force)
    if (resp.ok) {
      setResult(resp.result)
      setState('done')
    } else {
      setState('error') // silent fall-back to the computed readout; no plumbing shown
    }
  }

  useEffect(() => {
    if (autoGenerate && canGenerate) void generate(false)
  }, [readout.signature])

  const points = state === 'done' && result ? result.quickRead : localPoints
  const metricFormula = (state === 'done' && result?.formula) || readout.formula

  const copyText = [
    `AI Analysis — ${label}`,
    '',
    ...points.map((b) => `• ${b}`),
    formulas ? '\n' + formulas.copy.join('\n') : '',
    metricFormula ? `\n${metricFormula.title}: ${metricFormula.body}` : '',
    state === 'done' && result?.conclusion ? `\nConclusion: ${result.conclusion}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const sq = readout.sourceQuality

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full max-w-sm">
      <aside className="animate-drawer-in pointer-events-auto relative ml-auto flex h-full w-full flex-col border-l border-soft-border bg-card shadow-lift">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-soft-border px-4 py-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne-deep">AI Analysis</p>
            <h3 className="mt-0.5 font-display text-[14px] leading-snug text-navy-deep line-clamp-2" title={label}>{label}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-ink-secondary transition hover:bg-ice hover:text-navy-deep" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          <CoverageCard readout={readout} />

          <MiniChart readout={readout} />
          {readout.coverage.gaps > 0 && (
            <p className="text-[10px] italic text-ink-secondary">Chart shows the {readout.coverage.ready} ready cell{readout.coverage.ready === 1 ? '' : 's'}; {readout.coverage.gaps} gap{readout.coverage.gaps > 1 ? 's' : ''} omitted.</p>
          )}

          {/* Quick read */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-navy-deep">Quick read</p>
              {state === 'loading' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-blue">
                  <Loader2 className="h-3 w-3 animate-spin" /> sharpening…
                </span>
              )}
              {state === 'done' && result && (
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${CONV[result.conviction].cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${CONV[result.conviction].dot}`} /> {result.conviction}
                </span>
              )}
            </div>
            {points.length > 0 ? (
              <ul className="space-y-1">
                {points.map((b, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-ink-primary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-champagne-deep" />
                    {b}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] italic text-ink-secondary">Select at least one ready, source-backed cell to see an analysis.</p>
            )}
          </div>

          {/* Formula / interpretation */}
          {(formulas || metricFormula) && (
            <div className="rounded-lg bg-soft-blue/50 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-navy-primary">Formula</p>
              {formulas && (
                <ul className="mt-0.5 space-y-0.5">
                  {formulas.lines.map((l, i) => (
                    <li key={i} className="font-mono text-[10.5px] leading-relaxed text-ink-secondary">{l}</li>
                  ))}
                </ul>
              )}
              {metricFormula && <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">{metricFormula.body}</p>}
            </div>
          )}

          {/* AI takeaway */}
          {state === 'done' && result?.conclusion && (
            <div className="border-t border-soft-border pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-navy-deep">Takeaway</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-primary">{result.conclusion}</p>
            </div>
          )}

          {/* Source / data quality */}
          {(sq.firewallWarnings.length > 0 || sq.marketOnly > 0 || readout.coverage.gaps > 0) && (
            <div className="rounded-lg border border-soft-border bg-surface-tint p-2.5 text-[10.5px] leading-snug text-ink-secondary">
              <p className="mb-0.5 font-semibold text-navy-deep">Source &amp; data quality</p>
              {readout.coverage.gaps > 0 && <p>{readout.coverage.ready}/{readout.coverage.total} ready · {readout.coverage.gaps} not available.</p>}
              {sq.marketOnly > 0 && <p className="text-champagne-deep">{sq.marketOnly} cell{sq.marketOnly > 1 ? 's' : ''} rest on a market/aggregator source — treat as indicative.</p>}
              {sq.firewallWarnings.slice(0, 2).map((w, i) => (
                <p key={i} className="mt-0.5 flex items-start gap-1 text-champagne-deep"><AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {w}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-soft-border px-4 py-2.5">
          {state === 'error' && (
            <p className="mb-2 text-[10px] italic text-ink-secondary">AI model unavailable — showing the computed readout from your selection.</p>
          )}
          <div className="flex items-center gap-2">
            <CopyBtn text={copyText} />
            {onClear && (
              <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-1 text-[10px] font-semibold text-ink-secondary transition hover:border-coral/40 hover:text-coral">
                <Trash2 className="h-3 w-3" /> Clear selection
              </button>
            )}
            {state === 'done' && (
              <button type="button" onClick={() => generate(true)} className="ml-auto text-[10px] font-semibold text-muted-blue transition hover:text-navy-deep">
                Regenerate analysis
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
