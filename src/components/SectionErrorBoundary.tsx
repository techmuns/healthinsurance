import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'

// ---------------------------------------------------------------------------
//  SectionErrorBoundary — the dashboard's safety net.
//
//  A React render error in any single section used to unmount the whole app and
//  leave a blank white page. This boundary catches that error, contains it to
//  the one page that failed, and shows a calm, honest recovery card instead —
//  so the rest of the dashboard (and every other tab) keeps working.
//
//  • Catches errors thrown while rendering its children (the active section).
//  • Resets automatically when the user navigates to another section
//    (`resetKey` changes) so a one-off failure never "sticks".
//  • Offers a one-click "Try again" (re-render) and a "Reload" fallback.
//  • Surfaces the technical detail quietly, collapsed, so a recurring problem
//    can be copied straight to an engineer rather than guessed at.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode
  /** Changes when the active section changes — resets the boundary on navigation. */
  resetKey?: string
  /** Plain-English name of the section, used in the recovery copy. */
  sectionLabel?: string
}

interface State {
  error: Error | null
  prevResetKey?: string
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null, prevResetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  // Reset the caught error the moment the user navigates to a different section,
  // so switching tabs always lands on a fresh attempt rather than the fallback.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.prevResetKey) {
      return { error: null, prevResetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a console trail for debugging; the UI stays calm and user-facing.
    console.error('[SectionErrorBoundary] A section failed to render:', error, info.componentStack)
  }

  private retry = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const where = this.props.sectionLabel ? `the ${this.props.sectionLabel} page` : 'this page'

    return (
      <div className="animate-fade-in mx-auto max-w-2xl py-10">
        <div className="card-surface relative overflow-hidden p-7">
          {/* Thin coral accent — attention, not alarm. */}
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-coral to-transparent" />
          <div className="flex items-start gap-4">
            <span className="blob-c inline-flex h-12 w-12 shrink-0 items-center justify-center bg-coral-soft text-coral">
              <TriangleAlert className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-coral">Couldn&rsquo;t load this page</p>
              <h2 className="mt-1 font-display text-[21px] leading-tight text-navy-deep">
                Something in {where} hit a snag
              </h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">
                This page stopped before it finished loading, so we&rsquo;ve held it here instead of showing a blank
                screen. The rest of the dashboard is unaffected — every other tab still works. Try loading it again, or
                switch tabs and come back.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={this.retry}
                  className="inline-flex items-center gap-1.5 rounded-full bg-navy-primary px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-soft transition-all hover:bg-navy-deep hover:shadow-card"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center rounded-full border border-soft-border bg-white/70 px-3.5 py-1.5 text-[12px] font-semibold text-navy-primary transition-all hover:border-muted-blue hover:bg-white hover:text-navy-deep"
                >
                  Reload dashboard
                </button>
              </div>

              {/* Quiet, collapsed technical detail — for handing to an engineer. */}
              <details className="mt-4 text-[11px] text-ink-secondary/80">
                <summary className="cursor-pointer select-none font-semibold text-ink-secondary transition-colors hover:text-navy-deep">
                  Technical details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-ice px-3 py-2 font-mono text-[10.5px] leading-relaxed text-ink-secondary ring-1 ring-soft-border">
                  {error.message || String(error)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
