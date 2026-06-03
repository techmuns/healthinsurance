import { useState } from 'react'
import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useActiveCompany } from '@/state/filters'
import {
  getIrdaiNonLifeFlashLatest,
  getIrdaiNonLifeFlashForCompany,
  type IrdaiNonLifeFlashView,
} from '@/lib/dataLayer'
import type { IrdaiNonLifeFlashRow } from '@/data/snapshots/_schemas'
import { SourceTag } from '@/components/SourceTag'
import { EmptyState } from '@/components/EmptyState'

// ---------------------------------------------------------------------------
//  IrdaiNonLifeFlashPanel — monthly industry-wide non-life premium from the
//  official IRDAI Non-Life Flash Figures (Gross Direct Premium WRITTEN, Rs
//  crore, provisional & unaudited).
//
//  • Monthly toggle  → premium_for_month_current_year
//  • YTD toggle      → premium_ytd_current_year
//  • Total GI market → the GRAND TOTAL row
//  • Company premium → the selected company matched to insurer_name_normalized
//
//  When no real report has been ingested for the period the panel shows the
//  honest "No IRDAI Non-Life Flash Figures data available for this period."
//  state — never a fabricated or estimated number.
// ---------------------------------------------------------------------------

type Basis = 'Monthly' | 'YTD'

/** ₹ crore with Indian digit grouping. */
function fmtCr(v: number | null | undefined): string {
  if (v == null) return 'n/a'
  return `₹${Math.round(v).toLocaleString('en-IN')} Cr`
}

/** Current-year premium for the active basis. */
function cy(row: IrdaiNonLifeFlashRow | null, basis: Basis): number | null {
  if (!row) return null
  return basis === 'Monthly' ? row.premium_for_month_current_year : row.premium_ytd_current_year
}
/** Previous-year premium for the active basis (for YoY). */
function py(row: IrdaiNonLifeFlashRow | null, basis: Basis): number | null {
  if (!row) return null
  return basis === 'Monthly' ? row.premium_for_month_previous_year : row.premium_ytd_previous_year
}
/** Honest YoY %: derived from CY vs PY, null unless both exist. */
function yoy(row: IrdaiNonLifeFlashRow | null, basis: Basis): number | null {
  const a = cy(row, basis)
  const b = py(row, basis)
  if (a == null || b == null || b === 0) return null
  return Math.round((a / b - 1) * 1000) / 10
}
function shareOf(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole === 0) return null
  return Math.round((part / whole) * 1000) / 10
}

