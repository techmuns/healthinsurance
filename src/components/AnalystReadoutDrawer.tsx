import { useMemo, useState } from 'react'
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Database,
  Crown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { formatGridValue, type GridCell } from '@/lib/auditGrid'
import { computeReadout, scopeLabel } from '@/lib/analystReadout'
import type { MetricStat, TrendStat, Tier1Readout } from '@/insights/analystTypes'

// ---------------------------------------------------------------------------
//  AnalystReadoutDrawer — the right-side analyst panel.
//
//  Tier 1 (this file): the instant, deterministic readout — peer ranking,
//  outliers, multi-period deltas (only where real), source quality and honest
//  gaps. Computed in the browser, no API key, free and unlimited.
//
//  The panel is intentionally NON-modal (no click-capturing backdrop) so the
//  reader can keep inspecting the table while the readout stays open
//  (build brief §9). Tier 2 (the AI Senior-Analyst card) slots in below the
//  readout — wired in the next phase.
// ---------------------------------------------------------------------------

function tone(kind: 'good' | 'bad' | 'warn' | 'neutral') {
  switch (kind) {
    case 'good':
      return { text: 'text-teal', bg: 'bg-teal-soft', ring: 'ring-[#BFE3E1]', bar: 'bg-teal' }
    case 'bad':
      return { text: 'text-coral', bg: 'bg-coral-soft', ring: 'ring-[#F0D2CC]', bar: 'bg-coral' }
    case 'warn':
      return { text: 'text-champagne-deep', bg: 'bg-champagne-soft', ring: 'ring-[#EAD9B6]', bar: 'bg-champagne' }
    default:
      return { text: 'text-navy-primary', bg: 'bg-soft-blue', ring: 'ring-[#D6E2FA]', bar: 'bg-muted-blue' }
  }
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 mt-4 flex items-baseline gap-2">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy-deep">{children}</h4>
      {hint && <span className="text-[10px] text-ink-secondary">{hint}</span>}
    </div>
  )
}

