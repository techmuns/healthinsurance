import { BookOpen, Lightbulb, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react'
import { PremiumFlowQuality } from '@/components/PremiumFlowQuality'
import { QuarterlyCalcCard } from '@/components/QuarterlyCalcCard'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany } from '@/state/filters'
import { getCompanyGrowthCopy } from '@/lib/companyCopy'
import type { ReadLine } from '@/lib/companyCopy'

// Per-company provenance — Niva Bupa / Star Health / Aditya Birla numbers
// come directly from each company's press release / annual report. Care
// Health and ManipalCigna FY25 values are derived from IRDAI public
// disclosures via Cafemutual / disclosure-aggregator citations until the
// L-form PDF parser lands.
function getPremiumSource(companyId: string) {
  if (companyId === 'care-health' || companyId === 'manipalcigna') {
    return {
      source: 'Derived from IRDAI' as const,
      confidence: 'medium' as const,
      provenance: {
        source_name:
          companyId === 'care-health'
            ? 'Care Health FY25 Public Disclosures (IRDAI format), re-aggregated by UnlistedZone / Chryseum'
            : 'Cafemutual non-life FY26 ranking citing IRDAI segment data',
        source_url:
          companyId === 'care-health'
            ? 'https://www.careinsurance.com/public-disclosures.html'
            : 'https://cafemutual.com/news/insurance/37556-who-are-the-top-non-life-insurers-of-fy26',
        fetched_at: '2026-05-28',
      },
    }
  }
  return {
    source: 'Company filing' as const,
    confidence: 'high' as const,
    provenance: {
      source_name: 'FY25 GWP / PAT / combined ratio / solvency from company press release',
      source_url:
        companyId === 'star-health'
          ? 'https://www.businessupturn.com/business/corporates/star-health-insurance-posts-rs-787-crore-profit-in-fy25-gwp-grows-10-to-rs-16781-crore/'
          : companyId === 'aditya-birla'
            ? 'https://www.adityabirla.com/media/press-releases/aditya-birla-capital-announces-q4fy25-and-fy25-results/'
            : 'https://transactions.nivabupa.com/pages/doc/investor-relations/other-fin-disclosures/Press-Release-Results-March-2025.pdf',
      fetched_at: '2026-05-28',
    },
  }
}

export function CompanyGrowthEngine() {
  const company = useActiveCompany()
  const copy = getCompanyGrowthCopy(company)
  const PREMIUM_SOURCE = getPremiumSource(company.id)

  return (
    <div className="space-y-5">
      <HeroCard
        eyebrow={copy.eyebrow}
        verdict={copy.verdict}
        badge={copy.badge}
        summary={copy.summary}
        tone={copy.tone}
        source={PREMIUM_SOURCE}
      />

      {/* Premium Engine — keeps the existing Flow / Mix / Retention chart untouched.
          Card surface gets a subtle navy + teal tinted backdrop so it reads as
          the "premium machine" panel rather than a plain white container. */}
      <section
        className="relative overflow-hidden rounded-[1.15rem] border border-[#E4E8F0] p-5 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_14px_36px_rgba(23,43,77,0.07)] sm:p-6"
        style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F7FAFD 60%, #F1F8F6 100%)' }}
      >
        <span
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(22,142,142,0.14) 0%, transparent 70%)' }}
        />
        <span
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full opacity-50 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(49,90,169,0.12) 0%, transparent 70%)' }}
        />
        <header className="relative mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF1F7] pb-4">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-champagne shadow-[0_0_6px_rgba(182,139,58,0.6)]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
                Premium Story
              </p>
            </div>
            <h2 className="mt-1.5 font-display text-[20px] leading-tight text-navy-deep">
              Premium Engine
            </h2>
            <p className="mt-1 text-[12px] text-ink-secondary">
              How <span className="font-semibold text-navy-deep">{company.shortName}</span> writes,
              retains, and earns premium over time
            </p>
          </div>
        </header>
        <div className="relative">
          <PremiumFlowQuality focalId={company.id} />
        </div>
      </section>

      {/* Calculation basis strip for the derived-quarter logic. */}
      <QuarterlyCalcCard company={company} />

      {/* Light, premium investor read — replaces the heavy navy InsightBox panel. */}
      <GrowthInvestorRead
        signal={copy.badge}
        lines={copy.readLines}
        companyName={company.shortName}
        source={PREMIUM_SOURCE}
      />
    </div>
  )
}

type PremiumSourcePack = ReturnType<typeof getPremiumSource>

