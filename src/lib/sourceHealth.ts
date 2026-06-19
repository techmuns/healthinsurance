// ---------------------------------------------------------------------------
//  Source-link health — a single, deterministic classifier the whole dashboard
//  uses so a broken/session source link is never shown as a normal "verified"
//  link. It answers, for any source URL: can the user safely click this, and if
//  not, what honest state do we show?
//
//  IMPORTANT — this is a STATIC / heuristic check, not a live reachability test.
//  A browser dashboard can't fetch arbitrary third-party pages to confirm a 200
//  (CORS + the source sites block it), so we classify by:
//    • emptiness          → "pending"      (no link on record yet)
//    • valid URL format   → malformed / non-http ⇒ "unavailable"
//    • known-unstable patterns:
//        – NSE get-quote pages render via a session and won't open directly →
//          auto-swap to the company's STABLE public mirror (Screener) ⇒ "fixed"
//        – session/expiring tokens (jsessionid, sid=…) ⇒ "unstable" (warn, keep)
//    • everything else     → "verified"     (a plausible, durable link)
//
//  It NEVER invents a source and NEVER mutates stored data — only the href that
//  the UI opens is stabilised; the original is preserved on the record.
// ---------------------------------------------------------------------------

export type SourceState =
  | 'verified' // valid, durable link — render normally
  | 'fixed' // original was session-based; opened a stable public mirror instead
  | 'unstable' // session/expiring link — kept, but the UI warns before the click
  | 'pending' // no source URL on record yet
  | 'unavailable' // a URL is present but empty/malformed/non-web — nothing safe to open

export interface SourceHealth {
  state: SourceState
  /** The href the UI should actually open (stabilised when `fixed`); null when
   *  there is nothing safe to link to (pending / unavailable). */
  href: string | null
  /** Short status label for chips / pills. */
  label: string
  /** One-line plain-English explanation for tooltips. */
  hint: string
  /** True only when we redirected to a stable public mirror/search page. */
  fixed: boolean
  /** The original URL on record, kept for the popover when we changed/flagged it. */
  original?: string
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

// Session / expiring tokens — a URL carrying one of these isn't durably linkable.
const SESSION_MARKERS = /[?;&](jsessionid|sessionid|phpsessid|sid|stoken|auth_token)=/i

// NSE get-quote / get-quotes pages render through a browser session and commonly
// fail on direct navigation ("page not found / unavailable"). We map them to the
// company's stable public mirror on Screener (the dashboard's established mirror
// for exchange data) for the SAME ticker — never a different company.
const NSE_GET_QUOTE = /nseindia\.com\/get-quotes?\/equity(?:\/([A-Za-z0-9]+)|\/?\?[^#]*\bsymbol=([A-Za-z0-9]+))/i

// SEBI deep document attachments frequently rot / require a session; their
// filings & search landing pages are stable. Flag the former, trust the latter.
const SEBI_UNSTABLE = /sebi\.gov\.in\/(sebi_data|cms)\/.*\.(pdf|html?)(\?|;|$)/i

function nseSymbol(raw: string): string | null {
  const m = raw.match(NSE_GET_QUOTE)
  const sym = (m?.[1] || m?.[2] || '').toUpperCase()
  return sym || null
}

/** Classify a source URL into an honest, clickable-or-not health state. */
export function classifySource(raw?: string | null): SourceHealth {
  const url = (raw ?? '').trim()
  if (!url) {
    return { state: 'pending', href: null, label: 'Source pending', hint: 'No source link on record yet.', fixed: false }
  }

  const parsed = parseUrl(url)
  if (!parsed || !/^https?:$/.test(parsed.protocol)) {
    return {
      state: 'unavailable',
      href: null,
      label: 'Source unavailable',
      hint: 'Source unavailable — needs manual verification (the reference isn’t a valid web link).',
      fixed: false,
      original: url,
    }
  }

  // NSE get-quote → stable Screener mirror for the same ticker.
  const sym = nseSymbol(url)
  if (sym) {
    return {
      state: 'fixed',
      href: `https://www.screener.in/company/${sym}/`,
      label: 'Source fixed',
      hint: 'The exchange’s get-quote page is session-based and often won’t open directly — opened the stable public mirror (Screener) for the same company.',
      fixed: true,
      original: url,
    }
  }

  // Session-based / expiring links — keep, but warn (we can't silently fix these).
  if (SESSION_MARKERS.test(url) || SEBI_UNSTABLE.test(url)) {
    return {
      state: 'unstable',
      href: url,
      label: 'Manual check needed',
      hint: 'This looks like a session-based or expiring link — it may open an “unavailable” page. Verify manually if it doesn’t load.',
      fixed: false,
      original: url,
    }
  }

  return { state: 'verified', href: url, label: 'Verified source', hint: 'Opens the source in a new tab.', fixed: false }
}

/** The href the UI should open for a raw source URL (stabilised), or null. */
export const sourceHref = (raw?: string | null): string | null => classifySource(raw).href

/** True when a raw source URL is safely clickable (verified / fixed / unstable). */
export const isLinkable = (raw?: string | null): boolean => classifySource(raw).href != null
