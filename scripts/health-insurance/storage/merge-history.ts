// ---------------------------------------------------------------------------
//  History-preserving merge.
//
//  The cardinal rule: never overwrite a historical observation. New runs
//  merge, deduplicate, and preserve old history. Two values for the same
//  metric+period from different sources are BOTH kept and the disagreement is
//  surfaced as a conflict for the review queue — the dashboard can prefer the
//  official source for its summary, but the raw observations are never lost.
//
//  Dedup keys:
//    documents — content hash when present, else sourceUrl + title.
//    metrics   — slug + metric + period + value + sourceUrl  (spec contract).
// ---------------------------------------------------------------------------

import type { DocumentRecord, MetricObservation, ReviewItem } from '../types.js'
import { nowIso } from '../utils/dates.js'

export function documentKey(d: DocumentRecord): string {
  return d.hash ? `h:${d.hash}` : `u:${d.sourceUrl}|${d.title}`
}

/** Merge incoming documents into an existing list, de-duplicating. */
export function mergeDocuments(existing: DocumentRecord[], incoming: DocumentRecord[]): DocumentRecord[] {
  const byKey = new Map<string, DocumentRecord>()
  for (const d of existing) byKey.set(documentKey(d), d)
  for (const d of incoming) {
    const k = documentKey(d)
    const prev = byKey.get(k)
    if (!prev) {
      byKey.set(k, d)
      continue
    }
    // Refresh with the latest known metadata without losing the original.
    byKey.set(k, {
      ...prev,
      finalUrl: d.finalUrl ?? prev.finalUrl,
      localPath: d.localPath ?? prev.localPath,
      hash: d.hash ?? prev.hash,
      publishedDate: prev.publishedDate ?? d.publishedDate,
      period: prev.period ?? d.period,
      downloadedAt: d.downloadedAt ?? prev.downloadedAt,
      // A successful download supersedes a prior blocked/failed status.
      status: rankStatus(d.status) >= rankStatus(prev.status) ? d.status : prev.status,
    })
  }
  return [...byKey.values()]
}

function rankStatus(s: DocumentRecord['status']): number {
  return { failed: 0, blocked: 1, skipped: 1, review_required: 2, downloaded: 3 }[s] ?? 0
}

export function metricKey(o: MetricObservation): string {
  return `${o.slug}|${o.metric}|${o.period}|${o.value}|${o.sourceUrl}`
}

export interface MetricMergeResult {
  merged: MetricObservation[]
  conflicts: ReviewItem[]
}

/**
 * Merge incoming observations for a single metric key into existing history.
 * Exact duplicates refresh their extraction metadata (latest extractedAt /
 * confidence) but are not duplicated. Same metric+period with a different
 * value is a conflict: both are kept and a review item is produced.
 */
export function mergeMetricSeries(
  metric: string,
  company: string,
  slug: string,
  existing: MetricObservation[],
  incoming: MetricObservation[],
): MetricMergeResult {
  const byKey = new Map<string, MetricObservation>()
  for (const o of existing) byKey.set(metricKey(o), o)

  for (const o of incoming) {
    const k = metricKey(o)
    const prev = byKey.get(k)
    if (prev) {
      // Identical observation — keep history, refresh latest metadata only.
      byKey.set(k, { ...prev, extractedAt: o.extractedAt, confidence: o.confidence, tag: o.tag })
    } else {
      byKey.set(k, o)
    }
  }

  const merged = [...byKey.values()]

  // Conflict detection: group by period, flag >1 distinct non-null value.
  const conflicts: ReviewItem[] = []
  const byPeriod = new Map<string, MetricObservation[]>()
  for (const o of merged) {
    if (o.value === null) continue
    const arr = byPeriod.get(o.period) ?? []
    arr.push(o)
    byPeriod.set(o.period, arr)
  }
  for (const [period, obs] of byPeriod) {
    const distinct = new Set(obs.map((o) => o.value))
    if (distinct.size > 1) {
      conflicts.push({
        slug,
        company,
        reason: 'metric_conflict',
        detail: `Conflicting ${metric} values for ${period}: ${[...distinct].join(' vs ')}`,
        metric,
        period,
        values: obs.map((o) => ({ value: o.value, sourceUrl: o.sourceUrl, source: o.source })),
        createdAt: nowIso(),
      })
    }
  }

  return { merged, conflicts }
}
