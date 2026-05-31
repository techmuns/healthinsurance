// ---------------------------------------------------------------------------
//  Earnings bridge — GWP → PAT reconciliation (quality of earnings).
//
//  Real, audited figures (₹ Cr) from Niva Bupa's filings, fetched via GitHub
//  Actions (scripts/ingest/fetch-distribution-mix.ts → committed extract):
//  Revenue Account (Form B-RA) + Profit & Loss Account (Form B-PL) of the
//  FY2024-25 annual report, with the FY24 comparative column.
//
//  Why this exists: the dashboard showed two conflicting reads — the ₹100
//  engine (statutory cost split = 101.2% combined) implied an underwriting
//  LOSS, while the core section (company-reported combined < 100%) implied a
//  profit. This bridge reconciles them on ONE basis: it shows that statutory
//  underwriting is a loss and PAT is investment-income-led.
//
//  Each IGAAP bridge ties exactly to reported PAT:
//    NEP − claims − commission − opex = underwriting result
//    underwriting result + investment income + other(net) = PAT (tax nil)
//
//  IFRS: only PAT is separately disclosed in the Indian filing (the granular
//  IFRS Revenue-Account split is not), so the IFRS side carries PAT + the
//  IGAAP→IFRS delta only — never a fabricated split.
// ---------------------------------------------------------------------------

export interface BridgeFigures {
  gwp: number
  reinsCeded: number
  nwp: number
  uprMovement: number // NEP − NWP (UPR release/build); negative = UPR built
  nep: number
  netClaims: number
  netCommission: number
  opex: number
  underwritingResult: number // official (NEP − claims − commission − opex − other)
  investmentIncome: number
  otherNet: number // other income − other expenses (and below-the-line), balancing
  pat: number
}

export interface EarningsBridgeYear {
  fy: string
  reported: boolean // true => audited annual report; false => interim/estimate
  igaap: BridgeFigures
  ifrsPat: number | null
}

// Source: Niva Bupa FY2024-25 Annual Report — Revenue Account + P&L (₹ Cr).
const NIVA_BRIDGE: EarningsBridgeYear[] = [
  {
    fy: 'FY25',
    reported: true,
    igaap: {
      gwp: 6762, reinsCeded: 1393, nwp: 5369, uprMovement: -475, nep: 4894,
      netClaims: 2997, netCommission: 1065, opex: 1083,
      underwritingResult: -250, investmentIncome: 480, otherNet: -16, pat: 214,
    },
    ifrsPat: 203,
  },
  {
    fy: 'FY24',
    reported: true,
    igaap: {
      gwp: 5608, reinsCeded: 1187, nwp: 4421, uprMovement: -610, nep: 3811,
      netClaims: 2252, netCommission: 748, opex: 1007,
      underwritingResult: -196, investmentIncome: 304, otherNet: -26, pat: 82,
    },
    ifrsPat: 106,
  },
]

const BRIDGE: Record<string, EarningsBridgeYear[]> = {
  'niva-bupa': NIVA_BRIDGE,
}

/** Years for which a full audited earnings bridge exists (latest first). */
export function getEarningsBridge(companyId: string): EarningsBridgeYear[] {
  return BRIDGE[companyId] ?? []
}

export function hasEarningsBridge(companyId: string): boolean {
  return (BRIDGE[companyId]?.length ?? 0) > 0
}

/** Earnings-source verdict for a year: investment-led vs core-led. */
export function earningsQuality(b: BridgeFigures): { label: string; investmentLed: boolean } {
  const investmentLed = b.underwritingResult < 0 && b.pat > 0
  return {
    investmentLed,
    label: investmentLed
      ? 'Investment-income-led — core underwriting is a loss'
      : b.underwritingResult > 0
        ? 'Core-led — underwriting itself is profitable'
        : 'Loss-making before investment income',
  }
}

export const BRIDGE_SOURCE = 'Annual report · Revenue A/c + P&L'

/** Direct link to the filing the bridge figures are extracted from. */
export const BRIDGE_SOURCE_URL =
  'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf'
