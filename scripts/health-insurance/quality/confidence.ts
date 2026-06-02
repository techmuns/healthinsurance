// ---------------------------------------------------------------------------
//  Confidence scoring.
//
//  A small, explainable framework — not a model. It turns the qualitative
//  signals the spec describes (table vs text, label proximity, period clarity,
//  official vs fallback source) into a 0–1 score and a provenance tag. The
//  score is auditable: every input that moved it is a named boolean.
//
//    High   ≈ labelled table cell, label + period nearby, official source.
//    Medium ≈ text value, label nearby, period inferred from the title.
//    Low    ≈ ambiguous label, unclear period, fallback, or pattern-only.
// ---------------------------------------------------------------------------

import type { SourceType, Tag } from '../types.js'

export interface ConfidenceInput {
  method: 'table' | 'text_pattern' | 'derived'
  sourceType: SourceType
  /** Period resolved with a real fiscal year (not 'unknown'). */
  periodKnown: boolean
  /** The metric label sat immediately before the captured number. */
  labelAdjacent: boolean
  /** A document-content sample (not just filename) backed the extraction. */
  fromDocumentBody: boolean
  /** Multiple plausible numbers competed for the same label. */
  ambiguous?: boolean
}

export interface ConfidenceResult {
  score: number
  level: 'high' | 'medium' | 'low'
  tag: Tag
}

export function scoreConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = 0.35 // base for any pattern hit

  if (input.method === 'table') score += 0.3
  else if (input.method === 'text_pattern') score += 0.12

  if (input.labelAdjacent) score += 0.15
  if (input.periodKnown) score += 0.15
  if (input.fromDocumentBody) score += 0.05

  // Official primary sources are more trustworthy than fallbacks.
  if (input.sourceType === 'company_ir' || input.sourceType === 'irdai') score += 0.08
  if (input.sourceType === 'fallback') score -= 0.15

  if (input.ambiguous) score -= 0.2

  score = Math.max(0.05, Math.min(0.99, Number(score.toFixed(2))))

  const level: ConfidenceResult['level'] = score >= 0.75 ? 'high' : score >= 0.55 ? 'medium' : 'low'

  let tag: Tag
  if (input.method === 'derived') tag = 'derived'
  else if (input.sourceType === 'fallback') tag = 'fallback'
  else if (score < 0.45) tag = 'review_required'
  else if (score < 0.6) tag = 'low_confidence'
  else tag = 'confirmed'

  return { score, level, tag }
}

/** Tags that must be routed to the extraction review queue. */
export function needsReview(tag: Tag): boolean {
  return tag === 'review_required' || tag === 'low_confidence'
}
