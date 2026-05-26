import { statusTone } from '@/lib/format'
import { SignalBadge } from './SignalBadge'
import type { BasisInfo } from '@/data/mockData'

/** Small, low-noise pill used for accounting/source basis tags. */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
      {children}
    </span>
  )
}

/**
 * Compact accounting/source basis row, e.g.
 *   Basis: GWP · Quarterly derived from YTD · IGAAP · Source: IRDAI · Derived
 * Visible but not noisy — small pills, single line.
 */
export function BasisTag({ info, className = '' }: { info: BasisInfo; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Basis</span>
      <Pill>{info.basis}</Pill>
      <Pill>{info.method}</Pill>
      <Pill>{info.accounting}</Pill>
      <Pill>Source: {info.source}</Pill>
      <SignalBadge label={info.status} tone={statusTone[info.status]} size="sm" />
    </div>
  )
}
