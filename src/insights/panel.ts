// ---------------------------------------------------------------------------
//  Insights — dataset adapter. Assembles a clean, typed per-insurer panel from
//  the real committed snapshots, so the signal functions stay pure (they take a
//  Dataset and can be tested with fixtures). No fabrication: every field maps to
//  a real snapshot column; missing stays null and surfaces as a dataGap signal.
// ---------------------------------------------------------------------------

import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import gicHealthPortfolio from '@/data/snapshots/gic-health-portfolio.json'
import { getCompanyMaster, getLatestAnnualFyLabel } from '@/lib/dataLayer'
import { getPromises } from '@/lib/promiseTracker'
import { peerValuation, focalMultiples, analystConsensus, focalFinancials, FOCAL_VALUATION_ID } from '@/data/valuationData'

export interface AnnualMetrics {
  fiscal_year: string
  gwp: number | null
  nep: number | null // net earned premium — float-magnitude proxy
  combined_ratio: number | null
  claims_ratio: number | null
  expense_ratio: number | null
  roe: number | null
  solvency_ratio: number | null
  retail_mix: number | null
  market_share: number | null
  growth_yoy: number | null
  renewal_rate: number | null // persistency / embedded-annuity input
  customer_retention: number | null
}

export interface HealthMix {
  fiscal_year: string
  retail: number | null
  group: number | null
  total: number | null
}

export interface ValuationPoint {
  period: string
  pb: number | null
  pe: number | null
  pGwp: number | null
  gwp: number | null
  pat: number | null
}

export interface PromiseScore {
  delivered: number
  onTrack: number
  delayed: number
  missed: number
  total: number
}

export interface ConsensusPoint {
  target: number | null
  price: number | null
  analystCount: number
  buy: number
  hold: number
  sell: number
  high: number | null
  low: number | null
}

export interface InsurerPanel {
  id: string
  label: string
  listed: boolean
  annual: AnnualMetrics[] // ascending by fiscal year
  healthMix: HealthMix[] // GI Council retail/group health premium, ascending
  valuation: ValuationPoint | null
  promises: PromiseScore | null
  consensus: ConsensusPoint | null
}

export interface Dataset {
  asOf: string
  insurers: InsurerPanel[]
}

/** The five standalone health insurers — the panel universe. */
export const SAHI_IDS = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna'] as const

const fyNum = (fy: string) => Number(String(fy).replace(/^FY/, '')) || 0
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

interface RawAnnual { company_id: string; fiscal_year: string; [k: string]: unknown }
interface RawHealth { entity: string; fiscal_year: string; health_retail: number | null; health_group: number | null; health_total: number | null }

function annualFor(companyId: string): AnnualMetrics[] {
  return (annualSnapshot.data as RawAnnual[])
    .filter((r) => r.company_id === companyId)
    .sort((a, b) => fyNum(a.fiscal_year) - fyNum(b.fiscal_year))
    .map((r) => ({
      fiscal_year: r.fiscal_year,
      gwp: numOrNull(r.gwp),
      nep: numOrNull(r.nep),
      combined_ratio: numOrNull(r.combined_ratio),
      claims_ratio: numOrNull(r.claims_ratio),
      expense_ratio: numOrNull(r.expense_ratio),
      roe: numOrNull(r.roe),
      solvency_ratio: numOrNull(r.solvency_ratio),
      retail_mix: numOrNull(r.retail_mix),
      market_share: numOrNull(r.market_share),
      growth_yoy: numOrNull(r.growth_yoy),
      renewal_rate: numOrNull(r.renewal_rate),
      customer_retention: numOrNull(r.customer_retention),
    }))
}

function healthMixFor(companyId: string): HealthMix[] {
  return (gicHealthPortfolio.data as RawHealth[])
    .filter((r) => r.entity === companyId)
    .sort((a, b) => fyNum(a.fiscal_year) - fyNum(b.fiscal_year))
    .map((r) => ({ fiscal_year: r.fiscal_year, retail: numOrNull(r.health_retail), group: numOrNull(r.health_group), total: numOrNull(r.health_total) }))
}

function valuationFor(companyId: string): ValuationPoint | null {
  const row = peerValuation.find((r) => r.companyId === companyId && r.listingStatus === 'Listed')
  if (!row) return null
  const isFocal = companyId === FOCAL_VALUATION_ID
  return {
    period: 'FY26',
    pb: isFocal ? focalMultiples.pb : null,
    pe: row.pe,
    pGwp: row.pGwp,
    gwp: row.gwp,
    pat: isFocal ? focalFinancials.patFY26 : null,
  }
}

function promiseScoreFor(companyId: string): PromiseScore | null {
  const items = getPromises(companyId)
  if (!items.length) return null
  return {
    delivered: items.filter((p) => p.status === 'Delivered').length,
    onTrack: items.filter((p) => p.status === 'On Track').length,
    delayed: items.filter((p) => p.status === 'Delayed').length,
    missed: items.filter((p) => p.status === 'Missed').length,
    total: items.length,
  }
}

function consensusFor(companyId: string): ConsensusPoint | null {
  // Curated analyst consensus is wired for the focal listed name only.
  if (companyId !== FOCAL_VALUATION_ID) return null
  const c = analystConsensus
  return {
    target: c.consensusTargetPrice,
    price: c.currentPrice,
    analystCount: c.analystCount,
    buy: c.buyCount,
    hold: c.holdCount,
    sell: c.sellCount,
    high: c.highestTargetPrice,
    low: c.lowestTargetPrice,
  }
}

/** Build the live panel from the committed snapshots. */
export function buildPanel(): Dataset {
  const master = getCompanyMaster()
  const insurers: InsurerPanel[] = SAHI_IDS.map((id) => {
    const m = master.find((c) => c.company_id === id)
    return {
      id,
      label: m?.short_name ?? id,
      listed: m?.listed_status === 'listed',
      annual: annualFor(id),
      healthMix: healthMixFor(id),
      valuation: valuationFor(id),
      promises: promiseScoreFor(id),
      consensus: consensusFor(id),
    }
  })
  return { asOf: getLatestAnnualFyLabel(), insurers }
}
