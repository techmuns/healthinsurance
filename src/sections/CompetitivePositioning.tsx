import { Fragment, useMemo, useState } from 'react'
import { useFilters } from '@/state/filters'
import { formatRange } from '@/lib/dateRange'
import {
  getScorecard,
  fmtValue,
  fmtDiff,
  diffIsGood,
  type Cell,
  type CellTone,
  type MetricDef,
  type MetricGroup,
  type ScoreRow,
  type SignalKind,
} from '@/lib/peerScorecard'

// ── Palette (institutional light theme — navy + teal + soft gold) ───────────
const NAVY = '#172B4D'
const NAVY_PRIMARY = '#27457E'
const TEAL = '#168E8E'
const TEAL_DEEP = '#0E6F6D'
const GOLD = '#B68B3A'
const EMERALD = '#2F855A'
const CORAL_DEEP = '#A8443B'
const MUTED_BLUE = '#3D5F9F'
const SLATE = '#94A3B8'

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Soft pastel tile fills — calm, premium, never loud blocks.
const TONE: Record<CellTone, { bg: string; fg: string }> = {
  leader: { bg: '#E2F2F0', fg: TEAL_DEEP },
  strong: { bg: '#ECF6F4', fg: TEAL_DEEP },
  neutral: { bg: '#EEF3FB', fg: MUTED_BLUE },
  watch: { bg: '#FBF2E0', fg: '#996A14' },
  weak: { bg: '#FBEDEA', fg: CORAL_DEEP },
  na: { bg: '#F5F7FA', fg: SLATE },
}
const TILE_SHADOW = '0 1px 2px rgba(23,43,77,0.06)'

const SIGNAL_STYLE: Record<SignalKind, { bg: string; fg: string }> = {
  Strong: { bg: hexA(TEAL, 0.12), fg: TEAL_DEEP },
  Decent: { bg: hexA(MUTED_BLUE, 0.1), fg: MUTED_BLUE },
  Watch: { bg: hexA(GOLD, 0.16), fg: '#8A6516' },
  Weak: { bg: hexA(CORAL_DEEP, 0.12), fg: CORAL_DEEP },
  Premium: { bg: hexA(GOLD, 0.16), fg: '#8A6516' },
  Value: { bg: hexA(MUTED_BLUE, 0.1), fg: MUTED_BLUE },
  NA: { bg: '#F1F4F9', fg: SLATE },
}

const GROUP_ACCENT: Record<MetricGroup, string> = {
  Growth: TEAL,
  Quality: NAVY_PRIMARY,
  Capital: EMERALD,
  Valuation: GOLD,
}

