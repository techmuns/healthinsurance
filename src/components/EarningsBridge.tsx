import { useState } from 'react'
import { GitMerge, Layers } from 'lucide-react'
import { Drawer } from './Drawer'
import {
  getEarningsBridge, BRIDGE_SOURCE, BRIDGE_SOURCE_URL,
  type BridgeFigures,
} from '@/data/earningsBridge'

const NAVY = '#172B4D'
const CORAL = '#B94A48'
const EMERALD = '#2F855A'
const TEAL = '#168E8E'

const cr = (v: number) => `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`
const signed = (v: number) => `${v < 0 ? '−' : '+'}${cr(v)}`

type RowKind = 'start' | 'less' | 'total' | 'uw' | 'add' | 'pat'
type RowTag = 'leak' | 'support'
// Plain retail label + the precise term as a quiet secondary (`tech`); `tag`
// marks the rows that visibly leak premium away vs the one that supports profit.
interface Row { label: string; tech?: string; v: number; kind: RowKind; tag?: RowTag }

function bridgeRows(b: BridgeFigures): Row[] {
  return [
    { label: 'Premium collected', tech: 'GWP', v: b.gwp, kind: 'start' },
    { label: 'Reinsurance', tech: 'ceded', v: -b.reinsCeded, kind: 'less' },
    { label: 'Premium retained', tech: 'net written premium', v: b.nwp, kind: 'total' },
    { label: 'Timing adjustment', tech: 'UPR movement', v: b.uprMovement, kind: 'less' },
    { label: 'Premium earned', tech: 'net earned premium', v: b.nep, kind: 'total' },
    { label: 'Claims', tech: 'net claims', v: -b.netClaims, kind: 'less', tag: 'leak' },
    { label: 'Distribution cost', tech: 'commission', v: -b.netCommission, kind: 'less', tag: 'leak' },
    { label: 'Operating cost', tech: 'opex', v: -b.opex, kind: 'less', tag: 'leak' },
    { label: 'Core underwriting result', v: b.underwritingResult, kind: 'uw' },
    { label: 'Investment support', tech: 'investment income', v: b.investmentIncome, kind: 'add', tag: 'support' },
    { label: 'Other (net)', v: b.otherNet, kind: 'less' },
    { label: 'Final PAT', tech: 'profit after tax', v: b.pat, kind: 'pat' },
  ]
}

