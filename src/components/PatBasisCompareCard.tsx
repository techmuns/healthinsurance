import { useState } from 'react'
import { ArrowRight, TrendingDown, TrendingUp, Minus, Scale, Layers } from 'lucide-react'
import { SourceTag } from './SourceTag'
import { BasisExplainer, BASIS_TONE } from './AccountingBasisControls'
import {
  getBasisProfit,
  getBasisPatGrowth,
  periodLabel,
  hasBasisData,
  basisStatus,
  BASIS_SOURCE_LABEL,
  BASIS_TRACKED_COMPANIES,
  type AccountingBasis,
  type BasisPeriod,
} from '@/data/accountingBasis'

const NAVY = '#172B4D'
const SLATE = '#64748B'

function crc(v: number | null): string {
  if (v == null) return 'NA'
  return `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')} Cr`
}

function GrowthDir({ g }: { g: number | null }) {
  if (g == null) return <span className="text-[9.5px] text-ink-secondary/70">growth NA</span>
  const dir = g > 0.5 ? 'up' : g < -0.5 ? 'down' : 'flat'
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus
  const color = dir === 'up' ? '#2F855A' : dir === 'down' ? '#B94A48' : SLATE
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color }}>
      <Icon className="h-3 w-3" />
      {g >= 0 ? '+' : ''}{g.toFixed(0)}% YoY
    </span>
  )
}

// One PAT column (IGAAP or IFRS). The page-selected basis gets a highlight ring.
function BasisColumn({
  label,
  basis,
  pat,
  growth,
  active,
}: {
  label: string
  basis: AccountingBasis
  pat: number | null
  growth: number | null
  active: boolean
}) {
  const tone = BASIS_TONE[basis]
  const missing = pat == null
  return (
    <div
      className="flex flex-1 flex-col rounded-xl border px-3.5 py-3 transition-shadow"
      style={{
        borderColor: active ? tone : `${tone}40`,
        background: `${tone}0a`,
        boxShadow: active ? `0 8px 20px ${tone}26` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
          {label}
        </span>
        {active && (
          <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white" style={{ background: tone }}>
            Viewing
          </span>
        )}
      </div>
      <span className="mt-1.5 font-display text-[26px] leading-none" style={{ color: missing ? '#94A3B8' : NAVY }}>
        {missing ? 'NA' : crc(pat)}
      </span>
      <span className="mt-1 text-[9px] uppercase tracking-wide text-ink-secondary">PAT</span>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-soft-border/60 pt-1.5">
        <GrowthDir g={growth} />
        <span className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: missing ? '#94A3B8' : tone }}>{basisStatus(pat)}</span>
      </div>
    </div>
  )
}

function buildInterpretation(
  companyShort: string,
  period: BasisPeriod,
  igaapPat: number | null,
  ifrsPat: number | null,
  igaapG: number | null,
  ifrsG: number | null,
): string {
  const p = periodLabel(period)
  if (igaapPat == null && ifrsPat == null) return `Neither basis reports PAT for ${companyShort} in ${p}.`
  if (igaapPat == null) return `Only IFRS reports ${companyShort}'s ${p} PAT (${crc(ifrsPat)}); IGAAP / Statutory is not available for this period.`
  if (ifrsPat == null) return `Only IGAAP / Statutory reports ${companyShort}'s ${p} PAT (${crc(igaapPat)}); IFRS is not available for this period.`
  const igaapPos = igaapPat > 0
  const ifrsPos = ifrsPat > 0
  const gap = ifrsPat - igaapPat
  const higher = gap >= 0 ? 'IFRS' : 'IGAAP / Statutory'
  let lead: string
  if (igaapPos && ifrsPos) lead = `${companyShort} is profitable on both bases in ${p} — IGAAP / Statutory ${crc(igaapPat)} and IFRS ${crc(ifrsPat)}.`
  else if (igaapPos && !ifrsPos) lead = `${companyShort} is profitable on IGAAP / Statutory (${crc(igaapPat)}) but loss-making on IFRS (${crc(ifrsPat)}) in ${p}.`
  else if (!igaapPos && ifrsPos) lead = `${companyShort} is loss-making on IGAAP / Statutory (${crc(igaapPat)}) but profitable on IFRS (${crc(ifrsPat)}) in ${p}.`
  else lead = `${companyShort} is loss-making on both bases in ${p} — IGAAP / Statutory ${crc(igaapPat)} and IFRS ${crc(ifrsPat)}.`
  const flips = igaapG != null && ifrsG != null && Math.sign(igaapG) !== Math.sign(ifrsG) && Math.abs(igaapG) > 1 && Math.abs(ifrsG) > 1
  const tail = flips
    ? ` The direction even flips: IGAAP ${igaapG! >= 0 ? '+' : ''}${igaapG!.toFixed(0)}% vs IFRS ${ifrsG! >= 0 ? '+' : ''}${ifrsG!.toFixed(0)}% YoY — ${higher} is the more favourable read.`
    : ` ${higher} reads ${crc(Math.abs(gap))} higher; keep the basis clear before comparing to peers or valuation.`
  return lead + tail
}

