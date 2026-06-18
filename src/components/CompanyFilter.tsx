import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Building2 } from 'lucide-react'
import { companyColor } from '@/lib/companyColors'

// ---------------------------------------------------------------------------
//  CompanyFilter — view the audit tables for one company (e.g. only Niva Bupa,
//  only Star) or all of them. Pure view filter: it never mutates or removes any
//  underlying data, it only narrows what's shown. Each option carries the
//  company's colour dot so the identity is consistent with the tables.
// ---------------------------------------------------------------------------

export interface CompanyOption {
  id: string // 'all' for every company
  label: string
}

export function CompanyFilter({
  options,
  value,
  onChange,
}: {
  options: CompanyOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const selected = options.find((o) => o.id === value) ?? options[0]
  const isAll = selected.id === 'all'
  const dot = companyColor(selected.id).key

  return (
    <div ref={ref} className="relative">
      <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-secondary">Company</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Filter the audit tables by company — view only one insurer or all"
        className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11.5px] font-medium text-navy-deep shadow-soft transition-colors hover:border-navy-primary/30"
      >
        {isAll ? (
          <Building2 className="h-3.5 w-3.5 text-ink-secondary" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
        )}
        {selected.label}
        <ChevronDown className={`h-3.5 w-3.5 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-soft-border bg-card shadow-card">
          <ul className="max-h-72 overflow-auto py-1">
            {options.map((o) => {
              const on = o.id === value
              const c = companyColor(o.id)
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] transition-colors hover:bg-ice/70 ${
                      on ? 'font-semibold text-navy-deep' : 'text-ink-primary'
                    }`}
                  >
                    {o.id === 'all' ? (
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
                    ) : (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.key }} />
                    )}
                    <span className="flex-1 truncate">{o.label}</span>
                    {on && <Check className="h-3.5 w-3.5 shrink-0 text-navy-primary" strokeWidth={3} />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
