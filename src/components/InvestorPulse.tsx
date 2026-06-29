import { useState } from 'react'
import {
  ShieldAlert,
  TrendingUp,
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
import { ManagementEventIntelligence } from '@/components/ManagementEventIntelligence'
import {
  CATEGORY_META,
  IMPACT_META,
  CONFIDENCE_META,
  type InvestorPulse as InvestorPulseData,
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

// ── compact company filter — the single company control for Insights (drives the
//    global `highlightedCompany`). A small dropdown, not a chip row. ───────────

export function CompanyFilter() {
  const active = useActiveCompany()
  const { setHighlightedCompany } = useFilters()
  return (
    <label className="group inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-soft-border bg-white px-2.5 py-1.5 shadow-soft transition-colors hover:border-muted-blue">
      <span className="text-[8.5px] font-bold uppercase tracking-[0.09em] text-ink-secondary">Company</span>
      <select
        value={active.id}
        onChange={(e) => setHighlightedCompany(e.target.value)}
        className="appearance-none bg-transparent pr-1 text-[12px] font-semibold text-navy-deep outline-none"
      >
        {SAHI.map((c) => (
          <option key={c.id} value={c.id}>
            {c.shortName}
          </option>
        ))}
      </select>
      <ChevronDown className="h-3 w-3 shrink-0 text-ink-secondary transition-colors group-hover:text-muted-blue" />
    </label>
  )
}

// ── signal card — title + one-line implication + impact/confidence + source ──

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
  return (
    <div className="flex flex-col rounded-xl border border-soft-border bg-card p-3 shadow-soft">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} strokeWidth={2.3} />
        <p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>{label}</p>
      </div>
      {signal ? (
        <div className="mt-2 flex flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-ink-secondary">
              <CalendarClock className="h-3 w-3" strokeWidth={2.2} />
              {signal.dateLabel}
            </span>
            <ImpactChip impact={signal.impact} />
            {signal.scope === 'sector' && <span className="rounded-full bg-soft-blue px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-navy-primary">Sector</span>}
            <ConfidenceDot confidence={signal.confidence} />
          </div>
          <p className="mt-1.5 text-[12px] font-semibold leading-snug text-navy-deep line-clamp-2">{signal.title}</p>
          {/* the one-line implication, always visible */}
          {signal.whyItMatters && <p className="mt-1 text-[11px] leading-snug text-ink-secondary line-clamp-2">{signal.whyItMatters}</p>}
          <div className="mt-auto pt-2">
            <SourceLink name={signal.sourceName} url={signal.sourceUrl} />
          </div>
        </div>
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

// ── Pulse — the compact senior-analyst daily read: Today's Read + 3 signal cards
//    + a short curated feed (top 3) + compact management events. ───────────────

export function PulseView({ pulse }: { pulse: InvestorPulseData }) {
  const [showAll, setShowAll] = useState(false)

  if (pulse.isEmpty) {
    return (
      <div className="rounded-2xl border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12.5px] text-ink-secondary">
        No major new source-backed signal today for {pulse.company}.
      </div>
    )
  }

  const feed = pulse.signals
  const feedShown = showAll ? feed : feed.slice(0, 3)
  const stance = pulse.todayRead?.stance ?? 'Neutral'
  const sm = STANCE_META[stance]
  const freshestDays = pulse.freshest?.daysAgo ?? null
  const stale = freshestDays != null && freshestDays > 14

  return (
    <div className="space-y-4">
      {/* Today's Read — one compact card */}
      {pulse.todayRead && (
        <div className="rounded-2xl border border-soft-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-navy-primary">Today&apos;s Read</p>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em]" style={{ color: sm.fg, background: sm.bg }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.fg }} /> {sm.label}
            </span>
          </div>
          <p className="mt-1.5 font-editorial text-[16px] font-semibold leading-snug text-navy-deep">{pulse.todayRead.headline}</p>
          <ul className="mt-2.5 space-y-1.5">
            <ReadBullet label="Changed" text={pulse.todayRead.changed} />
            <ReadBullet label="Matters" text={pulse.todayRead.matters} />
            <ReadBullet label="Watch next" text={pulse.todayRead.watchNext} />
          </ul>
          <p className="mt-2.5 border-t border-soft-border pt-2 text-[10px] font-medium text-ink-secondary">{pulse.todayRead.sourceLine}</p>
        </div>
      )}

      {/* Signal Summary — 3 compact cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <PulseCard icon={Zap} label="Fastest Signal" signal={pulse.freshest} emptyText="No fresh signal on file." accent={GOLD} />
        <PulseCard icon={ShieldAlert} label="Risk Watch" signal={pulse.latestRisk} emptyText="No active risk flag." accent={IMPACT_META.Risk.fg} />
        <PulseCard icon={TrendingUp} label="Opportunity Watch" signal={pulse.latestOpportunity} emptyText="No fresh upside catalyst." accent={IMPACT_META.Positive.fg} />
      </div>

      {/* Curated Market Intelligence — top 3, expandable */}
      {feed.length > 0 && (
        <div>
          <SubHeading
            icon={Radar}
            eyebrow="Curated Market Intelligence"
            title="Top signals, freshest first"
            note="Signal-based — no price or volume movement is implied unless a cited source reports it."
          />
          {stale && pulse.freshest && (
            <p className="mb-2 text-[10.5px] text-ink-secondary">
              Latest source-backed signal: <span className="font-semibold text-navy-deep">{pulse.freshest.dateLabel}</span>. No material new signal since then.
            </p>
          )}
          <ul className="space-y-2">
            {feedShown.map((s) => (
              <FeedItem key={s.id} signal={s} />
            ))}
          </ul>
          {feed.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy-primary hover:underline"
            >
              {showAll ? 'Show fewer' : `View all ${feed.length} signals`}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* Management & Event Intelligence — compact shared component (all events) */}
      <ManagementEventIntelligence variant="compact" title="Management & Events" companyId={pulse.companyId} companyName={pulse.company} />
    </div>
  )
}

// One labelled line of Today's Read — "Changed / Matters / Watch next".
function ReadBullet({ label, text }: { label: string; text: string }) {
  return (
    <li className="flex gap-2 text-[12.5px] leading-snug">
      <span className="mt-px w-[68px] shrink-0 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: GOLD }}>{label}</span>
      <span className="font-editorial text-ink-primary">{text}</span>
    </li>
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
