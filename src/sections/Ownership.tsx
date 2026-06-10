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
    </div>
  )
}
