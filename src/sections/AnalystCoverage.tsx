import { Fragment, useMemo, useState } from 'react'
import { Building2, ExternalLink, FunctionSquare, Info, TrendingDown, TrendingUp, X } from 'lucide-react'
import { STATUS_META, type AuditCell, type AuditGroup } from '@/lib/extractedDataAudit'
import { companyColor, companyShortName } from '@/lib/companyColors'
import { useAuditView } from '@/lib/auditView'
import { CustomizeBar, type TrayChip } from '@/components/CustomizeBar'
import analystSnapshot from '@/data/snapshots/analyst-coverage-snapshot.json'
import priceHistory from '@/data/snapshots/price-history-snapshot.json'

// ---------------------------------------------------------------------------
//  Analyst coverage — the dashboard mirror of the workbook's "Analyst coverage"
//  (Broker coverage) tab. Each row is a DATED broker research note, not a
//  period column, so the generic period-pivot grid can't represent it — like
//  Historical Stock Movement, it gets a dedicated, workbook-faithful renderer
//  that reproduces the source layout column-for-column, row-for-row:
//
//    Company | Broker | Date | Recommendation | CMP | Price at reco | Target |
//    Upside/(downside) % from reco | Upside/(downside) % from CMP
//
//  …grouped into a block per covered insurer (Niva Bupa, Star Health, ICICI
//  Lombard; Go Digit appears once broker coverage lands), each closed by an
//  Average row.
//
//  SOURCES (honest, per CLAUDE.md):
//   • Broker, date, target price, price at reco, recommendation → dated broker
//     notes harvested from a public aggregator (Moneycontrol / Trendlyne). Broker
//     targets have NO official feed, so this is the sanctioned, clearly-labelled
//     low-confidence BACKUP for exactly this sheet. Missing is never zero.
//   • CMP (current market price) → the live market quote from the daily price feed
//     (price-history-snapshot); an honest "fetches next" marker shows only where a
//     name has no live quote yet.
//   • Upside %s and the Average rows are CALCULATED here, exactly as the workbook
//     computes them (target ÷ price − 1; block means over the values we hold).
//
//  These are analyst price targets — NOT company premium or profit. The row
//  scaffold (which broker calls exist) mirrors the template; every VALUE is
//  fetched or left blank — never copied from the source workbook.
// ---------------------------------------------------------------------------

// ── Fetched-snapshot join (the recommendation / rating, by company+broker+date)
interface SnapRow {
  company_id: string
  broker: string
  report_date: string
  rating: string | null
  target_price: number | null
  price_at_reco: number | null
  source_url: string | null
  fetched_at: string | null
}
const SNAP = (analystSnapshot as unknown as { data: SnapRow[] }).data ?? []
const ratingKey = (c: string, b: string, d: string) => `${c}|${b}|${d}`
const RATING = new Map<string, { rating: string | null; url: string | null; fetchedAt: string | null }>()
for (const r of SNAP) RATING.set(ratingKey(r.company_id, r.broker, r.report_date), { rating: r.rating, url: r.source_url, fetchedAt: r.fetched_at })

// ── Live CMP (current market price) — the latest close per company, from the
//    same daily price feed the Historical Stock Movement tab uses. A real,
//    source-backed reference price kept current by the price pipeline; the
//    "upside vs CMP" column is computed from it. (Not copied from the workbook.)
interface PriceRow { company_id: string; date: string; close: number | null; provenance?: { source_name?: string; source_url?: string } }
const PRICE = (priceHistory as unknown as { data: PriceRow[] }).data ?? []
interface CmpRef { cmp: number; date: string; sourceName: string | null; sourceUrl: string | null }
const CMP_BY_COMPANY: Record<string, CmpRef> = (() => {
  const out: Record<string, CmpRef> = {}
  for (const r of PRICE) {
    if (r.close == null) continue
    const cur = out[r.company_id]
    if (!cur || r.date > cur.date)
      out[r.company_id] = { cmp: r.close, date: r.date, sourceName: r.provenance?.source_name ?? 'Daily price feed', sourceUrl: r.provenance?.source_url ?? null }
  }
  return out
})()

