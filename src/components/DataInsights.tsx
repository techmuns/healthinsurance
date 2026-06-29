import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import type { NavTarget } from '@/insights/sourceMap'
import { ANALYTICAL_LENSES, selectManagementEvents, type InsightLens, type InvestorPulse as InvestorPulseData, type LensKey } from '@/insights/investorPulse'
import { InsightLensView, LENS_ICON, StanceChip, ConfidenceChip } from '@/components/InsightLensView'
import { ManagementEventIntelligence } from '@/components/ManagementEventIntelligence'

type AnalyticalKey = Exclude<LensKey, 'overviewPulse'>

// Sections that carry a compact REFERENCE to the shared management-events feed
// (the full version lives in Pulse). Forward-Looking → leadership/execution read;
// Risk & Regulatory → governance-risk read. Same shared component + data path.
const MGMT_EVENT_LENSES = new Set<AnalyticalKey>(['forwardLookingStrategy', 'riskRegulatoryChanges'])
const MGMT_EVENT_LABEL: Partial<Record<AnalyticalKey, string>> = {
  forwardLookingStrategy: 'Leadership & board references',
  riskRegulatoryChanges: 'Governance-risk references',
}

// Compact tab labels — the full title still leads the category story below.
const TAB_LABEL: Record<AnalyticalKey, string> = {
  underwritingProfitability: 'Underwriting',
  growthLevers: 'Growth Levers',
  competitivePositioning: 'Positioning',
  expenseManagement: 'Expenses',
  investmentPerformance: 'Investments',
  forwardLookingStrategy: 'Forward View',
  riskRegulatoryChanges: 'Risk & Regulatory',
}

// Data Insights — an analyst workbook. The seven analytical lenses are presented
// as horizontal file-folder TABS; selecting one opens a single focused category
// story: a category header (title · one-line read · stance · confidence · as-of),
// then the unchanged deep-dive content (metric strip + flip cards + missed-signal
// / implication / watch-next / source trail) supplied by InsightLensView. Only
// the navigation changed — every insight, flip card and source link is preserved.

// ── File-folder tab strip ─────────────────────────────────────────────────────

function FolderTabs({ keys, selected, onSelect, lenses }: {
  keys: AnalyticalKey[]
  selected: AnalyticalKey
  onSelect: (k: AnalyticalKey) => void
  lenses: InvestorPulseData['lenses']
}) {
  return (
    <div role="tablist" aria-label="Data Insights categories" className="flex gap-1 overflow-x-auto hide-scrollbar border-b border-soft-border">
      {keys.map((k) => {
        const on = k === selected
        const lens = lenses[k]
        const Icon = LENS_ICON[k]
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(k)}
            title={lens.title}
            className={[
              'group relative inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2 text-[11.5px] font-semibold transition-colors',
              on ? 'text-white' : 'border border-b-0 border-soft-border bg-surface-tint/70 text-navy-deep hover:bg-ice',
            ].join(' ')}
            style={on ? { background: 'linear-gradient(135deg, #1E4079 0%, #14294C 100%)', boxShadow: 'inset 0 2px 0 0 #E4C67C' } : undefined}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} style={{ color: on ? '#E4C67C' : '#27457E' }} />
            <span className="whitespace-nowrap">{TAB_LABEL[k]}</span>
            {!lens.available && <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? 'rgba(255,255,255,0.4)' : 'rgba(107,114,128,0.45)' }} title="Limited data" />}
            {/* gold underline that connects the active folder to the story below */}
            {on && <span className="pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-champagne" />}
          </button>
        )
      })}
    </div>
  )
}

// ── Category header — title · one-line analyst read · stance · confidence · as-of

function CategoryHeader({ lens }: { lens: InsightLens }) {
  const Icon = LENS_ICON[lens.key as AnalyticalKey]
  return (
    <div className="premium-panel rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="icon-ring-gold grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: 'rgba(182,139,58,0.12)' }}>
          <Icon className="h-[18px] w-[18px] text-champagne-deep" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] leading-tight text-navy-deep">{lens.title}</h2>
            <StanceChip stance={lens.stance} />
            <ConfidenceChip confidence={lens.confidence} />
            {!lens.available && <span className="rounded-full bg-ice px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-ink-secondary">Limited data</span>}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-secondary">{lens.purpose}</p>
        </div>
      </div>
      {lens.available && lens.oneLineRead && (
        <p className="mt-3 border-t border-soft-border/70 pt-2.5 font-editorial text-[14px] leading-snug text-ink-primary">{lens.oneLineRead}</p>
      )}
      {lens.asOf && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium text-ink-secondary">
          <CalendarClock className="h-3 w-3 text-champagne-deep" strokeWidth={2.1} />
          Fundamentals as of <span className="font-semibold text-navy-deep">{lens.asOf}</span> · these update quarterly/annually, not daily.
        </p>
      )}
    </div>
  )
}

export function DataInsights({
  pulse,
  onGoToSource,
  reopenInsightId,
  initialOpenKey,
}: {
  pulse: InvestorPulseData
  onGoToSource: (target: NavTarget, insightId: string) => void
  reopenInsightId?: string | null
  initialOpenKey?: AnalyticalKey | null
}) {
  const keys = ANALYTICAL_LENSES as AnalyticalKey[]
  const firstAvailable = keys.find((k) => pulse.lenses[k].available) ?? keys[0]
  const [selected, setSelected] = useState<AnalyticalKey>(initialOpenKey ?? firstAvailable)

  const lens = pulse.lenses[selected]
  const showMgmtRef = MGMT_EVENT_LENSES.has(selected)
  const govEvents = showMgmtRef ? selectManagementEvents(pulse.companyId, { governanceOnly: true }) : []

  return (
    <div className="space-y-4">
      {/* Intro eyebrow */}
      <div className="px-0.5">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Data Insights</span>
          <span className="gold-rule h-px w-8 rounded-full" />
        </div>
        <p className="text-[11.5px] leading-snug text-ink-secondary">
          A source-backed analyst workbook — pick a category folder to open its focused story. Each card flips to its in-depth thesis, workings and sources.
        </p>
      </div>

      {/* File-folder category tabs */}
      <FolderTabs keys={keys} selected={selected} onSelect={setSelected} lenses={pulse.lenses} />

      {/* Selected category story (key forces a calm fade between categories) */}
      <div key={selected} className="animate-fade-in space-y-4">
        <CategoryHeader lens={lens} />
        <InsightLensView lens={lens} onGoToSource={onGoToSource} reopenInsightId={reopenInsightId} hideHeader />
        {showMgmtRef && govEvents.length > 0 && (
          <div className="premium-panel rounded-2xl p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-[3px] rounded-full bg-champagne" />
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{MGMT_EVENT_LABEL[selected]}</p>
            </div>
            <ManagementEventIntelligence variant="compact" governanceOnly companyId={pulse.companyId} companyName={pulse.company} />
          </div>
        )}
      </div>
    </div>
  )
}
