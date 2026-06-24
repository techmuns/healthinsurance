import { useEffect, useMemo, useState } from 'react'
import { X, Sparkles, Loader2, AlertTriangle, Crown, Copy, Check, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatValue, type AuditCell } from '@/lib/extractedDataAudit'
import { selectionFromAuditCells, computeReadout, scopeLabel, buildAnalystRequest } from '@/lib/analystReadout'
import { generateAnalysis } from '@/lib/insightApi'
import type { AnalystResult, Conviction, Tier1Readout } from '@/insights/analystTypes'

// ---------------------------------------------------------------------------
//  AiAnalysisDrawer — a compact, NON-modal right-side panel.
//
//  Always shows the instant Tier-1 readout (count · ready/gaps · highest/lowest ·
//  peer rank · formula), free and offline. On "Analyse selected data" it calls the
//  secure server function for a short AI read (4-6 bullets + formula + conclusion).
//  Deliberately small — a quick analyst assistant, not a report generator.
// ---------------------------------------------------------------------------

const CONV: Record<Conviction, { cls: string; dot: string }> = {
  High: { cls: 'bg-teal-soft text-teal ring-[#BFE3E1]', dot: 'bg-teal' },
  Medium: { cls: 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]', dot: 'bg-champagne' },
  Low: { cls: 'bg-ice text-ink-secondary ring-soft-border', dot: 'bg-ink-secondary' },
}

function fmt(value: number, unit: string): string {
  return formatValue(value, unit)
}

function CoverageStrip({ readout }: { readout: Tier1Readout }) {
  const { coverage } = readout
  const pct = coverage.total ? Math.round((coverage.ready / coverage.total) * 100) : 0
  const tone = pct >= 80 ? 'bg-teal' : pct >= 50 ? 'bg-champagne' : 'bg-coral'
  return (
    <div className="rounded-xl border border-soft-border bg-surface-tint p-3">
      <p className="text-[11.5px] font-semibold text-navy-deep">
        {coverage.total} cell{coverage.total === 1 ? '' : 's'} selected · <span className="text-teal">{coverage.ready} ready</span>
        {coverage.gaps > 0 && <span className="text-coral"> · {coverage.gaps} gap{coverage.gaps > 1 ? 's' : ''}</span>}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ice">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {coverage.gaps > 0 && (
        <p className="mt-1.5 text-[10px] text-ink-secondary">
          {coverage.gaps} selected cell{coverage.gaps > 1 ? 's are' : ' is'} not ready, so this analysis is partial.
        </p>
      )}
    </div>
  )
}

