import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** Panel max-width (Tailwind class). Defaults to a narrow form drawer; a data
   *  tool (e.g. the Excel verifier) passes a wider class so a table can breathe. */
  widthClass?: string
}

/** Right-side sliding drawer for module drill-downs and data-status panels. */
export function Drawer({ open, onClose, title, subtitle, children, footer, widthClass = 'max-w-xl' }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // Freeze the page behind the drawer so only the drawer's own content scrolls
    // (never the whole page).
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus into the drawer the moment it opens, so the user's attention and
    // keyboard land on the panel that just appeared — not somewhere up the page.
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  // Portal to <body> so the fixed overlay escapes any transformed ancestor (the
  // page-enter animation wrapper keeps a `transform`, which would otherwise trap
  // `position: fixed` and anchor the drawer to the page top). Portaling keeps it
  // viewport-anchored — the drawer always opens where the user is looking.
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-navy-deep/25 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full ${widthClass} flex-col overflow-hidden rounded-l-[28px] bg-ivory shadow-lift outline-none animate-drawer-in`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-soft-border bg-card px-6 py-5">
          <div>
            <h3 className="font-display text-xl text-navy-deep">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-ink-secondary">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && <footer className="shrink-0 border-t border-soft-border bg-card px-6 py-4">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  )
}
