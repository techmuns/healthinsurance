import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  UploadCloud, FileSpreadsheet, AlertTriangle,
  RotateCcw, Info, Loader2, ArrowRight, Minus, Maximize2, Minimize2, GripVertical, X,
  History, Trash2,
} from 'lucide-react'
import {
  verifyWorkbook, VERIFY_META,
  type VerifyResult, type VerifyRow, type VerifyStatus,
} from '@/lib/excelVerify'
import {
  listHistory, addHistory, getHistoryBytes, removeHistory, clearHistory,
  formatSize, formatWhen, type HistoryEntry,
} from '@/lib/verifyHistory'
import { useVerify, type ListFilter } from '@/state/verifyState'

// ---------------------------------------------------------------------------
//  Excel Upload Verifier — a dedicated tool (separate from "Add a source").
//  A user uploads her workbook; the dashboard reads it in the browser and checks
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

// ── Floating-window geometry (drag + resize + clamp + session memory) ─────────
// Pure window-positioning helper — it moves/sizes the panel and remembers the
// last box for the session. It touches NO verify data, calculations, navigation
// or audit logic; only where the panel sits on screen.
interface Box { x: number; y: number; w: number; h: number }
const WIN_MIN_W = 380
const WIN_MIN_H = 240
const WIN_KEY = 'verify:windowBox:v1'
const PILL_KEY = 'verify:pillPos:v1'
const vpW = () => window.innerWidth
const vpH = () => window.innerHeight