// ─── HERO CARD ─────────────────────────────────────────────────────────────
function HeroCard({
  eyebrow,
  verdict,
  badge,
  summary,
  tone,
  source,
}: {
  eyebrow: string
  verdict: string
  badge: string
  summary: string
  tone: 'teal' | 'navy' | 'positive' | 'warning' | 'negative'
  source: PremiumSourcePack
}) {
  const accent =
    tone === 'teal' || tone === 'positive'
      ? '#168E8E'
      : tone === 'warning'
        ? '#B68B3A'
        : tone === 'negative'
          ? '#B94A48'
          : '#27457E'
  const badgeClass =
    tone === 'teal' || tone === 'positive'
      ? 'bg-teal-soft text-teal'
      : tone === 'warning'
        ? 'bg-champagne-soft text-champagne-deep'
        : tone === 'negative'
          ? 'bg-coral-soft text-coral'
          : 'bg-soft-blue text-navy-primary'

  return (
    <section
      className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)] sm:p-7"
      style={{ background: 'linear-gradient(135deg, #F4FAF8 0%, #FAFCFE 50%, #F5F0E1 100%)' }}
    >
      {/* Layered atmospheric tints — teal growth glow + champagne quality glow. */}
      <span className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(182,139,58,0.18),transparent_65%)]" />
      <span className="pointer-events-none absolute -bottom-28 -left-16 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.14),transparent_65%)]" />
      <span className="pointer-events-none absolute right-10 bottom-6 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(49,90,169,0.10),transparent_65%)]" />

      {/* Left accent stroke — gradient from signal tone into champagne so the
          hero reads as "discipline + quality". */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: `linear-gradient(180deg, ${accent} 0%, #B68B3A 100%)` }}
      />

      <div className="relative grid items-center gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DCC4] bg-[#FBF3E2]/80 px-2.5 py-1 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 text-champagne-deep" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
                {eyebrow}
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#BFE3E1] bg-teal-soft px-2.5 py-1 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_6px_rgba(22,142,142,0.6)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">
                Quality growth
              </span>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[26px] leading-[1.18] tracking-tight text-navy-deep sm:text-[28px]">
              {verdict}
            </h1>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-soft ${badgeClass}`}>
              {badge}
            </span>
          </div>
        </div>

        <p className="text-[13.5px] leading-relaxed text-navy-deep/85">{summary}</p>
      </div>
      <div className="relative mt-4 flex justify-end">
        <SourceTag source={source.source} confidence={source.confidence} provenance={source.provenance} />
      </div>
    </section>
  )
}

// ─── INVESTOR READ ─────────────────────────────────────────────────────────
// 4 lanes tinted per tone: Why = navy logic, Implication = teal positive,
// Watch = amber/champagne caution, Read = champagne investor conclusion.
// Matches by lane order (Why / Implication / Watch / Read) — falls back to
// label-keyword detection so the lanes don't lose their meaning if copy
// changes the order.
const laneTone: Record<string, { icon: typeof Lightbulb; bg: string; border: string; bar: string; label: string; iconColor: string; ring: string }> = {
  Why: {
    icon: Lightbulb,
    bg: 'linear-gradient(135deg, #F2F5FC 0%, #E6EEFA 100%)',
    border: '#D2DEF1',
    bar: '#27457E',
    label: 'text-navy-primary',
    iconColor: '#27457E',
    ring: 'rgba(49,90,169,0.30)',
  },
  Implication: {
    icon: TrendingUp,
    bg: 'linear-gradient(135deg, #F1F8F6 0%, #E1F2F1 100%)',
    border: '#BFE3E1',
    bar: '#168E8E',
    label: 'text-teal',
    iconColor: '#168E8E',
    ring: 'rgba(22,142,142,0.30)',
  },
  Watch: {
    icon: ShieldAlert,
    bg: 'linear-gradient(135deg, #FDF6E5 0%, #F4E5C0 100%)',
    border: '#EAD9B6',
    bar: '#B7791F',
    label: 'text-[#8C6B1A]',
    iconColor: '#B7791F',
    ring: 'rgba(183,121,31,0.30)',
  },
  Read: {
    icon: BookOpen,
    bg: 'linear-gradient(135deg, #FBF6EA 0%, #F4ECDB 100%)',
    border: '#EAD9B6',
    bar: '#B68B3A',
    label: 'text-champagne-deep',
    iconColor: '#B68B3A',
    ring: 'rgba(182,139,58,0.30)',
  },
}

function GrowthInvestorRead({
  signal,
  lines,
  companyName,
  source,
}: {
  signal: string
  lines: ReadLine[]
  companyName: string
  source: PremiumSourcePack
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[1.15rem] border border-[#E4E8F0] p-5 shadow-[0_1px_2px_rgba(23,43,77,0.03),0_10px_28px_rgba(23,43,77,0.06)]"
      style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #FBFCFE 60%, #F7FAFD 100%)' }}
    >
      <span
        className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(182,139,58,0.16) 0%, transparent 70%)' }}
      />
      <span
        className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(22,142,142,0.14) 0%, transparent 70%)' }}
      />

      <header className="relative mb-3 flex items-center justify-between border-b border-[#EEF1F7] pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne shadow-[0_0_6px_rgba(182,139,58,0.6)]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
              So What?
            </p>
          </div>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            {companyName} · Growth Investor Read
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-2.5 py-1 text-[10.5px] font-semibold text-teal shadow-soft ring-1 ring-[#BFE3E1]">
          <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_6px_rgba(22,142,142,0.55)]" />
          {signal}
        </span>
      </header>
      <div className="relative grid gap-2.5 sm:grid-cols-2">
        {lines.map((l) => {
          // Lookup by exact label first; fall back to keyword match so we still
          // tint correctly if the copy uses "Investor read" instead of "Read".
          const key = laneTone[l.label]
            ? l.label
            : /watch/i.test(l.label)
              ? 'Watch'
              : /read/i.test(l.label)
                ? 'Read'
                : /implic/i.test(l.label)
                  ? 'Implication'
                  : 'Why'
          const tone = laneTone[key]
          const Icon = tone.icon
          return (
            <div
              key={l.label}
              className="group relative overflow-hidden rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(23,43,77,0.08)]"
              style={{ background: tone.bg, borderColor: tone.border }}
            >
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone.bar }} />
              <div className="flex items-center gap-2 pl-1.5">
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white shadow-soft"
                  style={{ boxShadow: `inset 0 0 0 1px ${tone.ring}`, color: tone.iconColor }}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${tone.label}`}>{l.label}</p>
              </div>
              <p className="mt-1.5 pl-1.5 text-[12.5px] leading-snug text-navy-deep/90">{l.value}</p>
            </div>
          )
        })}
      </div>
      <div className="relative mt-3 flex justify-end">
        <SourceTag source={source.source} confidence={source.confidence} provenance={source.provenance} />
      </div>
    </section>
  )
}
