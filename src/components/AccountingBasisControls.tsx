import { Info, Layers } from 'lucide-react'
import { BASIS_OPTIONS, BASIS_LABEL, BASIS_EXPLAINER, type AccountingBasis } from '@/data/accountingBasis'

// Tone per basis — subtle, on-palette colour coding so the eye can tell at a
// glance which accounting lens a number is on:
// IGAAP / Statutory = navy, IFRS = teal (the contrasting lens).
export const BASIS_TONE: Record<AccountingBasis, string> = {
  igaap: '#27457E',
  ifrs: '#168E8E',
}

/**
 * The IGAAP ⇄ IFRS basis selector. Styled as a prominent, self-describing
 * control (labelled, with an icon + "switch the lens" hint) so it reads
 * unmistakably as an interactive switch rather than a passive caption. The
 * active option is tone-coded to its basis — navy for IGAAP/Statutory (the
 * reported view), teal for IFRS (the comparison lens) — so the chosen lens is
 * obvious at a glance.
 */
export function AccountingBasisToggle({ value, onChange }: { value: AccountingBasis; onChange: (b: AccountingBasis) => void }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-xl border border-[#D9E2F1] bg-gradient-to-br from-white to-[#F3F7FC] px-3 py-2 shadow-[0_1px_3px_rgba(23,43,77,0.05)]">
      <span className="inline-flex items-center gap-1.5">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-soft-blue text-navy-primary">
          <Layers className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-champagne-deep">Accounting basis</span>
          <span className="text-[10px] font-medium text-ink-secondary">Switch the lens</span>
        </span>
      </span>
      <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5" role="group" aria-label="Accounting basis">
        {BASIS_OPTIONS.map((o) => {
          const active = o.value === value
          const tone = BASIS_TONE[o.value]
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${active ? '' : 'text-ink-secondary hover:text-navy-primary'}`}
              style={active ? { background: tone, color: '#fff', boxShadow: `0 1px 6px ${tone}55` } : undefined}
            >
              {o.label}
            </button>
          )
        })}
      </div>
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

/**
 * One-line investor caution about comparing across accounting bases. When a
 * `basis` is passed it reads as a plain support note ("Reported on … · IFRS can
 * differ due to accounting treatment"); otherwise it shows the short standing note.
 */
export function BasisExplainer({ basis, className = '' }: { basis?: AccountingBasis; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-[10.5px] leading-snug text-ink-secondary ${className}`}>
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-champagne" />
      <span>
        {basis
          ? `Reported on ${BASIS_LABEL[basis]}. The IFRS view can differ due to accounting treatment — check basis before comparing.`
          : BASIS_EXPLAINER}
      </span>
    </p>
  )
}