// ── Atoms ───────────────────────────────────────────────────────────────────
function SignalBadge({ signal, size = 'sm' }: { signal: SignalKind; size?: 'sm' | 'xs' }) {
  const s = SIGNAL_STYLE[signal]
  return (
    <span className={['inline-flex items-center gap-1 rounded-full font-semibold', size === 'xs' ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[10px]'].join(' ')} style={{ background: s.bg, color: s.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {signal}
    </span>
  )
}

function groupsOf(metrics: MetricDef[]): { group: MetricGroup; items: MetricDef[] }[] {
  return metrics.reduce<{ group: MetricGroup; items: MetricDef[] }[]>((acc, m) => {
    const last = acc[acc.length - 1]
    if (last && last.group === m.group) last.items.push(m)
    else acc.push({ group: m.group, items: [m] })
    return acc
  }, [])
}

// ── Summary cards (sleek: number · of N · signal · one line) ────────────────
function CardIcon({ kind, color }: { kind: 'growth' | 'profit' | 'capital' | 'valuation'; color: string }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...p}>
      {kind === 'growth' && <><path d="M3 17l6-6 4 4 7-7" /><path d="M21 8v4h-4" /></>}
      {kind === 'profit' && <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 14.5c0 1.2 1.1 2 2.5 2s2.5-.7 2.5-1.9c0-2.6-4.8-1.5-4.8-4 0-1.1 1-1.8 2.3-1.8s2.3.7 2.3 1.8" /><path d="M12 7v1.6M12 16.4V18" /></>}
      {kind === 'capital' && <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-3z" />}
      {kind === 'valuation' && <><path d="M3.5 9.5l8.5-6 8.5 6-3.2 9.8H6.7L3.5 9.5z" /><path d="M9 9.5l3 9 3-9" /></>}
    </svg>
  )
}

function SummaryCard({ icon, label, cell, explain }: { icon: 'growth' | 'profit' | 'capital' | 'valuation'; label: string; cell: Cell; explain: string }) {
  const accent = cell.tone === 'na' ? SLATE : TONE[cell.tone].fg
  return (
    <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-1.5">
        <CardIcon kind={icon} color={accent} />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      </div>
      <div className="mt-2.5 flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-[26px] leading-none text-navy-deep">{cell.rank ?? 'NA'}</span>
          {cell.rank != null && <span className="text-[12px] font-medium text-ink-secondary">of {cell.count}</span>}
        </div>
        <SignalBadge signal={cell.signal} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-secondary">{explain}</p>
    </div>
  )
}

// ── Heatmap ─────────────────────────────────────────────────────────────────
function HeatCell({ cell, onPick }: { cell: Cell; onPick: (k: string) => void }) {
  const t = TONE[cell.tone]
  const isNA = cell.value == null
  const diff = fmtDiff(cell)
  // Exactly one gold ring per metric column — the single best value (rank 1).
  // Everything else stays a calm, softly-bordered pastel tile, never a loud block.
  const highlight = !isNA && cell.best
  const title = isNA
    ? `${cell.metric.label}: not disclosed for this peer`
    : `${cell.metric.label} · Rank ${cell.rank} of ${cell.count}${diff ? ` · ${diff} vs peer median` : ''}`
  return (
    <td className="p-1">
      <button
        type="button"
        title={title}
        onClick={() => onPick(cell.metric.key)}
        className="relative flex min-h-[54px] w-full items-center justify-center rounded-[11px] px-2.5 py-2 text-center transition duration-200 hover:brightness-[0.985]"
        style={{
          background: t.bg,
          boxShadow: highlight
            ? `inset 0 0 0 1.4px ${hexA(GOLD, 0.8)}, 0 1px 3px ${hexA(GOLD, 0.16)}`
            : `inset 0 0 0 1px ${hexA(SLATE, 0.18)}, ${TILE_SHADOW}`,
        }}
      >
        {highlight && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ background: GOLD, boxShadow: `0 0 0 2px ${hexA(GOLD, 0.22)}` }}
            title="Best in column"
          />
        )}
        {isNA ? (
          <span className="font-display text-[16px] leading-none" style={{ color: hexA(SLATE, 0.85) }} title="Not disclosed for this peer">
            —
          </span>
        ) : (
          <span className="font-display text-[15px] leading-none" style={{ color: t.fg }}>{fmtValue(cell)}</span>
        )}
      </button>
    </td>
  )
}

