import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Info, MapPin, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany, useFilters } from '@/state/filters'
import { usePeriodGate } from '@/lib/usePeriodGate'
import {
  DIST_CHANNELS,
  type DistChannel,
  getChannelDependencePeerData,
  getCompanyDistributionData,
  getDistributionAIRead,
  getDistributionTakeaway,
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
      <TakeawayStrip />
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
            Distribution quality decides whether growth is durable.
          </h1>
          <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-ink-secondary">
            Balanced sourcing reduces single-channel risk for {company.shortName}, but
            channel economics and renewal quality must be watched.
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

// ─── 2. MAIN CHART BLOCK ───────────────────────────────────────────────────
function MainChartBlock() {
  const company = useActiveCompany()
  const { peerGroup } = useFilters()
  const gate = usePeriodGate()
  const data = getCompanyDistributionData(company.id)

  return (
    <section className="card-surface p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF1F7] pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Sourcing Engine
          </p>
          <h2 className="mt-1.5 font-display text-[20px] leading-tight text-navy-deep">
            How has {company.shortName}'s sourcing engine changed?
          </h2>
          <p className="mt-1 text-[12px] text-ink-secondary">
            Channel mix · share of GWP · {data?.mix.length ? `${data.mix[0].period} → ${data.mix[data.mix.length - 1].period}` : 'no data'}
          </p>
        </div>
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Distribution data unavailable for this period"
          body={gate.reason ?? 'Channel mix is captured annually — switch the period toggle to Annual.'}
          height={280}
        />
      ) : !data ? (
        <EmptyState
          title={`Channel mix not wired for ${company.shortName}`}
          body="Add source-backed channel-mix data for this insurer to activate the chart."
          height={280}
        />
      ) : (
        <>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.mix}
                margin={{ top: 8, right: 18, left: -4, bottom: 4 }}
                barCategoryGap="28%"
              >
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
                  width={42}
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  unit="%"
                />
                <Tooltip
                  cursor={{ fill: 'rgba(39,69,126,0.04)' }}
                  content={<MixTooltip />}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                  iconType="circle"
                  align="right"
                  verticalAlign="top"
                />
                {DIST_CHANNELS.map((ch, i) => (
                  <Bar
                    key={ch}
                    dataKey={ch}
                    stackId="a"
                    fill={CHANNEL_COLORS[ch]}
                    radius={i === DIST_CHANNELS.length - 1 ? [4, 4, 0, 0] : 0}
                    maxBarSize={84}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <AiRead text={getDistributionAIRead(company, peerGroup)} />
        </>
      )}
      <div className="mt-3 flex justify-end">
        <SourceTag source={DIST_SOURCE.source} confidence={DIST_SOURCE.confidence} provenance={DIST_SOURCE.provenance} period={data?.latest?.period} />
      </div>
    </section>
  )
}

function MixTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-[#E5E8EF] bg-white/96 px-3 py-2 shadow-[0_8px_22px_rgba(23,43,77,0.1)] backdrop-blur">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-1.5 text-ink-secondary">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="text-[10.5px]">{p.name}</span>
            <span className="ml-auto text-[11.5px] tabular-nums text-navy-deep">
              {p.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Highlights distribution-story keywords inline (growth/balance words in
// teal, concentration/single-channel words in champagne, fall/easing words
// in muted slate). Matches in source order so phrases never double-wrap.
function highlightDistRead(text: string): ReactNode[] {
  const tokens: { match: RegExp; className: string }[] = [
    { match: /broker share rising/i, className: 'font-semibold text-teal' },
    { match: /broker share/i, className: 'font-semibold text-teal' },
    { match: /banca gaining/i, className: 'font-semibold text-navy-primary' },
    { match: /more balanced/i, className: 'font-semibold text-teal' },
    { match: /balanced/i, className: 'font-semibold text-teal' },
    { match: /more concentrated/i, className: 'font-semibold text-champagne-deep' },
    { match: /single-channel/i, className: 'font-semibold text-champagne-deep' },
    { match: /agency gaining/i, className: 'font-semibold text-navy-primary' },
    { match: /agency compressing/i, className: 'font-semibold text-ink-secondary' },
    { match: /direct rising/i, className: 'font-semibold text-teal' },
  ]
  const out: ReactNode[] = []
  let cursor = 0
  while (cursor < text.length) {
    let nextMatch: { idx: number; len: number; className: string } | null = null
    for (const t of tokens) {
      const slice = text.slice(cursor)
      const m = slice.match(t.match)
      if (m && m.index != null) {
        const absIdx = cursor + m.index
        if (!nextMatch || absIdx < nextMatch.idx) {
          nextMatch = { idx: absIdx, len: m[0].length, className: t.className }
        }
      }
    }
    if (!nextMatch) {
      out.push(text.slice(cursor))
      break
    }
    if (nextMatch.idx > cursor) out.push(text.slice(cursor, nextMatch.idx))
    out.push(
      <span key={`${nextMatch.idx}-${nextMatch.len}`} className={nextMatch.className}>
        {text.slice(nextMatch.idx, nextMatch.idx + nextMatch.len)}
      </span>,
    )
    cursor = nextMatch.idx + nextMatch.len
  }
  return out
}

function AiRead({ text }: { text: string }) {
  return (
    <div
      className="relative mt-3 flex items-center gap-2.5 overflow-hidden rounded-lg border border-[#EAD9B6] px-3 py-2 shadow-soft"
      style={{ background: 'linear-gradient(135deg, #FBF6EA 0%, #FFFFFF 55%, #F1F8F6 100%)' }}
    >
      <span
        className="pointer-events-none absolute -right-10 -bottom-8 h-20 w-20 rounded-full opacity-60 blur-2xl"
        style={{ background: 'rgba(182,139,58,0.18)' }}
      />
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-champagne-deep shadow-soft ring-1 ring-[#EAD9B6]">
        <Sparkles className="h-2.5 w-2.5" />
      </span>
      <p className="relative text-[12px] leading-snug text-navy-deep">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">AI read</span>{' '}
        <span className="text-ink-secondary">·</span> {highlightDistRead(text)}
      </p>
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

  const self = rows.find((r) => r.focal)
  const others = rows.filter((r) => !r.focal)
  const otherAvg = others.length
    ? others.reduce((s, r) => s + r.value, 0) / others.length
    : 0
  // Signal chip — frames the chart's verdict before the eye reads the bar:
  // Balanced (focal below peer avg), Moderate (within ±4pp), Concentration
  // risk (focal materially above peer avg).
  const peerLabel = peerGroup === 'All' ? 'peer' : peerGroup.toLowerCase()
  const signal: { label: string; tone: 'positive' | 'navy' | 'warning' } = self
    ? self.value < otherAvg - 4
      ? { label: 'Balanced', tone: 'positive' }
      : self.value > otherAvg + 4
        ? { label: 'Concentration risk', tone: 'warning' }
        : { label: 'Moderate dependence', tone: 'navy' }
    : { label: 'Pending', tone: 'navy' }
  const signalClass =
    signal.tone === 'positive'
      ? 'bg-teal-soft text-teal ring-[#BFE3E1]'
      : signal.tone === 'warning'
        ? 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]'
        : 'bg-soft-blue text-navy-primary ring-[#D6E2FA]'
  const insightTint =
    signal.tone === 'positive'
      ? 'border-[#BFE3E1] bg-[#F1F8F6]'
      : signal.tone === 'warning'
        ? 'border-[#EAD9B6] bg-[#FBF6EA]'
        : 'border-[#D6E2FA] bg-[#F2F5FC]'
  const dependenceLine = self
    ? self.value < otherAvg - 4
      ? `${company.shortName} is materially less agency-heavy than its ${peerLabel} peers — reducing single-channel dependence.`
      : self.value > otherAvg + 4
        ? `${company.shortName} is more agency-reliant than its ${peerLabel} peers — single-channel risk to watch.`
        : `${company.shortName}'s agency dependence sits close to the ${peerLabel} median.`
    : `Agency share not wired for ${company.shortName}.`

  return (
    <div className="card-surface p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[#EEF1F7] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Channel Dependence
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            Is growth dependent on one channel?
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">
            Agent share by peer · latest period
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold shadow-soft ring-1 ${signalClass}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${signal.tone === 'positive' ? 'bg-teal' : signal.tone === 'warning' ? 'bg-champagne' : 'bg-navy-primary'}`}
          />
          {signal.label}
        </span>
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual.'}
          height={196}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Peer data unavailable"
          body="No insurers in this peer group have channel-mix data wired."
          height={196}
        />
      ) : (
        <div style={{ width: '100%', height: Math.max(196, rows.length * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 30, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10.5, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                unit="%"
                domain={[0, 'dataMax + 5']}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 10.5, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                width={120}
              />
              <Tooltip
                cursor={{ fill: 'rgba(39,69,126,0.04)' }}
                content={({ active, payload, label }) =>
                  active && payload && payload[0] ? (
                    <div className="rounded-lg border border-[#E5E8EF] bg-white px-2.5 py-1.5 shadow-md">
                      <p className="text-[10px] font-semibold text-navy-deep">{label}</p>
                      <p className="text-[11px] tabular-nums text-navy-primary">
                        Agents · {Number(payload[0].value).toFixed(1)}%
                      </p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="value" radius={[3, 5, 5, 3]} maxBarSize={22}>
                {rows.map((r, i) => (
                  <Cell
                    key={i}
                    fill={r.focal ? '#27457E' : '#A9BFE0'}
                    stroke={r.focal ? '#1B3260' : undefined}
                    strokeWidth={r.focal ? 1 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {rows.length > 0 && (
        <div className={`mt-3 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11.5px] leading-snug text-navy-deep ${insightTint}`}>
          <Info className={`mt-px h-3.5 w-3.5 shrink-0 ${signal.tone === 'positive' ? 'text-teal' : signal.tone === 'warning' ? 'text-champagne-deep' : 'text-navy-primary'}`} />
          <span>{dependenceLine}</span>
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <SourceTag source={DIST_SOURCE.source} confidence={DIST_SOURCE.confidence} provenance={DIST_SOURCE.provenance} />
      </div>
    </div>
  )
}

type ReachTab = 'Region' | 'Tier' | 'Avg Premium'

function ReachDepthCard() {
  const company = useActiveCompany()
  const [tab, setTab] = useState<ReachTab>('Region')
  const reach = getReachDepthData(company.id)

  return (
    <div className="card-surface p-5">
      <header className="relative mb-3 flex items-start justify-between gap-2 border-b border-[#EEF1F7] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Reach Depth
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            Where is distribution reaching?
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">
            Region · tier · average premium · mock
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
                  'rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-all duration-200',
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

      {!reach ? (
        <ReachUnavailableState companyName={company.shortName} tab={tab} />
      ) : null /* Wire chart bodies here once region/tier/avg data is sourced. */}
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

function ReachUnavailableState({ companyName, tab }: { companyName: string; tab: ReachTab }) {
  const tabHint =
    tab === 'Region'
      ? 'region-wise premium splits'
      : tab === 'Tier'
        ? 'Tier 1 / Tier 2 / Tier 3 premium mix'
        : 'average premium by region or tier'
  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-[#D6E2FA] px-6 text-center"
      style={{ height: 196, background: 'linear-gradient(135deg, #F7FAFD 0%, #EEF4FF 100%)' }}
    >
      <span
        className="pointer-events-none absolute -right-12 -top-10 h-28 w-28 rounded-full opacity-60 blur-2xl"
        style={{ background: 'rgba(49,90,169,0.14)' }}
      />
      <span className="relative blob-c mb-2.5 inline-flex h-11 w-11 items-center justify-center bg-white text-navy-primary shadow-soft ring-1 ring-[#D6E2FA]">
        <MapPin className="h-5 w-5" />
      </span>
      <p className="relative text-[12.5px] font-semibold text-navy-deep">
        Region / tier data not yet ingested
      </p>
      <p className="relative mt-1 max-w-sm text-[11px] leading-relaxed text-ink-secondary">
        This view will activate once source-backed {tabHint} for {companyName} land in the dataset.
      </p>
      <p className="relative mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-ink-secondary ring-1 ring-[#D6E2FA]">
        <Info className="h-2.5 w-2.5 text-navy-primary" />
        Why it matters · reach depth shows whether growth is broad-based or concentrated.
      </p>
    </div>
  )
}

// ─── 4. TAKEAWAY STRIP ─────────────────────────────────────────────────────
function TakeawayStrip() {
  const company = useActiveCompany()
  const { peerGroup } = useFilters()
  const takeaway = getDistributionTakeaway(company, peerGroup)
  const accent =
    takeaway.tone === 'teal'
      ? 'border-[#D6E5DF] from-[#EFF7F4] via-[#F5FBF8] to-[#F9F4E8] from-teal to-champagne text-teal ring-[#CFE3DA]'
      : takeaway.tone === 'warning'
        ? 'border-[#E7DCC4] from-[#FBF3E2] via-[#FBF7EA] to-[#FBF3E2] from-champagne to-signal-warning text-champagne-deep ring-[#E7DCC4]'
        : 'border-[#D6DEEC] from-[#EEF2F9] via-[#F5F8FC] to-[#EEF2F9] from-navy-primary to-teal text-navy-primary ring-[#D6DEEC]'

  // Split the className into background / gradient / pill bits since we
  // use the same string for the strip + chip + pill ring.
  const stripClass =
    takeaway.tone === 'teal'
      ? 'border-[#D6E5DF] bg-gradient-to-r from-[#EFF7F4] via-[#F5FBF8] to-[#F9F4E8]'
      : takeaway.tone === 'warning'
        ? 'border-[#E7DCC4] bg-gradient-to-r from-[#FBF3E2] via-[#FBF7EA] to-[#FBF3E2]'
        : 'border-[#D6DEEC] bg-gradient-to-r from-[#EEF2F9] via-[#F5F8FC] to-[#EEF2F9]'
  const barClass =
    takeaway.tone === 'teal'
      ? 'bg-gradient-to-b from-teal to-champagne'
      : takeaway.tone === 'warning'
        ? 'bg-gradient-to-b from-champagne to-signal-warning'
        : 'bg-gradient-to-b from-navy-primary to-teal'
  const pillClass =
    takeaway.tone === 'teal'
      ? 'ring-[#CFE3DA] text-teal'
      : takeaway.tone === 'warning'
        ? 'ring-[#E7DCC4] text-champagne-deep'
        : 'ring-[#D6DEEC] text-navy-primary'

  // unused string is silenced to keep TS happy.
  void accent

  return (
    <section className={`relative overflow-hidden rounded-xl border px-4 py-2.5 shadow-[0_1px_2px_rgba(23,43,77,0.03),0_6px_16px_rgba(23,43,77,0.04)] ${stripClass}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${barClass}`} />
      <div className="flex flex-wrap items-center gap-3 pl-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 ring-1 ${pillClass}`}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${takeaway.tone === 'teal' ? 'bg-teal' : takeaway.tone === 'warning' ? 'bg-champagne' : 'bg-navy-primary'}`}
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
            Distribution Read
          </span>
        </span>
        <p className="flex-1 text-[12.5px] leading-snug text-navy-deep">{highlightDistRead(takeaway.text)}</p>
        <SourceTag source={DIST_SOURCE.source} confidence={DIST_SOURCE.confidence} provenance={DIST_SOURCE.provenance} />
      </div>
    </section>
  )
}

// ─── Re-export so other dashboards/tests can check data availability ──────
export { hasCompanyDistributionData }
