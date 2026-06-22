import { useMemo } from 'react'
import { buildAudit } from '@/lib/extractedDataAudit'
import { AuditSpreadsheet } from '@/sections/AuditSpreadsheet'
import { ExcelVerifierLauncher } from '@/components/ExcelVerifierLauncher'
import type { AuditFocus } from '@/insights/sourceMap'

// ---------------------------------------------------------------------------
//  Extracted Data Audit — a source-mapping QA surface that mirrors the source
//  Excel template tab-for-tab and cell-for-cell. A reviewer can open their Excel
//  beside it and compare each cell: a filled cell shows the verified value; an
//  empty cell shows which source pipeline (IRDAI portal / company PPT / Screener)
//  should fill it and why it is still missing. Read-only — no data is changed.
// ---------------------------------------------------------------------------

export function ExtractedDataAudit({ focus }: { focus?: AuditFocus | null }) {
  const model = useMemo(() => buildAudit(), [])

  return (
    <div className="space-y-4">
      <ExcelVerifierLauncher />

      <AuditSpreadsheet model={model} focus={focus} />
    </div>
  )
}
