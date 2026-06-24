import { lazy, Suspense, Component, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FileCheck2, FileSpreadsheet, TriangleAlert, RotateCcw, Loader2, X } from 'lucide-react'
import { useVerify } from '@/state/verifyState'

// ---------------------------------------------------------------------------
//  ExcelVerifierLauncher — the entry point to the Excel Upload Verifier, placed
//  INSIDE the Data Audit page (where the figures it checks against live). A
//  compact contextual card + button that opens the verifier window.
//
//  The window is lazy: SheetJS + the cell-level audit model load only when the
//  tool is actually opened. To avoid a flash, the loading/error fallbacks match
//  the real floating window's shape and position (read from the same saved
//  geometry) — never the old full-height drawer — and the chunk is preloaded on
//  hover so the fallback is rarely seen at all.
// ---------------------------------------------------------------------------

const importDrawer = () => import('@/components/ExcelVerifierDrawer')
const ExcelVerifierDrawer = lazy(() => importDrawer().then((m) => ({ default: m.ExcelVerifierDrawer })))

// Read the verifier window's last saved box (same key the window persists to) so
// the loading placeholder sits exactly where the real window will appear — no
// jump, no "old format then new format" flash.
function loadVerifierBox(): { x: number; y: number; w: number; h: number } {
  try {
    const raw = sessionStorage.getItem('verify:windowBox:v1')
    if (raw) { const b = JSON.parse(raw); if (b && typeof b.w === 'number' && typeof b.h === 'number') return b }
  } catch { /* ignore */ }
  const W = window.innerWidth, H = window.innerHeight
  const w = Math.min(540, W - 48), h = Math.min(Math.round(H * 0.8), H - 48)
  return { x: W - w - 24, y: 24, w, h }
}

/** A floating-window-shaped shell for the transient loading / error states — the
 *  same chrome and position as the real verifier window, so swapping to the real
 *  one is seamless. */
function FloatingShell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  if (typeof document === 'undefined') return null
  const b = loadVerifierBox()
  return createPortal(
    <aside
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-soft-border bg-ivory shadow-lift"
      style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
      role="dialog"
      aria-label="Excel Upload Verifier"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-soft-border bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-ink-secondary/45" />
          <h3 className="truncate font-display text-[15.5px] text-navy-deep">Excel Upload Verifier</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" title="Close" className="rounded-full p-1.5 text-ink-secondary transition-colors hover:bg-ice hover:text-navy-primary">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">{children}</div>
    </aside>,
    document.body,
  )
}

/** Contains a slow/failed chunk load to a recovery window instead of letting it
 *  bubble up and blank the page. (Reload, not in-place retry: React caches a
 *  rejected lazy import, so only a fresh load can recover it.) */
class VerifierBoundary extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('[Verify Excel] tool failed to load:', error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <FloatingShell onClose={this.props.onClose}>
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg bg-coral-soft/40 px-3 py-2 text-left text-[12.5px] text-coral-deep">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
            <span>The verifier didn’t finish loading — this usually means the dashboard was mid-update. A reload fixes it.</span>
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-full bg-navy-primary px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-soft transition-all hover:bg-navy-deep"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reload &amp; try again
          </button>
        </div>
      </FloatingShell>
    )
  }
}

/** Window-shaped loading state while the (large) verifier chunk downloads — the
 *  same shell as the real window, so there's no drawer→window format flash. */
function VerifierLoading({ onClose }: { onClose: () => void }) {
  return (
    <FloatingShell onClose={onClose}>
      <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the verifier…
      </span>
    </FloatingShell>
  )
}

export function ExcelVerifierLauncher() {
  const v = useVerify()
  const close = v.closeVerifier
  const active = !!v.result
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-soft-border bg-gradient-to-r from-soft-blue/40 to-card p-4 shadow-soft">
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-soft-blue text-navy-primary">
          <FileSpreadsheet className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="font-display text-[14px] text-navy-deep">
            {active ? 'Verification active — review the highlighted cells below' : 'Check your workbook against this audit'}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-secondary">
            {active
              ? 'Reopen the verifier to browse the full result list, switch files, or export the report. Only flagged cells are highlighted in the grid.'
              : 'Upload your Excel and it’s compared cell-by-cell to these figures — matches, mismatches and source/basis differences flagged, with a report to export.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={v.openVerifier}
        onPointerEnter={() => { void importDrawer() }}
        onFocus={() => { void importDrawer() }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy-primary px-4 py-2 text-[12.5px] font-semibold text-white shadow-soft transition-all hover:bg-navy-deep"
        title="Upload an Excel file and check it cell-by-cell against this audit"
      >
        <FileCheck2 className="h-3.5 w-3.5" /> {active ? 'Reopen verifier' : 'Verify Excel'}
      </button>
      {v.open && (
        <VerifierBoundary onClose={close}>
          <Suspense fallback={<VerifierLoading onClose={close} />}>
            <ExcelVerifierDrawer open onClose={close} />
          </Suspense>
        </VerifierBoundary>
      )}
    </div>
  )
}
