// Company-Specific Analysis — the SAHI insurer-by-insurer peer table that closes
// the Industry → Health → SAHI → Company story: SAHI / retail share + GDPI
// premium (FY24) alongside claims & solvency ratios (FY25), Niva Bupa highlighted.
//
// Honesty: missing peer ratios render a soft-grey "n/a" — never a fabricated 0 —
// and every column states its own period.

import { useMemo } from 'react'
import { Activity, Info } from 'lucide-react'
import { SourceTag } from '@/components/SourceTag'
import { insurers } from '@/data/mockData'
import {
  FOCAL_COMPANY_ID,
  METRICS,
  sortYears,
  TREND_COMPANIES,
  type MetricId,
} from '@/lib/marketTrends'
import sahiPeer from '@/data/snapshots/sahi-peer-comparison.json'

// ── Data helpers ────────────────────────────────────────────────────────────

/** Latest non-null value of a market-trend metric for one company (FY24 today). */
function latestVal(metricId: MetricId, companyId: string): number | null {
  const pts = METRICS[metricId].points.filter((p) => p.company === companyId)
  const at = new Map(pts.map((p) => [p.year, p.value]))
  for (const y of sortYears(pts.map((p) => p.year)).reverse()) {
    const v = at.get(y)
    if (v != null) return v
  }
  return null
}

interface PeerRatio {
  claims_ratio: number | null
  solvency_ratio: number | null
}
const PEER_BY_CO = new Map<string, PeerRatio>(
  (sahiPeer.data as Array<{ company_id: string; claims_ratio: number | null; solvency_ratio: number | null }>).map(
    (d) => [d.company_id, { claims_ratio: d.claims_ratio, solvency_ratio: d.solvency_ratio }],
  ),
)
const LISTED_BY_CO = new Map(insurers.map((i) => [i.id, i.ticker.trim().length > 0]))

interface PeerRow {
  id: string
  name: string
  color: string
  focal: boolean
  listed: boolean
  isLeader: boolean
  rank: number
  sahiShare: number | null
  retailShare: number | null
  gdpi: number | null
  claims: number | null
  solvency: number | null
}

function buildPeerRows(): PeerRow[] {
  const rows = TREND_COMPANIES.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    focal: c.id === FOCAL_COMPANY_ID,
    listed: LISTED_BY_CO.get(c.id) ?? false,
    isLeader: false,
    rank: 0,
    sahiShare: latestVal('sahi_share', c.id),
    retailShare: latestVal('retail_share', c.id),
    gdpi: latestVal('gdpi', c.id),
    claims: PEER_BY_CO.get(c.id)?.claims_ratio ?? null,
    solvency: PEER_BY_CO.get(c.id)?.solvency_ratio ?? null,
  }))
  rows.sort((a, b) => (b.sahiShare ?? -1) - (a.sahiShare ?? -1))
  rows.forEach((r, i) => {
    r.rank = i + 1
    r.isLeader = i === 0
  })
  return rows
}

const PEER_SOURCE = {
  source_name:
    'SAHI & retail share + overall-health GDPI from Niva Bupa DRHP (Redseer, Exhibits 40–41), FY24. Claims & solvency ratios from per-insurer FY25 public disclosures (sahi-peer-comparison snapshot). Premium metric — not profit.',
  source_url: METRICS.gdpi.source.source_url,
  fetched_at: METRICS.gdpi.source.fetched_at,
}


// ── Peer Metrics table ──────────────────────────────────────────────────────

