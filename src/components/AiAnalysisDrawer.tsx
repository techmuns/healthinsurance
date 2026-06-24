import { useEffect, useMemo, useState } from 'react'
import { X, Sparkles, Loader2, AlertTriangle, Copy, Check } from 'lucide-react'
import type { AuditCell } from '@/lib/extractedDataAudit'
import { selectionFromAuditCells, computeReadout, scopeLabel, buildAnalystRequest, localQuickRead } from '@/lib/analystReadout'
import { generateAnalysis } from '@/lib/insightApi'
import type { AnalystResult, Conviction, Tier1Readout } from '@/insights/analystTypes'

// ---------------------------------------------------------------------------
//  AiAnalysisDrawer — a compact, NON-modal right-side panel.
//
//  Always leads with a few plain analysis points computed in the browser (free,
//  offline). "Analyse selected data" tries the secure server function for a
//  sharper AI read (a few bullets + formula + conclusion). If the AI add-on can't
//  run, the panel simply keeps showing the analysis points — it NEVER surfaces
//  setup / server / key plumbing on the dashboard.
// ---------------------------------------------------------------------------

const CONV: Record<Conviction, { cls: string; dot: string }> = {
  High: { cls: 'bg-teal-soft text-teal ring-[#BFE3E1]', dot: 'bg-teal' },
  Medium: { cls: 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]', dot: 'bg-champagne' },
  Low: { cls: 'bg-ice text-ink-secondary ring-soft-border', dot: 'bg-ink-secondary' },
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-1 text-[10px] font-semibold text-navy-deep transition hover:border-muted-blue">
      {copied ? <Check className="h-3 w-3 text-teal" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
    </button>
  )
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
          {coverage.gaps} selected cell{coverage.gaps > 1 ? 's are' : ' is'} not ready, so this is a partial read.
        </p>
      )}
    </div>
  )
}

function Bullets({ points }: { points: string[] }) {
  return (
    <ul className="space-y-1">
      {points.map((b, i) => (
        <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-ink-primary">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-champagne-deep" />
          {b}
        </li>
      ))}
    </ul>
  )
}

function FormulaBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-soft-blue/50 p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-navy-primary">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">{body}</p>
    </div>
  )
}

function AiResultCard({ result, scope }: { result: AnalystResult; scope: string }) {
  const conv = CONV[result.conviction]
  const copyText = [
    `Analysis — ${scope}`,
    '',
    ...result.quickRead.map((b) => `• ${b}`),
    result.formula ? `\n${result.formula.title}: ${result.formula.body}` : '',
    result.peerNote ? `\nPeers: ${result.peerNote}` : '',
    `\nConclusion: ${result.conclusion}`,
  ]
    .filter(Boolean)
    .join('\n')

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

        <Bullets points={result.quickRead} />
        {result.formula && <FormulaBlock title={result.formula.title} body={result.formula.body} />}
        {result.peerNote && (
          <p className="text-[11.5px] leading-relaxed text-ink-primary">
            <span className="font-semibold text-navy-deep">Peers: </span>
            {result.peerNote}
          </p>
        )}

        <div className="border-t border-soft-border pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-navy-deep">Conclusion</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-primary">{result.conclusion}</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-soft-border pt-2">
          <p className="text-[9.5px] italic leading-snug text-ink-secondary">AI-generated from your selection. Not investment advice.</p>
          <CopyBtn text={copyText} />
        </div>
      </div>
    </div>
  )
}

export function AiAnalysisDrawer({ cells, autoGenerate, onClose }: { cells: AuditCell[]; autoGenerate?: boolean; onClose: () => void }) {
  const items = useMemo(() => selectionFromAuditCells(cells), [cells])
  const readout = useMemo(() => computeReadout(items), [items])
  const label = useMemo(() => scopeLabel(readout), [readout])
  const points = useMemo(() => localQuickRead(readout, items), [readout, items])

  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<AnalystResult | null>(null)
  const canGenerate = readout.coverage.ready > 0

  const generate = async (force = false) => {
    setState('loading')
    const resp = await generateAnalysis(buildAnalystRequest(items), force)
    if (resp.ok) {
      setResult(resp.result)
      setState('done')
    } else {
      // Never surface setup/server detail on the dashboard — fall back quietly to
      // the analysis points already shown.
      setState('error')
    }
  }

  useEffect(() => {
    if (autoGenerate && canGenerate) void generate(false)
  }, [readout.signature])

  const copyText = [
    `Analysis — ${label}`,
    '',
    ...points.map((b) => `• ${b}`),
    readout.formula ? `\n${readout.formula.title}: ${readout.formula.body}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full max-w-sm">
      <aside className="animate-drawer-in pointer-events-auto relative ml-auto flex h-full w-full flex-col border-l border-soft-border bg-card shadow-lift">
        <div className="flex items-start justify-between gap-3 border-b border-soft-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Analysis</p>
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
            <div className="rounded-xl border border-soft-border bg-card p-3 shadow-soft">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-navy-deep">Quick read</p>
                {points.length > 0 && <CopyBtn text={copyText} />}
              </div>

              {points.length > 0 ? (
                <Bullets points={points} />
              ) : (
                <p className="text-[11.5px] italic text-ink-secondary">Select at least one ready, source-backed cell to see an analysis.</p>
              )}

              {readout.formula && (
                <div className="mt-2.5">
                  <FormulaBlock title={readout.formula.title} body={readout.formula.body} />
                </div>
              )}

              {/* AI add-on — quiet. Failure shows a calm one-liner, never plumbing. */}
              {canGenerate && (
                <div className="mt-2.5 border-t border-soft-border pt-2.5">
                  {state === 'loading' ? (
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-blue">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing a sharper AI summary…
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => generate(true)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#1E4079] to-[#143058] px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> {state === 'error' ? 'Try AI summary again' : 'Sharpen with AI'}
                      </button>
                      {state === 'error' && <span className="text-[10px] text-ink-secondary">AI summary isn’t available right now.</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {readout.coverage.gaps > 0 && (
            <div className="rounded-xl border border-[#F0D2CC] bg-coral-soft/50 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-coral">
                <AlertTriangle className="h-3.5 w-3.5" /> {readout.coverage.gaps} not available
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
      </aside>
    </div>
  )
}
