import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { SignalBadge } from '@/components/SignalBadge'
import { BasisTag } from '@/components/BasisTag'
import { BandedLineChart, ChartFrame, TrendLineChart } from '@/components/charts'
import { EmptyState } from '@/components/EmptyState'
import {
  costKpis,
  marginTrend,
  plTrend,
  profitabilityBasis,
  returnsTrend,
  solvencyTrend,
} from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'
import { getCompanyProfitabilityCopy } from '@/lib/companyCopy'
import { usePeriodGate } from '@/lib/usePeriodGate'
import type { Metric } from '@/data/types'

type View = 'P&L' | 'Margin' | 'Cost' | 'Returns' | 'Capital'

// Combined ratio threshold styling (soft tones only).
function combinedTone(v: number): { label: string; tone: 'positive' | 'warning' | 'negative' } {
  if (v < 100) return { label: 'Strong', tone: 'positive' }
  if (v <= 105) return { label: 'Watch', tone: 'warning' }
  return { label: 'Weak', tone: 'negative' }
}

export function ProfitabilityCapital() {
  const [view, setView] = useState<View>('Margin')
  const company = useActiveCompany()
  const copy = getCompanyProfitabilityCopy(company)
  const gate = usePeriodGate()

  const hasCR = company.combinedRatio > 0
  const latestCombined = hasCR ? company.combinedRatio : (marginTrend[marginTrend.length - 1].Combined as number)
  const ct = combinedTone(latestCombined)

  const headline = {
    'P&L': `P&L trajectory for ${company.shortName}`,
    Margin: hasCR
      ? `Combined ratio for ${company.shortName} (latest ${company.combinedRatio.toFixed(1)}%)`
      : `${company.shortName} is a life carrier — combined ratio is N/A`,
    Cost: `Cost ratios for ${company.shortName}`,
    Returns: `Returns trajectory for ${company.shortName} (ROE ${company.roe.toFixed(1)}%)`,
    Capital: `${company.shortName} solvency (latest ${company.solvency.toFixed(2)}x)`,
  }[view]

  // Per-company KPIs derived from the snapshot record. Period is always Annual
  // because the snapshot is the FY26 mock record.
  const m = (value: number | null, opts: Partial<Metric> = {}): Metric => ({
    value,
    period: 'FY26',
    source: 'Company filings (mock)',
    status: value === null ? 'Pending' : 'Reported',
    lastUpdated: '2026-05-23',
    ...opts,
  })
  const companyKpis: { label: string; metric: Metric; invert?: boolean }[] = [
    { label: 'GWP growth', metric: m(company.growth, { unit: '%' }) },
    {
      label: 'Combined ratio',
      metric: m(hasCR ? company.combinedRatio : null, { unit: '%' }),
      invert: true,
    },
    { label: 'ROE', metric: m(company.roe, { unit: '%' }) },
    { label: 'Solvency', metric: m(company.solvency, { unit: 'x' }) },
  ]

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow={copy.eyebrow}
        verdict={copy.verdict}
        tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'teal' ? 'teal' : copy.tone === 'negative' ? 'negative' : 'navy'}
        badge={copy.badge}
        summary={copy.summary}
        source="Company filing + IRDAI disclosures"
        sourceConfidence="high"
        sourceProvenance={{ source_name: 'Niva Bupa / Star Health / Aditya Birla: direct from company press releases. Care Health / ManipalCigna: derived from IRDAI public disclosures via Cafemutual / disclosure aggregators.', source_url: 'https://transactions.nivabupa.com/pages/doc/investor-relations/other-fin-disclosures/Press-Release-Results-March-2025.pdf', fetched_at: '2026-05-28' }}
      />

    <ModuleCard
      question="Is premium growth converting into profit, underwriting discipline and strong capital returns?"
      title={`${company.shortName} · Profitability & Capital`}
      icon="capital"
      controls={
        <SegmentedControl<View>
          label="View"
          options={['P&L', 'Margin', 'Cost', 'Returns', 'Capital'] as View[]}
          value={view}
          onChange={setView}
          size="sm"
        />
      }
      kpis={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {companyKpis.map((k) => (
            <MiniKpi
              key={k.label}
              label={k.label}
              metric={k.metric}
              invert={k.invert}
              source={
                company.id === 'care-health' || company.id === 'manipalcigna'
                  ? 'Derived from IRDAI'
                  : 'Company filing'
              }
              sourceConfidence="high"
              sourceProvenance={{
                source_name: `${company.shortName} FY25 — ${
                  company.id === 'care-health'
                    ? 'Care Health Public Disclosures (IRDAI format), re-aggregated by UnlistedZone / Chryseum'
                    : company.id === 'manipalcigna'
                      ? 'Cafemutual non-life FY26 ranking citing IRDAI segment data'
                      : 'Company press release / annual report'
                }`,
                source_url:
                  company.id === 'care-health'
                    ? 'https://www.careinsurance.com/public-disclosures.html'
                    : company.id === 'manipalcigna'
                      ? 'https://cafemutual.com/news/insurance/37556-who-are-the-top-non-life-insurers-of-fy26'
                      : company.id === 'star-health'
                        ? 'https://www.businessupturn.com/business/corporates/star-health-insurance-posts-rs-787-crore-profit-in-fy25-gwp-grows-10-to-rs-16781-crore/'
                        : company.id === 'aditya-birla'
                          ? 'https://www.adityabirla.com/media/press-releases/aditya-birla-capital-announces-q4fy25-and-fy25-results/'
                          : 'https://transactions.nivabupa.com/pages/doc/investor-relations/other-fin-disclosures/Press-Release-Results-March-2025.pdf',
              }}
            />
          ))}
        </div>
      }
      insight={
        hasCR ? (
          <div className="rounded-xl2 border border-soft-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Combined ratio (hero)</p>
              <SignalBadge label={ct.label} tone={ct.tone} size="sm" />
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-display text-4xl text-navy-deep">{latestCombined.toFixed(1)}%</span>
              <span className={`mb-1 text-xs ${ct.tone === 'positive' ? 'text-signal-positive' : ct.tone === 'warning' ? 'text-signal-warning' : 'text-signal-negative'}`}>
                {ct.tone === 'positive' ? 'profitable' : ct.tone === 'warning' ? 'thin' : 'loss-making'}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ice">
              <div
                className={`h-full rounded-full ${ct.tone === 'positive' ? 'bg-signal-positive' : ct.tone === 'warning' ? 'bg-signal-warning' : 'bg-signal-negative'}`}
                style={{ width: `${Math.min(100, (latestCombined / 110) * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-ink-secondary">
              <span>&lt;100 strong</span>
              <span>100–105 watch</span>
              <span>&gt;105 weak</span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl2 border border-soft-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Combined ratio (hero)</p>
            <p className="mt-2 font-display text-2xl text-navy-deep">N/A</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">
              {company.shortName} is a life carrier — combined ratio does not apply. Track ROE
              ({company.roe.toFixed(1)}%) and solvency ({company.solvency.toFixed(2)}x) instead.
            </p>
          </div>
        )
      }
      dataStatus={[...companyKpis.map((k) => ({ label: k.label, metric: k.metric })), ...costKpis]}
      dataBasis={profitabilityBasis}
    >
      <BasisTag info={profitabilityBasis} className="mb-3" />
      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual to see the trend.'}
          height={240}
        />
      ) : (
        <>
          {view === 'P&L' && (
            <ChartFrame headline={headline} caption="Revenue, operating profit & PAT (₹ Cr) · illustrative · mock"
              source="Company filing + IRDAI disclosures"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'Latest data point reflects real FY25 disclosure; historical trend shape is illustrative.' }}>
              <TrendLineChart data={plTrend} series={['Revenue', 'Operating', 'PAT']} />
            </ChartFrame>
          )}
          {view === 'Margin' && hasCR && (
            <ChartFrame
              headline={headline}
              caption="Combined ratio and its components (%) · illustrative · mock"
              source="Company filing + IRDAI disclosures"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'Latest data point reflects real FY25 disclosure; historical trend shape is illustrative.' }}
            >
              <TrendLineChart data={marginTrend} series={['Combined', 'Loss', 'Expense', 'Commission']} unit="%" />
            </ChartFrame>
          )}
          {view === 'Margin' && !hasCR && (
            <EmptyState
              title="Combined ratio not applicable"
              body={`${company.shortName} reports a life P&L — switch to Returns or Capital for the right read.`}
              height={240}
            />
          )}
          {view === 'Cost' && (
            <ChartFrame
              headline={headline}
              caption="Key cost ratios · illustrative · mock"
              height={280}
              source="Company filing + IRDAI disclosures"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'Latest data point reflects real FY25 disclosure; historical trend shape is illustrative.' }}
            >
              <div className="grid h-full grid-cols-1 content-center gap-3 sm:grid-cols-3">
                {costKpis.map((k) => (
                  <MiniKpi key={k.label} label={k.label} metric={k.metric} invert />
                ))}
              </div>
            </ChartFrame>
          )}
          {view === 'Returns' && (
            <ChartFrame
              headline={headline}
              caption="ROE & ROA (%) · illustrative · mock"
              source="Company filing + IRDAI disclosures"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'Latest data point reflects real FY25 disclosure; historical trend shape is illustrative.' }}
            >
              <TrendLineChart data={returnsTrend} series={['ROE', 'ROA']} unit="%" />
            </ChartFrame>
          )}
          {view === 'Capital' && (
            <ChartFrame
              headline={headline}
              caption="Solvency ratio vs regulatory floor (x) · illustrative · mock"
              source="Company filing + IRDAI disclosures"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'Latest data point reflects real FY25 disclosure; historical trend shape is illustrative.' }}
            >
              <BandedLineChart data={solvencyTrend} lineKey="Solvency" floorKey="Floor" bandLow={1.5} bandHigh={2.5} />
            </ChartFrame>
          )}
        </>
      )}
    </ModuleCard>

      <InvestorRead
        title={`${company.shortName} · Profitability Investor Read`}
        signal={copy.badge}
        lines={copy.readLines}
        source="Company filing + IRDAI disclosures"
        sourceConfidence="high"
        sourceProvenance={{ source_name: 'Niva Bupa / Star Health / Aditya Birla: direct from company press releases. Care Health / ManipalCigna: derived from IRDAI public disclosures via Cafemutual / disclosure aggregators.', source_url: 'https://transactions.nivabupa.com/pages/doc/investor-relations/other-fin-disclosures/Press-Release-Results-March-2025.pdf', fetched_at: '2026-05-28' }}
      />
    </div>
  )
}