// ── tone palette (mirrors the audit spreadsheet's tints) ─────────────────────
type Tone = 'green' | 'red' | 'yellow' | 'grey' | 'info'
const TONE: Record<Tone, { cell: string; text: string; dot: string }> = {
  green: { cell: 'bg-emerald-soft', text: 'text-emerald', dot: '#2F855A' },
  red: { cell: 'bg-coral-soft', text: 'text-coral', dot: '#C75D54' },
  yellow: { cell: 'bg-gold-soft', text: 'text-gold', dot: '#B7791F' },
  grey: { cell: 'bg-slate-100', text: 'text-slate-500', dot: '#94A3B8' },
  info: { cell: 'bg-lavender-soft', text: 'text-lavender', dot: '#6E7BD6' },
}

// ── helpers ──────────────────────────────────────────────────────────────────
const rowOf = (ref: string) => { const m = /^[A-Z]+(\d+)$/.exec(ref || ''); return m ? Number(m[1]) : 0 }
const numOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const inr = (v: number | null) =>
  v == null ? '—' : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const pct = (f: number | null) =>
  f == null ? '—' : `${f >= 0 ? '+' : '−'}${(Math.abs(f) * 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const fmtDate = (iso: string) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—'
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
}
function titleRating(r: string): string {
  return r.replace(/\b\w+/g, (w) => (w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).replace(/\bIpo\b/gi, 'IPO')
}
function ratingTone(r: string): Tone {
  const s = r.toLowerCase()
  if (/\b(buy|add|accumulate|outperform|overweight)\b/.test(s)) return 'green'
  if (/\b(sell|reduce|avoid|underperform|underweight)\b/.test(s)) return 'red'
  if (/\b(hold|neutral|equal|market ?perform)\b/.test(s)) return 'yellow'
  return 'grey' // IPO note / subscribe / unrated
}

// ── reconstructed model ──────────────────────────────────────────────────────
interface BrokerRow {
  rowNum: number
  companyId: string
  companyLabel: string
  broker: string
  date: string
  recommendation: string | null
  recoUrl: string | null
  priceCell: AuditCell | null
  targetCell: AuditCell | null
  priceAtReco: number | null
  target: number | null
  cmp: number | null // live market price from the daily feed; null only where no quote yet
  upsideReco: number | null
  upsideCmp: number | null
}
interface AvgRow {
  priceAtReco: number | null
  target: number | null
  cmp: number | null
  upsideReco: number | null
  upsideCmp: number | null
}
interface Block {
  companyId: string
  companyLabel: string
  rows: BrokerRow[]
  avg: AvgRow
}

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}
// The workbook averages ALL broker rows in a block. We only show the Average
// once the basis is COMPLETE (every row fetched) — a mean over a partial set
// would misrepresent the consensus (Neha's honesty rule: never derive a number
// from an incomplete basis that would mislead). Until then the row holds an
// honest placeholder and fills itself as the fetcher completes the block.
const fullMean = (xs: (number | null)[]): number | null =>
  xs.length > 0 && xs.every((x) => x != null) ? mean(xs) : null

function buildBlocks(group: AuditGroup): Block[] {
  const byRow = new Map<number, AuditCell[]>()
  for (const c of group.cells) {
    const r = rowOf(c.cellRef)
    if (!r) continue
    ;(byRow.get(r) ?? byRow.set(r, []).get(r)!).push(c)
  }
  const rows: BrokerRow[] = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowNum, cells]) => {
      const any = cells[0]
      const broker = (any.metricId.split('::')[1] ?? '').trim()
      const date = any.period
      const priceCell = cells.find((c) => c.metricId.startsWith('analyst_price_at_reco')) ?? null
      const targetCell = cells.find((c) => c.metricId.startsWith('analyst_target_price')) ?? null
      const priceAtReco = numOf(priceCell?.normalizedValue)
      const target = numOf(targetCell?.normalizedValue)
      const rec = RATING.get(ratingKey(any.entityId, broker, date))
      const cmp = CMP_BY_COMPANY[any.entityId]?.cmp ?? null
      return {
        rowNum,
        companyId: any.entityId,
        companyLabel: any.entityLabel,
        broker,
        date,
        recommendation: rec?.rating ?? null,
        recoUrl: rec?.url ?? null,
        priceCell,
        targetCell,
        priceAtReco,
        target,
        cmp,
        upsideReco: priceAtReco != null && target != null && priceAtReco !== 0 ? target / priceAtReco - 1 : null,
        upsideCmp: cmp != null && target != null && cmp !== 0 ? target / cmp - 1 : null,
      }
    })

  const blocks: Block[] = []
  for (const r of rows) {
    let b = blocks[blocks.length - 1]
    if (!b || b.companyId !== r.companyId) {
      b = { companyId: r.companyId, companyLabel: r.companyLabel, rows: [], avg: { priceAtReco: null, target: null, cmp: null, upsideReco: null, upsideCmp: null } }
      blocks.push(b)
    }
    b.rows.push(r)
  }
  // Average exactly as the workbook: mean of each column, upside from the means.
  for (const b of blocks) {
    const ap = fullMean(b.rows.map((r) => r.priceAtReco))
    const at = fullMean(b.rows.map((r) => r.target))
    const cmp = CMP_BY_COMPANY[b.companyId]?.cmp ?? null
    b.avg = {
      priceAtReco: ap,
      target: at,
      cmp,
      upsideReco: ap != null && at != null && ap !== 0 ? at / ap - 1 : null,
      upsideCmp: cmp != null && at != null && cmp !== 0 ? at / cmp - 1 : null,
    }
  }
  return blocks
}

// ── small cell renderers ──────────────────────────────────────────────────────
/** A fetched price / target value, or an honest "not fetched yet" marker. */
function ValueCell({ cell, selected, onSelect }: { cell: AuditCell | null; selected: boolean; onSelect: () => void }) {
  const v = numOf(cell?.normalizedValue)
  if (cell && v != null) {
    const tone = TONE[(STATUS_META[cell.status].color as Tone) ?? 'green']
    return (
      <button
        type="button"
        onClick={onSelect}
        title={`${cell.metricLabel} · ${cell.period} — ${STATUS_META[cell.status].label}. Click for source.`}
        className={`flex h-full min-h-[30px] w-full items-center justify-end px-2.5 tabular-nums transition-all ${tone.cell} hover:brightness-95`}
        style={selected ? { boxShadow: `inset 0 0 0 2px ${tone.dot}` } : undefined}
      >
        <span className={`text-[11.5px] font-semibold ${tone.text}`}>{inr(v)}</span>
      </button>
    )
  }
  // Empty → the aggregator backup is what fills it; say so, calmly.
  return (
    <div className="flex h-full min-h-[30px] w-full items-center justify-center px-2" title="Not fetched yet — comes from the broker-research aggregator (low-confidence backup). Never shown as 0.">
      <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-ink-secondary/70">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#B68B3A' }} />reports
      </span>
    </div>
  )
}

/** CMP / upside-from-CMP — live market price, not wired into this tab yet. */
function LiveMarker({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[30px] w-full items-center justify-center px-2" title="CMP is the live market price — being wired into this tab next. Not yet fetched here, so left blank rather than shown as 0.">
      <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-slate-400">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />{label}
      </span>
    </div>
  )
}

/** CMP — the live current market price (latest close), source-backed. */
function CmpCell({ row }: { row: BrokerRow }) {
  if (row.cmp == null) return <LiveMarker label="live" />
  const ref = CMP_BY_COMPANY[row.companyId]
  return (
    <div
      className="flex h-full min-h-[30px] items-center justify-end gap-1 px-2.5 tabular-nums"
      title={`Current market price — latest close ${ref ? fmtDate(ref.date) : ''}${ref?.sourceName ? ` · ${ref.sourceName}` : ''}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald/60" />
      <span className="text-[11.5px] font-semibold text-navy-deep/90">{inr(row.cmp)}</span>
    </div>
  )
}

