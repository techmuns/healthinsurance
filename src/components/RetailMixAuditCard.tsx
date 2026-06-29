import { useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, MinusCircle, ChevronDown, ExternalLink, FunctionSquare } from 'lucide-react'
import { buildRetailMixAudit, retailMixAuditSummary, RETAIL_MIX_FORMULA, RETAIL_MIX_CONSUMERS, type RetailMixAuditRow } from '@/lib/retailMixAudit'

// ---------------------------------------------------------------------------
//  Retail Mix — derived-metric audit card for the Data Audit surface.
//
//  Retail Mix is not a single Excel cell; it is DERIVED from the GI Council
//  health portfolio (retail health ÷ total health premium). This card makes the
//  derivation visible and validated: per company it shows the source ₹Cr values,
//  the one formula, the calculated %, the value the Product Mix chart and peer
//  grid each read, and a verified / mismatch / missing status. If the chart and
//  grid ever diverge by > 1pp, or a split doesn't sum to 100%, the row flags it
//  — the dashboard never silently shows two different Retail Mix numbers.
// ---------------------------------------------------------------------------

const fmtCr = (v: number | null) => (v == null ? '—' : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`)
const fmtPct = (v: number | null) => (v == null ? 'n/a' : `${v}%`)

const STATUS_STYLE: Record<RetailMixAuditRow['status'], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  verified: { label: 'Verified', cls: 'bg-teal-soft text-teal ring-[#BFE3E1]', Icon: CheckCircle2 },
  mismatch: { label: 'Mismatch', cls: 'bg-[#FBEDEA] text-[#C0584F] ring-[#F0D2CC]', Icon: AlertTriangle },
  missing: { label: 'No source', cls: 'bg-soft-blue text-navy-primary ring-[#D6E2FA]', Icon: MinusCircle },
}

function StatusPill({ status }: { status: RetailMixAuditRow['status'] }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${s.cls}`}>
      <s.Icon className="h-3 w-3" strokeWidth={2.4} /> {s.label}
    </span>
  )
}

