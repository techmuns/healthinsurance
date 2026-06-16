import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import type { ChartSpec } from '@/insights/types'
import { buildPanel, type InsurerPanel } from '@/insights/panel'

// Charts are bound to the LIVE panel by key — they redraw as new data lands, no
// code change. A missing series renders a calm "data pending" state, never a crash.

const PANEL = buildPanel()
const byId = new Map(PANEL.insurers.map((p) => [p.id, p]))

const COLORS = ['#27457E', '#168E8E', '#8061B8', '#3D5F9F', '#A8443B']
const GRID = '#ECEFF5'
const FOCAL = '#C99736' // gold — the insight's subject; pulls the eye to what matters
const PEER = '#9FB1C9'  // calm slate-blue — the supporting cast
// With a single-subject insight, paint the subject gold and mute the peers so the
// protagonist stands out; with no single focus, fall back to the tone-coded cycle.
const colorFor = (id: string, i: number, focal?: string) =>
  focal ? (id === focal ? FOCAL : PEER) : COLORS[i % COLORS.length] || '#27457E'
const labelFor = (id: string) => byId.get(id)?.label ?? id

type Num = number | null
const lastDefined = (xs: { fy: string; v: Num }[]): Num => {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i].v != null) return xs[i].v
  return null
}

/** A per-fiscal-year series for one metric key on one insurer. */
function series(p: InsurerPanel, key: string): { fy: string; v: Num }[] {
  if (key === 'health_retail_mix') {
    return p.healthMix.filter((h) => h.retail != null && h.total).map((h) => ({ fy: h.fiscal_year, v: Math.round(((h.retail as number) / (h.total as number)) * 1000) / 10 }))
  }
  return p.annual.map((a) => ({ fy: a.fiscal_year, v: (a as unknown as Record<string, Num>)[key] ?? null }))
}

/** Latest value of a metric key for one insurer (handles valuation + health). */
function latest(p: InsurerPanel, key: string): Num {
  if (key === 'pb') return p.valuation?.pb ?? null
  if (key === 'pe') return p.valuation?.pe ?? null
  if (key === 'pGwp') return p.valuation?.pGwp ?? null
  if (key === 'health_retail_mix') return lastDefined(series(p, key))
  return lastDefined(series(p, key))
}

function Pending({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-soft-border bg-ice/40 text-center">
      <p className="text-[12px] font-semibold text-navy-deep">{title}</p>
      <p className="mt-0.5 text-[11px] text-ink-secondary">Series not available yet — data pending.</p>
    </div>
  )
}

