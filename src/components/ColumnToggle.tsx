import { useEffect, useRef, useState } from 'react'
import { Columns3, Eye, EyeOff, Check } from 'lucide-react'

// ---------------------------------------------------------------------------
//  ColumnToggle — a small, Excel-style "hide / show columns" control for the
//  audit tables. Hiding a column only hides it visually; the underlying data is
//  never removed. Clean popover, click-outside to close, a count when columns
//  are hidden, and a one-click "Show all". Shared by every audit-data table so
//  the behaviour reads the same everywhere.
// ---------------------------------------------------------------------------

export interface ColumnDef {
  key: string
  label: string
  /** A column that must always stay visible (e.g. the row-label column). */
  locked?: boolean
}

/** Hidden-column state + helpers. One per table. */
export function useColumnVisibility(initialHidden: string[] = []) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden))
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const showAll = () => setHidden(new Set())
  const isHidden = (key: string) => hidden.has(key)
  return { hidden, toggle, showAll, isHidden }
}

export function ColumnToggle({
  columns,
  hidden,
  onToggle,
  onShowAll,
  align = 'right',
}: {
  columns: ColumnDef[]
  hidden: Set<string>
  onToggle: (key: string) => void
  onShowAll: () => void
  align?: 'left' | 'right'
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

  const hiddenCount = columns.filter((c) => hidden.has(c.key) && !c.locked).length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Hide or show columns — data is never removed, only hidden"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-soft transition-colors ${
          hiddenCount > 0
            ? 'border-navy-primary/30 bg-soft-blue text-navy-primary'
            : 'border-soft-border bg-white text-ink-secondary hover:border-navy-primary/30 hover:text-navy-primary'
        }`}
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columns
        {hiddenCount > 0 && (
          <span className="rounded-full bg-navy-primary/15 px-1.5 text-[9.5px] font-bold tabular-nums text-navy-primary">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-soft-border bg-card shadow-card ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-center justify-between border-b border-soft-border bg-[#F7F9FD] px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-secondary">Columns</span>
            <button
              type="button"
              onClick={onShowAll}
              disabled={hiddenCount === 0}
              className="text-[10.5px] font-semibold text-navy-primary transition-opacity hover:underline disabled:cursor-default disabled:opacity-40"
            >
              Show all
            </button>
          </div>
          <ul className="max-h-72 overflow-auto py-1">
            {columns.map((c) => {
              const isHidden = hidden.has(c.key)
              const shown = !isHidden
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => !c.locked && onToggle(c.key)}
                    disabled={c.locked}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] transition-colors ${
                      c.locked ? 'cursor-default text-ink-secondary/70' : 'text-ink-primary hover:bg-ice/70'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${
                        shown ? 'border-navy-primary bg-navy-primary text-white' : 'border-soft-border bg-white text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className={`flex-1 truncate ${shown ? '' : 'text-ink-secondary line-through decoration-ink-secondary/40'}`}>
                      {c.label}
                    </span>
                    {c.locked ? (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary/60">locked</span>
                    ) : shown ? (
                      <Eye className="h-3.5 w-3.5 text-ink-secondary/50" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-ink-secondary/40" />
                    )}
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
