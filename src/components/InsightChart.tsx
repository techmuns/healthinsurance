import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import type { ChartSpec } from '@/insights/types'
import { buildPanel, type InsurerPanel } from '@/insights/panel'

// Charts are bound to the LIVE panel by key — they redraw as new data lands, no
// code change. A missing series renders a calm "data pending" state, never a crash.

const PANEL = buildPanel()
const byId = new Map(PANEL.insurers.map((p) => [p.id, p]))

// Standalone charts sit in their own bordered card; "embedded" charts live
// inside a larger insight card, in a soft slate-blue evidence panel with a thin
// inner border and a quiet shadow — premium and calm, never flat or harsh.
const SHELL = 'rounded-xl border border-soft-border bg-card p-3 shadow-soft'
const SHELL_EMBEDDED = 'rounded-xl bg-gradient-to-b from-[#F4F7FB] to-[#E9EEF6] p-3.5 ring-1 ring-[#DCE3EF] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_2px_6px_rgba(23,43,77,0.045)]'
// `bare` drops the panel chrome entirely (the chart sits directly inside a host
// card — the insight "Visual Evidence" card); `embedded` keeps the soft slate
// panel; otherwise a standalone bordered card. `fill` lets the chart grow to its
// container height so the card can bottom-align with the narrative column.
const shell = (embedded: boolean, bare = false) => (bare ? '' : embedded ? SHELL_EMBEDDED : SHELL)

const COLORS = ['#27457E', '#168E8E', '#8061B8', '#3D5F9F', '#A8443B']
const GRID = '#ECEFF5'
const FOCAL = '#C99736' // gold — the insight's subject; pulls the eye to what matters
const PEER = '#9FB1C9'  // calm slate-blue — the supporting cast
// With a single-subject insight, paint the subject gold and mute the peers so the
// protagonist stands out; with no single focus, fall back to the tone-coded cycle.
const colorFor = (id: string, i: number, focal?: string) =>
  focal ? (id === focal ? FOCAL : PEER) : COLORS[i % COLORS.length] || '#27457E'
const labelFor = (id: string) => byId.get(id)?.label ?? id

// Plain-English axis labels — never show raw dataset keys to the viewer.
const METRIC_LABEL: Record<string, string> = {
  roe: 'ROE %', pGwp: 'P/GWP (x)', pb: 'P/B (x)', pe: 'P/E (x)',
  combined_ratio: 'Combined ratio %', solvency_ratio: 'Solvency (x)',
  claims_ratio: 'Claims ratio %', expense_ratio: 'Expense ratio %',
  retail: 'Retail', group: 'Group', health_retail_mix: 'Retail mix %',
}
const axisLabel = (k: string) => METRIC_LABEL[k] ?? k

// Visual-only risk shading. Which side of a HARD-LINE benchmark (a floor or a
// break-even — not a peer mean) is the "bad" side, by the metric's meaning. This
// shades a faint danger zone behind the bars; it never alters a value, axis or
// the chart's domain (the band is clipped to the existing scale).
const DANGER_SIDE: Record<string, 'above' | 'below'> = {
  combined_ratio: 'above', claims_ratio: 'above', expense_ratio: 'above',
  solvency_ratio: 'below', roe: 'below',
}
const isHardLine = (label: string) => /floor|break.?even/i.test(label)
const ZONE_FILL = 'rgba(168,68,59,0.07)' // muted terracotta — caution, never harsh red

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

function Pending({ title, embedded = false }: { title: string; embedded?: boolean }) {
  return (
    <div className={`flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-soft-border bg-ice/40 text-center ${embedded ? 'min-h-[208px]' : 'min-h-[180px]'}`}>
      <p className="text-[12px] font-semibold text-navy-deep">{title}</p>
      <p className="mt-0.5 text-[11px] text-ink-secondary">Series not available yet — data pending.</p>
    </div>
  )
}

