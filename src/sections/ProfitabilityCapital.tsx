import { useState } from 'react'
import { ResponsiveContainer, Line, LineChart } from 'recharts'
import { Calendar } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SignalBadge } from '@/components/SignalBadge'
import { BasisTag } from '@/components/BasisTag'
import { profitabilityBasis } from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'
import { getCompanyProfitabilityCopy } from '@/lib/companyCopy'
import type { Metric, Insurer } from '@/data/types'

// Mock quarterly PAT (₹ Cr) for the last 4 quarters per insurer. Latest quarter
// reconciles to each company's FY25 PAT footprint from the company snapshot.
const NET_PROFIT_QUARTERS: Record<string, [number, number, number, number]> = {
  'niva-bupa': [142, 178, 215, 268],
  'star-health': [195, 212, 178, 202],
  'care-health': [120, 132, 118, 96],
  'aditya-birla': [-78, -52, -28, -12],
  manipalcigna: [-22, -15, -8, -5],
  'icici-lombard': [580, 612, 645, 671],
  'bajaj-general': [410, 438, 480, 504],
  'hdfc-life': [415, 432, 455, 500],
  'sbi-life': [560, 588, 615, 650],
}

// Cost ratios (FY25 mock — loss / commission / expense %), aligned with combined
// ratio. Life carriers do not report on this basis so they are omitted.
const COST_RATIOS: Record<string, { loss: number; commission: number; expense: number }> = {
  'niva-bupa': { loss: 62.8, commission: 13.4, expense: 20.6 },
  'star-health': { loss: 66.8, commission: 10.2, expense: 22.4 },
  'care-health': { loss: 64.2, commission: 12.1, expense: 21.8 },
  'aditya-birla': { loss: 65.0, commission: 12.2, expense: 24.6 },
  manipalcigna: { loss: 66.4, commission: 11.6, expense: 25.2 },
  'icici-lombard': { loss: 74.2, commission: 4.6, expense: 23.8 },
  'bajaj-general': { loss: 73.8, commission: 4.0, expense: 22.6 },
}

function getMarginMetrics(company: Insurer): { netMargin: number; yoyImprovement: number; latestPat: number } {
  const series = NET_PROFIT_QUARTERS[company.id]
  if (!series || company.premiumCollection <= 0) return { netMargin: 0, yoyImprovement: 0, latestPat: 0 }
  const ttmPat = series.reduce((s, v) => s + v, 0)
  const netMargin = (ttmPat / company.premiumCollection) * 100
  const priorAvg = (series[0] + series[1] + series[2]) / 3
  const yoyImprovement = priorAvg === 0 ? 0 : ((series[3] - priorAvg) / Math.abs(priorAvg)) * 100
  return {
    netMargin: Math.round(netMargin * 10) / 10,
    yoyImprovement: Math.round(yoyImprovement * 10) / 10,
    latestPat: series[3],
  }
}

type View = 'P&L' | 'Margin' | 'Cost' | 'Returns' | 'Capital'
type Tone = 'positive' | 'warning' | 'negative' | 'neutral'

const toneDot: Record<Tone, string> = {
  positive: 'bg-signal-positive',
  warning: 'bg-signal-warning',
  negative: 'bg-signal-negative',
  neutral: 'bg-muted-blue',
}
const toneText: Record<Tone, string> = {
  positive: 'text-signal-positive',
  warning: 'text-signal-warning',
  negative: 'text-signal-negative',
  neutral: 'text-ink-secondary',
}

function combinedTone(v: number): { label: string; tone: Tone } {
  if (v < 100) return { label: 'Strong', tone: 'positive' }
  if (v <= 105) return { label: 'Watch', tone: 'warning' }
  return { label: 'Weak', tone: 'negative' }
}