function AiResultCard({ result, scope }: { result: AnalystResult; scope: string }) {
  const [copied, setCopied] = useState(false)
  const conv = CONV[result.conviction]
  const copy = async () => {
    const text = [
      `AI ANALYSIS — ${scope}`,
      '',
      'Quick read:',
      ...result.quickRead.map((b) => `• ${b}`),
      result.formula ? `\n${result.formula.title}: ${result.formula.body}` : '',
      result.peerNote ? `\nPeer: ${result.peerNote}` : '',
      `\nSource quality: ${result.sourceQuality}`,
      `Conviction: ${result.conviction}`,
      `\nConclusion: ${result.conclusion}`,
      `\n— AI-generated from the selected audited cells${result.model ? ` · ${result.model}` : ''}. Not investment advice.`,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#E4CE93] bg-card shadow-soft">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-champagne to-champagne-deep" />
      <div className="space-y-2.5 p-3 pl-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#1E4079] to-[#143058] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
            <Sparkles className="h-3 w-3" /> AI analysis
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ring-1 ${conv.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${conv.dot}`} /> {result.conviction} conviction
          </span>
        </div>

        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.13em] text-navy-deep">Quick read</p>
          <ul className="space-y-1">
            {result.quickRead.map((b, i) => (
              <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-ink-primary">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-champagne-deep" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {result.formula && (
          <div className="rounded-lg bg-soft-blue/50 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-navy-primary">{result.formula.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">{result.formula.body}</p>
          </div>
        )}

        {result.peerNote && (
          <p className="text-[11.5px] leading-relaxed text-ink-primary">
            <span className="font-semibold text-navy-deep">Peers: </span>
            {result.peerNote}
          </p>
        )}

        <div className="rounded-lg bg-surface-tint p-2.5">
          <p className="text-[11px] leading-relaxed text-ink-secondary">
            <span className="font-semibold text-navy-deep">Source quality: </span>
            {result.sourceQuality}
          </p>
        </div>

        <div className="border-t border-soft-border pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-navy-deep">Conclusion</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-primary">{result.conclusion}</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-soft-border pt-2">
          <p className="text-[9.5px] italic leading-snug text-ink-secondary">
            AI-generated from your selection{result.model ? ` · ${result.model}` : ''}. Not investment advice.
          </p>
          <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-1 text-[10px] font-semibold text-navy-deep transition hover:border-muted-blue">
            {copied ? <Check className="h-3 w-3 text-teal" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InstantReadout({ readout }: { readout: Tier1Readout }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy-deep">
        Instant readout <span className="font-medium normal-case tracking-normal text-ink-secondary">· free, from your selection</span>
      </p>

      {readout.formula && (
        <div className="rounded-lg bg-soft-blue/40 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-navy-primary">{readout.formula.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">{readout.formula.body}</p>
        </div>
      )}

      {readout.metricStats.map((m) => {
        const last = [...m.ranks].sort((a, b) => b.rank - a.rank)[0]
        return (
          <div key={`${m.metric}-${m.period}`} className="rounded-lg border border-soft-border bg-card p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11.5px] font-semibold text-navy-deep">{m.metricLabel}</p>
              <span className="text-[9px] uppercase tracking-wide text-ink-secondary">{m.period} · n={m.count}</span>
            </div>
            <div className="mt-1 space-y-0.5 text-[11px]">
              <p className="flex items-center gap-1.5 text-ink-primary">
                <Crown className="h-3 w-3 text-teal" /> {m.higherIsBetter === false ? 'Lowest' : 'Highest'}:{' '}
                <span className="font-semibold text-navy-deep">{(m.higherIsBetter === false ? m.min : m.max).companyLabel}</span> {fmt((m.higherIsBetter === false ? m.min : m.max).value, m.unit)}
              </p>
              <p className="text-ink-secondary">
                Other end: {(m.higherIsBetter === false ? m.max : m.min).companyLabel} {fmt((m.higherIsBetter === false ? m.max : m.min).value, m.unit)} · median {fmt(m.median, m.unit)}
              </p>
              {last?.isOutlier && (
                <p className="text-champagne-deep">{last.companyLabel} is an outlier ({last.z > 0 ? '+' : ''}{last.z}σ).</p>
              )}
            </div>
          </div>
        )
      })}

      {readout.trends.map((t) => {
        const Icon = t.absChange === 0 ? Minus : t.absChange > 0 ? TrendingUp : TrendingDown
        const col = t.absChange === 0 ? 'text-ink-secondary' : t.absChange > 0 ? 'text-teal' : 'text-coral'
        return (
          <div key={`${t.company}-${t.metric}`} className="rounded-lg border border-soft-border bg-card p-2.5">
            <p className="text-[11.5px] font-semibold text-navy-deep">{t.companyLabel} · {t.metricLabel}</p>
            <p className={`mt-0.5 flex items-center gap-1.5 text-[11.5px] ${col}`}>
              <Icon className="h-3.5 w-3.5" /> {fmt(t.from, t.unit)} → {fmt(t.to, t.unit)}
              <span className="text-ink-secondary">({t.points[0].period}–{t.points[t.points.length - 1].period})</span>
            </p>
          </div>
        )
      })}

      {readout.metricStats.length === 0 && readout.scope.singlePeriod && (
        <p className="rounded-lg bg-soft-blue px-3 py-2 text-[10.5px] text-navy-primary">
          {readout.scope.periods[0] ?? 'Single period'} only — no trend conclusion from this selection. Select two insurers for the same metric to compare, or more periods for a trend.
        </p>
      )}

      {readout.coverage.gaps > 0 && (
        <div className="rounded-lg border border-[#F0D2CC] bg-coral-soft/50 p-2.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-coral">
            <AlertTriangle className="h-3.5 w-3.5" /> {readout.coverage.gaps} data gap{readout.coverage.gaps > 1 ? 's' : ''}
          </p>
          <ul className="space-y-0.5">
            {readout.coverage.gapList.slice(0, 6).map((g, i) => (
              <li key={i} className="text-[10.5px] leading-snug text-ink-primary">
                <span className="font-semibold">{g.companyLabel} · {g.metricLabel} · {g.period}</span>
                <span className="text-ink-secondary"> — {g.reason}</span>
              </li>
            ))}
            {readout.coverage.gapList.length > 6 && <li className="text-[10px] italic text-ink-secondary">+{readout.coverage.gapList.length - 6} more…</li>}
          </ul>
        </div>
      )}

      {readout.sourceQuality.firewallWarnings.length > 0 && (
        <ul className="space-y-0.5">
          {readout.sourceQuality.firewallWarnings.slice(0, 2).map((w, i) => (
            <li key={i} className="flex items-start gap-1 text-[10px] leading-snug text-champagne-deep">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AiAnalysisDrawer({ cells, autoGenerate, onClose }: { cells: AuditCell[]; autoGenerate?: boolean; onClose: () => void }) {
  const items = useMemo(() => selectionFromAuditCells(cells), [cells])
  const readout = useMemo(() => computeReadout(items), [items])
  const label = useMemo(() => scopeLabel(readout), [readout])

  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<AnalystResult | null>(null)
  const [error, setError] = useState<{ error: string; detail?: string } | null>(null)
  const canGenerate = readout.coverage.ready > 0

  const generate = async (force = false) => {
    setState('loading')
    setError(null)
    const resp = await generateAnalysis(buildAnalystRequest(items), force)
    if (resp.ok) {
      setResult(resp.result)
      setState('done')
    } else {
      setError({ error: resp.error, detail: resp.detail })
      setState('error')
    }
  }

  useEffect(() => {
    if (autoGenerate && canGenerate) void generate(false)
  }, [readout.signature])

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full max-w-sm">
      <aside className="animate-drawer-in pointer-events-auto relative ml-auto flex h-full w-full flex-col border-l border-soft-border bg-card shadow-lift">
        <div className="flex items-start justify-between gap-3 border-b border-soft-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne-deep">AI analysis</p>
            <h3 className="mt-0.5 truncate font-display text-[14.5px] leading-tight text-navy-deep" title={label}>{label}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-ink-secondary transition hover:bg-ice hover:text-navy-deep" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          <CoverageStrip readout={readout} />

          {state === 'done' && result ? (
            <AiResultCard result={result} scope={label} />
          ) : (
            <div className="rounded-xl border border-[#9DB4D8] bg-gradient-to-br from-soft-blue/70 to-white p-3">
              {state === 'error' && error && (
                <div className="mb-2 rounded-lg bg-card/80 px-2.5 py-1.5 text-[10.5px]">
                  <p className="font-semibold text-coral">{error.error}</p>
                  {error.detail && <p className="mt-0.5 text-ink-secondary">{error.detail}</p>}
                  <p className="mt-1 text-ink-secondary">Here is the basic readout from the selected data:</p>
                </div>
              )}
              <button
                type="button"
                disabled={!canGenerate || state === 'loading'}
                onClick={() => generate(false)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#1E4079] to-[#143058] px-3 py-2 text-[12px] font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === 'loading' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" /> {state === 'error' ? 'Try again' : 'Analyse selected data'}
                  </>
                )}
              </button>
              {!canGenerate && <p className="mt-1.5 text-[10px] italic text-ink-secondary">Select at least one ready, source-backed cell to analyse.</p>}
            </div>
          )}

          {state === 'done' && (
            <button type="button" onClick={() => generate(true)} className="text-[10.5px] font-semibold text-muted-blue transition hover:text-navy-deep">
              Regenerate
            </button>
          )}

          <div className="border-t border-soft-border pt-2">
            <InstantReadout readout={readout} />
          </div>
        </div>
      </aside>
    </div>
  )
}
