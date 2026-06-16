import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { insurers } from '@/data/mockData'
import { useFilters } from '@/state/filters'
import { EmptyState } from './EmptyState'
import { SourceTag } from './SourceTag'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import quarterlyFinancials from '@/data/snapshots/insurer-quarterly-financials.json'
import gicHealthQuarterly from '@/data/snapshots/gic-health-quarterly.json'
import { formatRange, fyLabelsInRange, periodLabelsInRange } from '@/lib/dateRange'

// Color meaning (financial story): deep navy = gross written premium / the
// foundation (GWP); rich teal = retained / healthy quality (NWP); steel blue =
// earned / realized (NEP). Three measures, three bars, side by side per period.
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

// ── Quarterly premium (₹ Cr) per "Qx FYyy" label ────────────────────────────
// GWP comes from the GI Council quarterly health filing (`health_total`) — for a
// STANDALONE health insurer that is the total written premium. NWP / NEP come
// from the company's quarterly results when filed (insurer-quarterly-financials),
// else null → an honest "n/a", never zero.
interface GicHealthQRow { period: string; entity: string; health_total: number | null }
interface QuarterlyFinRow { company_id: string; quarter: string; fiscal_year: string; nwp: number | null; nep: number | null }
const Q_FY = /^Q([1-4])FY(\d{2})$/

function quarterlyPremiumMap(companyId: string): Map<string, { gwp: number | null; nwp: number | null; nep: number | null }> {
  const map = new Map<string, { gwp: number | null; nwp: number | null; nep: number | null }>()
  const at = (label: string) => map.get(label) ?? { gwp: null, nwp: null, nep: null }
  for (const r of gicHealthQuarterly.data as GicHealthQRow[]) {
    if (r.entity !== companyId) continue
    const m = Q_FY.exec(r.period)
    if (!m) continue
    const label = `Q${m[1]} FY${m[2]}`
    const e = at(label)
    if (typeof r.health_total === 'number') e.gwp = r.health_total
    map.set(label, e)
  }
  for (const r of quarterlyFinancials.data as QuarterlyFinRow[]) {
    if (r.company_id !== companyId) continue
    const label = `${r.quarter} ${r.fiscal_year}`
    const e = at(label)
    if (typeof r.nwp === 'number') e.nwp = r.nwp
    if (typeof r.nep === 'number') e.nep = r.nep
    map.set(label, e)
  }
  return map
}

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
  const quarterly = globalPeriod === 'Quarterly'
  const unit = quarterly ? 'quarter' : 'year'

  // Build the per-period rows for the active Period. Periods with no sourced row
  // stay null-valued (a labelled gap) rather than dropped, so the axis never
  // implies a value where the source is silent. Never fabricates a missing one.
  let rows: Row[]
  let basisNote: string | undefined
  let noHistory = false

  if (quarterly) {
    // Quarterly: GWP from the GI Council quarterly health filing (= total written
    // for a standalone health insurer); NWP / NEP from the quarterly results.
    const labels = periodLabelsInRange(range, 'Quarterly')
    const qmap = quarterlyPremiumMap(focalId)
    rows = labels.map((l) => {
      const e = qmap.get(l)
      return { period: l, gwp: e?.gwp ?? null, nwp: e?.nwp ?? null, nep: e?.nep ?? null }
    })
    noHistory = quarterlyPremiumMap(focalId).size === 0
    basisNote = `Quarterly gross premium from GI Council health filings (= total written premium for a standalone health insurer). Net / earned shown where the company has filed the quarter.`
  } else {
    // Annual: per-year GWP / NWP / NEP from the company's annual disclosures.
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
    noHistory = allCompanyRows.length === 0
    const reportedByFy = new Map(allCompanyRows.map((r) => [r.fiscal_year, r]))
    // The "Gross" bar uses the Revenue-Account gross direct premium when present,
    // so gross ≥ net ≥ earned stay on one consistent basis (cession reads true).
    // Where that differs materially from headline GWP (IRDAI 1/n long-term rule,
    // e.g. Niva Bupa FY25) we surface a compact note.
    const oneByN: string[] = []
    rows = fyLabelsInRange(range).map((fy) => {
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
    basisNote = oneByN.length >= 1 ? `${oneByN.join(', ')} gross premium shown on IRDAI 1/n basis. Headline GWP may differ.` : undefined
  }

  if (noHistory) {
    return (
      <div className="card-surface p-4 sm:p-5">
        <EmptyState
          title={`${quarterly ? 'Quarterly' : 'Annual'} premium not yet ingested for ${name}`}
          body={
            quarterly
              ? `Per-quarter premium for ${name} will populate from the GI Council quarterly filing + the company's quarterly results on the next scheduled run.`
              : `Per-year GWP / NWP / NEP for ${name} will populate from the company's annual report on the next scheduled run.`
          }
          height={300}
        />
      </div>
    )
  }
  if (rows.every((r) => r.gwp == null && r.nwp == null && r.nep == null)) {
    return (
      <div className="card-surface p-4 sm:p-5">
        <EmptyState
          title="Data not available from source"
          body={`No reported premium ${unit}s for ${name} fall inside ${rangeLabel}. Widen the Data Range in the top bar.`}
          height={300}
        />
      </div>
    )
  }

  // Missing periods carry a small italic "n/a" under the axis label so an empty
  // slot reads as "source silent", never as zero.
  const missingPeriods = new Set(rows.filter((r) => r.gwp == null && r.nwp == null && r.nep == null).map((r) => r.period))
  const PeriodTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => {
    const p = payload?.value ?? ''
    return (
      <g transform={`translate(${x ?? 0},${y ?? 0})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#26303F">
          {p}
        </text>
        {missingPeriods.has(p) && (
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
        <h3 className="font-display text-[18px] leading-tight text-navy-deep">Gross → Net → Earned premium by {unit}</h3>
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
              source_name: quarterly
                ? `${name} quarterly results + GI Council quarterly health filings — written / earned premium per quarter`
                : `${name} annual disclosures — written / retained / earned premium per year`,
              source_url: 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
            }}
          />
        </span>
      </div>
    </div>
  )
}
