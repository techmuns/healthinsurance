import { useState } from 'react'
import { CalendarDays, ChevronRight, ExternalLink, Quote } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SignalBadge } from '@/components/SignalBadge'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { Drawer } from '@/components/Drawer'
import { PromiseTracker } from '@/components/PromiseTracker'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { commentary, events, promiseTracker, type EventItem } from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'

type MgmtView = 'Current Commentary' | 'Promise Tracker'
type Topic = 'Growth' | 'Margin' | 'Distribution' | 'Regulation' | 'Capital'

const impactTone = {
  Positive: 'positive',
  Negative: 'negative',
  Neutral: 'neutral',
  Watch: 'warning',
} as const

export function ManagementEvents() {
  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Governance Signal"
        verdict="Credible team, one watch-item"
        tone="navy"
        badge="On Track"
        summary="Track record on growth, margin and retail-mix guidance is broadly on track; the open item is closing the banca-concentration gap to guidance."
      />
      <ManagementReadout />
      <EventFeed />
      <InvestorRead
        title="Management Investor Read"
        signal="On Track"
        lines={[
          { label: 'Why', value: 'Measurable promises have broadly been delivered.' },
          { label: 'Implication', value: 'Credible management where targets are quantified.' },
          { label: 'Watch', value: 'Banca-concentration gap to guidance.' },
          { label: 'Read', value: 'No governance red flags; execution credibility intact.' },
        ]}
      />
    </div>
  )
}

function ManagementReadout() {
  const [view, setView] = useState<MgmtView>('Promise Tracker')
  const [topic, setTopic] = useState<Topic>('Growth')
  const company = useActiveCompany()
  const item = commentary.find((c) => c.topic === topic) ?? commentary[0]
  const promises = promiseTracker.filter((p) => p.company === company.id)

  return (
    <ModuleCard
      question="What did management promise, and what actually happened?"
      title="Management Readout"
      icon="commentary"
      controls={
        <>
          <SegmentedControl<MgmtView> label="View" options={['Promise Tracker', 'Current Commentary'] as MgmtView[]} value={view} onChange={setView} size="sm" />
          {view === 'Current Commentary' && (
            <SegmentedControl<Topic> label="Topic" options={['Growth', 'Margin', 'Distribution', 'Regulation', 'Capital'] as Topic[]} value={topic} onChange={setTopic} size="sm" />
          )}
        </>
      }
    >
      {view === 'Promise Tracker' && <PromiseTracker items={promises} companyName={company.shortName} />}
      {view === 'Current Commentary' && (
        <div className="rounded-xl2 border border-soft-border bg-card p-6">
          <OrganicIconBlob shape="blob-e" tone="soft" size="md">
            <Quote />
          </OrganicIconBlob>
          <blockquote className="mt-4 font-display text-xl leading-relaxed text-navy-deep">“{item.quote}”</blockquote>
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-secondary">
            <span className="font-semibold text-navy-primary">{item.speaker}</span>
            <span>·</span>
            <span>{item.topic}</span>
            <span>·</span>
            <span>{item.date}</span>
          </div>
        </div>
      )}
    </ModuleCard>
  )
}

function EventFeed() {
  const [type, setType] = useState<'All' | EventItem['type']>('All')
  const [impact, setImpact] = useState<'All' | EventItem['impact']>('All')
  const [open, setOpen] = useState<EventItem | null>(null)

  const filtered = events
    .filter((e) => type === 'All' || e.type === type)
    .filter((e) => impact === 'All' || e.impact === impact)
    .sort((a, b) => b.importance - a.importance)

  return (
    <ModuleCard
      question="What events matter now — ranked by investor impact, not recency?"
      title="Insurance Event Feed"
      icon="events"
      controls={
        <>
          <SegmentedControl<'All' | EventItem['type']>
            label="Type"
            options={['All', 'Sector', 'Company', 'Regulation', 'Competition'] as ('All' | EventItem['type'])[]}
            value={type}
            onChange={setType}
            size="sm"
          />
          <SegmentedControl<'All' | EventItem['impact']>
            label="Impact"
            options={['All', 'Positive', 'Negative', 'Neutral', 'Watch'] as ('All' | EventItem['impact'])[]}
            value={impact}
            onChange={setImpact}
            size="sm"
          />
        </>
      }
    >
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-sm text-ink-secondary">
            No events match this filter.
          </div>
        )}
        {filtered.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setOpen(e)}
            className="group flex w-full items-start gap-4 rounded-xl2 border border-soft-border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft"
          >
            <OrganicIconBlob shape="blob-c" tone="soft" size="md">
              <CalendarDays />
            </OrganicIconBlob>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SignalBadge label={e.impact} tone={impactTone[e.impact]} size="sm" />
                <span className="text-[11px] font-medium text-muted-blue">{e.tag}</span>
                <span className="text-[11px] text-ink-secondary">· {e.date}</span>
              </div>
              <h4 className="mt-1.5 font-semibold leading-snug text-navy-deep">{e.title}</h4>
              <p className="mt-1 text-sm text-ink-secondary">{e.relevance}</p>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-secondary transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>

      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open?.title ?? ''} subtitle={open ? `${open.tag} · ${open.date}` : ''}>
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <SignalBadge label={open.impact} tone={impactTone[open.impact]} />
              <SignalBadge label={open.type} tone="navy" />
            </div>
            <div className="rounded-xl2 border border-soft-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Investor relevance</p>
              <p className="mt-1 text-sm text-ink-primary">{open.relevance}</p>
            </div>
            <p className="text-sm leading-relaxed text-ink-primary">{open.detail}</p>
            <div className="flex items-center justify-between rounded-xl2 bg-ice px-4 py-3 text-sm">
              <span className="text-ink-secondary">Source</span>
              {open.sourceUrl ? (
                <a href={open.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-primary hover:underline">
                  {open.source}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="font-medium text-navy-primary">{open.source}</span>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </ModuleCard>
  )
}
