import { Sparkles } from 'lucide-react'
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

      {/* Premium Engine — keeps the existing Flow / Mix / Retention chart untouched. */}
      <section className="card-surface p-5 sm:p-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF1F7] pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
              Premium Story
            </p>
            <h2 className="mt-1.5 font-display text-[20px] leading-tight text-navy-deep">
              Premium Engine
            </h2>
            <p className="mt-1 text-[12px] text-ink-secondary">
              How {company.shortName} writes, retains, and earns premium over time
            </p>
          </div>
        </header>
        <PremiumFlowQuality focalId={company.id} />
        <div className="mt-3 flex justify-end">
          <SourceTag source={PREMIUM_SOURCE.source} confidence={PREMIUM_SOURCE.confidence} provenance={PREMIUM_SOURCE.provenance} />
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
    <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)] sm:p-7">
      {/* Soft atmospheric tints, kept low-intensity. */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(182,139,58,0.10),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.08),transparent_65%)]" />

      {/* Left accent stroke — colour follows the signal tone. */}
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} />

      <div className="relative grid items-center gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DCC4] bg-[#FBF3E2]/70 px-2.5 py-1">
            <Sparkles className="h-3 w-3 text-champagne-deep" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
              {eyebrow}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[26px] leading-[1.18] tracking-tight text-navy-deep sm:text-[28px]">
              {verdict}
            </h1>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
              {badge}
            </span>
          </div>
        </div>

        <p className="text-[13.5px] leading-relaxed text-ink-secondary">{summary}</p>
      </div>
      <div className="relative mt-4 flex justify-end">
        <SourceTag source={source.source} confidence={source.confidence} provenance={source.provenance} />
      </div>
    </section>
  )
}

// ─── INVESTOR READ ─────────────────────────────────────────────────────────
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
    <section className="card-surface relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-14 -top-14 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.10),transparent_70%)]" />
      <header className="relative mb-3 flex items-center justify-between border-b border-[#EEF1F7] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            So What?
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            {companyName} · Growth Investor Read
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-2.5 py-1 text-[10.5px] font-semibold text-teal">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
          {signal}
        </span>
      </header>
      <div className="relative grid gap-2.5 sm:grid-cols-2">
        {lines.map((l) => (
          <div
            key={l.label}
            className="relative overflow-hidden rounded-xl border border-[#E4E8F0] bg-white/85 px-3.5 py-2.5"
          >
            <span className="absolute inset-y-0 left-0 w-[2.5px] bg-gradient-to-b from-teal to-champagne" />
            <p className="pl-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">
              {l.label}
            </p>
            <p className="mt-1 pl-1.5 text-[12.5px] leading-snug text-navy-deep">{l.value}</p>
          </div>
        ))}
      </div>
      <div className="relative mt-3 flex justify-end">
        <SourceTag source={source.source} confidence={source.confidence} provenance={source.provenance} />
      </div>
    </section>
  )
}