function CoverageStrip({ readout }: { readout: Tier1Readout }) {
  const { coverage } = readout
  const pct = coverage.total ? Math.round((coverage.ready / coverage.total) * 100) : 0
  const t = pct >= 80 ? tone('good') : pct >= 50 ? tone('warn') : tone('bad')
  return (
    <div className="rounded-xl border border-soft-border bg-surface-tint p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-navy-deep">
          {coverage.total} selected · <span className="text-teal">{coverage.ready} ready</span>
          {coverage.gaps > 0 && <span className="text-coral"> · {coverage.gaps} gap{coverage.gaps > 1 ? 's' : ''}</span>}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.bg} ${t.text} ring-1 ${t.ring}`}>{pct}% coverage</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ice">
        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function RankBar({ stat }: { stat: MetricStat }) {
  const vals = stat.ranks.map((r) => Math.abs(r.value))
  const maxAbs = Math.max(...vals, 1)
  // best rank = 1; worst = stat.count
  return (
    <div className="space-y-1">
      {[...stat.ranks]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => {
          const isBest = r.rank === 1
          const isWorst = r.rank === stat.count && stat.count > 1
          const t = r.isOutlier ? tone('warn') : isBest ? tone('good') : isWorst ? tone('bad') : tone('neutral')
          const w = Math.max(6, Math.round((Math.abs(r.value) / maxAbs) * 100))
          return (
            <div key={r.company} className="flex items-center gap-2">
              <span className="flex w-[92px] shrink-0 items-center gap-1 truncate text-[10.5px] text-ink-primary" title={r.companyLabel}>
                {isBest && stat.higherIsBetter != null && <Crown className="h-3 w-3 shrink-0 text-teal" aria-label="leads" />}
                {r.companyLabel}
              </span>
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-ice">
                <div className={`h-full rounded-full ${t.bar} opacity-80`} style={{ width: `${w}%` }} />
              </div>
              <span className={`w-[60px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums ${t.text}`}>
                {formatGridValue(r.value, stat.unit)}
              </span>
              {r.isOutlier && (
                <span className="shrink-0 rounded-full bg-champagne-soft px-1 py-0.5 text-[8.5px] font-bold text-champagne-deep" title={`${r.z > 0 ? '+' : ''}${r.z}σ vs the selected peers`}>
                  {r.z > 0 ? '+' : ''}
                  {r.z}σ
                </span>
              )}
            </div>
          )
        })}
    </div>
  )
}

function MetricStatCard({ stat }: { stat: MetricStat }) {
  const dirNote =
    stat.higherIsBetter == null
      ? 'directional only'
      : stat.higherIsBetter
        ? 'higher leads'
        : 'lower leads'
  return (
    <div className="rounded-xl border border-soft-border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11.5px] font-semibold text-navy-deep">{stat.metricLabel}</p>
        <span className="text-[9.5px] uppercase tracking-wide text-ink-secondary">
          {stat.period} · {dirNote}
        </span>
      </div>
      <RankBar stat={stat} />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-soft-border pt-1.5 text-[9.5px] text-ink-secondary">
        <span>median {formatGridValue(stat.median, stat.unit)}</span>
        <span>spread {formatGridValue(stat.spread, stat.unit)}</span>
        <span>n={stat.count}</span>
      </div>
    </div>
  )
}

function TrendCard({ t }: { t: TrendStat }) {
  const rising = t.absChange > 0
  const flat = t.absChange === 0
  const Icon = flat ? Minus : rising ? TrendingUp : TrendingDown
  const col = flat ? 'text-ink-secondary' : rising ? 'text-teal' : 'text-coral'
  return (
    <div className="rounded-xl border border-soft-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11.5px] font-semibold text-navy-deep">
          {t.companyLabel} · {t.metricLabel}
        </p>
        <span className="text-[9.5px] uppercase tracking-wide text-ink-secondary">
          {t.points[0].period}–{t.points[t.points.length - 1].period}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${col}`} />
        <span className="text-[12px] font-semibold tabular-nums text-navy-deep">
          {formatGridValue(t.from, t.unit)} → {formatGridValue(t.to, t.unit)}
        </span>
        <span className={`text-[11px] font-semibold tabular-nums ${col}`}>
          {t.pctChange != null ? `${t.pctChange > 0 ? '+' : ''}${t.pctChange}%` : `${t.absChange > 0 ? '+' : ''}${formatGridValue(t.absChange, t.unit)}`}
        </span>
      </div>
    </div>
  )
}

function GapList({ readout }: { readout: Tier1Readout }) {
  if (readout.coverage.gaps === 0) return null
  return (
    <div className="rounded-xl border border-[#F0D2CC] bg-coral-soft/50 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-coral" />
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-coral">{readout.coverage.gaps} data gap{readout.coverage.gaps > 1 ? 's' : ''}</p>
      </div>
      <ul className="space-y-0.5">
        {readout.coverage.gapList.slice(0, 8).map((g, i) => (
          <li key={i} className="text-[10.5px] leading-snug text-ink-primary">
            <span className="font-semibold">{g.companyLabel} · {g.metricLabel} · {g.period}</span>
            <span className="text-ink-secondary"> — {g.reason}</span>
          </li>
        ))}
        {readout.coverage.gapList.length > 8 && (
          <li className="text-[10px] italic text-ink-secondary">+{readout.coverage.gapList.length - 8} more…</li>
        )}
      </ul>
    </div>
  )
}

