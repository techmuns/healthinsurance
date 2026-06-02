import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { insurers } from '@/data/mockData'
import { useFilters } from '@/state/filters'
import { EmptyState } from './EmptyState'
import { SourceTag } from './SourceTag'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import { distributionEngineMix, DIST_CHANNELS } from '@/lib/distributionEngine'
import { formatRange, fyLabelsInRange, labelInRange } from '@/lib/dateRange'

type Period = 'Quarterly' | 'Yearly'
type Tab = 'Flow' | 'Mix' | 'Retention'
type Stage = 'GWP' | 'NWP' | 'NEP'

// Color meaning (financial story): deep navy = written premium / foundation
// (GWP); rich teal = retained / healthy quality (NWP); muted terracotta =
// ceded / leakage / friction; steel blue = earned / realized (NEP); soft mist
// grey = inactive context. Mix-tab support colours stay as semantic accents.
const FOCAL = '#234A84'      // GWP — deep navy
const TEAL = '#148A87'       // NWP — rich teal
const NEP_BLUE = '#4D7EA8'   // NEP — steel blue
const RED = '#C97A6B'        // ceded / leakage — muted terracotta
const GOLD = '#B68B3A'
const GREEN = '#3F9B6B'
const GREY = '#94A3B8'
const GRID = '#ECEFF5'
const AXIS_TEXT = '#6B7280'

const fmtCr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const pct = (v: number, d = 0) => `${v.toFixed(d)}%`

