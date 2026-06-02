// ---------------------------------------------------------------------------
//  Review queue.
//
//  Anything the pipeline isn't confident about lands here instead of silently
//  entering the dataset: low-confidence extractions, unclassified documents,
//  unresolved periods, blocked sources, and metric conflicts. The queue is
//  de-duplicated so repeated runs don't pile up identical items.
// ---------------------------------------------------------------------------

import type { MetricObservation, ReviewItem, DocumentRecord } from '../types.js'
import { needsReview } from './confidence.js'
import { nowIso } from '../utils/dates.js'

export function reviewItemForObservation(o: MetricObservation): ReviewItem {
  return {
    slug: o.slug,
    company: o.company,
    reason: o.tag === 'review_required' ? 'low_confidence' : 'low_confidence',
    detail: `${o.label} = ${o.value ?? 'n/a'} ${o.unit ?? ''} (${o.period}) confidence ${o.confidence}`,
    metric: o.metric,
    period: o.period,
    values: [{ value: o.value, sourceUrl: o.sourceUrl, source: o.source }],
    documentTitle: o.documentTitle,
    sourceUrl: o.sourceUrl,
    createdAt: nowIso(),
  }
}

export function reviewItemForUnknownDoc(d: DocumentRecord): ReviewItem {
  return {
    slug: d.slug,
    company: d.company,
    reason: 'unknown_document',
    detail: `Unclassified document "${d.title}" (${d.fileType})`,
    documentTitle: d.title,
    sourceUrl: d.sourceUrl,
    createdAt: nowIso(),
  }
}

/** Collect review items from a batch of observations (low-confidence only). */
export function reviewItemsFromObservations(obs: MetricObservation[]): ReviewItem[] {
  return obs.filter((o) => needsReview(o.tag)).map(reviewItemForObservation)
}

/** De-duplicate review items by their semantic identity. */
export function dedupeReviewQueue(items: ReviewItem[]): ReviewItem[] {
  const seen = new Map<string, ReviewItem>()
  for (const it of items) {
    const key = `${it.slug}|${it.reason}|${it.metric ?? ''}|${it.period ?? ''}|${it.detail}`
    if (!seen.has(key)) seen.set(key, it)
  }
  return [...seen.values()]
}
