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
  Globe,
  Eye,
  ShieldCheck,
  PenLine,
  Layers,
  Gauge,
  Target,
  Network,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { insurers } from '@/data/mockData'
import { useActiveCompany, useFilters } from '@/state/filters'
import {
  selectManagementEvents,
  CATEGORY_META,
  IMPACT_META,
  CONFIDENCE_META,
  type InvestorPulse as InvestorPulseData,
  type PulseSignal,
  type PulseManagementEvent,
  type SignalCategory,
  type SignalImpact,
  type InsightLens,
  type Confidence,
} from '@/insights/investorPulse'

const GOLD = '#B68B3A'
// A warmer, lighter gold that stays legible on the deep-navy hero.
const GOLD_ON_NAVY = '#E4C67C'
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

const EVENT_DOT: Record<string, string> = {
  appointment: '#168E8E',
  reappointment: '#168E8E',
  resignation: '#C0584F',
  termination: '#C0584F',
  kmp_change: '#27457E',
  board_change: '#27457E',
  auditor_change: '#6E5BA6',
  authorization: '#8C97A8',
  esop: '#B68B3A',
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
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ color: m.fg, background: m.bg, boxShadow: `inset 0 0 0 1px ${m.dot}33` }}>
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

// ── Today's Read — the deep-navy editorial hero. Soft blue radial blob + a single
//    warm-gold corner accent inside the card; gold serif headline; white body;
//    Changed / Matters / Watch-next on tinted icon rows; source line at the foot.

function ReadRow({ icon: Icon, label, text, tint, fg }: { icon: LucideIcon; label: string; text: string; tint: string; fg: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2 first:pt-0" style={{ borderTop: '1px solid rgba(228,198,124,0.10)' }}>
      <span className="icon-ring-gold-dark mt-px grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: tint }}>
        <Icon className="h-4 w-4" strokeWidth={2.1} style={{ color: fg }} />
      </span>
      <p className="w-[78px] shrink-0 pt-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: GOLD_ON_NAVY }}>{label}</p>
      <p className="flex-1 pt-0.5 font-editorial text-[13px] leading-snug text-white/85">{text}</p>
    </div>
  )
}

