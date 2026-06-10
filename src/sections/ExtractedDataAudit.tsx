import { useMemo } from 'react'
import { buildAudit } from '@/lib/extractedDataAudit'
import { AuditSpreadsheet } from '@/sections/AuditSpreadsheet'

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
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 h-8 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
        <div className="leading-tight">
          <h1 className="font-display text-[20px] text-navy-deep">Extracted Data Audit</h1>
          <p className="mt-0.5 max-w-3xl text-[12px] text-ink-secondary">
            Your Excel template, tab-for-tab and cell-for-cell, beside the dashboard data. A filled cell shows the verified
            value; an empty cell shows which source pipeline should fill it — and why it is still missing.
          </p>
          <p className="mt-1 text-[10.5px] text-ink-secondary/80">
            Template: <span className="font-medium text-ink-primary">{model.meta.template_file ?? 'niva-bupa-portfolio-review.xlsx'}</span>
            {model.meta.last_updated && <> · Pipeline updated {model.meta.last_updated.slice(0, 10)}</>}
          </p>
        </div>
      </div>

      <AuditSpreadsheet model={model} />
    </div>
  )
}
