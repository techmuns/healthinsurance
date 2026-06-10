import { useMemo, useState } from 'react'
import { CalendarDays, ExternalLink, Newspaper, Search } from 'lucide-react'
import { VerdictStrip } from '@/components/VerdictStrip'
import { SectionHeading } from '@/components/SectionHeading'
import { SourceTag } from '@/components/SourceTag'
import {
  sectoralNews,
  sectoralNewsMeta,
  SECTORAL_CATEGORY_META,
  SECTORAL_CATEGORY_ORDER,
  type SectoralCategory,
  type SectoralNewsItem,
} from '@/data/sectoralNews'

// ---------------------------------------------------------------------------
//  Key Sectoral News — a calm, tone-coded briefing of the standalone-health
//  sector's moving parts. Answer-first verdict → "shape of the news" infographic
//  (what themes dominate + when activity clustered) → a filterable, searchable,
//  month-grouped feed where every update links its original article.
//
//  This is a curated, point-in-time pack sourced from the investor portfolio
//  review (NOT a live feed) — labelled honestly throughout.
// ---------------------------------------------------------------------------

type Lens = SectoralCategory | 'all'

const NAVY = '#27457E'

function fmtFull(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtMonth(key: string): string {
  // key is yyyy-mm or yyyy-mm-dd
  const d = new Date(`${key.slice(0, 7)}-01T00:00:00`)
  if (isNaN(d.getTime())) return key
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}
function monthKey(iso: string): string {
  return iso.slice(0, 7)
}
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
/** Inclusive list of yyyy-mm keys from the first to the last update. */
function monthsBetween(startISO: string, endISO: string): string[] {
  const out: string[] = []
  let y = +startISO.slice(0, 4)
  let m = +startISO.slice(5, 7)
  const ey = +endISO.slice(0, 4)
  const em = +endISO.slice(5, 7)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export function SectoralNews() {
  const [lens, setLens] = useState<Lens>('all')
  const [query, setQuery] = useState('')

  const total = sectoralNews.length

  // Per-theme counts (kept in the canonical display order).
  const counts = useMemo(() => {
    const c = Object.fromEntries(SECTORAL_CATEGORY_ORDER.map((k) => [k, 0])) as Record<SectoralCategory, number>
    for (const n of sectoralNews) c[n.category] += 1
    return c
  }, [])
  const dominant = SECTORAL_CATEGORY_ORDER[0]
  // Share of the feed taken by the two structural themes (consolidation + reform).
  const structuralShare = Math.round(((counts['Competition / Peers'] + counts.Regulatory) / total) * 100)

  // Monthly volume histogram — the "when" of the story.
  const months = useMemo(() => monthsBetween(sectoralNewsMeta.span_start, sectoralNewsMeta.span_end), [])
  const monthCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const n of sectoralNews) m[monthKey(n.date)] = (m[monthKey(n.date)] ?? 0) + 1
    return m
  }, [])
  const maxMonth = Math.max(1, ...months.map((m) => monthCounts[m] ?? 0))
  const peakKey = months.reduce((a, b) => ((monthCounts[b] ?? 0) > (monthCounts[a] ?? 0) ? b : a), months[0])

  const windowLabel = `${fmtMonth(sectoralNewsMeta.span_start)} – ${fmtMonth(sectoralNewsMeta.span_end)}`

  // Filter (theme + free-text) then sort newest-first.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sectoralNews
      .filter((n) => (lens === 'all' ? true : n.category === lens))
      .filter((n) =>
        q === ''
          ? true
          : n.subject.toLowerCase().includes(q) ||
            n.summary.toLowerCase().includes(q) ||
            n.category.toLowerCase().includes(q),
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sn - a.sn))
  }, [lens, query])

  // Group the visible feed by month for an editorial timeline rhythm.
  const groups = useMemo(() => {
    const map = new Map<string, SectoralNewsItem[]>()
    for (const n of filtered) {
      const k = monthKey(n.date)
      const arr = map.get(k)
      if (arr) arr.push(n)
      else map.set(k, [n])
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="space-y-6">
      {/* ── Answer-first verdict ─────────────────────────────────────────── */}
      <VerdictStrip
        eyebrow={`Sector Pulse · ${windowLabel}`}
        verdict="Reform meets a land-grab"
        tone="navy"
        badge={`${total} updates`}
        summary={
          <>
            Two forces are reshaping standalone health: a wave of{' '}
            <b className="font-semibold text-navy-deep">competitive moves</b> — new entrants, JVs and leadership churn (
            {counts['Competition / Peers']}) — and sweeping{' '}
            <b className="font-semibold text-navy-deep">regulatory reform</b> — 100% FDI, composite licences, Ind AS and
            consumer-first rules ({counts.Regulatory}). GST relief and rising medical costs round out the rest.
          </>
        }
        stats={[
          { label: 'Tracked', value: String(total) },
          { label: 'Themes', value: String(SECTORAL_CATEGORY_ORDER.length) },
          { label: 'Most active', value: SECTORAL_CATEGORY_META[dominant].short },
        ]}
        source="Portfolio pack"
        sourcePeriod={windowLabel}
        sourceFrequency="Event-based"
        sourceStatus="available"
        sourceConfidence="medium"
        sourceProvenance={{ source_name: sectoralNewsMeta.source_name }}
      />

      {/* ── "Shape of the news" — what dominates (left) + when it clustered (right) ── */}
      <section className="card-surface p-5">
        <SectionHeading eyebrow="The shape of the news" title="What's the sector talking about?" note={windowLabel} />
        <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          {/* WHAT — theme mix */}
          <div>
            <div className="flex h-3.5 w-full overflow-hidden rounded-full ring-1 ring-soft-border">
              {SECTORAL_CATEGORY_ORDER.map((c) => {
                const meta = SECTORAL_CATEGORY_META[c]
                const w = (counts[c] / total) * 100
                const on = lens === 'all' || lens === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLens((p) => (p === c ? 'all' : c))}
                    title={`${meta.label}: ${counts[c]} of ${total} (${Math.round(w)}%)`}
                    aria-label={`Filter by ${meta.label}`}
                    className="h-full transition-opacity duration-200"
                    style={{ width: `${w}%`, background: meta.color, opacity: on ? 1 : 0.32 }}
                  />
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {SECTORAL_CATEGORY_ORDER.map((c) => {
                const meta = SECTORAL_CATEGORY_META[c]
                return (
                  <span key={c} className="inline-flex items-baseline gap-1.5 text-[11px]">
                    <span className="h-2.5 w-2.5 translate-y-[1px] rounded-[3px]" style={{ background: meta.color }} />
                    <span className="text-ink-secondary">{meta.short}</span>
                    <span className="font-semibold tabular-nums text-navy-deep">{counts[c]}</span>
                    <span className="text-ink-secondary/55">·</span>
                    <span className="tabular-nums text-ink-secondary/70">{Math.round((counts[c] / total) * 100)}%</span>
                  </span>
                )
              })}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
              <b className="font-semibold text-navy-deep">{structuralShare}%</b> of updates are Competition or Regulatory —
              the sector is consolidating and re-regulating at once. Tap a band to filter the feed.
            </p>
          </div>

          {/* WHEN — monthly flow */}
          <div className="lg:border-l lg:border-soft-border lg:pl-6">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">News flow by month</p>
            <div className="flex h-16 items-end gap-[3px]">
              {months.map((m) => {
                const c = monthCounts[m] ?? 0
                const pct = c === 0 ? 0 : Math.max(14, Math.round((c / maxMonth) * 100))
                const isPeak = c > 0 && c === maxMonth
                return (
                  <div
                    key={m}
                    className="flex h-full flex-1 items-end"
                    title={`${fmtMonth(m)} · ${c} update${c === 1 ? '' : 's'}`}
                  >
                    {c === 0 ? (
                      <div className="h-[2px] w-full rounded-full bg-soft-border" />
                    ) : (
                      <div
                        className="w-full rounded-t-sm transition-colors"
                        style={{ height: `${pct}%`, background: isPeak ? '#B68B3A' : NAVY }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[9.5px] text-ink-secondary/70">
              <span>{fmtMonth(months[0])}</span>
              <span>{fmtMonth(months[months.length - 1])}</span>
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-ink-secondary">
              Activity peaked in <b className="font-semibold text-navy-deep">{fmtMonth(peakKey)}</b>, around the Insurance
              Amendment Bill and IRDAI's consumer reforms.
            </p>
          </div>
        </div>
      </section>

      {/* ── Filter + search controls ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-soft-border bg-white/70 p-3 shadow-soft backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <LensChip label="All" count={total} color={NAVY} active={lens === 'all'} onClick={() => setLens('all')} />
          {SECTORAL_CATEGORY_ORDER.map((c) => {
            const meta = SECTORAL_CATEGORY_META[c]
            return (
              <LensChip
                key={c}
                label={meta.short}
                count={counts[c]}
                color={meta.color}
                active={lens === c}
                onClick={() => setLens((p) => (p === c ? 'all' : c))}
              />
            )
          })}
        </div>
        <div className="relative md:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search sector updates"
            placeholder="Search updates…"
            className="w-full rounded-full border border-soft-border bg-white/85 py-1.5 pl-8 pr-3 text-[12px] text-navy-deep outline-none transition-colors placeholder:text-ink-secondary/70 focus:border-navy-primary"
          />
        </div>
      </div>

      {/* ── Feed (month-grouped, newest first) ───────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-secondary">
          Showing <b className="font-semibold text-navy-deep">{filtered.length}</b> of {total} updates
          {lens !== 'all' && <> · {SECTORAL_CATEGORY_META[lens].label}</>}
        </p>
        {(lens !== 'all' || query) && (
          <button
            type="button"
            onClick={() => {
              setLens('all')
              setQuery('')
            }}
            className="text-[11px] font-semibold text-navy-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-soft-border bg-white/50 py-14 text-center">
          <Newspaper className="h-5 w-5 text-ink-secondary/60" />
          <p className="text-[13px] font-semibold text-navy-deep">No updates match your filter</p>
          <p className="text-[11.5px] text-ink-secondary">Try a different theme or clear the search.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([key, items]) => (
            <div key={key} className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="font-display text-[14px] text-navy-deep">{fmtMonth(key)}</span>
                <span className="h-px flex-1 bg-soft-border" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">
                  {items.length} update{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid gap-2.5">
                {items.map((n) => (
                  <NewsCard key={n.sn} item={n} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Honest provenance footer ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-soft-border pt-3">
        <p className="max-w-[60ch] text-[11px] leading-relaxed text-ink-secondary">
          Curated sector briefing from the investor portfolio pack — a point-in-time snapshot, not a live feed. Every
          update links its original article (Economic Times, Moneycontrol, Reuters and others).
        </p>
        <SourceTag
          source="Portfolio pack"
          period={windowLabel}
          frequency="Event-based"
          status="available"
          confidence="medium"
          provenance={{ source_name: sectoralNewsMeta.source_name }}
        />
      </div>
    </div>
  )
}

// ── Theme filter chip ────────────────────────────────────────────────────────
function LensChip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string
  count: number
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-200',
        active ? 'text-white shadow-soft' : 'bg-white text-ink-secondary ring-1 ring-soft-border hover:text-navy-primary',
      ].join(' ')}
      style={active ? { background: color } : undefined}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: active ? 'rgba(255,255,255,0.85)' : color }}
      />
      {label}
      <span className={`tabular-nums ${active ? 'text-white/80' : 'text-ink-secondary/60'}`}>{count}</span>
    </button>
  )
}

// ── Single update card ───────────────────────────────────────────────────────
function NewsCard({ item }: { item: SectoralNewsItem }) {
  const meta = SECTORAL_CATEGORY_META[item.category]
  const [open, setOpen] = useState(false)
  const long = item.summary.length > 230 || item.summary.includes('\n')
  const domain = domainOf(item.reference)

  return (
    <article className="group relative overflow-hidden rounded-xl border border-soft-border bg-card py-3 pl-4 pr-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-navy-primary/25 hover:shadow-card">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: meta.soft, color: meta.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
          {item.category}
        </span>
        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-secondary">
          <CalendarDays className="h-3 w-3" /> {fmtFull(item.date)}
        </span>
        <span className="ml-auto text-[10px] font-semibold tabular-nums text-ink-secondary/40">#{item.sn}</span>
      </div>

      <h4 className="mt-1.5 text-[13.5px] font-semibold leading-snug text-navy-deep">{item.subject}</h4>
      <p
        className={`mt-1 text-[12px] leading-relaxed text-ink-secondary ${
          !open && long ? 'line-clamp-3' : 'whitespace-pre-line'
        }`}
      >
        {item.summary}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[10.5px] font-semibold text-navy-primary hover:underline"
          >
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
        {item.reference && (
          <a
            href={item.reference}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-blue transition-colors hover:text-navy-primary hover:underline"
          >
            {domain ? `Read at ${domain}` : 'Read source'}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  )
}
