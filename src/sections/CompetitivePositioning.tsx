import { useMemo, useState } from 'react'
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
const AMBER = '#B7791F'
const CORAL = '#C75D54'
const CORAL_DEEP = '#A8443B'
const MUTED_BLUE = '#3D5F9F'
const SLATE = '#94A3B8'

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Tone → cell fill / text. Calm tints, not loud blocks.
const TONE: Record<CellTone, { bg: string; fg: string; ring: string }> = {
  leader: { bg: hexA(TEAL, 0.14), fg: TEAL_DEEP, ring: hexA(TEAL, 0.35) },
  strong: { bg: hexA(TEAL, 0.08), fg: TEAL_DEEP, ring: hexA(TEAL, 0.22) },
  neutral: { bg: hexA(MUTED_BLUE, 0.07), fg: MUTED_BLUE, ring: hexA(MUTED_BLUE, 0.18) },
  watch: { bg: hexA(AMBER, 0.1), fg: '#8A6516', ring: hexA(AMBER, 0.28) },
  weak: { bg: hexA(CORAL, 0.1), fg: CORAL_DEEP, ring: hexA(CORAL, 0.28) },
  na: { bg: '#F4F7FC', fg: SLATE, ring: '#E8EBF1' },
}

const SIGNAL_STYLE: Record<SignalKind, { bg: string; fg: string }> = {
  Strong: { bg: hexA(TEAL, 0.12), fg: TEAL_DEEP },
  Decent: { bg: hexA(MUTED_BLUE, 0.1), fg: MUTED_BLUE },
  Watch: { bg: hexA(AMBER, 0.14), fg: '#8A6516' },
  Weak: { bg: hexA(CORAL, 0.12), fg: CORAL_DEEP },
  Premium: { bg: hexA(GOLD, 0.14), fg: '#8A6516' },
  Value: { bg: hexA(MUTED_BLUE, 0.1), fg: MUTED_BLUE },
  NA: { bg: '#F1F4F9', fg: SLATE },
}

const GROUP_ACCENT: Record<MetricGroup, string> = {
  Growth: TEAL,
  Quality: NAVY_PRIMARY,
  Capital: '#2F855A',
  Valuation: GOLD,
}

// ── Small UI atoms ──────────────────────────────────────────────────────────
function SignalBadge({ signal, size = 'sm' }: { signal: SignalKind; size?: 'sm' | 'xs' }) {
  const s = SIGNAL_STYLE[signal]
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full font-semibold',
        size === 'xs' ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[10.5px]',
      ].join(' ')}
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {signal}
    </span>
  )
}

function GoldDot() {
  return (
    <span
      title="Best in column"
      className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
      style={{ background: GOLD, boxShadow: `0 0 0 2px ${hexA(GOLD, 0.25)}` }}
    />
  )
}