function UpsideCell({ f }: { f: number | null }) {
  if (f == null) return <div className="flex h-full min-h-[30px] items-center justify-center text-[11px] text-ink-secondary/50">—</div>
  const up = f >= 0
  return (
    <div className={`flex h-full min-h-[30px] items-center justify-end gap-1 px-2.5 tabular-nums text-[11.5px] font-semibold ${up ? 'text-emerald' : 'text-coral'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {pct(f)}
    </div>
  )
}

function RecoCell({ row }: { row: BrokerRow }) {
  if (!row.recommendation) {
    return (
      <div className="flex h-full min-h-[30px] items-center justify-center" title="Recommendation comes from the broker note (rating). Not fetched yet for this row.">
        <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-ink-secondary/60">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#B68B3A' }} />pending
        </span>
      </div>
    )
  }
  const tone = TONE[ratingTone(row.recommendation)]
  const label = titleRating(row.recommendation)
  const pill = (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.cell} ${tone.text}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />{label}
    </span>
  )
  return (
    <div className="flex h-full min-h-[30px] items-center justify-center px-1">
      {row.recoUrl ? (
        <a href={row.recoUrl} target="_blank" rel="noreferrer" title="Open the broker-research source page" className="hover:brightness-95">{pill}</a>
      ) : pill}
    </div>
  )
}

// ── detail card for a selected price / target cell ────────────────────────────
function Detail({ cell, onClose }: { cell: AuditCell; onClose: () => void }) {
  const meta = STATUS_META[cell.status]
  const tone = TONE[(meta.color as Tone) ?? 'grey']
  const v = numOf(cell.normalizedValue)
  return (
    <div className="flex flex-col overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-card">
      <div className="flex items-start justify-between gap-2 px-4 py-3" style={{ background: 'linear-gradient(135deg,#172B4D,#27457E)' }}>
        <div className="leading-tight">
          <p className="font-mono text-[10px] uppercase tracking-wide text-white/55">Cell {cell.cellRef} · Analyst coverage</p>
          <p className="mt-0.5 font-display text-[14px] text-white">{cell.metricLabel}</p>
          <p className="text-[11px] text-white/65">{cell.entityLabel} · {fmtDate(cell.period)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.cell} ${tone.text}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />{meta.label}
          </span>
          <span className="ml-auto text-[15px] font-semibold tabular-nums text-navy-deep">{inr(v)}</span>
        </div>
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Source</p>
          <div className="mt-0.5 text-[12px] text-ink-primary">
            {cell.sourceUrl ? (
              <a href={cell.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-navy-primary hover:underline">
                {cell.sourceName || 'Broker-research aggregator'}<ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-ink-secondary">{cell.sourceName || 'Broker-research aggregator (low-confidence backup)'}</span>
            )}
          </div>
        </div>
        {cell.confidence && (
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Confidence</p>
            <p className="mt-0.5 text-[12px] capitalize text-ink-primary">{cell.confidence}</p>
          </div>
        )}
        {/* A note is viewer content only when it explains why a value is ABSENT
            (CLAUDE.md: internal lineage notes never surface on a filled cell). */}
        {v == null && cell.note && (
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Why it&apos;s blank</p>
            <p className="mt-0.5 text-[11px] text-ink-secondary">{cell.note}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── header columns ────────────────────────────────────────────────────────────
const COLS: { key: string; label: string; sub?: string; calc?: boolean; align?: 'left' | 'center' | 'right' }[] = [
  { key: 'company', label: 'Company', align: 'left' },
  { key: 'broker', label: 'Broker', align: 'left' },
  { key: 'date', label: 'Date', align: 'left' },
  { key: 'reco', label: 'Recommendation', align: 'center' },
  { key: 'cmp', label: 'CMP', align: 'right' },
  { key: 'reco_price', label: 'Price at reco', align: 'right' },
  { key: 'target', label: 'Target', align: 'right' },
  { key: 'up_reco', label: 'Upside / (downside)', sub: 'vs reco', calc: true, align: 'right' },
  { key: 'up_cmp', label: 'Upside / (downside)', sub: 'vs CMP', calc: true, align: 'right' },
]

export function AnalystCoverage({
  group,
  companyFilter = 'all',
  onClearCompany,
}: {
  group: AuditGroup
  companyFilter?: string
  onClearCompany?: () => void
}) {
  const allBlocks = useMemo(() => buildBlocks(group), [group])
  const [selected, setSelected] = useState<AuditCell | null>(null)
  // Customize View — hide columns / company blocks directly from the table. The
  // Company column is the row grouping, so it's never part of the hide order.
  const view = useAuditView('analyst-coverage', COLS.filter((c) => c.key !== 'company').map((c) => c.key))
  const vis = (key: string) => !view.isHiddenColumn(key)

  // Visible blocks honour the company focus (dropdown) AND the tap-to-hide tray.
  const blocks = useMemo(
    () =>
      allBlocks.filter(
        (b) => (companyFilter === 'all' || b.companyId === companyFilter) && !view.isHiddenCompany(b.companyId),
      ),
    [allBlocks, companyFilter, view],
  )

  const companyMeta = useMemo(() => new Map(allBlocks.map((b) => [b.companyId, b.companyLabel] as const)), [allBlocks])
  const chips: TrayChip[] = [
    ...view.hiddenCompanies
      .filter((id) => companyMeta.has(id))
      .map((id) => ({ id, kind: 'company' as const, label: companyShortName(id, companyMeta.get(id)), color: companyColor(id).key })),
    ...view.hiddenColumns
      .map((k): TrayChip | null => {
        const c = COLS.find((x) => x.key === k)
        return c ? { id: k, kind: 'column', label: c.sub ? `${c.label} · ${c.sub}` : c.label } : null
      })
      .filter((x): x is TrayChip => x != null),
  ]
  const restore = (chip: TrayChip) => (chip.kind === 'company' ? view.showCompany(chip.id) : view.showColumn(chip.id))

  const totalRows = blocks.reduce((n, b) => n + b.rows.length, 0)
  const fetched = useMemo(() => {
    const ids = new Set(blocks.map((b) => b.companyId))
    return group.cells.filter((c) => ids.has(c.entityId) && numOf(c.normalizedValue) != null).length
  }, [blocks, group])

  const table = (
    <div className="overflow-auto rounded-xl2 border border-soft-border bg-card shadow-soft" style={{ maxHeight: '70vh' }}>
      <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead className="sticky top-0 z-20">
          <tr>
            {COLS.filter((c) => c.key === 'company' || vis(c.key)).map((c) => (
              <th
                key={c.key}
                className={`group/col relative border-b border-r border-soft-border bg-[#F3F6FB] px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-secondary ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} ${c.key === 'company' ? 'sticky left-0 z-30' : ''}`}
                style={{ minWidth: c.key === 'company' ? 150 : c.key === 'broker' ? 138 : 76 }}
              >
                <span className="inline-flex items-center gap-1">
                  {c.calc && <FunctionSquare className="h-2.5 w-2.5 opacity-40" />}
                  <span className="leading-tight">
                    {c.label}
                    {c.sub && <span className="ml-1 font-medium normal-case text-ink-secondary/70">· {c.sub}</span>}
                  </span>
                </span>
                {c.key !== 'company' && (
                  <button
                    type="button"
                    title={`Hide ${c.label}${c.sub ? ` · ${c.sub}` : ''}`}
                    onClick={() => view.hideColumn(c.key)}
                    className="absolute right-1 top-1 rounded p-0.5 text-ink-secondary opacity-0 transition-opacity hover:bg-coral-soft hover:text-coral group-hover/col:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => {
            const cc = companyColor(b.companyId)
            return (
            <Fragment key={b.companyId}>
              {b.rows.map((r, i) => (
                <tr key={r.rowNum} className="group">
                  {i === 0 && (
                    <th
                      rowSpan={b.rows.length}
                      className="group/band sticky left-0 z-10 border-b-2 border-r border-soft-border px-3 py-1.5 text-left align-middle"
                      style={{ background: cc.tint, borderLeft: `3px solid ${cc.key}` }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cc.key }} />
                        <span className="block text-[12px] font-bold leading-tight" style={{ color: cc.text }}>{companyShortName(b.companyId, b.companyLabel)}</span>
                        <button
                          type="button"
                          title={`Hide ${companyShortName(b.companyId, b.companyLabel)}`}
                          onClick={() => view.hideCompany(b.companyId)}
                          className="ml-auto rounded p-0.5 opacity-0 transition-opacity hover:bg-white/70 group-hover/band:opacity-100"
                          style={{ color: cc.text }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                      <span className="mt-0.5 block pl-3.5 text-[9.5px] text-ink-secondary">{b.rows.length} broker calls</span>
                    </th>
                  )}
                  {vis('broker') && <td className="border-b border-r border-soft-border/70 px-3 py-1.5 text-[11.5px] font-medium text-navy-deep group-hover:bg-ice/50">{r.broker || '—'}</td>}
                  {vis('date') && <td className="border-b border-r border-soft-border/70 px-3 py-1.5 text-[11px] tabular-nums text-ink-secondary group-hover:bg-ice/50">{fmtDate(r.date)}</td>}
                  {vis('reco') && <td className="border-b border-r border-soft-border/70 p-0 group-hover:bg-ice/50"><RecoCell row={r} /></td>}
                  {vis('cmp') && <td className="border-b border-r border-soft-border/70 p-0 group-hover:bg-ice/50"><CmpCell row={r} /></td>}
                  {vis('reco_price') && (
                    <td className="border-b border-r border-soft-border/70 p-0">
                      <ValueCell cell={r.priceCell} selected={selected?.id === r.priceCell?.id} onSelect={() => r.priceCell && setSelected(r.priceCell)} />
                    </td>
                  )}
                  {vis('target') && (
                    <td className="border-b border-r border-soft-border/70 p-0">
                      <ValueCell cell={r.targetCell} selected={selected?.id === r.targetCell?.id} onSelect={() => r.targetCell && setSelected(r.targetCell)} />
                    </td>
                  )}
                  {vis('up_reco') && <td className="border-b border-r border-soft-border/70 p-0 group-hover:bg-ice/30"><UpsideCell f={r.upsideReco} /></td>}
                  {vis('up_cmp') && <td className="border-b border-r border-soft-border/70 p-0 group-hover:bg-ice/30"><UpsideCell f={r.upsideCmp} /></td>}
                </tr>
              ))}
              {/* Average row — closes the block, exactly like the workbook. Fills
                  itself once every broker target in the block has been fetched. */}
              <tr style={{ background: cc.tint }}>
                <td className="sticky left-0 z-10 border-b-2 border-r border-soft-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: cc.tint, borderLeft: `3px solid ${cc.key}`, color: cc.text }}>Average</td>
                {vis('broker') && <td className="border-b-2 border-r border-soft-border" />}
                {vis('date') && <td className="border-b-2 border-r border-soft-border" />}
                {vis('reco') && <td className="border-b-2 border-r border-soft-border" />}
                {vis('cmp') && <td className="border-b-2 border-r border-soft-border px-2.5 py-1.5 text-right text-[11.5px] tabular-nums font-semibold text-navy-deep/80">{inr(b.avg.cmp)}</td>}
                {vis('reco_price') && <td className="border-b-2 border-r border-soft-border px-2.5 py-1.5 text-right text-[11.5px] tabular-nums font-bold text-navy-deep" title={b.avg.priceAtReco == null ? 'Average shows once all broker price-at-reco values in this block are fetched.' : undefined}>{inr(b.avg.priceAtReco)}</td>}
                {vis('target') && <td className="border-b-2 border-r border-soft-border px-2.5 py-1.5 text-right text-[11.5px] tabular-nums font-bold text-navy-deep" title={b.avg.target == null ? 'Average shows once all broker targets in this block are fetched.' : undefined}>{inr(b.avg.target)}</td>}
                {vis('up_reco') && <td className="border-b-2 border-r border-soft-border p-0"><UpsideCell f={b.avg.upsideReco} /></td>}
                {vis('up_cmp') && <td className="border-b-2 border-r border-soft-border p-0"><UpsideCell f={b.avg.upsideCmp} /></td>}
              </tr>
            </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Title + honest source/basis line */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-navy-deep">Broker coverage</h3>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-ink-secondary">
            Dated broker research notes — <span className="font-medium text-ink-primary">analyst price targets, not premium or profit</span>. Targets have no official feed, so they’re an aggregator-sourced
            low-confidence backup (Moneycontrol / Trendlyne). CMP is the live market price (latest close); upside %s and the Average rows are calculated. Missing is never shown as 0.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-[10px] text-ink-secondary">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: TONE.green.dot, opacity: 0.85 }} />Fetched</span>
          <span className="inline-flex items-center gap-1"><FunctionSquare className="h-3 w-3 opacity-40" />Calculated</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald/60" />Live price (CMP)</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: '#B68B3A', opacity: 0.85 }} />Reports — not fetched</span>
        </div>
      </div>

      {/* Coverage chip */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-soft-border bg-ice/40 px-3 py-2 text-[11px]">
        <Info className="h-3.5 w-3.5 text-navy-primary/70" />
        <span className="text-ink-secondary">
          <span className="font-semibold text-navy-deep">{blocks.length}</span> companies · <span className="font-semibold text-navy-deep">{totalRows}</span> broker calls ·{' '}
          <span className="text-emerald">{fetched} values fetched</span>
          <span className="text-ink-secondary/40"> · </span>
          <span className="text-ink-secondary">price &amp; target fill from the broker-research aggregator as it’s pulled</span>
        </span>
      </div>

      {/* Customize View — tap × on a company block or a column header to hide it;
          restore from the tray. */}
      <CustomizeBar
        chips={chips}
        onRestore={restore}
        onRestoreAll={view.restoreAll}
        onSave={view.save}
        onReset={view.reset}
        dirty={view.dirty}
        customized={view.customized}
        hasSaved={view.hasSaved}
      />

      {blocks.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center">
          {companyFilter !== 'all' ? (
            <>
              <p className="text-[12.5px] text-ink-secondary">
                <span className="font-semibold text-navy-deep">{companyShortName(companyFilter)}</span> has no broker coverage on this sheet.
              </p>
              {onClearCompany && (
                <button
                  type="button"
                  onClick={onClearCompany}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-3 py-1 text-[11px] font-medium text-navy-primary shadow-soft transition-colors hover:border-navy-primary/30"
                >
                  <Building2 className="h-3.5 w-3.5" /> Show all companies
                </button>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-ink-secondary">
              Every company is hidden — restore one from the <span className="font-semibold text-navy-primary">Hidden</span> tray above.
            </p>
          )}
        </div>
      ) : (
        <div className={selected ? 'grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]' : ''}>
          {table}
          {selected && (
            <div className="lg:sticky lg:top-2 lg:self-start">
              <Detail cell={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
