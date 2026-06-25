import { useMemo, useState } from 'react'
import { Calculator, ChevronDown, Info } from 'lucide-react'
import { FOCAL_VALUATION_ID, peerValuation } from '@/data/valuationData'
import { buildNavValuation, periodLabel, type NavValuation } from '@/lib/navValuation'
import { Eyebrow, OpenSource, fmtCr, xMult } from './valuationShared'

// ---------------------------------------------------------------------------
//  Peer valuation matrix — ONE clean comparable table with TWO views toggled in
//  place (no new tab, no second table):
//   • Market view — operating scale (GWP, growth) for every SAHI peer + the
//     price-derived multiples (P/GWP, P/E, market value) where a live price
//     exists. Unchanged from before.
//   • Book-value view — each peer valued on its filed net worth (book value) at
//     a comparable listed-peer P/BV: NAV/BV, applied P/BV, implied equity value,
//     implied / share, premium-or-discount vs that implied value, and a per-row
//     "Show calculation" that expands the full, source-backed working inline.
//
//  Every number is real and source-backed via `buildNavValuation` (audit overlay
//  net worth + listed-peer market P/BV). Missing inputs are shown honestly — a
//  market-only metric that needs a live price reads as "—", a book-value metric
//  that needs an un-filed input (shares, market price) says exactly what's
//  missing in the calculation. Nothing is fabricated or coerced to zero.
// ---------------------------------------------------------------------------

const GROWTH_GREEN = '#2E8B63'
const CORAL = '#A8443B'
const GOLD = '#B68B3A'
const TEAL = '#168E8E'

type View = 'market' | 'book'

function fmtGrowth(v: number | null) {
  if (v == null) return null
  const s = v >= 0 ? '+' : '−'
  const a = Math.abs(v)
  return `${s}${Number.isInteger(a) ? a.toFixed(0) : a.toFixed(1)}%`
}

