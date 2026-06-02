// ---------------------------------------------------------------------------
//  Metric extractor.
//
//  Two-stage design that prizes precision over recall (a missed value is
//  honest; a fabricated one is not):
//
//    1. LOCATE the metric label in the document (registry locators).
//    2. PARSE a value from the short window right after the label, but only if
//       it carries the right UNIT CUE for the metric's category:
//         • ratio  → must be followed by "%"
//         • x      → "N.NN x" / "NNN%"(÷100) / a bare 0.5–10 figure
//         • money  → ₹/Rs prefix, a crore/lakh/mn/bn word, or comma-grouping
//         • count  → a scale word (lakh/crore/mn) or comma-grouping / ≥3 digits
//       Bare integers that look like years are rejected, and a money/count
//       token immediately followed by "%" is rejected (it's a ratio/growth).
//
//  Table rows are parsed the same way but score higher (label + value adjacent).
//  Every emitted value clears the metric's plausibility band.
// ---------------------------------------------------------------------------

import type { CompanyConfig, DocumentType, MetricObservation, MetricDef, SourceType } from '../types.js'
import { METRICS, compilePatterns } from '../config/metrics.js'
import type { TableRow } from './pdf-tables.js'
import type { ParsedPeriod } from './period-parser.js'
import { pageOf } from './pdf-text.js'
import { scoreConfidence } from '../quality/confidence.js'
import { nowIso } from '../utils/dates.js'

export interface ExtractArgs {
  company: CompanyConfig
  text: string
  pages: string[]
  tableRows: TableRow[]
  documentType: DocumentType
  period: ParsedPeriod
  sourceType: SourceType
  sourceUrl: string
  documentTitle: string
  isFallback?: boolean
}

interface ParsedValue {
  value: number
  /** Char offset of the value within the window (for adjacency scoring). */
  offset: number
}

const YEAR_RE = /^(?:19|20)\d{2}$/

function scaleMoney(word: string | undefined): number {
  const w = (word ?? '').toLowerCase()
  if (w.startsWith('lakh') || w === 'lac' || w === 'lacs') return 0.01
  if (w.startsWith('bn') || w.startsWith('billion')) return 100
  if (w.startsWith('mn') || w.startsWith('million')) return 0.1
  return 1 // crore / cr / unspecified → canonical ₹ Crore
}

function scaleCount(word: string | undefined): number {
  const w = (word ?? '').toLowerCase()
  if (w.startsWith('crore') || w === 'cr') return 1e7
  if (w.startsWith('lakh') || w === 'lac' || w === 'lacs') return 1e5
  if (w.startsWith('million') || w === 'mn') return 1e6
  if (w.startsWith('billion') || w === 'bn') return 1e9
  if (w.startsWith('thousand')) return 1e3
  return 1
}

/**
 * Find ALL cue-qualified candidate values in a window, in order of appearance.
 * The caller takes the first as the value and treats length > 1 as a
 * multi-period / multi-stat window whose period attribution is uncertain.
 */
