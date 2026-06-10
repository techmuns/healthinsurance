import { Sparkles, ShieldAlert, ArrowLeftRight } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { LockedPanel } from '@/components/LockedPanel'
import { DataEmptyState } from '@/components/DataEmptyState'
import { VerdictStrip } from '@/components/VerdictStrip'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany } from '@/state/filters'
import { getCompanyMaster, getOwnershipData } from '@/lib/dataLayer'

// ---------------------------------------------------------------------------
//  Ownership — shareholding pattern for the LISTED standalone-health insurers
//  (Star Health, Niva Bupa). The section reads the ownership snapshot; when a
//  real quarterly shareholding row is present it renders the holder composition,
//  the promoter/FII/DII/public split and the top holders. Listed-but-not-yet-
//  ingested → an honest "being sourced" state; unlisted → "not disclosed".
//  Missing legs render as a quiet n/a — never coerced to 0.
// ---------------------------------------------------------------------------

interface Holder { name: string; type: string; share: number | null; change: number | null }
interface OwnershipRow {
  company_id: string
  quarter: string
  fiscal_year: string
  promoter_share: number | null
  fii_share: number | null
  dii_share: number | null
  mf_share: number | null
  public_share: number | null
  pledge_share: number | null
  top_holders: Holder[]
  provenance?: { source_name?: string; source_url?: string; confidence?: 'high' | 'medium' | 'low' | 'pending' }
}

// Holder-class palette — calm, tone-coded (promoter = navy anchor, institutions
// = teal/blue, public = slate).
const CLASS: { key: keyof OwnershipRow; label: string; color: string }[] = [
  { key: 'promoter_share', label: 'Promoter', color: '#27457E' },
  { key: 'fii_share', label: 'FII', color: '#168E8E' },
  { key: 'dii_share', label: 'DII', color: '#4F7BCF' },
  { key: 'mf_share', label: 'Mutual Funds', color: '#7FA3D9' },
  { key: 'public_share', label: 'Public & Other', color: '#9AA6B6' },
]

function pct(v: number | null): string {
  return v == null ? 'n/a' : `${v.toFixed(1)}%`
}

