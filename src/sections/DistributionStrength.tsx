import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Building2, Info, Lock, MapPin, Sparkles, Wallet } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany, useFilters } from '@/state/filters'
import { usePeriodGate } from '@/lib/usePeriodGate'
import { fyLabelsInRange } from '@/lib/dateRange'
import {
  DIST_CHANNELS,
  type DistChannel,
  getChannelDependencePeerData,
  getCompanyDistributionData,
  getReachDepthData,
  hasCompanyDistributionData,
} from '@/lib/distributionEngine'

// Default source-tag preset for Distribution Engine cards. UI is mock-seeded;
// upgrades to per-company filings via distribution-channel-mix snapshot.
const DIST_SOURCE = {
  source: 'Company filing' as const,
  confidence: 'medium' as const,
  provenance: {
    source_name: 'Niva Bupa channel mix from FY25 RHP / annual report; peer values from public disclosures',
    source_url: 'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf',
    fetched_at: '2026-05-28',
  },
}

// Channel palette tuned for the Distribution story: Brokers = teal (the
// largest, diversified engine), Agents = strong navy (legacy push channel),
// Banca = medium blue (institutional partner channel), Corporate Agents =
// muted gold (premium supporting channel), Direct = cool slate (own book),
// Others = light grey (catch-all). Colours map to meaning, not arbitrary.
const CHANNEL_COLORS: Record<DistChannel, string> = {
  Brokers: '#168E8E',
  Agents: '#27457E',
  Banca: '#4F7BCF',
  'Corporate Agents': '#B68B3A',
  Direct: '#8C97A8',
  Others: '#CCD3DC',
}
// Soft per-channel surface tints for chip backgrounds.
const CHANNEL_TINT: Record<DistChannel, { bg: string; border: string; glow: string }> = {
  Brokers: { bg: 'linear-gradient(135deg, #F1F8F6 0%, #E1F2F1 100%)', border: '#BFE3E1', glow: 'rgba(22,142,142,0.18)' },
  Agents: { bg: 'linear-gradient(135deg, #F2F5FC 0%, #E6EEFA 100%)', border: '#D2DEF1', glow: 'rgba(39,69,126,0.18)' },
  Banca: { bg: 'linear-gradient(135deg, #F2F5FC 0%, #EAF0FA 100%)', border: '#D6E2FA', glow: 'rgba(79,123,207,0.16)' },
  'Corporate Agents': { bg: 'linear-gradient(135deg, #FBF6EA 0%, #F4ECDB 100%)', border: '#EAD9B6', glow: 'rgba(182,139,58,0.18)' },
  Direct: { bg: 'linear-gradient(135deg, #F7F8FB 0%, #EEF1F7 100%)', border: '#D6DAE2', glow: 'rgba(110,126,150,0.16)' },
  Others: { bg: 'linear-gradient(135deg, #F7F8FB 0%, #EEF1F7 100%)', border: '#D6DAE2', glow: 'rgba(140,151,168,0.12)' },
}
const GRID = '#EEF1F7'
const AXIS = '#6B7280'

export function DistributionStrength() {
  return (
    <div className="space-y-5">
      <HeroCard />
      <MainChartBlock />
      <BridgeBlock />
    </div>
  )
}

// ─── 1. HERO CARD ──────────────────────────────────────────────────────────
function HeroCard() {
  const company = useActiveCompany()
  const data = getCompanyDistributionData(company.id)

  return (
    <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)] sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(182,139,58,0.10),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.08),transparent_65%)]" />

      <div className="relative grid items-center gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DCC4] bg-[#FBF3E2]/70 px-2.5 py-1">
            <Sparkles className="h-3 w-3 text-champagne-deep" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
              Distribution Engine
            </span>
          </div>
          <h1 className="mt-3 font-display text-[26px] leading-[1.18] tracking-tight text-navy-deep sm:text-[28px]">
            {company.shortName} · premium sourced by channel
          </h1>
          <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-ink-secondary">
            Share of gross written premium across distribution channels, latest reported year.
          </p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {data
            ? data.heroChips.map((c) => (
                <ChannelChip
                  key={c.channel}
                  channel={c.channel}
                  share={c.share}
                  largest={c.largest}
                  period={data.latest?.period}
                />
              ))
            : Array.from({ length: 4 }).map((_, i) => (
                <UnavailableChip key={i} />
              ))}
        </div>
      </div>
      <div className="relative mt-4 flex justify-end">
        <SourceTag source={DIST_SOURCE.source} confidence={DIST_SOURCE.confidence} provenance={DIST_SOURCE.provenance} period={data?.latest?.period} />
      </div>
    </section>
  )
}

