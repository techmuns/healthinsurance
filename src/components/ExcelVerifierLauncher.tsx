import { lazy, Suspense, Component, type ReactNode } from 'react'
import { FileCheck2, FileSpreadsheet, TriangleAlert, RotateCcw, Loader2 } from 'lucide-react'
import { Drawer } from './Drawer'
import { useVerify } from '@/state/verifyState'

// ---------------------------------------------------------------------------
//  ExcelVerifierLauncher — the entry point to the Excel Upload Verifier, placed
//  INSIDE the Data Audit page (where the figures it checks against live). A
//  compact contextual card + button that opens the verifier drawer.
//
//  The drawer is lazy: SheetJS + the cell-level audit model load only when the
//  tool is actually opened (the audit page already loads the model, so the extra
//  cost on click is just SheetJS). An error boundary + a drawer-shaped loading
//  state mean a slow or failed chunk shows a calm recovery panel, never a blank.
// ---------------------------------------------------------------------------

const ExcelVerifierDrawer = lazy(() =>
  import('@/components/ExcelVerifierDrawer').then((m) => ({ default: m.ExcelVerifierDrawer })),
)

/** Contains a slow/failed chunk load to a recovery drawer instead of letting it
 *  bubble up and blank the page. (Reload, not in-place retry: React caches a
 *  rejected lazy import, so only a fresh load can recover it.) */
class VerifierBoundary extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('[Verify Excel] tool failed to load:', error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Drawer open onClose={this.props.onClose} widthClass="max-w-md" title="Excel Upload Verifier" subtitle="Couldn’t open the tool">
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-coral-soft/40 px-3 py-2 text-[12.5px] text-coral-deep">
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
      </Drawer>
    )
  }
}

/** Drawer-shaped loading state while the (large) verifier chunk downloads, so
 *  opening the tool shows progress in a real drawer instead of a blank flash. */
function VerifierLoading({ onClose }: { onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} widthClass="max-w-md" title="Excel Upload Verifier" subtitle="Loading the tool…">
      <div className="flex items-center gap-2 py-12 text-[12.5px] text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the verifier…
      </div>
    </Drawer>
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
