import { useMemo, useState } from 'react'
import {
  Sparkles,
  Gauge,
  ShieldAlert,
  TrendingUp,
  BadgeCheck,
  CalendarClock,
  ExternalLink,
  ChevronDown,
  Activity,
  Zap,
  Landmark,
  Users,
  FileText,
  LineChart,
  Radar,
  type LucideIcon,
} from 'lucide-react'
import { insurers } from '@/data/mockData'
import { useActiveCompany, useFilters } from '@/state/filters'
import {
  buildInvestorPulse,
  CATEGORY_META,
  IMPACT_META,
  CONFIDENCE_META,
  type PulseSignal,
  type SignalCategory,
  type SignalImpact,
} from '@/insights/investorPulse'

const GOLD = '#B68B3A'
const SAHI = insurers.filter((i) => i.peerGroup === 'SAHI')

const CATEGORY_ICON: Record<SignalCategory, LucideIcon> = {
  'Analyst Action': LineChart,
  'Sector Catalyst': Zap,
  Regulatory: Landmark,
  Management: Users,
  Filing: FileText,
  'Data Movement': Activity,
}

const STANCE_META: Record<SignalImpact, { label: string; fg: string; bg: string }> = {
  Positive: { label: 'Constructive', fg: IMPACT_META.Positive.fg, bg: IMPACT_META.Positive.bg },
  Risk: { label: 'Cautious', fg: IMPACT_META.Risk.fg, bg: IMPACT_META.Risk.bg },
  Watch: { label: 'Watchful', fg: IMPACT_META.Watch.fg, bg: IMPACT_META.Watch.bg },
  Neutral: { label: 'Balanced', fg: IMPACT_META.Neutral.fg, bg: IMPACT_META.Neutral.bg },
}

// ── small shared chips ───────────────────────────────────────────────────────

function CategoryChip({ category }: { category: SignalCategory }) {
  const m = CATEGORY_META[category]
  const Icon = CATEGORY_ICON[category]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ color: m.fg, background: m.bg, boxShadow: `inset 0 0 0 1px ${m.ring}` }}>
      <Icon className="h-3 w-3" strokeWidth={2.3} />
      {category}
    </span>
  )
}

function ImpactChip({ impact }: { impact: SignalImpact }) {
  const m = IMPACT_META[impact]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ color: m.fg, background: m.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  )
}

function ConfidenceDot({ confidence }: { confidence: PulseSignal['confidence'] }) {
  const c = CONFIDENCE_META[confidence]
  return (
    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold" style={{ color: c.fg }} title={`${confidence} source confidence`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.fg }} />
      {confidence}
    </span>
  )
}

function SourceLink({ name, url }: { name: string; url: string }) {
  if (!url) return <span className="text-[10px] italic text-ink-secondary">{name} · link pending</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-navy-primary hover:underline" onClick={(e) => e.stopPropagation()}>
      {name}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

// ── company picker — surfaces the GLOBAL selected-company filter where Insights
//    needs it (the Insights page has no SAHI header). One source of truth: it
//    drives `highlightedCompany`, so every other tab stays in sync. ───────────

function CompanyPicker() {
  const active = useActiveCompany()
  const { setHighlightedCompany } = useFilters()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Company</span>
      {SAHI.map((c) => {
        const on = c.id === active.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setHighlightedCompany(c.id)}
            className={[
              'rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
              on ? 'bg-navy-deep text-white shadow-soft' : 'border border-soft-border bg-white text-navy-deep hover:border-muted-blue',
            ].join(' ')}
          >
            {c.shortName}
          </button>
        )
      })}
    </div>
  )
}

// ── hero right tiles — at-a-glance summary, one line each ────────────────────

function HeroTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  tone: { fg: string; bg: string }
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-soft-border bg-white p-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: tone.bg }}>
        <Icon className="h-3.5 w-3.5" style={{ color: tone.fg }} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink-secondary">{label}</p>
        <p className="line-clamp-2 text-[12px] font-semibold leading-tight text-navy-deep" title={value}>{value}</p>
        {sub && <p className="mt-0.5 truncate text-[10px] leading-tight text-ink-secondary" title={sub}>{sub}</p>}
      </div>
    </div>
  )
}

// ── daily signal pulse card — readable, click-to-expand ──────────────────────

