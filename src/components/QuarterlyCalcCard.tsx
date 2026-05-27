import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, Maximize2, X } from 'lucide-react'
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

/**
 * Contextual audit popover anchored to its trigger button. Opens above the
 * button (right-aligned) with collision detection to flip below; falls back to
 * a bottom sheet on mobile. Portalled to body so fixed positioning is not
 * captured by the transformed page wrapper.
 */
function AuditPopover({
  open,
  onClose,
  anchorRef,
  children,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement>
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({})
  const [mobile, setMobile] = useState(false)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const isMobile = window.innerWidth < 640
      setMobile(isMobile)
      if (isMobile) return
      const a = anchorRef.current?.getBoundingClientRect()
      if (!a) return
      const margin = 12
      const gap = 8
      const width = Math.min(720, window.innerWidth - margin * 2)
      const spaceAbove = a.top - margin
      const spaceBelow = window.innerHeight - a.bottom - margin
      const openAbove = spaceAbove >= spaceBelow
      const avail = (openAbove ? spaceAbove : spaceBelow) - gap
      const maxHeight = Math.min(window.innerHeight * 0.75, avail)
      const left = Math.max(margin, Math.min(a.right - width, window.innerWidth - width - margin))
      const next: CSSProperties = { position: 'fixed', left, width, maxHeight }
      if (openAbove) next.bottom = window.innerHeight - a.top + gap
      else next.top = a.bottom + gap
      setStyle(next)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[55]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quarter Calculation Audit"
        style={mobile ? undefined : style}
        className={[
          'z-[60] flex flex-col overflow-hidden rounded-2xl border border-soft-border bg-ivory shadow-lift',
          mobile ? 'fixed inset-x-3 bottom-3 max-h-[80vh]' : '',
        ].join(' ')}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-soft-border bg-card px-5 py-4">
          <div>
            <h3 className="font-display text-[17px] leading-tight text-navy-deep">Quarter Calculation Audit</h3>
            <p className="mt-0.5 text-[12px] text-ink-secondary">Standalone quarter derived from reported YTD numbers</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="scroll-thin min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Compact "how the quarter was derived" trust strip + anchored audit popover. */
export function QuarterlyCalcCard({ company }: { company: Insurer }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
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
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[11px] font-semibold text-navy-primary transition-colors hover:border-muted-blue"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Quarter calculation audit
      </button>

      <AuditPopover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef}>
        <YtdBridge companyId={company.id} />
      </AuditPopover>
    </div>
  )
}