/** hex + alpha → rgba(), for soft gradient/tint fills. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

interface Chip {
  label: string
  value: string
  note?: string
  color: string
}

/** Slim horizontal insight pills — the shared insight treatment for all tabs. */
function SlimStrip({ chips }: { chips: Chip[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div key={c.label} className="flex items-center gap-2 rounded-lg border border-soft-border bg-ice/50 px-3 py-1.5">
          <span className="h-4 w-1 rounded-full" style={{ background: c.color }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{c.label}</span>
          <span className="font-display text-[15px] leading-none text-navy-deep">{c.value}</span>
          {c.note && (
            <span className="text-[10.5px] font-semibold" style={{ color: GOLD }}>
              {c.note}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
      {children}
    </span>
  )
}

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const tabs: Tab[] = ['Flow', 'Mix', 'Retention']
  return (
    <div className="flex items-center gap-1">
      {tabs.map((t) => {
        const active = t === value
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={['relative px-3 py-1.5 text-[13.5px] font-semibold transition-colors', active ? 'text-navy-deep' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}
          >
            {t}
            {active && <span className="absolute inset-x-2.5 -bottom-0.5 h-[2.5px] rounded-full" style={{ background: GOLD }} />}
          </button>
        )
      })}
    </div>
  )
}

function LegendSwatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-secondary">
      <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  )
}


/** Small leakage / ratio callout pill — the shared treatment for the
 *  contextual strip under the Premium Engine bars. */
function CalloutPill({ color, label, value, muted = false }: { color: string; label: string; value: string; muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-soft-border bg-ice/60 px-2 py-1">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      <span className={['text-[12px] font-semibold tabular-nums', muted ? 'text-ink-secondary' : 'text-navy-deep'].join(' ')}>{value}</span>
    </span>
  )
}

/**
 * RealFlowChart — the Premium Engine "lens".
 *
 * One fixed-width, fixed-position bar per fiscal year whose FULL height is that
 * year's gross written premium (the GWP base). The stage toggle (Gross · GWP /
 * Retained · NWP / Earned · NEP) is a lens: the bar never moves or resizes —
 * only its fill changes. The strongly-coloured region recedes GWP → NWP → NEP
 * while the portion above fades to muted blue-grey leakage bands:
 *   • reinsurance leakage = GWP − NWP   (ceded to reinsurers)
 *   • timing leakage      = NWP − NEP   (unearned-premium movement)
 *
 * The value pill glides down with the fill (600ms ease-in-out) so the same
 * premium bar visibly reduces step by step; bands cross-fade their colour
 * (~520ms). Missing values are never zero — a year with no GWP renders a
 * hatched n/a placeholder, and a year missing the active metric renders a
 * muted "n/a" bar.
 *
 * Data semantics preserved: the flow uses the Revenue-Account gross premium
 * (passed in as `gwp`) so cession reads true, the 1/n `basisNote` still
 * surfaces, and the company-filing source stays in the footer.
 */
function RealFlowChart({
  rows,
  companyName,
  basisNote,
}: {
  rows: Array<{ fiscal_year: string; gwp: number | null; nwp: number | null; nep: number | null }>
  companyName: string
  basisNote?: string
}) {
  const [stage, setStage] = useState<Stage>('GWP')
  const [hover, setHover] = useState<number | null>(null)

  // Strong, on-brand fills per lens + calm muted blue-greys for leakage (never
  // red — leakage is friction, not a risk event). Reinsurance sits a touch
  // deeper than timing so the two leakage zones read as distinct in Earned view.
  const STRONG: Record<Stage, string> = { GWP: FOCAL, NWP: TEAL, NEP: NEP_BLUE }
  const MUTE_REINS = '#C79A48'
  const MUTE_TIMING = '#9AA6B6'

  const stageMeta: Record<Stage, { word: string; abbrev: Stage; meaning: string }> = {
    GWP: { word: 'Gross', abbrev: 'GWP', meaning: 'Total premium written during the year.' },
    NWP: { word: 'Retained', abbrev: 'NWP', meaning: 'What remains after reinsurance.' },
    NEP: { word: 'Earned', abbrev: 'NEP', meaning: 'The part recognized during the period.' },
  }
  const active = stageMeta[stage]
  const stageKey: 'gwp' | 'nwp' | 'nep' = stage === 'GWP' ? 'gwp' : stage === 'NWP' ? 'nwp' : 'nep'

  // Per-year computed record + back-walk to the previous *reported* year for YoY.
  const data = rows.map((r, i) => {
    const gwp = r.gwp
    const nwp = r.nwp
    const nep = r.nep
    const sel = r[stageKey]
    let prev: number | null = null
    let prevPeriod: string | null = null
    for (let j = i - 1; j >= 0; j--) {
      const v = rows[j][stageKey]
      if (v != null) {
        prev = v
        prevPeriod = rows[j].fiscal_year
        break
      }
    }
    const yoyPct = sel != null && prev != null && prev > 0 ? (sel / prev - 1) * 100 : null
    const reinsuranceLeakage = gwp != null && nwp != null ? gwp - nwp : null
    const timingLeakage = nwp != null && nep != null ? nwp - nep : null
    const retentionRatio = gwp != null && nwp != null && gwp > 0 ? (nwp / gwp) * 100 : null
    const earnedOnGross = gwp != null && nep != null && gwp > 0 ? (nep / gwp) * 100 : null
    return { period: r.fiscal_year, gwp, nwp, nep, sel, prevPeriod, yoyPct, reinsuranceLeakage, timingLeakage, retentionRatio, earnedOnGross }
  })

  const maxGwp = Math.max(1, ...data.map((d) => d.gwp ?? 0))
  const PLOT = 218 // px — height of the tallest (GWP) bar
  const stageReported = data.filter((d) => d.sel != null).length

  // The contextual callout follows the hovered year, else the latest reported.
  const latest = [...data].reverse().find((d) => d.gwp != null) ?? data[data.length - 1]
  const focus = hover != null && data[hover] ? data[hover] : latest

  return (
    <div>
      {/* Lens toggle + plain-English meaning of the active metric. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
        <div className="inline-flex items-center gap-1 rounded-full bg-ice p-0.5 ring-1 ring-soft-border">
          {(Object.keys(stageMeta) as Stage[]).map((s) => {
            const meta = stageMeta[s]
            const isActive = stage === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                className={[
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-all duration-200',
                  isActive ? 'bg-navy-primary text-white shadow-soft' : 'text-ink-secondary hover:text-navy-deep',
                ].join(' ')}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: isActive ? '#FFFFFF' : STRONG[s], opacity: isActive ? 0.9 : 0.75 }} />
                {meta.word}
                <span
                  className={['rounded px-1 py-px text-[9px] font-bold tracking-wider', isActive ? 'bg-white/20 text-white' : 'bg-soft-blue text-navy-primary/80'].join(' ')}
                >
                  {meta.abbrev}
                </span>
              </button>
            )
          })}
        </div>
        <div className="text-[10px] text-ink-secondary">
          {stageReported} of {data.length} yrs · <span className="font-semibold text-navy-deep">{active.meaning}</span>
        </div>
      </div>

      {/* Plot — fixed-position bars; only the fill changes between lenses. */}
      <div className="pt-8">
        <div className="relative flex items-end justify-between gap-2 border-b border-soft-border sm:gap-5" style={{ height: PLOT }}>
          {data.map((d, i) => {
            const hasGwp = d.gwp != null
            const dim = hover != null && hover !== i ? 0.82 : 1
            // Column body — bottom-aligned bar so all bars share one baseline.
            let body: JSX.Element
            if (!hasGwp) {
              body = (
                <div
                  className="w-full max-w-[68px] rounded-t-[5px] border border-dashed border-[#C7D2E0]"
                  style={{ height: 14, background: 'repeating-linear-gradient(45deg,#F4F7FC 0 4px,#E8EEF5 4px 8px)' }}
                  title="Data not available from source"
                />
              )
            } else if (d.sel == null) {
              // GWP exists but the active metric is not reported this year.
              const barH = (d.gwp! / maxGwp) * PLOT
              body = (
                <div
                  className="flex w-full max-w-[68px] items-center justify-center rounded-t-[5px] border border-dashed border-[#C7D2E0]"
                  style={{ height: barH, background: 'repeating-linear-gradient(45deg,#F4F7FC 0 5px,#E8EEF5 5px 10px)', opacity: dim, transition: 'opacity 200ms' }}
                  title="Data not available from source"
                >
                  <span className="text-[9px] italic text-ink-secondary">n/a</span>
                </div>
              )
            } else {
              const barH = (d.gwp! / maxGwp) * PLOT
              const nwpFrac = d.nwp != null ? d.nwp / d.gwp! : 1
              const nepFrac = d.nep != null ? d.nep / d.gwp! : nwpFrac
              const earnedH = barH * nepFrac
              const timingH = Math.max(0, barH * (nwpFrac - nepFrac))
              const reinsH = Math.max(0, barH * (1 - nwpFrac))
              const fillFrac = stage === 'GWP' ? 1 : stage === 'NWP' ? nwpFrac : nepFrac
              const fillH = barH * fillFrac
              const earnedColor = STRONG[stage]
              const timingColor = stage === 'GWP' ? STRONG.GWP : stage === 'NWP' ? STRONG.NWP : MUTE_TIMING
              const reinsColor = stage === 'GWP' ? STRONG.GWP : MUTE_REINS
              const bandTx = 'background-color 520ms ease-in-out'
              body = (
                <>
                  {/* Value pill — rides the top of the strong fill as the lens changes. */}
                  <div
                    className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-white/85 px-1.5 py-0.5 text-center shadow-[0_1px_3px_rgba(23,43,77,0.10)] ring-1 ring-black/[0.05] backdrop-blur-sm"
                    style={{ bottom: fillH, transition: 'bottom 600ms ease-in-out' }}
                  >
                    <div className="font-display text-[12px] leading-none text-navy-deep">{fmtCr(d.sel)}</div>
                    {d.yoyPct != null && (
                      <div className="mt-0.5 text-[9.5px] font-bold leading-none" style={{ color: d.yoyPct >= 0 ? GOLD : '#9C7430' }}>
                        {d.yoyPct >= 0 ? '+' : '−'}
                        {Math.abs(d.yoyPct).toFixed(0)}% YoY
                      </div>
                    )}
                  </div>
                  {/* The bar — three stacked bands; only colours animate per lens. */}
                  <div
                    className="flex w-full max-w-[68px] flex-col-reverse overflow-hidden rounded-t-[5px] ring-1 ring-inset ring-black/[0.05]"
                    style={{ height: barH, opacity: dim, transition: 'opacity 200ms' }}
                  >
                    <div style={{ height: earnedH, background: earnedColor, transition: bandTx }} />
                    <div style={{ height: timingH, background: timingColor, transition: bandTx }} />
                    <div style={{ height: reinsH, background: reinsColor, transition: bandTx }} />
                  </div>
                </>
              )
            }
            return (
              <div
                key={d.period}
                className="relative flex h-full flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {body}
              </div>
            )
          })}
        </div>
        {/* Period axis — honest labels; missing years flagged italic n/a. */}
        <div className="mt-2 flex justify-between gap-2 sm:gap-5">
          {data.map((d) => (
            <div key={d.period} className="flex-1 text-center">
              <div className="text-[11px] font-semibold text-navy-deep">{d.period}</div>
              {d.gwp == null && <div className="text-[9px] italic text-ink-secondary">n/a</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Contextual leakage + ratio callouts — follow the hovered year, else latest. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{focus.period}</span>
        {stage === 'GWP' && (
          <>
            <CalloutPill color={FOCAL} label="Gross written" value={focus.gwp != null ? fmtCr(focus.gwp) : 'Data not available from source'} />
            <span className="text-[11px] italic text-ink-secondary">Gross premium is the starting premium base.</span>
          </>
        )}
        {stage === 'NWP' && (
          <>
            <CalloutPill color={TEAL} label="Retention" value={focus.retentionRatio != null ? pct(focus.retentionRatio) : 'n/a'} />
            <CalloutPill
              color={MUTE_REINS}
              muted
              label="Reinsurance leakage"
              value={
                focus.reinsuranceLeakage != null
                  ? `${fmtCr(focus.reinsuranceLeakage)}${focus.retentionRatio != null ? ` · ${pct(100 - focus.retentionRatio)}` : ''}`
                  : 'Data not available from source'
              }
            />
          </>
        )}
        {stage === 'NEP' && (
          <>
            <CalloutPill color={NEP_BLUE} label="Earned / Gross" value={focus.earnedOnGross != null ? pct(focus.earnedOnGross) : 'n/a'} />
            <CalloutPill color={MUTE_REINS} muted label="Reinsurance leakage" value={focus.reinsuranceLeakage != null ? fmtCr(focus.reinsuranceLeakage) : 'Data not available from source'} />
            <CalloutPill color={MUTE_TIMING} muted label="Timing leakage" value={focus.timingLeakage != null ? fmtCr(focus.timingLeakage) : 'Data not available from source'} />
          </>
        )}
      </div>

      {stageReported === 0 && (
        <p className="mt-2 rounded-md bg-[#FBF3E2] px-2.5 py-1.5 text-[10.5px] text-[#8C6B1A]">
          {active.word} premium ({active.abbrev}) is not reported in the selected range. Switch the lens or widen the Data Range.
        </p>
      )}
      {basisNote && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-soft-border bg-ice/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-ink-secondary">
          <span aria-hidden className="mt-px text-[11px] font-bold text-navy-primary/70">&#9432;</span>
          <span>{basisNote}</span>
        </p>
      )}

      {/* Single footer — legend + calc note + source. No duplicates. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-soft-border pt-2.5 text-[10.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: STRONG[stage] }} />
          {active.word} · <span className="font-bold tracking-wider text-navy-primary/80">{active.abbrev}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: MUTE_REINS }} />
          Reinsurance leakage
        </span>
        {stage === 'NEP' && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: MUTE_TIMING }} />
            Timing leakage
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm border border-dashed border-[#C7D2E0] bg-[#F4F7FC]" />
          Data not available
        </span>
        <span>·</span>
        <span>Premium metrics, not profit</span>
        <span>·</span>
        <span>Missing = not disclosed</span>
        <span>·</span>
        <span>
          Source ·{' '}
          <a
            href="https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-navy-deep underline-offset-2 hover:underline"
            title={`${companyName} annual disclosures + live PDF parse — written / retained / earned premium per year`}
          >
            Company filing
          </a>
        </span>
      </div>
    </div>
  )
}

/**
 * RealMixChart — 100% stacked bar of channel mix per period sourced from
 * distributionEngineMix (Niva Bupa real filing values FY22–FY25, range-clipped
 * by the caller). Reads-only, no synthesis.
 */
const CHANNEL_COLORS_MIX: Record<string, string> = {
  Banca: FOCAL,
  Brokers: TEAL,
  Agents: NEP_BLUE,
  'Corporate Agents': GOLD,
  Direct: GREEN,
  Others: GREY,
}

function RealMixChart({
  rows,
  companyName,
}: {
  rows: Array<{ period: string; Banca: number; Brokers: number; Agents: number; 'Corporate Agents': number; Direct: number; Others: number }>
  companyName: string
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {DIST_CHANNELS.map((ch) => (
          <LegendSwatch key={ch} color={CHANNEL_COLORS_MIX[ch] ?? GREY}>
            {ch}
          </LegendSwatch>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={264}>
        <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 4 }} barCategoryGap="32%">
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
          <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
          <YAxis tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={42} domain={[0, 100]} />
          <Tooltip
            cursor={{ fill: 'rgba(39,69,126,0.05)' }}
            content={({ active, payload, label }) =>
              active && payload && payload.length ? (
                <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
                  <p className="mb-1 text-[11px] font-semibold text-navy-deep">{label}</p>
                  {[...payload].reverse().map((p) => (
                    <div key={p.dataKey as string} className="flex items-center justify-between gap-4 text-[11.5px]">
                      <span className="flex items-center gap-1.5 text-ink-secondary">
                        <span className="h-2 w-2 rounded-sm" style={{ background: p.color as string }} />
                        {p.name}
                      </span>
                      <span className="font-semibold tabular-nums text-navy-deep">{Number(p.value).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          {DIST_CHANNELS.map((ch, idx) => (
            <Bar
              key={ch}
              dataKey={ch}
              name={ch}
              stackId="mix"
              fill={CHANNEL_COLORS_MIX[ch] ?? GREY}
              maxBarSize={48}
              isAnimationActive={false}
              radius={idx === DIST_CHANNELS.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11.5px] text-ink-secondary">
        Share of GWP by distribution channel for {companyName} — values from the
        annual report MD&A section.
      </p>
      <div className="mt-2 flex justify-end">
        <SourceTag
          source="Company filing"
          confidence="high"
          period={`${rows[0].period} → ${rows[rows.length - 1].period}`}
          provenance={{
            source_name: `${companyName} annual report — channel-mix table`,
            source_url: 'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf',
          }}
        />
      </div>
    </div>
  )
}


function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const peerGroupLabel: Record<string, string> = {
  SAHI: 'SAHI peer',
  General: 'General peer',
  Life: 'Life peer',
}

export function RetentionView({ companyId, period }: { companyId: string; period: Period }) {
  void period // renewal is reported annually; the period toggle doesn't apply here.
  const focal = insurers.find((i) => i.id === companyId)

  // Real, source-backed renewal history for this company (annual snapshot).
  // Today only the latest fiscal year carries renewal_rate for most insurers;
  // earlier years stay absent until ingested — we never fabricate a trend.
  const renewalRows = (annualSnapshot.data as Array<{
    company_id: string
    fiscal_year: string
    renewal_rate: number | null
    customer_retention: number | null
  }>)
    .filter((r) => r.company_id === companyId && typeof r.renewal_rate === 'number')
    .sort((a, b) => a.fiscal_year.localeCompare(b.fiscal_year))
  const latest = renewalRows[renewalRows.length - 1] ?? null
  const rr = latest?.renewal_rate ?? (focal && focal.renewalRate > 0 ? focal.renewalRate : null)
  const ret = latest?.customer_retention ?? (focal && focal.customerRetention > 0 ? focal.customerRetention : null)
  const fyLabel = latest?.fiscal_year ?? 'latest FY'

  if (rr == null) {
    return (
      <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">
        Renewal rate is not reported for {focal?.shortName ?? 'this company'} yet — it will appear here once the
        company filing is ingested.
      </div>
    )
  }

  // Real peer-median renewal (same peer group, reported values only).
  const peerGroup = focal?.peerGroup
  const peerRates = insurers
    .filter((i) => i.id !== companyId && i.peerGroup === peerGroup && i.renewalRate > 0)
    .map((i) => i.renewalRate)
  const peerMedian = peerRates.length >= 2 ? median(peerRates) : null
  const benchmarkLabel = peerGroup ? peerGroupLabel[peerGroup] ?? 'Peer' : 'Peer'
  const delta = peerMedian != null ? Math.round((rr - peerMedian) * 10) / 10 : null

  const status: { label: string; color: string } =
    delta == null
      ? { label: rr >= 85 ? 'Sticky book' : 'Watch', color: rr >= 85 ? TEAL : FOCAL }
      : delta >= 3
        ? { label: 'Above peers', color: TEAL }
        : delta <= -3
          ? { label: 'Below peers', color: RED }
          : { label: 'In line with peers', color: FOCAL }

  const pills: Chip[] = [
    { label: 'Renewal Rate', value: `${Math.round(rr)}%`, note: fyLabel, color: TEAL },
    ...(ret != null ? [{ label: 'Customer Retention', value: `${Math.round(ret)}%`, note: fyLabel, color: FOCAL } as Chip] : []),
    {
      label: 'Vs Peers',
      value: status.label,
      note: peerMedian != null ? `${benchmarkLabel} median ${Math.round(peerMedian)}%` : 'benchmark pending',
      color: status.color,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Primary: real renewal rate hero + honest peer comparison */}
      <div
        className="relative overflow-hidden rounded-xl2 border border-soft-border p-4 shadow-soft sm:p-5"
        style={{ background: `linear-gradient(135deg, ${hexA(TEAL, 0.1)}, ${hexA(FOCAL, 0.05)} 55%, transparent)` }}
      >
        <span className="absolute left-0 top-0 h-full w-1.5" style={{ background: TEAL }} />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pl-2">
          <div className="shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Renewal Rate</p>
            <div className="mt-1 flex items-end gap-2">
              <span className="font-display text-[40px] leading-none text-navy-deep">{Math.round(rr)}%</span>
              {delta != null && (
                <span
                  className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ color: status.color, background: hexA(status.color, 0.12) }}
                >
                  {delta >= 0 ? '+' : '−'}{Math.abs(delta)} pp vs {benchmarkLabel}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-secondary">
              {fyLabel} reported{ret != null ? ` · ${Math.round(ret)}% customer retention` : ''}
            </p>
          </div>
          <div className="min-w-[220px] flex-1">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Year-on-year trend</p>
            <div className="rounded-lg border border-dashed border-soft-border bg-white/50 px-3 py-3 text-[11.5px] leading-snug text-ink-secondary">
              Multi-year renewal history and the customer stay-path cohort are pending — only {fyLabel} is reported
              in the source today. They populate here automatically as earlier years are ingested.
            </div>
          </div>
        </div>
      </div>

      {/* Supporting summary pills — all values real */}
      <SlimStrip chips={pills} />
    </div>
  )
}

// --- Module shell ------------------------------------------------------------

export function PremiumFlowQuality({ focalId }: { focalId: string }) {
  const [tab, setTab] = useState<Tab>('Flow')
  const { period: globalPeriod, range } = useFilters()
  // Dashboard-wide active window, in the current period's vocabulary
  // (FY22–FY25 / Q1 FY23–Q4 FY25 / Apr 2022–Mar 2025).
  const rangeLabel = formatRange(range, globalPeriod)
  // Map global TimePeriod ('Annual' | 'Quarterly' | 'Monthly') to the internal
  // Period the chart speaks ('Yearly' | 'Quarterly'). Monthly is not supported
  // by the underlying premium series — gate it with an EmptyState below.
  const period: Period = globalPeriod === 'Quarterly' ? 'Quarterly' : 'Yearly'
  const periodUnavailable = globalPeriod === 'Monthly'

  const company = insurers.find((c) => c.id === focalId) ?? insurers[0]
  const name = company?.shortName ?? 'Company'
  // Derive the period label from the actual snapshot rows we'll render for
  // this focal company — so "FY22–FY25" appears only if those rows exist.
  const annualRowsForFocal = (annualSnapshot.data as Array<{ company_id: string; fiscal_year: string; gwp: number | null }>)
    .filter((r) => r.company_id === focalId && typeof r.gwp === 'number')
    .map((r) => r.fiscal_year)
    .sort()
  const periodLabel =
    period === 'Quarterly'
      ? 'Last 4 quarters'
      : annualRowsForFocal.length > 0
        ? `${annualRowsForFocal[0]}–${annualRowsForFocal[annualRowsForFocal.length - 1]}`
        : 'Annual'
  const headline =
    tab === 'Flow' ? 'Premium Engine: Gross → Retained → Earned' : tab === 'Mix' ? 'Where Premium Comes From' : 'Customer Renewal & Stickiness'
  const tabPhrase =
    tab === 'Flow' ? 'Premium conversion over time' : tab === 'Mix' ? 'Premium composition over time' : 'Renewal performance and customer stay path'
  // On the Flow lens the subtitle reflects the selected Data Range and the
  // conversion story; other tabs keep their period-derived context.
  const subPeriod = tab === 'Flow' || tab === 'Mix' ? rangeLabel : periodLabel
  const subTail = tab === 'Flow' ? 'How written premium turns into earned premium' : tabPhrase

  const basis: string[] = useMemo(() => {
    const src = 'Source: IRDAI / company filing'
    const per = `Period: ${periodLabel}`
    if (tab === 'Flow') return ['Basis: GWP / NWP / NEP', per, src, period === 'Quarterly' ? 'Status: Derived from YTD where applicable' : 'Status: Reported / Derived']
    if (tab === 'Mix') return ['Basis: % of GWP', per, src, 'Status: Reported / Derived']
    return ['Basis: Renewal rate proxy', per, src, 'Status: Proxy / Derived']
  }, [tab, period, periodLabel])

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Controls: tabs only — company & period come from the global header. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-soft-border pb-3">
        <Tabs value={tab} onChange={setTab} />
      </div>

      {/* Headline with gold accent + automatic period context (from header). */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <span className="h-5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <h3 className="font-display text-[18px] leading-tight text-navy-deep">{headline}</h3>
      </div>
      <p className="mt-1 pl-4 text-[12px] text-ink-secondary">
        <span className="font-semibold text-navy-deep">{name}</span> ·{' '}
        <span className="font-semibold" style={{ color: GOLD }}>{subPeriod}</span> · {subTail}
      </p>

      {/* Slim insight strip removed — chips derived from mock anchors are
          intentionally hidden until per-period data is ingested. */}

      {/* Tab content — real annual GWP from snapshot when available;
          empty state only when no real rows exist for the company. */}
      <div className="mt-4">
        {(() => {
          // Monthly isn't wired for Mix / Retention; the Flow tab falls through
          // to its own annual-only gate below so it gives a consistent message.
          if (periodUnavailable && tab !== 'Flow') {
            return (
              <EmptyState
                title="Monthly view not yet wired"
                body="Switch the period toggle in the header to Annual."
                height={300}
              />
            )
          }
          if (tab === 'Mix') {
            // Channel mix is reported annually (annual-report MD&A). Honour the
            // Period toggle: only Annual is supported here.
            if (globalPeriod !== 'Annual') {
              return (
                <EmptyState
                  title={`${globalPeriod} channel mix not reported`}
                  body={`${name}'s channel mix is reported annually in the annual-report MD&A. Switch Period to Annual.`}
                  height={300}
                />
              )
            }
            const allMix = distributionEngineMix[focalId] ?? []
            // Clip to the dashboard-wide Data Range and to full-year rows only
            // (drop interim periods like "9M FY26") — same rule the Flow tab uses,
            // so the bars always match the header years.
            const mixRows = allMix.filter((r) => /^FY\d{2}$/.test(r.period) && labelInRange(r.period, range))
            if (mixRows.length === 0) {
              return (
                <EmptyState
                  title={allMix.length ? 'Data not available from source' : `Channel mix not yet ingested for ${name}`}
                  body={allMix.length
                    ? `No channel-mix years for ${name} fall inside ${rangeLabel}. Widen the Data Range in the top bar.`
                    : `Channel-mix tables from ${name}'s annual report MD&A section will populate this view as ingest-distribution.ts extracts them.`}
                  height={300}
                />
              )
            }
            return <RealMixChart rows={mixRows} companyName={name} />
          }
          if (tab === 'Retention') {
            return <RetentionView companyId={focalId} period={period} />
          }
          // Flow tab is annual-only: the source reports GWP / NWP / NEP per
          // fiscal year, not per quarter or month. Honour the Period toggle by
          // showing an explicit "not reported" state instead of annual bars
          // under a quarterly/monthly header. (Monthly is already caught above.)
          if (globalPeriod !== 'Annual') {
            return (
              <EmptyState
                title={`${globalPeriod} premium flow not reported from source`}
                body={`Only annual GWP / NWP / NEP is reported for ${name}. Switch Period to Annual to see the Gross → Retained → Earned conversion; use the Data Range to narrow the years.`}
                height={300}
              />
            )
          }
          // Flow tab: render from real snapshot annual rows for this company.
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
          if (allCompanyRows.length === 0) {
            return (
              <EmptyState
                title={`Annual premium history not yet ingested for ${name}`}
                body="ingest-company-disclosures.ts will populate per-year GWP / NWP / NEP from the company's annual report on the next scheduled run."
                height={300}
              />
            )
          }
          // Span the FULL selected-range year axis, then merge the reported rows
          // onto it. Years with no sourced row stay null-valued so the chart shows
          // them as a pending bar (its built-in n/a treatment) instead of dropping
          // them — e.g. FY21 when premium history starts at FY22. Honours the
          // header Data Range exactly; never fabricates a missing year.
          const yearsInRange = fyLabelsInRange(range)
          const reportedByFy = new Map(allCompanyRows.map((r) => [r.fiscal_year, r]))
          const annualRows = yearsInRange.map(
            (fy) =>
              reportedByFy.get(fy) ?? {
                company_id: focalId,
                fiscal_year: fy,
                gwp: null,
                gross_direct_premium: null,
                nwp: null,
                nep: null,
              },
          )
          if (annualRows.every((r) => r.gwp == null)) {
            return (
              <EmptyState
                title="Data not available from source"
                body={`No reported premium years for ${name} fall inside ${rangeLabel}. Widen the Data Range in the top bar.`}
                height={300}
              />
            )
          }
          // The flow uses the Revenue-Account "Gross Direct Premium" when present,
          // so GWP→NWP→NEP stay one consistent basis (cession = GWP − NWP reads
          // true). Where that differs materially from the headline GWP — IRDAI's
          // 1/n long-term-premium rule, e.g. Niva Bupa FY25 — surface a compact
          // note so the wider written→retained gap isn't misread as reinsurance.
          // The headline `gwp` is left untouched for market-share / growth views.
          const oneByN = annualRows.filter(
            (r) =>
              typeof r.gross_direct_premium === 'number' &&
              typeof r.gwp === 'number' &&
              Math.abs(r.gwp - r.gross_direct_premium) > Math.max(50, r.gwp * 0.02),
          )
          const basisNote =
            oneByN.length === 1
              ? `${oneByN[0].fiscal_year} gross premium shown on IRDAI 1/n basis. Headline GWP may differ.`
              : oneByN.length > 1
                ? `${oneByN.map((r) => r.fiscal_year).join(', ')} gross premium shown on IRDAI 1/n basis. Headline GWP may differ.`
                : undefined
          const rows = annualRows.map((r) => ({
            ...r,
            gwp: typeof r.gross_direct_premium === 'number' ? r.gross_direct_premium : r.gwp,
          }))
          return <RealFlowChart rows={rows} companyName={name} basisNote={basisNote} />
        })()}
      </div>

      {/* Basis tags — the Flow chart renders its own compact basis row, so
          skip the duplicate in that case. */}
      {tab !== 'Flow' && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-soft-border pt-3">
          {basis.map((b) => (
            <Pill key={b}>{b}</Pill>
          ))}
        </div>
      )}
    </div>
  )
}