function Row({ r }: { r: RetailMixAuditRow }) {
  const [open, setOpen] = useState(false)
  const matchCls = r.chartGridMatch ? 'text-teal' : r.status === 'missing' ? 'text-ink-secondary' : 'text-[#C0584F]'
  return (
    <>
      <tr
        className="cursor-pointer border-t border-[#EEF1F7] hover:bg-[#FAFBFD]"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="py-2 pl-3 pr-2">
          <div className="flex items-center gap-1.5">
            <ChevronDown className={`h-3.5 w-3.5 text-ink-secondary/60 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
            <span className="font-semibold text-navy-deep">{r.company}</span>
            <span className="rounded bg-soft-blue px-1.5 py-px text-[9px] font-semibold text-navy-primary">{r.peerGroup}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-center tabular-nums text-ink-secondary">{r.fy ?? '—'}</td>
        <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">{fmtCr(r.retailPrem)}</td>
        <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">{fmtCr(r.totalPrem)}</td>
        <td className="px-2 py-2 text-right font-semibold tabular-nums text-navy-deep">{fmtPct(r.retailPct)}</td>
        <td className={`px-2 py-2 text-right tabular-nums ${matchCls}`}>{fmtPct(r.chartPct)}</td>
        <td className={`px-2 py-2 text-right tabular-nums ${matchCls}`}>{fmtPct(r.gridPct)}</td>
        <td className="px-2 py-2 text-center"><StatusPill status={r.status} /></td>
      </tr>
      {open && (
        <tr className="border-t border-[#F2F4F9] bg-[#FAFBFD]">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">Workings</p>
                <div className="rounded-lg border border-[#E6EAF2] bg-white p-2.5 font-mono text-[11.5px] leading-relaxed text-navy-deep">
                  {r.retailPrem != null && r.totalPrem != null ? (
                    <>
                      <div>Retail Health = {fmtCr(r.retailPrem)} Cr</div>
                      <div>Total Health = {fmtCr(r.totalPrem)} Cr <span className="text-ink-secondary">(retail + group + govt + overseas-medical)</span></div>
                      <div className="mt-1 border-t border-[#EEF1F7] pt-1">
                        Retail Mix = {fmtCr(r.retailPrem)} ÷ {fmtCr(r.totalPrem)} = <span className="font-semibold text-teal">{fmtPct(r.retailPct)}</span>
                      </div>
                      <div>Group share = {fmtPct(r.groupPct)} <span className="text-ink-secondary">(retail % + group % = {(r.retailPct ?? 0) + (r.groupPct ?? 0)}%)</span></div>
                    </>
                  ) : (
                    <div className="text-ink-secondary">No GI-Council health split on record — shown as an honest n/a everywhere (never a fabricated 0).</div>
                  )}
                </div>
                {r.issues.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-[#C0584F]">
                    {r.issues.map((iss, k) => (
                      <li key={k} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {iss}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">Mapped to · Source</p>
                <div className="rounded-lg border border-[#E6EAF2] bg-white p-2.5 text-[11.5px] text-ink-secondary">
                  <div className="mb-1.5">
                    <span className="font-semibold text-navy-deep">Chart {fmtPct(r.chartPct)}</span> · <span className="font-semibold text-navy-deep">Grid {fmtPct(r.gridPct)}</span>{' '}
                    {r.chartGridMatch ? <span className="text-teal">— agree</span> : r.status !== 'missing' && <span className="text-[#C0584F]">— differ</span>}
                  </div>
                  <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-navy-primary underline decoration-dotted underline-offset-2 hover:text-navy-deep">
                    {r.source.name} <ExternalLink className="h-3 w-3" />
                  </a>
                  <div className="mt-0.5 text-[10.5px] text-ink-secondary/80">Period {r.source.period ?? '—'} · confidence {r.source.confidence}</div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function RetailMixAuditCard() {
  const rows = useMemo(() => buildRetailMixAudit(), [])
  const summary = useMemo(() => retailMixAuditSummary(), [])

  return (
    <section className="card-surface p-5 sm:p-6">
      <header className="mb-3 border-b border-[#EEF1F7] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-soft text-teal ring-1 ring-[#BFE3E1]">
              <FunctionSquare className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">Derived-metric audit</p>
              <h2 className="font-display text-[18px] leading-tight text-navy-deep">Retail Mix — one formula, one source, every surface</h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-teal ring-1 ring-[#BFE3E1]"><CheckCircle2 className="h-3 w-3" /> {summary.verified} verified</span>
            {summary.mismatch > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#FBEDEA] px-2 py-0.5 text-[#C0584F] ring-1 ring-[#F0D2CC]"><AlertTriangle className="h-3 w-3" /> {summary.mismatch} mismatch</span>}
            {summary.missing > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-soft-blue px-2 py-0.5 text-navy-primary ring-1 ring-[#D6E2FA]"><MinusCircle className="h-3 w-3" /> {summary.missing} no source</span>}
          </div>
        </div>
        <p className="mt-2 rounded-lg border border-[#E6EAF2] bg-[#FBFCFE] px-3 py-1.5 font-mono text-[11px] text-navy-deep">{RETAIL_MIX_FORMULA}</p>
        <p className="mt-1.5 text-[11px] text-ink-secondary">
          Read identically by: {RETAIL_MIX_CONSUMERS.join(' · ')}. The chart and the grid read the same derived value, so a divergence &gt; 1pp flags here as a mismatch.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ink-secondary/80">
              <th className="py-1.5 pl-3 pr-2 text-left font-semibold">Company</th>
              <th className="px-2 py-1.5 text-center font-semibold">FY</th>
              <th className="px-2 py-1.5 text-right font-semibold">Retail ₹Cr</th>
              <th className="px-2 py-1.5 text-right font-semibold">Total health ₹Cr</th>
              <th className="px-2 py-1.5 text-right font-semibold">Retail % (calc)</th>
              <th className="px-2 py-1.5 text-right font-semibold">Chart %</th>
              <th className="px-2 py-1.5 text-right font-semibold">Grid %</th>
              <th className="px-2 py-1.5 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.companyId} r={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10.5px] text-ink-secondary/75">
        Click a row for the full workings, validation checks and source link. Values are derived live — nothing here is hand-typed.
      </p>
    </section>
  )
}
