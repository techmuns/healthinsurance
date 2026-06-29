import { Fragment, useEffect, useMemo, useState } from 'react'
import { useFilters } from '@/state/filters'
import { getLatestAnnualFyLabel } from '@/lib/dataLayer'
import { AnalysisBuilder } from '@/components/AnalysisBuilder'
import { SectionTabs } from '@/components/SectionTabs'
import { SourceTag } from '@/components/SourceTag'
import { AccountingBasisToggle } from '@/components/AccountingBasisControls'
import { BASIS_TRACKED_COMPANIES, type AccountingBasis } from '@/data/accountingBasis'
import { getFilteredInsurers, getHighlightedInsurer } from '@/lib/insurers'
import {
  getScorecard,
  resolveCellSource,
  fmtValue,
  fmtDiff,
  diffIsGood,
  type Cell,
  type CellSource,
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

// Blend two hex colours (t=0 → a, t=1 → b). Used to give the legend key chips a
// touch more saturation than the ultra-pale grid tiles so the key reads crisply
// without making the calm grid itself any louder.
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => {
    const av = (pa >> shift) & 255
    const bv = (pb >> shift) & 255
    return Math.round(av + (bv - av) * t)
  }
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`
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

// Compact sub-score chip — the four metric standings, relocated from the old
// big top cards into the hero scorecard header (item: "show sub-scores inside
// the hero"). White-on-gradient, premium, space-efficient.
function SubScore({ icon, label, cell, theme }: { icon: 'growth' | 'profit' | 'capital' | 'valuation'; label: string; cell: Cell; theme: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 ring-1 ring-white/15 backdrop-blur-sm">
      <span className="blob-d grid h-7 w-7 shrink-0 place-items-center" style={{ background: hexA(theme, 0.55) }}>
        <CardIcon kind={icon} color="#FFFFFF" />
      </span>
      <div className="leading-tight">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.07em] text-white/55">{label}</span>
        <span className="flex items-baseline gap-1">
          <span className="font-display text-[15px] leading-none text-white">{cell.rank ?? 'NA'}</span>
          {cell.rank != null && <span className="text-[10px] text-white/55">/ {cell.count}</span>}
        </span>
      </div>
    </div>
  )
}

// ── Heatmap ─────────────────────────────────────────────────────────────────
function HeatCell({ cell, companyId, selected, onPickCell }: { cell: Cell; companyId: string; selected: boolean; onPickCell: (companyId: string, k: string) => void }) {
  const t = TONE[cell.tone]
  const isNA = cell.value == null
  const diff = fmtDiff(cell)
  // Exactly one gold ring per metric column — the single best value (rank 1).
  // Everything else stays a calm, softly-bordered pastel tile, never a loud block.
  const highlight = !isNA && cell.best
  const title = isNA
    ? `${cell.metric.label}: not disclosed for this peer — click to see the source`
    : `${cell.metric.label} · Rank ${cell.rank} of ${cell.count}${diff ? ` · ${diff} vs peer median` : ''} · click for the source`
  // Ring priority: a navy selection ring (the cell driving the side panel) wins;
  // otherwise the single gold best-in-column ring; otherwise a calm soft border.
  const innerRing = highlight ? `inset 0 0 0 1.4px ${hexA(GOLD, 0.8)}` : `inset 0 0 0 1px ${hexA(SLATE, 0.18)}`
  const outerRing = selected
    ? `0 0 0 2px ${hexA(NAVY_PRIMARY, 0.6)}, 0 2px 7px ${hexA(NAVY_PRIMARY, 0.2)}`
    : highlight
      ? `0 1px 3px ${hexA(GOLD, 0.16)}`
      : TILE_SHADOW
  return (
    <td className="p-1">
      <button
        type="button"
        title={title}
        onClick={() => onPickCell(companyId, cell.metric.key)}
        className="relative flex min-h-[54px] w-full items-center justify-center rounded-[11px] px-2.5 py-2 text-center transition duration-200 hover:brightness-[0.985]"
        style={{
          background: t.bg,
          boxShadow: `${innerRing}, ${outerRing}`,
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

function HeatmapScorecard({ rows, metrics, activeKey, selectedCompany, onPick, onPickCell, onPickCompany }: { rows: ScoreRow[]; metrics: MetricDef[]; activeKey: string; selectedCompany: string; onPick: (k: string) => void; onPickCell: (companyId: string, k: string) => void; onPickCompany: (id: string) => void }) {
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
                <button
                  type="button"
                  onClick={() => onPickCompany(r.insurer.id)}
                  title={r.focal ? `${r.insurer.shortName} — selected` : `View ${r.insurer.shortName}`}
                  className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 text-left transition-colors hover:bg-ice/70"
                  style={r.focal ? { boxShadow: `inset 0 0 0 1px ${hexA(NAVY_PRIMARY, 0.4)}` } : undefined}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.focal ? NAVY_PRIMARY : SLATE }} />
                  <span className={['whitespace-nowrap text-[12.5px]', r.focal ? 'font-bold text-navy-deep' : 'font-medium text-ink-primary group-hover:text-navy-primary'].join(' ')}>{r.insurer.shortName}</span>
                  {r.focal && <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: NAVY_PRIMARY, color: '#fff' }}>Selected</span>}
                </button>
              </td>
              {groups.map((g, gi) => (
                <Fragment key={g.group}>
                  {g.items.map((m) => (
                    <HeatCell
                      key={m.key}
                      cell={r.cells[m.key]}
                      companyId={r.insurer.id}
                      selected={r.insurer.id === selectedCompany && m.key === activeKey}
                      onPickCell={onPickCell}
                    />
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-medium text-ink-secondary">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-4 rounded-[4px]"
            style={{
              background: mix(TONE[i.tone].bg, TONE[i.tone].fg, 0.26),
              boxShadow: `inset 0 0 0 1.25px ${hexA(TONE[i.tone].fg, 0.62)}, 0 1px 1.5px rgba(23,43,77,0.08)`,
            }}
          />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: GOLD, boxShadow: `0 0 0 2px ${hexA(GOLD, 0.18)}` }} /> best in column
      </span>
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

function PeerSignalPanel({ cell, focalName, selectedName, source, onPick, pills, whyBullets, questions }: { cell: Cell; focalName: string; selectedName: string; source: CellSource | null; onPick: (k: string) => void; pills: { key: string; label: string }[]; whyBullets: string[]; questions: string[] }) {
  const m = cell.metric
  const insight = cell.value == null
    ? `${m.label} isn't disclosed for ${selectedName} — see the source for what is on record.`
    : m.polarity === 'rich'
      ? `${selectedName} trades at ${fmtValue(cell)}, ${cell.signal === 'Premium' ? 'above' : 'below'} the peer median.`
      : `${selectedName} ranks #${cell.rank} of ${cell.count} at ${fmtValue(cell)}, ${diffIsGood(cell) ? 'above' : 'below'} the peer median.`
  const max = Math.max(Math.abs(cell.value ?? 0), Math.abs(cell.median ?? 0)) || 1
  return (
    <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-soft">
      <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_PRIMARY})` }}>
        <p className="font-display text-[14.5px] leading-tight text-white">Why this score?</p>
        <p className="mt-0.5 text-[10.5px] text-white/65">Buy-side read · {focalName}</p>
      </div>

      {/* Why this score — 3 factual bullets (from the focal company's standing). */}
      <ul className="space-y-1.5 px-4 pt-3">
        {whyBullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-ink-primary">
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: GOLD }} />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* Key questions this answers. */}
      <div className="mt-3 px-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-ink-secondary">Key questions this answers</p>
        <ul className="mt-1.5 space-y-1">
          {questions.map((q, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-ink-secondary">
              <span className="font-semibold text-navy-primary">{i + 1}.</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Interactive metric compare — leaner; dynamically shows the gap to peers. */}
      <div className="mt-3 space-y-2.5 border-t border-soft-border px-4 pb-4 pt-3">
        <div className="flex flex-wrap gap-1.5">
          {pills.map((p) => {
            const on = p.key === m.key
            return (
              <button key={p.key} type="button" onClick={() => onPick(p.key)} className={['rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-all', on ? 'border-transparent text-white' : 'border-soft-border bg-ice/50 text-ink-secondary hover:text-navy-primary'].join(' ')} style={on ? { background: NAVY_PRIMARY } : undefined}>
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-[12.5px] text-navy-deep">
            <span className="font-semibold">{selectedName}</span>
            <span className="text-ink-secondary"> · {m.label}</span>
          </p>
          <SignalBadge signal={cell.signal} />
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-primary">{insight}</p>
        {cell.value != null && (
          <div className="space-y-2 rounded-lg bg-ice/50 p-3">
            <CompareBar label={selectedName} value={cell.value} max={max} color={TEAL} unit={m.unit} strong />
            {cell.median != null && <CompareBar label="Peer median" value={cell.median} max={max} color={SLATE} unit={m.unit} />}
          </div>
        )}

        {/* Per-cell source — the document this exact figure came from, one click away. */}
        <div className="flex items-center justify-between gap-2 border-t border-soft-border pt-2.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.09em] text-ink-secondary">Source</span>
          {source ? (
            <SourceTag
              source={source.label}
              period={source.period}
              confidence={source.confidence}
              provenance={source.provenance}
              align="right"
            />
          ) : (
            <span className="text-[10.5px] italic text-ink-secondary">Not on record</span>
          )}
        </div>
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

// ── Page ────────────────────────────────────────────────────────────────────
type Tab = 'Scorecard' | 'Table' | 'Analysis Builder'
const TABS: Tab[] = ['Scorecard', 'Table', 'Analysis Builder']
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
  // Accounting lens for the profit-basis column (Combined Ratio). Default
  // IGAAP/Statutory keeps the reported view unchanged; IFRS re-points Combined
  // Ratio to the dual-basis SAHIs' IFRS accounts (others → honest NA).
  const [basis, setBasis] = useState<AccountingBasis>('igaap')
  // The cell currently driving the side panel. `null` company = follow the focal
  // company; clicking any cell pins that company so its source shows on the right.
  const [activeCompany, setActiveCompany] = useState<string | null>(null)

  const card = useMemo(() => getScorecard({ peerGroup: filters.peerGroup, highlightedCompany: filters.highlightedCompany }, basis), [filters.peerGroup, filters.highlightedCompany, basis])
  const focal = card.focal
  const focalRow = card.rows.find((r) => r.focal) ?? card.rows[0]
  // When the focal company changes (peer/company filter), let the panel snap back
  // to following the focal company rather than staying pinned to a stale cell.
  useEffect(() => { setActiveCompany(null) }, [focal.id])
  // Resolve the selected cell from the pinned company (or the focal company).
  const selectedRow = (activeCompany && card.rows.find((r) => r.insurer.id === activeCompany)) || focalRow
  const activeCell = selectedRow.cells[activeKey] ?? selectedRow.cells.growth
  const cellSource = resolveCellSource(selectedRow.insurer.id, activeCell.metric.key, basis)
  const pickCell = (companyId: string, key: string) => { setActiveCompany(companyId); setActiveKey(key) }
  // Competitive Position has no frequency toggle — the scorecard shows each
  // metric's LATEST real value, which can span fiscal years (e.g. provisional
  // FY26 GWP growth alongside the latest audited FY25 profitability and live
  // market multiples). Each cell's exact period is on its source tag, so the
  // footer states the span honestly rather than claiming one single year.
  const rangeLabel = `latest available per metric · FY26 GWP growth (provisional) · ${getLatestAnnualFyLabel()} profitability · live multiples`

  const explainGrowth = focalRow.cells.growth.tone === 'leader' || focalRow.cells.growth.tone === 'strong'
    ? `Strong GWP growth${focalRow.cells.retailMix.tone === 'leader' || focalRow.cells.retailMix.tone === 'strong' ? ' + retail-mix lead' : ''}`
    : 'GWP growth below peers'
  const explainProfit = focalRow.cells.roe.tone === 'leader' || focalRow.cells.roe.tone === 'strong' ? 'ROE ahead of peers' : 'ROE below peers — key gap'
  const explainCapital = focalRow.cells.solvency.best ? 'Best solvency in the group' : focalRow.cells.solvency.tone === 'strong' ? 'Strong solvency cushion' : 'Solvency near peer median'
  const explainVal = focalRow.cells.valuation.value == null ? 'Not listed — no market price' : focalRow.cells.valuation.signal === 'Premium' ? 'Priced above peers' : 'Priced below peers'

  // Display-only summary of the already-computed tones (no new calculation):
  // how many metrics the focal company is leading/strong in — the hero anchor.
  const STRONG_TONES = new Set<CellTone>(['leader', 'strong'])
  // "Strong+" is only meaningful where strength is the test — valuation multiples
  // are richness, not strength — so the hero ratio counts the growth/quality/
  // capital metrics and leaves the rich (P/E · P/B · P/GWP) columns out, keeping
  // the headline stable as valuation columns are added.
  const scoredMetrics = card.metrics.filter((m) => m.polarity !== 'rich')
  const strongCount = scoredMetrics.filter((m) => STRONG_TONES.has(focalRow.cells[m.key]?.tone)).length
  const strongOf = scoredMetrics.length
  const totalMetrics = card.metrics.length
  const whyBullets = [explainGrowth, explainProfit, explainCapital, explainVal]
  const keyQuestions = [
    `Is ${focal.shortName} growing faster than the ${card.groupLabel} peer group?`,
    'Do profitability and capital justify where it is priced?',
    'Where does it lead — and where is the gap to close?',
  ]

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
        {/* Accounting lens — re-points the Combined Ratio column between
            IGAAP/Statutory (reported) and IFRS for the SAHIs that file IFRS.
            Only on the scorecard/table views (the Analysis Builder runs its own
            metric set). */}
        {tab !== 'Analysis Builder' && <AccountingBasisToggle value={basis} onChange={setBasis} />}
      </div>

      {basis === 'ifrs' && tab !== 'Analysis Builder' && (
        <p className="flex items-start gap-1.5 rounded-lg border border-[#CDE7E4] bg-[#F1FAF8] px-3 py-2 text-[11px] leading-snug text-[#0E6F6D]">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#168E8E]" />
          <span>
            <strong className="font-semibold">IFRS lens.</strong> Only the <strong className="font-semibold">Combined Ratio</strong> moves to IFRS, and only for {BASIS_TRACKED_COMPANIES.join(', ')} — the SAHIs that publish IFRS accounts; insurers without an IFRS filing show <em>NA</em> rather than a cross-basis number. ROE has no published IFRS equity, so it stays on the statutory basis. Premium, share, solvency and valuation columns are basis-neutral.
          </span>
        </p>
      )}

      {/* Tabs — pill switcher matching the in-page section toggle */}
      <SectionTabs tabs={TABS.map((t) => ({ id: t, label: t }))} active={tab} onSelect={(id) => setTab(id as Tab)} />

      {/* Views */}
      {tab === 'Scorecard' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[72fr_28fr]">
          {/* HERO scorecard — a soft navy→teal gradient header carrying the focal
              company's overall standing and the four sub-scores (the former top
              metric cards, relocated + compacted here), over the peer heatmap. */}
          <div className="overflow-hidden rounded-2xl border border-soft-border shadow-[0_2px_8px_rgba(23,43,77,0.06),0_22px_46px_rgba(23,43,77,0.10)]">
            <div className="relative overflow-hidden px-5 pb-4 pt-4" style={{ background: `linear-gradient(120deg, ${NAVY} 0%, ${NAVY_PRIMARY} 56%, ${TEAL_DEEP} 132%)` }}>
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full opacity-25 blur-3xl" style={{ background: hexA(GOLD, 0.5) }} />
              <div className="relative flex items-end justify-between gap-4">
                <div>
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55">Peer Scorecard</p>
                  <p className="font-display text-[21px] leading-tight text-white">{focal.shortName}</p>
                  <p className="text-[11px] text-white/65">{card.groupLabel} peers · {totalMetrics} metrics</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-display text-[34px] leading-none text-white">
                    {strongCount}
                    <span className="text-[15px] text-white/55">/{strongOf}</span>
                  </span>
                  <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/55">metrics strong+</p>
                </div>
              </div>
              <div className="relative mt-3.5 flex flex-wrap gap-2">
                <SubScore icon="growth" label="Growth" cell={focalRow.cells.growth} theme={TEAL} />
                <SubScore icon="profit" label="Profitability" cell={focalRow.cells.roe} theme="#6E8FD6" />
                <SubScore icon="capital" label="Capital" cell={focalRow.cells.solvency} theme="#3FAE9A" />
                <SubScore icon="valuation" label="Valuation" cell={focalRow.cells.valuation} theme={GOLD} />
              </div>
            </div>
            <div className="bg-card p-4">
              <HeatmapScorecard rows={card.rows} metrics={card.metrics} activeKey={activeKey} selectedCompany={selectedRow.insurer.id} onPick={setActiveKey} onPickCell={pickCell} onPickCompany={filters.setHighlightedCompany} />
              <div className="mt-3 border-t border-soft-border pt-2.5">
                <Legend />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <PeerSignalPanel cell={activeCell} focalName={focal.shortName} selectedName={selectedRow.insurer.shortName} source={cellSource} onPick={setActiveKey} pills={PILLS} whyBullets={whyBullets} questions={keyQuestions} />
          </div>
        </div>
      )}

      {tab === 'Table' && <TableView rows={card.rows} metrics={card.metrics} />}

      {tab === 'Analysis Builder' && (
        <AnalysisBuilder
          rows={getFilteredInsurers({ peerGroup: filters.peerGroup, highlightedCompany: filters.highlightedCompany })}
          focalId={getHighlightedInsurer({ peerGroup: filters.peerGroup, highlightedCompany: filters.highlightedCompany }).id}
        />
      )}

      {/* Source row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-soft-border pt-3 text-[10.5px] text-ink-secondary">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold"
          style={{ background: hexA(TEAL, 0.12), color: TEAL_DEEP }}
          title="Official filings (IRDAI disclosures &amp; annual reports) plus the daily market feed for P/E &amp; P/B; growth and signal fields are derived from those figures. No mock data."
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: TEAL }} />
          Source-backed
        </span>
        <span>{rangeLabel} · scorecard basis · {card.groupLabel} peers · Updated {filters.updatedAsOf}</span>
      </div>
    </div>
  )
}
