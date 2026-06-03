import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { insurers } from '@/data/mockData'
import { useFilters } from '@/state/filters'
import { EmptyState } from './EmptyState'
import { SourceTag } from './SourceTag'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import { formatRange, fyLabelsInRange } from '@/lib/dateRange'

// Color meaning (financial story): deep navy = gross written premium / the
// foundation (GWP); rich teal = retained / healthy quality (NWP); steel blue =
// earned / realized (NEP). Three measures, three bars, side by side per year.
const GWP_COLOR = '#234A84'
const NWP_COLOR = '#148A87'
const NEP_COLOR = '#4D7EA8'
const GRID = '#ECEFF5'
const AXIS_TEXT = '#6B7280'

const fmtCr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`

interface Row {
  period: string
  gwp: number | null
  nwp: number | null
  nep: number | null
}

const SERIES: { key: 'gwp' | 'nwp' | 'nep'; name: string; abbr: string; color: string }[] = [
  { key: 'gwp', name: 'Gross written', abbr: 'GWP', color: GWP_COLOR },
  { key: 'nwp', name: 'Net written', abbr: 'NWP', color: NWP_COLOR },
  { key: 'nep', name: 'Net earned', abbr: 'NEP', color: NEP_COLOR },
]

/** Multi-series tooltip — period, each reported measure, and the retention ratio.
 *  Null (not disclosed) measures are dropped so a missing value never reads as 0. */
function PremiumTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number | null; color: string; dataKey: string }[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const rows = payload.filter((p) => typeof p.value === 'number')
  if (rows.length === 0) return null
  const get = (k: string) => {
    const v = payload.find((p) => p.dataKey === k)?.value
    return typeof v === 'number' ? v : null
  }
  const gwp = get('gwp')
  const nwp = get('nwp')
  const retention = gwp != null && nwp != null && gwp > 0 ? (nwp / gwp) * 100 : null
  return (
    <div className="rounded-xl border border-[#E5E8EF] bg-white/96 px-3 py-2 shadow-[0_8px_22px_rgba(23,43,77,0.1)] backdrop-blur">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="space-y-0.5">
        {rows.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums text-navy-deep">{fmtCr(p.value as number)}</span>
          </div>
        ))}
      </div>
      {retention != null && (
        <p className="mt-1.5 border-t border-soft-border pt-1.5 text-[10.5px] text-ink-secondary">
          Retention <span className="font-semibold tabular-nums text-navy-deep">{retention.toFixed(0)}%</span> · net ÷ gross
        </p>
      )}
    </div>
  )
}

// --- Module shell ------------------------------------------------------------

export function PremiumFlowQuality({ focalId }: { focalId: string }) {
  const { period: globalPeriod, range } = useFilters()
  const rangeLabel = formatRange(range, globalPeriod)
  const company = insurers.find((c) => c.id === focalId) ?? insurers[0]
  const name = company?.shortName ?? 'Company'

  // Premium written / retained / earned is reported per fiscal year, not per
  // quarter or month. Honour the global Period toggle with an explicit state.
  if (globalPeriod !== 'Annual') {
    return (
      <div className="card-surface p-4 sm:p-5">
        <EmptyState
          title={`${globalPeriod} premium not reported from source`}
          body={`Gross / net / earned premium for ${name} is disclosed annually. Switch Period to Annual; use the Data Range to narrow the years.`}
          height={300}
        />
      </div>
    )
  }

  // Real annual rows for this company, range-filtered. Years with no sourced row
  // stay null-valued (a labelled gap) rather than dropped, so the axis never
  // implies a value where the source is silent. Never fabricates a missing year.
  const allCompanyRows = (annualSnapshot.data as Array<{
    company_id: string
    fiscal_year: string
    gwp: number | null
    gross_direct_premium?: number | null
    nwp: number | null
    nep: number | null
  }>)
    .filter((r) => r.company_id === focalId && typeof r.gwp === 'number')
    .sort((a, b) => a.fiscal_year.localeCompare(b.fiscal_year))

  const yearsInRange = fyLabelsInRange(range)
  const reportedByFy = new Map(allCompanyRows.map((r) => [r.fiscal_year, r]))

  // The "Gross" bar uses the Revenue-Account gross direct premium when present,
  // so gross ≥ net ≥ earned stay on one consistent basis (cession reads true).
  // Where that differs materially from headline GWP (IRDAI 1/n long-term rule,
  // e.g. Niva Bupa FY25) we surface a compact note.
  const oneByN: string[] = []
  const rows: Row[] = yearsInRange.map((fy) => {
    const r = reportedByFy.get(fy)
    if (!r) return { period: fy, gwp: null, nwp: null, nep: null }
    const gross = typeof r.gross_direct_premium === 'number' ? r.gross_direct_premium : r.gwp
    if (
      typeof r.gross_direct_premium === 'number' &&
      typeof r.gwp === 'number' &&
      Math.abs(r.gwp - r.gross_direct_premium) > Math.max(50, r.gwp * 0.02)
    ) {
      oneByN.push(fy)
    }
    return { period: fy, gwp: gross, nwp: r.nwp, nep: r.nep }
  })

  if (allCompanyRows.length === 0) {
    return (
      <div className="card-surface p-4 sm:p-5">
        <EmptyState
          title={`Annual premium history not yet ingested for ${name}`}
          body="ingest-company-disclosures.ts will populate per-year GWP / NWP / NEP from the company's annual report on the next scheduled run."
          height={300}
        />
      </div>
    )
  }
  if (rows.every((r) => r.gwp == null)) {
    return (
      <div className="card-surface p-4 sm:p-5">
        <EmptyState
          title="Data not available from source"
          body={`No reported premium years for ${name} fall inside ${rangeLabel}. Widen the Data Range in the top bar.`}
          height={300}
        />
      </div>
    )
  }

  const basisNote =
    oneByN.length >= 1
      ? `${oneByN.join(', ')} gross premium shown on IRDAI 1/n basis. Headline GWP may differ.`
      : undefined

  // Missing years carry a small italic "n/a" under the axis label so an empty
  // slot reads as "source silent", never as zero.
  const missingYears = new Set(rows.filter((r) => r.gwp == null).map((r) => r.period))
  const PeriodTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => {
    const fy = payload?.value ?? ''
    return (
      <g transform={`translate(${x ?? 0},${y ?? 0})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#26303F">
          {fy}
        </text>
        {missingYears.has(fy) && (
          <text x={0} y={0} dy={25} textAnchor="middle" fontSize={9} fontStyle="italic" fill="#9AA6B6">
            n/a
          </text>
        )}
      </g>
    )
  }

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Clean chart title — no toggles. */}
      <div className="flex items-center gap-2.5">
        <span className="h-5 w-1.5 rounded-full" style={{ background: GWP_COLOR }} />
        <h3 className="font-display text-[18px] leading-tight text-navy-deep">Gross → Net → Earned premium by year</h3>
      </div>
      <p className="mt-1 pl-4 text-[12px] text-ink-secondary">
        <span className="font-semibold text-navy-deep">{name}</span> · {rangeLabel} · ₹ Cr
      </p>

      <div className="mt-4 w-full" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 8 }} barCategoryGap="26%" barGap={4}>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
            <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={<PeriodTick />} height={40} interval={0} />
            <YAxis
              tickFormatter={(v: number) => `${(v / 1000).toLocaleString('en-IN')}k`}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              width={44}
            />
            <Tooltip cursor={{ fill: 'rgba(39,69,126,0.05)' }} content={<PremiumTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: 11.5, paddingBottom: 8 }}
              formatter={(value) => {
                const s = SERIES.find((x) => x.name === value)
                return (
                  <span style={{ color: '#475569' }}>
                    {value}
                    {s ? <span style={{ color: '#94A3B8', fontWeight: 700 }}> · {s.abbr}</span> : null}
                  </span>
                )
              }}
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} maxBarSize={34} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {basisNote && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-soft-border bg-ice/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-ink-secondary">
          <span aria-hidden className="mt-px text-[11px] font-bold text-navy-primary/70">&#9432;</span>
          <span>{basisNote}</span>
        </p>
      )}

      {/* Footer — legend keys + honest basis + source. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-soft-border pt-2.5 text-[10.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm border border-dashed border-[#C7D2E0] bg-[#F4F7FC]" />
          Missing = not disclosed
        </span>
        <span>·</span>
        <span>Premium metrics, not profit</span>
        <span className="ml-auto">
          <SourceTag
            source="Company filing"
            confidence="high"
            period={rangeLabel}
            provenance={{
              source_name: `${name} annual disclosures — written / retained / earned premium per year`,
              source_url: 'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf',
            }}
          />
        </span>
      </div>
    </div>
  )
}
