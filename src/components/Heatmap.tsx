export interface HeatmapColumn {
  key: string
  label: string
  /** true => lower numbers are better (e.g. combined ratio). */
  invert?: boolean
  /** Format the displayed cell value. */
  format?: (v: number) => string
}

export interface HeatmapRow {
  label: string
  sublabel?: string
  values: Record<string, number>
  focal?: boolean
}

// Soft blue-to-green/amber scale; intentionally muted (no harsh red/green).
function cellStyle(score: number): { bg: string; color: string } {
  // score in [0,1]; 1 = best
  if (score >= 0.75) return { bg: '#E6F1EB', color: '#2F855A' }
  if (score >= 0.5) return { bg: '#EAF1FF', color: '#27457E' }
  if (score >= 0.3) return { bg: '#FBF3E2', color: '#B7791F' }
  return { bg: '#F8ECEC', color: '#B94A48' }
}

export function Heatmap({ columns, rows }: { columns: HeatmapColumn[]; rows: HeatmapRow[] }) {
  // Normalise each column independently.
  const ranges = columns.map((c) => {
    const vals = rows.map((r) => r.values[c.key]).filter((v) => v !== undefined && v !== 0)
    return { min: Math.min(...vals), max: Math.max(...vals) }
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
              Company
            </th>
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td
                className={[
                  'sticky left-0 bg-card px-3 py-2 text-left font-medium',
                  r.focal ? 'text-navy-primary' : 'text-ink-primary',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {r.focal && <span className="blob-d inline-block h-2 w-2 bg-navy-primary" />}
                  {r.label}
                </div>
              </td>
              {columns.map((c, ci) => {
                const v = r.values[c.key]
                if (v === undefined || v === 0) {
                  return (
                    <td key={c.key} className="rounded-lg bg-ice px-2 py-2 text-center text-xs text-ink-secondary/60">
                      —
                    </td>
                  )
                }
                const { min, max } = ranges[ci]
                const span = max - min || 1
                let score = (v - min) / span
                if (c.invert) score = 1 - score
                const style = cellStyle(score)
                return (
                  <td
                    key={c.key}
                    className="rounded-lg px-2 py-2 text-center text-xs font-semibold"
                    style={{ backgroundColor: style.bg, color: style.color }}
                  >
                    {c.format ? c.format(v) : v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