function Waterfall({ b }: { b: BridgeFigures }) {
  const rows = bridgeRows(b)
  return (
    <div>
      {rows.map((r) => {
        const isTotal = r.kind === 'total' || r.kind === 'uw' || r.kind === 'pat'
        const color =
          r.kind === 'uw' ? (r.v < 0 ? CORAL : EMERALD)
            : r.kind === 'pat' ? (r.v < 0 ? CORAL : NAVY)
              : r.kind === 'add' ? EMERALD
                : r.kind === 'less' ? (r.v < 0 ? CORAL : EMERALD)
                  : NAVY
        const prefix = isTotal && r.kind !== 'uw' && r.kind !== 'pat' ? '=' : r.kind === 'pat' || r.kind === 'uw' ? '=' : r.v < 0 ? '−' : '+'
        const display = r.kind === 'start' ? cr(r.v) : `${prefix} ${cr(r.v)}`
        return (
          <div
            key={r.label}
            className={`flex items-center justify-between py-[5px] text-[12px] ${isTotal ? 'border-t border-soft-border/70 mt-0.5 pt-[7px]' : ''}`}
            style={r.kind === 'uw' ? { background: `${CORAL}0c` } : r.kind === 'pat' ? { background: `${NAVY}0a` } : undefined}
          >
            <span className={`flex items-center gap-1.5 ${isTotal ? 'font-semibold text-navy-deep' : 'pl-3 text-ink-secondary'}`}>
              <span>
                {r.label}
                {r.tech && <span className="ml-1 text-[9px] font-normal text-ink-secondary/55">({r.tech})</span>}
              </span>
              {r.tag === 'leak' && (
                <span className="rounded px-1 py-px text-[7.5px] font-bold uppercase tracking-wide" style={{ background: `${CORAL}14`, color: CORAL }}>leak</span>
              )}
              {r.tag === 'support' && (
                <span className="rounded px-1 py-px text-[7.5px] font-bold uppercase tracking-wide" style={{ background: `${EMERALD}16`, color: EMERALD }}>support</span>
              )}
            </span>
            <span className={`tabular-nums ${isTotal ? 'font-display text-[14px]' : ''}`} style={{ color }}>{display}{' Cr'}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Premium → PAT earnings bridge — reconciles underwriting result with PAT to
 * show whether profit is core-underwriting-led or investment-income-led.
 * IGAAP is the full audited waterfall; IFRS shows its disclosed PAT + the
 * IGAAP→IFRS delta (the granular IFRS split is not separately disclosed).
 * Omitted entirely (returns null) for companies without an audited bridge.
 */
export function EarningsBridge({ companyId, companyShort }: { companyId: string; companyShort: string }) {
  const years = getEarningsBridge(companyId)
  const [fy, setFy] = useState(years[0]?.fy ?? '')
  const [methodOpen, setMethodOpen] = useState(false)
  if (years.length === 0) return null
  const yr = years.find((y) => y.fy === fy) ?? years[0]
  const b = yr.igaap

  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full" style={{ background: '#EEF4FF' }}>
            <GitMerge className="h-3.5 w-3.5 text-navy-primary" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">Premium-to-Profit Engine</p>
            <h3 className="mt-0.5 font-display text-[15px] leading-tight text-navy-deep">From premium collected to final profit</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
            {years.map((y) => {
              const on = y.fy === yr.fy
              return (
                <button key={y.fy} type="button" onClick={() => setFy(y.fy)} className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors" style={on ? { background: NAVY, color: '#fff' } : { color: '#6B7488' }}>
                  {y.fy}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => setMethodOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary">
            <Layers className="h-3.5 w-3.5" /> Details
          </button>
        </div>
      </div>

      {/* IGAAP waterfall | IFRS column */}
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="rounded-xl border border-soft-border p-3.5">
          <p className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>IGAAP / Statutory · {yr.fy}</p>
          <Waterfall b={b} />
        </div>
        <div className="flex flex-col rounded-xl border p-3.5" style={{ borderColor: `${TEAL}40`, background: `${TEAL}08` }}>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: TEAL }}>IFRS · {yr.fy}</p>
          {yr.ifrsPat != null ? (
            <>
              <p className="mt-1.5 font-display text-[26px] leading-none text-navy-deep">₹{yr.ifrsPat.toLocaleString('en-IN')} Cr</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-secondary">Profit after tax</p>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-ink-secondary">IFRS PAT not reported for {companyShort}.</p>
          )}
        </div>
      </div>

      <MethodologyDrawer open={methodOpen} onClose={() => setMethodOpen(false)} companyShort={companyShort} b={b} fy={yr.fy} ifrsPat={yr.ifrsPat} />
    </section>
  )
}

function Formula({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg border border-soft-border bg-ice/50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-champagne-deep">{label}</p>
      <p className="mt-0.5 font-mono text-[11px] leading-snug text-navy-deep">{body}</p>
    </div>
  )
}

type MethodTab = 'basis' | 'formula' | 'numbers' | 'sources'
const METHOD_TABS: { id: MethodTab; label: string }[] = [
  { id: 'basis', label: 'Basis' },
  { id: 'formula', label: 'Formula' },
  { id: 'numbers', label: 'Reported numbers' },
  { id: 'sources', label: 'Source links' },
]

function MethodologyDrawer({ open, onClose, companyShort, b, fy, ifrsPat }: { open: boolean; onClose: () => void; companyShort: string; b: BridgeFigures; fy: string; ifrsPat: number | null }) {
  const [tab, setTab] = useState<MethodTab>('basis')
  return (
    <Drawer open={open} onClose={onClose} title={`${companyShort} · Earnings bridge — accounting & method`} subtitle={`How every line of the ${fy} premium → profit reconciliation is derived.`}>
      {/* Scannable tabs — Basis · Formula · Reported numbers · Source links */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-soft-border">
        {METHOD_TABS.map((t) => {
          const on = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="relative -mb-px rounded-t-lg px-3 py-1.5 text-[11px] font-semibold transition-colors hover:text-navy-primary"
              style={on ? { color: NAVY, borderBottom: `2px solid ${NAVY}` } : { color: '#6B7488', borderBottom: '2px solid transparent' }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="text-[12px] leading-relaxed text-navy-deep/90">
        {tab === 'basis' && (
          <div className="space-y-3">
            <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: `${NAVY}22`, background: `${NAVY}06` }}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-champagne-deep">Why this matters</p>
              <p className="mt-1 text-[11.5px] leading-relaxed">PAT is positive mainly because investment income offsets the underwriting loss. The {fy} statutory view shows that loss; IFRS PAT may differ due to the accounting recognition basis.</p>
            </div>
            <p>IGAAP / Statutory, from the IRDAI Form B-RA (Revenue Account) and Form B-PL (Profit &amp; Loss) in the {fy} annual report. IFRS shows only the separately-disclosed PAT.</p>
            <p>IGAAP PAT and IFRS PAT differ because of recognition basis. IFRS does not separately disclose the underwriting and investment split in the same way.</p>
            <div className="rounded-lg border border-soft-border bg-ice/50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-champagne-deep">Why earlier views could differ</p>
              <p className="mt-1 text-[11.5px] leading-relaxed">The ₹100 engine uses the statutory cost split (combined ≈ 101%, an underwriting loss); a company-reported combined ratio can read below 100%. This bridge settles it on the audited statutory basis: underwriting is a loss and PAT is investment-income-led.</p>
            </div>
          </div>
        )}

        {tab === 'formula' && (
          <div className="space-y-1.5">
            <Formula label="Net written premium" body="NWP = GWP − reinsurance ceded" />
            <Formula label="Net earned premium" body="NEP = NWP + opening UPR − closing UPR" />
            <Formula label="Underwriting result" body="NEP − net claims − net commission − operating expenses" />
            <Formula label="Profit after tax" body="underwriting result + investment income + other (net) − tax" />
          </div>
        )}

        {tab === 'numbers' && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{fy} figures (₹ Cr) — reported vs derived</p>
            <table className="w-full border-collapse">
              <tbody>
                {[
                  ['Gross written premium', b.gwp, 'Reported'],
                  ['Reinsurance ceded', -b.reinsCeded, 'Reported'],
                  ['Net written premium', b.nwp, 'Reported'],
                  ['Net earned premium', b.nep, 'Reported'],
                  ['Net claims', -b.netClaims, 'Reported'],
                  ['Net commission', -b.netCommission, 'Reported'],
                  ['Operating expenses', -b.opex, 'Reported'],
                  ['Underwriting result', b.underwritingResult, 'Reported (MD&A)'],
                  ['Investment income', b.investmentIncome, 'Reported'],
                  ['Other (net)', b.otherNet, 'Derived (PAT − UW − investment)'],
                  ['Profit after tax — IGAAP', b.pat, 'Reported'],
                  ['Profit after tax — IFRS', ifrsPat ?? 0, ifrsPat != null ? 'Reported' : 'Not disclosed'],
                ].map(([label, val, prov]) => (
                  <tr key={label as string} className="border-b border-soft-border/50">
                    <td className="py-1 pr-2 text-[11px] text-ink-secondary">{label as string}</td>
                    <td className="py-1 pr-2 text-right text-[11px] tabular-nums text-navy-deep">{signed(val as number)}</td>
                    <td className="py-1 text-right text-[10px] text-ink-secondary/80">{prov as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-ink-secondary">IGAAP lines reconcile exactly to reported PAT; tax was nil in {fy} (carried-forward losses).</p>
          </div>
        )}

        {tab === 'sources' && (
          <div className="space-y-2.5">
            <a
              href={BRIDGE_SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg border border-soft-border bg-ice/40 px-3 py-2.5 transition-colors hover:border-muted-blue hover:bg-white"
            >
              <span>
                <span className="block text-[11.5px] font-semibold text-navy-deep">{companyShort} · {fy} Annual Report</span>
                <span className="block text-[10px] text-ink-secondary">{BRIDGE_SOURCE} — Form B-RA + Form B-PL</span>
              </span>
              <Layers className="h-3.5 w-3.5 shrink-0 text-muted-blue" />
            </a>
            <p className="text-[10px] leading-snug text-ink-secondary">All bridge figures are extracted from this filing. IFRS PAT, where shown, is the separately-disclosed figure in the same report.</p>
          </div>
        )}
      </div>
    </Drawer>
  )
}
