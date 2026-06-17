import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
//  KaTeXFormula — renders a recognized formula crisply, the "renowned formula"
//  look the methodology panel wants. KaTeX (lib + stylesheet) is loaded ON DEMAND
//  the first time any formula mounts, so it never bloats first paint. Until it
//  resolves — or if it fails entirely — a typographic-HTML fallback renders the
//  same expression in readable notation. Input TeX is our own deterministic data,
//  never user content.
// ---------------------------------------------------------------------------

type KatexRender = (tex: string, opts: Record<string, unknown>) => string
let katexPromise: Promise<KatexRender | null> | null = null

/** Load KaTeX + its CSS once, lazily. Resolves to the render fn, or null on failure. */
function loadKatex(): Promise<KatexRender | null> {
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')])
      .then(([m]) => (m.default.renderToString as KatexRender))
      .catch(() => null)
  }
  return katexPromise
}

// ── Typographic fallback (a small TeX subset → HTML) ─────────────────────────
const GREEK: Record<string, string> = {
  '\\mu': 'μ', '\\sigma': 'σ', '\\beta': 'β', '\\alpha': 'α', '\\Delta': 'Δ', '\\delta': 'δ',
  '\\tau': 'τ', '\\ge': '≥', '\\le': '≤', '\\approx': '≈', '\\iff': '⇔', '\\Rightarrow': '⇒',
  '\\rightarrow': '→', '\\to': '→', '\\times': '×', '\\cdot': '·', '\\%': '%',
}

/** Replace \frac/\dfrac{a}{b} (allowing one level of nested braces) with a small
 *  stacked fraction, repeatedly until none remain. */
function replaceFracs(s: string): string {
  const arg = '((?:[^{}]|\\{[^{}]*\\})*)'
  const re = new RegExp(`\\\\[d]?frac\\{${arg}\\}\\{${arg}\\}`)
  let out = s
  for (let i = 0; i < 8 && re.test(out); i++) {
    out = out.replace(re, '<span class="kf-frac"><span class="kf-num">$1</span><span class="kf-den">$2</span></span>')
  }
  return out
}

function fallbackHtml(tex: string): string {
  let s = tex
  s = s.replace(/\\overline\{([^{}]*)\}/g, '$1̅').replace(/\\hat\{([^{}]*)\}/g, '$1̂')
  // Resolve \text/\mathrm first so fraction args stop being deeply nested.
  s = s.replace(/\\text\{([^{}]*)\}/g, '$1').replace(/\\mathrm\{([^{}]*)\}/g, '$1')
  s = s.replace(/\\xrightarrow\{[^{}]*\}/g, ' → ').replace(/\\left|\\right/g, '')
  s = replaceFracs(s)
  for (const [k, v] of Object.entries(GREEK)) s = s.split(k).join(v)
  s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>').replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>')
  s = s.replace(/\^(\w)/g, '<sup>$1</sup>').replace(/_(\w)/g, '<sub>$1</sub>')
  s = s.replace(/\\,|\\;|\\!|\\quad|\\ /g, ' ').replace(/\\ln/g, 'ln')
  // Strip any remaining \commands BEFORE braces so "\frac{a}{b}" never collapses
  // into "\fracab" and eats a following letter.
  s = s.replace(/\\[a-zA-Z]+/g, '').replace(/\\\\/g, ' ')
  return s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

export function KaTeXFormula({ tex, display = false, className = '' }: { tex: string; display?: boolean; className?: string }) {
  const [html, setHtml] = useState<string>(() => fallbackHtml(tex))
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    let alive = true
    setHtml(fallbackHtml(tex))
    setRendered(false)
    loadKatex().then((render) => {
      if (!alive || !render) return
      try {
        setHtml(render(tex, { throwOnError: false, displayMode: display, output: 'html' }))
        setRendered(true)
      } catch { /* keep the typographic fallback */ }
    })
    return () => { alive = false }
  }, [tex, display])

  return (
    <span
      className={`${rendered ? 'kf-katex' : 'kf-fallback'} ${display ? 'kf-display' : 'kf-inline'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