export function InsightChart({ spec, focal, embedded = false, bare = false, fill = false }: { spec: ChartSpec; focal?: string; embedded?: boolean; bare?: boolean; fill?: boolean }) {
  const insurers = spec.insurers.filter((id) => byId.has(id))
  const thresholds = (spec.annotations ?? []).filter((a) => a.kind === 'threshold' && typeof a.value === 'number')

  // ── timeseries: one line per insurer for seriesKeys[0] ────────────────────
  if (spec.type === 'timeseries') {
    const key = spec.seriesKeys[0]
    const fys = [...new Set(insurers.flatMap((id) => series(byId.get(id)!, key).map((s) => s.fy)))].sort()
    if (!fys.length) return <Pending title={spec.title} embedded={embedded} />
    const rows = fys.map((fy) => {
      const row: Record<string, string | number | null> = { fy }
      for (const id of insurers) row[id] = series(byId.get(id)!, key).find((s) => s.fy === fy)?.v ?? null
      return row
    })
    return (
      <Wrap title={spec.title} embedded={embedded} bare={bare} fill={fill}>
        <LineChart data={rows} margin={{ top: 6, right: 10, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="fy" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={false} width={36} />
          <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [v, labelFor(n)]} />
          {thresholds.map((t, i) => <ReferenceLine key={i} y={t.value} stroke="#9C7430" strokeWidth={1.25} strokeDasharray="5 4" label={{ value: t.label, fontSize: 9, fill: '#7A5B16', position: 'insideTopRight', fontWeight: 700 }} />)}
          {insurers.map((id, i) => <Line key={id} type="monotone" dataKey={id} name={id} stroke={colorFor(id, i, focal)} strokeWidth={focal && id === focal ? 2.6 : 1.6} dot={{ r: focal && id === focal ? 3 : 2 }} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </Wrap>
    )
  }

  // ── ranking_bar: latest value per insurer for seriesKeys[0] ───────────────
  if (spec.type === 'ranking_bar') {
    const key = spec.seriesKeys[0]
    const data = insurers.map((id, i) => ({ id, label: labelFor(id), v: latest(byId.get(id)!, key), color: colorFor(id, i, focal) })).filter((d) => d.v != null).sort((a, b) => (b.v as number) - (a.v as number))
    if (!data.length) return <Pending title={spec.title} embedded={embedded} />
    // Faint danger zone on the bad side of a hard-line benchmark (visual only,
    // clipped to the existing scale — no value or domain is changed).
    const side = DANGER_SIDE[key]
    const hard = thresholds.find((t) => isHardLine(t.label))
    const dataMax = Math.max(...data.map((d) => d.v as number))
    const zone = side && hard
      ? side === 'above'
        ? { x1: hard.value as number, x2: Math.max(dataMax, hard.value as number) * 1.12, label: 'Loss zone', pos: 'insideTopRight' as const }
        : { x1: 0, x2: hard.value as number, label: 'Below floor', pos: 'insideBottomLeft' as const }
      : null
    return (
      <Wrap title={spec.title} embedded={embedded} bare={bare} fill={fill}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 30, left: 6, bottom: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} strokeDasharray="2 4" />
          <XAxis type="number" tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#26303F' }} tickLine={false} axisLine={false} width={88} />
          <Tooltip contentStyle={TT} cursor={{ fill: 'rgba(39,69,126,0.04)' }} />
          {zone && <ReferenceArea x1={zone.x1} x2={zone.x2} ifOverflow="hidden" fill={ZONE_FILL} stroke="none" label={{ value: zone.label, position: zone.pos, fontSize: 8.5, fill: '#A8443B', fontWeight: 700 }} />}
          <Bar dataKey="v" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.id} fill={d.color} />)}
          </Bar>
          {thresholds.map((t, i) => <ReferenceLine key={i} x={t.value} stroke="#9C7430" strokeWidth={1.25} strokeDasharray="5 4" label={{ value: t.label, fontSize: 9, fill: '#7A5B16', position: 'top', fontWeight: 700 }} />)}
        </BarChart>
      </Wrap>
    )
  }

  // ── scatter_dislocation: x=seriesKeys[0], y=seriesKeys[1] per insurer ──────
  if (spec.type === 'scatter_dislocation') {
    const [xk, yk] = spec.seriesKeys
    const pts = insurers.map((id, i) => ({ id, label: labelFor(id), x: latest(byId.get(id)!, xk), y: latest(byId.get(id)!, yk), color: colorFor(id, i, focal) })).filter((p) => p.x != null && p.y != null)
    if (!pts.length) return <Pending title={spec.title} embedded={embedded} />
    return (
      <Wrap title={spec.title} embedded={embedded} bare={bare} fill={fill}>
        <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 14 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
          <XAxis type="number" dataKey="x" name={axisLabel(xk)} tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: axisLabel(xk), position: 'insideBottom', offset: -8, fontSize: 10, fill: '#6B7280' }} />
          <YAxis type="number" dataKey="y" name={axisLabel(yk)} tick={{ fontSize: 10.5, fill: '#9AA3B2' }} tickLine={false} axisLine={false} width={36} label={{ value: axisLabel(yk), angle: -90, position: 'insideLeft', fontSize: 10, fill: '#6B7280' }} />
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
    if (!data.length) return <Pending title={spec.title} embedded={embedded} />
    return (
      <Wrap title={spec.title} embedded={embedded} bare={bare} fill={fill}>
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
  if (!rows.length) return <Pending title={spec.title} embedded={embedded} />
  const all = rows.flatMap((r) => [r.from.v as number, r.to.v as number])
  const lo = Math.min(...all, ...(thresholds.map((t) => t.value as number)))
  const hi = Math.max(...all, ...(thresholds.map((t) => t.value as number)))
  const pos = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100)
  // Faint danger band on the bad side of a hard-line benchmark (visual only).
  const side = DANGER_SIDE[key]
  const hardT = thresholds.find((t) => isHardLine(t.label))
  const dangerStyle: React.CSSProperties | null = hardT && side
    ? side === 'above'
      ? { left: `${pos(hardT.value as number)}%`, right: 0, background: ZONE_FILL }
      : { left: 0, width: `${pos(hardT.value as number)}%`, background: ZONE_FILL }
    : null
  return (
    <div className={`${shell(embedded, bare)} ${fill ? 'flex h-full flex-col' : ''}`}>
      <p className="mb-3 text-[11px] font-semibold text-navy-deep">{spec.title}</p>
      <div className={`space-y-3 ${fill ? 'flex flex-1 flex-col justify-center' : ''}`}>
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 truncate text-ink-secondary">{r.label}</span>
            <div className="relative h-5 flex-1">
              {dangerStyle && <span aria-hidden className="absolute inset-y-0 rounded-sm" style={dangerStyle} />}
              <span className="absolute inset-y-1/2 left-0 right-0 h-px -translate-y-1/2 bg-soft-border" />
              {thresholds.map((t, i) => <span key={i} className="absolute inset-y-0 w-[1.5px] bg-[#9C7430]/70" style={{ left: `${pos(t.value as number)}%` }} title={t.label} />)}
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

function Wrap({ title, children, embedded = false, bare = false, fill = false }: { title: string; children: React.ReactElement; embedded?: boolean; bare?: boolean; fill?: boolean }) {
  return (
    <div className={`${shell(embedded, bare)} ${fill ? 'flex h-full flex-col' : ''}`}>
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{title}</p>
      <div className={fill ? 'min-h-[180px] w-full flex-1' : ''} style={fill ? undefined : { width: '100%', height: embedded ? 212 : 200 }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  )
}
