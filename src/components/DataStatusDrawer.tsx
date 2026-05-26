import { Database, ExternalLink } from 'lucide-react'
import { Drawer } from './Drawer'
import { SignalBadge } from './SignalBadge'
import { OrganicIconBlob } from './OrganicIconBlob'
import { BasisTag } from './BasisTag'
import { statusTone } from '@/lib/format'
import type { Metric } from '@/data/types'
import type { BasisInfo } from '@/data/mockData'

export interface DataStatusEntry {
  label: string
  metric: Metric
}

export interface DataStatusDrawerProps {
  open: boolean
  onClose: () => void
  moduleName: string
  entries: DataStatusEntry[]
  basis?: BasisInfo
}

/** Per-module provenance panel: source, status and freshness for each metric. */
export function DataStatusDrawer({ open, onClose, moduleName, entries, basis }: DataStatusDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Data status"
      subtitle={`${moduleName} — sources, freshness & quality`}
    >
      <div className="mb-5 flex items-center gap-3 rounded-xl2 border border-soft-border bg-soft-blue/50 p-4">
        <OrganicIconBlob shape="blob-c" tone="navy" size="sm">
          <Database />
        </OrganicIconBlob>
        <p className="text-sm text-ink-primary">
          Figures shown are <span className="font-semibold">illustrative mock data</span>. Each row
          lists the source, reporting status and last update the live product would surface.
        </p>
      </div>

      {basis && (
        <div className="mb-5 rounded-xl2 border border-soft-border bg-card p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Accounting & source basis</p>
          <BasisTag info={basis} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ice text-[11px] uppercase tracking-wide text-ink-secondary">
            <tr>
              <th className="px-4 py-3 font-semibold">Metric</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.label} className={i % 2 ? 'bg-ice/40' : ''}>
                <td className="px-4 py-3 font-medium text-ink-primary">{e.label}</td>
                <td className="px-4 py-3">
                  <SignalBadge label={e.metric.status} tone={statusTone[e.metric.status]} size="sm" />
                </td>
                <td className="px-4 py-3 text-ink-secondary">
                  {e.metric.sourceUrl ? (
                    <a
                      href={e.metric.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-navy-primary hover:underline"
                    >
                      {e.metric.source}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    e.metric.source
                  )}
                </td>
                <td className="px-4 py-3 text-ink-secondary">{e.metric.lastUpdated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Drawer>
  )
}
