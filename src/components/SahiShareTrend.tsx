// SAHI Share by Year — one compact table, three small toggles that swap the
// *denominator* the share is measured against:
//   • Segment — share among the five SAHIs (Star, Care, Niva Bupa, Aditya, ManipalCigna)
//   • Retail  — share of the whole retail-health insurance market
//   • Overall — share of the entire health market (incl. group & government)
//
// All figures are GDPI (premiums written) — a premium metric, not profit — and
// come straight from the Niva Bupa DRHP (Redseer Report, Exhibits 40 & 41).
// Missing values render as "n/a", never as 0.

import { useState } from 'react'
import { Info, TrendingUp } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { SourceTag } from './SourceTag'
import { MiniSparkline } from './MiniSparkline'
import snapshot from '@/data/snapshots/sahi-share-history.json'

type Basis = 'segment' | 'retail' | 'overall'
type Period = 'FY22' | 'FY23' | 'FY24'
type ShareField = 'segment_share_pct' | 'retail_share_pct' | 'overall_share_pct'

const PERIODS: Period[] = ['FY22', 'FY23', 'FY24']

// Per-company accents — kept identical to the rest of the dashboard.
const COMPANY_COLORS: Record<string, string> = {
  'star-health': '#B68B3A', // champagne / gold
  'care-health': '#168E8E', // teal
  'niva-bupa': '#27457E', // navy
  'aditya-birla': '#3D5F9F', // steel blue
  manipalcigna: '#8C97A8', // muted blue-grey
}
const FOCAL_ID = 'niva-bupa'

interface ShareRow {
  company_id: string
  short_name: string
  segment_share_pct: Record<Period, number | null>
  retail_share_pct: Record<Period, number | null>
  overall_share_pct: Record<Period, number | null>
}

const BASIS_OPTS: { value: Basis; label: string }[] = [
  { value: 'segment', label: 'Segment' },
  { value: 'retail', label: 'Retail' },
  { value: 'overall', label: 'Overall' },
]

const BASIS_META: Record<
  Basis,
  { field: ShareField; basisLabel: string; takeaway: string; computed?: boolean }
> = {
  segment: {
    field: 'segment_share_pct',
    basisLabel:
      'Share among the five SAHIs — Star, Care, Niva Bupa, Aditya Birla, ManipalCigna (% of their combined retail-health premiums)',
    takeaway:
      'Star still leads the standalone pack but has ceded ~6 points since FY22 — Niva Bupa and Care are the share-gainers, each now ~16%.',
    computed: true,
  },
  retail: {
    field: 'retail_share_pct',
    basisLabel: 'Share of the whole retail-health insurance market (% of all-India retail-health premiums)',
    takeaway:
      'Standalone insurers now hold 56% of retail health. Niva Bupa is the #4 player overall — up from 7.0% to 9.1% in two years.',
  },
  overall: {
    field: 'overall_share_pct',
    basisLabel:
      'Share of the entire health insurance market, incl. group & government (% of all-India health premiums)',
    takeaway:
      'On the all-in health market the public insurers still dominate; among standalones, Niva Bupa nearly doubled its slice — 3.8% to 5.1%.',
  },
}

const TIP =
  "Each insurer's market share across FY22–FY24. Toggle the denominator — Segment: among the 5 SAHIs · Retail: of the retail-health market · Overall: of the entire health market. Figures are GDPI (premiums written), not profit."

