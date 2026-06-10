import { useState } from 'react'
import { TrendingDown, TrendingUp, Sparkles, Layers } from 'lucide-react'
import { SourceTag } from './SourceTag'
import { EarningsBridgeDrawer } from './EarningsBridge'
import { getEarningsBridge, earningsQuality, BRIDGE_SOURCE } from '@/data/earningsBridge'

const NAVY = '#172B4D'
const CORAL = '#C0584F'
const EMERALD = '#2F855A'
const GOLD = '#B68B3A'

const cr = (v: number) => `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')} Cr`

/**
 * Profit Quality Check — the page's central question in one compact card: is PAT
 * coming from the core insurance business (underwriting) or from investment
 * income? It reads the SAME audited earnings bridge as the waterfall below, so
 * the top verdict, this card and the bridge can never tell different stories.
 * Omitted (returns null) for companies without an audited bridge.
 */
export function ProfitQualityCheck({ companyId, companyShort }: { companyId: string; companyShort: string }) {
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const years = getEarningsBridge(companyId)
  if (years.length === 0) return null
  const yr = years[0] // latest reported FY
  const b = yr.igaap
  const q = earningsQuality(b)
  const uwLoss = b.underwritingResult < 0

  // Quality badge — plain investor wording.
  const badge = q.investmentLed
    ? 'Investment-led profit'
    : b.underwritingResult > 0
      ? 'Underwriting-led profit'
      : 'Weak quality'
  const badgeTone = q.investmentLed ? GOLD : b.underwritingResult > 0 ? EMERALD : CORAL

  const tiles = [
    {
      key: 'uw',
      kicker: uwLoss ? 'Insurance drag' : 'Insurance profit',
      label: 'Core underwriting',
      value: cr(b.underwritingResult),
      color: b.underwritingResult >= 0 ? EMERALD : CORAL,
      bg: b.underwritingResult >= 0 ? '#E7F4F3' : '#FBEFEF',
      border: b.underwritingResult >= 0 ? '#C9E5E3' : '#EFD4D3',
      Icon: TrendingDown,
      op: '',
    },
    {
      key: 'inv',
      kicker: 'Returns on float',
      label: 'Investment support',
      value: `+${cr(b.investmentIncome)}`,
      color: EMERALD,
      bg: '#EAF5EE',
      border: '#CFE7DA',
      Icon: TrendingUp,
      op: '+',
    },
  ]

  return (
    <section className="card-surface p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex items-start gap-2">
          <span className="blob-a mt-0.5 flex h-7 w-7 items-center justify-center shadow-soft" style={{ background: '#FBF1D8' }}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">Profit Quality</p>
            <h3 className="mt-0.5 font-display text-[15px] leading-tight text-navy-deep">Where does the profit come from?</h3>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide" style={{ borderColor: `${badgeTone}55`, background: `${badgeTone}14`, color: badgeTone }}>
            {badge}
          </span>
          <button type="button" onClick={() => setBridgeOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary">
            <Layers className="h-3.5 w-3.5" /> Details
          </button>
        </div>
      </div>

      {/* Equation — underwriting + investment → PAT (same audited basis as the bridge) */}
      <div className="mt-3 flex items-stretch gap-2">
        {tiles.map((t, i) => (
          <div key={t.key} className="flex flex-1 items-stretch gap-2">
            {i > 0 && <span className="flex shrink-0 items-center text-[15px] font-bold text-ink-secondary/45">+</span>}
            <div className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-xl border px-3 py-2.5" style={{ background: t.bg, borderColor: t.border }}>
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: t.color }} />
              <span className="inline-flex items-center gap-1.5 pl-1.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-ink-secondary">
                <t.Icon className="h-3 w-3" style={{ color: t.color }} />
                {t.label}
              </span>
              <span className="mt-1 pl-1.5 font-display text-[18px] leading-none" style={{ color: t.color }}>{t.value}</span>
              <span className="mt-1 pl-1.5 text-[8.5px] text-ink-secondary">{t.kicker}</span>
            </div>
          </div>
        ))}
        <span className="flex shrink-0 items-center text-[15px] font-bold" style={{ color: NAVY }}>=</span>
        <div className="flex w-[112px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={{ background: 'linear-gradient(160deg, #EEF3FB 0%, #FBFCFE 100%)', borderColor: '#D6E2FA', boxShadow: `0 12px 24px ${NAVY}22` }}>
          <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: NAVY }}>Final PAT</span>
          <span className="mt-1 font-display text-[24px] leading-none" style={{ color: b.pat >= 0 ? NAVY : CORAL }}>{cr(b.pat)}</span>
          <span className="mt-1 text-[8px] leading-tight text-ink-secondary">after other / tax</span>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] leading-snug text-ink-secondary">{companyShort} · {yr.fy} · audited basis (full bridge in Details)</p>
        <SourceTag source={BRIDGE_SOURCE} period={yr.fy} confidence="high" />
      </div>

      <EarningsBridgeDrawer open={bridgeOpen} onClose={() => setBridgeOpen(false)} companyId={companyId} companyShort={companyShort} />
    </section>
  )
}
