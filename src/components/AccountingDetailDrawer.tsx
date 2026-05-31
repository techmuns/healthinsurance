import { Drawer } from './Drawer'
import { BASIS_TONE } from './AccountingBasisControls'
import {
  getBasisProfit,
  hasBasisData,
  periodLabel,
  ANNUAL_PERIODS,
  Q4_PERIODS,
  BASIS_SOURCE_LABEL,
  BASIS_EXPLAINER,
  BASIS_LABEL,
  type BasisPeriod,
  type BasisProfit,
} from '@/data/accountingBasis'

const COLS: BasisPeriod[] = [...ANNUAL_PERIODS, ...Q4_PERIODS]

const pct = (v: number | null) => (v == null ? null : `${v.toFixed(1)}%`)
const crc = (v: number | null) => (v == null ? null : `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`)

interface RowDef {
  key: keyof BasisProfit
  label: string
  fmt: (v: number | null) => string | null
  strong?: boolean
}

const ROWS: RowDef[] = [
  { key: 'pat', label: 'PAT (₹ Cr)', fmt: crc, strong: true },
  { key: 'patMarginGwp', label: 'PAT margin (% GWP)', fmt: pct },
  { key: 'claimsRatio', label: 'Claims ratio', fmt: pct },
  { key: 'expenseRatio', label: 'Expense ratio', fmt: pct },
  { key: 'combinedRatio', label: 'Combined ratio', fmt: pct, strong: true },
  { key: 'eom', label: 'EOM (reported)', fmt: pct },
]

function Cell({ text }: { text: string | null }) {
  if (text == null) return <td className="px-2 py-1.5 text-right text-[11px] italic tabular-nums text-ink-secondary/55">NA</td>
  return <td className="px-2 py-1.5 text-right text-[11px] tabular-nums text-navy-deep">{text}</td>
}

function BasisTable({ companyId, basis }: { companyId: string; basis: 'igaap' | 'ifrs' }) {
  const tone = BASIS_TONE[basis]
  return (
    <div className="overflow-x-auto">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: tone }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tone }}>{BASIS_LABEL[basis]} basis</span>
        </span>
        <span className="text-[9px] text-ink-secondary">Source · {BASIS_SOURCE_LABEL[basis]}</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-soft-border">
            <th className="px-2 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-wide text-ink-secondary">Metric</th>
            {COLS.map((p) => (
              <th key={p} className="px-2 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-wide text-ink-secondary">
                {periodLabel(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-soft-border/50" style={row.strong ? { background: `${tone}08` } : undefined}>
              <td className={`px-2 py-1.5 text-left text-[10.5px] ${row.strong ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}`}>{row.label}</td>
              {COLS.map((p) => (
                <Cell key={p} text={row.fmt(getBasisProfit(companyId, basis, p)?.[row.key] ?? null)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Right-side drawer with the full Excel-style IGAAP vs IFRS profitability table. */
export function AccountingDetailDrawer({
  open,
  onClose,
  companyId,
  companyShort,
}: {
  open: boolean
  onClose: () => void
  companyId: string
  companyShort: string
}) {
  const tracked = hasBasisData(companyId)
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${companyShort} · IGAAP vs IFRS detail`}
      subtitle="Profitability on both accounting bases — the deeper view behind the basis lens."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-md text-[10px] leading-snug text-ink-secondary">{BASIS_EXPLAINER}</p>
          <span className="text-[10px] text-ink-secondary">Official where reported · NA where not available</span>
        </div>
      }
    >
      {tracked ? (
        <div className="space-y-6">
          <BasisTable companyId={companyId} basis="igaap" />
          <BasisTable companyId={companyId} basis="ifrs" />
          <p className="text-[10px] leading-snug text-ink-secondary">
            Premium metrics are not shown here — PAT, PAT margin, claims, expense, combined ratio and EOM above are
            profit measures. Blank cells in the source accounts render as <span className="italic">NA</span>, never zero.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-soft-border bg-ice/50 px-4 py-3 text-[12px] leading-relaxed text-ink-secondary">
          Dual-basis profitability is not tracked for {companyShort}.
        </div>
      )}
    </Drawer>
  )
}