function ChannelChip({
  channel,
  share,
  largest,
  period,
}: {
  channel: DistChannel
  share: number
  largest?: boolean
  period?: string
}) {
  const bar = CHANNEL_COLORS[channel]
  const tint = CHANNEL_TINT[channel]
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border p-3.5 shadow-[0_1px_2px_rgba(23,43,77,0.03),0_6px_18px_rgba(23,43,77,0.05)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(23,43,77,0.06),0_14px_30px_rgba(23,43,77,0.10)]"
      style={{ background: tint.bg, borderColor: tint.border }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: bar }} />
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-70 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: tint.glow }}
      />
      <div className="relative flex items-baseline justify-between pl-2">
        <p className="font-display text-[22px] leading-none text-navy-deep">
          {share.toFixed(1)}%
        </p>
        {largest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-champagne-deep shadow-soft ring-1 ring-[#EAD9B6]">
            <span className="h-1 w-1 rounded-full bg-champagne shadow-[0_0_4px_rgba(182,139,58,0.7)]" />
            Largest
          </span>
        )}
      </div>
      <p className="relative mt-2 pl-2 text-[11.5px] font-medium text-navy-deep">{channel}</p>
      {period && (
        <p className="relative pl-2 text-[10px] uppercase tracking-wide text-ink-secondary">{period}</p>
      )}
    </div>
  )
}

function UnavailableChip() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-[#E4E8F0] bg-white/40 p-3.5">
      <p className="font-display text-[18px] leading-none text-ink-secondary/70">—</p>
      <p className="mt-2 text-[11px] leading-snug text-ink-secondary">
        Channel data unavailable
      </p>
    </div>
  )
}

