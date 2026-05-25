import type { ReactNode } from 'react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { Icon } from './icons'
import { TopFilterBar } from './TopFilterBar'
import { navItems } from '@/nav'

export interface DashboardShellProps {
  active: string
  onNavigate: (id: string) => void
  children: ReactNode
}

export function DashboardShell({ active, onNavigate, children }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen bg-ivory">
      {/* Left navigation */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-soft-border bg-card/70 px-4 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <OrganicIconBlob shape="blob-a" tone="navy" size="md">
            <Icon name="shield" />
          </OrganicIconBlob>
          <div>
            <p className="font-display text-[15px] leading-tight text-navy-deep">Insurance</p>
            <p className="text-xs font-medium tracking-wide text-muted-blue">Investor Dashboard</p>
          </div>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.id === active
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={[
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200',
                  isActive
                    ? 'bg-soft-blue/70 font-semibold text-navy-deep'
                    : 'text-ink-secondary hover:bg-ice hover:text-navy-primary',
                ].join(' ')}
              >
                <OrganicIconBlob
                  shape={isActive ? 'blob-b' : 'blob-d'}
                  tone={isActive ? 'navy' : 'ivory'}
                  size="sm"
                  interactive={!isActive}
                >
                  <Icon name={item.icon} />
                </OrganicIconBlob>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-4 rounded-xl2 border border-soft-border bg-ivory p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-blue">Demo dataset</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
            All figures are illustrative mock data for design purposes only.
          </p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopFilterBar />

        {/* Mobile nav */}
        <div className="scroll-thin flex gap-2 overflow-x-auto px-4 pt-3 lg:hidden">
          {navItems.map((item) => {
            const isActive = item.id === active
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={[
                  'whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-navy-primary text-white' : 'bg-card text-ink-secondary ring-1 ring-soft-border',
                ].join(' ')}
              >
                {item.shortLabel}
              </button>
            )
          })}
        </div>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6">{children}</main>

        <footer className="border-t border-soft-border px-6 py-5 text-center text-xs text-ink-secondary">
          Insurance Investment Dashboard · Illustrative mock data · Built for design demonstration
        </footer>
      </div>
    </div>
  )
}
