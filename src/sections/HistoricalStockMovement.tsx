import { useMemo, useState } from 'react'
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
import { Building2, ExternalLink, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import priceHistory from '@/data/snapshots/price-history-snapshot.json'
import { companyShortName } from '@/lib/companyColors'
import { ColumnToggle, useColumnVisibility, type ColumnDef } from '@/components/ColumnToggle'

// ---------------------------------------------------------------------------
//  Historical Stock Movement — the dashboard mirror of the workbook's
//  "Historical Stock Movement" tab (NIVABUPA on NSE): the daily Close / Total
//  Quantity / Deliverable Quantity / % Delivered series, with a selectable
//  Weekly / Monthly / Yearly AVERAGE view — the average shown both as a trend
//  over time and as a compact roll-up table beside the daily detail.
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
//  Averages are computed live from the daily series; a missing day is never
//  counted as zero.
// ---------------------------------------------------------------------------

const FOCAL = 'niva-bupa'
const FOCAL_LABEL = 'Niva Bupa Health Insurance'
const YAHOO_URL = 'https://finance.yahoo.com/quote/NIVABUPA.NS/history/'
const BLOCK_THRESHOLD = 50_000_000

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
const shortMonth = (ym: string) =>
  new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const compact = (v: number | null) =>
  v == null ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v.toLocaleString('en-IN')

// Monday of the week containing this date (ISO week start), as YYYY-MM-DD.
function weekStart(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

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

// ── Average buckets (week / month / year) ────────────────────────────────────
type Granularity = 'week' | 'month' | 'year'
const GRAN_LABEL: Record<Granularity, string> = { week: 'Weekly', month: 'Monthly', year: 'Yearly' }

interface Bucket {
  key: string
  label: string // full label for the table
  short: string // compact label for the chart axis
  avgClose: number | null
  avgVolume: number | null
  avgDelivPct: number | null
  sessions: number
  hasBlock: boolean
}

function bucketize(rows: DailyRow[], g: Granularity): Bucket[] {
  const keyOf = (d: string) => (g === 'year' ? d.slice(0, 4) : g === 'month' ? d.slice(0, 7) : weekStart(d))
  const map = new Map<string, DailyRow[]>()
  for (const r of rows) {
    const k = keyOf(r.date)
    ;(map.get(k) ?? map.set(k, []).get(k)!).push(r)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, ds]) => {
      const closes = ds.map((d) => d.close).filter((v): v is number => v != null)
      const vols = ds.map((d) => d.traded_qty).filter((v): v is number => v != null)
      const dps = ds.map((d) => d.deliPct).filter((v): v is number => v != null)
      return {
        key: k,
        label: g === 'year' ? k : g === 'month' ? fmtMonth(k) : `w/c ${fmtDate(k)}`,
        short: g === 'year' ? k : g === 'month' ? shortMonth(k) : fmtDate(k).replace(/ \d{2}$/, ''),
        avgClose: mean(closes),
        avgVolume: mean(vols),
        avgDelivPct: mean(dps),
        sessions: ds.length,
        hasBlock: ds.some((d) => (d.traded_qty ?? 0) >= BLOCK_THRESHOLD),
      }
    })
}

// Daily-table columns (hide/show). Date is locked — it's the row key.
const DAILY_COLS: ColumnDef[] = [
  { key: 'date', label: 'Date', locked: true },
  { key: 'close', label: 'Close' },
  { key: 'traded', label: 'Total Qty' },
  { key: 'deliv', label: 'Deliv. Qty' },
  { key: 'delivpct', label: '% Deliv.' },
]

