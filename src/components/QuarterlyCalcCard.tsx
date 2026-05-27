import { useState } from 'react'
import { Calculator, Maximize2 } from 'lucide-react'
import { Drawer } from './Drawer'
import { SignalBadge } from './SignalBadge'
import { YtdBridge } from './YtdBridge'
import { statusTone } from '@/lib/format'
import { getBridgeRows } from '@/lib/review'
import { QUARTER } from '@/data/mockData'
import type { Insurer } from '@/data/types'

function fmt(v: number | null, unit: string): string {
  if (v === null) return '—'
  if (unit === '₹ Cr') return `₹${v.toLocaleString('en-IN')} Cr`
  return `${v}${unit ? ` ${unit}` : ''}`
}

/** E. Compact "how the quarter was calculated" trust card + detail drawer. */
export function QuarterlyCalcCard({ company }: { company: Insurer }) {
  const [open, setOpen] = useState(false)
  const rows = getBridgeRows(company.id)
  const primary = rows.find((r) => r.quarter !== null) ?? rows[0]

  return (
    <div className="card-surface flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-champagne-deep" />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-navy-deep">Calculation Basis</span>
        <SignalBadge label="Derived" tone={statusTone.Derived} size="sm" />
      </div>

      {primary && (
        <p className="text-[12px] text-ink-secondary">
          {primary.label}:{' '}
          <span className="font-semibold text-navy-deep">{fmt(primary.currentYtd, primary.unit)}</span>
          <span className="text-ink-secondary"> − </span>
          <span className="font-semibold text-navy-deep">{fmt(primary.previousYtd, primary.unit)}</span>
          <span className="text-ink-secondary"> = </span>
          <span className="font-semibold text-navy-primary">
            {QUARTER.current} {fmt(primary.quarter, primary.unit)}
          </span>
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[11px] font-semibold text-navy-primary transition-colors hover:border-muted-blue"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Quarter calculation audit
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Quarter Calculation Audit"
        subtitle="Standalone quarter derived from reported YTD numbers"
      >
        <YtdBridge companyId={company.id} />
      </Drawer>
    </div>
  )
}
