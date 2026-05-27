import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

/**
 * Quiet "About this view" affordance: a small pill that reveals a short
 * context note on hover, focus or click. The popover is absolutely positioned
 * so it never shifts layout, and closes on mouse-leave, outside-click or Esc.
 */
export function AboutView({ text, label = 'About this view' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-soft-border bg-card px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary"
      >
        <Info className="h-3.5 w-3.5" />
        {label}
      </button>
      <div
        role="tooltip"
        className={[
          'absolute right-0 top-[calc(100%+8px)] z-40 w-[280px] origin-top-right rounded-xl border border-soft-border bg-card p-3 text-[11.5px] leading-relaxed text-ink-secondary shadow-card transition-all duration-150 ease-out',
          open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        ].join(' ')}
      >
        {text}
      </div>
    </div>
  )
}