export function InsightChart({ spec, focal }: { spec: ChartSpec; focal?: string }) {
  const insurers = spec.insurers.filter((id) => byId.has(id))
  const thresholds = (spec.annotations ?? []).filter((a) => a.kind === 'threshold' && typeof a.value === 'number')

  // ── timeseries: one line per insurer for seriesKeys[0] ────────────────────
  if (spec.type === 'timeseries') {
    const key = spec.seriesKeys[0]
    const fys = [...new Set(insurers.flatMap((id) => series(byId.get(id)!, key).map((s) => s.fy)))].sort()
    if (!fys.length) return <Pending title={spec.title} />
    const rows = fys.map((fy) => {
      const row: Record<string, string | number | null> = { fy }
      for (const id of insurers) row[id] = series(byId.get(id)!, key).find((s) => s.fy === fy)?.v ?? null
      return row
    })
    return (
      <Wrap title={spec.title}>
        <LineChart data={rows} margin={{ top: 6, right: 10, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="fy" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={false} width={36} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [v, labelFor(n)]} />
          {thresholds.map((t, i) => <ReferenceLine key={i} y={t.value} stroke="#B68B3A" strokeDasharray="4 4" label={{ value: t.label, fontSize: 9, fill: '#8A6516', position: 'insideTopRight' }} />)}
          {insurers.map((id, i) => <Line key={id} type="monotone" dataKey={id} name={id} stroke={colorFor(id, i, focal)} strokeWidth={focal && id === focal ? 2.6 : 1.6} dot={{ r: focal && id === focal ? 3 : 2 }} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </Wrap>
    )
  }

  // ── ranking_bar: latest value per insurer for seriesKeys[0] ───────────────
  if (spec.type === 'ranking_bar') {
    const key = spec.seriesKeys[0]
    const data = insurers.map((id, i) => ({ id, label: labelFor(id), v: latest(byId.get(id)!, key), color: colorFor(id, i, focal) })).filter((d) => d.v != null).sort((a, b) => (b.v as number) - (a.v as number))
    if (!data.length) return <Pending title={spec.title} />
    return (
      <Wrap title={spec.title}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 28, left: 6, bottom: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} strokeDasharray="2 4" />
          <XAxis type="number" tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#26303F' }} tickLine={false} axisLine={false} width={88} />
          <Tooltip contentStyle={TT} />
          {thresholds.map((t, i) => <ReferenceLine key={i} x={t.value} stroke="#B68B3A" strokeDasharray="4 4" label={{ value: t.label, fontSize: 9, fill: '#8A6516', position: 'top' }} />)}
          <Bar dataKey="v" radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.id} fill={d.color} />)}
          </Bar>
        </BarChart>
      </Wrap>
    )
  }

  // ── scatter_dislocation: x=seriesKeys[0], y=seriesKeys[1] per insurer ──────
  if (spec.type === 'scatter_dislocation') {
    const [xk, yk] = spec.seriesKeys
    const pts = insurers.map((id, i) => ({ id, label: labelFor(id), x: latest(byId.get(id)!, xk), y: latest(byId.get(id)!, yk), color: colorFor(id, i, focal) })).filter((p) => p.x != null && p.y != null)
    if (!pts.length) return <Pending title={spec.title} />
    return (
      <Wrap title={spec.title}>
        <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 14 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
          <XAxis type="number" dataKey="x" name={xk} tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: xk, position: 'insideBottom', offset: -8, fontSize: 10, fill: '#6B7280' }} />
          <YAxis type="number" dataKey="y" name={yk} tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={false} width={36} label={{ value: yk, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#6B7280' }} />
          <ZAxis range={[120, 120]} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [v, n]} labelFormatter={() => ''} />
          <Scatter data={pts} isAnimationActive={false}>
            {pts.map((p) => <Cell key={p.id} fill={p.color} />)}
          </Scatter>
        </ScatterChart>
      </Wrap>
    )
  }

  // ── decomposition_stacked: retail vs group per insurer (latest) ───────────
  if (spec.type === 'decomposition_stacked') {
    const data = insurers.map((id) => {
      const hm = byId.get(id)!.healthMix
      const last = hm[hm.length - 1]
      return { label: labelFor(id), retail: last?.retail ?? null, group: last?.group ?? null }
    }).filter((d) => d.retail != null || d.group != null)
    if (!data.length) return <Pending title={spec.title} />
    return (
      <Wrap title={spec.title}>
        <BarChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#26303F' }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip contentStyle={TT} />
          <Bar dataKey="retail" name="Retail" stackId="a" fill="#168E8E" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="group" name="Group" stackId="a" fill="#B68B3A" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </Wrap>
    )
  }

  // ── slope_dumbbell: first vs last period of seriesKeys[0] per insurer ─────
  const key = spec.seriesKeys[0]
  const rows = insurers.map((id, i) => {
    const s = series(byId.get(id)!, key).filter((x) => x.v != null)
    if (s.length < 2) return null
    return { id, label: labelFor(id), from: s[0], to: s[s.length - 1], color: colorFor(id, i, focal) }
  }).filter((r): r is NonNullable<typeof r> => r != null)
  if (!rows.length) return <Pending title={spec.title} />
  const all = rows.flatMap((r) => [r.from.v as number, r.to.v as number])
  const lo = Math.min(...all, ...(thresholds.map((t) => t.value as number)))
  const hi = Math.max(...all, ...(thresholds.map((t) => t.value as number)))
  const pos = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100)
  return (
    <div className="rounded-xl border border-soft-border bg-card p-3 shadow-soft">
      <p className="mb-3 text-[11px] font-semibold text-navy-deep">{spec.title}</p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 truncate text-ink-secondary">{r.label}</span>
            <div className="relative h-5 flex-1">
              <span className="absolute inset-y-1/2 left-0 right-0 h-px -translate-y-1/2 bg-soft-border" />
              {thresholds.map((t, i) => <span key={i} className="absolute inset-y-0 w-px bg-[#B68B3A]/60" style={{ left: `${pos(t.value as number)}%` }} title={t.label} />)}
              <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: `${Math.min(pos(r.from.v as number), pos(r.to.v as number))}%`, width: `${Math.abs(pos(r.to.v as number) - pos(r.from.v as number))}%`, background: r.color, opacity: 0.5 }} />
              <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2" style={{ left: `${pos(r.from.v as number)}%`, color: r.color, boxShadow: `0 0 0 2px ${r.color}` }} title={`${r.from.fy}: ${r.from.v}`} />
              <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${pos(r.to.v as number)}%`, background: r.color }} title={`${r.to.fy}: ${r.to.v}`} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-navy-deep">{r.from.v} → <strong>{r.to.v}</strong></span>
          </div>
        ))}
      </div>
    </div>
  )
}

const TT = { borderRadius: 10, border: '1px solid #E5E8EF', fontSize: 11, boxShadow: '0 8px 22px rgba(23,43,77,0.1)' } as const

function Wrap({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="rounded-xl border border-soft-border bg-card p-3 shadow-soft">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{title}</p>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  )
}