function TodaysReadHero({ pulse }: { pulse: InvestorPulseData }) {
  const tr = pulse.todayRead
  if (!tr) return null
  const sm = STANCE_META[tr.stance]
  return (
    <section className="relative isolate flex flex-col overflow-hidden rounded-2xl p-5 shadow-card" style={{ background: 'linear-gradient(150deg, #1C3A6E 0%, #15294C 58%, #102140 100%)' }}>
      {/* Layered premium detailing, contained inside the card:
          light bloom · navy-on-navy tonal blobs · a blended gold wave from the
          lower-right · a fine gold spark texture in the corner. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* soft radial light bloom, upper area */}
        <div className="absolute -top-14 left-6 h-64 w-96 opacity-70 blur-3xl" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(132,170,230,0.34), transparent 70%)' }} />
        {/* navy-on-navy tonal blobs — stronger, curved texture */}
        <div className="blob-b absolute right-2 -top-24 h-80 w-80 opacity-90 blur-2xl" style={{ background: 'radial-gradient(circle at 40% 40%, rgba(86,130,202,0.5), transparent 72%)' }} />
        <div className="blob-c absolute -left-24 -bottom-16 h-80 w-80 opacity-90 blur-2xl" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(44,80,146,0.62), transparent 72%)' }} />
        <div className="blob-a absolute left-1/3 top-10 h-56 w-72 opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(60,98,168,0.34), transparent 72%)' }} />

        {/* GOLD WAVE — a defined, metallic gold shape sweeping in from the
            lower-right. A soft bloom for depth, the wave body in a gold
            gradient, and a champagne rim highlight along the crest. */}
        <div className="absolute -bottom-3 right-0 h-[82%] w-[60%]">
          <div className="absolute inset-0 blur-2xl" style={{ background: 'radial-gradient(ellipse at 86% 92%, rgba(216,172,88,0.6), rgba(182,139,58,0.2) 44%, transparent 70%)' }} />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none" style={{ filter: 'blur(1.5px)' }}>
            <defs>
              <linearGradient id="tr-goldWave" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F1DDA8" stopOpacity="0" />
                <stop offset="34%" stopColor="#E2BE74" stopOpacity="0.42" />
                <stop offset="68%" stopColor="#C69C4E" stopOpacity="0.68" />
                <stop offset="100%" stopColor="#A57C33" stopOpacity="0.85" />
              </linearGradient>
              <linearGradient id="tr-goldRim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F6E7BE" stopOpacity="0" />
                <stop offset="62%" stopColor="#F4E3B2" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#FBF1CF" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <path d="M400,300 L400,34 C322,52 300,150 208,202 C146,237 66,252 0,300 Z" fill="url(#tr-goldWave)" />
            <path d="M400,34 C322,52 300,150 208,202 C146,237 66,252 0,300" fill="none" stroke="url(#tr-goldRim)" strokeWidth="2.25" />
          </svg>
        </div>

        {/* fine gold spark texture, lower-right corner */}
        <div className="gold-sparks absolute bottom-3 right-4 h-24 w-32 opacity-60" style={{ maskImage: 'radial-gradient(circle at 82% 82%, black, transparent 74%)', WebkitMaskImage: 'radial-gradient(circle at 82% 82%, black, transparent 74%)' }} />
      </div>

      {/* hairline gold top edge — a quiet premium frame detail */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(228,198,124,0.45) 30%, rgba(228,198,124,0.45) 70%, transparent)' }} />

      {/* eyebrow + stance */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="icon-ring-gold-dark grid h-8 w-8 place-items-center rounded-full" style={{ background: 'rgba(228,198,124,0.12)' }}>
            <PenLine className="h-4 w-4" style={{ color: GOLD_ON_NAVY }} strokeWidth={2} />
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD_ON_NAVY }}>Today&apos;s Read</span>
            <span className="gold-rule h-px w-9 rounded-full" />
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-white/90" style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(228,198,124,0.22)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.fg }} /> {sm.label}
        </span>
      </div>

      {/* gold serif headline — same display serif as the "Insights" page title */}
      <h2 className="mt-3 font-display text-[21px] font-semibold leading-[1.2] tracking-[0.002em]" style={{ color: GOLD_ON_NAVY }}>
        {tr.headline}
      </h2>

      {/* changed / matters / watch-next */}
      <div className="mt-3">
        <ReadRow icon={Zap} label="Changed" text={tr.changed} tint="rgba(228,198,124,0.14)" fg={GOLD_ON_NAVY} />
        <ReadRow icon={ShieldCheck} label="Matters" text={tr.matters} tint="rgba(255,255,255,0.08)" fg="#CFE0F5" />
        <ReadRow icon={Eye} label="Watch Next" text={tr.watchNext} tint="rgba(56,168,162,0.16)" fg="#6FD0CB" />
      </div>

      {/* source / freshness foot — small gold icon + fine separator rhythm */}
      <div className="mt-3.5 flex items-center gap-2 pt-3 text-[10.5px] font-medium text-white/60" style={{ borderTop: '1px solid rgba(228,198,124,0.16)' }}>
        <span className="icon-ring-gold-dark grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(228,198,124,0.10)' }}>
          <Globe className="h-3 w-3" strokeWidth={2.1} style={{ color: 'rgba(228,198,124,0.9)' }} />
        </span>
        <span className="tracking-[0.01em]">{tr.sourceLine}</span>
      </div>
    </section>
  )
}

// ── Signal Stack — vertical panel (navy top bar + 3 alert rows) on the right of
//    Today's Read. Fastest Signal · Risk Watch · Opportunity Watch. ────────────

