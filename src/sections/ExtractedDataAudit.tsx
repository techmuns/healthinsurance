import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { buildAudit } from '@/lib/extractedDataAudit'
import { AuditSpreadsheet } from '@/sections/AuditSpreadsheet'
import { AuditDataGrid } from '@/sections/AuditDataGrid'
import { ExcelVerifierLauncher } from '@/components/ExcelVerifierLauncher'
import { useVerify } from '@/state/verifyState'
import type { AuditFocus } from '@/insights/sourceMap'

// ---------------------------------------------------------------------------
//  Extracted Data Audit — a source-mapping QA surface that mirrors the source
//  Excel template tab-for-tab and cell-for-cell. A reviewer can open their Excel
//  beside it and compare each cell: a filled cell shows the verified value; an
//  empty cell shows which source pipeline (IRDAI portal / company PPT / Screener)
//  should fill it and why it is still missing. Read-only — no data is changed.
//
//  The Excel Upload Verifier lives here too: uploading a workbook puts the grid
//  into a verification overlay (only problem cells highlighted) and clicking a
//  verifier row jumps to the exact cell. That coordination runs through
//  VerifyProvider (src/state/verifyState).
// ---------------------------------------------------------------------------

function AuditBody({ focus }: { focus?: AuditFocus | null }) {
  const model = useMemo(() => buildAudit(), [])
  const v = useVerify()
  // Two ways to read the audited data:
  //   • Source Mirror  — the cell-for-cell mirror of the source workbook (default;
  //     also where insight → source navigation lands and the Excel verifier runs).
  //   • Analyst Grid   — the clean Company × Year × Metric grid, where a reviewer
  //     selects cells for an instant readout + AI senior-analyst synthesis.
  const [view, setView] = useState<'mirror' | 'grid'>('mirror')
  // Arriving from an insight targets a specific cell in the mirror — force it.
  useEffect(() => {
    if (focus) setView('mirror')
  }, [focus])

  return (
    <div className="space-y-3">
      {/* Audit view switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-full border border-soft-border bg-ice/60 p-0.5">
          {([
            ['mirror', 'Source Mirror'],
            ['grid', 'Analyst Grid'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition-all ${
                view === id ? 'bg-white text-navy-deep shadow-soft' : 'text-ink-secondary hover:text-navy-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink-secondary">
          {view === 'mirror'
            ? 'Cell-for-cell mirror of the source workbook.'
            : 'Clean audited grid — select cells for an instant readout + AI analysis.'}
        </p>
      </div>

      {view === 'grid' ? (
        <AuditDataGrid />
      ) : (
        <>
          <ExcelVerifierLauncher />

          <AuditSpreadsheet model={model} focus={focus} />

          {/* Floating return — once a file is verified, jump back to the verifier
              result list from anywhere in the (tall) grid. */}
          {v.result && !v.open && (
            <button
              type="button"
              onClick={v.openVerifier}
              className="fixed bottom-6 left-6 z-40 inline-flex items-center gap-2 rounded-full border border-[#9DB4D8] bg-gradient-to-br from-[#1E4079] to-[#143058] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_10px_30px_rgba(23,43,77,0.28)] transition-transform hover:-translate-y-0.5"
            >
              <FileSpreadsheet className="h-4 w-4" /> Back to Verifier
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function ExtractedDataAudit({ focus }: { focus?: AuditFocus | null }) {
  // VerifyProvider is mounted at the app level (App.tsx) so an uploaded Excel
  // survives navigating between sections — this section just consumes it.
  return <AuditBody focus={focus} />
}

/**
 * Warm the cached audit model ahead of rendering the grid. `buildAudit()` caches
 * its result, so calling it here primes the cache: the subsequent grid render
 * (its own `useMemo(buildAudit)`) returns the cached model instantly with no
 * blocking compute. Used by DataAuditPane to run the heavy index build behind
 * the loading card. Pure cache priming — no data is read differently or changed.
 */
export function warmAudit(): void {
  buildAudit()
}
