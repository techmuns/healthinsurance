import { useState } from 'react'
import { Sparkles, Eye, AlertTriangle, ListChecks, Database, Copy, Check, Pin, ArrowUpRight } from 'lucide-react'
import type { AnalystResult, Conviction } from '@/insights/analystTypes'

// ---------------------------------------------------------------------------
//  AnalystCard — the premium presentation of the Tier-2 AI Senior-Analyst
//  readout. Pure presentational: it renders an AnalystResult that has already
//  passed the server-side correctness gate (numbers grounded, no advice).
//  Reused by the Data-Audit drawer, the Insights Explorer and pinned cards.
// ---------------------------------------------------------------------------

const CONVICTION: Record<Conviction, { label: string; cls: string; dot: string }> = {
  High: { label: 'High conviction', cls: 'bg-teal-soft text-teal ring-[#BFE3E1]', dot: 'bg-teal' },
  Medium: { label: 'Medium conviction', cls: 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]', dot: 'bg-champagne' },
  Low: { label: 'Low conviction', cls: 'bg-ice text-ink-secondary ring-soft-border', dot: 'bg-ink-secondary' },
}

function Section({ icon, title, tone = 'navy', children }: { icon: React.ReactNode; title: string; tone?: 'navy' | 'gold' | 'coral' | 'teal'; children: React.ReactNode }) {
  const col = tone === 'gold' ? 'text-champagne-deep' : tone === 'coral' ? 'text-coral' : tone === 'teal' ? 'text-teal' : 'text-navy-deep'
  return (
    <div>
      <div className={`mb-1 flex items-center gap-1.5 ${col}`}>
        {icon}
        <h5 className="text-[10px] font-bold uppercase tracking-[0.13em]">{title}</h5>
      </div>
      <div className="text-[12px] leading-relaxed text-ink-primary">{children}</div>
    </div>
  )
}

export function analystResultToText(result: AnalystResult, scope: string): string {
  const lines = [
    `AI ANALYST READOUT — ${scope}`,
    '',
    result.headline,
    '',
    `ANALYST TAKE: ${result.analystTake}`,
    '',
    `WHAT MOST PEOPLE MISS: ${result.whatMostPeopleMiss}`,
    '',
    'EVIDENCE:',
    ...result.evidence.map((e) => `  • ${e.label}: ${e.detail}`),
    '',
    `PEER / TREND CONTEXT: ${result.peerOrTrendContext}`,
    '',
    `RISK / CAVEAT / FALSIFIER: ${result.riskCaveatFalsifier}`,
    '',
    `CONVICTION: ${result.conviction} — ${result.convictionRationale}`,
    '',
    'WHAT TO WATCH NEXT:',
    ...result.whatToWatchNext.map((w) => `  • ${w}`),
    '',
    `SOURCE QUALITY: ${result.sourceQualityNote}`,
    '',
    `— AI-generated, grounded in the selected audited data${result.model ? ` · ${result.model}` : ''}. Analytical implications only, not investment advice.`,
  ]
  return lines.join('\n')
}

export interface AnalystCardProps {
  result: AnalystResult
  scopeLabel: string
  cached?: boolean
  pinned?: boolean
  onPin?: () => void
  onGoToSource?: () => void
}

export function AnalystCard({ result, scopeLabel, cached, pinned, onPin, onGoToSource }: AnalystCardProps) {
  const [copied, setCopied] = useState(false)
  const conv = CONVICTION[result.conviction]

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(analystResultToText(result, scopeLabel))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#E4CE93] bg-card shadow-soft">
      {/* gold editorial accent */}
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-champagne to-champagne-deep" />

      <div className="space-y-3 p-4 pl-5">
        {/* header */}
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#1E4079] to-[#143058] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
            <Sparkles className="h-3 w-3" /> AI analyst
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ring-1 ${conv.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${conv.dot}`} />
            {conv.label}
          </span>
        </div>

        {/* headline */}
        <h4 className="font-display text-[16px] leading-snug text-navy-deep">{result.headline}</h4>

        <Section icon={<Eye className="h-3.5 w-3.5" />} title="Analyst take">
          {result.analystTake}
        </Section>

        <Section icon={<Sparkles className="h-3.5 w-3.5" />} title="What most people miss" tone="gold">
          <span className="rounded bg-champagne-soft/60 px-0.5">{result.whatMostPeopleMiss}</span>
        </Section>

        <Section icon={<Database className="h-3.5 w-3.5" />} title="Evidence from selected data" tone="teal">
          <ul className="space-y-1">
            {result.evidence.map((e, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-teal" />
                <span>
                  <span className="font-semibold text-navy-deep">{e.label}:</span> {e.detail}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={<ArrowUpRight className="h-3.5 w-3.5" />} title="Peer / trend context">
          {result.peerOrTrendContext}
        </Section>

        <Section icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Risk · caveat · falsifier" tone="coral">
          {result.riskCaveatFalsifier}
        </Section>

        <Section icon={<ListChecks className="h-3.5 w-3.5" />} title="What to watch next">
          <ul className="space-y-0.5">
            {result.whatToWatchNext.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-blue" />
                {w}
              </li>
            ))}
          </ul>
        </Section>

        <div className="rounded-lg bg-surface-tint p-2.5">
          <div className="flex items-center gap-1.5 text-ink-secondary">
            <span className={`h-1.5 w-1.5 rounded-full ${conv.dot}`} />
            <span className="text-[9.5px] font-bold uppercase tracking-wide text-navy-deep">Conviction · {result.conviction}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">{result.convictionRationale}</p>
          <p className="mt-1.5 border-t border-soft-border pt-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
            <span className="font-semibold text-navy-deep">Source quality:</span> {result.sourceQualityNote}
          </p>
        </div>

        {/* honest AI label + actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-soft-border pt-2">
          <p className="text-[9.5px] italic leading-snug text-ink-secondary">
            AI-generated, grounded in the selected audited data{result.model ? ` · ${result.model}` : ''}{cached ? ' · cached' : ''}. Analytical implications only — not investment advice.
          </p>
          <div className="flex items-center gap-1.5">
            {onGoToSource && (
              <button type="button" onClick={onGoToSource} className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-1 text-[10px] font-semibold text-navy-deep transition hover:border-muted-blue" title="Go to the first source cell">
                <ArrowUpRight className="h-3 w-3" /> Source
              </button>
            )}
            {onPin && (
              <button type="button" onClick={onPin} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition ${pinned ? 'border-transparent bg-champagne-soft text-champagne-deep' : 'border-soft-border bg-white text-navy-deep hover:border-muted-blue'}`} title="Pin to Insights">
                <Pin className="h-3 w-3" /> {pinned ? 'Pinned' : 'Pin'}
              </button>
            )}
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-1 text-[10px] font-semibold text-navy-deep transition hover:border-muted-blue" title="Copy insight">
              {copied ? <Check className="h-3 w-3 text-teal" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
