import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ExternalLink, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import priceHistory from '@/data/snapshots/price-history-snapshot.json'

// ---------------------------------------------------------------------------
//  Historical Stock Movement — the dashboard mirror of the workbook's
//  "Historical Stock Movement" tab (NIVABUPA on NSE): the daily Close / Total
//  Quantity / Deliverable Quantity / % Delivered series, a monthly roll-up, and
//  the period average — exactly the two tables the Excel prints, warmed into a
//  compact, decision-grade surface with a price + volume chart on top.
//
//  SOURCES (honest, per CLAUDE.md):
//   • Close + Total Quantity (volume): the workbook seed (NSE via S&P Capital IQ)
//     for listing→Jul-2025, then Yahoo Finance keeps it current going forward.
//   • Deliverable Quantity / % Delivered: an NSE-only field. Real where the
//     workbook (or a staged NSE file) carries it; an honest "n/a" — never 0 —
//     on days only Yahoo covers, until an NSE delivery file is staged.
//
//  Read-only. Numbers come straight from the committed snapshot, which the daily
//  Yahoo pipeline refreshes — so this tab updates itself as time goes forward.
// ---------------------------------------------------------------------------

const FOCAL = 'niva-bupa'
const FOCAL_LABEL = 'Niva Bupa Health Insurance'
const YAHOO_URL = 'https://finance.yahoo.com/quote/NIVABUPA.NS/history/'

interface RawRow {
  company_id: string
  date: string
  close: number | null
  traded_qty: number | null
  deliverable_qty: number | null
  provenance?: { source_name?: string; confidence?: string }
}
interface Snapshot {
  _meta?: { last_updated?: string; coverage?: { from: string; to: string } | null }
  data: RawRow[]
}

const SNAP = priceHistory as unknown as Snapshot

// ── formatters ──────────────────────────────────────────────────────────────
const inr = (v: number | null) =>
  v == null ? '—' : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const qty = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('en-IN'))
const pctOf = (deliv: number | null, traded: number | null) =>
  deliv == null || !traded ? null : deliv / traded
