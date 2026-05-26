import { useState } from 'react'
import type { ReactNode } from 'react'
import { Database, Maximize2 } from 'lucide-react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { Drawer } from './Drawer'
import { DataStatusDrawer, type DataStatusEntry } from './DataStatusDrawer'
import { Icon, type IconKey } from './icons'
import type { BasisInfo } from '@/data/mockData'

export interface ModuleCardProps {
  /** The single investor question this module answers. */
  question: string
  title: string
  icon: IconKey
  /** Control row (segmented controls). */
  controls?: ReactNode
  /** Main visual / chart. */
  children: ReactNode
  /** Optional KPI strip rendered under the chart. */
  kpis?: ReactNode
  /** Right rail: short investor insight. */
  insight?: ReactNode
  /** Detail drill-down drawer contents. */
  drawer?: ReactNode
  drawerTitle?: string
  drawerSubtitle?: string
  /** Data-status entries for the provenance drawer. */
  dataStatus?: DataStatusEntry[]
  /** Accounting/source basis shown in the provenance drawer. */
  dataBasis?: BasisInfo
}

export function ModuleCard({
  question,
  title,
  icon,
  controls,
  children,
  kpis,
  insight,
  drawer,
  drawerTitle,
  drawerSubtitle,
  dataStatus,
  dataBasis,
}: ModuleCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  return (
    <section className="card-surface animate-fade-in p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <OrganicIconBlob shape="blob-b" tone="navy" size="md">
            <Icon name={icon} />
          </OrganicIconBlob>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne">{question}</p>
            <h2 className="mt-0.5 font-display text-[22px] leading-tight text-navy-deep">{title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dataStatus && dataStatus.length > 0 && (
            <button
              type="button"
              onClick={() => setStatusOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary"
            >
              <Database className="h-3.5 w-3.5" />
              Data status
            </button>
          )}
          {drawer && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-navy-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Details
            </button>
          )}
        </div>
      </header>

      {controls && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-soft-border bg-ice/70 px-3.5 py-2.5">
          {controls}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          {children}
          {kpis && <div className="mt-4">{kpis}</div>}
        </div>
        {insight && <div className="flex flex-col gap-3.5">{insight}</div>}
      </div>

      {drawer && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={drawerTitle ?? `${title} — details`}
          subtitle={drawerSubtitle}
        >
          {drawer}
        </Drawer>
      )}

      {dataStatus && (
        <DataStatusDrawer
          open={statusOpen}
          onClose={() => setStatusOpen(false)}
          moduleName={title}
          entries={dataStatus}
          basis={dataBasis}
        />
      )}
    </section>
  )
}
