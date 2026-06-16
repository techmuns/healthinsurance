import { useRef, useState } from 'react'
import { UploadCloud, FileText, X, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Drawer } from './Drawer'

// A lean "add a source" affordance: lets the user hand the dashboard an official
// document (annual report / disclosure / results / deck) they have. It captures
// the file and acknowledges it — nothing is changed automatically; official
// sources are reviewed before they enter the data pipeline.

const ACCEPT = '.pdf,.xlsx,.xls,.csv'
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1_048_576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1_048_576).toFixed(1)} MB`)

export function SourceUploadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const add = (list: FileList | null) => {
    if (!list || !list.length) return
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...Array.from(list).filter((f) => !seen.has(f.name + f.size))]
    })
    setSubmitted(false)
  }
  const removeAt = (i: number) => setFiles((prev) => prev.filter((_, j) => j !== i))

  return (
    <Drawer open={open} onClose={onClose} title="Add a source" subtitle="Upload an official document to feed the dashboard">
      {submitted ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-teal-soft text-teal">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <div>
            <p className="font-display text-[17px] text-navy-deep">Thanks — received</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
              {files.length} file{files.length > 1 ? 's' : ''} submitted. Official sources are reviewed before anything is added to the dashboard&apos;s data pipeline.
            </p>
          </div>
          <ul className="space-y-1.5 text-left">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-soft-border bg-card px-3 py-2 text-[12px]">
                <FileText className="h-4 w-4 shrink-0 text-navy-primary" />
                <span className="truncate text-ink-primary">{f.name}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setFiles([]); setSubmitted(false) }} className="text-[12px] font-semibold text-navy-primary hover:underline">
            Add another
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            Have an official document you&apos;d like the dashboard to use — an annual report, IRDAI / company public disclosure, results filing or investor deck? Drop it here and it&apos;ll be added as a source.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); add(e.dataTransfer.files) }}
            className={[
              'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors',
              dragOver ? 'border-navy-primary bg-soft-blue/50' : 'border-soft-border bg-ice/40 hover:border-navy-primary/40',
            ].join(' ')}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-soft-blue text-navy-primary">
              <UploadCloud className="h-6 w-6" />
            </span>
            <span className="text-[13px] font-semibold text-navy-deep">Drop a file here, or click to browse</span>
            <span className="text-[11px] text-ink-secondary">PDF, Excel or CSV</span>
          </button>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => add(e.target.files)} />

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-soft-border bg-card px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-navy-primary" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-primary">{f.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-secondary">{fmtSize(f.size)}</span>
                  <button type="button" onClick={() => removeAt(i)} className="shrink-0 text-ink-secondary transition-colors hover:text-coral" title="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-start gap-1.5 rounded-lg bg-teal-soft/60 px-3 py-2 text-[11px] leading-snug text-teal">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Official sources only (filings, disclosures, results). Uploads are reviewed first — nothing changes the dashboard automatically.</span>
          </p>

          <button
            type="button"
            disabled={files.length === 0}
            onClick={() => setSubmitted(true)}
            className="w-full rounded-xl bg-navy-primary px-4 py-2.5 text-[13px] font-semibold text-white shadow-soft transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add source{files.length > 0 ? ` (${files.length})` : ''}
          </button>
        </div>
      )}
    </Drawer>
  )
}