export function HistoricalStockMovement({
  companyFilter = 'all',
  onClearCompany,
}: {
  companyFilter?: string
  onClearCompany?: () => void
} = {}) {
  const [gran, setGran] = useState<Granularity>('month')
  const { hidden, toggle, showAll } = useColumnVisibility()
  const vis = (key: string) => !hidden.has(key)

  const model = useMemo(() => {
    const rows: DailyRow[] = SNAP.data
      .filter((r) => r.company_id === FOCAL && r.close != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, deliPct: pctOf(r.deliverable_qty, r.traded_qty) }))

    // Period average — close & volume over every session; deliverable & %
    // delivered over the sessions where delivery is actually known (never
    // counting a missing day as zero).
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

    const chart = rows.map((r) => ({ date: r.date, close: r.close, volume: r.traded_qty }))
    const first = rows[0]
    const last = rows[rows.length - 1]
    const hi = closes.length ? Math.max(...closes) : null
    const lo = closes.length ? Math.min(...closes) : null
    const change = first?.close != null && last?.close != null ? last.close - first.close : null
    const changePct = change != null && first?.close ? change / first.close : null

    return { rows, average, chart, first, last, hi, lo, change, changePct }
  }, [])

  // The selected-average roll-up (computed live; ascending for the trend chart,
  // newest-first for the table).
  const buckets = useMemo(() => bucketize(model.rows, gran), [model.rows, gran])
  const trend = useMemo(
    () => buckets.map((b) => ({ short: b.short, label: b.label, avgClose: b.avgClose, avgVolume: b.avgVolume })),
    [buckets],
  )
  const bucketsDesc = useMemo(() => [...buckets].reverse(), [buckets])
  const dailyDesc = useMemo(() => [...model.rows].reverse(), [model.rows])

  const { last, first, hi, lo, change, changePct, average } = model
  const up = (change ?? 0) >= 0
  const lastUpdated = SNAP._meta?.last_updated?.slice(0, 10)
  const NA_TITLE = 'Deliverable quantity is an exchange-only field (NSE) — not carried by the daily price feeds (muns API / Yahoo). Fills when an NSE delivery file is staged.'

  // The whole tab is Niva Bupa only (the workbook tab is NIVABUPA on NSE). If the
  // company filter points at another insurer, say so honestly rather than
  // pretending this is their data.
  if (companyFilter !== 'all' && companyFilter !== FOCAL) {
    return (
      <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center">
        <p className="text-[12.5px] text-ink-secondary">
          Historical stock movement is tracked for <span className="font-semibold text-navy-deep">Niva Bupa</span> only on this sheet
          {companyFilter ? <> — not <span className="font-semibold text-navy-deep">{companyShortName(companyFilter)}</span></> : null}.
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
      </div>
    )
  }

  if (!model.rows.length) {
    return (
      <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12px] text-ink-secondary">
        No price history in the snapshot yet — run <code className="font-mono">npm run ingest:price:yahoo</code>.
      </div>
    )
  }

  const latestBucket = bucketsDesc[0]
  const priorBucket = bucketsDesc[1]
  const bucketDelta =
    latestBucket?.avgClose != null && priorBucket?.avgClose != null ? latestBucket.avgClose - priorBucket.avgClose : null

  return (
    <div className="space-y-4">
      {/* ── Header: story + provenance + KPI rail + daily chart ──────────────── */}
      <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="leading-tight">
            <h2 className="font-display text-[16px] text-navy-deep">Historical Stock Movement · {FOCAL_LABEL}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-secondary">
              Daily close, traded &amp; delivered quantity on NSE (NIVABUPA), with weekly / monthly / yearly averages — the
              workbook tab, live.
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

        {/* Daily price + volume chart */}
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
          Delivery — NSE (workbook history + the daily NSE delivery file); shown <span className="italic">n/a</span> only if a
          day's file isn't out yet, never 0.
        </p>
      </div>

      {/* ── Average trend — the selected average, seen over time ─────────────── */}
      <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="leading-tight">
            <h3 className="font-display text-[14.5px] text-navy-deep">{GRAN_LABEL[gran]} average trend</h3>
            <p className="mt-0.5 text-[11px] text-ink-secondary">
              Average close per {gran}, with average traded volume — the daily series rolled up to the period you choose.
            </p>
          </div>
          <GranularitySelect value={gran} onChange={setGran} />
        </div>

        {/* Mini stat strip — latest period average + move vs the period before. */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label={`Latest ${gran} · ${latestBucket?.label ?? ''}`} value={inr(latestBucket?.avgClose ?? null)} />
          <Kpi
            label={`vs prior ${gran}`}
            value={bucketDelta == null ? '—' : `${bucketDelta >= 0 ? '+' : '−'}${inr(Math.abs(bucketDelta))}`}
            tone={bucketDelta == null ? undefined : bucketDelta >= 0 ? 'pos' : 'neg'}
            icon={bucketDelta == null ? undefined : bucketDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          />
          <Kpi label={`${GRAN_LABEL[gran]} buckets`} value={buckets.length.toString()} />
          <Kpi label="Avg volume · latest" value={compact(latestBucket?.avgVolume ?? null)} />
        </div>

        {/* Average trend chart */}
        <div className="mt-3 h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#EEF1F6" vertical={false} />
              <XAxis
                dataKey="short"
                tick={{ fontSize: 9, fill: '#6B7280' }}
                tickLine={false}
                axisLine={{ stroke: '#E8EBF1' }}
                minTickGap={gran === 'week' ? 28 : 8}
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
                cursor={{ fill: 'rgba(39,69,126,0.05)' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #E8EBF1', fontSize: 11, boxShadow: '0 6px 18px rgba(23,43,77,0.08)' }}
                labelFormatter={(_label, payload) => (payload && payload.length ? (payload[0].payload as { label: string }).label : '')}
                formatter={(val: number, name: string) =>
                  name === 'avgClose' ? [inr(val), 'Avg close'] : [compact(val), 'Avg volume']
                }
              />
              <Bar yAxisId="vol" dataKey="avgVolume" fill="#DCE6D7" radius={[1.5, 1.5, 0, 0]} maxBarSize={gran === 'year' ? 40 : 14} isAnimationActive={false} />
              <Line yAxisId="price" type="monotone" dataKey="avgClose" stroke="#168E8E" strokeWidth={1.8} dot={gran === 'year' ? { r: 2.5, fill: '#168E8E' } : false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-ink-secondary/80">
          Average close (teal line) &amp; average traded volume (bars) per {gran}, computed from the daily series — a missing
          day is never counted as zero.
        </p>
      </div>

      {/* ── The two tables, aligned side by side ─────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* Daily */}
        <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-soft">
          <div className="flex items-center justify-between gap-2 border-b border-soft-border bg-[#F3F6FB] px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-navy-primary">Daily</span>
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] tabular-nums text-ink-secondary sm:inline">
                {model.rows.length} sessions · {first ? fmtDate(first.date) : ''} → {last ? fmtDate(last.date) : ''}
              </span>
              <ColumnToggle columns={DAILY_COLS} hidden={hidden} onToggle={toggle} onShowAll={showAll} />
            </div>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
            <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F8FAFD]">
                  <Th className="text-left">Date</Th>
                  {vis('close') && <Th>Close</Th>}
                  {vis('traded') && <Th>Total Qty</Th>}
                  {vis('deliv') && <Th>Deliv. Qty</Th>}
                  {vis('delivpct') && <Th>% Deliv.</Th>}
                </tr>
                {/* Period average — pinned at the top, just under the column
                    labels (the all-sessions mean). Solid tint so the daily rows
                    scrolling beneath don't bleed through. */}
                <tr className="bg-[#F2F4F7]">
                  <Td className="border-b border-soft-border text-left text-[10.5px] font-bold uppercase tracking-wide text-navy-primary">Average</Td>
                  {vis('close') && <Td className="border-b border-soft-border font-semibold tabular-nums text-navy-deep">{inr(average.close)}</Td>}
                  {vis('traded') && <Td className="border-b border-soft-border tabular-nums text-ink-primary">{qty(average.traded)}</Td>}
                  {vis('deliv') && <Td className="border-b border-soft-border tabular-nums text-ink-primary">{qty(average.deliverable)}</Td>}
                  {vis('delivpct') && <Td className="border-b border-soft-border tabular-nums font-semibold text-navy-deep">{pctStr(average.deliPct) ?? '—'}</Td>}
                </tr>
              </thead>
              <tbody>
                {dailyDesc.map((r) => (
                  <tr key={r.date} className="group">
                    <Td className="text-left font-medium text-navy-deep">{fmtDate(r.date)}</Td>
                    {vis('close') && <Td className="font-semibold tabular-nums text-navy-deep">{inr(r.close)}</Td>}
                    {vis('traded') && <Td className="tabular-nums text-ink-primary">{qty(r.traded_qty) ?? <NA title="No volume on this session." />}</Td>}
                    {vis('deliv') && <Td className="tabular-nums text-ink-primary">{qty(r.deliverable_qty) ?? <NA title={NA_TITLE} />}</Td>}
                    {vis('delivpct') && <Td className="tabular-nums">{pctStr(r.deliPct) ? <DeliBadge pct={r.deliPct!} /> : <NA title={NA_TITLE} />}</Td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected average roll-up (Weekly / Monthly / Yearly) */}
        <div className="overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-soft-border bg-[#F3F6FB] px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-navy-primary">{GRAN_LABEL[gran]} average</span>
            <span className="text-[10px] text-ink-secondary">{buckets.length} periods · avg of daily</span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
            <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F8FAFD]">
                  <Th className="text-left">{gran === 'week' ? 'Week of' : gran === 'month' ? 'Month' : 'Year'}</Th>
                  <Th>Avg close</Th>
                  <Th>Avg vol</Th>
                  <Th>Avg % deliv.</Th>
                </tr>
              </thead>
              <tbody>
                {bucketsDesc.map((b) => (
                  <tr key={b.key} className="group">
                    <Td className="text-left font-medium text-navy-deep">
                      {b.label}
                      {b.hasBlock && (
                        <span
                          className="ml-1 align-middle text-[9px] font-semibold text-gold"
                          title="Includes a one-off bulk/block trade (≥5 cr shares) — lifts the average volume for this period."
                        >
                          ◆
                        </span>
                      )}
                      <span className="ml-1 text-[9px] text-ink-secondary/70" title="Trading sessions in this period">· {b.sessions}d</span>
                    </Td>
                    <Td className="font-semibold tabular-nums text-navy-deep">{inr(b.avgClose)}</Td>
                    <Td className="tabular-nums text-ink-primary" title={b.avgVolume != null ? Math.round(b.avgVolume).toLocaleString('en-IN') : ''}>
                      {compact(b.avgVolume)}
                    </Td>
                    <Td className="tabular-nums">{b.avgDelivPct == null ? <NA title={NA_TITLE} /> : <DeliBadge pct={b.avgDelivPct} />}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-soft-border px-3 py-2 text-[10px] leading-snug text-ink-secondary">
            <span className="text-gold">◆</span> marks a period that includes a one-off bulk/block trade — it lifts that
            period's average volume, so read it as the actual average, not a typical one.
          </div>
        </div>
      </div>
    </div>
  )
}

// ── small presentational pieces ──────────────────────────────────────────────
function GranularitySelect({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
      <span className="font-semibold uppercase tracking-wide">Average</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Granularity)}
        className="rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] font-medium text-navy-deep shadow-soft transition-colors hover:border-navy-primary/30 focus:outline-none focus:ring-1 focus:ring-muted-blue"
      >
        <option value="week">Weekly</option>
        <option value="month">Monthly</option>
        <option value="year">Yearly</option>
      </select>
    </label>
  )
}

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
      <p className="truncate text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-secondary" title={label}>{label}</p>
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
