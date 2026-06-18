import { useMemo } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { buildAudit } from '@/lib/extractedDataAudit'
import { AuditSpreadsheet } from '@/sections/AuditSpreadsheet'
import { PageHeadline } from '@/components/PageHeadline'

// ---------------------------------------------------------------------------
//  Extracted Data Audit — a source-mapping QA surface that mirrors the source
//  Excel template tab-for-tab and cell-for-cell. A reviewer can open their Excel
//  beside it and compare each cell: a filled cell shows the verified value; an
//  empty cell shows which source pipeline (IRDAI portal / company PPT / Screener)
//  should fill it and why it is still missing. Read-only — no data is changed.
// ---------------------------------------------------------------------------

export function ExtractedDataAudit() {
  const model = useMemo(() => buildAudit(), [])

  return (
    <div className="space-y-4">
      <PageHeadline
        eyebrow="Data Audit"
        title="What's sourced, verified, and still missing"
        subtitle="Your Excel template, tab-for-tab and cell-for-cell, beside the dashboard data. A filled cell shows the verified value; an empty cell shows which source pipeline should fill it — and why it is still missing."
        Icon={ClipboardCheck}
        tone="navy"
      />

      <AuditSpreadsheet model={model} />
    </div>
  )
}
