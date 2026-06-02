// ---------------------------------------------------------------------------
//  Document classifier.
//
//  Maps a document to one of the 16 categories using its filename, page title,
//  URL, source type and (when available) a sample of its text. Each category
//  has weighted signals; the highest-scoring category wins. A weak best score
//  yields 'unknown', which routes the document to the review queue per spec.
// ---------------------------------------------------------------------------

import type { DocumentType, SourceType } from '../types.js'

interface Rule {
  type: DocumentType
  /** Signals matched against "<filename> <title> <url>"; each adds weight. */
  signals: RegExp[]
  weight: number
}

const RULES: Rule[] = [
  { type: 'earnings_call_transcript', weight: 3, signals: [/earnings[\s_-]*call[\s_-]*transcript/i, /\btranscript\b/i] },
  { type: 'analyst_call_transcript', weight: 3, signals: [/analyst[\s_-]*call[\s_-]*transcript/i, /analyst[\s_-]*meet[\s_-]*transcript/i] },
  { type: 'earnings_presentation', weight: 3, signals: [/earnings[\s_-]*presentation/i, /earnings[\s_-]*update/i, /results[\s_-]*presentation/i] },
  { type: 'investor_day_presentation', weight: 3, signals: [/investor[\s_-]*day/i, /analyst[\s_-]*day/i, /capital[\s_-]*markets[\s_-]*day/i] },
  { type: 'investor_presentation', weight: 2, signals: [/investor[\s_-]*presentation/i, /investors?[\s_-]*deck/i, /\binvestor[\s_-]*update\b/i] },
  { type: 'integrated_report', weight: 3, signals: [/integrated[\s_-]*report/i, /integrated[\s_-]*annual/i] },
  { type: 'esg_report', weight: 3, signals: [/\bESG\b/i, /sustainability[\s_-]*report/i, /\bBRSR\b/i, /responsibility[\s_-]*report/i] },
  { type: 'corporate_governance_report', weight: 3, signals: [/corporate[\s_-]*governance/i, /governance[\s_-]*report/i] },
  { type: 'annual_report', weight: 2, signals: [/annual[\s_-]*report/i, /\bAR[\s_-]*20\d{2}/i, /\bAR_\d/i] },
  { type: 'press_release', weight: 2, signals: [/press[\s_-]*release/i, /media[\s_-]*release/i, /newspaper[\s_-]*publication/i, /press[\s_-]*note/i] },
  { type: 'quarterly_result', weight: 2, signals: [/quarterly[\s_-]*result/i, /financial[\s_-]*results?/i, /\bQ[1-4][\s_-]*FY/i, /quarter[\s_-]*ended/i, /standalone[\s_-]*financial/i] },
  { type: 'regulatory_circular', weight: 3, signals: [/circular/i, /\bguideline/i, /master[\s_-]*circular/i, /notification/i] },
  { type: 'industry_report', weight: 2, signals: [/handbook/i, /industry[\s_-]*statistics/i, /yearbook/i, /annual[\s_-]*statistics/i, /business[\s_-]*figures/i] },
  { type: 'irdai_disclosure', weight: 2, signals: [/public[\s_-]*disclosure/i, /\bNL[\s_-]*\d/i, /\bL[\s_-]*\d{1,2}\b/i, /quantitative\s+and\s+qualitative/i, /periodic[\s_-]*disclosure/i] },
  { type: 'stock_exchange_filing', weight: 2, signals: [/intimation/i, /board[\s_-]*meeting/i, /shareholding[\s_-]*pattern/i, /regulation\s*30/i, /outcome[\s_-]*of[\s_-]*board/i, /disclosure\s+under\s+regulation/i] },
]

export interface Classification {
  documentType: DocumentType
  confidence: number
  signals: string[]
}

/**
 * Classify a document. `text` is an optional leading sample for a content-based
 * tiebreak when the filename/title/URL are ambiguous.
 */
export function classifyDocument(args: {
  filename: string
  title?: string
  url?: string
  sourceType: SourceType
  text?: string
}): Classification {
  const blob = `${args.filename} ${args.title ?? ''} ${args.url ?? ''}`
  const sample = (args.text ?? '').slice(0, 1500)

  let best: Rule | null = null
  let bestScore = 0
  const matchedSignals: string[] = []

  for (const rule of RULES) {
    let score = 0
    for (const sig of rule.signals) {
      if (sig.test(blob)) {
        score += rule.weight
        matchedSignals.push(sig.source)
      } else if (sample && sig.test(sample)) {
        // Content match is weaker than a filename/title match.
        score += rule.weight * 0.5
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = rule
    }
  }

  // Source-type nudge: an IRDAI source defaults to a regulatory category.
  if (!best && args.sourceType === 'irdai') {
    return { documentType: 'irdai_disclosure', confidence: 0.45, signals: ['source:irdai'] }
  }
  if (!best && args.sourceType === 'exchange') {
    return { documentType: 'stock_exchange_filing', confidence: 0.45, signals: ['source:exchange'] }
  }
  if (!best) {
    return { documentType: 'unknown', confidence: 0.2, signals: [] }
  }

  // Map raw score to a 0–1 confidence; a single weak signal stays modest.
  const confidence = Math.min(0.95, 0.4 + bestScore * 0.12)
  return { documentType: best.type, confidence, signals: matchedSignals }
}

/** Which company-JSON document bucket a category belongs to. */
export function documentBucket(type: DocumentType): keyof import('../types.js').CompanyData['documents'] {
  switch (type) {
    case 'quarterly_result':
      return 'quarterlyResults'
    case 'annual_report':
    case 'integrated_report':
      return 'annualReports'
    case 'earnings_call_transcript':
    case 'analyst_call_transcript':
      return 'transcripts'
    case 'stock_exchange_filing':
      return 'stockExchangeFilings'
    case 'irdai_disclosure':
    case 'regulatory_circular':
    case 'industry_report':
      return 'irdaiDisclosures'
    default:
      return 'otherDisclosures'
  }
}