function HeatmapScorecard({ rows, metrics, activeKey, onPick }: { rows: ScoreRow[]; metrics: MetricDef[]; activeKey: string; onPick: (k: string) => void }) {
  const groups = groupsOf(metrics)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[660px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          {/* Group band: bold pill + a colored underline spanning each group */}
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 bg-card pb-3 pr-3 text-left align-bottom text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary">Company</th>
            {groups.map((g, gi) => (
              <Fragment key={g.group}>
                <th colSpan={g.items.length} className="px-1.5 pb-2 text-center align-bottom">
                  <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ background: hexA(GROUP_ACCENT[g.group], 0.12), color: GROUP_ACCENT[g.group] }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: GROUP_ACCENT[g.group] }} />
                    {g.group}
                  </span>
                  <div className="mx-1 mt-2 h-[2px] rounded-full" style={{ background: hexA(GROUP_ACCENT[g.group], 0.45) }} />
                </th>
                {gi < groups.length - 1 && <th rowSpan={2} className="w-5" aria-hidden />}
              </Fragment>
            ))}
          </tr>
          <tr>
            {groups.map((g) =>
              g.items.map((m) => (
                <th key={m.key} className="px-1.5 pb-2.5 text-center">
                  <button type="button" onClick={() => onPick(m.key)} className="text-[10px] font-semibold uppercase tracking-wide transition-colors" style={{ color: activeKey === m.key ? NAVY : SLATE, borderBottom: activeKey === m.key ? `2px solid ${GOLD}` : '2px solid transparent', paddingBottom: 2 }}>
                    {m.label}
                  </button>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.insurer.id} style={r.focal ? { background: hexA(NAVY_PRIMARY, 0.035) } : undefined}>
              <td className="sticky left-0 z-10 py-1 pr-3" style={{ background: r.focal ? '#F3F6FB' : '#FFFFFF' }}>
                <div className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2" style={r.focal ? { boxShadow: `inset 0 0 0 1px ${hexA(NAVY_PRIMARY, 0.4)}` } : undefined}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.focal ? NAVY_PRIMARY : SLATE }} />
                  <span className={['whitespace-nowrap text-[12.5px]', r.focal ? 'font-bold text-navy-deep' : 'font-medium text-ink-primary'].join(' ')}>{r.insurer.shortName}</span>
                  {r.focal && <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: NAVY_PRIMARY, color: '#fff' }}>Selected</span>}
                </div>
              </td>
              {groups.map((g, gi) => (
                <Fragment key={g.group}>
                  {g.items.map((m) => (
                    <HeatCell key={m.key} cell={r.cells[m.key]} onPick={onPick} />
                  ))}
                  {gi < groups.length - 1 && <td className="w-5" aria-hidden />}
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Legend() {
  const items: { tone: CellTone; label: string }[] = [
    { tone: 'leader', label: 'Leader' },
    { tone: 'strong', label: 'Strong' },
    { tone: 'neutral', label: 'Decent' },
    { tone: 'watch', label: 'Watch' },
    { tone: 'weak', label: 'Weak' },
    { tone: 'na', label: 'n/a' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-ink-secondary">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className="h-2.5 w-3 rounded-[3px]" style={{ background: TONE[i.tone].bg, boxShadow: `inset 0 0 0 1px ${hexA(SLATE, 0.25)}` }} />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} /> best in column</span>
    </div>
  )
}

// ── Peer Signal Panel ───────────────────────────────────────────────────────
function CompareBar({ label, value, max, color, unit, strong }: { label: string; value: number; max: number; color: string; unit: string; strong?: boolean }) {
  const pct = max > 0 ? Math.max(3, Math.min(100, (Math.abs(value) / max) * 100)) : 3
  const display = unit === 'x' ? `${value.toFixed(2)}x` : unit === 'pp' ? `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}pp` : `${value.toFixed(1)}%`
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-secondary">{label}</span>
        <span className={['tabular-nums', strong ? 'font-semibold text-navy-deep' : 'text-ink-secondary'].join(' ')}>{display}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ice">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function PeerSignalPanel({ cell, focalName, onPick, pills }: { cell: Cell; focalName: string; onPick: (k: string) => void; pills: { key: string; label: string }[] }) {
  const m = cell.metric
  const insight = cell.value == null
    ? `${m.label} isn't comparable across this peer group — pick another metric.`
    : m.polarity === 'rich'
      ? `${focalName} trades at ${fmtValue(cell)}, ${cell.signal === 'Premium' ? 'above' : 'below'} the peer median.`
      : `${focalName} ranks #${cell.rank} of ${cell.count} at ${fmtValue(cell)}, ${diffIsGood(cell) ? 'above' : 'below'} the peer median.`
  const max = Math.max(Math.abs(cell.value ?? 0), Math.abs(cell.median ?? 0)) || 1
  return (
    <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-soft">
      <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_PRIMARY})` }}>
        <p className="font-display text-[14.5px] leading-tight text-white">Peer Signal Panel</p>
        <p className="mt-0.5 text-[10.5px] text-white/65">Click a metric to see insights</p>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {pills.map((p) => {
          const on = p.key === m.key
          return (
            <button key={p.key} type="button" onClick={() => onPick(p.key)} className={['rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all', on ? 'border-transparent text-white' : 'border-soft-border bg-ice/50 text-ink-secondary hover:text-navy-primary'].join(' ')} style={on ? { background: NAVY_PRIMARY } : undefined}>
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="space-y-3 px-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-[13.5px] text-navy-deep">{m.label}</p>
          <SignalBadge signal={cell.signal} />
        </div>
        <p className="text-[12px] leading-relaxed text-ink-primary">{insight}</p>
        {cell.value != null && (
          <div className="space-y-2 rounded-lg bg-ice/50 p-3">
            <CompareBar label={focalName} value={cell.value} max={max} color={TEAL} unit={m.unit} strong />
            {cell.median != null && <CompareBar label="Peer median" value={cell.median} max={max} color={SLATE} unit={m.unit} />}
          </div>
        )}
        <p className="text-[11.5px] leading-relaxed text-ink-secondary"><span className="font-semibold text-ink-primary">Why it matters · </span>{m.whyItMatters}</p>
      </div>
    </div>
  )
}

// ── Ranking / Table / Trends (secondary views) ──────────────────────────────
function RankingView({ rows, cellKey }: { rows: ScoreRow[]; cellKey: string }) {
  const ranked = [...rows].filter((r) => r.cells[cellKey].value != null).sort((a, b) => (a.cells[cellKey].rank ?? 99) - (b.cells[cellKey].rank ?? 99))
  const na = rows.filter((r) => r.cells[cellKey].value == null)
  const max = Math.max(...ranked.map((r) => Math.abs(r.cells[cellKey].value as number)), 1)
  const label = rows[0]?.cells[cellKey].metric.label ?? ''
  return (
    <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
      <p className="mb-3 font-display text-[14px] text-navy-deep">Peer leaderboard · {label}</p>
      <div className="space-y-2">
        {ranked.map((r) => {
          const cell = r.cells[cellKey]
          const w = Math.max(4, (Math.abs(cell.value as number) / max) * 100)
          return (
            <div key={r.insurer.id} className="flex items-center gap-3">
              <span className="w-5 text-right text-[11px] font-semibold text-ink-secondary">{cell.rank}</span>
              <span className={['w-28 shrink-0 truncate text-[12px]', r.focal ? 'font-bold text-navy-deep' : 'text-ink-primary'].join(' ')}>{r.insurer.shortName}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded-md bg-ice">
                <div className="h-full rounded-md" style={{ width: `${w}%`, background: r.focal ? TEAL : cell.best ? GOLD : hexA(MUTED_BLUE, 0.5) }} />
              </div>
              <span className="w-16 text-right text-[12px] font-semibold tabular-nums text-navy-deep">{fmtValue(cell)}</span>
            </div>
          )
        })}
        {na.map((r) => (
          <div key={r.insurer.id} className="flex items-center gap-3 opacity-55">
            <span className="w-5 text-right text-[11px] text-ink-secondary">—</span>
            <span className="w-28 shrink-0 truncate text-[12px] text-ink-primary">{r.insurer.shortName}</span>
            <div className="h-4 flex-1 rounded-md bg-ice" />
            <span className="w-16 text-right text-[11px] text-ink-secondary">NA</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableView({ rows, metrics }: { rows: ScoreRow[]; metrics: MetricDef[] }) {
  return (
    <div className="overflow-x-auto rounded-xl2 border border-soft-border bg-card shadow-soft">
      <table className="w-full min-w-[660px] text-[12px]">
        <thead>
          <tr className="border-b border-soft-border text-ink-secondary">
            <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide">Company</th>
            {metrics.map((m) => <th key={m.key} className="px-3 py-2.5 text-right text-[10.5px] font-semibold">{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.insurer.id} className="border-b border-soft-border/60 last:border-0" style={r.focal ? { background: hexA(NAVY_PRIMARY, 0.04) } : undefined}>
              <td className="px-3 py-2.5">
                <span className={r.focal ? 'font-bold text-navy-deep' : 'text-ink-primary'}>{r.insurer.shortName}</span>
              </td>
              {metrics.map((m) => {
                const c = r.cells[m.key]
                return (
                  <td key={m.key} className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-semibold" style={{ color: c.value == null ? SLATE : TONE[c.tone].fg }}>{fmtValue(c)}</span>
                    {c.rank != null && <span className="ml-1 text-[10px] text-ink-secondary">#{c.rank}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 92, h = 26, pad = 3
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(pad + (i * (w - 2 * pad)) / (values.length - 1)).toFixed(1)},${(h - pad - ((v - min) / span) * (h - 2 * pad)).toFixed(1)}`)
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pad + (w - 2 * pad)} cy={h - pad - ((values[values.length - 1] - min) / span) * (h - 2 * pad)} r={2.3} fill={color} />
    </svg>
  )
}

function TrendsView({ rows, metrics, focalName }: { rows: ScoreRow[]; metrics: MetricDef[]; focalName: string }) {
  const focal = rows.find((r) => r.focal) ?? rows[0]
  const series = (end: number) => Array.from({ length: 5 }, (_, i) => end * 0.78 + ((end - end * 0.78) * i) / 4)
  return (
    <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[14px] text-navy-deep">{focalName} · metric trajectory</p>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: hexA(GOLD, 0.12), color: '#8A6516' }}>Illustrative · mock</span>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {metrics.map((m) => {
          const c = focal.cells[m.key]
          return (
            <div key={m.key} className="flex items-center justify-between gap-3 rounded-lg bg-ice/40 px-3 py-2">
              <p className="text-[11.5px] font-semibold text-navy-deep">{m.label}</p>
              <div className="flex items-center gap-2">
                {c.value != null ? <Spark values={series(c.value)} color={c.tone === 'na' ? SLATE : TONE[c.tone].fg} /> : <span className="text-[11px] text-ink-secondary">NA</span>}
                <span className="w-14 text-right text-[12px] font-semibold tabular-nums text-navy-deep">{fmtValue(c)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function downloadCsv(rows: ScoreRow[], metrics: MetricDef[], group: string) {
  const head = ['Company', ...metrics.map((m) => `${m.label} (value)`), ...metrics.map((m) => `${m.label} (rank)`)]
  const lines = rows.map((r) => [r.insurer.shortName, ...metrics.map((m) => (r.cells[m.key].value == null ? 'NA' : String(r.cells[m.key].value))), ...metrics.map((m) => (r.cells[m.key].rank == null ? 'NA' : String(r.cells[m.key].rank)))])
  const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `peer-positioning-${group}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Page ────────────────────────────────────────────────────────────────────
type Tab = 'Scorecard' | 'Ranking' | 'Trends' | 'Table'
const TABS: Tab[] = ['Scorecard', 'Ranking', 'Trends', 'Table']
const PILLS = [
  { key: 'growth', label: 'GWP Growth' },
  { key: 'roe', label: 'ROE' },
  { key: 'solvency', label: 'Solvency' },
  { key: 'valuation', label: 'Valuation' },
]

export function CompetitivePositioning() {
  const filters = useFilters()
  const [tab, setTab] = useState<Tab>('Scorecard')
  const [activeKey, setActiveKey] = useState('growth')
  const [showHelp, setShowHelp] = useState(false)

  const card = useMemo(() => getScorecard({ peerGroup: filters.peerGroup, highlightedCompany: filters.highlightedCompany }), [filters.peerGroup, filters.highlightedCompany])
  const focal = card.focal
  const focalRow = card.rows.find((r) => r.focal) ?? card.rows[0]
  const activeCell = focalRow.cells[activeKey] ?? focalRow.cells.growth
  // Competitive Position has no frequency toggle — the scorecard is a latest-
  // figures snapshot — so the range reads in stable Annual (FY) vocabulary and
  // never flips with the global period control.
  const rangeLabel = formatRange(filters.range, 'Annual')
  const isMock = filters.dataset === 'mock'

  const explainGrowth = focalRow.cells.growth.tone === 'leader' || focalRow.cells.growth.tone === 'strong'
    ? `Strong GWP growth${focalRow.cells.retailMix.tone === 'leader' || focalRow.cells.retailMix.tone === 'strong' ? ' + retail-mix lead' : ''}`
    : 'GWP growth below peers'
  const explainProfit = focalRow.cells.roe.tone === 'leader' || focalRow.cells.roe.tone === 'strong' ? 'ROE ahead of peers' : 'ROE below peers — key gap'
  const explainCapital = focalRow.cells.solvency.best ? 'Best solvency in the group' : focalRow.cells.solvency.tone === 'strong' ? 'Strong solvency cushion' : 'Solvency near peer median'
  const explainVal = focalRow.cells.valuation.value == null ? 'Not listed — no market price' : focalRow.cells.valuation.signal === 'Premium' ? 'Priced above peers' : 'Priced below peers'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1.5 rounded-full" style={{ background: GOLD }} />
            <h2 className="font-display text-[22px] leading-tight text-navy-deep">Peer Positioning</h2>
          </div>
          <p className="mt-1 pl-4 text-[12px] text-ink-secondary">
            <span className="font-semibold text-navy-deep">{focal.shortName}</span> · {card.groupLabel} peer group · Multi-metric scorecard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowHelp((v) => !v)} className="rounded-lg border border-soft-border bg-card px-3 py-1.5 text-[12px] font-semibold text-ink-secondary shadow-soft transition-colors hover:text-navy-primary">How to read this</button>
          <button type="button" onClick={() => downloadCsv(card.rows, card.metrics, card.groupLabel)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft" style={{ background: NAVY_PRIMARY }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            Download
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="rounded-xl2 border border-soft-border bg-ice/50 p-4 text-[12px] leading-relaxed text-ink-secondary">
          Each tile shows a metric&rsquo;s <b>value</b>, the company&rsquo;s <b>rank</b> in the peer group, and the <b>gap vs the peer median</b>. Teal = strong, amber = watch, coral = weak, grey = not comparable; a <span style={{ color: GOLD }}>gold dot</span> marks the best in a column. Click a tile or a pill to read its investment meaning on the right. Ranks and medians are computed only within the active peer group; unlisted valuation shows <b>NA</b> and is excluded from that ranking.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard icon="growth" label="Growth" cell={focalRow.cells.growth} explain={explainGrowth} />
        <SummaryCard icon="profit" label="Profitability" cell={focalRow.cells.roe} explain={explainProfit} />
        <SummaryCard icon="capital" label="Capital" cell={focalRow.cells.solvency} explain={explainCapital} />
        <SummaryCard icon="valuation" label="Valuation" cell={focalRow.cells.valuation} explain={explainVal} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-soft-border">
        {TABS.map((t) => {
          const on = t === tab
          return (
            <button key={t} type="button" onClick={() => setTab(t)} className={['relative px-3.5 py-2 text-[13px] font-semibold transition-colors', on ? 'text-navy-deep' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}>
              {t}
              {on && <span className="absolute inset-x-2.5 -bottom-px h-[2.5px] rounded-full" style={{ background: GOLD }} />}
            </button>
          )
        })}
      </div>

      {/* Views */}
      {tab === 'Scorecard' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[72fr_28fr]">
          <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
            <HeatmapScorecard rows={card.rows} metrics={card.metrics} activeKey={activeKey} onPick={setActiveKey} />
            <div className="mt-3 border-t border-soft-border pt-2.5">
              <Legend />
            </div>
          </div>
          <div className="space-y-3">
            <PeerSignalPanel cell={activeCell} focalName={focal.shortName} onPick={setActiveKey} pills={PILLS} />
          </div>
        </div>
      )}

      {tab === 'Ranking' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {card.metrics.map((m) => {
              const on = m.key === activeKey
              return <button key={m.key} type="button" onClick={() => setActiveKey(m.key)} className={['rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all', on ? 'border-transparent text-white' : 'border-soft-border bg-ice/50 text-ink-secondary hover:text-navy-primary'].join(' ')} style={on ? { background: NAVY_PRIMARY } : undefined}>{m.label}</button>
            })}
          </div>
          <RankingView rows={card.rows} cellKey={activeKey} />
        </div>
      )}

      {tab === 'Trends' && <TrendsView rows={card.rows} metrics={card.metrics} focalName={focal.shortName} />}
      {tab === 'Table' && <TableView rows={card.rows} metrics={card.metrics} />}

      {/* Source row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-soft-border pt-3 text-[10.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold" style={isMock ? { background: hexA(GOLD, 0.12), color: '#8A6516' } : { background: hexA(TEAL, 0.12), color: TEAL_DEEP }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: isMock ? GOLD : TEAL }} />
          {isMock ? 'Mock dataset' : 'Official dataset'}
        </span>
        <span>{rangeLabel} · scorecard basis · {card.groupLabel} peers · Updated {filters.updatedAsOf}</span>
      </div>
    </div>
  )
}