function findValues(def: MetricDef, window: string): ParsedValue[] {
  const w = window
  const out: ParsedValue[] = []
  const push = (value: number, offset: number) => {
    if (Number.isFinite(value) && value >= def.min && value <= def.max) out.push({ value, offset })
  }

  // Ratios — must carry an explicit percent sign.
  if (def.unit === '%') {
    for (const m of w.matchAll(/(-?\d{1,3}(?:\.\d{1,2})?)\s*%/g)) push(parseFloat(m[1]), m.index ?? 0)
    return out
  }

  // Solvency — "N.NN x"/"times", a percent ÷100, or a bare 0.5–10 figure.
  if (def.unit === 'x') {
    for (const m of w.matchAll(/(\d(?:\.\d{1,2})?)\s*(?:x|times)\b/gi)) push(parseFloat(m[1]), m.index ?? 0)
    if (!out.length) for (const m of w.matchAll(/(\d{2,3}(?:\.\d{1,2})?)\s*%/g)) push(+(parseFloat(m[1]) / 100).toFixed(2), m.index ?? 0)
    if (!out.length) { const m = w.match(/\b(\d(?:\.\d{1,2})?)\b/); if (m) push(parseFloat(m[1]), m.index ?? 0) }
    return out
  }

  // Money — needs a ₹/Rs prefix, a scale word, or comma-grouping. Never a %.
  // Decimals capped at 2: insurer figures show 2dp, so "202.9366" (two cells
  // mashed by the PDF layout) splits into 202.93 + a second 66.1 candidate,
  // which trips the multi-period guard instead of yielding a bogus number.
  if (def.currency === 'INR') {
    const re = /(₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)\s*(crores?|cr|lakhs?|lacs?|bn|billion|mn|million)?/gi
    for (const m of w.matchAll(re)) {
      const [, rupee, rawTok, scaleWord] = m
      const numTok = rawTok?.replace(/^,+|,+$/g, '') // drop date-style trailing commas
      if (!numTok) continue
      const end = (m.index ?? 0) + m[0].length
      const after = w.slice(end)
      if (/^\s*%/.test(after)) continue // growth / ratio, not money
      // A bare number touching the window edge is probably truncated (₹17,55 of
      // ₹17,553) — skip unless a scale word terminated it.
      if (!scaleWord && end >= w.length) continue
      const hasGrouping = /\d,\d{2,3}/.test(numTok) // proper grouping, not "31,"
      const hasDecimal = /\.\d/.test(numTok)
      // A money figure must show a cue: ₹/Rs, a scale word, comma-grouping, or
      // a multi-digit decimal. Bare integers (incl. years) are not money.
      if (!rupee && !scaleWord && !hasGrouping && !(hasDecimal && numTok.replace(/\D/g, '').length >= 3)) continue
      const numRaw = numTok.replace(/,/g, '')
      if (YEAR_RE.test(numRaw) && !scaleWord && !rupee) continue
      const v = +(parseFloat(numRaw) * scaleMoney(scaleWord)).toFixed(4)
      if (Math.abs(v) < 1) continue // sub-₹1-Cr headline figure = misread
      push(v, m.index ?? 0)
    }
    return out
  }

  // Counts — scale word, comma-grouping, or ≥3 digits (but not a bare year).
  const re = /([\d,]+(?:\.\d{1,2})?)\s*(crores?|cr|lakhs?|lacs?|million|mn|billion|bn|thousand)?/gi
  for (const m of w.matchAll(re)) {
    const numTok = m[1]?.replace(/^,+|,+$/g, '')
    const scaleWord = m[2]
    if (!numTok) continue
    const end = (m.index ?? 0) + m[0].length
    const after = w.slice(end)
    if (/^\s*%/.test(after)) continue
    if (!scaleWord && end >= w.length) continue // edge-truncated number
    // A count must carry a scale word (lakh/crore) or proper comma-grouping;
    // bare integers in prose/marketing decks are too ambiguous to confirm.
    const hasGrouping = /\d,\d{2,3}/.test(numTok)
    if (!scaleWord && !hasGrouping) continue
    const digits = numTok.replace(/\D/g, '')
    if (YEAR_RE.test(digits) && !scaleWord) continue
    push(Math.round(parseFloat(numTok.replace(/,/g, '')) * scaleCount(scaleWord)), m.index ?? 0)
  }
  return out
}

function snippet(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start), Math.min(text.length, end)).replace(/\s+/g, ' ').trim()
}

const WINDOW = 58 // chars after a label to look for its value
const COUNT_WINDOW = 24 // counts sit right next to their label — keep it tight

function windowFor(def: MetricDef): number {
  return def.unit === 'count' ? COUNT_WINDOW : WINDOW
}

interface PassHit {
  value: number
  index: number
  matchLen: number
  adjacent: boolean
  /** The label's window held >1 qualified value (multi-period / multi-stat),
   *  so which period this value belongs to is uncertain — route to review. */
  multi: boolean
}

/** Locate a metric in free text; return the first cue-qualified value. */
function textPass(def: MetricDef, regexes: RegExp[], deny: RegExp | null, text: string): PassHit | null {
  for (const re of regexes) {
    const g = new RegExp(re.source, 'gi')
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = g.exec(text)) && guard++ < 200) {
      if (deny && deny.test(text.slice(Math.max(0, m.index - 24), m.index))) continue
      const windowStart = m.index + m[0].length
      const values = findValues(def, text.slice(windowStart, windowStart + windowFor(def)))
      if (!values.length) continue
      const first = values[0]
      return {
        value: first.value, index: m.index, matchLen: m[0].length + first.offset,
        adjacent: first.offset <= 16, multi: values.length > 1,
      }
    }
  }
  return null
}