function PulseCard({
  icon: Icon,
  label,
  signal,
  emptyText,
  accent,
}: {
  icon: LucideIcon
  label: string
  signal: PulseSignal | null
  emptyText: string
  accent: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col rounded-xl border border-soft-border bg-card p-3 shadow-soft">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} strokeWidth={2.3} />
        <p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>{label}</p>
      </div>
      {signal ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 flex flex-1 flex-col text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-ink-secondary">
              <CalendarClock className="h-3 w-3" strokeWidth={2.2} />
              {signal.dateLabel}
            </span>
            <ImpactChip impact={signal.impact} />
          </div>
          <p className={`mt-1.5 text-[12px] font-semibold leading-snug text-navy-deep ${open ? '' : 'line-clamp-2'}`}>{signal.title}</p>
          {open && signal.whyItMatters && <p className="mt-1 text-[11px] leading-snug text-ink-secondary">{signal.whyItMatters}</p>}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <SourceLink name={signal.sourceName} url={signal.sourceUrl} />
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-ink-secondary">
              {open ? 'Less' : 'Why'} <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          </div>
        </button>
      ) : (
        <p className="mt-2 flex-1 text-[11px] leading-snug text-ink-secondary">{emptyText}</p>
      )}
    </div>
  )
}

// ── curated market intelligence feed item — compact, click-to-expand ─────────

