import { Info, Layers } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { BASIS_OPTIONS, BASIS_LABEL, BASIS_EXPLAINER, type AccountingBasis } from '@/data/accountingBasis'

// Tone per basis — subtle, on-palette colour coding so the eye can tell at a
// glance which accounting lens a number is on. Reported = neutral slate,
// IGAAP = navy (statutory), IFRS = teal (the contrasting lens).
export const BASIS_TONE: Record<AccountingBasis, string> = {
  reported: '#64748B',
  igaap: '#27457E',
  ifrs: '#168E8E',
}

/** The page-level Reported / IGAAP / IFRS selector. */
export function AccountingBasisToggle({ value, onChange }: { value: AccountingBasis; onChange: (b: AccountingBasis) => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">
        <Layers className="h-3 w-3" />
        Accounting basis
      </span>
      <SegmentedControl<AccountingBasis>
        options={BASIS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={value}
        onChange={onChange}
        size="sm"
      />
    </div>
  )
}

/**
 * Compact "Basis: IFRS" pill placed next to any PAT / PAT-margin figure so the
 * investor always knows which accounting lens the number is on. Tone-coded.
 */
export function BasisPill({ basis, className = '' }: { basis: AccountingBasis; className?: string }) {
  const tone = BASIS_TONE[basis]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold leading-none ${className}`}
      style={{ borderColor: `${tone}55`, background: `${tone}12`, color: tone }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
      Basis: {BASIS_LABEL[basis]}
    </span>
  )
}

/** One-line investor caution about comparing across accounting bases. */
export function BasisExplainer({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-[10.5px] leading-snug text-ink-secondary ${className}`}>
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-champagne" />
      <span>{BASIS_EXPLAINER}</span>
    </p>
  )
}