/** Locate a metric inside a single table row; values are label-adjacent. */
function tablePass(def: MetricDef, regexes: RegExp[], deny: RegExp | null, rows: TableRow[]) {
  for (const row of rows) {
    for (const re of regexes) {
      const m = row.line.match(re)
      if (!m || m.index === undefined) continue
      if (deny && deny.test(row.line.slice(Math.max(0, m.index - 24), m.index))) continue
      const values = findValues(def, row.line.slice(m.index + m[0].length, m.index + m[0].length + windowFor(def)))
      if (!values.length) continue
      // A row with several numeric columns is multi-period: value is real but
      // its period column is ambiguous without header alignment.
      const multi = values.length > 1 || row.numbers.length > 1
      return { value: values[0].value, snippet: row.line.replace(/\s+/g, ' ').trim(), multi }
    }
  }
  return null
}

export function extractMetrics(args: ExtractArgs): MetricObservation[] {
  const out: MetricObservation[] = []
  const sourceLabel = sourceLabelFor(args.sourceType)
  const extractedAt = nowIso()
  const periodKnown = args.period.periodType !== 'unknown'

  for (const def of METRICS) {
    const regexes = compilePatterns(def)
    const deny = def.denyContext ? new RegExp(def.denyContext, 'i') : null

    // 1) Table pass (preferred — label and value sit on one row).
    const table = tablePass(def, regexes, deny, args.tableRows)
    if (table) {
      const conf = downgradeIfMulti(
        scoreConfidence({ method: 'table', sourceType: args.sourceType, periodKnown, labelAdjacent: true, fromDocumentBody: true, ambiguous: table.multi }),
        table.multi,
      )
      out.push(observation(def, table.value, table.snippet, pageOf(args.pages, table.snippet), 'table', conf, args, sourceLabel, extractedAt))
      continue
    }

    // 2) Text pass (fallback — looser, lower confidence).
    const txt = textPass(def, regexes, deny, args.text)
    if (txt) {
      const snip = snippet(args.text, txt.index, txt.index + txt.matchLen + 24)
      const conf = downgradeIfMulti(
        scoreConfidence({ method: 'text_pattern', sourceType: args.sourceType, periodKnown, labelAdjacent: txt.adjacent, fromDocumentBody: true, ambiguous: txt.multi }),
        txt.multi,
      )
      out.push(observation(def, txt.value, snip, pageOf(args.pages, snip), 'text_pattern', conf, args, sourceLabel, extractedAt))
    }
  }

  return out
}

/**
 * A value from a multi-period window is real but its period column is
 * uncertain. Keep the observation, but mark it review_required and cap the
 * confidence so the dashboard never treats it as a confirmed period figure.
 */
function downgradeIfMulti(conf: ReturnType<typeof scoreConfidence>, multi: boolean): ReturnType<typeof scoreConfidence> {
  if (!multi || conf.tag === 'fallback' || conf.tag === 'derived') return conf
  return { score: Math.min(conf.score, 0.5), level: 'low', tag: 'review_required' }
}

function observation(
  def: MetricDef, value: number, snip: string, pageNumber: number | null,
  method: 'table' | 'text_pattern', conf: ReturnType<typeof scoreConfidence>,
  args: ExtractArgs, sourceLabel: string, extractedAt: string,
): MetricObservation {
  return {
    metric: def.key, label: def.label, period: args.period.period, periodType: args.period.periodType,
    fiscalYear: args.period.fiscalYear, quarter: args.period.quarter, value, unit: def.unit,
    currency: def.currency ?? null, company: args.company.name, slug: args.company.slug,
    source: sourceLabel, sourceUrl: args.sourceUrl, documentTitle: args.documentTitle,
    documentType: args.documentType, pageNumber, extractedText: snip.slice(0, 240),
    confidence: conf.score, tag: args.isFallback ? 'fallback' : conf.tag, extractedAt, method,
  }
}

function sourceLabelFor(sourceType: SourceType): string {
  switch (sourceType) {
    case 'company_ir': return 'Company IR / Disclosure'
    case 'exchange': return 'Stock Exchange'
    case 'irdai': return 'IRDAI'
    case 'fallback': return 'Public Fallback'
  }
}