function SourceQualityBlock({ readout }: { readout: Tier1Readout }) {
  const sq = readout.sourceQuality
  const layers = Object.entries(sq.byLayer)
  return (
    <div className="rounded-xl border border-soft-border bg-surface-tint p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Database className="h-3.5 w-3.5 text-muted-blue" />
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-navy-deep">Source quality</p>
      </div>
      {layers.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {layers.map(([l, n]) => (
            <span key={l} className="rounded-full bg-white px-2 py-0.5 text-[9.5px] font-medium text-ink-secondary ring-1 ring-soft-border">
              {l} · {n}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10.5px] italic text-ink-secondary">No ready cells in the selection.</p>
      )}
      {(sq.conflicts > 0 || sq.marketOnly > 0) && (
        <p className="mt-1.5 text-[10px] text-ink-secondary">
          {sq.conflicts > 0 && <span className="text-champagne-deep">{sq.conflicts} flagged conflict{sq.conflicts > 1 ? 's' : ''}</span>}
          {sq.conflicts > 0 && sq.marketOnly > 0 && ' · '}
          {sq.marketOnly > 0 && <span className="text-champagne-deep">{sq.marketOnly} market-source cell{sq.marketOnly > 1 ? 's' : ''}</span>}
        </p>
      )}
      {sq.firewallWarnings.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-soft-border pt-1.5">
          {sq.firewallWarnings.slice(0, 3).map((w, i) => (
            <li key={i} className="flex items-start gap-1 text-[10px] leading-snug text-champagne-deep">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export interface AnalystReadoutDrawerProps {
  cells: GridCell[]
  onClose: () => void
  /** Optional slot rendered above the Tier-1 readout (the AI card lives here). */
  aiSlot?: React.ReactNode
}

export function AnalystReadoutDrawer({ cells, onClose, aiSlot }: AnalystReadoutDrawerProps) {
  const readout = useMemo(() => computeReadout(cells), [cells])
  const [showTier1, setShowTier1] = useState(true)
  const label = useMemo(() => scopeLabel(readout), [readout])

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full max-w-md">
      <aside className="animate-drawer-in pointer-events-auto relative ml-auto flex h-full w-full flex-col border-l border-soft-border bg-card shadow-lift">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-soft-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Analyst readout</p>
            <h3 className="mt-0.5 truncate font-display text-[15px] leading-tight text-navy-deep" title={label}>
              {label}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-ink-secondary transition hover:bg-ice hover:text-navy-deep" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scroll body */}
        <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          <CoverageStrip readout={readout} />

          {/* Tier-2 AI slot (wired next phase) */}
          {aiSlot}

          {/* Tier-1 readout */}
          <button
            type="button"
            onClick={() => setShowTier1((s) => !s)}
            className="mt-1 flex w-full items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-navy-deep"
          >
            {showTier1 ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Instant readout
            <span className="ml-1 font-medium normal-case tracking-normal text-ink-secondary">· computed in your browser, free</span>
          </button>

          {showTier1 && (
            <div className="space-y-2">
              <GapList readout={readout} />

              {readout.metricStats.length > 0 && (
                <>
                  <SectionTitle hint={`${readout.metricStats.length} peer comparison${readout.metricStats.length > 1 ? 's' : ''}`}>Peer positioning</SectionTitle>
                  {readout.metricStats.map((m) => (
                    <MetricStatCard key={`${m.metric}-${m.period}`} stat={m} />
                  ))}
                </>
              )}

              {readout.trends.length > 0 ? (
                <>
                  <SectionTitle hint="real multi-period only">Trend</SectionTitle>
                  {readout.trends.map((t) => (
                    <TrendCard key={`${t.company}-${t.metric}`} t={t} />
                  ))}
                </>
              ) : (
                readout.scope.singlePeriod &&
                readout.scope.periods.length === 1 && (
                  <p className="rounded-lg bg-soft-blue px-3 py-2 text-[10.5px] text-navy-primary">
                    {readout.scope.periods[0]} only — multi-year trend not yet staged. Select more than one period to compare over time.
                  </p>
                )
              )}

              {readout.metricStats.length === 0 && readout.trends.length === 0 && readout.coverage.ready > 0 && (
                <p className="rounded-lg bg-surface-tint px-3 py-2 text-[10.5px] text-ink-secondary">
                  Select at least two insurers for the same metric &amp; period to unlock peer comparison, or one insurer across several periods for a trend.
                </p>
              )}

              <SectionTitle>Source &amp; trust</SectionTitle>
              <SourceQualityBlock readout={readout} />
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
