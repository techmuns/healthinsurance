import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Scale, Download,
  RotateCcw, Info, Loader2, FileDown, MousePointerClick, ArrowRight, Minus, Maximize2, X,
  History, Trash2,
} from 'lucide-react'
import {
  verifyWorkbook, downloadVerifyReport, VERIFY_META,
  type VerifyResult, type VerifyRow, type VerifyStatus,
} from '@/lib/excelVerify'
import {
  listHistory, addHistory, getHistoryBytes, removeHistory, clearHistory,
  formatSize, formatWhen, type HistoryEntry,
} from '@/lib/verifyHistory'
import { useVerify, type ListFilter } from '@/state/verifyState'

// ---------------------------------------------------------------------------
//  Excel Upload Verifier — a dedicated tool (separate from "Add a source").
//  Neha uploads her workbook; the dashboard reads it in the browser and checks
//  every cell against its OWN audited value, then lets her export the report.
//  Clicking a result row jumps to that exact cell in the Data Audit grid (via
//  the shared verify state); hovering a row previews the uploaded-vs-dashboard
//  detail. Colour psychology: green = match, amber = source/basis differs, red =
//  mismatch, grey = missing. Compact, Bloomberg-style surface.
// ---------------------------------------------------------------------------

const ACCEPT = '.xlsx,.xls,.csv'

// Filter buckets shown as chips. "missing" folds the two missing directions.
const inBucket = (status: VerifyStatus, key: ListFilter): boolean =>
  key === 'all' ? true : key === 'missing' ? status.startsWith('missing') : status === key