export function SahiShareTrend() {
  const [basis, setBasis] = useState<Basis>('retail')
  const meta = BASIS_META[basis]
  const rows = snapshot.data as ShareRow[]

  const valOf = (r: ShareRow, p: Period): number | null => r[meta.field][p]

  // Rank by the selected basis's FY24 value (nulls sink to the bottom).
  const sorted = [...rows].sort((a, b) => (valOf(b, 'FY24') ?? -Infinity) - (valOf(a, 'FY24') ?? -Infinity))

  return (
    <div className="card-surface flex min-w-0 flex-col p-4 sm:p-5">
      {/* Title + the three small toggles */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-navy-primary" />
          <p className="font-display text-[14px] text-navy-deep">SAHI Share by Year</p>
          <span className="cursor-default text-ink-secondary/60" title={TIP}>
            <Info className="h-3.5 w-3.5" />
          </span>
        </div>
        <SegmentedControl size="sm" options={BASIS_OPTS} value={basis} onChange={setBasis} />
      </div>

      {/* Honest basis tags — what the % is measured against + premium≠profit */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
          {meta.basisLabel}
        </span>
        <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
          GDPI · premium, not profit
        </span>
        <span className="text-[10px] text-ink-secondary">FY22–FY24</span>
      </div>

      {/* The single table — rows = the 5 SAHIs, columns = the 3 years + Δ + trend */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#F4F7FC] text-[8.5px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
              <th className="rounded-l-lg px-1 py-2 text-center font-semibold">#</th>
              <th className="px-1 py-2 text-left font-semibold">Insurer</th>
              {PERIODS.map((p) => (
                <th key={p} className="px-1 py-2 text-right font-semibold">
                  {p}
                </th>
              ))}
              <th className="px-1 py-2 text-right font-semibold">Δ FY22→24</th>
              <th className="rounded-r-lg px-2 py-2 text-right font-semibold">Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const color = COMPANY_COLORS[r.company_id] ?? '#6E7E96'
              const focal = r.company_id === FOCAL_ID
              const isLeader = idx === 0
              const series = PERIODS.map((p) => valOf(r, p))
              const first = series[0]
              const last = series[series.length - 1]
              const delta = first != null && last != null ? last - first : null
              const rowBg = focal
                ? 'rgba(39,69,126,0.06)'
                : isLeader
                  ? 'rgba(182,139,58,0.045)'
                  : undefined
              return (
                <tr
                  key={r.company_id}
                  className="border-b border-soft-border/60 transition-colors last:border-0 hover:bg-ice/50"
                  style={rowBg ? { background: rowBg } : undefined}
                >
                  <td className="px-1 py-2.5 text-center align-middle">
                    <span className="font-display text-[12.5px] font-semibold tabular-nums text-navy-deep">
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-1 py-2.5 align-middle">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                      <span
                        className={`truncate text-[11.5px] font-semibold ${focal ? 'text-navy-deep' : 'text-ink-primary'}`}
                      >
                        {r.short_name}
                      </span>
                      {isLeader && (
                        <span className="shrink-0 rounded-full bg-champagne-soft px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-champagne-deep">
                          Leader
                        </span>
                      )}
                      {focal && !isLeader && (
                        <span className="shrink-0 rounded-full bg-soft-blue px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-navy-primary">
                          Niva Bupa
                        </span>
                      )}
                    </div>
                  </td>
                  {series.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-1 py-2.5 text-right align-middle tabular-nums">
                      {v != null ? (
                        <span className="font-medium text-navy-deep">
                          {v.toFixed(1)}
                          <span className="text-[9px] text-ink-secondary/70">%</span>
                        </span>
                      ) : (
                        <span className="italic text-ink-secondary/40">n/a</span>
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-1 py-2.5 text-right align-middle tabular-nums">
                    {delta != null ? (
                      <span
                        className={`font-semibold ${delta > 0.05 ? 'text-emerald' : delta < -0.05 ? 'text-coral' : 'text-ink-secondary'}`}
                      >
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(1)} pp
                      </span>
                    ) : (
                      <span className="italic text-ink-secondary/40">n/a</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 align-middle">
                    <div className="flex justify-end">
                      {series.every((v) => v != null) ? (
                        <MiniSparkline data={series as number[]} width={64} height={22} color={color} />
                      ) : (
                        <span className="text-[10px] italic text-ink-secondary/40">n/a</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* "So what" takeaway (left) + clickable source chip (right) */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-1">
        <p className="max-w-xl text-[11.5px] leading-relaxed text-ink-secondary">
          <span className="font-semibold text-navy-deep">So what — </span>
          {meta.takeaway}
          {meta.computed && (
            <span className="italic text-ink-secondary/75">
              {' '}
              Segment shares are computed from retail-health premiums; they match the DRHP&rsquo;s reported Niva
              Bupa share (16.24% in FY24).
            </span>
          )}
        </p>
        <SourceTag
          source="Company filing"
          period="FY22–FY24"
          frequency="Annual"
          confidence="high"
          provenance={{
            source_name: snapshot._meta.source.source_name,
            source_url: snapshot._meta.source.source_url,
            fetched_at: snapshot._meta.source.fetched_at,
          }}
        />
      </div>
    </div>
  )
}