function clampBox(b: Box): Box {
  const W = vpW(), H = vpH()
  const w = Math.min(Math.max(b.w, WIN_MIN_W), Math.max(WIN_MIN_W, W - 16))
  const h = Math.min(Math.max(b.h, WIN_MIN_H), Math.max(WIN_MIN_H, H - 16))
  const x = Math.min(Math.max(b.x, 8), Math.max(8, W - w - 8))
  const y = Math.min(Math.max(b.y, 8), Math.max(8, H - h - 8))
  return { x, y, w, h }
}
function defaultBox(): Box {
  const W = vpW(), H = vpH()
  const w = Math.min(540, W - 48)
  const h = Math.min(Math.round(H * 0.8), H - 48)
  return clampBox({ x: W - w - 24, y: 24, w, h })
}
function loadBox(): Box {
  try { const raw = sessionStorage.getItem(WIN_KEY); if (raw) return clampBox(JSON.parse(raw)) } catch { /* ignore */ }
  return defaultBox()
}
function persist(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

// Every edge and corner. Each letter is an edge that moves; the opposite edge
// stays anchored, so dragging the LEFT edge widens to the left, the TOP edge
// shortens from the top, etc. — the normal window-resize behaviour.
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Resize by moving only the dragged edge(s); the opposite edge is anchored.
 *  Enforces the min size against the anchored edge and keeps every edge inside
 *  the viewport. */
function resizeBox(s: Box, mode: ResizeDir, dx: number, dy: number): Box {
  const m = 8, W = vpW(), H = vpH()
  let left = s.x, top = s.y, right = s.x + s.w, bottom = s.y + s.h
  if (mode.includes('e')) right = Math.min(W - m, Math.max(s.x + WIN_MIN_W, right + dx))
  if (mode.includes('w')) left = Math.max(m, Math.min(right - WIN_MIN_W, left + dx))
  if (mode.includes('s')) bottom = Math.min(H - m, Math.max(s.y + WIN_MIN_H, bottom + dy))
  if (mode.includes('n')) top = Math.max(m, Math.min(bottom - WIN_MIN_H, top + dy))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function useFloatingWindow() {
  const [box, setBox] = useState<Box>(() => (typeof window === 'undefined' ? { x: 40, y: 40, w: 540, h: 600 } : loadBox()))
  const ref = useRef<HTMLElement>(null) // the panel element — mutated directly mid-drag for smoothness
  const prevRef = useRef<Box | null>(null) // remembers the pre-maximise box
  const [maxed, setMaxed] = useState(false)

  // Keep the panel on-screen if the viewport shrinks.
  useEffect(() => {
    const onResize = () => setBox((b) => {
      const c = clampBox(b); persist(WIN_KEY, c); return c
    })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Drag the whole window (mode 'move') or resize from an edge/corner. The DOM is
  // moved directly during the gesture (no per-frame React render); state syncs on
  // release so the panel never janks even with a long row list behind it.
  const begin = (e: React.PointerEvent, mode: 'move' | ResizeDir) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = ref.current
    if (!el) return
    const start = { px: e.clientX, py: e.clientY, ...box }
    let latest = box
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px, dy = ev.clientY - start.py
      const next = mode === 'move'
        ? clampBox({ x: start.x + dx, y: start.y + dy, w: start.w, h: start.h })
        : resizeBox(start, mode, dx, dy)
      latest = next
      el.style.left = `${next.x}px`; el.style.top = `${next.y}px`; el.style.width = `${next.w}px`; el.style.height = `${next.h}px`
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setBox(latest); persist(WIN_KEY, latest)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const toggleMaximize = () => {
    if (maxed && prevRef.current) {
      const restore = clampBox(prevRef.current)
      prevRef.current = null; setMaxed(false); setBox(restore); persist(WIN_KEY, restore)
    } else {
      prevRef.current = box
      const m = clampBox({ x: 8, y: 8, w: vpW() - 16, h: vpH() - 16 })
      setMaxed(true); setBox(m); persist(WIN_KEY, m)
    }
  }

  return {
    box, ref, maxed,
    onHeaderPointerDown: (e: React.PointerEvent) => begin(e, 'move'),
    onResizePointerDown: (dir: ResizeDir) => (e: React.PointerEvent) => { e.stopPropagation(); begin(e, dir) },
    toggleMaximize,
  }
}

// ── Floating window shell ─────────────────────────────────────────────────────
// The verifier as a movable, resizable utility window floating above the audit
// page — never a full-height blocking drawer. Drag by the title bar, resize from
// the right/bottom/corner, minimise to a pill, maximise/restore. Portalled to
// <body> so the page-transition transform can't trap its fixed positioning.
function VerifierWindow({
  title, win, onMinimize, onMaximize, onClose, children,
}: {
  title: string
  win: ReturnType<typeof useFloatingWindow>
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (typeof document === 'undefined') return null
  const { box } = win
  return createPortal(
    <aside
      ref={win.ref}
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-soft-border bg-ivory shadow-lift outline-none"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      role="dialog"
      aria-label={title}
    >
      {/* Title bar = drag handle. Buttons stop propagation so a click never drags. */}
      <header
        onPointerDown={win.onHeaderPointerDown}
        className="flex shrink-0 cursor-move select-none items-center justify-between gap-3 border-b border-soft-border bg-card px-4 py-2.5"
        style={{ touchAction: 'none' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-ink-secondary/45" />
          <h3 className="truncate font-display text-[15.5px] text-navy-deep">{title}</h3>
        </div>
        <div className="relative z-40 flex shrink-0 items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={onMinimize} aria-label="Minimise" title="Minimise" className="rounded-full p-1.5 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={onMaximize} aria-label={win.maxed ? 'Restore' : 'Maximise'} title={win.maxed ? 'Restore size' : 'Maximise'} className="rounded-full p-1.5 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary">
            {win.maxed ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="rounded-full p-1.5 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Content fills the window; the children own their internal scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      {/* Resize from any edge or corner — like a normal window. z-30 keeps the
          handles above the table (the header buttons sit at z-40, so the corners
          never block them). Edges show a hover cue; the bottom-right has a grip. */}
      <div onPointerDown={win.onResizePointerDown('n')} className="absolute left-10 right-10 top-0 z-30 h-2 cursor-ns-resize transition-colors hover:bg-navy-primary/10" style={{ touchAction: 'none' }} aria-hidden />
      <div onPointerDown={win.onResizePointerDown('s')} className="absolute bottom-0 left-10 right-10 z-30 h-2 cursor-ns-resize transition-colors hover:bg-navy-primary/10" style={{ touchAction: 'none' }} aria-hidden />
      <div onPointerDown={win.onResizePointerDown('e')} className="absolute bottom-9 right-0 top-12 z-30 w-2 cursor-ew-resize transition-colors hover:bg-navy-primary/10" style={{ touchAction: 'none' }} aria-hidden />
      <div onPointerDown={win.onResizePointerDown('w')} className="absolute bottom-9 left-0 top-12 z-30 w-2 cursor-ew-resize transition-colors hover:bg-navy-primary/10" style={{ touchAction: 'none' }} aria-hidden />
      <div onPointerDown={win.onResizePointerDown('nw')} className="absolute left-0 top-0 z-30 h-4 w-4 cursor-nwse-resize" style={{ touchAction: 'none' }} aria-hidden />
      <div onPointerDown={win.onResizePointerDown('ne')} className="absolute right-0 top-0 z-30 h-4 w-4 cursor-nesw-resize" style={{ touchAction: 'none' }} aria-hidden />
      <div onPointerDown={win.onResizePointerDown('sw')} className="absolute bottom-0 left-0 z-30 h-4 w-4 cursor-nesw-resize" style={{ touchAction: 'none' }} aria-hidden />
      <div
        onPointerDown={win.onResizePointerDown('se')}
        className="absolute bottom-0 right-0 z-30 grid h-5 w-5 cursor-nwse-resize place-items-center rounded-tl-lg bg-card/80 text-ink-secondary/60 transition-colors hover:bg-navy-primary/10 hover:text-navy-primary"
        style={{ touchAction: 'none' }}
        title="Drag to resize"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M11 3 L3 11 M11 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </div>
    </aside>,
    document.body,
  )
}

// ── Minimised state — a small, draggable floating card ────────────────────────
function clampPill(p: { x: number; y: number }): { x: number; y: number } {
  const W = vpW(), H = vpH()
  return { x: Math.min(Math.max(p.x, 8), Math.max(8, W - 230)), y: Math.min(Math.max(p.y, 8), Math.max(8, H - 52)) }
}
function loadPill(): { x: number; y: number } {
  try { const raw = sessionStorage.getItem(PILL_KEY); if (raw) return clampPill(JSON.parse(raw)) } catch { /* ignore */ }
  return clampPill({ x: vpW() - 236, y: vpH() - 64 })
}
function VerifierPill({ label, onRestore }: { label: string; onRestore: () => void }) {
  const [pos, setPos] = useState(() => (typeof window === 'undefined' ? { x: 24, y: 24 } : loadPill()))
  const dragged = useRef(false)
  if (typeof document === 'undefined') return null

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragged.current = false
    const start = { px: e.clientX, py: e.clientY, ...pos }
    let latest = pos
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px, dy = ev.clientY - start.py
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true
      latest = clampPill({ x: start.x + dx, y: start.y + dy })
      setPos(latest)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persist(PILL_KEY, latest)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return createPortal(
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={() => { if (!dragged.current) onRestore() }}
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
      className="fixed z-50 inline-flex cursor-grab items-center gap-2 rounded-full border border-[#9DB4D8] bg-gradient-to-br from-[#1E4079] to-[#143058] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_10px_30px_rgba(23,43,77,0.28)] active:cursor-grabbing animate-fade-in"
      title="Drag to move · click to reopen the verifier"
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
            Saved on this device only. Reopening re-checks against the latest figures.
          </p>
        </div>
      )}
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
      title={m.label}
      className="flex items-center justify-between gap-2 rounded-lg border border-soft-border bg-card px-2.5 py-1.5 text-left shadow-soft transition-all hover:brightness-[0.99]"
      style={active ? { boxShadow: `inset 0 0 0 1.5px ${m.dot}` } : undefined}
    >
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.04em]" style={{ color: m.dot }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.dot }} />{m.short}
      </span>
      <span className="font-display text-[17px] leading-none tabular-nums text-navy-deep">{value.toLocaleString('en-IN')}</span>
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

  // The two "blank" directions, counted separately so each gets its own card:
  // blank in YOUR file (dashboard has it) vs blank in the DASHBOARD (your file has it).
  const blankInFile = useMemo(() => result.rows.filter((r) => r.status === 'missing_upload').length, [result.rows])
  const blankInDash = useMemo(() => result.rows.filter((r) => r.status === 'missing_dashboard').length, [result.rows])

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Fixed summary — file, outcome cards, tab selector stay put as the table scrolls. */}
      <div className="shrink-0 space-y-3 px-5 pb-3 pt-4">
      {/* File + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-teal" />
          <span className="truncate text-[12.5px] font-semibold text-navy-deep" title={result.fileName}>{result.fileName}</span>
          <span className="shrink-0 text-[11px] text-ink-secondary">· {s.comparable.toLocaleString('en-IN')} cells checked</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => v.setResult(null)} className="inline-flex items-center gap-1.5 rounded-full bg-navy-primary px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft transition-all hover:opacity-90">
            <RotateCcw className="h-3.5 w-3.5" /> New file
          </button>
        </div>
      </div>

      {/* Outcome cards — tap one to filter, tap again to clear. The two "blank"
          directions get their own row so each reads clearly: blank in YOUR file
          (the dashboard has it) vs blank in the DASHBOARD (your file has it). */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Tile status="matched" value={s.matched} active={filter === 'matched'} onClick={() => setFilter(filter === 'matched' ? 'all' : 'matched')} />
          <Tile status="source_basis" value={s.sourceBasis} active={filter === 'source_basis'} onClick={() => setFilter(filter === 'source_basis' ? 'all' : 'source_basis')} />
          <Tile status="mismatch" value={s.mismatch} active={filter === 'mismatch'} onClick={() => setFilter(filter === 'mismatch' ? 'all' : 'mismatch')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile status="missing_upload" value={blankInFile} active={filter === 'missing_upload'} onClick={() => setFilter(filter === 'missing_upload' ? 'all' : 'missing_upload')} />
          <Tile status="missing_dashboard" value={blankInDash} active={filter === 'missing_dashboard'} onClick={() => setFilter(filter === 'missing_dashboard' ? 'all' : 'missing_dashboard')} />
        </div>
      </div>

      {/* Sheet coverage — only surfaced when a template tab wasn't found. */}
      {missingSheets.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-soft-border bg-ice/50 px-3 py-1.5 text-[11px] text-ink-secondary">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-ink-secondary" />
          <span>Not found in your file: {missingSheets.map((m) => m.sheet).join(', ')}.</span>
        </div>
      )}

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
      </div>

      {/* Result table — the internal scroll zone. When the window is made small,
          this is what scrolls; the summary above stays put. Click a row to
          highlight its cell in the audit grid (behaviour unchanged). */}
      <div className="scroll-thin min-h-0 flex-1 overflow-auto border-t border-soft-border bg-card">
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
  const win = useFloatingWindow()
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

  return (
    <VerifierWindow title="Excel Upload Verifier" win={win} onMinimize={v.minimizeVerifier} onMaximize={win.toggleMaximize} onClose={onClose}>
      {v.result ? (
        <Results result={v.result} />
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <UploadZone onPick={onPick} busy={busy} onReopen={onReopen} />
          {error && (
            <p className="flex items-start gap-1.5 rounded-lg bg-coral-soft/40 px-3 py-2 text-[12px] text-coral-deep">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" /><span>{error}</span>
            </p>
          )}
        </div>
      )}
    </VerifierWindow>
  )
}