// ── Dockable shell ───────────────────────────────────────────────────────────
// A NON-blocking side panel (unlike the modal Drawer): no dimming backdrop and no
// page-scroll freeze, so the audit grid stays fully visible and usable on the
// left while the verifier sits docked on the right — letting a row and the cell
// it points to be read together. Minimise collapses it to a corner pill; close
// dismisses it. Portalled to <body> so the page-transition transform can't trap
// its fixed positioning.
function VerifierDock({
  title, subtitle, onMinimize, onClose, children,
}: { title: string; subtitle?: string; onMinimize: () => void; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (typeof document === 'undefined') return null
  return createPortal(
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden rounded-l-[28px] border-l border-soft-border bg-ivory shadow-lift outline-none animate-drawer-in"
      role="dialog"
      aria-label={title}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-soft-border bg-card px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg text-navy-deep">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-ink-secondary">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimise"
            title="Minimise — keep it open while you read the grid"
            className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close the verifier"
            className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </aside>,
    document.body,
  )
}

// The minimised state — a compact corner pill that keeps the verification alive
// and one tap from full view, while the grid is completely unobstructed.
function VerifierPill({ label, onRestore }: { label: string; onRestore: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <button
      type="button"
      onClick={onRestore}
      className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-[#9DB4D8] bg-gradient-to-br from-[#1E4079] to-[#143058] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_10px_30px_rgba(23,43,77,0.28)] transition-transform hover:-translate-y-0.5 animate-fade-in"
      title="Reopen the verifier"
    >
      <FileSpreadsheet className="h-4 w-4" />
      <span>{label}</span>
      <Maximize2 className="h-3.5 w-3.5 opacity-80" />
    </button>,
    document.body,
  )
}

// ── Upload zone (first screen) ───────────────────────────────────────────────
function UploadZone({ onPick, busy, onReopen }: { onPick: (f: File) => void; busy: boolean; onReopen: (e: HistoryEntry) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>(() => listHistory())
  const refresh = () => setHistory(listHistory())
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-ink-secondary">
        Upload your workbook and the dashboard checks it <span className="font-semibold text-navy-deep">cell by cell</span> against
        the numbers it already shows — flagging anything that doesn’t match, then letting you export the report.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) onPick(e.dataTransfer.files[0]) }}
        className={[
          'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-12 text-center transition-colors',
          dragOver ? 'border-navy-primary bg-soft-blue/50' : 'border-soft-border bg-ice/40 hover:border-navy-primary/40',
        ].join(' ')}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-soft-blue text-navy-primary">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
        </span>
        <span className="text-[13px] font-semibold text-navy-deep">{busy ? 'Checking your workbook…' : 'Drop your Excel here, or click to browse'}</span>
        <span className="text-[11px] text-ink-secondary">.xlsx, .xls or .csv — read in your browser, nothing is uploaded to a server</span>
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files?.[0]) onPick(e.target.files[0]); e.target.value = '' }} />

      {/* Recent uploads — reopen a past file with one click (re-checked live). */}
      {history.length > 0 && (
        <div className="rounded-xl border border-soft-border bg-card p-3 shadow-soft">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-secondary">
              <History className="h-3.5 w-3.5" /> Recent uploads
            </p>
            <button type="button" onClick={() => { clearHistory(); refresh() }} className="text-[10px] font-medium text-ink-secondary transition-colors hover:text-coral">
              Clear all
            </button>
          </div>
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 rounded-lg border border-soft-border bg-ivory/60 px-2.5 py-1.5">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-teal" />
                <button type="button" onClick={() => onReopen(h)} disabled={busy} title="Reopen and re-check this file" className="min-w-0 flex-1 text-left disabled:opacity-60">
                  <span className="block truncate text-[12px] font-medium text-navy-deep" title={h.name}>{h.name}</span>
                  <span className="block text-[10px] text-ink-secondary">{formatSize(h.size)} · {formatWhen(h.ts)}</span>
                </button>
                <button type="button" onClick={() => onReopen(h)} disabled={busy} title="Re-check against the latest dashboard figures" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-0.5 text-[10.5px] font-semibold text-navy-primary transition-colors hover:border-navy-primary/30 disabled:opacity-60">
                  <RotateCcw className="h-3 w-3" /> Re-check
                </button>
                <button type="button" onClick={() => { removeHistory(h.id); refresh() }} title="Remove from history" className="shrink-0 rounded-full p-1 text-ink-secondary/60 transition-colors hover:bg-coral-soft hover:text-coral">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-snug text-ink-secondary/80">
            Saved on this device only — nothing leaves your browser. Reopening re-checks the file against the latest dashboard figures.
          </p>
        </div>
      )}

      {/* Legend — the four honest outcomes, colour-coded. */}
      <div className="rounded-xl border border-soft-border bg-card p-4 shadow-soft">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-secondary">What the colours mean</p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            ['matched', 'The cell matches the dashboard.'],
            ['source_basis', 'Differs, but it’s a known source / accounting-basis difference — not an error.'],
            ['mismatch', 'The value genuinely differs from the dashboard.'],
            ['missing_upload', 'Present on one side, blank on the other.'],
          ] as [VerifyStatus, string][]).map(([s, desc]) => (
            <li key={s} className="flex items-start gap-2 text-[11.5px] text-ink-secondary">
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: VERIFY_META[s].dot }} />
              <span><span className="font-semibold text-navy-deep">{VERIFY_META[s].label}</span> — {desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Summary stat tile ────────────────────────────────────────────────────────
function Tile({ status, value, active, onClick }: { status: VerifyStatus; value: number; active: boolean; onClick: () => void }) {
  const m = VERIFY_META[status]
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-xl border border-soft-border bg-card p-4 text-left shadow-soft transition-all hover:brightness-[0.99]"
      style={active ? { boxShadow: `inset 0 0 0 2px ${m.dot}` } : undefined}
    >
      <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color: m.dot }}>
        <span className="h-2 w-2 rounded-full" style={{ background: m.dot }} />{m.label}
      </span>
      <span className="mt-1 font-display text-[26px] leading-none tabular-nums text-navy-deep">{value.toLocaleString('en-IN')}</span>
    </button>
  )
}

// ── Status pill (rows + detail) ──────────────────────────────────────────────
function StatusPill({ status }: { status: VerifyStatus }) {
  const m = VERIFY_META[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cell} ${m.text}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
    </span>
  )
}

