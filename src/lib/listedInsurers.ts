// ---------------------------------------------------------------------------
//  Listed insurers — the names we carry a daily NSE stock series for, the only
//  ones meaningful on the Historical Stock Movement tab. One source of truth for
//  the Historical renderer AND the company dropdown on that sheet.
//
//  Care Health is unlisted, so it's tracked via its LISTED PARENT, Religare
//  Enterprises (NSE: RELIGARE) — clearly labelled as such, never passed off as
//  Care's own stock. Keep the tickers in sync with the muns fetcher's TICKERS
//  list (scripts/ingest/fetch-muns-market-data.ts).
// ---------------------------------------------------------------------------

export interface ListedInsurer {
  /** Display label (the insurer of interest). */
  label: string
  /** NSE symbol of the series actually shown. */
  nse: string
  /** company_id the price rows are stored under, when it differs from the key
   *  (e.g. Care → its listed parent Religare). Defaults to the key. */
  dataId?: string
  /** Honest "tracked via …" note when the series is a listed parent's. */
  via?: string
}

export const LISTED_INSURERS: Record<string, ListedInsurer> = {
  'niva-bupa': { label: 'Niva Bupa Health Insurance', nse: 'NIVABUPA' },
  'star-health': { label: 'Star Health and Allied Insurance', nse: 'STARHEALTH' },
  'icici-lombard': { label: 'ICICI Lombard General Insurance', nse: 'ICICIGI' },
  'godigit': { label: 'Go Digit General Insurance', nse: 'GODIGIT' },
  'care-health': {
    label: 'Care Health Insurance',
    nse: 'RELIGARE',
    dataId: 'religare-enterprises',
    via: 'Religare Enterprises',
  },
}

/** Ordered ids — the dropdown order on the Historical tab. */
export const LISTED_INSURER_IDS = Object.keys(LISTED_INSURERS)

/** The company_id whose price rows back a given selection. */
export function priceDataId(companyId: string): string {
  return LISTED_INSURERS[companyId]?.dataId ?? companyId
}