// Full-precision formatters for the expanded calculation (the compact columns
// reuse the table's `fmtCr` / `xMult` so the grid stays Bloomberg-tight).
const crFull = (v: number | null) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')} Cr`)
const inr = (v: number | null) => (v == null ? '—' : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const mult2 = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}×`)
const signPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const crShares = (v: number | null) => (v == null ? '—' : `${(v / 1e7).toFixed(2)} Cr`)

// Short, honest per-row comment derived only from facts already in the row
// (listing status, scale rank, premium/discount vs the listed benchmark).
function noteFor(companyId: string, premiumVsStar: number | null): string {
  if (companyId === FOCAL_VALUATION_ID) {
    if (premiumVsStar == null) return 'Focal name · listed SAHI'
    if (premiumVsStar > 5) return 'Trades at a premium to Star Health'
    if (premiumVsStar < -5) return 'Trades at a discount to Star Health'
    return 'In line with Star Health'
  }
  if (companyId === 'star-health') return 'Largest listed SAHI peer'
  return 'Unlisted — no public market price'
}

function Dash() {
  return <span className="text-ink-secondary/45">—</span>
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { id: View; label: string }[] = [
    { id: 'market', label: 'Market' },
    { id: 'book', label: 'Book value' },
  ]
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-white/70 p-0.5 text-[10.5px] font-semibold shadow-soft">
      {opts.map((o) => {
        const active = o.id === view
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 transition-colors ${active ? 'bg-navy-deep text-white shadow-soft' : 'text-ink-secondary hover:text-navy-deep'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function PeerValuationMatrix() {
  const rows = peerValuation
  const [view, setView] = useState<View>('market')
  const [openId, setOpenId] = useState<string | null>(null)

  // One book-value calculation per peer, reused for the columns and the inline
  // working. Pure + cheap; computed once for the (static) peer set.
  const navById = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.companyId, buildNavValuation(r.companyId)])) as Record<string, NavValuation>,
    [rows],
  )

  const niva = rows.find((r) => r.companyId === FOCAL_VALUATION_ID)
  const star = rows.find((r) => r.companyId === 'star-health')
  const premiumVsStar =
    niva?.pGwp != null && star?.pGwp ? ((niva.pGwp - star.pGwp) / star.pGwp) * 100 : null

  const isBook = view === 'book'
  const BOOK_COLS = 8 // colSpan for the expanded calculation row

  return (
    <section>
      <Eyebrow
        label="Peer Comparison"
        title="Peer valuation matrix"
        note={
          isBook
            ? 'Each peer valued on its filed net worth at a comparable listed-peer P/BV — implied equity value, per-share and premium/discount, with the full working one click away.'
            : 'Operating scale for every SAHI peer; market-based multiples where a live price exists.'
        }
        right={<ViewToggle view={view} onChange={setView} />}
      />
      <div className="card-surface card-tint-slate overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-soft-border bg-[#EEF2F9] text-[9.5px] uppercase tracking-[0.04em] text-ink-secondary">
                <th className="py-2.5 pl-4 pr-3 font-semibold">Company</th>
                <th className="py-2.5 pr-3 font-semibold">Listing</th>
                {isBook ? (
                  <>
                    <th className="py-2.5 pr-3 text-right font-semibold">NAV / BV</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">P / BV</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">Implied Eq. Value</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">Implied / Sh</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">Vs Implied</th>
                    <th className="py-2.5 pr-4 text-right font-semibold">Calc</th>
                  </>
                ) : (
                  <>
                    <th className="py-2.5 pr-3 text-right font-semibold">GWP · latest FY</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">GWP growth</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">P / GWP</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">P / E</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">Market value</th>
                    <th className="py-2.5 pr-4 font-semibold">Notes</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const focal = r.companyId === FOCAL_VALUATION_ID
                const unlisted = r.listingStatus === 'Unlisted'
                const growth = fmtGrowth(r.growth)
                const v = navById[r.companyId]
                const open = openId === r.companyId

                const companyCell = (
                  <td className="py-2.5 pl-4 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      {focal && <span className="h-3.5 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />}
                      <span className="font-semibold text-navy-deep">{r.companyName}</span>
                      {focal && <span className="rounded-full bg-champagne-soft px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-champagne-deep">Focal</span>}
                    </span>
                  </td>
                )
                const listingCell = (
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${unlisted ? 'border border-dashed border-[#CAD0DA] text-ink-secondary' : 'bg-emerald-soft text-emerald'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${unlisted ? 'bg-[#B7BECB]' : 'bg-emerald'}`} />
                      {r.listingStatus}
                    </span>
                  </td>
                )

                return (
                  <RowFragment key={r.companyId}>
                    <tr className={`border-b align-middle transition-colors ${open ? 'border-transparent' : 'border-[#EEF1F6]'} ${focal ? 'bg-soft-blue/45' : 'hover:bg-soft-blue/20'}`}>
                      {companyCell}
                      {listingCell}

                      {isBook ? (
                        <>
                          {/* NAV / Book value + its period tag */}
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {v.netWorth ? (
                              <span className="inline-flex items-baseline gap-1">
                                <span className="font-semibold text-navy-deep">{fmtCr(v.netWorth.value)}</span>
                                <span className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary/70">{periodLabel(v.netWorth.period)}</span>
                              </span>
                            ) : (
                              <span title="Missing book value"><Dash /></span>
                            )}
                          </td>
                          {/* Applied P/BV + benchmark hint */}
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {v.benchmark ? (
                              <span className="inline-flex items-baseline gap-1">
                                <span className="font-semibold" style={{ color: GOLD }}>{xMult(v.benchmark.multiple)}</span>
                                <span className="text-[8.5px] text-ink-secondary/70">{v.benchmark.peers.length === 1 ? `vs ${v.benchmark.label}` : `${v.benchmark.peers.length}-peer`}</span>
                              </span>
                            ) : (
                              <span title="Benchmark P/BV unavailable"><Dash /></span>
                            )}
                          </td>
                          {/* Implied equity value */}
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {v.impliedEquityValue != null ? <span className="font-semibold text-navy-deep">{fmtCr(v.impliedEquityValue)}</span> : <span title="Needs net worth & benchmark"><Dash /></span>}
                          </td>
                          {/* Implied value / share */}
                          <td className="py-2.5 pr-3 text-right tabular-nums text-navy-deep">
                            {v.impliedPerShare != null ? inr(v.impliedPerShare) : <span title="Missing shares outstanding"><Dash /></span>}
                          </td>
                          {/* Premium / discount vs implied */}
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {v.premiumDiscountPct != null ? (
                              <span className="font-semibold" style={{ color: v.premiumDiscountPct >= 0 ? GOLD : TEAL }}>{signPct(v.premiumDiscountPct)}</span>
                            ) : unlisted ? (
                              <span className="text-[9.5px] text-ink-secondary/70">— no public price</span>
                            ) : (
                              <span title="Market price pending"><Dash /></span>
                            )}
                          </td>
                          {/* Show calculation */}
                          <td className="py-2.5 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => setOpenId(open ? null : r.companyId)}
                              aria-expanded={open}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${open ? 'border-[#D8C48F] bg-[#FBF7EE] text-[#9C7430]' : 'border-soft-border bg-white/70 text-navy-primary hover:border-muted-blue hover:bg-white hover:text-navy-deep'}`}
                            >
                              <Calculator className="h-3 w-3" />
                              <span className="hidden sm:inline">{open ? 'Hide' : 'Show'}</span>
                              <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* GWP + FY */}
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {r.gwp != null ? (
                              <span className="inline-flex items-baseline gap-1">
                                <span className="font-semibold text-navy-deep">{fmtCr(r.gwp)}</span>
                                {r.gwpFy && <span className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary/70">{r.gwpFy}</span>}
                              </span>
                            ) : (
                              <Dash />
                            )}
                          </td>
                          {/* GWP growth */}
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {growth != null ? (
                              <span className="font-semibold" style={{ color: r.growth != null && r.growth >= 0 ? GROWTH_GREEN : CORAL }}>{growth}</span>
                            ) : (
                              <Dash />
                            )}
                          </td>
                          {/* P/GWP */}
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {r.pGwp != null ? <span className="font-semibold text-navy-deep">{xMult(r.pGwp)}</span> : <Dash />}
                          </td>
                          {/* P/E */}
                          <td className="py-2.5 pr-3 text-right tabular-nums text-navy-deep">
                            {r.pe != null ? xMult(r.pe, 1) : <Dash />}
                          </td>
                          {/* Market value */}
                          <td className="py-2.5 pr-3 text-right tabular-nums text-navy-deep">
                            {r.marketCap != null ? fmtCr(r.marketCap) : <Dash />}
                          </td>
                          {/* Notes + quiet source */}
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10.5px] leading-snug text-ink-secondary">{noteFor(r.companyId, premiumVsStar)}</span>
                              <OpenSource id={r.sourceId} url={r.sourceUrl ?? undefined} title={r.sourceName ?? undefined} />
                            </div>
                          </td>
                        </>
                      )}
                    </tr>

                    {/* Inline calculation working — book-value view only */}
                    {isBook && open && (
                      <tr className="border-b border-[#EEF1F6]">
                        <td colSpan={BOOK_COLS} className="p-0">
                          <CalcDetail v={v} companyName={r.companyName} listing={r.listingStatus} />
                        </td>
                      </tr>
                    )}
                  </RowFragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* One neat footer note — explains the missing-data convention once. */}
        <div className="flex items-start gap-1.5 border-t border-soft-border bg-[#FAFBFD] px-4 py-2.5 text-[10.5px] leading-snug text-ink-secondary">
          <Info className="mt-px h-3 w-3 shrink-0 text-ink-secondary/70" />
          {isBook ? (
            <span>
              Book value × a comparable <b className="text-navy-deep/80">listed-peer P/BV</b> = implied equity value, for every peer with a filed net worth. <b className="text-navy-deep/80">Implied / share</b> needs filed shares outstanding (on record for Niva Bupa today); <b className="text-navy-deep/80">Vs Implied</b> needs a live market price, so the unlisted peers (Care Health, Aditya Birla Health, ManipalCigna) read “— no public price.” Net-worth period &amp; basis and the full working are in each row&rsquo;s <b className="text-navy-deep/80">Show calculation</b> — sourced from Data Audit, never estimated.
            </span>
          ) : (
            <span>
              <b className="text-navy-deep/80">“—”</b> marks a market-based metric (P/GWP, P/E, market value) that can&rsquo;t exist without a live share price — the unlisted peers (Care Health, Aditya Birla Health, ManipalCigna) have no public listing. Their GWP and growth are real filed figures.
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

// Fragment wrapper that carries a key for the row + its (optional) detail row.
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

// ── Inline "Show calculation" working — audit-friendly, company-specific ──────
function CalcDetail({ v, companyName, listing }: { v: NavValuation; companyName: string; listing: string }) {
  const hasNw = v.netWorth != null
  const hasBench = v.benchmark != null
  const hasShares = v.shares != null
  const hasMarket = v.marketCap != null

  // Honest "what's missing, and what it blocks" — only the gaps that apply.
  const missing: string[] = []
  if (!hasNw) missing.push('Missing book value / net worth')
  if (!hasBench) missing.push('Benchmark P/BV unavailable')
  if (!hasShares) missing.push('Missing shares outstanding — implied per-share hidden')
  if (!hasMarket) missing.push(listing === 'Unlisted' ? 'No public market price — premium / discount not shown' : 'Market price pending — premium / discount not shown')

  return (
    <div className="border-l-2 border-[#E4D7B6] bg-[#FBFAF4] px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: '#9C7430' }}>Book-value calculation</span>
        <span className="font-display text-[13px] text-navy-deep">{companyName}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${listing === 'Unlisted' ? 'border border-dashed border-[#CAD0DA] text-ink-secondary' : 'bg-emerald-soft text-emerald'}`}>{listing}</span>
      </div>

      {/* Inputs */}
      <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <InputLine label="Book value / NAV" value={hasNw ? crFull(v.netWorth!.value) : null}
          sub={hasNw ? `${periodLabel(v.netWorth!.period)} · ${v.netWorth!.basis} · company filing (Data Audit)` : 'source pending'} />
        <InputLine label="Applied P/BV" value={hasBench ? mult2(v.benchmark!.multiple) : null}
          sub={hasBench ? `benchmark · ${v.benchmark!.peers.map((p) => `${p.name} ${mult2(p.pbv)}`).join(' · ')}` : 'no listed-peer P/BV on record'} />
        <InputLine label="Shares outstanding" value={hasShares ? `${crShares(v.shares!.value)} sh` : null}
          sub={hasShares ? v.shares!.source : 'not filed — per-share hidden'} />
        <InputLine label="Current market value" value={hasMarket ? crFull(v.marketCap) : null}
          sub={hasMarket ? `market data${v.marketAsOf ? ` · ${v.marketAsOf}` : ''}` : listing === 'Unlisted' ? 'unlisted — no public price' : 'pending'} />
      </div>

      {/* Formulae — generic rule + the substituted numbers for this company */}
      <div className="mt-3 space-y-1.5 rounded-lg border border-[#E7DCBE] bg-white/70 px-3 py-2.5">
        <Formula
          rule="Book value × Applied P/BV = Implied equity value"
          calc={hasNw && hasBench ? `${crFull(v.netWorth!.value)} × ${mult2(v.benchmark!.multiple)} = ${crFull(v.impliedEquityValue)}` : null}
          note={!hasNw ? 'needs book value' : !hasBench ? 'needs a benchmark P/BV' : undefined}
        />
        <Formula
          rule="Implied equity value ÷ shares outstanding = Implied value / share"
          calc={v.impliedPerShare != null ? `${crFull(v.impliedEquityValue)} ÷ ${crShares(v.shares!.value)} sh = ${inr(v.impliedPerShare)}` : null}
          note={v.impliedEquityValue == null ? 'needs implied equity value' : 'needs shares outstanding'}
        />
        <Formula
          rule="Current market value ÷ implied equity value − 1 = Premium / discount"
          calc={v.premiumDiscountPct != null ? `${crFull(v.marketCap)} ÷ ${crFull(v.impliedEquityValue)} − 1 = ${signPct(v.premiumDiscountPct)}` : null}
          note={listing === 'Unlisted' ? 'no public market price' : v.impliedEquityValue == null ? 'needs implied equity value' : 'needs a current market price'}
        />
      </div>

      {/* Source status + any missing-input warnings */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] text-ink-secondary">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: hasNw && hasBench ? TEAL : GOLD }} />
          {hasNw && hasBench ? 'Source-backed · net worth (Data Audit) × listed-peer P/BV' : 'Partial basis — see missing inputs'}
        </span>
        {missing.map((m) => (
          <span key={m} className="inline-flex items-center rounded-full border border-[#E7D6AE] bg-[#FBF3DE] px-2 py-0.5 text-[9.5px] font-medium text-[#8A6A1E]">{m}</span>
        ))}
      </div>

      <p className="mt-2.5 text-[10px] leading-snug text-ink-secondary">
        Values <span className="font-medium text-ink-primary">{companyName}</span> on its net worth (book value) at a comparable listed-peer P/BV — a book-value cross-check, not a price target. Every figure is source-backed; any missing input is left blank, never estimated.
      </p>
    </div>
  )
}

function InputLine({ label, value, sub }: { label: string; value: string | null; sub: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F0ECDD] pb-1.5">
      <span className="text-[10px] text-ink-secondary">{label}</span>
      <span className="text-right">
        <span className={`text-[11.5px] font-semibold tabular-nums ${value == null ? 'italic text-ink-secondary/60' : 'text-navy-deep'}`}>{value ?? 'unavailable'}</span>
        <span className="block text-[9px] leading-tight text-ink-secondary/80">{sub}</span>
      </span>
    </div>
  )
}

function Formula({ rule, calc, note }: { rule: string; calc: string | null; note?: string }) {
  return (
    <div className="leading-snug">
      <p className="font-mono text-[10.5px] text-ink-primary">{rule}</p>
      {calc != null ? (
        <p className="font-mono text-[11px] font-semibold" style={{ color: '#9C7430' }}>{calc}</p>
      ) : (
        <p className="font-mono text-[10px] italic text-ink-secondary/70">→ {note}</p>
      )}
    </div>
  )
}