// ── Results view ─────────────────────────────────────────────────────────────
function Results({ result }: { result: VerifyResult }) {
  const v = useVerify()
  const filter = v.listFilter
  const setFilter = v.setListFilter
  const s = result.summary
  const [sheetFilter, setSheetFilter] = useState<string>('all')

  // Rows after the status filter (All / Mismatched / Source-basis / …).
  const statusRows = useMemo(
    () => result.rows.filter((r) => inBucket(r.status, filter)),
    [result.rows, filter],
  )

  // The source tabs present in the current status view, in first-seen order with
  // counts — drives the "which tab" selector.
  const sheetTabs = useMemo(() => {
    const order: string[] = []
    const count = new Map<string, number>()
    for (const r of statusRows) {
      if (!count.has(r.sheet)) order.push(r.sheet)
      count.set(r.sheet, (count.get(r.sheet) ?? 0) + 1)
    }
    return order.map((sheet) => ({ sheet, count: count.get(sheet) ?? 0 }))
  }, [statusRows])

  // Keep the chosen tab valid if a status-filter change removed it.
  const activeSheet = sheetFilter !== 'all' && sheetTabs.some((t) => t.sheet === sheetFilter) ? sheetFilter : 'all'

  // Rows shown, grouped tab-by-tab (one block per source sheet).
  const groups = useMemo(() => {
    const visible = activeSheet === 'all' ? statusRows : statusRows.filter((r) => r.sheet === activeSheet)
    const order: string[] = []
    const bySheet = new Map<string, VerifyRow[]>()
    for (const r of visible) {
      if (!bySheet.has(r.sheet)) { order.push(r.sheet); bySheet.set(r.sheet, []) }
      bySheet.get(r.sheet)!.push(r)
    }
    return order.map((sheet) => ({ sheet, rows: bySheet.get(sheet)! }))
  }, [statusRows, activeSheet])
  const shownCount = groups.reduce((n, g) => n + g.rows.length, 0)

  const missingSheets = result.sheetMatch.filter((sm) => !sm.matchedTo)

  const chips: { key: ListFilter; label: string; count: number; dot?: string }[] = [
    { key: 'all', label: 'All', count: s.comparable },
    { key: 'mismatch', label: 'Mismatched', count: s.mismatch, dot: VERIFY_META.mismatch.dot },
    { key: 'source_basis', label: 'Source / basis', count: s.sourceBasis, dot: VERIFY_META.source_basis.dot },
    { key: 'missing', label: 'Missing', count: s.missing, dot: VERIFY_META.missing_upload.dot },
    { key: 'matched', label: 'Matched', count: s.matched, dot: VERIFY_META.matched.dot },
  ]

  return (
    <div className="space-y-4">
      {/* File + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-teal" />
          <span className="truncate text-[12.5px] font-semibold text-navy-deep" title={result.fileName}>{result.fileName}</span>
          <span className="shrink-0 text-[11px] text-ink-secondary">· {s.comparable.toLocaleString('en-IN')} cells checked</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => downloadVerifyReport(result, 'csv')} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[12px] font-medium text-ink-secondary shadow-soft transition-colors hover:border-navy-primary/30 hover:text-navy-primary">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button type="button" onClick={() => downloadVerifyReport(result, 'xlsx')} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[12px] font-medium text-ink-secondary shadow-soft transition-colors hover:border-navy-primary/30 hover:text-navy-primary">
            <FileDown className="h-3.5 w-3.5" /> Excel
          </button>
          <button type="button" onClick={() => v.setResult(null)} className="inline-flex items-center gap-1.5 rounded-full bg-navy-primary px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft transition-all hover:opacity-90">
            <RotateCcw className="h-3.5 w-3.5" /> New file
          </button>
        </div>
      </div>

      {/* Headline tiles — the four outcomes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile status="matched" value={s.matched} active={filter === 'matched'} onClick={() => setFilter(filter === 'matched' ? 'all' : 'matched')} />
        <Tile status="source_basis" value={s.sourceBasis} active={filter === 'source_basis'} onClick={() => setFilter(filter === 'source_basis' ? 'all' : 'source_basis')} />
        <Tile status="mismatch" value={s.mismatch} active={filter === 'mismatch'} onClick={() => setFilter(filter === 'mismatch' ? 'all' : 'mismatch')} />
        <Tile status="missing_upload" value={s.missing} active={filter === 'missing'} onClick={() => setFilter(filter === 'missing' ? 'all' : 'missing')} />
      </div>

      {/* Honest banner — clean pass, or the headline problem */}
      {s.mismatch === 0 ? (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-soft/50 px-3 py-2 text-[12px] text-emerald">
          <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
          <span>No value mismatches. {s.sourceBasis > 0 && <>{s.sourceBasis} cell{s.sourceBasis > 1 ? 's' : ''} differ on a known source / basis (amber) — expected, not errors. </>}{s.missing > 0 && <>{s.missing} cell{s.missing > 1 ? 's are' : ' is'} present on only one side.</>}</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-coral-soft/40 px-3 py-2 text-[12px] text-coral-deep">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
          <span><span className="font-semibold">{s.mismatch} cell{s.mismatch > 1 ? 's' : ''} don’t match</span> the dashboard. Open the <span className="font-semibold">Mismatched</span> tile to review each one.</span>
        </div>
      )}

      {/* Sheet coverage — honest about anything not found in the upload */}
      {missingSheets.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-soft-border bg-ice/50 px-3 py-2 text-[11.5px] text-ink-secondary">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-ink-secondary" />
          <span>Checked <span className="font-semibold text-navy-deep">{s.matchedSheets} of {s.templateSheets}</span> template tabs. Not found in your file: {missingSheets.map((m) => m.sheet).join(', ')}.</span>
        </div>
      )}

      {/* Jump hint — clicking a row highlights the cell but KEEPS this panel open. */}
      <div className="flex items-center gap-1.5 rounded-lg bg-soft-blue/40 px-3 py-1.5 text-[11.5px] text-navy-primary">
        <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
        <span><span className="font-semibold">Click any row</span> to highlight that cell in the grid on the left — this panel stays open so you can compare. Tap <span className="font-semibold">–</span> to minimise.</span>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => {
          const on = filter === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${on ? 'border-navy-primary/40 bg-navy-primary/[0.06] text-navy-deep' : 'border-soft-border bg-card text-ink-secondary hover:border-navy-primary/30'}`}
            >
              {c.dot && <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />}
              {c.label}
              <span className="rounded-full bg-ice px-1.5 text-[9.5px] font-semibold tabular-nums text-ink-secondary">{c.count.toLocaleString('en-IN')}</span>
            </button>
          )
        })}
      </div>

      {/* Tab (source sheet) selector — check one tab at a time, or all. */}
      {sheetTabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-secondary">Tab</span>
          <select
            value={activeSheet}
            onChange={(e) => setSheetFilter(e.target.value)}
            className="max-w-[15rem] truncate rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] font-medium text-navy-deep shadow-soft transition-colors hover:border-navy-primary/30 focus:outline-none focus:ring-1 focus:ring-muted-blue"
            title="Show only one source tab"
          >
            <option value="all">All tabs ({statusRows.length.toLocaleString('en-IN')})</option>
            {sheetTabs.map((t) => (
              <option key={t.sheet} value={t.sheet}>{t.sheet} ({t.count.toLocaleString('en-IN')})</option>
            ))}
          </select>
          {activeSheet !== 'all' && (
            <button type="button" onClick={() => setSheetFilter('all')} className="text-[10.5px] font-medium text-navy-primary hover:underline">Show all tabs</button>
          )}
        </div>
      )}

      {/* Result table — grouped tab by tab. Click a row to highlight its cell in
          the grid; the panel stays open so a row and its cell read together. */}
      <div className="overflow-auto rounded-xl2 border border-soft-border bg-card shadow-soft" style={{ maxHeight: '56vh' }}>
        <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#F3F6FB]">
              {['Cell', 'Line item', 'Your file', 'Dashboard', 'Status', ''].map((h, i) => (
                <th key={h || 'go'} className={`border-b border-soft-border px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-secondary ${i >= 2 && i <= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownCount === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-[12px] text-ink-secondary">No cells in this view.</td></tr>
            ) : groups.map((g) => (
              <Fragment key={g.sheet}>
                {/* Tab subheader — organises the rows tab by tab. */}
                <tr>
                  <td colSpan={6} className="border-b border-soft-border bg-[#EAF0FA] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-navy-primary">
                    {g.sheet} <span className="font-medium normal-case tracking-normal text-ink-secondary/80">· {g.rows.length.toLocaleString('en-IN')} cell{g.rows.length > 1 ? 's' : ''}</span>
                  </td>
                </tr>
                {g.rows.map((r) => {
                  const m = VERIFY_META[r.status]
                  return (
                    <tr
                      key={r.id}
                      onClick={() => v.navigateToCell(r)}
                      title="Click to highlight this cell in the Data Audit grid"
                      className={`group cursor-pointer ${m.tone === 'green' ? 'hover:bg-emerald-soft/30' : m.tone === 'amber' ? 'bg-gold-soft/25 hover:bg-gold-soft/40' : m.tone === 'red' ? 'bg-coral-soft/25 hover:bg-coral-soft/40' : 'hover:bg-ice/60'}`}
                    >
                      <td className="border-b border-soft-border/60 px-3 py-1.5 align-top">
                        <span className="font-mono text-[10.5px] text-ink-secondary">{r.cellRef}</span>
                      </td>
                      <td className="border-b border-soft-border/60 px-3 py-1.5 align-top">
                        <span className="block truncate text-[11.5px] font-medium text-navy-deep" style={{ maxWidth: 230 }} title={r.metricLabel}>{r.metricLabel}</span>
                        <span className="block truncate text-[10px] text-ink-secondary" style={{ maxWidth: 230 }}>{r.entityLabel} · {r.period}</span>
                      </td>
                      <td className="border-b border-soft-border/60 px-3 py-1.5 text-right align-top tabular-nums text-[11.5px] font-semibold text-navy-deep">{r.uploadedDisplay}</td>
                      <td className="border-b border-soft-border/60 px-3 py-1.5 text-right align-top tabular-nums text-[11.5px] text-ink-primary">{r.dashboardDisplay}</td>
                      <td className="border-b border-soft-border/60 px-3 py-1.5 align-top"><StatusPill status={r.status} /></td>
                      <td className="border-b border-soft-border/60 px-2 py-1.5 align-middle text-ink-secondary/50 transition-colors group-hover:text-navy-primary"><ArrowRight className="h-3.5 w-3.5" /></td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Drawer shell ─────────────────────────────────────────────────────────────
// `open` is kept in the props for the launcher's call site, but mounting is what
// actually gates visibility now (the launcher only renders this when open), so
// the shell itself just switches between the docked panel and the minimised pill.
export function ExcelVerifierDrawer({ onClose }: { open: boolean; onClose: () => void }) {
  const v = useVerify()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setBusy(true); setError(null)
    try {
      const buf = await file.arrayBuffer()
      const res = verifyWorkbook(buf, file.name)
      addHistory(file.name, buf) // remember every successfully-read upload
      if (res.summary.comparable === 0) {
        setError('Couldn’t match any cells. Make sure this is the dashboard’s portfolio-review workbook (its tabs are matched by name).')
        v.setResult(null)
      } else {
        v.setResult(res)
      }
    } catch (e) {
      setError(e instanceof Error ? `Couldn’t read this file: ${e.message}` : 'Couldn’t read this file.')
      v.setResult(null)
    } finally {
      setBusy(false)
    }
  }

  // Reopen a saved upload: re-read its bytes and re-run the check against the
  // CURRENT dashboard figures (never a stored, possibly-stale result).
  const onReopen = (entry: HistoryEntry) => {
    setError(null)
    const buf = getHistoryBytes(entry.id)
    if (!buf) {
      setError('That saved file couldn’t be read back — it may have been cleared. Please upload it again.')
      return
    }
    setBusy(true)
    try {
      const res = verifyWorkbook(buf, entry.name)
      addHistory(entry.name, buf) // bump it back to the top
      if (res.summary.comparable === 0) {
        setError('Couldn’t match any cells in that file against the current dashboard.')
        v.setResult(null)
      } else {
        v.setResult(res)
      }
    } catch (e) {
      setError(e instanceof Error ? `Couldn’t re-check that file: ${e.message}` : 'Couldn’t re-check that file.')
    } finally {
      setBusy(false)
    }
  }

  // Minimised → just the corner pill (grid fully visible). Reopen restores state.
  if (v.minimized) {
    const s = v.result?.summary
    const label = s
      ? s.mismatch > 0 ? `Verifier · ${s.mismatch.toLocaleString('en-IN')} mismatched` : `Verifier · ${s.comparable.toLocaleString('en-IN')} checked`
      : 'Verifier'
    return <VerifierPill label={label} onRestore={v.restoreVerifier} />
  }

  const subtitle = v.result
    ? 'Click a row to find that cell in the grid — the panel stays open so you can compare side by side. Minimise (–) to see the whole grid.'
    : 'Check an uploaded workbook against the dashboard, cell by cell'

  return (
    <VerifierDock title="Excel Upload Verifier" subtitle={subtitle} onMinimize={v.minimizeVerifier} onClose={onClose}>
      {v.result ? (
        <Results result={v.result} />
      ) : (
        <div className="space-y-4">
          <UploadZone onPick={onPick} busy={busy} onReopen={onReopen} />
          {error && (
            <p className="flex items-start gap-1.5 rounded-lg bg-coral-soft/40 px-3 py-2 text-[12px] text-coral-deep">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" /><span>{error}</span>
            </p>
          )}
          <p className="flex items-start gap-1.5 rounded-lg bg-teal-soft/60 px-3 py-2 text-[11px] leading-snug text-teal">
            <Scale className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Compared against the dashboard’s own audited values — the same model the Data Audit grid uses. A blank cell is shown as <span className="font-semibold">missing</span>, never a fake zero; a source- or basis-difference is flagged <span className="font-semibold">amber</span>, not as an error.</span>
          </p>
        </div>
      )}
    </VerifierDock>
  )
}