function Badge({ label, tone }: { label: string; tone: 'gold' | 'navy' | 'slate' }) {
  const c =
    tone === 'gold'
      ? 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]'
      : tone === 'navy'
        ? 'bg-soft-blue text-navy-primary ring-[#D6E2FA]'
        : 'bg-ice text-ink-secondary ring-soft-border'
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide ring-1 ${c}`}>
      {label}
    </span>
  )
}

/** Numeric cell — soft-grey "n/a" when the source has no value (never a fake 0). */
function Cell({ text, available, strong }: { text: string; available: boolean; strong?: boolean }) {
  return (
    <td className="py-2 pl-2 text-right tabular-nums">
      <span className={available ? (strong ? 'font-semibold text-navy-deep' : 'text-ink-primary') : 'text-ink-secondary/45'}>
        {available ? text : 'n/a'}
      </span>
    </td>
  )
}

function ColHead({ label, period }: { label: string; period: string }) {
  return (
    <th className="py-2 pl-2 text-right align-bottom font-semibold text-navy-deep/80">
      <span className="block leading-tight">{label}</span>
      <span className="block text-[8.5px] font-medium uppercase tracking-wide text-ink-secondary/70">{period}</span>
    </th>
  )
}

function PeerMetricsTable() {
  const rows = useMemo(buildPeerRows, [])
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-soft-border bg-ice/60 text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
            <th className="rounded-l-lg py-2 pl-2.5 font-semibold">#</th>
            <th className="py-2 pl-2 font-semibold text-navy-deep/80">Insurer</th>
            <th className="py-2 pl-2 font-semibold text-navy-deep/80">Type</th>
            <ColHead label="SAHI Share" period="FY24" />
            <ColHead label="Retail Share" period="FY24" />
            <ColHead label="GDPI Premium" period="FY24" />
            <ColHead label="Claims Ratio" period="FY25" />
            <th className="rounded-r-lg py-2 pl-2 pr-2.5 text-right align-bottom font-semibold text-navy-deep/80">
              <span className="block leading-tight">Solvency</span>
              <span className="block text-[8.5px] font-medium uppercase tracking-wide text-ink-secondary/70">FY25</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={[
                'border-b border-[#F1F3F8] transition-colors',
                r.focal ? 'bg-soft-blue/40' : 'hover:bg-ice/40',
              ].join(' ')}
            >
              <td className="py-2 pl-2.5 text-ink-secondary tabular-nums">{r.rank}</td>
              <td className="py-2 pl-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className={r.focal ? 'font-semibold text-navy-deep' : 'font-medium text-ink-primary'}>{r.name}</span>
                  {r.isLeader && <Badge label="Leader" tone="gold" />}
                  {r.focal && <Badge label="Selected" tone="navy" />}
                </div>
              </td>
              <td className="py-2 pl-2">
                <Badge label={r.listed ? 'Listed' : 'Unlisted'} tone="slate" />
              </td>
              <Cell text={r.sahiShare != null ? `${r.sahiShare.toFixed(1)}%` : ''} available={r.sahiShare != null} strong={r.focal} />
              <Cell text={r.retailShare != null ? `${r.retailShare.toFixed(1)}%` : ''} available={r.retailShare != null} />
              <Cell text={r.gdpi != null ? METRICS.gdpi.format(r.gdpi) : ''} available={r.gdpi != null} />
              <Cell text={r.claims != null ? `${r.claims.toFixed(1)}%` : ''} available={r.claims != null} />
              <td className="py-2 pl-2 pr-2.5 text-right tabular-nums">
                <span className={r.solvency != null ? 'text-ink-primary' : 'text-ink-secondary/45'}>
                  {r.solvency != null ? `${r.solvency.toFixed(2)}x` : 'n/a'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-1 text-[9.5px] leading-relaxed text-ink-secondary">
        Share &amp; premium on an FY24 basis (DRHP · Redseer); claims &amp; solvency FY25 (latest disclosed). Blank cells show
        <span className="text-ink-secondary/60"> n/a</span> where a source value isn&rsquo;t yet available — never inferred.
      </p>
    </div>
  )
}

// ── Section ─────────────────────────────────────────────────────────────────

export function CompanySpecificAnalysis() {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="h-3 w-[3px] rounded-full bg-champagne" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Company-Specific Analysis</span>
        <span className="text-[11px] text-ink-secondary">FY24–FY25 · Standalone health insurers</span>
      </div>

      {/* Peer Metrics — full width. */}
      <div className="card-surface flex min-w-0 flex-col p-4 sm:p-5">
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <Activity className="h-4 w-4 text-navy-primary" />
          <p className="font-display text-[14px] text-navy-deep">Peer Metrics · Standalone health insurers</p>
          <span
            className="cursor-default text-ink-secondary/60"
            title="Sorted by SAHI-pool share. Navy = selected (Niva Bupa) · gold = leader. n/a where a source value isn’t yet available."
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </div>

        <PeerMetricsTable />

        <div className="mt-3 flex justify-end pt-1">
          <SourceTag source="IRDAI + Company filing" period="FY24–FY25" confidence="high" provenance={PEER_SOURCE} />
        </div>
      </div>
    </section>
  )
}
