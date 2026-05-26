import { Calculator } from 'lucide-react'
import { SignalBadge } from './SignalBadge'
import { statusTone } from '@/lib/format'
import { getBridgeRows, type BridgeRow } from '@/lib/review'
import { QUARTER, QUARTERLY_BASIS_NOTE } from '@/data/mockData'

function fmt(v: number | null, unit: string): string {
  if (v === null) return 'Data pending'
  if (unit === '₹ Cr') return `₹${v.toLocaleString('en-IN')} Cr`
  return `${v}${unit ? ` ${unit}` : ''}`
}

/** Three-step visual: Current YTD − Previous YTD = Standalone Quarter. */
function VisualBridge({ row }: { row: BridgeRow }) {
  const step = (caption: string, period: string, value: string, strong = false) => (
    <div
      className={`flex-1 rounded-lg border px-3 py-2 text-center ${
        strong ? 'border-navy-primary/30 bg-soft-blue/60' : 'border-soft-border bg-card'
      }`}
    >
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{caption}</p>
      <p className="text-[10px] text-ink-secondary">{period}</p>
      <p className={`mt-0.5 font-display text-[15px] ${strong ? 'text-navy-primary' : 'text-navy-deep'}`}>{value}</p>
    </div>
  )
  return (
    <div className="flex items-center gap-1.5">
      {step('Current YTD', QUARTER.currentYtd, fmt(row.currentYtd, row.unit))}
      <span className="shrink-0 text-lg font-light text-ink-secondary">−</span>
      {step('Less prior YTD', QUARTER.previousYtd, fmt(row.previousYtd, row.unit))}
      <span className="shrink-0 text-lg font-light text-ink-secondary">=</span>
      {step(`Standalone ${QUARTER.current}`, row.label, fmt(row.quarter, row.unit), true)}
    </div>
  )
}

export function YtdBridge({ companyId, compact = false }: { companyId: string; compact?: boolean }) {
  const rows = getBridgeRows(companyId)
  const primary = rows.find((r) => r.quarter !== null) ?? rows[0]

  if (!rows.length) {
    return (
      <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-3 text-[12px] text-ink-secondary">
        Quarterly bridge data pending for this company (mock dataset).
      </div>
    )
  }

  if (compact) {
    return (
      <div className="rounded-xl2 border border-soft-border bg-ice/60 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-champagne-deep" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-deep">
            Quarterly figures are derived
          </span>
          <SignalBadge label="Derived" tone={statusTone.Derived} size="sm" />
        </div>
        {primary && <VisualBridge row={primary} />}
        <p className="mt-2 text-[10.5px] leading-snug text-ink-secondary">{QUARTERLY_BASIS_NOTE}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {primary && <VisualBridge row={primary} />}

      <div className="overflow-x-auto rounded-xl2 border border-soft-border">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-ice text-[10.5px] uppercase tracking-wide text-ink-secondary">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Metric</th>
              <th className="px-3 py-2.5 font-semibold">Current YTD</th>
              <th className="px-3 py-2.5 font-semibold">Previous YTD</th>
              <th className="px-3 py-2.5 font-semibold">Calculated quarter</th>
              <th className="px-3 py-2.5 font-semibold">Formula</th>
              <th className="px-3 py-2.5 font-semibold">Source</th>
              <th className="px-3 py-2.5 font-semibold">Basis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={i % 2 ? 'bg-ice/40' : ''}>
                <td className="px-3 py-2.5 font-semibold text-ink-primary">{r.label}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink-primary">{fmt(r.currentYtd, r.unit)}</td>
                <td className="px-3 py-2.5 tabular-nums text-ink-secondary">{fmt(r.previousYtd, r.unit)}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-navy-primary">{fmt(r.quarter, r.unit)}</td>
                <td className="px-3 py-2.5 text-[11px] text-ink-secondary">{r.formula}</td>
                <td className="px-3 py-2.5 text-[11px] text-ink-secondary">{r.source}</td>
                <td className="px-3 py-2.5">
                  <SignalBadge label={r.status} tone={statusTone[r.status]} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-snug text-ink-secondary">{QUARTERLY_BASIS_NOTE}</p>
    </div>
  )
}
