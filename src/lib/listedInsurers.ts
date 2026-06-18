// ---------------------------------------------------------------------------
//  Listed insurers — the names we carry a daily NSE stock series for, the only
//  ones meaningful on the Historical Stock Movement tab. One source of truth for
//  the Historical renderer AND the company dropdown on that sheet.
//
//  Care Health is unlisted, so the slot tracks its LISTED PARENT, Religare
//  Enterprises (NSE: RELIGARE) — shown and labelled AS Religare, with an honest
//  "Care Health's listed parent" note. Keep the tickers in sync with the muns
//  fetcher's TICKERS list (scripts/ingest/fetch-muns-market-data.ts).
//
//  Object order = dropdown order on the Historical tab: Niva, Star, Religare,
//  then the other listed companies.
// ---------------------------------------------------------------------------

export interface ListedInsurer {
  /** Full display label — the Historical view title. */
  label: string
  /** Compact label for the dropdown (falls back to the company short name). */
  short?: string
  /** NSE symbol of the series shown. */
  nse: string
  /** company_id the price rows are stored under, when it differs from the key
   *  (e.g. the Care slot stores rows under its parent Religare). */
  dataId?: string
  /** Honest context note (e.g. why a parent stands in for the insurer). */
  note?: string
}

export const LISTED_INSURERS: Record<string, ListedInsurer> = {
  'niva-bupa': { label: 'Niva Bupa Health Insurance', nse: 'NIVABUPA' },
  'star-health': { label: 'Star Health and Allied Insurance', nse: 'STARHEALTH' },
  'care-health': {
    label: 'Religare Enterprises',
    short: 'Religare',
    nse: 'RELIGARE',
    dataId: 'religare-enterprises',
    note: 'Care Health’s listed parent',
  },
  'icici-lombard': { label: 'ICICI Lombard General Insurance', nse: 'ICICIGI' },
  'godigit': { label: 'Go Digit General Insurance', nse: 'GODIGIT' },
}

/** Ordered ids — the dropdown order on the Historical tab. */
export const LISTED_INSURER_IDS = Object.keys(LISTED_INSURERS)

/** The company_id whose price rows back a given selection. */
export function priceDataId(companyId: string): string {
  return LISTED_INSURERS[companyId]?.dataId ?? companyId
}