function FeedItem({ signal }: { signal: PulseSignal }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-xl border border-soft-border bg-card transition-colors hover:border-navy-primary/25">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-col p-3 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-secondary">
            <CalendarClock className="h-3 w-3 text-navy-primary" strokeWidth={2.2} />
            {signal.dateLabel}
          </span>
          <CategoryChip category={signal.category} />
          <ImpactChip impact={signal.impact} />
          {signal.scope === 'sector' && <span className="rounded-full bg-soft-blue px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-navy-primary">Sector</span>}
          <span className="ml-auto"><ConfidenceDot confidence={signal.confidence} /></span>
        </div>
        <p className="mt-1.5 text-[13px] font-semibold leading-snug text-navy-deep">{signal.title}</p>
        {signal.whyItMatters && (
          <p className={`mt-0.5 text-[11.5px] leading-snug text-ink-secondary ${open ? '' : 'line-clamp-1'}`}>
            <span className="font-semibold text-navy-deep/70">Why it matters: </span>
            {signal.whyItMatters}
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <SourceLink name={signal.sourceName} url={signal.sourceUrl} />
          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-ink-secondary">
            {open ? 'Less' : 'More'} <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </button>
    </li>
  )
}

// ── main ─────────────────────────────────────────────────────────────────────

export function InvestorPulse() {
  const company = useActiveCompany()
  const pulse = useMemo(() => buildInvestorPulse(company.id, company.shortName), [company.id, company.shortName])
  const [showAllFeed, setShowAllFeed] = useState(false)

  const stance = pulse.todayRead?.stance ?? 'Neutral'
  const sm = STANCE_META[stance]
  const conf = CONFIDENCE_META[pulse.confidence]

  const feed = pulse.signals
  const feedShown = showAllFeed ? feed : feed.slice(0, 6)

  return (
    <section className="space-y-5">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-[#E4CE93] bg-gradient-to-br from-[#F7F5EF] via-card to-[#EAEFF7] p-4 shadow-card sm:p-5">
        <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-champagne/20 opacity-70 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute right-1/4 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-[#B68B3A]/30 to-transparent" />

        {/* title row + company picker */}
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-champagne-soft text-champagne-deep shadow-[0_4px_14px_rgba(182,139,58,0.22)] ring-1 ring-[#E7D29B]">
              <Radar className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">Insights</p>
              <h1 className="font-editorial text-[26px] font-semibold leading-tight text-navy-deep">Today&apos;s Investor Pulse</h1>
              <p className="mt-0.5 max-w-xl font-editorial text-[13.5px] leading-snug text-ink-secondary">
                What changed, what matters, and what could move {company.shortName} next.
              </p>
            </div>
          </div>
          <CompanyPicker />
        </div>

        {pulse.isEmpty ? (
          <div className="relative mt-4 rounded-xl border border-dashed border-soft-border bg-white/70 px-4 py-10 text-center">
            <p className="font-editorial text-[15px] font-semibold text-navy-deep">No major new signal found for {company.shortName}.</p>
            <p className="mt-1 text-[12px] text-ink-secondary">There&apos;s no source-backed market intelligence or governance event on record for this company yet. New signals appear here automatically as the pipeline ingests them.</p>
          </div>
        ) : (
          <div className="relative mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            {/* LEFT · Today's Read */}
            <div className="rounded-xl border border-soft-border bg-white/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-navy-primary">Today&apos;s Read</p>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em]" style={{ color: sm.fg, background: sm.bg }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.fg }} /> {sm.label}
                </span>
              </div>
              {pulse.todayRead && (
                <>
                  <p className="mt-2 font-editorial text-[16px] font-semibold leading-snug text-navy-deep">{pulse.todayRead.headline}</p>
                  <p className="mt-1.5 font-editorial text-[13.5px] leading-relaxed text-ink-primary">{pulse.todayRead.summary}</p>
                  {pulse.todayRead.bullets.length > 0 && (
                    <ul className="mt-2.5 space-y-1">
                      {pulse.todayRead.bullets.map((b, i) => (
                        <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-ink-secondary">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: GOLD }} />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* RIGHT · 4 compact tiles */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <HeroTile
                icon={Zap}
                label="Fastest Signal"
                value={pulse.freshest ? pulse.freshest.title : 'No fresh signal'}
                sub={pulse.freshest ? `${pulse.freshest.dateLabel} · ${pulse.freshest.category}` : undefined}
                tone={{ fg: GOLD, bg: 'rgba(182,139,58,0.12)' }}
              />
              <HeroTile
                icon={ShieldAlert}
                label="Risk Watch"
                value={pulse.latestRisk ? pulse.latestRisk.title : 'No active risk flag'}
                sub={pulse.counts.risk + pulse.counts.watch > 0 ? `${pulse.counts.risk} risk · ${pulse.counts.watch} watch` : 'Feed reads clean'}
                tone={{ fg: IMPACT_META.Risk.fg, bg: IMPACT_META.Risk.bg }}
              />
              <HeroTile
                icon={TrendingUp}
                label="Opportunity Watch"
                value={pulse.latestOpportunity ? pulse.latestOpportunity.title : 'No fresh upside catalyst'}
                sub={pulse.counts.positive > 0 ? `${pulse.counts.positive} positive signal${pulse.counts.positive === 1 ? '' : 's'}` : undefined}
                tone={{ fg: IMPACT_META.Positive.fg, bg: IMPACT_META.Positive.bg }}
              />
              <HeroTile
                icon={BadgeCheck}
                label="Source Confidence · Freshness"
                value={`${pulse.confidence} confidence`}
                sub={`${pulse.freshnessLabel} · ${pulse.counts.sourced}/${pulse.counts.total} sourced`}
                tone={{ fg: conf.fg, bg: conf.bg }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Daily Signal Pulse ───────────────────────────────────────────── */}
      {!pulse.isEmpty && (
        <div>
          <SubHeading
            icon={Gauge}
            eyebrow="Daily Signal Pulse"
            title="The five reads to glance at first"
            note="Signal-based — no price or volume movement is implied unless a cited source reports it."
          />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <PulseCard icon={Sparkles} label="What changed" signal={pulse.freshest} emptyText="No new development on file." accent={GOLD} />
            <PulseCard icon={Activity} label="Moving fast" signal={pulse.movingFast[0] ?? null} emptyText="Nothing in the last 7 days." accent="#168E8E" />
            <PulseCard icon={ShieldAlert} label="Risk watch" signal={pulse.latestRisk} emptyText="No active risk flag." accent={IMPACT_META.Risk.fg} />
            <PulseCard icon={TrendingUp} label="Opportunity watch" signal={pulse.latestOpportunity} emptyText="No fresh upside catalyst." accent={IMPACT_META.Positive.fg} />
            <PulseCard icon={Radar} label="Data anomaly watch" signal={pulse.dataAnomalies[0] ? feed.find((s) => s.id === pulse.dataAnomalies[0].id) ?? null : null} emptyText="No reported data movement on record. We never infer a price or volume move." accent={GOLD} />
          </div>
        </div>
      )}

      {/* ── Curated Market Intelligence ──────────────────────────────────── */}
      {feed.length > 0 && (
        <div>
          <SubHeading
            icon={Radar}
            eyebrow="Curated Market Intelligence"
            title="What could move the name, ranked by what matters"
            note={`${feed.length} source-backed signal${feed.length === 1 ? '' : 's'} · ${company.shortName} & sector · curated, verify before acting`}
          />
          <ul className="space-y-2">
            {feedShown.map((s) => (
              <FeedItem key={s.id} signal={s} />
            ))}
          </ul>
          {feed.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllFeed((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy-primary hover:underline"
            >
              {showAllFeed ? 'Show fewer' : `Show all ${feed.length}`}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllFeed ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function SubHeading({ icon: Icon, eyebrow, title, note }: { icon: LucideIcon; eyebrow: string; title: string; note?: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-3 w-[3px] rounded-full bg-champagne" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">{eyebrow}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-navy-deep" strokeWidth={2} />
          <h2 className="font-display text-[19px] leading-tight text-navy-deep">{title}</h2>
        </span>
        {note && <span className="text-[11px] text-ink-secondary">{note}</span>}
      </div>
    </div>
  )
}
