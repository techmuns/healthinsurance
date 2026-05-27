import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

/** Right-side sliding drawer for module drill-downs and data-status panels. */
export function Drawer({ open, onClose, title, subtitle, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-navy-deep/25 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="absolute right-0 top-0 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-bl-[28px] bg-ivory shadow-lift animate-drawer-in"
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
        <div className="scroll-thin min-h-0 overflow-y-auto px-6 py-6">{children}</div>
        {footer && <footer className="shrink-0 border-t border-soft-border bg-card px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  )
}
