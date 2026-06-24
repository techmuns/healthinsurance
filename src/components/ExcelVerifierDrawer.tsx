import { useMemo, useRef, useState } from 'react'
import {
  UploadCloud, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Scale, Download,
  ExternalLink, RotateCcw, Info, Loader2, FileDown, MousePointerClick, ArrowRight,
} from 'lucide-react'
import { Drawer } from './Drawer'
import { classifySource, isLinkable, sourceHref } from '@/lib/sourceHealth'
import {
  verifyWorkbook, downloadVerifyReport, VERIFY_META,
  type VerifyResult, type VerifyRow, type VerifyStatus,
} from '@/lib/excelVerify'
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

// ── Upload zone (first screen) ───────────────────────────────────────────────
function UploadZone({ onPick, busy }: { onPick: (f: File) => void; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
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

// ── Per-cell detail (uploaded vs dashboard + source / basis) ──────────────────
function RowDetail({ row, onClose }: { row: VerifyRow; onClose: () => void }) {
  const m = VERIFY_META[row.status]
  const linkable = isLinkable(row.sourceUrl)
  return (
    <div className="flex flex-col overflow-hidden rounded-xl2 border border-soft-border bg-card shadow-card">
      <div className="flex items-start justify-between gap-2 px-4 py-3" style={{ background: 'linear-gradient(135deg,#172B4D,#27457E)' }}>
        <div className="leading-tight">
          <p className="font-mono text-[10px] uppercase tracking-wide text-white/55">Cell {row.cellRef} · {row.sheet}</p>
          <p className="mt-0.5 font-display text-[14.5px] text-white">{row.metricLabel}</p>
          <p className="text-[11px] text-white/65">{row.entityLabel} · {row.period}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={`flex items-center gap-2 px-4 py-2.5 ${m.cell}`}>
        <span className="h-2 w-2 rounded-full" style={{ background: m.dot }} />
        <span className={`text-[12px] font-semibold ${m.text}`}>{m.label}</span>
        {row.diffPct != null && (
          <span className="ml-auto text-[11px] font-semibold tabular-nums" style={{ color: m.dot }}>
            {row.diffPct > 0 ? '+' : ''}{(row.diffPct * 100).toFixed(1)}% vs dashboard
          </span>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {/* The two values side by side — the heart of the check. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-soft-border bg-ice/50 px-3 py-2">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Your file</p>
            <p className="mt-0.5 font-semibold tabular-nums text-navy-deep">{row.uploadedDisplay}</p>
          </div>
          <div className="rounded-lg border border-soft-border bg-ice/50 px-3 py-2">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Dashboard</p>
            <p className="mt-0.5 font-semibold tabular-nums text-navy-deep">{row.dashboardDisplay}</p>
          </div>
        </div>

        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">What this means</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-primary">{row.reason}</p>
        </div>

        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Dashboard source / basis</p>
          <div className="mt-0.5 text-[12px] text-ink-primary">
            {row.sourceLabel ? (
              linkable ? (
                <a href={sourceHref(row.sourceUrl)!} target="_blank" rel="noreferrer" title={row.sourceName ?? classifySource(row.sourceUrl).hint} className="inline-flex items-start gap-1 text-navy-primary hover:underline">
                  {row.sourceLabel}<ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                </a>
              ) : <span title={row.sourceName ?? undefined}>{row.sourceLabel}</span>
            ) : <span className="text-ink-secondary">Not recorded</span>}
          </div>
        </div>

        {row.dashboardField && (
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Where it’s used</p>
            <p className="mt-0.5 text-[12px] text-ink-primary">{row.dashboardField}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Results view ─────────────────────────────────────────────────────────────
function Results({ result }: { result: VerifyResult }) {
  const v = useVerify()
  const filter = v.listFilter
  const setFilter = v.setListFilter
  const [hovered, setHovered] = useState<VerifyRow | null>(null)
  const s = result.summary

  const rows = useMemo(
    () => result.rows.filter((r) => inBucket(r.status, filter)),
    [result.rows, filter],
  )
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

      {/* Jump hint — the row's primary action is now "click → go to the cell". */}
      <div className="flex items-center gap-1.5 rounded-lg bg-soft-blue/40 px-3 py-1.5 text-[11.5px] text-navy-primary">
        <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
        <span><span className="font-semibold">Click any row</span> to jump to that exact cell in the Data Audit grid — hover to preview the values.</span>
      </div>

      {/* Filter chips */}
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

      {/* Table + (optional) hover preview. Click a row → jump to the audit cell. */}
      <div className={hovered ? 'grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]' : ''}>
        <div className="overflow-auto rounded-xl2 border border-soft-border bg-card shadow-soft" style={{ maxHeight: '54vh' }}>
          <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F3F6FB]">
                {['Cell', 'Line item', 'Your file', 'Dashboard', 'Status', ''].map((h, i) => (
                  <th key={h || 'go'} className={`border-b border-soft-border px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-secondary ${i >= 2 && i <= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[12px] text-ink-secondary">No cells in this view.</td></tr>
              ) : rows.map((r) => {
                const m = VERIFY_META[r.status]
                const isHover = hovered?.id === r.id
                return (
                  <tr
                    key={r.id}
                    onClick={() => v.navigateToCell(r)}
                    onMouseEnter={() => setHovered(r)}
                    title="Click to open this cell in the Data Audit grid"
                    className={`group cursor-pointer ${m.tone === 'green' ? 'hover:bg-emerald-soft/30' : m.tone === 'amber' ? 'bg-gold-soft/25 hover:bg-gold-soft/40' : m.tone === 'red' ? 'bg-coral-soft/25 hover:bg-coral-soft/40' : 'hover:bg-ice/60'}`}
                    style={isHover ? { boxShadow: `inset 2px 0 0 ${m.dot}` } : undefined}
                  >
                    <td className="border-b border-soft-border/60 px-3 py-1.5 align-top">
                      <span className="font-mono text-[10.5px] text-ink-secondary">{r.cellRef}</span>
                      <span className="block text-[9px] text-ink-secondary/70">{r.sheet}</span>
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
            </tbody>
          </table>
        </div>
        {hovered && (
          <div className="lg:sticky lg:top-2 lg:self-start">
            <RowDetail row={hovered} onClose={() => setHovered(null)} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Drawer shell ─────────────────────────────────────────────────────────────
export function ExcelVerifierDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const v = useVerify()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setBusy(true); setError(null)
    try {
      const buf = await file.arrayBuffer()
      const res = verifyWorkbook(buf, file.name)
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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      widthClass="max-w-5xl"
      title="Excel Upload Verifier"
      subtitle="Check an uploaded workbook against the dashboard, cell by cell"
    >
      {v.result ? (
        <Results result={v.result} />
      ) : (
        <div className="space-y-4">
          <UploadZone onPick={onPick} busy={busy} />
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
    </Drawer>
  )
}
