import { RotateCcw, Bookmark, Undo2, SlidersHorizontal } from 'lucide-react'

// ---------------------------------------------------------------------------
//  CustomizeBar — the "Customize View" strip that sits above an audit table.
//  Left: the Hidden-items tray — a chip per hidden company / column; click a
//  chip to restore it (data was never removed, just hidden). Right: Save view
//  (remembers hidden items + column order) and Reset view (back to default).
//  Direct, tap-first — no selectors to wade through.
// ---------------------------------------------------------------------------

export interface TrayChip {
  id: string
  label: string
  kind: 'company' | 'column'
  /** Company colour dot (companies only). */
  color?: string
}

export function CustomizeBar({
  chips,
  onRestore,
  onRestoreAll,
  onSave,
  onReset,
  dirty,
  customized,
  hasSaved,
}: {
  chips: TrayChip[]
  onRestore: (chip: TrayChip) => void
  onRestoreAll: () => void
  onSave: () => void
  onReset: () => void
  dirty: boolean
  customized: boolean
  hasSaved: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border border-soft-border bg-ice/25 px-3 py-1.5">
      {/* Hidden-items tray */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-secondary">
          <SlidersHorizontal className="h-3 w-3" /> Hidden
        </span>
        {chips.length === 0 ? (
          <span className="text-[11px] text-ink-secondary/70">
            Nothing hidden — tap <span className="font-semibold text-ink-secondary">×</span> on a company or column header to tidy the view.
          </span>
        ) : (
          <>
            {chips.map((c) => (
              <button
                key={`${c.kind}:${c.id}`}
                type="button"
                onClick={() => onRestore(c)}
                title={`Restore ${c.label}`}
                className="chip-soft inline-flex max-w-[180px] items-center gap-1 rounded-full border border-soft-border bg-white px-2 py-0.5 text-[11px] font-medium text-navy-deep transition-colors hover:border-navy-primary/30"
              >
                {c.color ? (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                ) : (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-ink-secondary/60">col</span>
                )}
                <span className="truncate">{c.label}</span>
                <RotateCcw className="h-3 w-3 shrink-0 text-ink-secondary/60" />
              </button>
            ))}
            <button
              type="button"
              onClick={onRestoreAll}
              className="ml-0.5 text-[10.5px] font-semibold text-navy-primary transition-opacity hover:underline"
            >
              Restore all
            </button>
          </>
        )}
      </div>

      {/* Save / Reset */}
      <div className="flex shrink-0 items-center gap-1.5">
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-champagne-deep" title="Unsaved changes to this view" />}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          title={hasSaved ? 'Update your saved view' : 'Save this view (hidden items + column order)'}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-soft transition-colors disabled:cursor-default disabled:opacity-40 border-navy-primary/30 bg-soft-blue text-navy-primary hover:enabled:border-navy-primary/50"
        >
          <Bookmark className="h-3.5 w-3.5" /> Save view
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!customized && !hasSaved}
          title="Reset to the default view"
          className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-secondary shadow-soft transition-colors hover:enabled:border-navy-primary/30 hover:enabled:text-navy-primary disabled:cursor-default disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" /> Reset
        </button>
      </div>
    </div>
  )
}