// ─── 2. MAIN CHART BLOCK — multi-select channel-mix trend ────────────────────
function MainChartBlock() {
  const company = useActiveCompany()
  const { range } = useFilters()
  const gate = usePeriodGate()
  const data = getCompanyDistributionData(company.id)

  // Real reported channel-mix years inside the dashboard Data Range. The trend
  // lines connect reported points only — a missing year is a gap, never a zero.
  const yearsInRange = fyLabelsInRange(range)
  const realByPeriod = new Map(
    (data?.mix ?? []).filter((r) => /^FY\d{2}$/.test(r.period)).map((r) => [r.period as string, r] as const),
  )
  const mixRows = data ? yearsInRange.filter((fy) => realByPeriod.has(fy)).map((fy) => realByPeriod.get(fy)!) : []
  const span = mixRows.length
    ? mixRows.length === 1
      ? mixRows[0].period
      : `${mixRows[0].period} → ${mixRows[mixRows.length - 1].period}`
    : 'selected range'

  // Channels carrying data in range, ordered by latest share (largest first).
  const latest = mixRows[mixRows.length - 1]
  const channelsWithData = (DIST_CHANNELS as readonly DistChannel[]).filter((ch) =>
    mixRows.some((r) => typeof r[ch] === 'number'),
  )
  const ordered = latest
    ? [...channelsWithData].sort((a, b) => Number(latest[b] ?? 0) - Number(latest[a] ?? 0))
    : channelsWithData

  // Multi-select: lines start all-on; clicking a chip hides/shows its line. The
  // selector never lets every line be hidden (always keep one on screen).
  const [hidden, setHidden] = useState<Set<DistChannel>>(new Set())
  const toggle = (ch: DistChannel) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(ch)) next.delete(ch)
      else next.add(ch)
      return next.size >= ordered.length ? prev : next
    })
  const shown = ordered.filter((ch) => !hidden.has(ch))
  const visible = shown.length ? shown : ordered

  return (
    <section className="card-surface p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF1F7] pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Channel Mix
          </p>
          <h2 className="mt-1.5 font-display text-[20px] leading-tight text-navy-deep">
            {company.shortName} channel mix over time
          </h2>
          <p className="mt-1 text-[12px] text-ink-secondary">
            Share of GWP by channel · {span} · select channels to compare
          </p>
        </div>
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Distribution data unavailable for this period"
          body={gate.reason ?? 'Channel mix is captured annually — switch the period toggle to Annual.'}
          height={300}
        />
      ) : !data ? (
        <EmptyState
          title={`Channel mix not wired for ${company.shortName}`}
          body="Add source-backed channel-mix data for this insurer to activate the chart."
          height={300}
        />
      ) : mixRows.length === 0 ? (
        <EmptyState
          title="Data not available from source"
          body={`No channel-mix years for ${company.shortName} fall inside the selected Data Range — widen it in the top bar (mix is reported FY22–FY25).`}
          height={300}
        />
      ) : (
        <>
          {/* Channel selector — doubles as the legend; details stay in the tooltip. */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ordered.map((ch) => {
              const isOn = visible.includes(ch)
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggle(ch)}
                  aria-pressed={isOn}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                    isOn ? 'border-transparent text-navy-deep shadow-soft' : 'border-soft-border bg-ice/40 text-ink-secondary hover:text-navy-primary',
                  ].join(' ')}
                  style={isOn ? { background: `${CHANNEL_COLORS[ch]}14` } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: isOn ? CHANNEL_COLORS[ch] : '#C4CCD6' }} />
                  {ch}
                </button>
              )
            })}
          </div>

          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mixRows} margin={{ top: 8, right: 18, left: -6, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: AXIS }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  width={44}
                  domain={[0, 'dataMax + 5']}
                  unit="%"
                />
                <Tooltip cursor={{ stroke: '#C4CCD6', strokeWidth: 1 }} content={<ChannelTooltip rows={mixRows} />} />
                {visible.map((ch) => (
                  <Line
                    key={ch}
                    type="monotone"
                    dataKey={ch}
                    name={ch}
                    stroke={CHANNEL_COLORS[ch]}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: CHANNEL_COLORS[ch], strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <div className="mt-3 flex justify-end">
        <SourceTag source={DIST_SOURCE.source} confidence={DIST_SOURCE.confidence} provenance={DIST_SOURCE.provenance} period={mixRows[mixRows.length - 1]?.period ?? data?.latest?.period} />
      </div>
    </section>
  )
}

// Multi-series channel tooltip — channel name, period, share %, and YoY change
// (pp vs the prior reported year). Detail lives here, off the chart face.
function ChannelTooltip({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean
  payload?: { name: string; value: number | null; color: string; dataKey: string }[]
  label?: string
  rows: Array<{ period: string } & Partial<Record<DistChannel, number>>>
}) {
  if (!active || !payload || payload.length === 0) return null
  const items = payload.filter((p) => typeof p.value === 'number')
  if (items.length === 0) return null
  const idx = rows.findIndex((r) => r.period === label)
  const prior = idx > 0 ? rows[idx - 1] : null
  return (
    <div className="rounded-xl border border-[#E5E8EF] bg-white/96 px-3 py-2 shadow-[0_8px_22px_rgba(23,43,77,0.1)] backdrop-blur">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="space-y-1">
        {[...items]
          .sort((a, b) => (b.value as number) - (a.value as number))
          .map((p) => {
            const pv = prior ? prior[p.dataKey as DistChannel] : undefined
            const yoy = typeof pv === 'number' ? (p.value as number) - pv : null
            return (
              <div key={p.dataKey} className="flex items-center gap-3 text-[11.5px]">
                <span className="flex items-center gap-1.5 text-ink-secondary">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </span>
                <span className="ml-auto font-semibold tabular-nums text-navy-deep">{(p.value as number).toFixed(1)}%</span>
                {yoy != null && (
                  <span className="tabular-nums text-[10.5px] font-semibold" style={{ color: yoy >= 0 ? '#168E8E' : '#C0584F' }}>
                    {yoy >= 0 ? '+' : '−'}
                    {Math.abs(yoy).toFixed(1)} pp
                  </span>
                )}
              </div>
            )
          })}
      </div>
      <p className="mt-1.5 border-t border-soft-border pt-1 text-[9.5px] text-ink-secondary">Share of GWP · YoY = vs prior reported year</p>
    </div>
  )
}

// ─── 3. BRIDGE BLOCK ───────────────────────────────────────────────────────
function BridgeBlock() {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <DependenceCard />
      <ReachDepthCard />
    </section>
  )
}

function DependenceCard() {
  const company = useActiveCompany()
  const { peerGroup } = useFilters()
  const gate = usePeriodGate()
  const rows = getChannelDependencePeerData(company.id, peerGroup)
  const data = getCompanyDistributionData(company.id)

  const self = rows.find((r) => r.focal)
  const others = rows.filter((r) => !r.focal)
  const hasPeers = others.length >= 1

  // Real latest-period concentration for the focal company (no fabricated peers).
  const latest = data?.latest ?? null
  const prior = data && data.mix.length >= 2 ? data.mix[data.mix.length - 2] : null
  const ranked = latest
    ? (DIST_CHANNELS as readonly DistChannel[]).map((ch) => ({ ch, val: latest[ch] })).sort((a, b) => b.val - a.val)
    : []
  const top = ranked[0] ?? null
  const second = ranked[1] ?? null
  const top2 = top && second ? top.val + second.val : null
  const agencyYoY = latest && prior ? latest.Agents - prior.Agents : null

  // Neutral concentration label from the actual mix — a factual descriptor of
  // how spread the channel mix is, not a recommendation.
  const conc: { label: string; tone: 'positive' | 'navy' | 'warning' } = top == null
    ? { label: 'Pending', tone: 'navy' }
    : top.val >= 45
      ? { label: 'Concentrated', tone: 'warning' }
      : top.val >= 38 || (top2 != null && top2 >= 66)
        ? { label: 'Moderate', tone: 'navy' }
        : { label: 'Diversified', tone: 'positive' }

  // Peer-relative position when ≥2 insurers have data; else the concentration label.
  const otherAvg = others.length ? others.reduce((s, r) => s + r.value, 0) / others.length : 0
  const peerSignal: { label: string; tone: 'positive' | 'navy' | 'warning' } | null =
    hasPeers && self
      ? self.value < otherAvg - 4
        ? { label: 'Below peer avg', tone: 'positive' }
        : self.value > otherAvg + 4
          ? { label: 'Above peer avg', tone: 'warning' }
          : { label: 'Near peer avg', tone: 'navy' }
      : null
  const badge = peerSignal ?? conc

  const badgeClass =
    badge.tone === 'positive'
      ? 'bg-teal-soft text-teal ring-[#BFE3E1]'
      : badge.tone === 'warning'
        ? 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]'
        : 'bg-soft-blue text-navy-primary ring-[#D6E2FA]'

  return (
    <div className="card-surface card-interactive p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[#EEF1F7] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Channel Dependence
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            Channel concentration
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">
            {hasPeers ? 'Agent share by peer · latest period' : `Channel concentration · ${latest?.period ?? 'latest'}`}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold shadow-soft ring-1 ${badgeClass}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${badge.tone === 'positive' ? 'bg-teal' : badge.tone === 'warning' ? 'bg-champagne' : 'bg-navy-primary'}`}
          />
          {badge.label}
        </span>
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual.'}
          height={196}
        />
      ) : !self || !top || !latest ? (
        <EmptyState
          title={`Channel mix not wired for ${company.shortName}`}
          body="Add source-backed channel-mix data for this insurer to activate the view."
          height={196}
        />
      ) : hasPeers ? (
        <div style={{ width: '100%', height: Math.max(196, rows.length * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10.5, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} unit="%" domain={[0, 'dataMax + 5']} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10.5, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} width={120} />
              <Tooltip
                cursor={{ fill: 'rgba(39,69,126,0.04)' }}
                content={({ active, payload, label }) =>
                  active && payload && payload[0] ? (
                    <div className="rounded-lg border border-[#E5E8EF] bg-white px-2.5 py-1.5 shadow-md">
                      <p className="text-[10px] font-semibold text-navy-deep">{label}</p>
                      <p className="text-[11px] tabular-nums text-navy-primary">Agents · {Number(payload[0].value).toFixed(1)}%</p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="value" radius={[3, 5, 5, 3]} maxBarSize={22}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={r.focal ? '#27457E' : '#A9BFE0'} stroke={r.focal ? '#1B3260' : undefined} strokeWidth={r.focal ? 1 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        // Single-company rich layout — large largest-channel bar + supporting stats.
        <div className="space-y-2.5">
          <div className="relative overflow-hidden rounded-xl border border-soft-border bg-gradient-to-br from-white to-ice/60 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Largest single channel</span>
              <span className="text-[9.5px] uppercase tracking-wide text-ink-secondary">{latest.period} · % of GWP</span>
            </div>
            <div className="mt-1.5 flex items-end gap-2.5">
              <span className="font-display text-[27px] leading-none text-navy-deep">{top.val.toFixed(1)}%</span>
              <span
                className="mb-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ color: CHANNEL_COLORS[top.ch], background: CHANNEL_TINT[top.ch].bg, boxShadow: `inset 0 0 0 1px ${CHANNEL_TINT[top.ch].border}` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHANNEL_COLORS[top.ch] }} />
                {top.ch}
              </span>
            </div>
            <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-soft-border/70">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, top.val)}%`, background: `linear-gradient(90deg, ${CHANNEL_COLORS[top.ch]}, ${CHANNEL_COLORS[top.ch]}CC)` }} />
              <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-champagne/60" style={{ left: '50%' }} />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-ink-secondary">
              <span>0%</span>
              <span className="text-champagne-deep">50% risk line</span>
              <span>100%</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Largest" value={top.ch} sub={`${top.val.toFixed(1)}%`} tone="navy" />
            <MiniStat
              label="Top-2 share"
              value={top2 != null ? `${top2.toFixed(0)}%` : 'n/a'}
              sub={conc.tone === 'positive' ? 'well spread' : conc.tone === 'warning' ? 'concentrated' : 'mid-pack'}
              tone={conc.tone === 'warning' ? 'gold' : conc.tone === 'positive' ? 'teal' : 'navy'}
            />
            <MiniStat
              label="Agency YoY"
              value={agencyYoY != null ? `${agencyYoY >= 0 ? '+' : '−'}${Math.abs(agencyYoY).toFixed(1)}pp` : 'n/a'}
              sub={agencyYoY != null ? (agencyYoY <= 0 ? 'easing' : 'rising') : undefined}
              tone={agencyYoY != null && agencyYoY <= 0 ? 'teal' : 'gold'}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <SourceTag source={DIST_SOURCE.source} confidence={DIST_SOURCE.confidence} provenance={DIST_SOURCE.provenance} period={latest?.period} />
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'navy' | 'teal' | 'gold' }) {
  const c =
    tone === 'teal'
      ? { dot: 'bg-teal', text: 'text-teal', ring: 'ring-[#BFE3E1]', bg: 'bg-[#F1F8F6]' }
      : tone === 'gold'
        ? { dot: 'bg-champagne', text: 'text-champagne-deep', ring: 'ring-[#EAD9B6]', bg: 'bg-[#FBF6EA]' }
        : { dot: 'bg-navy-primary', text: 'text-navy-primary', ring: 'ring-[#D6E2FA]', bg: 'bg-[#F2F5FC]' }
  return (
    <div className={`rounded-lg px-2.5 py-2 ring-1 ${c.ring} ${c.bg}`}>
      <div className="flex items-center gap-1">
        <span className={`h-1 w-1 rounded-full ${c.dot}`} />
        <span className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      </div>
      <p className={`mt-1 truncate font-display text-[14px] leading-none ${tone === 'navy' ? 'text-navy-deep' : c.text}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[9px] text-ink-secondary">{sub}</p>}
    </div>
  )
}

type ReachTab = 'Region' | 'Tier' | 'Avg Premium'

function ReachDepthCard() {
  const company = useActiveCompany()
  const [tab, setTab] = useState<ReachTab>('Region')
  const reach = getReachDepthData(company.id)

  return (
    <div className="card-surface card-interactive p-5">
      <header className="relative mb-3 flex items-start justify-between gap-2 border-b border-[#EEF1F7] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Reach Depth
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            Where is distribution reaching?
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">
            Region · tier · average premium
          </p>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
          {(['Region', 'Tier', 'Avg Premium'] as ReachTab[]).map((t) => {
            const active = t === tab
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={active}
                className={[
                  'rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-all duration-300',
                  active
                    ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft ring-1 ring-[#1B3260]'
                    : 'text-ink-secondary hover:bg-soft-blue hover:text-navy-primary',
                ].join(' ')}
              >
                {t}
              </button>
            )
          })}
        </div>
      </header>

      {reach ? null /* Wire chart bodies here once region/tier/avg data is sourced. */ : (
        <ReachReservedPreview companyName={company.shortName} tab={tab} />
      )}
      <div className="mt-3 flex justify-end">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-ice/70 px-2 py-0.5 text-[10px] text-ink-secondary ring-1 ring-soft-border"
          title="Reach-depth (region / tier / city) not disclosed by Indian insurers — schema reserved."
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
          Reserved schema · ingest pending
        </span>
      </div>
    </div>
  )
}

// Polished "reserved module" preview — three locked mini-cards over a soft
// map-pin / network backdrop, so the panel reads as intentional, not empty.
function ReachReservedPreview({ companyName, tab }: { companyName: string; tab: ReachTab }) {
  const dims: { key: ReachTab; icon: typeof MapPin; label: string }[] = [
    { key: 'Region', icon: MapPin, label: 'Region mix' },
    { key: 'Tier', icon: Building2, label: 'Tier split' },
    { key: 'Avg Premium', icon: Wallet, label: 'Avg premium' },
  ]
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[#D6E2FA] px-3.5 py-3.5"
      style={{ background: 'linear-gradient(135deg, #F7FAFD 0%, #EEF4FF 58%, #F1F8F6 100%)' }}
    >
      <ReachBackdrop />
      <div className="relative flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-navy-primary shadow-soft ring-1 ring-[#D6E2FA]">
          <MapPin className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[12px] font-semibold text-navy-deep">Reach depth data pending to download</p>
          <p className="text-[10.5px] leading-snug text-ink-secondary">
            Source-backed region / tier splits for {companyName} activate here on the next ingest.
          </p>
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-2">
        {dims.map((d) => {
          const active = d.key === tab
          const Icon = d.icon
          return (
            <div
              key={d.key}
              className={`relative overflow-hidden rounded-lg border bg-white/75 px-2.5 py-2.5 backdrop-blur transition-all duration-300 ${active ? 'border-[#B9CCEC] shadow-soft ring-1 ring-[#D6E2FA]' : 'border-soft-border'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${active ? 'bg-soft-blue text-navy-primary' : 'bg-ice text-ink-secondary'}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <Lock className="h-3 w-3 text-ink-secondary/45" />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-navy-deep">{d.label}</p>
              <div className="mt-1.5 space-y-1" aria-hidden>
                <span className="block h-1.5 w-full rounded-full bg-[#E3E9F3]" />
                <span className="block h-1.5 w-3/4 rounded-full bg-[#E6ECF5]" />
                <span className="block h-1.5 w-1/2 rounded-full bg-[#EAEFF6]" />
              </div>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-ice px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary ring-1 ring-soft-border">
                Pending
              </span>
            </div>
          )
        })}
      </div>

      <p className="relative mt-2.5 inline-flex items-center gap-1.5 text-[10px] leading-snug text-ink-secondary">
        <Info className="h-2.5 w-2.5 shrink-0 text-navy-primary" />
        Reach depth shows whether growth is broad-based or concentrated.
      </p>
    </div>
  )
}

// Faint map-pin + connecting-network texture for the reserved Reach Depth panel.
function ReachBackdrop() {
  const nodes: [number, number][] = [
    [40, 40], [120, 70], [210, 45], [280, 92], [60, 132], [190, 122],
  ]
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.6]"
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g stroke="#9DB6E0" strokeWidth="0.8" opacity="0.5" fill="none">
        <path d="M40 40 L120 70 L210 45 L280 92" />
        <path d="M60 132 L120 70 L190 122 L210 45" />
        <path d="M190 122 L280 92" />
      </g>
      {nodes.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="8" fill="#7FB7B3" opacity="0.1" />
          <circle cx={cx} cy={cy} r="2.4" fill={i % 2 ? '#168E8E' : '#3D5F9F'} opacity="0.32" />
        </g>
      ))}
    </svg>
  )
}

// ─── Re-export so other dashboards/tests can check data availability ──────
export { hasCompanyDistributionData }

// Composed-page export — the unified Market & Distribution page mounts the
// channel-mix trend as the bottom-right (supporting) Channel Momentum chart.
export { MainChartBlock as ChannelMomentumBlock }
