import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, Landmark, X } from 'lucide-react'
import { buildNavValuation, periodLabel, type NavValuation } from '@/lib/navValuation'

// ---------------------------------------------------------------------------
//  NAV / Book-value valuation card — the final implied number on the page, with
//  the full workings tucked behind a "Show calculation" popup. Soft gold/blue,
//  honest about anything that's missing (never a placeholder number).
// ---------------------------------------------------------------------------

const GOLD = '#B68B3A'
const NAVY = '#27457E'
const TEAL = '#168E8E'

const fmtCr = (v: number | null) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')} Cr`)
const inr = (v: number | null) => (v == null ? '—' : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const mult = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}×`)
const pct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const crShares = (v: number | null) => (v == null ? '—' : `${(v / 1e7).toFixed(2)} Cr shares`)

function Stat({ label, value, sub, accent = NAVY }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="surface-soft relative overflow-hidden rounded-xl p-2.5">
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: accent }} />
      <p className="pl-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">{label}</p>
      <p className="mt-0.5 pl-1.5 font-display text-[16px] leading-none tabular-nums text-navy-deep">{value}</p>
      {sub && <p className="mt-0.5 pl-1.5 text-[9px] text-ink-secondary">{sub}</p>}
    </div>
  )
}

export function NavValuationCard({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const v = useMemo(() => buildNavValuation(companyId), [companyId])
  const hasNetWorth = v.netWorth != null

  return (
    <div className="card-surface p-4 sm:p-5" style={{ background: 'linear-gradient(135deg,#FFFFFF 0%, #FBF7EE 100%)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <Landmark className="h-4 w-4" style={{ color: GOLD }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#9C7430' }}>NAV · Book-value valuation</span>
        </span>
        {hasNetWorth && (
          <button
            ref={btnRef}
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E4D7B6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#9C7430] shadow-soft transition-colors hover:border-[#D8C48F] hover:bg-[#FBF7EE]"
          >
            <Calculator className="h-3.5 w-3.5" /> Show calculation
          </button>
        )}
      </div>

      {!hasNetWorth ? (
        <div className="mt-3 rounded-xl border border-dashed border-soft-border bg-ice/40 px-4 py-6 text-center text-[12px] text-ink-secondary">
          Net worth / book value isn’t sourced for <span className="font-semibold text-navy-deep">{companyName}</span> yet — the NAV valuation populates once the balance-sheet figure is filed. <span className="font-medium">Source pending.</span>
        </div>
      ) : (
        <>
          <div className="mt-3">
            {v.impliedEquityValue != null ? (
              <>
                <p className="font-display text-[25px] leading-none tracking-tight text-navy-deep tabular-nums">{fmtCr(v.impliedEquityValue)}</p>
                <p className="mt-1 text-[11.5px] text-ink-secondary">
                  NAV-based implied valuation · using <b className="text-[#9C7430]">{mult(v.benchmark!.multiple)} P/BV</b> from {v.benchmark!.label} (listed peer benchmark)
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[25px] leading-none tracking-tight text-navy-deep tabular-nums">{fmtCr(v.netWorth!.value)}</p>
                <p className="mt-1 text-[11.5px] text-ink-secondary">
                  Latest net worth · <span className="font-semibold text-coral">benchmark multiple unavailable</span> — implied value pending a listed-peer P/BV.
                </p>
              </>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="NAV / Book value" value={fmtCr(v.netWorth!.value)} sub={`${periodLabel(v.netWorth!.period)} · ${v.netWorth!.basis}`} accent={NAVY} />
            <Stat label="Applied P/BV" value={mult(v.benchmark?.multiple ?? null)} sub={v.benchmark ? v.benchmark.label : 'benchmark pending'} accent={GOLD} />
            {v.impliedPerShare != null ? (
              <Stat label="Implied / share" value={inr(v.impliedPerShare)} sub="implied ÷ shares" accent={GOLD} />
            ) : (
              <Stat label="Implied / share" value="n/a" sub="needs share count" accent="#94A3B8" />
            )}
            {v.premiumDiscountPct != null ? (
              <Stat
                label="Mkt vs NAV-implied"
                value={pct(v.premiumDiscountPct)}
                sub={v.premiumDiscountPct >= 0 ? 'trades above NAV-implied' : 'trades below NAV-implied'}
                accent={v.premiumDiscountPct >= 0 ? GOLD : TEAL}
              />
            ) : (
              <Stat label="Mkt vs NAV-implied" value="n/a" sub={v.marketCap == null ? 'unlisted — no price' : 'pending'} accent="#94A3B8" />
            )}
          </div>
        </>
      )}

      {open && <CalcModal v={v} companyName={companyName} anchorRef={btnRef} onClose={() => setOpen(false)} />}
    </div>
  )
}

// ── "Show calculation" popup — audit-friendly workings ───────────────────────
function Na() {
  return <span className="italic text-ink-secondary/60">unavailable</span>
}

function CalcModal({ v, companyName, anchorRef, onClose }: { v: NavValuation; companyName: string; anchorRef: React.RefObject<HTMLButtonElement>; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(false)

  // Centred modal, portalled to <body> so it always opens in the current
  // viewport — no ancestor transform (the page / section fade-in wrappers) can
  // capture the fixed positioning and push it off-screen. While open: Esc closes,
  // background scroll is locked, focus moves into the dialog, and on close focus
  // returns to the "Show calculation" trigger. Calculation content is unchanged.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => {
      setShown(true)
      closeRef.current?.focus()
    })
    const trigger = anchorRef.current
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
      trigger?.focus()
    }
  }, [onClose, anchorRef])

  // Keep keyboard focus within the dialog (simple Tab trap).
  const onKeyDownTrap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const f = panelRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')
    if (!f || f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const rows: { m: string; value: React.ReactNode; src: React.ReactNode }[] = [
    {
      m: 'Net worth (book value)',
      value: v.netWorth ? <span className="font-semibold text-navy-deep">{fmtCr(v.netWorth.value)}</span> : <Na />,
      src: v.netWorth ? `Company filing · ${periodLabel(v.netWorth.period)} (${v.netWorth.basis})` : 'Source pending',
    },
    {
      m: 'Shares outstanding',
      value: v.shares ? crShares(v.shares.value) : <Na />,
      src: v.shares ? v.shares.source : 'not filed — per-share is hidden',
    },
    {
      m: 'NAV per share',
      value: v.navPerShare != null ? <span className="font-semibold text-navy-deep">{inr(v.navPerShare)}</span> : <Na />,
      src: v.navPerShare != null ? 'net worth ÷ shares outstanding' : 'needs shares outstanding',
    },
    {
      m: 'Listed-peer P/BV',
      value: v.benchmark ? <span className="font-semibold" style={{ color: '#9C7430' }}>{mult(v.benchmark.multiple)}</span> : <Na />,
      src: v.benchmark ? v.benchmark.peers.map((p) => `${p.name} ${mult(p.pbv)}`).join(' · ') : 'no listed-peer P/BV on record',
    },
    {
      m: 'Implied equity value',
      value: v.impliedEquityValue != null ? <span className="font-semibold text-navy-deep">{fmtCr(v.impliedEquityValue)}</span> : <Na />,
      src: v.impliedEquityValue != null ? 'net worth × P/BV multiple' : 'needs net worth & benchmark',
    },
    {
      m: 'Implied value / share',
      value: v.impliedPerShare != null ? inr(v.impliedPerShare) : <Na />,
      src: v.impliedPerShare != null ? 'implied equity value ÷ shares' : 'needs shares outstanding',
    },
    {
      m: 'Current market cap',
      value: v.marketCap != null ? fmtCr(v.marketCap) : <Na />,
      src: v.marketCap != null ? `Market data${v.marketAsOf ? ` · ${v.marketAsOf}` : ''}` : 'unlisted — no market price',
    },
    {
      m: 'Premium / discount vs current',
      value: v.premiumDiscountPct != null ? <span className="font-semibold" style={{ color: v.premiumDiscountPct >= 0 ? '#9C7430' : TEAL }}>{pct(v.premiumDiscountPct)}</span> : <Na />,
      src: v.premiumDiscountPct != null ? 'market cap ÷ NAV-implied − 1' : 'needs current market cap',
    },
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`NAV book-value calculation — ${companyName}`}
    >
      <div
        className={`absolute inset-0 bg-navy-deep/30 backdrop-blur-[2px] transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        onKeyDown={onKeyDownTrap}
        className={[
          'relative z-[1] flex max-h-[85vh] w-[min(34rem,100%)] flex-col overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-card transition-[opacity,transform] duration-200 ease-out',
          shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        ].join(' ')}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-3.5" style={{ background: 'linear-gradient(135deg,#172B4D,#27457E)' }}>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#E4C77A]">NAV · Book-value calculation</p>
            <p className="mt-0.5 font-display text-[15px] text-white">{companyName}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close calculation" className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Calculation table */}
          <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wide text-ink-secondary">
                <th className="border-b border-soft-border py-1.5 pr-2 text-left font-bold">Metric</th>
                <th className="border-b border-soft-border py-1.5 pr-2 text-right font-bold">Value</th>
                <th className="border-b border-soft-border py-1.5 text-left font-bold">Source / Period</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.m} className="align-top">
                  <td className="border-b border-[#F1F3F8] py-1.5 pr-2 text-[11.5px] font-medium text-navy-deep">{r.m}</td>
                  <td className="border-b border-[#F1F3F8] py-1.5 pr-2 text-right text-[11.5px] tabular-nums">{r.value}</td>
                  <td className="border-b border-[#F1F3F8] py-1.5 text-[10.5px] leading-snug text-ink-secondary">{r.src}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Formula block */}
          <div className="mt-3 rounded-lg border border-[#E4D7B6] bg-[#FBF7EE] px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#9C7430]">Formula</p>
            <p className="mt-1 font-mono text-[11px] text-ink-primary">NAV per share = Net Worth ÷ Shares Outstanding</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-primary">Implied Equity Value = Net Worth × P/BV Multiple</p>
          </div>

          {/* Plain-English explanation */}
          <p className="mt-3 text-[10.5px] leading-snug text-ink-secondary">
            This method values <span className="font-medium text-ink-primary">{companyName}</span> on its net worth (book value) and applies a comparable
            listed-peer P/BV multiple. It’s a book-value cross-check, not a price target — figures are source-backed and any missing input is left blank, never estimated.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
