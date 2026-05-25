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
    <div className="flex min-h-screen bg-transparent">
      {/* Left navigation — floating champagne capsule rail, vertically centered */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 items-center justify-center p-4 lg:flex">
        <div className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-y-auto scroll-thin rounded-[30px] border border-[rgba(182,139,58,0.18)] bg-gradient-to-b from-[#F8F3E9] to-[#F4ECDC] px-3 py-5 shadow-[0_18px_45px_rgba(23,43,77,0.08)]">
          {/* Brand */}
          <div className="flex items-center gap-2.5 px-1.5">
            <OrganicIconBlob shape="blob-a" tone="navy" size="sm">
              <Icon name="shield" />
            </OrganicIconBlob>
            <div className="leading-tight">
              <p className="font-display text-[15px] text-navy-deep">Insurance</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-champagne-deep">
                Investor Dashboard
              </p>
            </div>
          </div>

          <nav className="mt-6 flex flex-1 flex-col gap-1">
            {navItems.map((item) => {
              const isActive = item.id === active
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  title={item.question}
                  className={[
                    'group relative flex items-center gap-2.5 rounded-2xl py-2 pl-2.5 pr-2 text-left text-[13px] transition-all duration-200',
                    isActive
                      ? 'border border-[rgba(182,139,58,0.18)] bg-white/85 font-semibold text-navy-deep shadow-[0_10px_26px_rgba(23,43,77,0.08)]'
                      : 'border border-transparent text-[#5C6675] hover:bg-white/55 hover:text-navy-primary',
                  ].join(' ')}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-champagne" />
                  )}
                  <OrganicIconBlob
                    shape={isActive ? 'blob-b' : 'blob-d'}
                    tone={isActive ? 'navy' : 'ivory'}
                    size="sm"
                    interactive={!isActive}
                  >
                    <Icon name={item.icon} />
                  </OrganicIconBlob>
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="mt-3 rounded-2xl border border-[rgba(182,139,58,0.2)] bg-white/55 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">Demo</p>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-secondary">Mock data preview.</p>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopFilterBar section={active} />

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
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-navy-primary text-white' : 'bg-card text-ink-secondary ring-1 ring-soft-border',
                ].join(' ')}
              >
                {item.shortLabel}
              </button>
            )
          })}
        </div>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-5 sm:px-6">
          <div key={active} className="animate-fade-in">
            {children}
          </div>
        </main>

        <footer className="border-t border-soft-border px-6 py-4 text-center text-[11px] text-ink-secondary">
          Insurance Investment Dashboard · Illustrative mock data · Built for design demonstration
        </footer>
      </div>
    </div>
  )
}