export function Ownership() {
  const company = useActiveCompany()
  const listed = getCompanyMaster().find((c) => c.company_id === company.id)?.listed_status === 'listed'
  const { row } = getOwnershipData(company.id) as { row: OwnershipRow | null }

  // Unlisted insurers do not publish a shareholding pattern.
  if (!listed) {
    return (
      <div className="space-y-6">
        <VerdictStrip
          eyebrow="Ownership Signal"
          verdict="Not publicly disclosed"
          tone="navy"
          badge="Unlisted"
          summary={`${company.shortName} is unlisted — quarterly shareholding patterns are filed only by listed insurers (Star Health, Niva Bupa).`}
          source="Not applicable"
          sourceFrequency="Quarterly"
          sourceStatus="pending"
          sourceProvenance={{ source_name: 'Shareholding pattern is not disclosed for unlisted insurers' }}
        />
        <ModuleCard question="Who owns the company?" title={`${company.shortName} · Ownership`} icon="ownership">
          <LockedPanel
            embedded
            height={260}
            title="Not publicly disclosed"
            message={`${company.shortName} is unlisted — the quarterly shareholding pattern is not publicly disclosed.`}
            pill="Not disclosed"
          />
        </ModuleCard>
      </div>
    )
  }

  // Listed, but the shareholding row hasn't been ingested yet — honest pending.
  if (!row) {
    return (
      <div className="space-y-6">
        <VerdictStrip
          eyebrow="Ownership Signal"
          verdict="Shareholding being sourced"
          tone="navy"
          badge="Pending"
          summary={`${company.shortName} is listed — its quarterly shareholding pattern is being pulled from the exchange filing. The composition, promoter holding and top holders populate here once it lands.`}
          source="Exchange filing"
          sourceFrequency="Quarterly"
          sourceStatus="pending"
          sourceProvenance={{
            source_name: 'Quarterly shareholding pattern (NSE / BSE corporate filings)',
            source_url: 'https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern',
          }}
        />
        <ModuleCard question="Who owns the company, and are serious investors changing exposure?" title={`${company.shortName} · Ownership`} icon="ownership">
          <DataEmptyState
            kind="pending"
            height={240}
            title="Shareholding pattern being sourced"
            body={`${company.shortName}'s latest quarterly shareholding split (promoter / FII / DII / public) is being pulled from the exchange filing and will render here.`}
          />
        </ModuleCard>
      </div>
    )
  }

  // Real data — render the composition.
  const segments = CLASS.map((c) => ({ ...c, value: row[c.key] as number | null })).filter((s) => s.value != null && s.value > 0) as { key: string; label: string; color: string; value: number }[]
  const total = segments.reduce((s, x) => s + x.value, 0) || 100
  const promoter = row.promoter_share
  const fii = row.fii_share
  const periodLabel = `${row.quarter} ${row.fiscal_year}`.trim()
  const conf = row.provenance?.confidence ?? 'medium'

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Ownership Signal"
        verdict={promoter != null ? `Promoter holding ${pct(promoter)}` : 'Shareholding disclosed'}
        tone="navy"
        badge={periodLabel}
        summary={`${company.shortName} shareholding as filed for ${periodLabel}. ${promoter != null ? `Promoters hold ${pct(promoter)}` : 'Promoter stake n/a'}${fii != null ? `, FIIs ${pct(fii)}` : ''}.`}
        source={row.provenance?.source_name ? 'Exchange filing' : 'Exchange filing'}
        sourceFrequency="Quarterly"
        sourceStatus="available"
        sourceProvenance={{
          source_name: row.provenance?.source_name ?? 'Quarterly shareholding pattern (NSE / BSE)',
          source_url: row.provenance?.source_url,
        }}
      />

      <ModuleCard
        question="Who owns the company, and are serious investors increasing or reducing exposure?"
        title={`${company.shortName} · Shareholding · ${periodLabel}`}
        icon="ownership"
      >
        <div className="space-y-5">
          {/* Composition bar */}
          <div>
            <div className="flex h-7 w-full overflow-hidden rounded-lg ring-1 ring-soft-border">
              {segments.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-center"
                  style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                  title={`${s.label}: ${pct(s.value)}`}
                >
                  {s.value / total >= 0.1 && <span className="px-1 text-[10px] font-semibold text-white">{s.value.toFixed(0)}%</span>}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {CLASS.map((c) => {
                const v = row[c.key] as number | null
                return (
                  <span key={c.label} className="inline-flex items-center gap-1.5 text-[11px]">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} />
                    <span className="text-ink-secondary">{c.label}</span>
                    <span className={`font-semibold tabular-nums ${v == null ? 'text-ink-secondary/45' : 'text-navy-deep'}`}>{pct(v)}</span>
                  </span>
                )
              })}
            </div>
          </div>

          {/* Top holders */}
          {row.top_holders?.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Top holders</p>
              <div className="overflow-hidden rounded-lg border border-soft-border">
                <table className="w-full text-[12px]">
                  <tbody>
                    {row.top_holders.slice(0, 8).map((h, i) => (
                      <tr key={i} className="border-b border-soft-border/60 last:border-0">
                        <td className="px-3 py-1.5 text-ink-primary">{h.name}</td>
                        <td className="px-3 py-1.5 text-right text-ink-secondary">{h.type}</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-navy-deep">{pct(h.share)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: h.change == null ? '#9AA6B6' : h.change >= 0 ? '#168E8E' : '#C0584F' }}>
                          {h.change == null ? '—' : `${h.change >= 0 ? '+' : '−'}${Math.abs(h.change).toFixed(1)}pp`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <SourceTag
              source="Exchange filing"
              period={periodLabel}
              confidence={conf}
              provenance={{ source_name: row.provenance?.source_name ?? 'Quarterly shareholding pattern (NSE / BSE)', source_url: row.provenance?.source_url }}
            />
          </div>
        </div>
      </ModuleCard>

      <OwnershipDynamics row={row} companyName={company.shortName} periodLabel={periodLabel} />
    </div>
  )
}

// ── Ownership Dynamics & Exit Risk ───────────────────────────────────────────
// An elegant AI analyst layer over the factual shareholding pattern: a read of
// what the ownership mix implies, an exit-overhang flag, a large-holder movement
// snapshot, and a bulk/block-deal mini timeline. Interprets the real holdings we
// have; movement / deal pieces show honest data-ready placeholders until a
// per-holder + bulk/block-deal feed lands. No new data, no calculation pipeline.

type Signal = 'Accumulating' | 'Stable' | 'Reducing' | 'Exit Watch' | 'Unknown'
const SIGNAL_STYLE: Record<Signal, { bg: string; fg: string; dot: string }> = {
  Accumulating: { bg: 'rgba(22,142,142,0.12)', fg: '#0E6F6D', dot: '#168E8E' },
  Stable: { bg: 'rgba(39,69,126,0.10)', fg: '#27457E', dot: '#27457E' },
  Reducing: { bg: 'rgba(192,134,128,0.16)', fg: '#A8443B', dot: '#C08680' },
  'Exit Watch': { bg: 'rgba(182,139,58,0.16)', fg: '#8A6516', dot: '#B68B3A' },
  Unknown: { bg: 'rgba(140,151,168,0.14)', fg: '#5B6573', dot: '#8C97A8' },
}

function aiOwnershipRead(row: OwnershipRow): string[] {
  const pts: string[] = []
  const p = row.promoter_share
  const fii = row.fii_share
  const dii = row.dii_share
  const mf = row.mf_share
  if (p != null) {
    const level = p >= 50 ? 'a controlling stake' : p >= 26 ? 'a significant stake' : 'a minority stake'
    pts.push(`Promoter holds ${p.toFixed(1)}% — ${level}; ${p >= 50 ? 'board control rests with the promoter, lowering governance-change and takeover risk' : 'no single controlling block'}.`)
  }
  const inst = [fii, dii, mf].filter((x): x is number => x != null).reduce((a, b) => a + b, 0)
  if (inst > 0) {
    const parts = [fii != null ? `FII ${fii.toFixed(1)}%` : '', dii != null ? `DII ${dii.toFixed(1)}%` : '', mf != null ? `MF ${mf.toFixed(1)}%` : ''].filter(Boolean).join(', ')
    pts.push(`Institutions hold ~${inst.toFixed(0)}% (${parts}) — ${inst >= 30 ? 'a deep institutional base signalling broad market participation' : 'a modest institutional base'}.`)
  }
  if (mf != null && mf >= 8) pts.push(`Mutual funds hold ${mf.toFixed(1)}% — domestic-fund support tends to be a stickier, stabilising holder class.`)
  pts.push('Quarter-on-quarter accumulation/reduction is not yet tracked (one filing on record) — the buy/sell trend and any institutional exit surface with the next shareholding filing.')
  return pts.slice(0, 4)
}

function OwnershipDynamics({ row, companyName, periodLabel }: { row: OwnershipRow; companyName: string; periodLabel: string }) {
  const read = aiOwnershipRead(row)
  const holders = (row.top_holders ?? []).filter((h) => h.share != null)
  const hasNamed = holders.length > 0

  // Large-holder rows: named holders when available, else the real class
  // aggregates (signal Unknown — movement isn't tracked from a single filing).
  const classRows: { entity: string; type: string; pct: number | null; signal: Signal }[] = [
    { entity: 'Promoter group', type: 'Promoter', pct: row.promoter_share, signal: 'Unknown' },
    { entity: 'Foreign institutions', type: 'FII / FPI', pct: row.fii_share, signal: 'Unknown' },
    { entity: 'Domestic institutions', type: 'DII', pct: row.dii_share, signal: 'Unknown' },
    { entity: 'Mutual funds', type: 'MF', pct: row.mf_share, signal: 'Unknown' },
    { entity: 'Public & other', type: 'Public', pct: row.public_share, signal: 'Unknown' },
  ].filter((r) => r.pct != null)
  const tableRows = hasNamed
    ? holders.map((h) => ({ entity: h.name, type: h.type, pct: h.share, signal: (h.change == null ? 'Unknown' : h.change > 0.1 ? 'Accumulating' : h.change < -0.1 ? 'Reducing' : 'Stable') as Signal, change: h.change }))
    : classRows.map((r) => ({ ...r, change: null as number | null }))

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-4 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
        <h3 className="font-display text-[15px] text-navy-deep">Ownership Dynamics &amp; Exit Risk</h3>
        <span className="rounded-full bg-ice px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{periodLabel}</span>
      </div>

      {/* AI Ownership Read + Exit Overhang */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[62fr_38fr]">
        <div className="rounded-2xl border border-[#EAD9B6]/70 bg-gradient-to-br from-white to-[#FBF6EA] p-4 shadow-soft">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-champagne-deep" />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">AI Ownership Read</p>
          </div>
          <ul className="space-y-1.5">
            {read.map((pt, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink-primary">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-champagne-deep" />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>

        <ExitOverhang hasNamed={hasNamed} promoter={row.promoter_share} />
      </div>

      {/* Large Holder Movement Snapshot */}
      <div className="rounded-2xl border border-soft-border bg-card p-4 shadow-soft">
        <div className="mb-2 flex items-center gap-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5 text-navy-primary" />
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Large Holder Movement Snapshot</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr className="border-b border-soft-border text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">
                <th className="py-1.5 pr-2 text-left">Holder / Entity</th>
                <th className="py-1.5 px-2 text-left">Type</th>
                <th className="py-1.5 px-2 text-right">Holding %</th>
                <th className="py-1.5 px-2 text-left">Recent Movement</th>
                <th className="py-1.5 px-2 text-left">Last Known Action</th>
                <th className="py-1.5 pl-2 text-right">Signal</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => {
                const s = SIGNAL_STYLE[r.signal]
                return (
                  <tr key={i} className="border-b border-soft-border/60 last:border-0">
                    <td className="py-2 pr-2 font-medium text-navy-deep">{r.entity}</td>
                    <td className="py-2 px-2 text-ink-secondary">{r.type}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-navy-deep">{r.pct != null ? `${r.pct.toFixed(1)}%` : 'n/a'}</td>
                    <td className="py-2 px-2 text-ink-secondary">{r.change != null ? `${r.change >= 0 ? '+' : '−'}${Math.abs(r.change).toFixed(1)}pp` : 'Not yet tracked'}</td>
                    <td className="py-2 px-2 text-ink-secondary">—</td>
                    <td className="py-2 pl-2 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: s.bg, color: s.fg }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />{r.signal}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!hasNamed && (
          <p className="mt-2 text-[10.5px] text-ink-secondary/80">
            Showing holder-class aggregates. Per-named-holder stakes and quarter-on-quarter movement activate once the detailed shareholding schedule is tracked.
          </p>
        )}
      </div>

      {/* Bulk / Block Deal mini timeline */}
      <div className="rounded-2xl border border-soft-border bg-card p-4 shadow-soft">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Bulk / Block Deal Timeline</p>
        <DataEmptyState
          kind="pending"
          height={92}
          title="No bulk / block deals on record"
          body={`Large buys, sells, PE/strategic exits and institutional accumulation for ${companyName} appear here as a chip timeline once a bulk/block-deal feed is connected.`}
        />
      </div>
    </section>
  )
}

function ExitOverhang({ hasNamed, promoter }: { hasNamed: boolean; promoter: number | null }) {
  // With only class-level holdings (no per-holder block / deal data), we cannot
  // honestly flag a specific exit overhang — say so plainly rather than overstate.
  const level = hasNamed ? 'Low' : 'Insufficient data'
  const reason = hasNamed
    ? `Controlling promoter at ${promoter != null ? promoter.toFixed(0) + '%' : 'a stable level'} and a broad institutional base; no single dominant non-promoter block flagged as reducing.`
    : 'Per-holder stakes and bulk/block-deal activity aren’t tracked yet, so a specific large-holder exit overhang can’t be assessed. Promoter and institutional totals look stable.'
  const tone = level === 'Insufficient data' ? SIGNAL_STYLE.Unknown : SIGNAL_STYLE.Stable
  return (
    <div className="rounded-2xl border border-soft-border bg-card p-4 shadow-soft">
      <div className="mb-2 flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 text-ink-secondary" />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Exit Overhang</p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
        <span className="h-2 w-2 rounded-full" style={{ background: tone.dot }} />{level}
      </span>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-secondary">{reason}</p>
    </div>
  )
}