// Tiny dotless line — supplementary trend cue beside a value label.
function Sparkline({ values, tone }: { values: number[]; tone: 'positive' | 'navy' | 'negative' }) {
  const stroke = tone === 'positive' ? '#2F855A' : tone === 'negative' ? '#B94A48' : '#27457E'
  const data = values.map((v, i) => ({ i, v }))
  return (
    <div className="h-[26px] w-[80px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// One step in the Profit Bridge — value, caption, tone dot. Renders a subtle
// right-edge divider on all but the last step so a row of steps reads as a
// connected flow without explicit arrow elements.
function BridgeStep({
  label,
  value,
  caption,
  tone,
  isLast,
}: {
  label: string
  value: string
  caption: string
  tone: Tone
  isLast?: boolean
}) {
  return (
    <div
      className={[
        'flex min-w-0 flex-1 flex-col items-start gap-1 px-2.5 first:pl-0',
        isLast ? '' : 'sm:border-r sm:border-soft-border',
      ].join(' ')}
    >
      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{label}</p>
      <p className="font-display text-[22px] leading-none text-navy-deep">{value}</p>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[tone]}`} />
        <span className={`text-[10.5px] leading-tight ${toneText[tone]}`}>{caption}</span>
      </div>
    </div>
  )
}

// Compact horizontal bar with a labeled value — used in Margin and Cost lenses.
function MetricBar({
  label,
  value,
  pct,
  tone,
  unit = '%',
}: {
  label: string
  value: number
  pct: number
  tone: Tone
  unit?: string
}) {
  const bar = tone === 'positive' ? 'bg-signal-positive' : tone === 'warning' ? 'bg-signal-warning' : tone === 'negative' ? 'bg-signal-negative' : 'bg-muted-blue'
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-ink-secondary">{label}</span>
        <span className="font-display text-[15px] text-navy-deep">
          {value.toFixed(1)}
          {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ice">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
      </div>
    </div>
  )
}

export function ProfitabilityCapital() {
  const [view, setView] = useState<View>('P&L')
  const company = useActiveCompany()
  const copy = getCompanyProfitabilityCopy(company)

  const hasCR = company.combinedRatio > 0
  const ct = hasCR ? combinedTone(company.combinedRatio) : { label: 'N/A', tone: 'neutral' as Tone }
  const mm = getMarginMetrics(company)
  const hasTrend = NET_PROFIT_QUARTERS[company.id] !== undefined
  const trendValues = hasTrend ? NET_PROFIT_QUARTERS[company.id] : []
  const trendTone: 'positive' | 'navy' | 'negative' =
    !hasTrend ? 'navy' : trendValues[3] < 0 ? 'negative' : trendValues[3] >= trendValues[0] ? 'positive' : 'navy'

  // Threshold tones for the bridge / insight stack / so-what card.
  const growthTone: Tone = company.growth >= 20 ? 'positive' : company.growth >= 10 ? 'neutral' : 'warning'
  const netMarginTone: Tone = mm.netMargin > 5 ? 'positive' : mm.netMargin > 0 ? 'warning' : mm.netMargin === 0 ? 'neutral' : 'negative'
  const roeTone: Tone = company.roe >= 12 ? 'positive' : company.roe >= 5 ? 'warning' : 'negative'
  const solvencyTone: Tone = company.solvency >= 1.8 ? 'positive' : company.solvency >= 1.5 ? 'warning' : 'negative'

  // Period-honest snapshot record powering the audit drawer. Source data is FY25.
  const m = (value: number | null, opts: Partial<Metric> = {}): Metric => ({
    value,
    period: 'FY25',
    source: 'Company filings (mock)',
    status: value === null ? 'Pending' : 'Reported',
    lastUpdated: '2025-05-23',
    ...opts,
  })
  const companyKpis: { label: string; metric: Metric; invert?: boolean }[] = [
    { label: 'GWP growth', metric: m(company.growth, { unit: '%' }) },
    { label: 'Combined ratio', metric: m(hasCR ? company.combinedRatio : null, { unit: '%' }), invert: true },
    { label: 'Net margin', metric: m(hasTrend ? mm.netMargin : null, { unit: '%', period: 'TTM' }) },
    { label: 'ROE', metric: m(company.roe, { unit: '%' }) },
    { label: 'Solvency', metric: m(company.solvency, { unit: 'x' }) },
  ]

  const cost = COST_RATIOS[company.id]

  // Verdict hero — 3 inline chips on the right of the strip.
  const heroStats: { label: string; value: string }[] = [
    {
      label: 'Combined Ratio · FY25',
      value: hasCR ? `${company.combinedRatio.toFixed(1)}% · ${ct.label}` : 'N/A · life',
    },
    {
      label: 'ROE · FY25',
      value: `${company.roe.toFixed(1)}% · ${roeTone === 'positive' ? 'Strong' : roeTone === 'warning' ? 'Improving' : 'Watch'}`,
    },
    {
      label: 'Solvency · FY25',
      value: `${company.solvency.toFixed(2)}x · ${solvencyTone === 'positive' ? 'Comfortable' : solvencyTone === 'warning' ? 'Adequate' : 'Tight'}`,
    },
  ]

  return (
    <div className="space-y-5">
      <VerdictStrip
        eyebrow="Profitability Verdict"
        verdict={
          !hasCR
            ? 'Returns and capital are the story'
            : ct.tone === 'positive'
              ? 'Premium growth is converting into profit'
              : ct.tone === 'warning'
                ? 'Growth ahead of underwriting discipline'
                : 'Growth not yet converting into profit'
        }
        tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'teal' ? 'teal' : copy.tone === 'negative' ? 'negative' : 'navy'}
        badge={copy.badge}
        summary={
          !hasCR
            ? `${company.shortName} is a life carrier — ROE ${company.roe.toFixed(1)}% and ${company.solvency.toFixed(2)}x solvency anchor the read.`
            : ct.tone === 'positive'
              ? `Combined ratio ${company.combinedRatio.toFixed(1)}%, ROE ${company.roe.toFixed(1)}% and ${company.solvency.toFixed(2)}x solvency suggest underwriting discipline is translating into capital returns.`
              : ct.tone === 'warning'
                ? `Combined ratio ${company.combinedRatio.toFixed(1)}% sits in the watch band; ROE ${company.roe.toFixed(1)}% holds while solvency stays at ${company.solvency.toFixed(2)}x.`
                : `Combined ratio ${company.combinedRatio.toFixed(1)}% is loss-making; profitability hinges on the ${company.solvency.toFixed(2)}x capital cushion.`
        }
        stats={heroStats}
        source="Company filing + IRDAI disclosures"
        sourcePeriod="FY25"
        sourceConfidence="high"
        sourceProvenance={{
          source_name:
            'Niva Bupa / Star Health / Aditya Birla: direct from company press releases. Care Health / ManipalCigna: derived from IRDAI public disclosures via Cafemutual / disclosure aggregators.',
          source_url:
            'https://transactions.nivabupa.com/pages/doc/investor-relations/other-fin-disclosures/Press-Release-Results-March-2025.pdf',
          fetched_at: '2026-05-28',
        }}
      />

      <ModuleCard
        question="Is premium growth converting into profit, underwriting discipline and strong capital returns?"
        title={`${company.shortName} · Profitability Story`}
        icon="capital"
        controls={
          <SegmentedControl<View>
            label="View lens"
            options={['P&L', 'Margin', 'Cost', 'Returns', 'Capital'] as View[]}
            value={view}
            onChange={setView}
            size="sm"
          />
        }
        insight={
          <div className="flex flex-col gap-3">
            {/* Underwriting */}
            <div className="surface-soft p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Underwriting</p>
                <SignalBadge label={ct.label} tone={ct.tone === 'neutral' ? 'navy' : ct.tone} size="sm" />
              </div>
              <p className="mt-1.5 font-display text-[22px] leading-none text-navy-deep">
                {hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'N/A'}
              </p>
              <p className="mt-1 text-[10.5px] text-ink-secondary">Below 100 = profitable</p>
              <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-ice">
                <span className="h-full flex-1 bg-signal-positive/40" />
                <span className="h-full flex-1 bg-signal-warning/40" />
                <span className="h-full flex-1 bg-signal-negative/40" />
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-ink-secondary">
                <span>&lt;100 strong</span>
                <span>100–105 watch</span>
                <span>&gt;105 weak</span>
              </div>
            </div>

            {/* Profit Conversion */}
            <div className="surface-soft p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Profit Conversion</p>
                <SignalBadge
                  label={netMarginTone === 'positive' ? 'Healthy' : netMarginTone === 'warning' ? 'Thin' : netMarginTone === 'neutral' ? 'Pending' : 'Loss'}
                  tone={netMarginTone === 'neutral' ? 'navy' : netMarginTone}
                  size="sm"
                />
              </div>
              <p className="mt-1.5 font-display text-[22px] leading-none text-navy-deep">
                {hasTrend ? `${mm.netMargin.toFixed(1)}%` : '—'}
              </p>
              <p className="mt-1 text-[10.5px] text-ink-secondary">PAT as % of GWP · TTM</p>
              {hasTrend && (
                <p className={`mt-1 text-[10.5px] ${mm.yoyImprovement >= 0 ? 'text-signal-positive' : 'text-signal-negative'}`}>
                  Margin {mm.yoyImprovement >= 0 ? 'improving' : 'declining'} vs trailing average
                </p>
              )}
            </div>

            {/* Capital Strength */}
            <div className="surface-soft p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Capital Strength</p>
                <SignalBadge
                  label={solvencyTone === 'positive' ? 'Comfortable' : solvencyTone === 'warning' ? 'Adequate' : 'Tight'}
                  tone={solvencyTone}
                  size="sm"
                />
              </div>
              <p className="mt-1.5 font-display text-[22px] leading-none text-navy-deep">
                {company.solvency.toFixed(2)}x
              </p>
              <p className="mt-1 text-[10.5px] text-ink-secondary">Solvency cushion</p>
              <p className="mt-1 text-[10.5px] text-ink-secondary">
                {company.solvency >= 1.5 ? 'Above regulatory comfort zone' : 'Near regulatory floor (1.5x)'}
              </p>
            </div>
          </div>
        }
        dataStatus={companyKpis.map((k) => ({ label: k.label, metric: k.metric }))}
        dataBasis={profitabilityBasis}
      >
        {/* Morphing story card body — driven by the View lens tabs. */}
        {view === 'P&L' && (
          <div className="rounded-xl2 border border-soft-border bg-white p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Profit Bridge</p>
                <h3 className="mt-0.5 font-display text-[16px] text-navy-deep">How premium moves into profit and capital</h3>
              </div>
              <span className="text-[10.5px] text-ink-secondary">FY25 · TTM</span>
            </div>
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-5 sm:gap-y-0">
              <BridgeStep
                label="GWP Growth"
                value={`${company.growth.toFixed(0)}%`}
                caption="Growth engine"
                tone={growthTone}
              />
              <BridgeStep
                label="Combined Ratio"
                value={hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'N/A'}
                caption={hasCR ? (ct.tone === 'positive' ? 'Underwriting profitable' : ct.tone === 'warning' ? 'Watch' : 'Loss-making') : 'Life carrier'}
                tone={hasCR ? ct.tone : 'neutral'}
              />
              <BridgeStep
                label="Net Margin"
                value={hasTrend ? `${mm.netMargin.toFixed(1)}%` : '—'}
                caption={hasTrend ? (mm.netMargin > 5 ? 'Profit conversion' : mm.netMargin > 0 ? 'Thin conversion' : 'No conversion') : 'Pending'}
                tone={hasTrend ? netMarginTone : 'neutral'}
              />
              <BridgeStep
                label="ROE"
                value={`${company.roe.toFixed(1)}%`}
                caption={roeTone === 'positive' ? 'Strong return' : roeTone === 'warning' ? 'Early return signal' : 'Sub-cost-of-capital'}
                tone={roeTone}
              />
              <BridgeStep
                label="Solvency"
                value={`${company.solvency.toFixed(2)}x`}
                caption="Capital cushion"
                tone={solvencyTone}
                isLast
              />
            </div>

            {hasTrend ? (
              <div className="mt-5 flex items-center justify-between border-t border-soft-border pt-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">PAT trajectory</span>
                  <span className="font-display text-[14px] text-navy-deep">₹{trendValues[3]} Cr</span>
                  <Sparkline values={trendValues} tone={trendTone} />
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-secondary">
                  <Calendar className="h-3 w-3" />
                  Q1–Q4 FY25 · standalone
                </span>
              </div>
            ) : (
              <div className="mt-5 flex justify-end border-t border-soft-border pt-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ice px-2 py-0.5 text-[10px] text-ink-secondary">
                  <span className="h-1 w-1 rounded-full bg-champagne" />
                  Quarterly trend pending
                </span>
              </div>
            )}
          </div>
        )}

        {view === 'Margin' && (
          <div className="rounded-xl2 border border-soft-border bg-white p-5">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Margin Lens</p>
              <h3 className="mt-0.5 font-display text-[16px] text-navy-deep">Underwriting discipline vs profit conversion</h3>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-ink-secondary">Combined Ratio · FY25</p>
                  <SignalBadge label={ct.label} tone={ct.tone === 'neutral' ? 'navy' : ct.tone} size="sm" />
                </div>
                <p className="mt-1 font-display text-[28px] text-navy-deep">{hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'N/A'}</p>
                {hasCR && (
                  <>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ice">
                      <div
                        className={`h-full rounded-full ${ct.tone === 'positive' ? 'bg-signal-positive' : ct.tone === 'warning' ? 'bg-signal-warning' : 'bg-signal-negative'}`}
                        style={{ width: `${Math.min(100, (company.combinedRatio / 110) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-ink-secondary">
                      <span>&lt;100 strong</span>
                      <span>100–105 watch</span>
                      <span>&gt;105 weak</span>
                    </div>
                  </>
                )}
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-ink-secondary">Net Margin · TTM</p>
                  <SignalBadge
                    label={netMarginTone === 'positive' ? 'Healthy' : netMarginTone === 'warning' ? 'Thin' : netMarginTone === 'neutral' ? 'Pending' : 'Loss'}
                    tone={netMarginTone === 'neutral' ? 'navy' : netMarginTone}
                    size="sm"
                  />
                </div>
                <p className="mt-1 font-display text-[28px] text-navy-deep">{hasTrend ? `${mm.netMargin.toFixed(1)}%` : '—'}</p>
                <p className="mt-1 text-[11px] text-ink-secondary">PAT as a share of GWP</p>
                {hasTrend && (
                  <p className={`mt-1 text-[11px] ${mm.yoyImprovement >= 0 ? 'text-signal-positive' : 'text-signal-negative'}`}>
                    {mm.yoyImprovement >= 0 ? '+' : ''}
                    {mm.yoyImprovement.toFixed(1)}% vs trailing-3 average
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'Cost' && (
          <div className="rounded-xl2 border border-soft-border bg-white p-5">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Cost Lens</p>
              <h3 className="mt-0.5 font-display text-[16px] text-navy-deep">Where the premium rupee goes</h3>
            </div>
            {cost ? (
              <div className="space-y-3">
                <MetricBar
                  label="Loss ratio (claims)"
                  value={cost.loss}
                  pct={cost.loss}
                  tone={cost.loss > 70 ? 'warning' : cost.loss > 75 ? 'negative' : 'positive'}
                />
                <MetricBar
                  label="Commission ratio"
                  value={cost.commission}
                  pct={cost.commission * 4}
                  tone={cost.commission > 13 ? 'warning' : 'neutral'}
                />
                <MetricBar
                  label="Expense ratio (opex)"
                  value={cost.expense}
                  pct={cost.expense * 2.5}
                  tone={cost.expense > 24 ? 'warning' : 'neutral'}
                />
                <p className="pt-1 text-[11px] text-ink-secondary">FY25 mock · sums approximate combined ratio</p>
              </div>
            ) : (
              <p className="text-[12px] text-ink-secondary">
                {company.shortName} is a life carrier — claims / commission / opex split is not reported on this P&C basis.
              </p>
            )}
          </div>
        )}

        {view === 'Returns' && (
          <div className="rounded-xl2 border border-soft-border bg-white p-5">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Returns Lens</p>
              <h3 className="mt-0.5 font-display text-[16px] text-navy-deep">Return on equity and PAT trajectory</h3>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-secondary">ROE · FY25</p>
                <p className="mt-1 font-display text-[28px] text-navy-deep">{company.roe.toFixed(1)}%</p>
                <p className={`mt-1 text-[11px] ${toneText[roeTone]}`}>
                  {roeTone === 'positive' ? 'Above sector benchmark' : roeTone === 'warning' ? 'Early return signal' : 'Sub-cost-of-capital'}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-ink-secondary">Net profit · Q4 FY25</p>
                  {hasTrend && <Sparkline values={trendValues} tone={trendTone} />}
                </div>
                <p className="mt-1 font-display text-[28px] text-navy-deep">{hasTrend ? `₹${mm.latestPat} Cr` : '—'}</p>
                {hasTrend && (
                  <p className={`mt-1 text-[11px] ${mm.yoyImprovement >= 0 ? 'text-signal-positive' : 'text-signal-negative'}`}>
                    {mm.yoyImprovement >= 0 ? '+' : ''}
                    {mm.yoyImprovement.toFixed(1)}% vs trailing-3 average
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'Capital' && (
          <div className="rounded-xl2 border border-soft-border bg-white p-5">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Capital Lens</p>
              <h3 className="mt-0.5 font-display text-[16px] text-navy-deep">Solvency vs regulatory comfort zone</h3>
            </div>
            <p className="font-display text-[34px] text-navy-deep">{company.solvency.toFixed(2)}x</p>
            <p className={`mt-1 text-[11.5px] ${toneText[solvencyTone]}`}>
              {company.solvency >= 1.8 ? 'Above sector comfort band' : company.solvency >= 1.5 ? 'Adequate vs regulatory floor' : 'Below regulatory floor — capital tight'}
            </p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ice">
              <div
                className={`h-full rounded-full ${solvencyTone === 'positive' ? 'bg-signal-positive' : solvencyTone === 'warning' ? 'bg-signal-warning' : 'bg-signal-negative'}`}
                style={{ width: `${Math.min(100, (company.solvency / 3.5) * 100)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-ink-secondary">
              <span>1.5x floor</span>
              <span>2.0x sector</span>
              <span>3.5x</span>
            </div>
          </div>
        )}

        <BasisTag info={profitabilityBasis} className="mt-3" />
      </ModuleCard>

      {/* "So what?" — light card, replaces the dark Investor Read at the bottom. */}
      <section className="card-surface relative overflow-hidden p-5">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-champagne" />
        <div className="flex flex-wrap items-baseline justify-between gap-2 pl-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Investor Read</p>
            <h3 className="mt-0.5 font-display text-[18px] text-navy-deep">So what?</h3>
          </div>
          <span className="text-[10.5px] text-ink-secondary">FY25 · {company.shortName}</span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 pl-3 sm:grid-cols-[120px_1fr]">
          {copy.readLines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{line.label}</dt>
              <dd className="text-[12.5px] leading-relaxed text-navy-deep">{line.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
