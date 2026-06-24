import { useMemo } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { buildAudit } from '@/lib/extractedDataAudit'
import { AuditSpreadsheet } from '@/sections/AuditSpreadsheet'
import { ExcelVerifierLauncher } from '@/components/ExcelVerifierLauncher'
import { VerifyProvider, useVerify } from '@/state/verifyState'
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

  return (
    <div className="space-y-3">
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
    </div>
  )
}

export function ExtractedDataAudit({ focus }: { focus?: AuditFocus | null }) {
  return (
    <VerifyProvider>
      <AuditBody focus={focus} />
    </VerifyProvider>
  )
}
