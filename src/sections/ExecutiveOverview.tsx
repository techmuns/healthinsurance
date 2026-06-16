import { BadgeCheck, Clock, ShieldCheck } from 'lucide-react'
import { IndustrySnapshotBand } from '@/components/IndustrySnapshotBand'
import { PoolShiftCard } from '@/sections/MarketDistribution'
import { AboutView } from '@/components/AboutView'
import { SignalBadge } from '@/components/SignalBadge'
import { HeaderRibbonArt } from '@/components/HeaderRibbonArt'
import { useFilters } from '@/state/filters'
import { DATA_FRESHNESS } from '@/data/mockData'
import { industryDataLastUpdated } from '@/lib/industryStructure'

const FY = 'FY25'

// The hero's "Updated" stamp should reflect THIS page's data — the industry-
// structure snapshots sweep every 3 days, fresher than the app-wide annual
// freshness. Show the later of the two so the date is never behind what's on screen.
const INDUSTRY_UPDATED =
  [DATA_FRESHNESS.lastUpdated, industryDataLastUpdated]
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? DATA_FRESHNESS.lastUpdated

// Industry Insights homepage layer: hero + market-structure snapshot + the
// premium-pool shift. No peer/company cards, no selectors — the company-specific
// peer analysis now lives in SAHI Analysis › Peer Positioning.
export function ExecutiveOverview() {
  const filters = useFilters()
  const { period } = filters
  const annualBasisNote = period !== 'Annual'

  return (
    <div className="space-y-4">
      <HeroHeader period={period} annualBasisNote={annualBasisNote} />
      <IndustrySnapshotBand />
      <PoolShiftCard />
    </div>
  )
}

// Compact, filter-aware hero — layered navy → champagne backdrop with the
// petal end-cap art, the highlighted-company chip, and the data-status chips.
function HeroHeader({
  highlightName,
  period,
  annualBasisNote,
}: {
  highlightName?: string
  period: string
  annualBasisNote: boolean
}) {
  return (
    <header className="card-surface relative min-h-[170px] overflow-hidden rounded-[28px] px-5 py-5 sm:px-6">
      <HeaderRibbonArt />
      {/* Layered ambient backdrop: subtle navy gradient + champagne glow + teal accent */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            'radial-gradient(circle at 12% 25%, rgba(238,244,255,0.7) 0%, transparent 50%), radial-gradient(circle at 92% 90%, rgba(244,236,219,0.65) 0%, transparent 55%), radial-gradient(circle at 75% 15%, rgba(225,242,241,0.55) 0%, transparent 45%)',
        }}
      />

      {/* About this view — floating top-right. Must stack above the status
          chips (z-20) or the open popover gets painted over by them. */}
      <div className="absolute right-5 top-5 z-30 sm:right-6 sm:top-6">
        <AboutView text="The structure of the Indian insurance market — segment mix (life, general, health), standalone vs general health insurers, and public vs private — each on a total-premium basis and labelled with its own reported year." />
      </div>

      {/* Left content */}
      <div className="relative z-10 max-w-2xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <SignalBadge label="Industry Overview" tone="navy" size="sm" />
          {highlightName && (
            <span className="text-[11px] font-medium text-ink-secondary">
              · <span className="font-semibold text-champagne">{highlightName}</span> highlighted
            </span>
          )}
        </div>
        <h1 className="font-display text-[27px] leading-[1.1] text-navy-deep sm:text-[31px]">
          Insurance Investment Dashboard
        </h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
          Who leads, who&rsquo;s improving, and where risk is building.
        </p>
      </div>

      {/* Status chips — float lower-right on desktop, flow under title on mobile */}
      <div className="relative z-20 mt-5 flex flex-wrap gap-2.5 sm:absolute sm:bottom-6 sm:right-6 sm:mt-0">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#D6E2FA] bg-white/85 px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
          <Clock className="h-3.5 w-3.5 text-navy-primary" />
          <span className="text-ink-secondary">Updated</span>
          <span className="font-semibold text-navy-deep">{INDUSTRY_UPDATED}</span>
        </div>
        {annualBasisNote ? (
          <div
            className="flex items-center gap-1.5 rounded-lg border border-[#F0E1BE] bg-[#FBF6EA] px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5"
            title={`Industry structure is reported annually — showing ${FY} regardless of the ${period} toggle.`}
          >
            <Clock className="h-3.5 w-3.5 text-champagne-deep" />
            <span className="font-semibold text-champagne-deep">{FY} · annual basis</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg border border-[#BFE3E1] bg-teal-soft px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
            <BadgeCheck className="h-3.5 w-3.5 text-teal" />
            <span className="font-semibold text-teal">Annual basis · current</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-lg border border-[#BFE3E1] bg-teal-soft px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
          <ShieldCheck className="h-3.5 w-3.5 text-teal" />
          <span className="font-semibold text-teal">{DATA_FRESHNESS.quality}</span>
        </div>
      </div>
    </header>
  )
}