export function IrdaiNonLifeFlashPanel() {
  const company = useActiveCompany()
  const [basis, setBasis] = useState<Basis>('Monthly')
  const view = getIrdaiNonLifeFlashLatest()

  const basisLabel = basis === 'Monthly' ? `For ${view.reportMonth ?? 'the month'}` : `Up to ${view.reportMonth ?? 'the month'}`
  const provenance = {
    source_name: `IRDAI Non-Life Flash Figures${view.reportLabel ? ` — ${view.reportLabel}` : ''}. Gross Direct Premium Written, Rs crore, provisional & unaudited.`,
    source_url: view.sourceUrl ?? undefined,
    fetched_at: view.lastFetchedAt ?? view.lastUpdated ?? undefined,
  }

  return (
    <section className="card-surface p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF1F7] pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Industry Premium
          </p>
          <h2 className="mt-1.5 flex items-center gap-2 font-display text-[20px] leading-tight text-navy-deep">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal/12 text-teal">
              <Activity className="h-3.5 w-3.5" />
            </span>
            Monthly non-life premium
          </h2>
          <p className="mt-1 text-[12px] text-ink-secondary">
            Gross Direct Premium (written) · {view.reportLabel ?? 'IRDAI flash figures'} · Rs crore
          </p>
        </div>
        <BasisToggle value={basis} onChange={setBasis} />
      </header>

      {view.available ? (
        <FlashBody view={view} basis={basis} basisLabel={basisLabel} companyId={company.id} companyName={company.shortName} />
      ) : (
        <EmptyState
          title="No IRDAI Non-Life Flash Figures data available for this period."
          body="The official IRDAI source is wired and validated; figures populate here once the monthly flash file is ingested. No estimated or placeholder numbers are shown."
          height={208}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] font-medium text-ink-secondary/85">
          Gross Direct Premium <span className="text-ink-secondary/70">written (not earned / net / retained)</span> ·
          <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-[#E7DCC4] bg-[#FBF3E2]/70 px-1.5 py-0.5 text-[9.5px] font-semibold text-champagne-deep">
            provisional &amp; unaudited
          </span>
        </p>
        <SourceTag
          source="IRDAI Non-Life Flash Figures"
          period={view.reportLabel ?? 'monthly'}
          confidence={view.available ? 'high' : 'pending'}
          provenance={provenance}
        />
      </div>
    </section>
  )
}

function FlashBody({
  view,
  basis,
  basisLabel,
  companyId,
  companyName,
}: {
  view: IrdaiNonLifeFlashView
  basis: Basis
  basisLabel: string
  companyId: string
  companyName: string
}) {
  const total = cy(view.grandTotal, basis)
  const totalYoy = yoy(view.grandTotal, basis)
  const companyRow = getIrdaiNonLifeFlashForCompany(companyId, view)

  const cats = [
    { label: 'General insurers', row: view.generalTotal, tone: 'navy' as const },
    { label: 'Standalone health', row: view.standaloneTotal, tone: 'teal' as const },
    { label: 'Specialized PSU', row: view.specializedTotal, tone: 'slate' as const },
  ]

  return (
    <div className="space-y-4">
      {/* Hero — the whole non-life industry premium (GRAND TOTAL). */}
      <div
        className="relative overflow-hidden rounded-2xl border border-[#D6E2FA] p-4"
        style={{ background: 'linear-gradient(135deg, #F2F5FC 0%, #FFFFFF 60%, #F1F8F6 100%)' }}
      >
        <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-navy-primary to-teal" />
        <div className="flex flex-wrap items-end justify-between gap-3 pl-2">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-secondary/80">
              Total non-life industry · GRAND TOTAL
            </p>
            <p className="mt-1 font-display text-[30px] leading-none text-navy-deep">{fmtCr(total)}</p>
            <p className="mt-1 text-[11px] text-ink-secondary">
              {basisLabel} · {view.fyCurrent ?? 'current FY'}
            </p>
          </div>
          <YoyPill value={totalYoy} caption={`vs ${view.fyPrevious ?? 'prior FY'}`} />
        </div>
      </div>

      {/* Category totals. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {cats.map((c) => (
          <CategoryTile
            key={c.label}
            label={c.label}
            value={cy(c.row, basis)}
            share={shareOf(cy(c.row, basis), total)}
            tone={c.tone}
          />
        ))}
      </div>

      {/* Selected-company readout. */}
      <CompanyReadout
        name={companyName}
        value={cy(companyRow, basis)}
        share={shareOf(cy(companyRow, basis), total)}
        growth={yoy(companyRow, basis)}
        matched={!!companyRow}
      />
    </div>
  )
}

function BasisToggle({ value, onChange }: { value: Basis; onChange: (v: Basis) => void }) {
  const opts: Basis[] = ['Monthly', 'YTD']
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
      {opts.map((o) => {
        const active = o === value
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={active}
            className={[
              'rounded-full px-3 py-1 text-[11.5px] font-medium transition-all duration-200',
              active
                ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft ring-1 ring-[#1B3260]'
                : 'text-ink-secondary hover:bg-soft-blue hover:text-navy-primary',
            ].join(' ')}
          >
            {o === 'YTD' ? 'Year-to-date' : o}
          </button>
        )
      })}
    </div>
  )
}

function YoyPill({ value, caption }: { value: number | null; caption: string }) {
  if (value == null)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">
        YoY n/a
      </span>
    )
  const up = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
        up ? 'bg-teal-soft text-teal ring-[#BFE3E1]' : 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]'
      }`}
      title={caption}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? '+' : ''}
      {value.toFixed(1)}% YoY
    </span>
  )
}

function CategoryTile({
  label,
  value,
  share,
  tone,
}: {
  label: string
  value: number | null
  share: number | null
  tone: 'teal' | 'navy' | 'slate'
}) {
  const accent =
    tone === 'teal'
      ? { bar: '#168E8E', text: 'text-teal', bg: 'linear-gradient(135deg, #F4FAF8 0%, #E8F4F1 100%)', border: '#C8E2DD' }
      : tone === 'navy'
        ? { bar: '#27457E', text: 'text-navy-primary', bg: 'linear-gradient(135deg, #F4F7FC 0%, #E6EEFA 100%)', border: '#D2DEF1' }
        : { bar: '#8C97A8', text: 'text-ink-secondary', bg: 'linear-gradient(135deg, #F7F9FC 0%, #EEF1F7 100%)', border: '#E0E5EE' }
  return (
    <div className="relative overflow-hidden rounded-xl border px-3 py-2.5" style={{ background: accent.bg, borderColor: accent.border }}>
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: accent.bar }} />
      <div className="flex items-baseline justify-between pl-1.5">
        <p className={`font-display text-[16px] leading-none ${accent.text}`}>{fmtCr(value)}</p>
        {share != null && (
          <span className="text-[10px] font-semibold tabular-nums text-ink-secondary/80">{share.toFixed(1)}%</span>
        )}
      </div>
      <p className="mt-1.5 pl-1.5 text-[10.5px] leading-snug text-navy-deep/75">{label}</p>
    </div>
  )
}

function CompanyReadout({
  name,
  value,
  share,
  growth,
  matched,
}: {
  name: string
  value: number | null
  share: number | null
  growth: number | null
  matched: boolean
}) {
  if (!matched || value == null) {
    return (
      <div className="rounded-xl border border-dashed border-soft-border bg-ice/60 px-3 py-2.5 text-[11.5px] text-ink-secondary">
        <span className="font-semibold text-navy-deep">{name}</span> is not listed in the IRDAI non-life flash figures for
        this period.
      </div>
    )
  }
  return (
    <div
      className="relative flex flex-wrap items-center justify-between gap-2 overflow-hidden rounded-xl border border-[#BFE3E1] px-3 py-2.5"
      style={{ background: 'linear-gradient(135deg, #F1F8F6 0%, #FFFFFF 70%)' }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-teal" />
      <div className="pl-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-teal">{name}</p>
        <p className="font-display text-[18px] leading-tight text-navy-deep">{fmtCr(value)}</p>
      </div>
      <div className="flex items-center gap-4 pr-1 text-right">
        <div>
          <p className="text-[14px] font-semibold tabular-nums text-navy-primary">{share != null ? `${share.toFixed(1)}%` : 'n/a'}</p>
          <p className="text-[9.5px] uppercase tracking-wide text-ink-secondary/80">of industry</p>
        </div>
        <YoyPill value={growth} caption="YoY" />
      </div>
    </div>
  )
}
