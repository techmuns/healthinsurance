// ---------------------------------------------------------------------------
//  NAV / Book-value valuation — values an insurer on its net worth (book value)
//  and a comparable LISTED-peer P/BV multiple. Real, source-backed only:
//   • Net worth (book value) — the per-FY IFRS/IGAAP net worth carried in the
//     committed audit overlay (company filings). Never derived or invented.
//   • Shares outstanding — the exact total from the quarterly shareholding
//     pattern (sum of holders) where filed; else null (per-share is hidden).
//   • P/BV benchmark — the listed SAHI peers' market P/BV (from the valuation
//     snapshot), or where the market P/BV isn't filed, mkt-cap ÷ net worth.
//
//  Any missing input yields null and the UI shows an honest "pending /
//  unavailable" state rather than a fabricated number.
// ---------------------------------------------------------------------------

import auditOverlay from '@/data/snapshots/audit-overlay.json'
import valuationSnapshot from '@/data/snapshots/valuation-snapshot.json'
import shareholdingPattern from '@/data/snapshots/shareholding-pattern-snapshot.json'
import { companyShortName } from '@/lib/companyColors'

// The listed standalone-health insurers — the peer universe whose P/BV is a
// fair comparable for a SAHI's book value. (A known fact about the names, not a
// valuation number; the multiples themselves are read live from the data.)
const LISTED_SAHI_PEERS = ['niva-bupa', 'star-health']

interface OverlayEntry { value?: number | null }
const OVERLAY = (auditOverlay as { data?: Record<string, OverlayEntry> }).data ?? {}

interface ValRow { company_id: string; date?: string | null; market_cap?: number | null; share_price?: number | null; price_to_book?: number | null; shares_outstanding?: number | null }
const VAL = (valuationSnapshot as { data?: ValRow[] }).data ?? []
const valRow = (id: string) => VAL.find((r) => r.company_id === id) ?? null

interface ShareRow { company_id: string; shares?: number | null; filing_period?: string }
const SHARES = (shareholdingPattern as { data?: ShareRow[] }).data ?? []

const CR = 1e7 // ₹1 crore in rupees — net worth / market cap are stored in ₹ Cr.

export interface NetWorth { value: number; period: string; basis: string }

// Latest available period wins: an explicit run-date reading first, then the
// most complete fiscal year (full year > 9M > half-year > quarter).
function periodRank(period: string): number {
  if (period === 'as_on_run_date') return 9999
  const m = /^(3M|6M|H1|9M|12M)?FY(\d{2})$/.exec(period)
  if (!m) return 0
  const within = !m[1] || m[1] === '12M' ? 5 : m[1] === '9M' ? 3 : m[1] === 'H1' || m[1] === '6M' ? 2 : 1
  return Number(m[2]) * 10 + within
}
const basisOf = (key: string): string => (key.includes('_ifrs') ? 'IFRS' : key.includes('_igaap') ? 'IGAAP' : 'reported')
export const periodLabel = (p: string): string => (p === 'as_on_run_date' ? 'latest (run date)' : p)

/** Latest source-backed net worth (book value, ₹ Cr) for a company, or null. */
export function getNetWorth(companyId: string): NetWorth | null {
  const prefix = `${companyId}::net_worth`
  let best: NetWorth | null = null
  let bestRank = -1
  for (const [k, v] of Object.entries(OVERLAY)) {
    if (!k.startsWith(prefix)) continue
    const val = v?.value
    if (typeof val !== 'number') continue
    const period = k.split('::').pop() ?? ''
    const rank = periodRank(period)
    if (rank > bestRank) { bestRank = rank; best = { value: val, period, basis: basisOf(k) } }
  }
  return best
}

export interface SharesOutstanding { value: number; source: string }
/** Exact shares outstanding (sum of the filed holders), or the exchange figure. */
export function getSharesOutstanding(companyId: string): SharesOutstanding | null {
  const rows = SHARES.filter((r) => r.company_id === companyId && typeof r.shares === 'number')
  if (rows.length) {
    const total = rows.reduce((s, r) => s + (r.shares ?? 0), 0)
    return { value: total, source: `${rows[0].filing_period ?? 'latest'} shareholding pattern` }
  }
  const v = valRow(companyId)
  if (v && typeof v.shares_outstanding === 'number') return { value: v.shares_outstanding, source: 'exchange filing' }
  return null
}

export const getMarketCap = (companyId: string): number | null => {
  const v = valRow(companyId)
  return typeof v?.market_cap === 'number' ? v.market_cap : null
}
export const getMarketAsOf = (companyId: string): string | null => valRow(companyId)?.date ?? null

/** A listed company's P/BV — the filed market P/BV, else mkt-cap ÷ net worth. */
function peerPBV(companyId: string): number | null {
  const market = valRow(companyId)?.price_to_book
  if (typeof market === 'number') return market
  const mc = getMarketCap(companyId)
  const nw = getNetWorth(companyId)
  return mc != null && nw && nw.value > 0 ? mc / nw.value : null
}

export interface Benchmark { multiple: number; peers: { name: string; pbv: number }[]; label: string }
/** Listed-peer P/BV benchmark = the average of the other listed SAHIs' P/BV.
 *  Currently Star Health for Niva (and vice-versa); averages automatically as
 *  more listed peers gain a P/BV. Null when no listed peer P/BV is available. */
export function getBenchmark(focalId: string): Benchmark | null {
  const peers = LISTED_SAHI_PEERS
    .filter((id) => id !== focalId)
    .map((id) => ({ id, pbv: peerPBV(id) }))
    .filter((p): p is { id: string; pbv: number } => p.pbv != null)
  if (!peers.length) return null
  const multiple = peers.reduce((s, p) => s + p.pbv, 0) / peers.length
  const named = peers.map((p) => ({ name: companyShortName(p.id), pbv: p.pbv }))
  const label = named.length === 1 ? named[0].name : `${named.length} listed peers`
  return { multiple, peers: named, label }
}

export interface NavValuation {
  companyId: string
  netWorth: NetWorth | null
  shares: SharesOutstanding | null
  navPerShare: number | null
  marketCap: number | null
  marketAsOf: string | null
  benchmark: Benchmark | null
  impliedEquityValue: number | null // ₹ Cr
  impliedPerShare: number | null // ₹
  /** Current market cap vs the NAV-implied value: + = trades above NAV-implied. */
  premiumDiscountPct: number | null
}

export function buildNavValuation(companyId: string): NavValuation {
  const netWorth = getNetWorth(companyId)
  const shares = getSharesOutstanding(companyId)
  const marketCap = getMarketCap(companyId)
  const benchmark = getBenchmark(companyId)
  const navPerShare = netWorth && shares && shares.value > 0 ? (netWorth.value * CR) / shares.value : null
  const impliedEquityValue = netWorth && benchmark ? netWorth.value * benchmark.multiple : null
  const impliedPerShare = impliedEquityValue != null && shares && shares.value > 0 ? (impliedEquityValue * CR) / shares.value : null
  const premiumDiscountPct =
    impliedEquityValue != null && impliedEquityValue > 0 && marketCap != null ? (marketCap / impliedEquityValue - 1) * 100 : null
  return { companyId, netWorth, shares, navPerShare, marketCap, marketAsOf: getMarketAsOf(companyId), benchmark, impliedEquityValue, impliedPerShare, premiumDiscountPct }
}