const PERIOD_CHOICES: BasisPeriod[] = ['FY25', 'FY26', 'Q4FY26']

/**
 * Compact "PAT by Accounting Basis" card: IGAAP vs IFRS PAT side-by-side for the
 * selected company + period, with the gap, each side's growth direction and a
 * short investor interpretation. Hosts the cross-basis caution and the
 * "View accounting detail" button (which opens the Excel-style drawer).
 *
 * Honest by design: missing cells render "NA", never 0; untracked companies get
 * a clear "not tracked on dual bases" state instead of a fabricated comparison.
 */
export function PatBasisCompareCard({
  companyId,
  companyShort,
  pageBasis,
  onOpenDetail,
}: {
  companyId: string
  companyShort: string
  pageBasis: AccountingBasis
  onOpenDetail: () => void
}) {
  // Default to FY25 — the page's reported anchor year — so this card never opens
  // on FY26 while the rest of the page reads FY25.
  const [period, setPeriod] = useState<BasisPeriod>('FY25')
  const tracked = hasBasisData(companyId)

  if (!tracked) {
    return (
      <section className="card-surface p-4">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-champagne" />
          <h3 className="font-display text-[14px] text-navy-deep">PAT by Accounting Basis</h3>
        </div>
        <div className="mt-2.5 rounded-lg border border-dashed border-soft-border bg-ice/50 px-3 py-2.5 text-[11px] leading-snug text-ink-secondary">
          Dual-basis (IGAAP vs IFRS) profitability is not tracked for {companyShort}. Currently tracked for{' '}
          <span className="font-semibold text-navy-deep">{BASIS_TRACKED_COMPANIES.join(', ')}</span>.
        </div>
        <BasisExplainer className="mt-2.5" />
      </section>
    )
  }

  const igaap = getBasisProfit(companyId, 'igaap', period)
  const ifrs = getBasisProfit(companyId, 'ifrs', period)
  const igaapG = getBasisPatGrowth(companyId, 'igaap', period)
  const ifrsG = getBasisPatGrowth(companyId, 'ifrs', period)
  const igaapPat = igaap?.pat ?? null
  const ifrsPat = ifrs?.pat ?? null
  const gap = igaapPat != null && ifrsPat != null ? ifrsPat - igaapPat : null

  return (
    <section className="card-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: '#EEF4FF' }}>
            <Scale className="h-3.5 w-3.5 text-navy-primary" />
          </span>
          <div>
            <h3 className="font-display text-[14px] leading-tight text-navy-deep">PAT by Accounting Basis</h3>
            <p className="text-[10px] leading-snug text-ink-secondary">{companyShort} · same company, two accounting lenses</p>
          </div>
        </div>
        {/* compact period sub-toggle */}
        <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
          {PERIOD_CHOICES.map((p) => {
            const on = p === period
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold transition-colors"
                style={on ? { background: NAVY, color: '#fff' } : { color: '#6B7488' }}
              >
                {periodLabel(p)}
              </button>
            )
          })}
        </div>
      </div>

      {/* IGAAP | gap | IFRS */}
      <div className="mt-3 flex items-stretch gap-2">
        <BasisColumn label="IGAAP" basis="igaap" pat={igaapPat} growth={igaapG} active={pageBasis === 'igaap'} />
        <div className="flex w-[78px] shrink-0 flex-col items-center justify-center rounded-xl border border-soft-border bg-ice/60 px-1.5 py-2 text-center">
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Gap</span>
          <ArrowRight className="my-0.5 h-3.5 w-3.5 text-ink-secondary/50" />
          <span className="font-display text-[15px] leading-none" style={{ color: gap == null ? '#94A3B8' : gap >= 0 ? '#168E8E' : '#B94A48' }}>
            {gap == null ? 'NA' : `${gap >= 0 ? '+' : '−'}₹${Math.abs(Math.round(gap)).toLocaleString('en-IN')}`}
          </span>
          <span className="mt-0.5 text-[8px] leading-tight text-ink-secondary">IFRS − IGAAP</span>
        </div>
        <BasisColumn label="IFRS" basis="ifrs" pat={ifrsPat} growth={ifrsG} active={pageBasis === 'ifrs'} />
      </div>

      {/* dynamic investor interpretation */}
      <p className="mt-3 rounded-lg px-3 py-2 text-[11px] font-medium leading-relaxed text-navy-deep/90" style={{ background: '#F7F9FC' }}>
        {buildInterpretation(companyShort, period, igaapPat, ifrsPat, igaapG, ifrsG)}
      </p>

      <BasisExplainer className="mt-2.5" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-soft-border/70 pt-2.5">
        <button
          type="button"
          onClick={onOpenDetail}
          className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary"
        >
          <Layers className="h-3.5 w-3.5" />
          View accounting detail
        </button>
        <SourceTag source={BASIS_SOURCE_LABEL[pageBasis]} period={periodLabel(period)} confidence="high" />
      </div>
    </section>
  )
}