function SignalStackRow({ icon: Icon, label, signal, emptyText, accent, tint, ringClass }: {
  icon: LucideIcon
  label: string
  signal: PulseSignal | null
  emptyText: string
  accent: string
  tint: string
  ringClass: string
}) {
  return (
    <div className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-ice/40">
      <span className={`${ringClass} mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full`} style={{ background: tint }}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} style={{ color: accent }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{label}</p>
        {signal ? (
          <>
            <p className="mt-1 text-[12.5px] font-semibold leading-snug text-navy-deep line-clamp-2">{signal.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-ink-secondary">
                <CalendarClock className="h-3 w-3" strokeWidth={2.2} />
                {signal.dateLabel}
              </span>
              <ImpactChip impact={signal.impact} />
              <ConfidenceDot confidence={signal.confidence} />
            </div>
            <div className="mt-1.5">
              <SourceLink name={signal.sourceName} url={signal.sourceUrl} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-ink-secondary">{emptyText}</p>
        )}
      </div>
    </div>
  )
}

function SignalStack({ pulse }: { pulse: InvestorPulseData }) {
  return (
    <section className="premium-panel flex flex-col overflow-hidden rounded-2xl">
      <div className="relative flex items-center gap-2 px-4 py-2.5" style={{ background: 'linear-gradient(135deg, #1E4079 0%, #152C52 100%)' }}>
        <span className="icon-ring-gold-dark grid h-6 w-6 place-items-center rounded-md" style={{ background: 'rgba(228,198,124,0.12)' }}>
          <Layers className="h-3.5 w-3.5" strokeWidth={2.1} style={{ color: GOLD_ON_NAVY }} />
        </span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">Signal Stack</h3>
        {/* gold hairline base of the navy header */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(228,198,124,0.5), transparent)' }} />
      </div>
      <div className="flex flex-1 flex-col divide-y divide-soft-border">
        <SignalStackRow icon={Zap} label="Fastest Signal" signal={pulse.freshest} emptyText="No fresh signal on file." accent={GOLD} tint="rgba(182,139,58,0.12)" ringClass="icon-ring-gold" />
        <SignalStackRow icon={ShieldAlert} label="Risk Watch" signal={pulse.latestRisk} emptyText="No active risk flag." accent={IMPACT_META.Risk.fg} tint="rgba(192,88,79,0.10)" ringClass="icon-ring-soft" />
        <SignalStackRow icon={TrendingUp} label="Opportunity Watch" signal={pulse.latestOpportunity} emptyText="No fresh upside catalyst." accent={IMPACT_META.Positive.fg} tint="rgba(22,142,142,0.10)" ringClass="icon-ring-soft" />
      </div>
    </section>
  )
}

// ── Curated Market Intelligence — a compact analyst table (Date · Category ·
//    Signal · Impact · Confidence · Source), top 3, click a row for "why it
//    matters", expandable to the full feed. ───────────────────────────────────

function CuratedRow({ signal }: { signal: PulseSignal }) {
  const [open, setOpen] = useState(false)
  return (
    <tr className="group cursor-pointer align-top transition-colors hover:bg-ice/60" style={{ borderTop: '1px solid rgba(39,69,126,0.07)' }} onClick={() => setOpen((v) => !v)}>
        <td className="whitespace-nowrap py-3 pl-4 pr-3 text-[10.5px] font-semibold text-ink-secondary">{signal.dateLabel}</td>
        <td className="py-3 pr-3"><CategoryChip category={signal.category} /></td>
        <td className="py-3 pr-3">
          <span className="text-[12.5px] font-semibold leading-snug text-navy-deep">{signal.title}</span>
          {signal.scope === 'sector' && <span className="ml-1.5 rounded-full bg-soft-blue px-1.5 py-0.5 align-middle text-[8px] font-bold uppercase tracking-wide text-navy-primary">Sector</span>}
          {open && signal.whyItMatters && (
            <p className="mt-1 max-w-2xl text-[11px] leading-snug text-ink-secondary">
              <span className="font-semibold text-navy-deep/70">Why it matters: </span>{signal.whyItMatters}
            </p>
          )}
        </td>
        <td className="py-3 pr-3"><ImpactChip impact={signal.impact} /></td>
        <td className="py-3 pr-3"><ConfidenceDot confidence={signal.confidence} /></td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            <SourceLink name={signal.sourceName} url={signal.sourceUrl} />
            {signal.whyItMatters && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />}
          </div>
        </td>
      </tr>
  )
}

function CuratedIntelligence({ pulse }: { pulse: InvestorPulseData }) {
  const [showAll, setShowAll] = useState(false)
  const feed = pulse.signals
  if (feed.length === 0) return null
  const shown = showAll ? feed : feed.slice(0, 3)
  const freshestDays = pulse.freshest?.daysAgo ?? null
  const stale = freshestDays != null && freshestDays > 14
  return (
    <section className="premium-panel overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2.5 pt-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="h-3 w-[3px] rounded-full bg-champagne" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Curated Market Intelligence</span>
            <span className="gold-rule h-px w-8 rounded-full" />
          </div>
          <h2 className="font-display text-[16px] leading-tight text-navy-deep">Top signals, ranked by freshness then impact.</h2>
        </div>
        {feed.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="group inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-champagne-deep transition-colors hover:text-navy-deep"
          >
            {showAll ? 'Show fewer' : 'View all signals'}
            {showAll
              ? <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              : <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
          </button>
        )}
      </div>
      {stale && pulse.freshest && (
        <p className="px-4 pb-2 text-[10.5px] text-ink-secondary">
          Latest source-backed signal: <span className="font-semibold text-navy-deep">{pulse.freshest.dateLabel}</span>. No material new signal since then.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="bg-surface-tint/70" style={{ borderTop: '1px solid rgba(39,69,126,0.10)', borderBottom: '1px solid rgba(182,139,58,0.28)' }}>
              {['Date', 'Category', 'Signal', 'Impact', 'Confidence', 'Source'].map((h, i) => (
                <th key={h} className={`py-2.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary ${i === 0 ? 'pl-4 pr-3' : i === 5 ? 'pr-4' : 'pr-3'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <CuratedRow key={s.id} signal={s} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Management & Event Intelligence — compact right-side timeline module. Same
//    data path (selectManagementEvents); 2 events visible, expandable; a thin
//    gold timeline rule connects the date blocks. ──────────────────────────────

function EventTimelineRow({ e, last }: { e: PulseManagementEvent; last: boolean }) {
  const dot = EVENT_DOT[e.eventType] ?? '#27457E'
  const [d, mon] = e.dateLabel.split(' ')
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* date tile — gold-ringed, with a fine gold cap stripe */}
      <div className="icon-ring-gold relative z-[1] flex h-11 w-11 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg bg-white">
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'linear-gradient(90deg, rgba(182,139,58,0.85), rgba(182,139,58,0.4))' }} />
        <span className="mt-0.5 text-[14px] font-bold leading-none text-navy-deep">{d}</span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-champagne-deep">{mon}</span>
      </div>
      {/* gold connector dot at the line junction */}
      {!last && <span className="absolute left-[17px] top-[42px] z-[1] h-2 w-2 rounded-full" style={{ background: '#B68B3A', boxShadow: '0 0 0 2px #fff' }} />}
      <div className="min-w-0 flex-1 pt-0.5">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.05em]" style={{ color: IMPACT_META[e.impact].fg, background: IMPACT_META[e.impact].bg }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
          {e.eventLabel}
        </span>
        {(e.person || e.designation) && (
          <p className="mt-1 text-[12px] font-semibold leading-snug text-navy-deep">
            {e.person}
            {e.person && e.designation ? ' · ' : ''}
            {e.designation && <span className="font-normal text-ink-secondary">{e.designation}</span>}
          </p>
        )}
        {e.summary && <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary line-clamp-2">{e.summary}</p>}
        {e.sourceUrl && (
          <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-navy-primary hover:underline">
            {e.sourceName}<ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {!last && <span className="absolute left-[21px] top-11 bottom-0 w-px" style={{ background: 'linear-gradient(180deg, rgba(182,139,58,0.45), rgba(182,139,58,0.10))' }} />}
    </li>
  )
}

function ManagementEvents({ pulse }: { pulse: InvestorPulseData }) {
  const [showAll, setShowAll] = useState(false)
  const events = selectManagementEvents(pulse.companyId, {})
  const shown = showAll ? events : events.slice(0, 2)
  return (
    <section className="premium-panel flex flex-col rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 border-b border-soft-border/70 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="icon-ring-gold grid h-6 w-6 place-items-center rounded-md" style={{ background: 'rgba(182,139,58,0.12)' }}>
            <Users className="h-3.5 w-3.5 text-champagne-deep" strokeWidth={2.1} />
          </span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-navy-deep">Management &amp; Event Intelligence</h3>
          <span className="gold-rule h-px w-6 rounded-full" />
        </div>
        {events.length > 0 && <span className="shrink-0 text-[9.5px] font-semibold text-ink-secondary">{events.length} on record</span>}
      </div>
      {events.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-soft-border bg-ice/40 px-3 py-6 text-center text-[11px] text-ink-secondary">
          No board, KMP or leadership changes on record for {pulse.company}. New events appear here automatically as filings are ingested.
        </div>
      ) : (
        <>
          <ul className="relative mt-3.5">
            {shown.map((e, i) => (
              <EventTimelineRow key={e.id} e={e} last={i === shown.length - 1} />
            ))}
          </ul>
          {events.length > 2 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="group mt-1 inline-flex items-center gap-1.5 self-start text-[11px] font-semibold text-champagne-deep transition-colors hover:text-navy-deep"
            >
              {showAll ? 'Show fewer' : 'View all events'}
              {showAll
                ? <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                : <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
            </button>
          )}
        </>
      )}
    </section>
  )
}

// ── Broader Signals & Correlations — a senior-analyst thought layer that frames
//    today's signal against the longer-term sector / regulatory / profitability
//    backdrop. NOT a news feed: each card reuses a source-backed analytical lens
//    (the same data wired into Data Insights) — never a fabricated claim. When a
//    lens lacks verified data, the card says so and drops to Low confidence. ────

type BroaderCard = {
  eyebrow: string
  icon: LucideIcon
  headline: string
  bullets: string[]
  stance: SignalImpact
  confidence: Confidence
  src: { name: string; url: string } | null
  asOf?: string
}

function cardFromLens(eyebrow: string, icon: LucideIcon, lens: InsightLens): BroaderCard {
  const headline = lens.available && lens.oneLineRead ? lens.oneLineRead : lens.purpose
  const raw = lens.keyInsights.length ? lens.keyInsights : lens.missedSignals.length ? lens.missedSignals : lens.watchNext
  let bullets = raw.slice(0, 2)
  const needsConfirm = !lens.available || bullets.length === 0
  if (bullets.length === 0) bullets = ['Needs confirmation from next reported data.']
  return {
    eyebrow,
    icon,
    headline,
    bullets,
    stance: lens.stance,
    confidence: needsConfirm ? 'Low' : lens.confidence,
    src: lens.sourceRefs[0] ?? null,
    asOf: lens.asOf,
  }
}

function BroaderCardView({ card }: { card: BroaderCard }) {
  const Icon = card.icon
  const m = IMPACT_META[card.stance]
  const c = CONFIDENCE_META[card.confidence]
  return (
    <article className="premium-panel flex flex-col rounded-2xl p-4 transition-shadow hover-lift">
      <div className="flex items-center gap-2">
        <span className="icon-ring-gold grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: 'rgba(182,139,58,0.12)' }}>
          <Icon className="h-4 w-4 text-champagne-deep" strokeWidth={2} />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{card.eyebrow}</p>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.05em]" style={{ color: m.fg, background: m.bg }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
        </span>
      </div>
      <h4 className="mt-2 text-[13px] font-semibold leading-snug text-navy-deep">{card.headline}</h4>
      <ul className="mt-2 space-y-1.5">
        {card.bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-ink-secondary">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-champagne" />
            <span className="line-clamp-3">{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[9.5px] text-ink-secondary">
        {card.src?.url ? (
          <a href={card.src.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-primary hover:underline">
            {card.src.name}<ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <span className="font-medium text-ink-secondary">{card.src?.name ?? 'Wired dashboard data'}</span>
        )}
        {card.asOf && <span className="text-ink-secondary">· {card.asOf}</span>}
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: c.fg }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.fg }} />{card.confidence} confidence
        </span>
      </div>
    </article>
  )
}

function BroaderSignals({ pulse }: { pulse: InvestorPulseData }) {
  const cards: BroaderCard[] = [
    cardFromLens('Sector Context', Landmark, pulse.lenses.riskRegulatoryChanges),
    cardFromLens('Profitability Link', Gauge, pulse.lenses.underwritingProfitability),
    cardFromLens('Investment Thesis Read', Target, pulse.lenses.forwardLookingStrategy),
  ]
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-soft-border bg-surface-tint/60 p-4 shadow-soft section-wash">
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Broader Signals &amp; Correlations</span>
          <span className="gold-rule h-px w-8 rounded-full" />
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="flex items-center gap-2">
            <Network className="h-4 w-4 text-navy-deep" strokeWidth={2} />
            <h2 className="font-display text-[16px] leading-tight text-navy-deep">The longer-term picture behind today&apos;s read.</h2>
          </span>
          <span className="text-[11px] leading-snug text-ink-secondary">Longer-term Indian insurance, regulatory and profitability links behind today&apos;s signals.</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <BroaderCardView key={card.eyebrow} card={card} />
        ))}
      </div>
    </section>
  )
}

// ── Data Anomaly Watch — no big card when clean: a quiet footer note only. ─────

function AnomalyFooter({ pulse }: { pulse: InvestorPulseData }) {
  const anomalies = pulse.dataAnomalies
  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(39,69,126,0.12))' }} />
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10.5px] text-ink-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-teal" strokeWidth={2} />
          No material data anomalies detected in latest update.
        </span>
        <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(39,69,126,0.12), transparent)' }} />
      </div>
    )
  }
  return (
    <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'linear-gradient(135deg, rgba(248,236,236,0.7), rgba(250,242,242,0.5))', boxShadow: 'inset 0 0 0 1px rgba(199,93,84,0.26)' }}>
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: 'rgba(199,93,84,0.10)', boxShadow: 'inset 0 0 0 1px rgba(199,93,84,0.30)' }}>
          <ShieldAlert className="h-3 w-3 text-coral" strokeWidth={2.1} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-coral">Data Anomaly Watch · {anomalies.length}</span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {anomalies.slice(0, 3).map((a) => (
          <li key={a.id} className="flex items-baseline gap-2 text-[11px] text-ink-primary">
            <span className="font-semibold text-navy-deep">{a.dateLabel}</span>
            <span className="text-ink-secondary">{a.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Pulse — the senior-analyst daily read. Two-column cockpit: Today's Read hero
//    (65%) + Signal Stack (35%), then Curated Market Intelligence (65%) +
//    Management & Event Intelligence (35%), and a quiet anomaly footer. ─────────

export function PulseView({ pulse }: { pulse: InvestorPulseData }) {
  if (pulse.isEmpty) {
    return (
      <div className="rounded-2xl border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12.5px] text-ink-secondary">
        No major new source-backed signal today for {pulse.company}.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Row 1 — Today's Read hero (65%) + Signal Stack (35%) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <TodaysReadHero pulse={pulse} />
        <SignalStack pulse={pulse} />
      </div>

      {/* Row 2 — Curated Market Intelligence (65%) + Management Events (35%) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <CuratedIntelligence pulse={pulse} />
        <ManagementEvents pulse={pulse} />
      </div>

      {/* Broader Signals & Correlations — the senior-analyst thought layer */}
      <BroaderSignals pulse={pulse} />

      {/* Data Anomaly Watch — quiet footer when clean, compact list when present */}
      <AnomalyFooter pulse={pulse} />
    </div>
  )
}