const pctStr = (f: number | null) =>
  f == null ? null : `${(f * 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
const fmtMonth = (ym: string) =>
  new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const compact = (v: number | null) =>
  v == null ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v.toLocaleString('en-IN')

// An honest "not available from this source" marker — never a fake 0.
function NA({ title }: { title: string }) {
  return (
    <span className="italic text-ink-secondary/60" title={title}>
      n/a
    </span>
  )
}

interface DailyRow extends RawRow {
  deliPct: number | null
}
interface MonthRow {
  ym: string
  close: number | null
  shares: number | null
  deliverable: number | null
  deliPct: number | null
  hasBlock: boolean
}

export function HistoricalStockMovement() {
  const model = useMemo(() => {
    const rows: DailyRow[] = SNAP.data
      .filter((r) => r.company_id === FOCAL && r.close != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, deliPct: pctOf(r.deliverable_qty, r.traded_qty) }))

    // Period average — close & volume over every session; deliverable & %
    // delivered over the sessions where delivery is actually known (never
    // counting a missing day as zero).
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
    const closes = rows.map((r) => r.close).filter((v): v is number => v != null)
    const trades = rows.map((r) => r.traded_qty).filter((v): v is number => v != null)
    const delivs = rows.map((r) => r.deliverable_qty).filter((v): v is number => v != null)
    const delivPcts = rows.map((r) => r.deliPct).filter((v): v is number => v != null)
    const average = {
      close: mean(closes),
      traded: mean(trades),
      deliverable: mean(delivs),
      deliPct: mean(delivPcts),
    }

    // Monthly roll-up — month-end close, summed volume & deliverable (over known
    // days), recomputed % delivered. A one-off block trade is flagged.
    const BLOCK_THRESHOLD = 50_000_000
    const byMonth = new Map<string, DailyRow[]>()
    for (const r of rows) {
      const ym = r.date.slice(0, 7)
      ;(byMonth.get(ym) ?? byMonth.set(ym, []).get(ym)!).push(r)
    }
    const monthly: MonthRow[] = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, ds]) => {
        const ordered = ds.sort((a, b) => a.date.localeCompare(b.date))
        const knownDeliv = ordered.filter((d) => d.deliverable_qty != null)
        const shares = ordered.reduce((s, d) => s + (d.traded_qty ?? 0), 0) || null
        const deliverable = knownDeliv.length ? knownDeliv.reduce((s, d) => s + (d.deliverable_qty ?? 0), 0) : null
        return {
          ym,
          close: ordered[ordered.length - 1]?.close ?? null,
          shares,
          deliverable,
          deliPct: pctOf(deliverable, shares),
          hasBlock: ordered.some((d) => (d.traded_qty ?? 0) >= BLOCK_THRESHOLD),
        }
      })
      .reverse() // newest month first

    const chart = rows.map((r) => ({ date: r.date, close: r.close, volume: r.traded_qty }))
    const first = rows[0]
    const last = rows[rows.length - 1]
    const hi = closes.length ? Math.max(...closes) : null
    const lo = closes.length ? Math.min(...closes) : null
    const change = first?.close != null && last?.close != null ? last.close - first.close : null
    const changePct = change != null && first?.close ? change / first.close : null

    return { rows, average, monthly, chart, first, last, hi, lo, change, changePct }
  }, [])

  const dailyDesc = useMemo(() => [...model.rows].reverse(), [model.rows])
  const { last, first, hi, lo, change, changePct, average } = model
  const up = (change ?? 0) >= 0
  const lastUpdated = SNAP._meta?.last_updated?.slice(0, 10)
  const NA_TITLE = 'Deliverable quantity is an exchange-only field (NSE) — not carried by the daily price feeds (muns API / Yahoo). Fills when an NSE delivery file is staged.'

  if (!model.rows.length) {
    return (
      <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12px] text-ink-secondary">
        No price history in the snapshot yet — run <code className="font-mono">npm run ingest:price:yahoo</code>.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header: story + provenance + KPI rail ─────────────────────────── */}
      <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="leading-tight">
            <h2 className="font-display text-[16px] text-navy-deep">Historical Stock Movement · {FOCAL_LABEL}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-secondary">
              Daily close, traded &amp; delivered quantity on NSE (NIVABUPA), with a monthly roll-up — the workbook tab,
              live.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald/30 bg-emerald-soft px-2 py-0.5 text-[10px] font-semibold text-emerald">
              <RefreshCw className="h-2.5 w-2.5" /> Auto-refreshes daily
            </span>
            <a
              href={YAHOO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-ice/60 px-2 py-0.5 text-[10px] font-medium text-navy-primary hover:bg-ice"
            >
              Yahoo Finance <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>

        {/* KPI rail */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label={`Latest close · ${last ? fmtDate(last.date) : ''}`} value={inr(last?.close ?? null)} />
          <Kpi
            label="Since listing"
            value={changePct == null ? '—' : `${up ? '+' : ''}${(changePct * 100).toFixed(1)}%`}
            tone={up ? 'pos' : 'neg'}
            icon={up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          />
          <Kpi label="Period high" value={inr(hi)} />
          <Kpi label="Period low" value={inr(lo)} />
        </div>

        {/* Price + volume chart */}
        <div className="mt-3 h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={model.chart} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#EEF1F6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtDate(d).replace(/ \d{2}$/, '')}
                tick={{ fontSize: 9, fill: '#6B7280' }}
                tickLine={false}
                axisLine={{ stroke: '#E8EBF1' }}
                minTickGap={42}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                tick={{ fontSize: 9, fill: '#6B7280' }}
                tickLine={false}
                axisLine={false}
                width={38}
                domain={['dataMin - 2', 'dataMax + 2']}
                tickFormatter={(v: number) => `₹${v.toFixed(0)}`}
              />
              <YAxis yAxisId="vol" orientation="left" hide domain={[0, (max: number) => max * 4]} />
              <Tooltip
                cursor={{ stroke: '#C7CFDD', strokeWidth: 1 }}
                contentStyle={{ borderRadius: 10, border: '1px solid #E8EBF1', fontSize: 11, boxShadow: '0 6px 18px rgba(23,43,77,0.08)' }}
                labelFormatter={(d: string) => fmtDate(d)}
                formatter={(val: number, name: string) =>
                  name === 'close' ? [inr(val), 'Close'] : [compact(val), 'Volume']
                }
              />
              <Bar yAxisId="vol" dataKey="volume" fill="#D7E0F0" radius={[1.5, 1.5, 0, 0]} maxBarSize={5} isAnimationActive={false} />
              <Line yAxisId="price" type="monotone" dataKey="close" stroke="#27457E" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-ink-secondary/80">
          <span className="font-semibold text-ink-secondary">Source ·</span> Close &amp; volume — workbook (listing→Jul 2025),
          then the muns market-data API &amp; Yahoo Finance keep it current{lastUpdated ? `, last refreshed ${lastUpdated}` : ''}.
          Delivery — NSE via the workbook; shown <span className="italic">n/a</span> on days only a price feed covers (price
          feeds carry no delivery figures), never 0.
        </p>
      </div>

      {/* ── The two tables, side by side like the workbook ────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* Daily */}
        <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-soft-border bg-[#F3F6FB] px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-navy-primary">Daily</span>
            <span className="text-[10px] tabular-nums text-ink-secondary">
              {model.rows.length} sessions · {first ? fmtDate(first.date) : ''} → {last ? fmtDate(last.date) : ''}
            </span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
            <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F8FAFD]">
                  <Th className="text-left">Date</Th>
                  <Th>Close</Th>
                  <Th>Total Qty</Th>
                  <Th>Deliv. Qty</Th>
                  <Th>% Deliv.</Th>
                </tr>
              </thead>
              <tbody>
                {dailyDesc.map((r) => (
                  <tr key={r.date} className="group">
                    <Td className="text-left font-medium text-navy-deep">{fmtDate(r.date)}</Td>
                    <Td className="font-semibold tabular-nums text-navy-deep">{inr(r.close)}</Td>
                    <Td className="tabular-nums text-ink-primary">{qty(r.traded_qty) ?? <NA title="No volume on this session." />}</Td>
                    <Td className="tabular-nums text-ink-primary">{qty(r.deliverable_qty) ?? <NA title={NA_TITLE} />}</Td>
                    <Td className="tabular-nums">{pctStr(r.deliPct) ? <DeliBadge pct={r.deliPct!} /> : <NA title={NA_TITLE} />}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-navy-primary/[0.06]">
                  <Td className="text-left text-[10.5px] font-bold uppercase tracking-wide text-navy-primary">Average</Td>
                  <Td className="font-semibold tabular-nums text-navy-deep">{inr(average.close)}</Td>
                  <Td className="tabular-nums text-ink-primary">{qty(average.traded)}</Td>
                  <Td className="tabular-nums text-ink-primary">{qty(average.deliverable)}</Td>
                  <Td className="tabular-nums font-semibold text-navy-deep">{pctStr(average.deliPct) ?? '—'}</Td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Monthly */}
        <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-soft-border bg-[#F3F6FB] px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-navy-primary">Monthly</span>
            <span className="text-[10px] text-ink-secondary">month-end close · summed volume</span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
            <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F8FAFD]">
                  <Th className="text-left">Month</Th>
                  <Th>Close</Th>
                  <Th>Shares</Th>
                  <Th>Deliv.</Th>
                  <Th>% Deliv.</Th>
                </tr>
              </thead>
              <tbody>
                {model.monthly.map((m) => (
                  <tr key={m.ym}>
                    <Td className="text-left font-medium text-navy-deep">
                      {fmtMonth(m.ym)}
                      {m.hasBlock && (
                        <span
                          className="ml-1 align-middle text-[9px] font-semibold text-gold"
                          title="Includes a one-off bulk/block trade (≥5 cr shares) — the actual total, not a typical month."
                        >
                          ◆
                        </span>
                      )}
                    </Td>
                    <Td className="font-semibold tabular-nums text-navy-deep">{inr(m.close)}</Td>
                    <Td className="tabular-nums text-ink-primary" title={m.shares != null ? Math.round(m.shares).toLocaleString('en-IN') : ''}>
                      {compact(m.shares)}
                    </Td>
                    <Td className="tabular-nums text-ink-primary" title={m.deliverable != null ? Math.round(m.deliverable).toLocaleString('en-IN') : ''}>
                      {m.deliverable == null ? <NA title={NA_TITLE} /> : compact(m.deliverable)}
                    </Td>
                    <Td className="tabular-nums">{m.deliPct == null ? <NA title={NA_TITLE} /> : <DeliBadge pct={m.deliPct} />}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-soft-border px-3 py-2 text-[10px] leading-snug text-ink-secondary">
            <span className="text-gold">◆</span> June 2025 carries a one-off 23.6 cr-share block trade (2 Jun) — shown as the
            actual total (the workbook flags the same as “Actual Jun-25”).
          </div>
        </div>
      </div>
    </div>
  )
}

// ── small presentational pieces ──────────────────────────────────────────────
function Kpi({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone?: 'pos' | 'neg'
  icon?: React.ReactNode
}) {
  const color = tone === 'pos' ? 'text-emerald' : tone === 'neg' ? 'text-coral' : 'text-navy-deep'
  return (
    <div className="rounded-lg border border-soft-border bg-ice/40 px-2.5 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">{label}</p>
      <p className={`mt-0.5 flex items-center gap-1 font-display text-[15px] tabular-nums ${color}`}>
        {icon}
        {value}
      </p>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-soft-border px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-ink-secondary ${className || 'text-right'}`}
    >
      {children}
    </th>
  )
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={`border-b border-soft-border/60 px-2.5 py-[5px] text-[11px] group-hover:bg-ice/50 ${className || 'text-right'}`}>
      {children}
    </td>
  )
}

// % delivered, tinted by conviction (higher delivery = more genuine ownership).
function DeliBadge({ pct }: { pct: number }) {
  const tone =
    pct >= 0.6 ? 'text-emerald' : pct >= 0.4 ? 'text-navy-primary' : 'text-gold'
  return <span className={`font-semibold ${tone}`}>{pctStr(pct)}</span>
}
