import { useEffect, useRef } from 'react'
import { Crosshair } from 'lucide-react'
import { VERIFY_META, type VerifyRow } from '@/lib/excelVerify'

// ---------------------------------------------------------------------------
//  VerifyRowHighlight — the honest "highlight" for the audit sheets that aren't
//  a cell grid (Historical Stock Movement, Analyst Coverage). Those are chart /
//  table views, so a clicked verifier row can't pulse an exact cell. Instead of
//  doing nothing (which reads as "broken"), we surface the row that was clicked:
//  the line item, its period, and your-file vs dashboard side by side — tone-
//  coded to the verification status. It never fakes a cell location; it just
//  shows the value you asked to check, where you're looking.
// ---------------------------------------------------------------------------

export function VerifyRowHighlight({ row }: { row: VerifyRow | null }) {
  const ref = useRef<HTMLDivElement>(null)

  // Bring the highlight into view whenever a new row is clicked, so the response
  // is visible even if the section was scrolled.
  useEffect(() => {
    if (row) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [row?.id])

  if (!row) return null
  const m = VERIFY_META[row.status]

  return (
    <div
      key={row.id}
      ref={ref}
      className="audit-reveal rounded-xl2 border-2 bg-card px-4 py-3 shadow-soft"
      style={{ borderColor: m.dot }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: m.dot }}>
          <Crosshair className="h-3.5 w-3.5" /> Verifying this cell
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cell} ${m.text}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />{m.label}
        </span>
      </div>

      <p className="mt-1.5 font-display text-[14px] leading-tight text-navy-deep">{row.metricLabel}</p>
      <p className="text-[11px] text-ink-secondary">{row.entityLabel} · {row.period} · cell <span className="font-mono">{row.cellRef}</span></p>

      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
        <span className="text-ink-secondary">Your file <span className="ml-1 font-semibold tabular-nums text-navy-deep">{row.uploadedDisplay}</span></span>
        <span className="text-ink-secondary">Dashboard <span className="ml-1 font-semibold tabular-nums text-navy-deep">{row.dashboardDisplay}</span></span>
      </div>

      <p className="mt-1.5 text-[10.5px] leading-snug text-ink-secondary/90">
        This tab is a chart &amp; table view rather than a cell grid, so the exact box can’t be outlined here — the value you clicked is shown above. The figure itself sits in the table below.
      </p>
    </div>
  )
}
