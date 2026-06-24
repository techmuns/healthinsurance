import { Check } from 'lucide-react'

// ---------------------------------------------------------------------------
//  AuditLoadingCard — the premium loading surface for the Extracted Data Audit.
//
//  The audit grid mirrors the source template cell-for-cell and carries a large
//  cell-level index, so it takes a beat to prepare. Instead of an empty band or
//  a one-line "Loading…" that reads as "something broke", this card shows an
//  intentional, calm progress experience: a circular progress ring, a climbing
//  percentage, the stage being worked on, and a plain-English line explaining
//  that the dashboard is organizing many extracted cells and their sources.
//
//  Purely presentational — it just renders the `progress` it is given. The
//  staging/timing logic lives in DataAuditPane.
// ---------------------------------------------------------------------------

interface AuditLoadingCardProps {
  /** 0–100. Drives the ring, the percentage and which stage is active. */
  progress: number
}

// The four stages the percentage moves through. `upTo` is the exclusive ceiling
// at which the NEXT stage takes over. Copy stays plain and reassuring.
const STAGES: { upTo: number; label: string; short: string }[] = [
  { upTo: 25, label: 'Organizing source cells…', short: 'Source cells' },
  { upTo: 55, label: 'Mapping extracted values…', short: 'Extracted values' },
  { upTo: 85, label: 'Preparing audit grid…', short: 'Audit grid' },
  { upTo: 101, label: 'Loading the best view…', short: 'Best view' },
]

const RING = 120 // viewBox
const R = 46 // ring radius
const CIRC = 2 * Math.PI * R

function activeStageIndex(p: number): number {
  for (let i = 0; i < STAGES.length; i += 1) {
    if (p < STAGES[i].upTo) return i
  }
  return STAGES.length - 1
}

export function AuditLoadingCard({ progress }: AuditLoadingCardProps) {
  const clamped = Math.max(0, Math.min(100, progress))
  const pct = Math.round(clamped)
  const offset = CIRC * (1 - clamped / 100)
  const stageIdx = activeStageIndex(clamped)

  // The glowing tip rides the leading edge of the progress arc (starts at 12
  // o'clock, sweeps clockwise) — a small premium detail that moves with the fill.
  const tipAngle = (-90 + 3.6 * clamped) * (Math.PI / 180)
  const tipX = RING / 2 + R * Math.cos(tipAngle)
  const tipY = RING / 2 + R * Math.sin(tipAngle)

  return (
    <div className="audit-loader-enter flex min-h-[58vh] items-center justify-center px-4">
      <div className="card-surface relative w-full max-w-md overflow-hidden p-7 sm:p-8">
        {/* Thin tone-coded top accent — navy (trust) → teal (verified) → gold
            (premium), the audit aura. Signals "intentional", not "error". */}
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy-primary via-teal to-champagne" />

        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
          Extracted Data Audit
        </p>

        {/* ── Progress ring ────────────────────────────────────────────── */}
        <div className="relative mx-auto mt-5 h-[132px] w-[132px]">
          {/* Soft halo behind the ring. */}
          <div
            aria-hidden
            className="audit-ring-halo absolute inset-2 rounded-full bg-[radial-gradient(circle,rgba(39,69,126,0.14),transparent_70%)] blur-md"
          />
          <svg
            viewBox={`0 0 ${RING} ${RING}`}
            className="absolute inset-0 h-full w-full -rotate-90"
            role="img"
            aria-label={`Preparing the audit view, ${pct}% ready`}
          >
            <defs>
              <linearGradient id="auditRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#27457E" />
                <stop offset="55%" stopColor="#168E8E" />
                <stop offset="100%" stopColor="#B68B3A" />
              </linearGradient>
            </defs>
            {/* Track */}
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              stroke="rgba(39,69,126,0.10)"
              strokeWidth={7}
            />
            {/* Progress arc */}
            <circle
              className="audit-ring-progress"
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              stroke="url(#auditRingGrad)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
            />
            {/* Glowing leading tip (only once there's an arc to sit on). */}
            {clamped > 1 && (
              <circle className="audit-ring-progress" cx={tipX} cy={tipY} r={4.4} fill="#fff" stroke="#B68B3A" strokeWidth={1.4} />
            )}
          </svg>
          {/* Centered percentage */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[30px] leading-none text-navy-deep tabular-nums">{pct}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">
              % ready
            </span>
          </div>
        </div>

        {/* ── Active stage line ─────────────────────────────────────────── */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
          </span>
          <p className="font-display text-[15px] text-navy-deep">{STAGES[stageIdx].label}</p>
        </div>

        {/* Plain-English reassurance — what is actually happening, why the wait. */}
        <p className="mx-auto mt-2 max-w-xs text-center text-[12px] leading-relaxed text-ink-secondary">
          Organizing extracted cells and source links for the best audit view — the
          grid mirrors the source template cell-for-cell, so it takes a moment.
        </p>

        {/* ── Slim four-step tracker ────────────────────────────────────── */}
        <div className="mt-5 flex items-center justify-between gap-1.5">
          {STAGES.map((s, i) => {
            const done = i < stageIdx
            const active = i === stageIdx
            return (
              <div key={s.short} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span
                  className={[
                    'h-1 w-full rounded-full transition-colors duration-500',
                    done ? 'bg-teal' : active ? 'bg-navy-primary/70' : 'bg-[rgba(39,69,126,0.12)]',
                  ].join(' ')}
                />
                <span
                  className={[
                    'flex items-center gap-1 truncate text-[10px] font-medium transition-colors duration-500',
                    done ? 'text-teal' : active ? 'text-navy-deep' : 'text-ink-secondary/70',
                  ].join(' ')}
                >
                  {done && <Check className="h-2.5 w-2.5 shrink-0" />}
                  <span className="truncate">{s.short}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