// ── Summary cards ───────────────────────────────────────────────────────────
function CardIcon({ kind }: { kind: 'growth' | 'profit' | 'capital' | 'valuation' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...common}>
      {kind === 'growth' && <><path d="M3 17l6-6 4 4 7-7" /><path d="M21 8v4h-4" /></>}
      {kind === 'profit' && <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 14.5c0 1.2 1.1 2 2.5 2s2.5-.7 2.5-1.9c0-2.6-4.8-1.5-4.8-4 0-1.1 1-1.8 2.3-1.8s2.3.7 2.3 1.8" /><path d="M12 7v1.6M12 16.4V18" /></>}
      {kind === 'capital' && <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-3z" />}
      {kind === 'valuation' && <><path d="M3.5 9.5l8.5-6 8.5 6-3.2 9.8H6.7L3.5 9.5z" /><path d="M9 9.5l3 9 3-9" /></>}
    </svg>
  )
}

function SummaryCard({
  icon, label, cell, explain,
}: { icon: 'growth' | 'profit' | 'capital' | 'valuation'; label: string; cell: Cell; explain: string }) {
  const tone = cell.tone === 'na' ? SLATE : TONE[cell.tone].fg
  return (
    <div
      className="relative overflow-hidden rounded-xl2 border border-soft-border bg-card p-4 shadow-soft"
      style={{ background: `linear-gradient(150deg, ${hexA(tone, 0.06)}, #FFFFFF 60%)` }}
    >
      <span className="absolute left-0 top-0 h-full w-1" style={{ background: tone }} />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2" style={{ color: tone }}>
          <CardIcon kind={icon} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
        </div>
        <SignalBadge signal={cell.signal} />
      </div>
      <div className="mt-2 flex items-end gap-1.5">
        <span className="font-display text-[30px] leading-none text-navy-deep">{cell.rank ? `#${cell.rank}` : 'NA'}</span>
        <span className="mb-1 text-[13px] font-medium text-ink-secondary">/ {cell.count}</span>
        {cell.best && (
          <span className="mb-1 ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ background: hexA(GOLD, 0.14), color: '#8A6516' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} /> Leader
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-secondary">{explain}</p>
    </div>
  )
}

// ── Heatmap scorecard ───────────────────────────────────────────────────────
function HeatCell({ cell, active, onClick }: { cell: Cell; active: boolean; onClick: () => void }) {
  const t = TONE[cell.tone]
  const diff = fmtDiff(cell)
  const good = diffIsGood(cell)
  const diffColor = cell.tone === 'na' ? SLATE : good == null ? SLATE : good ? TEAL_DEEP : CORAL_DEEP
  const title =
    cell.value == null
      ? `${cell.metric.label}: not comparable in this peer group`
      : `${cell.metric.label} · Rank #${cell.rank}/${cell.count}${diff ? ` · ${diff} vs peer median` : ''}`
  if (cell.value == null) {
    return (
      <td className="p-1">
        <button type="button" onClick={onClick} title={title} className="flex h-full w-full flex-col items-center justify-center rounded-lg border px-2 py-2 transition-all" style={{ background: t.bg, borderColor: active ? NAVY_PRIMARY : 'transparent' }}>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#EEF1F6', color: SLATE }}>
            {cell.metric.key === 'valuation' ? 'Not listed' : 'NA'}
          </span>
        </button>
      </td>
    )
  }
  return (
    <td className="p-1">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="relative flex h-full w-full flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-center transition-all hover:brightness-[0.97]"
        style={{ background: t.bg, borderColor: active ? NAVY_PRIMARY : 'transparent', boxShadow: active ? `0 0 0 1px ${NAVY_PRIMARY}` : 'none' }}
      >
        {cell.best && <GoldDot />}
        <span className="font-display text-[14px] leading-none" style={{ color: t.fg }}>{fmtValue(cell)}</span>
        <span className="mt-1 flex items-center gap-1 text-[9.5px] font-semibold text-ink-secondary">
          #{cell.rank}
          {diff && <span style={{ color: diffColor }}>{diff}</span>}
        </span>
      </button>
    </td>
  )
}

function HeatmapScorecard({ rows, metrics, activeKey, onPick }: { rows: ScoreRow[]; metrics: MetricDef[]; activeKey: string; onPick: (k: string) => void }) {
  const groups = metrics.reduce<{ group: MetricGroup; items: MetricDef[] }[]>((acc, m) => {
    const last = acc[acc.length - 1]
    if (last && last.group === m.group) last.items.push(m)
    else acc.push({ group: m.group, items: [m] })
    return acc
  }, [])
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 bg-card pb-2 pr-3 text-left align-bottom text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Company</th>
            {groups.map((g) => (
              <th key={g.group} colSpan={g.items.length} className="px-1 pb-1 text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: hexA(GROUP_ACCENT[g.group], 0.1), color: GROUP_ACCENT[g.group] }}>
                  {g.group}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            {metrics.map((m) => (
              <th key={m.key} className="px-1 pb-2 text-center">
                <button type="button" onClick={() => onPick(m.key)} className={['text-[10.5px] font-semibold transition-colors', activeKey === m.key ? 'text-navy-deep underline decoration-2 underline-offset-4' : 'text-ink-secondary hover:text-navy-primary'].join(' ')} style={activeKey === m.key ? { textDecorationColor: GOLD } : undefined}>
                  {m.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.insurer.id} className="align-middle">
              <td className="sticky left-0 z-10 bg-card py-1 pr-3">
                <div
                  className="flex items-center gap-2 rounded-lg py-1.5 pl-2 pr-2"
                  style={r.focal ? { background: hexA(NAVY_PRIMARY, 0.06), boxShadow: `inset 0 0 0 1px ${hexA(NAVY_PRIMARY, 0.45)}` } : undefined}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.focal ? NAVY_PRIMARY : SLATE }} />
                  <span className={['whitespace-nowrap text-[12.5px]', r.focal ? 'font-bold text-navy-deep' : 'font-medium text-ink-primary'].join(' ')}>{r.insurer.shortName}</span>
                  {r.focal && <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: NAVY_PRIMARY, color: '#fff' }}>Selected</span>}
                </div>
              </td>
              {metrics.map((m) => (
                <HeatCell key={m.key} cell={r.cells[m.key]} active={activeKey === m.key} onClick={() => onPick(m.key)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Legend ──────────────────────────────────────────────────────────────────
function Legend() {
  const items: { tone: CellTone; label: string }[] = [
    { tone: 'leader', label: 'Leader' },
    { tone: 'strong', label: 'Strong' },
    { tone: 'neutral', label: 'Decent' },
    { tone: 'watch', label: 'Watch' },
    { tone: 'weak', label: 'Weak' },
    { tone: 'na', label: 'NA' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] text-ink-secondary">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px]" style={{ background: TONE[i.tone].bg, boxShadow: `inset 0 0 0 1px ${TONE[i.tone].ring}` }} />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: GOLD }} /> Gold dot = best in column</span>
      <span className="text-ink-secondary/70">pp = percentage points · x = times</span>
    </div>
  )
}

// ── Peer Signal Panel ───────────────────────────────────────────────────────
function CompareBar({ label, value, max, color, unit }: { label: string; value: number; max: number; color: string; unit: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (Math.abs(value) / max) * 100)) : 2
  const display = unit === 'x' ? `${value.toFixed(2)}x` : unit === 'pp' ? `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}pp` : `${value.toFixed(1)}%`
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-semibold tabular-nums text-navy-deep">{display}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ice">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function PeerSignalPanel({ cell, focalName, onPick, pills }: { cell: Cell; focalName: string; onPick: (k: string) => void; pills: { key: string; label: string }[] }) {
  const m = cell.metric
  const naCopy = `${m.label} is not comparable across this peer group, so there's no ranked signal to show. Pick another metric.`
  const insight =
    cell.value == null
      ? naCopy
      : m.polarity === 'rich'
        ? `${focalName} trades at ${fmtValue(cell)} — ${cell.signal === 'Premium' ? 'above' : 'below'} the peer median of ${cell.median != null ? `${cell.median.toFixed(2)}x` : 'n/a'}.`
        : `${focalName} ranks #${cell.rank} of ${cell.count} in ${m.label} at ${fmtValue(cell)}, ${diffIsGood(cell) ? 'above' : 'below'} the peer median.`
  const max = Math.max(Math.abs(cell.value ?? 0), Math.abs(cell.median ?? 0)) || 1
  return (
    <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-soft">
      {/* Navy header */}
      <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_PRIMARY})` }}>
        <p className="font-display text-[15px] leading-tight text-white">Peer Signal Panel</p>
        <p className="mt-0.5 text-[11px] text-white/70">Click a metric or a cell to see insights</p>
      </div>
      {/* Pills */}
      <div className="flex flex-wrap gap-1.5 border-b border-soft-border px-4 py-3">
        {pills.map((p) => {
          const on = p.key === m.key
          return (
            <button key={p.key} type="button" onClick={() => onPick(p.key)} className={['rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all', on ? 'text-white' : 'border-soft-border bg-ice/60 text-ink-secondary hover:text-navy-primary'].join(' ')} style={on ? { background: NAVY_PRIMARY, borderColor: NAVY_PRIMARY } : undefined}>
              {p.label}
            </button>
          )
        })}
      </div>
      {/* Content */}
      <div className="space-y-3.5 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-[14px] text-navy-deep">{m.label} Insight</p>
          <SignalBadge signal={cell.signal} />
        </div>
        <p className="text-[12px] leading-relaxed text-ink-primary">{insight}</p>
        {cell.value != null && (
          <div className="space-y-2.5 rounded-lg border border-soft-border bg-ice/40 p-3">
            <CompareBar label={focalName} value={cell.value} max={max} color={TEAL} unit={m.unit} />
            {cell.median != null && <CompareBar label="Peer median" value={cell.median} max={max} color={SLATE} unit={m.unit} />}
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Why it matters</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{m.whyItMatters}</p>
        </div>
      </div>
    </div>
  )
}

// ── Overall Investor Read ───────────────────────────────────────────────────
function OverallInvestorRead({ rows, focalName }: { rows: ScoreRow[]; focalName: string }) {
  const focal = rows.find((r) => r.focal) ?? rows[0]
  const c = focal.cells
  const chips = [
    { label: 'Growth', signal: c.growth.signal },
    { label: 'Profitability', signal: c.roe.signal },
    { label: 'Capital', signal: c.solvency.signal },
    { label: 'Valuation', signal: c.valuation.signal },
  ] as const

  // Build a dynamic buy-side read from the focal company's standings.
  const strengthMetrics = [c.growth, c.retailMix, c.marketShareChange, c.combinedRatio, c.roe, c.solvency].filter((x) => x.value != null)
  const best = [...strengthMetrics].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0]
  const worst = [...strengthMetrics].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0]
  const growthLed = c.growth.tone === 'leader' || c.growth.tone === 'strong'
  const capStrong = c.solvency.tone === 'leader' || c.solvency.tone === 'strong'
  const valPremium = c.valuation.signal === 'Premium'

  const lead =
    `${focalName} is a ${growthLed ? 'growth-led' : 'steady'} insurer` +
    (best ? ` with ${best.tone === 'leader' ? 'best-in-class' : 'strong'} ${best.metric.label.toLowerCase()}` : '') +
    (capStrong ? ' and a robust capital position' : '') + '. ' +
    (worst ? `${worst.metric.label} is the key area to monitor. ` : '') +
    (valPremium
      ? 'The premium valuation only holds if growth converts into stronger earnings quality.'
      : 'The valuation leaves room to re-rate if quality keeps improving.')

  const bottomLine =
    `${growthLed ? 'Strong growth' : 'Steady book'}${capStrong ? ' and capital position' : ''}. ` +
    `Focus on ${worst ? worst.metric.label.toLowerCase() : 'profitability'} to ${valPremium ? 'justify the premium valuation' : 'unlock a re-rating'}.`

  return (
    <div className="space-y-3">
      <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Overall Investor Read</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-primary">{lead}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {chips.map((ch) => (
            <div key={ch.label} className="flex items-center justify-between rounded-lg border border-soft-border bg-ice/40 px-2.5 py-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary">{ch.label}</span>
              <SignalBadge signal={ch.signal} size="xs" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl2 p-4 shadow-soft" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_PRIMARY})` }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Bottom line</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white">{bottomLine}</p>
      </div>
    </div>
  )
}

// ── Ranking view ────────────────────────────────────────────────────────────
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
              <span className="w-6 text-right text-[11px] font-semibold text-ink-secondary">#{cell.rank}</span>
              <span className={['w-28 shrink-0 truncate text-[12px]', r.focal ? 'font-bold text-navy-deep' : 'text-ink-primary'].join(' ')}>{r.insurer.shortName}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-ice">
                <div className="h-full rounded-md" style={{ width: `${w}%`, background: r.focal ? TEAL : cell.best ? GOLD : hexA(MUTED_BLUE, 0.55) }} />
              </div>
              <span className="w-16 text-right text-[12px] font-semibold tabular-nums text-navy-deep">{fmtValue(cell)}</span>
            </div>
          )
        })}
        {na.map((r) => (
          <div key={r.insurer.id} className="flex items-center gap-3 opacity-60">
            <span className="w-6 text-right text-[11px] font-semibold text-ink-secondary">—</span>
            <span className="w-28 shrink-0 truncate text-[12px] text-ink-primary">{r.insurer.shortName}</span>
            <div className="h-5 flex-1 rounded-md bg-ice" />
            <span className="w-16 text-right text-[11px] font-semibold text-ink-secondary">NA</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Table view ──────────────────────────────────────────────────────────────
function TableView({ rows, metrics }: { rows: ScoreRow[]; metrics: MetricDef[] }) {
  return (
    <div className="overflow-x-auto rounded-xl2 border border-soft-border bg-card shadow-soft">
      <table className="w-full min-w-[680px] text-[12px]">
        <thead>
          <tr className="border-b border-soft-border text-ink-secondary">
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">Company</th>
            {metrics.map((m) => (
              <th key={m.key} className="px-3 py-2.5 text-right text-[11px] font-semibold">{m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.insurer.id} className="border-b border-soft-border/60 last:border-0" style={r.focal ? { background: hexA(NAVY_PRIMARY, 0.04) } : undefined}>
              <td className="px-3 py-2.5">
                <span className={r.focal ? 'font-bold text-navy-deep' : 'text-ink-primary'}>{r.insurer.shortName}</span>
                {r.focal && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: NAVY_PRIMARY, color: '#fff' }}>Sel</span>}
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

// ── Trends view (illustrative, clearly mock) ────────────────────────────────
function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 96, h = 28, pad = 3
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / (values.length - 1)
    const y = h - pad - ((v - min) / span) * (h - 2 * pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pad + (w - 2 * pad)} cy={h - pad - ((values[values.length - 1] - min) / span) * (h - 2 * pad)} r={2.4} fill={color} />
    </svg>
  )
}

function TrendsView({ rows, metrics, focalName }: { rows: ScoreRow[]; metrics: MetricDef[]; focalName: string }) {
  const focal = rows.find((r) => r.focal) ?? rows[0]
  // Deterministic illustrative 5-pt path ending at the current value (mock).
  const series = (end: number) => {
    const start = end * 0.78
    return Array.from({ length: 5 }, (_, i) => start + ((end - start) * i) / 4)
  }
  return (
    <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[14px] text-navy-deep">{focalName} · metric trajectory</p>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: hexA(GOLD, 0.12), color: '#8A6516' }}>Illustrative · mock — real per-period history pending</span>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {metrics.map((m) => {
          const c = focal.cells[m.key]
          return (
            <div key={m.key} className="flex items-center justify-between gap-3 rounded-lg border border-soft-border bg-ice/30 px-3 py-2">
              <div>
                <p className="text-[11.5px] font-semibold text-navy-deep">{m.label}</p>
                <p className="text-[10.5px] text-ink-secondary">FY21 → FY25</p>
              </div>
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

// ── Header actions ──────────────────────────────────────────────────────────
function downloadCsv(rows: ScoreRow[], metrics: MetricDef[], group: string) {
  const head = ['Company', ...metrics.map((m) => `${m.label} (value)`), ...metrics.map((m) => `${m.label} (rank)`)]
  const lines = rows.map((r) => [
    r.insurer.shortName,
    ...metrics.map((m) => (r.cells[m.key].value == null ? 'NA' : String(r.cells[m.key].value))),
    ...metrics.map((m) => (r.cells[m.key].rank == null ? 'NA' : String(r.cells[m.key].rank))),
  ])
  const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
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

  const card = useMemo(
    () => getScorecard({ peerGroup: filters.peerGroup, highlightedCompany: filters.highlightedCompany }),
    [filters.peerGroup, filters.highlightedCompany],
  )
  const focal = card.focal
  const focalRow = card.rows.find((r) => r.focal) ?? card.rows[0]
  const activeCell = focalRow.cells[activeKey] ?? focalRow.cells.growth
  const rangeLabel = formatRange(filters.range, filters.period)
  const isMock = filters.dataset === 'mock'

  const explainGrowth = focalRow.cells.growth.tone === 'leader' || focalRow.cells.growth.tone === 'strong'
    ? `High GWP growth${focalRow.cells.retailMix.tone === 'leader' || focalRow.cells.retailMix.tone === 'strong' ? ' and retail-mix leadership' : ''}`
    : 'GWP growth tracking below peers'
  const explainProfit = focalRow.cells.roe.tone === 'leader' || focalRow.cells.roe.tone === 'strong' ? 'ROE above peers — earnings convert well' : 'ROE below peers, key improvement area'
  const explainCapital = focalRow.cells.solvency.best ? 'Best solvency position in peer group' : focalRow.cells.solvency.tone === 'strong' ? 'Strong solvency cushion vs peers' : 'Solvency near the peer median'
  const explainVal = focalRow.cells.valuation.value == null ? 'Not listed — no market valuation yet' : focalRow.cells.valuation.signal === 'Premium' ? 'Valuation above most peers' : 'Valuation below most peers'

  return (
    <div className="space-y-4">
      {/* 1 · Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1.5 rounded-full" style={{ background: GOLD }} />
            <h2 className="font-display text-[22px] leading-tight text-navy-deep">Peer Positioning</h2>
          </div>
          <p className="mt-1 pl-4 text-[12.5px] text-ink-secondary">
            <span className="font-semibold text-navy-deep">{focal.shortName}</span> · {card.groupLabel} peer group · Multi-metric scorecard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowHelp((v) => !v)} className="rounded-lg border border-soft-border bg-card px-3 py-1.5 text-[12px] font-semibold text-ink-secondary shadow-soft transition-colors hover:text-navy-primary">
            How to read this
          </button>
          <button type="button" onClick={() => downloadCsv(card.rows, card.metrics, card.groupLabel)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft" style={{ background: NAVY_PRIMARY }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            Download
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="rounded-xl2 border border-soft-border bg-ice/50 p-4 text-[12px] leading-relaxed text-ink-secondary">
          <p className="mb-1.5 font-semibold text-navy-deep">How to read this scorecard</p>
          Each cell shows a metric&rsquo;s <b>value</b>, the company&rsquo;s <b>rank</b> within the selected peer group, and the <b>difference vs the peer median</b>. Colour shows strength — teal is strong, amber is watch, coral is weak, grey is not comparable. A <span style={{ color: GOLD }}>gold dot</span> marks the best in each column. Click any cell (or a pill) to read what the metric means for the investment case on the right. Ranks and medians are computed only within the active peer group; companies without a metric (e.g. unlisted valuation) are shown as <b>NA</b> and excluded from that column&rsquo;s ranking.
        </div>
      )}

      {/* 2 · Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon="growth" label="Growth Rank" cell={focalRow.cells.growth} explain={explainGrowth} />
        <SummaryCard icon="profit" label="Profitability Rank" cell={focalRow.cells.roe} explain={explainProfit} />
        <SummaryCard icon="capital" label="Capital Rank" cell={focalRow.cells.solvency} explain={explainCapital} />
        <SummaryCard icon="valuation" label="Valuation Rank" cell={focalRow.cells.valuation} explain={explainVal} />
      </div>

      {/* 3 · View tabs */}
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

      {/* 4 · Main layout */}
      {tab === 'Scorecard' && (
        <div className="space-y-3">
          <Legend />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[72fr_28fr]">
            <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
              <HeatmapScorecard rows={card.rows} metrics={card.metrics} activeKey={activeKey} onPick={setActiveKey} />
            </div>
            <div className="space-y-3">
              <PeerSignalPanel cell={activeCell} focalName={focal.shortName} onPick={setActiveKey} pills={PILLS} />
              <OverallInvestorRead rows={card.rows} focalName={focal.shortName} />
            </div>
          </div>
        </div>
      )}

      {tab === 'Ranking' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {card.metrics.map((m) => {
              const on = m.key === activeKey
              return (
                <button key={m.key} type="button" onClick={() => setActiveKey(m.key)} className={['rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all', on ? 'text-white' : 'border-soft-border bg-ice/60 text-ink-secondary hover:text-navy-primary'].join(' ')} style={on ? { background: NAVY_PRIMARY, borderColor: NAVY_PRIMARY } : undefined}>{m.label}</button>
              )
            })}
          </div>
          <RankingView rows={card.rows} cellKey={activeKey} />
        </div>
      )}

      {tab === 'Trends' && <TrendsView rows={card.rows} metrics={card.metrics} focalName={focal.shortName} />}
      {tab === 'Table' && <TableView rows={card.rows} metrics={card.metrics} />}

      {/* 11 · Source row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-soft-border pt-3 text-[11px] text-ink-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold" style={isMock ? { background: hexA(GOLD, 0.12), color: '#8A6516' } : { background: hexA(TEAL, 0.12), color: TEAL_DEEP }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: isMock ? GOLD : TEAL }} />
            {isMock ? 'Mock dataset' : 'Official dataset'}
          </span>
          <span>Ranks &amp; medians computed within the {card.groupLabel} peer group</span>
        </div>
        <span>
          {rangeLabel} · {filters.period} basis{filters.period !== 'Annual' ? ' (peer metrics on latest annual basis)' : ''} · Last updated {filters.updatedAsOf}
        </span>
      </div>
    </div>
  )
}
