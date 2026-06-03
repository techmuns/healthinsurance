import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Sparkles,
  ShieldCheck,
  Shield,
  Gauge,
  IndianRupee,
  BarChart3,
  Cog,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  Check,
  MousePointerClick,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  Wallet,
  Scale,
  HeartPulse,
  Receipt,
  Banknote,
  PiggyBank,
  Percent,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SourceTag } from '@/components/SourceTag'
import { Drawer } from '@/components/Drawer'
import { SegmentedControl } from '@/components/SegmentedControl'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import { useActiveCompany, useFilters } from '@/state/filters'
import { labelInRange } from '@/lib/dateRange'
import { lookupProvenance } from '@/lib/dataLayer'
import type { Insurer, ProfitabilityFrequency, TimePeriod } from '@/data/types'
import { BasisExplainer, BASIS_TONE } from '@/components/AccountingBasisControls'
import { ProfitQualityCheck } from '@/components/ProfitQualityCheck'
import { getEarningsBridge } from '@/data/earningsBridge'
import {
  getBasisProfit,
  getBasisPatGrowth,
  latestAnnualWithPat,
  hasBasisData,
  periodLabel,
  Q4_PERIODS,
  BASIS_LABEL,
  BASIS_SOURCE_LABEL,
  BASIS_TRACKED_COMPANIES,
  type AccountingBasis,
  type BasisPeriod,
  type BasisProfit,
} from '@/data/accountingBasis'
import {
  profitabilityLenses,
  lensFromRoute,
  LENS_ORDER,
  type ProfitLens,
  type LensConfig,
  type LensStage,
  type StageSemantic,
  type StageAccent,
  type StageIcon,
} from '@/data/profitabilityLenses'

// ---------------------------------------------------------------------------
// Source provenance — resolve a real, clickable filing URL for a metric so each
// SourceTag links to the exact document the number came from. Annual combined
// ratio / solvency / PAT / expense are real (snapshot + provenance); quarterly
// splits and the cost breakdown are illustrative and carry no fake link.
// ---------------------------------------------------------------------------

interface ResolvedSource {
  source: string
  confidence: 'high' | 'medium' | 'low' | 'pending'
  provenance?: { source_name?: string; source_url?: string; fetched_at?: string | null }
  illustrative?: boolean
}

function realSource(metric: string, companyId: string): ResolvedSource | null {
  const p = lookupProvenance(`company.${metric}`, companyId, 'Annual')
  if (!p?.source_url) return null
  return {
    source: 'Company filing',
    confidence: p.confidence,
    provenance: { source_name: p.source_name, source_url: p.source_url, fetched_at: p.fetched_at },
  }
}

// Real IRDAI public-disclosure (statutory) combined ratio for the focal company,
// extracted and cross-validated from Niva Bupa's quarterly NL-form filings
// (see scripts/ingest/disclosure-extract.ts). The statutory basis is stricter
// than the company-reported headline (FY25: 101.2% vs 96.8%); standalone
// quarters swing seasonally and run above the full-year figure. Peers stay on
// the company-reported seed basis so the peer scorecard remains like-for-like.
interface StatutoryCR {
  statutory: number // full-year statutory combined ratio (latest complete FY)
  statutoryFY: string
  reported: number // company-reported combined ratio, same period
  reportedFY: string
  annual: { fy: string; cr: number }[]
  quarters: { label: string; cr: number }[]
  sourceUrl: string
}

const STATUTORY_CR: Record<string, StatutoryCR> = {
  'niva-bupa': {
    statutory: 101.2,
    statutoryFY: 'FY25',
    reported: 96.8,
    reportedFY: 'FY25',
    annual: [
      { fy: 'FY22', cr: 107 },
      { fy: 'FY23', cr: 97 },
      { fy: 'FY24', cr: 99 },
      { fy: 'FY25', cr: 101.2 },
      { fy: 'FY26', cr: 103.4 },
    ],
    quarters: [
      { label: 'Q1 FY25', cr: 106 },
      { label: 'Q2 FY25', cr: 101.3 },
      { label: 'Q3 FY25', cr: 108.29 },
      { label: 'Q4 FY25', cr: 92.78 },
      { label: 'Q1 FY26', cr: 116.97 },
      { label: 'Q2 FY26', cr: 111.72 },
      { label: 'Q3 FY26', cr: 108.19 },
      { label: 'Q4 FY26', cr: 86.12 },
    ],
    sourceUrl: 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
  },
}

// Real FY25 cost split for the focal company, decomposed from Niva Bupa's IRDAI
// public disclosure (Mar-2025, full-year/YTD column of the NL-form analytical
// ratios):
//   • loss (claims)  = Net Incurred Claims to Net Earned Premium = 61.22%
//   • commission     = Net Commission Ratio                      = 19.83%
//   • expense (opex) = Combined Ratio − claims − commission      = 20.17%
// The three sum to the real statutory combined ratio (101.22%), so the ₹100
// engine reconciles with the combined-ratio headline shown above it. Opex is the
// exact arithmetic residual of the published combined ratio (no separate opex
// ratio is published in this form). Peers are omitted — no verified cost split
// has been sourced for them yet — so their cards render an honest "Data pending"
// rather than a fabricated number.
const COST_RATIOS: Record<string, { loss: number; commission: number; expense: number }> = {
  'niva-bupa': { loss: 61.22, commission: 19.83, expense: 20.17 },
}

// Net margin from REAL audited data only: latest fiscal year that reports both
// PAT and GWP → PAT / GWP. Returns null (honest "pending") when unreported —
// never a fabricated quarterly sum. Same-year basis so it stays consistent with
// the selected Data Range.
function getMarginMetrics(series: AnnualPoint[]): { netMargin: number | null; latestPat: number | null; latestFy: string | null } {
  const withBoth = series.filter((p) => p.pat != null && p.gwp != null && p.gwp > 0)
  const latest = withBoth[withBoth.length - 1]
  if (!latest) return { netMargin: null, latestPat: null, latestFy: null }
  return {
    netMargin: Math.round((latest.pat! / latest.gwp!) * 1000) / 10,
    latestPat: latest.pat!,
    latestFy: latest.fy,
  }
}

// ---------------------------------------------------------------------------
// Palette + tone helpers
// ---------------------------------------------------------------------------

const PALETTE = {
  navy: '#27457E',
  navyDeep: '#172B4D',
  teal: '#168E8E',
  emerald: '#2F855A',
  emeraldSoft: '#CFE7D9',
  amber: '#B7791F',
  amberSoft: '#F4DFAE',
  coral: '#B94A48',
  coralSoft: '#EFC8C7',
  champagne: '#B68B3A',
  champagneSoft: '#F4ECDB',
  ice: '#F4F7FC',
  softBlue: '#EEF4FF',
  border: '#E8EBF1',
} as const

type Tone = 'positive' | 'warning' | 'negative' | 'neutral' | 'navy'

function combinedTone(v: number): { label: string; tone: Tone } {
  if (v < 100) return { label: 'Strong', tone: 'positive' }
  if (v <= 105) return { label: 'Watch', tone: 'warning' }
  return { label: 'Weak', tone: 'negative' }
}

// ---------------------------------------------------------------------------
// Chart building blocks
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Real annual snapshot series (focal company) — drives the new story layers.
// Only real reported values are used; missing inputs stay null (never 0) and
// surface as compact "pending" states per the dashboard's data-integrity rules.
// ---------------------------------------------------------------------------

interface AnnualPoint {
  fy: string
  gwp: number | null
  nep: number | null
  pat: number | null
  combinedRatio: number | null
  expenseRatio: number | null
  solvency: number | null
}

// Plausibility bounds — several non-focal rows in the snapshot still carry
// placeholder/unit-error values (e.g. gwp 23, combined_ratio 1.15, nep 135982).
// Anything outside a sane range is treated as missing (null) rather than shown,
// so the story layers degrade to honest "pending" states instead of garbage.
function inRange(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}

function getAnnualSeries(companyId: string): AnnualPoint[] {
  return (annualSnapshot.data as Array<Record<string, unknown>>)
    .filter((r) => r.company_id === companyId)
    .map((r) => ({
      fy: String(r.fiscal_year),
      gwp: inRange(r.gwp, 100, 100000),
      nep: inRange(r.nep, 100, 100000),
      pat: typeof r.pat === 'number' && Number.isFinite(r.pat) && Math.abs(r.pat) <= 20000 ? r.pat : null,
      combinedRatio: inRange(r.combined_ratio, 40, 250),
      expenseRatio: inRange(r.expense_ratio, 2, 90),
      solvency: inRange(r.solvency_ratio, 0.3, 8),
    }))
    .sort((a, b) => a.fy.localeCompare(b.fy))
}

/**
 * Derived underwriting result (₹ Cr) = NEP × (1 − combined ratio). A transparent,
 * standard proxy for core insurance profit before investment/other income; used
 * because net claims / commission line items aren't separately reported per year.
 * Returns null when either input is missing (never coerced to 0).
 */
function underwritingResult(p: AnnualPoint): number | null {
  if (p.nep == null || p.combinedRatio == null) return null
  return Math.round(p.nep * (1 - p.combinedRatio / 100))
}

const crc = (v: number) => `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')} Cr`

// Audited core underwriting result (₹ Cr) by fiscal year, from the earnings
// bridge (real Revenue-Account figures). This is the authoritative core-profit
// number — the SAME one the Profit Quality Check and the GWP→PAT waterfall use —
// so the page never shows underwriting as a profit in one place and a loss in
// another. Empty for companies without an audited bridge.
function bridgeUwByFy(companyId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const y of getEarningsBridge(companyId)) out[y.fy] = y.igaap.underwritingResult
  return out
}

// Core underwriting result for a company-year: prefer the audited bridge figure
// where it exists, else fall back to the transparent NEP × (1 − combined ratio)
// proxy. null (honest "pending") when neither input is available.
function underwritingFor(companyId: string, p: AnnualPoint, bridge?: Record<string, number>): number | null {
  const b = bridge ?? bridgeUwByFy(companyId)
  return p.fy in b ? b[p.fy] : underwritingResult(p)
}

// ---------------------------------------------------------------------------
// Accounting-basis lens — two real bases: IGAAP / Statutory (the default) and
// IFRS. IGAAP / Statutory IS the dashboard's existing statutory data path, so
// every company keeps working and `isIfrs` is false. IFRS is an overlay sourced
// from the insurers' IFRS accounts (annual report / investor presentation):
// PAT, PAT margin, PAT growth and the combined / claims / expense ratios switch
// to the IFRS dataset, with NA where a period is unreported. ROE on IFRS is NA —
// there is no IFRS equity to compute it cleanly, and it is never derived from
// statutory net worth. The granular cost-split and trajectory engines stay on
// the statutory disclosure basis (the only basis with that granularity) — never
// silently mixed; a banner makes that explicit when IFRS is selected.
// ---------------------------------------------------------------------------
interface BasisCtx {
  basis: AccountingBasis
  /** true only for IFRS — the overlay. IGAAP / Statutory uses the base path. */
  isIfrs: boolean
  tracked: boolean
  period: BasisPeriod | null
  pLabel: string
  /** Source label for the selected basis (Company filing / Annual report). */
  sourceLabel: string
  /** Lens-aware "Basis: …" wording (set by the page from the active lens). */
  basisLabel: string
  pat: number | null
  patMargin: number | null
  patGrowth: number | null
  combinedRatio: number | null
  claimsRatio: number | null
  expenseRatio: number | null
  roe: number | null
}

function buildBasisCtx(company: Insurer, basis: AccountingBasis): BasisCtx {
  const tracked = hasBasisData(company.id)
  const sourceLabel = BASIS_SOURCE_LABEL[basis]
  // Default wording; the page overrides `basisLabel` with the active lens label.
  const basisLabel = BASIS_LABEL[basis]
  if (basis === 'igaap') {
    // IGAAP / Statutory = the existing statutory data path; components use their
    // own reported-statutory values. No overlay or period anchor needed.
    return { basis, isIfrs: false, tracked, period: null, pLabel: 'FY25', sourceLabel, basisLabel, pat: null, patMargin: null, patGrowth: null, combinedRatio: null, claimsRatio: null, expenseRatio: null, roe: null }
  }
  // Anchor IFRS to FY25 — the page's reported year — so switching basis never
  // silently jumps the period to FY26. Fall back to the latest reported IFRS
  // year only if FY25 IFRS PAT is unavailable (never a hardcoded FY26 default).
  const period: BasisPeriod = getBasisProfit(company.id, 'ifrs', 'FY25')?.pat != null
    ? 'FY25'
    : latestAnnualWithPat(company.id, 'ifrs') ?? 'FY25'
  const bp = getBasisProfit(company.id, 'ifrs', period)
  return {
    basis,
    isIfrs: true,
    tracked,
    period,
    pLabel: periodLabel(period),
    sourceLabel,
    basisLabel,
    pat: bp?.pat ?? null,
    patMargin: bp?.patMarginGwp ?? null,
    patGrowth: getBasisPatGrowth(company.id, 'ifrs', period),
    combinedRatio: bp?.combinedRatio ?? null,
    claimsRatio: bp?.claimsRatio ?? null,
    expenseRatio: bp?.expenseRatio ?? null,
    roe: null, // IFRS ROE not available (no IFRS equity reported) — never derived
  }
}

// Lens-aware "Basis: …" pill — same compact, tone-coded style as the global
// BasisPill, but the wording comes from the active lens so it never reads as two
// separate selected bases. e.g. "Basis: Statutory reporting · IGAAP" / "Basis:
// Ind AS / IFRS-style".
function LensBasisPill({ basis, label, className = '' }: { basis: AccountingBasis; label: string; className?: string }) {
  const tone = BASIS_TONE[basis]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold leading-none ${className}`}
      style={{ borderColor: `${tone}55`, background: `${tone}12`, color: tone }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
      Basis: {label}
    </span>
  )
}


// Compact pending state — never a large blank box. Says exactly what's missing.
function PendingNote({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-soft-border bg-ice/50 px-3 py-2.5 text-[11px] leading-snug text-ink-secondary">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-blue/60" />
      <span>{children}</span>
    </div>
  )
}

// ─── (B) Profitability Story Map — the clickable navigation brain ────────────
// The five-node infographic now *controls* the page: clicking a node reveals
// only that node's charts, status and investor read below. Each metric appears
// exactly once; values reuse the same honest derivations so the story stays
// dynamic across companies. Missing inputs render as "n/a"/"Pending", never 0.

// A story-stage id is the lens config's semantic — the same key drives the node
// value, status, detail body and investor read, so the map and drill-down can
// never disagree.
type NodeId = StageSemantic

type StatusTone = 'positive' | 'teal' | 'warning' | 'negative' | 'navy'
interface EngineStage {
  id: NodeId
  n: number
  label: string
  metricLabel: string
  value: string
  missing: boolean
  color: string
  Icon: LucideIcon
  /** Short question shown inside the process block. */
  explore: string
  /** Longer question shown in the "Viewing" strip. */
  line: string
  /** One small checkpoint status — Strong / Improving / Watch / Weak. */
  badge: { label: string; tone: StatusTone }
}

const ORANGE = '#BE823F' // shareholder return — muted amber (monitor, not danger)
const GOLD = '#B68B3A' // profit conversion — champagne gold (value creation, not warning)
const DEEP_GREEN = '#2F855A' // capital support — emerald (safety, resilience)

// Tone → ink colour for the compact checkpoint status pills on the Story Map.
const STATUS_TINT: Record<StatusTone, string> = {
  positive: PALETTE.emerald,
  teal: PALETTE.teal,
  warning: PALETTE.amber,
  negative: PALETTE.coral,
  navy: PALETTE.navy,
}

// Lens stage accent → hex (palette-aligned) and icon → lucide component. Keyed
// off the config so a stage's colour/icon live in one place.
const ACCENT_HEX: Record<StageAccent, string> = {
  emerald: PALETTE.emerald,
  teal: PALETTE.teal,
  gold: GOLD,
  orange: ORANGE,
  deepGreen: DEEP_GREEN,
  navy: PALETTE.navy,
  coral: PALETTE.coral,
}
const STAGE_ICON: Record<StageIcon, LucideIcon> = {
  premium: Wallet,
  claims: HeartPulse,
  expense: Receipt,
  combined: ShieldCheck,
  result: Gauge,
  conversion: IndianRupee,
  returns: BarChart3,
  capital: Shield,
  revenue: Banknote,
  service: Scale,
  finance: PiggyBank,
  profit: IndianRupee,
  margin: Percent,
}

// Latest gross / net earned premium (₹ Cr) for the premium stage — prefers the
// audited earnings bridge (focal company) so it matches the premium flow card,
// else the annual snapshot. null when unreported (never 0).
function premiumFigures(companyId: string, series: AnnualPoint[]): { gwp: number | null; nep: number | null } {
  const bridge = getEarningsBridge(companyId)
  const inRange = new Set(series.map((p) => p.fy))
  const yr = bridge.find((y) => inRange.has(y.fy)) ?? bridge[0]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  return {
    gwp: yr?.igaap.gwp ?? latest?.gwp ?? null,
    nep: yr?.igaap.nep ?? latest?.nep ?? null,
  }
}

// Investment income (₹ Cr) by fiscal year, from the audited earnings bridge —
// the investment / finance-result support. Empty for non-bridge companies.
function bridgeInvestmentByFy(companyId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const y of getEarningsBridge(companyId)) out[y.fy] = y.igaap.investmentIncome
  return out
}

// Single source of truth for a checkpoint's status — Strong / Improving / Watch
// / Weak (or n/a / NA / Pending). Shared by the Story Map node badges AND the
// detail LensHeader, so the map and the drill-down can never disagree. Combined
// ratio leads the focal company's statutory figure (same as the headline KPI).
// GWP growth (YoY, %) for the premium stage badge; null with < 2 reported years.
function premiumGrowth(series: AnnualPoint[]): number | null {
  const g = series.filter((p) => p.gwp != null)
  if (g.length < 2) return null
  const a = g[g.length - 2].gwp!
  const b = g[g.length - 1].gwp!
  return a ? ((b - a) / a) * 100 : null
}

// Single source of truth for a stage's checkpoint status — Strong / Improving /
// Watch / Weak (or a quiet reported/pending marker). Shared by the Story Map
// node badge AND the detail LensHeader, so they can never disagree. Each stage's
// status reads from the metric that belongs to its lens (no cross-basis mixing).
function nodeStatus(id: NodeId, company: Insurer, series: AnnualPoint[], ctx: BasisCtx): { label: string; tone: StatusTone } {
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const igaap = getBasisProfit(company.id, 'igaap', 'FY25')
  const cost = COST_RATIOS[company.id]
  const patYoY = (() => {
    const pats = series.filter((p) => p.pat != null)
    return pats.length >= 2 && pats[pats.length - 2].pat ? ((pats[pats.length - 1].pat! - pats[pats.length - 2].pat!) / Math.abs(pats[pats.length - 2].pat!)) * 100 : null
  })()
  switch (id) {
    case 'premium':
    case 'ifrs-revenue': {
      const g = premiumGrowth(series)
      return g == null ? { label: 'Reported', tone: 'navy' } : g >= 15 ? { label: 'Scaling', tone: 'positive' } : g > 0 ? { label: 'Growing', tone: 'teal' } : { label: 'Flat', tone: 'warning' }
    }
    case 'claims': {
      const v = igaap?.claimsRatio ?? cost?.loss ?? null
      if (v == null) return { label: 'Reported', tone: 'navy' }
      return v < 65 ? { label: 'Contained', tone: 'positive' } : v <= 72 ? { label: 'Watch', tone: 'warning' } : { label: 'High', tone: 'negative' }
    }
    case 'expense': {
      const v = igaap?.expenseRatio ?? (cost ? cost.commission + cost.expense : null)
      if (v == null) return { label: 'Reported', tone: 'navy' }
      return v < 35 ? { label: 'Lean', tone: 'positive' } : v <= 42 ? { label: 'Watch', tone: 'warning' } : { label: 'High', tone: 'negative' }
    }
    case 'combined': {
      const cr = STATUTORY_CR[company.id]?.statutory ?? (company.combinedRatio > 0 ? company.combinedRatio : null)
      if (cr == null) return { label: 'n/a', tone: 'navy' }
      return cr < 100 ? { label: 'Strong', tone: 'positive' } : cr <= 105 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
    }
    case 'underwriting-result': {
      const uw = latest ? underwritingFor(company.id, latest) : null
      return uw == null ? { label: 'Pending', tone: 'navy' } : uw > 0 ? { label: 'Strong', tone: 'positive' } : { label: 'Weak', tone: 'negative' }
    }
    case 'conversion': {
      const pat = getMarginMetrics(series).latestPat
      if (pat == null) return { label: 'Pending', tone: 'navy' }
      return patYoY != null && patYoY >= 20 ? { label: 'Scaling', tone: 'positive' } : patYoY != null && patYoY > 0 ? { label: 'Rising', tone: 'teal' } : pat > 0 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
    }
    case 'returns':
    case 'ifrs-margin': {
      const pm = id === 'ifrs-margin' ? ctx.patMargin : getMarginMetrics(series).netMargin
      if (pm == null) return { label: 'Reported', tone: 'navy' }
      return pm > 5 ? { label: 'Strong', tone: 'positive' } : pm > 0 ? { label: 'Thin', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
    }
    case 'capital': {
      const s = company.solvency
      return s <= 0 ? { label: 'n/a', tone: 'navy' } : s >= 2 ? { label: 'Strong', tone: 'positive' } : s >= 1.5 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
    }
    case 'ifrs-service': {
      const cr = ctx.combinedRatio
      if (cr == null) return { label: 'Reported', tone: 'navy' }
      return cr < 100 ? { label: 'Strong', tone: 'positive' } : cr <= 105 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
    }
    case 'ifrs-finance': {
      const inv = getEarningsBridge(company.id)[0]?.igaap.investmentIncome ?? null
      return inv == null ? { label: 'Reported', tone: 'navy' } : inv > 0 ? { label: 'Contributing', tone: 'positive' } : { label: 'Flat', tone: 'warning' }
    }
    case 'ifrs-profit': {
      const pat = ctx.pat
      const g = ctx.patGrowth
      if (pat == null) return { label: 'Reported', tone: 'navy' }
      if (g == null) return pat > 0 ? { label: 'In profit', tone: 'positive' } : { label: 'Loss', tone: 'negative' }
      return g >= 15 ? { label: 'Scaling', tone: 'positive' } : g > 0 ? { label: 'Rising', tone: 'teal' } : pat > 0 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
    }
  }
}

// Resolve a single lens stage to its node value + missing flag + checkpoint
// badge. Each stage reads ONLY the metric that belongs to its lens — no
// cross-basis mixing, missing values omitted (never 0). Quarterly/Monthly show a
// value only for metrics with a standalone-quarter source; the rest are pending.
function resolveStage(
  stage: LensStage,
  company: Insurer,
  series: AnnualPoint[],
  ctx: BasisCtx,
  period: TimePeriod,
  quarter: BasisPeriod | null,
): { value: string; missing: boolean; badge: { label: string; tone: StatusTone } } {
  const id = stage.semantic
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const cost = COST_RATIOS[company.id]
  const igaapFY = getBasisProfit(company.id, 'igaap', 'FY25')
  const pending = { label: 'Pending', tone: 'navy' as StatusTone }
  const crBadge = (v: number) => (v < 100 ? { label: 'Strong', tone: 'positive' as StatusTone } : v <= 105 ? { label: 'Watch', tone: 'warning' as StatusTone } : { label: 'Weak', tone: 'negative' as StatusTone })
  const mBadge = (v: number) => (v > 5 ? { label: 'Strong', tone: 'positive' as StatusTone } : v > 0 ? { label: 'Thin', tone: 'warning' as StatusTone } : { label: 'Weak', tone: 'negative' as StatusTone })
  const patBadge = (v: number) => (v > 0 ? { label: 'In profit', tone: 'positive' as StatusTone } : { label: 'Loss', tone: 'negative' as StatusTone })
  const claimsBadge = (v: number) => (v < 65 ? { label: 'Contained', tone: 'positive' as StatusTone } : v <= 72 ? { label: 'Watch', tone: 'warning' as StatusTone } : { label: 'High', tone: 'negative' as StatusTone })
  const expenseBadge = (v: number) => (v < 35 ? { label: 'Lean', tone: 'positive' as StatusTone } : v <= 42 ? { label: 'Watch', tone: 'warning' as StatusTone } : { label: 'High', tone: 'negative' as StatusTone })
  const pct = (v: number | null, badge: (n: number) => { label: string; tone: StatusTone }) =>
    v == null ? { value: 'Pending', missing: true, badge: pending } : { value: `${v.toFixed(1)}%`, missing: false, badge: badge(v) }
  const rupee = (v: number | null, badge: (n: number) => { label: string; tone: StatusTone }) =>
    v == null ? { value: 'Pending', missing: true, badge: pending } : { value: crc(v), missing: false, badge: badge(v) }

  // Quarterly — only ratio + PAT metrics have a standalone-quarter cell.
  if (period !== 'Annual') {
    if (!quarter) return { value: 'Pending', missing: true, badge: pending }
    const ig = getBasisProfit(company.id, 'igaap', quarter)
    const ifr = getBasisProfit(company.id, 'ifrs', quarter)
    switch (id) {
      case 'claims': return pct(ig?.claimsRatio ?? null, claimsBadge)
      case 'expense': return pct(ig?.expenseRatio ?? null, expenseBadge)
      case 'combined': return pct(ig?.combinedRatio ?? null, crBadge)
      case 'conversion': return rupee(ig?.pat ?? null, patBadge)
      case 'returns': return pct(ig?.patMarginGwp ?? null, mBadge)
      case 'ifrs-service': return pct(ifr?.combinedRatio ?? null, crBadge)
      case 'ifrs-profit': return rupee(ifr?.pat ?? null, patBadge)
      case 'ifrs-margin': return pct(ifr?.patMarginGwp ?? null, mBadge)
      default: return { value: 'Pending', missing: true, badge: pending }
    }
  }

  // Annual — the full read. Badge comes from the shared nodeStatus.
  const badge = nodeStatus(id, company, series, ctx)
  switch (id) {
    case 'premium':
    case 'ifrs-revenue': {
      const v = premiumFigures(company.id, series).nep
      return { value: v == null ? 'Pending' : crc(v), missing: v == null, badge }
    }
    case 'claims': {
      const v = igaapFY?.claimsRatio ?? cost?.loss ?? null
      return { value: v == null ? 'Pending' : `${v.toFixed(1)}%`, missing: v == null, badge }
    }
    case 'expense': {
      const v = igaapFY?.expenseRatio ?? (cost ? cost.commission + cost.expense : null)
      return { value: v == null ? 'Pending' : `${v.toFixed(1)}%`, missing: v == null, badge }
    }
    case 'combined': {
      const cr = STATUTORY_CR[company.id]?.statutory ?? (company.combinedRatio > 0 ? company.combinedRatio : null)
      return { value: cr == null ? 'n/a' : `${cr.toFixed(1)}%`, missing: cr == null, badge }
    }
    case 'underwriting-result': {
      const uw = latest ? underwritingFor(company.id, latest) : null
      return { value: uw == null ? 'Pending' : crc(uw), missing: uw == null, badge }
    }
    case 'conversion': {
      const pat = getMarginMetrics(series).latestPat
      return { value: pat == null ? 'Pending' : crc(pat), missing: pat == null, badge }
    }
    case 'returns': {
      const m = getMarginMetrics(series).netMargin
      return { value: m == null ? 'Pending' : `${m.toFixed(1)}%`, missing: m == null, badge }
    }
    case 'capital': {
      const s = company.solvency
      return { value: s > 0 ? `${s.toFixed(2)}x` : 'n/a', missing: !(s > 0), badge }
    }
    case 'ifrs-service': {
      const cr = ctx.combinedRatio
      return { value: cr == null ? 'Pending' : `${cr.toFixed(1)}%`, missing: cr == null, badge }
    }
    case 'ifrs-finance': {
      const inv = getEarningsBridge(company.id)[0]?.igaap.investmentIncome ?? null
      return { value: inv == null ? 'Pending' : crc(inv), missing: inv == null, badge }
    }
    case 'ifrs-profit': {
      const pat = ctx.pat
      return { value: pat == null ? 'Pending' : crc(pat), missing: pat == null, badge }
    }
    case 'ifrs-margin': {
      const m = ctx.patMargin
      return { value: m == null ? 'Pending' : `${m.toFixed(1)}%`, missing: m == null, badge }
    }
  }
}

// Build the ordered story-map stages for the active lens from its config — the
// stages (and which metric leads each) change per accounting basis.
function buildLensStages(
  lens: LensConfig,
  company: Insurer,
  series: AnnualPoint[],
  ctx: BasisCtx,
  period: TimePeriod,
  quarter: BasisPeriod | null,
): EngineStage[] {
  return lens.stages.map((stage, i) => {
    const r = resolveStage(stage, company, series, ctx, period, quarter)
    return {
      id: stage.semantic,
      n: i + 1,
      label: stage.label,
      metricLabel: stage.metricLabel,
      value: r.value,
      missing: r.missing,
      color: ACCENT_HEX[stage.accent],
      Icon: STAGE_ICON[stage.icon],
      explore: stage.blockQuestion,
      line: stage.line,
      badge: r.badge,
    }
  })
}

function ProfitabilityEngine({ company, series, stages, selectedId, onSelect, basis, basisLabel, title, subtitle }: { company: Insurer; series: AnnualPoint[]; stages: EngineStage[]; selectedId: NodeId; onSelect: (id: NodeId) => void; basis: AccountingBasis; basisLabel: string; title: string; subtitle: string }) {
  const active = stages.find((s) => s.id === selectedId) ?? stages[0]
  const selectedIndex = stages.findIndex((s) => s.id === selectedId)

  return (
    <section className="card-surface p-5">
      {/* Header — Story Map title, plain-English direction, interactive cue */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: PALETTE.champagneSoft }}>
            <Cog className="h-4 w-4" style={{ color: PALETTE.champagne }} />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-champagne">{title}</p>
            <p className="mt-0.5 max-w-md text-[11.5px] leading-snug text-ink-secondary">{subtitle}</p>
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-ice/70 px-2.5 py-0.5 text-[9.5px] font-medium text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.champagne }} />
              {stages.length} stages · click to explore
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <LensBasisPill basis={basis} label={basisLabel} />
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold text-navy-primary" style={{ borderColor: '#D6E2FA', background: PALETTE.softBlue }}>
            <MousePointerClick className="h-3.5 w-3.5" style={{ color: PALETTE.champagne }} />
            Pick a stage
          </span>
        </div>
      </div>

      {/* Flow — connected process blocks left→right; chevrons brighten up to the
          active stage. Each block: number badge + icon capsule + title +
          one-line question + main metric + status pill. */}
      <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0">
        {stages.map((s, i) => {
          const selected = s.id === selectedId
          const reached = i <= selectedIndex
          return (
            <Fragment key={s.id}>
              {i > 0 && (
                <div aria-hidden className="hidden shrink-0 items-center justify-center px-1 md:flex">
                  <ChevronRight className="h-5 w-5" strokeWidth={2.25} style={{ color: reached ? s.color : '#CBD5E1' }} />
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={selected}
                aria-label={`View ${s.label} — ${s.metricLabel} ${s.value}`}
                className="group relative flex min-w-0 flex-1 cursor-pointer flex-col rounded-2xl border px-3 py-3 text-left outline-none transition-all duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-navy-primary/35"
                style={{
                  borderColor: selected ? s.color : `${s.color}33`,
                  borderWidth: selected ? 1.5 : 1,
                  background: selected ? `${s.color}14` : `${s.color}07`,
                  boxShadow: selected ? `0 10px 24px ${s.color}33` : undefined,
                  transform: selected ? 'translateY(-2px)' : undefined,
                  opacity: s.missing && !selected ? 0.72 : 1,
                }}
              >
                {/* Number badge + icon capsule */}
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm" style={{ background: s.color }}>
                    {s.n}
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${s.color}1f` }}>
                    <s.Icon className="h-4 w-4" style={{ color: s.color }} strokeWidth={selected ? 2 : 1.7} />
                  </span>
                </div>

                {/* Title + one-line question */}
                <p className="mt-2.5 font-display text-[13px] leading-tight text-navy-deep" style={{ fontWeight: selected ? 700 : 600 }}>
                  {s.label}
                </p>
                <p className="mt-0.5 min-h-[26px] text-[10px] leading-snug text-ink-secondary">{s.explore}</p>

                {/* Main metric */}
                <p className="mt-2 text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{s.metricLabel}</p>
                {s.missing ? (
                  <p className="font-display text-[15px] italic leading-none text-ink-secondary/80">{s.value}</p>
                ) : (
                  <p className="font-display text-[18px] leading-none" style={{ color: s.color }}>
                    {s.value}
                  </p>
                )}

                {/* Status pill */}
                <span
                  className="mt-2 inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: STATUS_TINT[s.badge.tone], background: `${STATUS_TINT[s.badge.tone]}14` }}
                >
                  <span className="h-1 w-1 rounded-full bg-current opacity-80" />
                  {s.badge.label}
                </span>
              </button>
            </Fragment>
          )
        })}
      </div>

      {/* Active-stage status bar — a control surface (navy + gold), updates on click only */}
      <div className="mt-6 flex justify-center">
        <div
          className="flex w-full max-w-2xl flex-col items-center gap-0.5 rounded-xl border px-5 py-2.5 text-center"
          style={{ borderColor: `${active.color}33`, background: `linear-gradient(135deg, ${active.color}12 0%, ${active.color}05 100%)` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: active.color }} />
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Viewing</span>
            <span aria-hidden className="text-ink-secondary/40">·</span>
            <span className="font-display text-[13px] leading-none text-navy-deep">{active.label}</span>
          </div>
          <p className="text-[11px] leading-snug text-ink-secondary">{active.line}</p>
        </div>
      </div>

      {/* Source — links to the real filing for the headline combined ratio */}
      <div className="mt-4 flex justify-end">
        {(() => {
          const s = realSource('combined_ratio', company.id) ?? realSource('solvency_ratio', company.id)
          return s ? (
            <SourceTag source={s.source} period={series[series.length - 1]?.fy ?? 'FY25'} confidence={s.confidence} provenance={s.provenance} />
          ) : (
            <SourceTag source="Company filing" period={series[series.length - 1]?.fy ?? 'FY25'} confidence="high" />
          )
        })()}
      </div>
    </section>
  )
}

// ─── Per-node Investor Read — So what? / Why / What it means / Watch next ─────
interface NodeRead {
  soWhat: string
  why: string
  meaning: string
  watch: string
}

// Per-stage Investor Read — So what? / Why / What it means / Watch next. Each
// read uses ONLY the metric that belongs to its lens (statutory cost split &
// solvency on the igaap path; IFRS PAT/combined on the IFRS path), so the read
// never mixes bases. Returns one NodeRead for the requested stage semantic.
function nodeRead(id: NodeId, company: Insurer, series: AnnualPoint[], ctx: BasisCtx): NodeRead {
  const cost = COST_RATIOS[company.id]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const igaapFY = getBasisProfit(company.id, 'igaap', 'FY25')
  const uw = latest ? underwritingFor(company.id, latest) : null
  const solvency = company.solvency
  const crLead = STATUTORY_CR[company.id]?.statutory ?? (company.combinedRatio > 0 ? company.combinedRatio : null)
  const aboveBE = crLead != null && crLead >= 100
  const pf = premiumFigures(company.id, series)
  const g = premiumGrowth(series)
  const mm = getMarginMetrics(series)
  const claims = igaapFY?.claimsRatio ?? cost?.loss ?? null
  const expense = igaapFY?.expenseRatio ?? (cost ? cost.commission + cost.expense : null)
  const inv = getEarningsBridge(company.id)[0]?.igaap.investmentIncome ?? null

  switch (id) {
    case 'premium':
      return {
        soWhat: pf.nep == null
          ? 'Premium figures pending.'
          : `Net earned premium has scaled to ${crc(pf.nep)}${g != null ? ` (+${g.toFixed(0)}% YoY)` : ''} — but conversion stays ${aboveBE ? 'weak while the combined ratio is above 100%' : 'the question downstream'}.`,
        why: pf.gwp != null && pf.nep != null
          ? `Of ${crc(pf.gwp)} written, ${crc(pf.nep)} is net earned after reinsurance and the unearned-premium reserve.`
          : 'Gross premium − reinsurance ceded − change in unearned reserve = net earned premium.',
        meaning: 'Net earned premium is the base every later stage works from.',
        watch: 'The trend above — growth rate, retention and the reinsurance share.',
      }
    case 'claims':
      return {
        soWhat: claims == null ? 'Claims ratio pending.' : `Claims take ₹${claims.toFixed(0)} of every ₹100 of premium — the largest single cost.`,
        why: claims == null ? 'Net incurred claims ÷ net earned premium.' : `Net incurred claims are ${claims.toFixed(1)}% of net earned premium.`,
        meaning: 'A rising claims trend pushes the combined ratio up and squeezes underwriting.',
        watch: 'The claims-ratio trend above versus a ~65% comfort band.',
      }
    case 'expense':
      return {
        soWhat: expense == null ? 'Expense ratio pending.' : `Running and selling costs take ₹${expense.toFixed(0)} of every ₹100 — ${expense < 40 ? 'easing as the book scales' : 'still heavy'}.`,
        why: cost ? `Commission ${cost.commission.toFixed(1)}% + operating cost ${cost.expense.toFixed(1)}% of premium.` : 'Commission + operating expense ÷ net premium.',
        meaning: 'Expense discipline is the clearest lever to push the combined ratio below 100%.',
        watch: 'The expense-ratio trend above — falling as premium scales is the goal.',
      }
    case 'combined':
      return {
        soWhat: crLead == null
          ? `${company.shortName} is a life carrier — read returns and capital.`
          : crLead < 100
            ? `Combined ratio ${crLead.toFixed(1)}% — claims and costs stay inside ₹100, so underwriting earns a surplus.`
            : `Combined ratio ${crLead.toFixed(1)}% — above ₹100, so underwriting alone loses money.`,
        why: claims != null && expense != null ? `Claims ${claims.toFixed(0)}% + costs ${expense.toFixed(0)}% = the combined ratio.` : 'Claims + commission + opex ÷ net premium.',
        meaning: aboveBE ? 'Profit still leans on investment income, not core underwriting.' : 'Underwriting can stand on its own, before investment income.',
        watch: 'The combined-ratio trend above versus the 100% break-even.',
      }
    case 'underwriting-result':
      return {
        soWhat: uw == null
          ? 'Underwriting result pending NEP and combined ratio.'
          : uw > 0
            ? 'Insurance itself makes money — high-quality profit.'
            : `Core underwriting is a loss (${crc(uw)}); PAT leans on investment income.`,
        why: uw == null ? 'Needs NEP and combined ratio.' : `Premium earned − claims − commission − operating cost = ${crc(uw)}.`,
        meaning: 'The profit from insurance alone, before investments — the trend above shows the path.',
        watch: 'Is the underwriting loss narrowing toward break-even?',
      }
    case 'conversion':
      return {
        soWhat: mm.latestPat == null
          ? 'PAT pending.'
          : `PAT is ${crc(mm.latestPat)} — the trend above shows the climb, but it is investment-income-led while underwriting is a loss.`,
        why: 'Claims, commission and opex absorb most of the premium; investment income carries the rest to PAT.',
        meaning: 'Better expense leverage and a smaller underwriting loss lift the quality of this profit.',
        watch: 'PAT growth versus underwriting turning positive.',
      }
    case 'returns':
      return {
        soWhat: mm.netMargin == null
          ? 'PAT margin pending.'
          : `Only ${mm.netMargin.toFixed(1)}% of premium reaches the shareholder — a thin margin while ROE is held back by the large post-IPO equity base.`,
        why: 'PAT margin = PAT ÷ GWP. ROE = PAT ÷ net worth; a large equity base dilutes it.',
        meaning: 'Margin and ROE rise as profit outgrows equity without fresh capital.',
        watch: 'The PAT-margin trend above, and ROE versus cost of capital.',
      }
    case 'capital':
      return {
        soWhat: solvency > 0
          ? `${solvency.toFixed(2)}× solvency — a strong cushion versus the 1.5× regulatory floor.`
          : 'Solvency pending.',
        why: solvency > 0 ? `${(solvency - 1.5).toFixed(2)}× above the 1.5× floor.` : 'Awaiting the solvency ratio.',
        meaning: 'Strong capital funds growth with low risk of a raise — the trend above shows the cushion building.',
        watch: 'Solvency trend as growth consumes capital.',
      }
    case 'ifrs-revenue':
      return {
        soWhat: pf.nep == null ? 'Insurance revenue pending.' : `Insurance revenue (net earned premium) is ${crc(pf.nep)}${g != null ? ` (+${g.toFixed(0)}% YoY)` : ''} — the IFRS-style top line.`,
        why: 'For short-duration health cover, IFRS-style insurance revenue ≈ net earned premium.',
        meaning: 'The revenue base the IFRS service result and profit are measured against.',
        watch: 'The revenue trend above and how much converts to a service margin.',
      }
    case 'ifrs-service':
      return {
        soWhat: ctx.combinedRatio == null
          ? 'IFRS service result pending.'
          : ctx.combinedRatio < 100
            ? 'On IFRS, claims and costs leave a positive insurance-service margin.'
            : `On IFRS, the combined ratio is ${ctx.combinedRatio.toFixed(1)}% — the service result is thin, just above premium.`,
        why: ctx.claimsRatio != null && ctx.expenseRatio != null && ctx.combinedRatio != null
          ? `IFRS claims ${ctx.claimsRatio.toFixed(1)}% + expenses ${ctx.expenseRatio.toFixed(1)}% = ${ctx.combinedRatio.toFixed(1)}% combined.`
          : 'Claims and expense ratios on the IFRS basis.',
        meaning: 'The insurance-service result, before finance and investment income — the trend above tracks it.',
        watch: 'The IFRS combined ratio moving toward 100%.',
      }
    case 'ifrs-finance':
      return {
        soWhat: inv == null ? 'Investment result pending.' : `The investment book adds ${crc(inv)} — the support that carries the IFRS bottom line.`,
        why: 'Investment income on the policyholder and shareholder funds; the actual returns are basis-agnostic.',
        meaning: 'With a thin service result, the finance/investment result is what turns the business profitable.',
        watch: 'The investment-income trend above and the yield on the book.',
      }
    case 'ifrs-profit':
      return {
        soWhat: ctx.pat == null
          ? 'IFRS profit pending.'
          : `IFRS profit is ${crc(ctx.pat)}${ctx.patGrowth != null ? ` (${ctx.patGrowth >= 0 ? '+' : ''}${ctx.patGrowth.toFixed(0)}% YoY)` : ''} — the trend above shows the climb.`,
        why: ctx.patMargin != null ? `That is a ${ctx.patMargin.toFixed(1)}% margin on gross written premium, on the IFRS basis.` : 'IFRS profit after tax for the period.',
        meaning: 'The bottom line an international investor would compare — it can differ materially from IGAAP.',
        watch: 'IFRS PAT growth and the IFRS margin trend.',
      }
    case 'ifrs-margin':
      return {
        soWhat: ctx.patMargin == null ? 'IFRS margin pending.' : `${ctx.patMargin.toFixed(1)}% of premium reaches IFRS profit — the shareholder-return read on the IFRS basis.`,
        why: 'PAT margin (IFRS) = IFRS PAT ÷ gross written premium.',
        meaning: 'The IFRS-style margin; ROE and solvency are not reported on IFRS and are left out.',
        watch: 'The IFRS-margin trend above as the service result improves.',
      }
  }
}

function NodeInvestorRead({ read, accent, src, period, ctx }: { read: NodeRead; accent: string; src: ResolvedSource; period?: string; ctx: BasisCtx }) {
  const lines = [
    { label: 'Why', value: read.why },
    { label: 'What it means', value: read.meaning },
    { label: 'Watch next', value: read.watch },
  ]
  return (
    <section className="card-surface relative overflow-hidden p-4" style={{ background: `linear-gradient(135deg, #FFFFFF 0%, ${PALETTE.champagneSoft} 125%)` }}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${PALETTE.champagne} 0%, ${accent} 100%)` }} />
      <div className="pl-2.5">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Investor Read</p>
        <h3 className="mt-0 font-display text-[15px] leading-tight text-navy-deep">So what?</h3>
        <p className="mt-1.5 max-w-3xl text-[12px] font-medium leading-relaxed text-navy-deep">{read.soWhat}</p>
        {ctx.isIfrs && (
          <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed text-ink-secondary">
            Figures shown on the <span className="font-semibold text-navy-deep">IFRS</span> basis ({ctx.pLabel}). PAT can read very differently on IGAAP / Statutory vs IFRS — see the “PAT by Accounting Basis” card in the Profit conversion stage.
          </p>
        )}
        <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-[120px_1fr]">
          {lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{line.label}</dt>
              <dd className="text-[11.5px] leading-relaxed text-navy-deep/85">{line.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-soft-border/70 pt-2.5">
          <span className="inline-flex items-center gap-1.5">
            <LensBasisPill basis={ctx.basis} label={ctx.basisLabel} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{ctx.isIfrs && ctx.pat == null ? 'Not available' : 'Official'}</span>
          </span>
          {ctx.isIfrs ? (
            <SourceTag source={ctx.sourceLabel} period={ctx.pLabel} confidence="high" />
          ) : (
            <SourceTag source={src.source} period={period} confidence={src.confidence} provenance={src.provenance} />
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Detail panel — one focused, stage-coloured drill-down per selected node ──
// Every stage renders the same shell: an Active-lens header, a tight analysis
// grid whose cards inherit the stage tint, then a single Investor Read with the
// source/basis strip. No cross-stage cards; missing data shows "Data pending".

type ChipTone = 'positive' | 'warning' | 'negative' | 'navy' | 'teal'

interface LensMeta {
  label: string
  line: string
  accent: string
  cardBg: string
  cardBorder: string
  headFrom: string
  headTo: string
  headBorder: string
  source: string
  period?: string
  confidence: 'high' | 'medium' | 'pending'
}

// Accent → soft card + header tints, so a stage's lens shell colour is derived
// from its config accent (one place) rather than hand-set per stage.
const ACCENT_TINT: Record<StageAccent, { cardBg: string; cardBorder: string; headFrom: string; headTo: string; headBorder: string }> = {
  emerald: { cardBg: '#F4FAF6', cardBorder: '#DCEDE3', headFrom: '#EAF5EE', headTo: '#F6FBF8', headBorder: '#D2E8DC' },
  teal: { cardBg: '#F0F8F7', cardBorder: '#D2E8E6', headFrom: '#E5F4F3', headTo: '#F4FBFA', headBorder: '#C9E5E3' },
  gold: { cardBg: '#FCF7EA', cardBorder: '#ECE1C8', headFrom: '#FAF2E1', headTo: '#FFFDF8', headBorder: '#EADFC2' },
  orange: { cardBg: '#FCF4EC', cardBorder: '#EFDDCB', headFrom: '#FBEFE4', headTo: '#FFF9F3', headBorder: '#EFD9C4' },
  deepGreen: { cardBg: '#EFF7F2', cardBorder: '#CFE7DA', headFrom: '#E7F4ED', headTo: '#F5FBF8', headBorder: '#CCE5D8' },
  navy: { cardBg: '#F2F6FC', cardBorder: '#D8E3F3', headFrom: '#EAF1FB', headTo: '#F7FAFE', headBorder: '#D6E2FA' },
  coral: { cardBg: '#FBF0EF', cardBorder: '#EFD4D3', headFrom: '#FBEFEF', headTo: '#FDF7F6', headBorder: '#EFD4D3' },
}

// Build the active-lens shell metadata for a stage from its config accent +
// copy, with the lens's source/period. Replaces the old fixed per-node record so
// the same shell adapts to any lens's stages.
function stageMeta(stage: LensStage, source: string, period: string): LensMeta {
  const tint = ACCENT_TINT[stage.accent]
  return {
    label: stage.label,
    line: stage.line,
    accent: ACCENT_HEX[stage.accent],
    cardBg: tint.cardBg,
    cardBorder: tint.cardBorder,
    headFrom: tint.headFrom,
    headTo: tint.headTo,
    headBorder: tint.headBorder,
    source,
    period,
    confidence: 'high',
  }
}

// Resolve the real filing source for a stage's primary metric. The figures are
// real (combined ratio / PAT / solvency / premium from filings); where a
// provenance link can't be resolved we fall back to a quiet, link-free "Company
// filing" tag rather than implying a research source.
const LENS_METRIC: Partial<Record<NodeId, string>> = {
  premium: 'gwp',
  claims: 'combined_ratio',
  expense: 'expense_ratio',
  combined: 'combined_ratio',
  'underwriting-result': 'combined_ratio',
  conversion: 'pat',
  returns: 'pat',
  capital: 'solvency_ratio',
  'ifrs-revenue': 'gwp',
  'ifrs-service': 'combined_ratio',
  'ifrs-finance': 'pat',
  'ifrs-profit': 'pat',
  'ifrs-margin': 'pat',
}

function lensSource(id: NodeId, companyId: string): ResolvedSource {
  return realSource(LENS_METRIC[id] ?? 'pat', companyId) ?? { source: 'Company filing', confidence: 'high' }
}

// Quarterly detail body. Combined ratio and PAT (or PAT margin) have a real Q4
// source; other stages (and Monthly) have no quarterly source yet → honest
// Pending. Shows the quarter value + the prior Q4 as a thin two-point trend.
function quarterlyNodeBody(stage: LensStage, lens: LensConfig, company: Insurer, quarter: BasisPeriod | null, quarterPrev: BasisPeriod | null): ReactNode {
  const id = stage.semantic
  type QM = { key: 'combinedRatio' | 'patMarginGwp' | 'pat' | 'claimsRatio' | 'expenseRatio'; basis: AccountingBasis; pct: boolean; lowerBetter: boolean; label: string }
  let qm: QM | null = null
  if (id === 'claims') qm = { key: 'claimsRatio', basis: 'igaap', pct: true, lowerBetter: true, label: 'Claims ratio' }
  else if (id === 'expense') qm = { key: 'expenseRatio', basis: 'igaap', pct: true, lowerBetter: true, label: 'Expense ratio' }
  else if (id === 'combined') qm = { key: 'combinedRatio', basis: 'igaap', pct: true, lowerBetter: true, label: 'Combined ratio' }
  else if (id === 'conversion') qm = { key: 'pat', basis: 'igaap', pct: false, lowerBetter: false, label: 'PAT' }
  else if (id === 'returns') qm = { key: 'patMarginGwp', basis: 'igaap', pct: true, lowerBetter: false, label: 'PAT margin' }
  else if (id === 'ifrs-service') qm = { key: 'combinedRatio', basis: 'ifrs', pct: true, lowerBetter: true, label: 'Combined ratio · IFRS' }
  else if (id === 'ifrs-profit') qm = { key: 'pat', basis: 'ifrs', pct: false, lowerBetter: false, label: 'PAT · IFRS' }
  else if (id === 'ifrs-margin') qm = { key: 'patMarginGwp', basis: 'ifrs', pct: true, lowerBetter: false, label: 'PAT margin · IFRS' }

  const cur = qm && quarter ? getBasisProfit(company.id, qm.basis, quarter)?.[qm.key] ?? null : null
  if (!qm || cur == null || !quarter) {
    return (
      <PendingNote>{`Quarterly profitability data pending — ${stage.label.toLowerCase()} has no standalone-quarter source yet. Switch this section to Annual for the full story, the bridge and the investor read.`}</PendingNote>
    )
  }
  const prior = quarterPrev ? getBasisProfit(company.id, qm.basis, quarterPrev)?.[qm.key] ?? null : null
  const fmt = (v: number) => (qm!.pct ? `${v.toFixed(1)}%` : crc(v))
  const delta = prior != null ? cur - prior : null
  const better = delta != null ? (qm.lowerBetter ? delta < 0 : delta > 0) : null
  const deltaColor = better == null ? PALETTE.navy : better ? PALETTE.emerald : PALETTE.coral
  const deltaText = delta == null ? '' : qm.pct ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} pts` : `${delta >= 0 ? '+' : '−'}₹${Math.abs(delta).toLocaleString('en-IN')} Cr`
  return (
    <div className="rounded-xl border border-soft-border bg-ice/40 p-4">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne-deep">{qm.label} · quarterly · {lens.basisTag}</p>
      <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2">
        {prior != null && quarterPrev && (
          <>
            <div>
              <p className="font-display text-[18px] leading-none text-ink-secondary">{fmt(prior)}</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-secondary/80">{periodLabel(quarterPrev)}</p>
            </div>
            <span className="pb-1 text-[14px] font-bold text-ink-secondary/45">→</span>
          </>
        )}
        <div>
          <p className="font-display text-[26px] leading-none" style={{ color: deltaColor }}>{fmt(cur)}</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-secondary">{periodLabel(quarter)}</p>
        </div>
        {delta != null && (
          <span className="mb-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: `${deltaColor}44`, background: `${deltaColor}12`, color: deltaColor }}>
            {deltaText} {better ? 'better' : 'worse'}
          </span>
        )}
      </div>
      <p className="mt-2.5 text-[10px] leading-snug text-ink-secondary">Standalone-quarter figure (not annualised). The full story, the bridge and the investor read are on the Annual view.</p>
    </div>
  )
}

// ─── Dynamic trend chart — ONE fixed area per lens that updates with the
// selected story-map stage. Yearly line FY21→FY25 (available reported years),
// value labels, and a summary strip (current · YoY · direction · CAGR). Every
// metric is sourced to match its stage node; missing years are omitted (never
// zero) with an honest "available reported years" note.
type TrendUnit = '%' | '₹ Cr' | 'x'
interface TrendPoint { fy: string; value: number }
interface TrendSeries { key: string; label?: string; color: string; points: TrendPoint[] }
interface StageTrendData { title: string; unit: TrendUnit; lowerBetter: boolean; series: TrendSeries[]; source: string; sourcePeriod: string }

function stageTrend(semantic: StageSemantic, company: Insurer, series: AnnualPoint[], accent: string): StageTrendData | null {
  const nn = (x: { fy: string; value: number | null }): x is TrendPoint => x.value != null
  const snapPts = (get: (p: AnnualPoint) => number | null) => series.map((p) => ({ fy: p.fy, value: get(p) })).filter(nn)
  const basisPts = (basis: AccountingBasis, key: 'pat' | 'patMarginGwp' | 'combinedRatio' | 'claimsRatio' | 'expenseRatio') =>
    series.map((p) => ({ fy: p.fy, value: getBasisProfit(company.id, basis, p.fy as BasisPeriod)?.[key] ?? null })).filter(nn)
  const statCRpts = () => {
    const stat = STATUTORY_CR[company.id]
    if (!stat) return snapPts((p) => p.combinedRatio)
    const m = new Map(stat.annual.map((a) => [a.fy, a.cr]))
    return series.map((p) => ({ fy: p.fy, value: m.get(p.fy) ?? null })).filter(nn)
  }
  const uwPts = () => {
    const by = getEarningsBridge(company.id).filter((y) => series.some((p) => p.fy === y.fy))
    if (by.length >= 2) return [...by].sort((a, b) => a.fy.localeCompare(b.fy)).map((y) => ({ fy: y.fy, value: y.igaap.underwritingResult }))
    return series.map((p) => ({ fy: p.fy, value: underwritingResult(p) })).filter(nn)
  }
  const invPts = () => {
    const m = bridgeInvestmentByFy(company.id)
    return series.map((p) => ({ fy: p.fy, value: m[p.fy] ?? null })).filter(nn)
  }
  const marginSnap = () => snapPts((p) => (p.pat != null && p.gwp ? Math.round((p.pat / p.gwp) * 1000) / 10 : null))
  const one = (title: string, unit: TrendUnit, lowerBetter: boolean, points: TrendPoint[], source: string, sourcePeriod: string): StageTrendData | null =>
    points.length ? { title, unit, lowerBetter, series: [{ key: 'v', color: accent, points }], source, sourcePeriod } : null

  switch (semantic) {
    case 'premium': return one('Net Earned Premium Trend', '₹ Cr', false, snapPts((p) => p.nep), 'Company filing', 'FY22–FY25')
    case 'claims': return one('Claims Ratio Trend', '%', true, basisPts('igaap', 'claimsRatio'), 'Company filing', 'FY23–FY25')
    case 'expense': return one('Expense Ratio Trend', '%', true, basisPts('igaap', 'expenseRatio'), 'Company filing', 'FY23–FY25')
    case 'combined': return one('Combined Ratio Trend', '%', true, statCRpts(), 'IRDAI public disclosures', 'FY22–FY25')
    case 'underwriting-result': return one('Underwriting Result Trend', '₹ Cr', false, uwPts(), 'Annual report · Revenue A/c', 'FY24–FY25')
    case 'conversion': return one('PAT Trend', '₹ Cr', false, basisPts('igaap', 'pat'), 'Company filing', 'FY23–FY25')
    case 'returns': return one('PAT Margin Trend', '%', false, marginSnap(), 'Company filing', 'FY24–FY25')
    case 'capital': return one('Solvency Trend', 'x', false, snapPts((p) => p.solvency), 'IRDAI public disclosures', 'FY24–FY25')
    case 'ifrs-revenue': return one('Insurance Revenue Trend', '₹ Cr', false, snapPts((p) => p.nep), 'Company filing', 'FY22–FY25')
    case 'ifrs-service': return one('Combined Ratio Trend · IFRS', '%', true, basisPts('ifrs', 'combinedRatio'), 'Annual report · IFRS', 'FY24–FY25')
    case 'ifrs-finance': return one('Investment Income Trend', '₹ Cr', false, invPts(), 'Annual report · Revenue A/c', 'FY24–FY25')
    case 'ifrs-profit': return one('PAT Trend · IFRS', '₹ Cr', false, basisPts('ifrs', 'pat'), 'Annual report · IFRS', 'FY23–FY25')
    case 'ifrs-margin': return one('IFRS Margin Trend', '%', false, basisPts('ifrs', 'patMarginGwp'), 'Annual report · IFRS', 'FY24–FY25')
  }
}

function fmtTrend(v: number, unit: TrendUnit): string {
  if (unit === '%') return `${v.toFixed(1)}%`
  if (unit === 'x') return `${v.toFixed(2)}x`
  return crc(v)
}

function StageTrendCard({ data, accent }: { data: StageTrendData; accent: string }) {
  const allFys = [...new Set(data.series.flatMap((s) => s.points.map((p) => p.fy)))].sort()
  const rows = allFys.map((fy) => {
    const r: Record<string, number | string | null> = { fy }
    data.series.forEach((s) => { r[s.key] = s.points.find((p) => p.fy === fy)?.value ?? null })
    return r
  })
  const primary = data.series[0].points
  const last = primary[primary.length - 1]
  const prev = primary.length >= 2 ? primary[primary.length - 2] : null
  const first = primary[0]
  const yoy = last && prev ? last.value - prev.value : null
  const delta = last && first && primary.length >= 2 ? last.value - first.value : null
  const up = delta == null ? null : delta > 0.0001 ? true : delta < -0.0001 ? false : null
  let cagr: number | null = null
  if (data.unit === '₹ Cr' && primary.length >= 2 && first.value > 0 && last.value > 0) cagr = (Math.pow(last.value / first.value, 1 / (primary.length - 1)) - 1) * 100
  const yoyText = yoy == null ? '—' : data.unit === '%' ? `${yoy >= 0 ? '+' : '−'}${Math.abs(yoy).toFixed(1)} pp` : data.unit === 'x' ? `${yoy >= 0 ? '+' : '−'}${Math.abs(yoy).toFixed(2)}x` : `${yoy >= 0 ? '+' : '−'}₹${Math.abs(Math.round(yoy)).toLocaleString('en-IN')} Cr`
  const improving = up == null ? null : data.lowerBetter ? !up : up
  const dirColor = improving == null ? PALETTE.navy : improving ? PALETTE.emerald : PALETTE.coral
  const dirWord = up == null ? 'Stable' : data.lowerBetter ? (up ? 'Rising' : 'Improving') : up ? 'Rising' : 'Falling'
  const DirIcon = up == null ? Minus : up ? TrendingUp : TrendingDown
  const labelFmt = (v: number | string) => (typeof v !== 'number' ? '' : data.unit === '%' ? `${v.toFixed(0)}%` : data.unit === 'x' ? `${v.toFixed(2)}` : `₹${Math.round(v).toLocaleString('en-IN')}`)
  const isDual = data.series.length > 1
  const avg = primary.length ? primary.reduce((a, p) => a + p.value, 0) / primary.length : null
  const yPad = (Math.max(...data.series.flatMap((s) => s.points.map((p) => p.value))) - Math.min(...data.series.flatMap((s) => s.points.map((p) => p.value)))) * 0.18 || 1
  const yMin = Math.min(...data.series.flatMap((s) => s.points.map((p) => p.value))) - yPad
  const yMax = Math.max(...data.series.flatMap((s) => s.points.map((p) => p.value))) + yPad
  const noteNeeded = allFys.length < 5

  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 h-4 w-1 shrink-0 rounded-full" style={{ background: accent }} />
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Trend · by year</p>
            <h3 className="font-display text-[15px] leading-tight text-navy-deep">{data.title}</h3>
          </div>
        </div>
        {/* Summary strip — current · YoY · direction · CAGR */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold" style={{ borderColor: `${accent}40`, background: `${accent}10`, color: accent }}>
            Current {last ? fmtTrend(last.value, data.unit) : '—'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[10.5px] font-semibold text-navy-deep">
            YoY {yoyText}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold" style={{ borderColor: `${dirColor}40`, background: `${dirColor}10`, color: dirColor }}>
            <DirIcon className="h-3 w-3" />
            {dirWord}
          </span>
          {avg != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[10.5px] font-semibold text-navy-deep">
              5-yr avg {fmtTrend(avg, data.unit)}
            </span>
          )}
          {cagr != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white px-2.5 py-1 text-[10.5px] font-semibold text-navy-deep">
              CAGR {cagr >= 0 ? '+' : ''}{cagr.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        {primary.length >= 1 ? (
          <ResponsiveContainer width="100%" height={232}>
            <LineChart data={rows} margin={{ top: 22, right: 22, left: 4, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
              <XAxis dataKey="fy" tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} width={46} domain={[yMin, yMax]} tickFormatter={(v: number) => (data.unit === '₹ Cr' ? `₹${Math.round(v)}` : data.unit === 'x' ? `${v.toFixed(1)}x` : `${Math.round(v)}%`)} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, n) => [fmtTrend(v, data.unit), isDual ? (data.series.find((s) => s.key === n)?.label ?? '') : data.title.replace(' Trend', '')]} />
              {data.unit === '%' && yMin <= 100 && yMax >= 100 && (
                <ReferenceLine y={100} stroke={PALETTE.amber} strokeDasharray="4 4" strokeWidth={0.8} label={{ value: '100%', position: 'insideTopRight', fontSize: 8.5, fill: PALETTE.amber }} />
              )}
              {data.unit === '₹ Cr' && yMin <= 0 && yMax >= 0 && <ReferenceLine y={0} stroke={PALETTE.navy} strokeOpacity={0.5} strokeWidth={1} />}
              {data.series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 3.5, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false}>
                  <LabelList dataKey={s.key} position="top" offset={10} formatter={labelFmt} style={{ fontSize: 9.5, fontWeight: 700, fill: s.color }} />
                </Line>
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <PendingNote>{`${data.title} pending — no reported years in the selected range.`}</PendingNote>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {isDual && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-secondary">
              {data.series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />{s.label}</span>
              ))}
            </div>
          )}
          {noteNeeded && <p className="text-[9.5px] italic leading-snug text-ink-secondary/85">Trend shown for available reported years.</p>}
        </div>
        <SourceTag source={data.source} period={data.sourcePeriod} confidence="high" />
      </div>
    </section>
  )
}

// ─── Selected-stage detail card — the uniform "explanation" card under the
// 5-circle map. Big main metric + small sub-metric chips + a one-line read + a
// status pill, with a "View accounting details" button. The granular metrics
// (claims, expense, ROE, …) live here as chips, NOT as separate big circles.
interface DetailChip { label: string; value: string; tone?: string }
interface StageDetail { mainLabel: string; mainValue: string; mainTone: string; chips: DetailChip[]; explanation: string; source: string; sourcePeriod: string }

function stageDetail(semantic: StageSemantic, company: Insurer, series: AnnualPoint[], ctx: BasisCtx): StageDetail {
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const cost = COST_RATIOS[company.id]
  const igaapFY = getBasisProfit(company.id, 'igaap', 'FY25')
  const mm = getMarginMetrics(series)
  const uw = latest ? underwritingFor(company.id, latest) : null
  const pf = premiumFigures(company.id, series)
  const b = getEarningsBridge(company.id)[0]?.igaap ?? null
  const inv = b?.investmentIncome ?? null
  const cr = STATUTORY_CR[company.id]?.statutory ?? (company.combinedRatio > 0 ? company.combinedRatio : null)
  const claims = igaapFY?.claimsRatio ?? cost?.loss ?? null
  const expense = igaapFY?.expenseRatio ?? (cost ? cost.commission + cost.expense : null)
  const commission = cost?.commission ?? null
  const roe = company.roe > 0 ? company.roe : null
  const s = company.solvency
  const pct1 = (v: number | null) => (v == null ? null : `${v.toFixed(1)}%`)
  const rs = (v: number | null) => (v == null ? null : crc(v))
  const chip = (label: string, value: string | null, tone?: string): DetailChip | null => (value == null ? null : { label, value, tone })
  const filt = (arr: (DetailChip | null)[]): DetailChip[] => arr.filter((c): c is DetailChip => c != null)

  switch (semantic) {
    case 'premium':
    case 'ifrs-revenue': {
      const retention = b ? Math.round((b.nwp / b.gwp) * 100) : null
      return {
        mainLabel: semantic === 'ifrs-revenue' ? 'Insurance revenue' : 'Net earned premium',
        mainValue: pf.nep == null ? 'Pending' : crc(pf.nep),
        mainTone: PALETTE.navy,
        chips: filt([chip('Gross premium', rs(pf.gwp)), chip('Retained', retention == null ? null : `${retention}%`), chip('Reinsurance ceded', b ? crc(b.reinsCeded) : null)]),
        explanation: semantic === 'ifrs-revenue' ? 'Net earned premium is the IFRS-style revenue base.' : 'Most premium is retained after reinsurance and earned through the year.',
        source: 'Annual report · Revenue A/c', sourcePeriod: 'FY25',
      }
    }
    case 'combined':
      return {
        mainLabel: 'Combined ratio',
        mainValue: cr == null ? 'Pending' : `${cr.toFixed(1)}%`,
        mainTone: cr == null ? PALETTE.navy : cr < 100 ? PALETTE.emerald : PALETTE.coral,
        chips: filt([chip('Claims ratio', pct1(claims)), chip('Expense ratio', pct1(expense)), chip('Commission ratio', pct1(commission))]),
        explanation: cr == null ? 'Combined ratio pending.' : cr >= 100 ? 'Claims and costs are still slightly above ₹100 of premium.' : 'Claims and costs stay inside ₹100 of premium.',
        source: 'IRDAI public disclosures', sourcePeriod: 'FY25',
      }
    case 'underwriting-result': {
      const margin = uw != null && pf.nep ? (uw / pf.nep) * 100 : null
      const gap = cr != null ? cr - 100 : null
      return {
        mainLabel: 'Underwriting result',
        mainValue: uw == null ? 'Pending' : crc(uw),
        mainTone: uw == null ? PALETTE.navy : uw >= 0 ? PALETTE.teal : PALETTE.coral,
        chips: filt([chip('Underwriting margin', margin == null ? null : `${margin.toFixed(1)}%`), chip('Break-even gap', gap == null ? null : `${gap >= 0 ? '+' : ''}${gap.toFixed(1)} pp`)]),
        explanation: uw == null ? 'Underwriting result pending.' : uw < 0 ? 'Core underwriting is a loss; investment income covers it.' : 'Core underwriting earns money before investment income.',
        source: 'Annual report · Revenue A/c', sourcePeriod: 'FY25',
      }
    }
    case 'conversion':
      return {
        mainLabel: 'Profit after tax',
        mainValue: mm.latestPat == null ? 'Pending' : crc(mm.latestPat),
        mainTone: mm.latestPat == null ? PALETTE.navy : mm.latestPat >= 0 ? PALETTE.emerald : PALETTE.coral,
        chips: filt([chip('PAT margin', pct1(mm.netMargin)), chip('Investment income', rs(inv)), chip('ROE', pct1(roe))]),
        explanation: uw != null && uw < 0 ? 'Investment income carries PAT while underwriting is a loss.' : 'Underwriting and investment income together drive PAT.',
        source: 'Annual report · P&L', sourcePeriod: 'FY25',
      }
    case 'capital': {
      const cap = s > 0 ? s - 1.5 : null
      const growth = s <= 0 ? null : s >= 2.5 ? 'Ample' : s >= 2 ? 'Comfortable' : 'Adequate'
      return {
        mainLabel: 'Solvency ratio',
        mainValue: s > 0 ? `${s.toFixed(2)}x` : 'Pending',
        mainTone: s <= 0 ? PALETTE.navy : s >= 2 ? PALETTE.emerald : s >= 1.5 ? PALETTE.amber : PALETTE.coral,
        chips: filt([chip('Capital buffer', cap == null ? null : `+${cap.toFixed(2)}x`), chip('Regulatory floor', '1.50x'), chip('Growth capacity', growth)]),
        explanation: s > 0 ? 'Capital is well above the 1.5× floor — room to fund growth.' : 'Solvency pending.',
        source: 'IRDAI public disclosures', sourcePeriod: 'FY25',
      }
    }
    case 'ifrs-service':
      return {
        mainLabel: 'Combined ratio · IFRS',
        mainValue: ctx.combinedRatio == null ? 'Pending' : `${ctx.combinedRatio.toFixed(1)}%`,
        mainTone: ctx.combinedRatio == null ? PALETTE.navy : ctx.combinedRatio < 100 ? PALETTE.emerald : PALETTE.coral,
        chips: filt([chip('Claims · IFRS', pct1(ctx.claimsRatio)), chip('Expenses · IFRS', pct1(ctx.expenseRatio))]),
        explanation: ctx.combinedRatio != null && ctx.combinedRatio < 100 ? 'The insurance service earns a margin before investment income.' : 'Claims and costs run just above premium — the service result is thin.',
        source: 'Annual report · IFRS', sourcePeriod: ctx.pLabel,
      }
    case 'ifrs-finance':
      return {
        mainLabel: 'Investment & finance result',
        mainValue: inv == null ? 'Pending' : crc(inv),
        mainTone: inv == null ? PALETTE.navy : DEEP_GREEN,
        chips: filt([chip('Covers of IFRS PAT', ctx.pat != null && ctx.pat > 0 && inv != null ? `${Math.round((inv / ctx.pat) * 100)}%` : null)]),
        explanation: 'Investment income is the finance result that carries the IFRS bottom line.',
        source: 'Annual report · Revenue A/c', sourcePeriod: 'FY25',
      }
    case 'ifrs-profit':
      return {
        mainLabel: 'Profit after tax · IFRS',
        mainValue: ctx.pat == null ? 'Pending' : crc(ctx.pat),
        mainTone: ctx.pat == null ? PALETTE.navy : ctx.pat >= 0 ? PALETTE.emerald : PALETTE.coral,
        chips: filt([chip('PAT margin', pct1(ctx.patMargin)), chip('YoY growth', ctx.patGrowth == null ? null : `${ctx.patGrowth >= 0 ? '+' : ''}${ctx.patGrowth.toFixed(0)}%`)]),
        explanation: 'IFRS profit can read materially differently from IGAAP — the gap is accounting, not cash.',
        source: 'Annual report · IFRS', sourcePeriod: ctx.pLabel,
      }
    case 'ifrs-margin':
      return {
        mainLabel: 'IFRS-style margin',
        mainValue: ctx.patMargin == null ? 'Pending' : `${ctx.patMargin.toFixed(1)}%`,
        mainTone: ctx.patMargin == null ? PALETTE.navy : ctx.patMargin > 3 ? PALETTE.emerald : ctx.patMargin > 0 ? PALETTE.amber : PALETTE.coral,
        chips: filt([chip('IFRS PAT', rs(ctx.pat))]),
        explanation: 'IFRS profit as a share of premium. ROE and solvency are not reported on IFRS and are left out.',
        source: 'Annual report · IFRS', sourcePeriod: ctx.pLabel,
      }
    default:
      return { mainLabel: '', mainValue: 'Pending', mainTone: PALETTE.navy, chips: [], explanation: '', source: 'Company filing', sourcePeriod: 'FY25' }
  }
}

// Storyline header for the selected stage — title + plain-English question +
// "what this examines" + "why it matters" + status, plus a Details button.
function StageStoryHeader({ meta, stage, status, onOpenDrawer }: { meta: LensMeta; stage: LensStage; status: { label: string; tone: ChipTone }; onOpenDrawer: () => void }) {
  return (
    <section className="rounded-xl border px-4 py-3.5" style={{ borderColor: meta.headBorder, background: `linear-gradient(135deg, ${meta.headFrom} 0%, ${meta.headTo} 100%)` }}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-champagne">Selected stage</p>
          <h3 className="font-display text-[16px] leading-tight text-navy-deep">{stage.label}</h3>
          <p className="mt-0.5 max-w-xl text-[12px] font-medium leading-snug text-navy-deep/85">{stage.line}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SignalBadge label={status.label} tone={status.tone} size="sm" />
          <button type="button" onClick={onOpenDrawer} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-navy-primary transition-colors hover:border-muted-blue">
            <Layers className="h-3 w-3" />
            Details
          </button>
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">What this examines</dt>
          <dd className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{stage.examines}</dd>
        </div>
        <div>
          <dt className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">Why it matters</dt>
          <dd className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{stage.whyItMatters}</dd>
        </div>
      </dl>
    </section>
  )
}

// Compact main-metric + sub-metric-chips card — the infographic for stages
// without a dedicated visual (the IFRS-style lens).
function MetricChipsCard({ detail }: { detail: StageDetail }) {
  return (
    <section className="card-surface p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="shrink-0">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">{detail.mainLabel}</p>
          <p className="font-display text-[38px] leading-none" style={{ color: detail.mainTone }}>{detail.mainValue}</p>
        </div>
        {detail.chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {detail.chips.map((c) => (
              <div key={c.label} className="rounded-xl border border-soft-border bg-white/80 px-3 py-1.5">
                <p className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{c.label}</p>
                <p className="mt-0.5 font-display text-[15px] leading-none text-navy-deep" style={c.tone ? { color: c.tone } : undefined}>{c.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-soft-border/70 pt-2.5">
        <p className="max-w-2xl text-[11px] leading-snug text-ink-secondary">{detail.explanation}</p>
        <SourceTag source={detail.source} period={detail.sourcePeriod} confidence="high" />
      </div>
    </section>
  )
}

// ─── (A) Premium retained — GWP → reinsurance → net written → net earned ──────
function PremiumFlowCard({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const bridge = getEarningsBridge(company.id)
  const inRange = new Set(series.map((p) => p.fy))
  const yr = bridge.find((y) => inRange.has(y.fy)) ?? (bridge.length ? bridge[0] : null)
  const navy = PALETTE.navy
  const tealc = PALETTE.teal
  if (yr) {
    const b = yr.igaap
    const retention = Math.round((b.nwp / b.gwp) * 100)
    const steps = [
      { label: 'Reinsurance ceded', tech: '− ceded', v: -b.reinsCeded, color: PALETTE.amber, total: false },
      { label: 'Net written', tech: 'NWP', v: b.nwp, color: navy, total: true },
      { label: 'Unearned reserve', tech: b.uprMovement < 0 ? '− UPR build' : '+ UPR release', v: b.uprMovement, color: PALETTE.coral, total: false },
    ]
    return (
      <div className="rounded-xl border p-4" style={{ background: ACCENT_TINT.navy.cardBg, borderColor: ACCENT_TINT.navy.cardBorder }}>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Premium formation</p>
            <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Premium retained &amp; earned</h3>
          </div>
          <span className="shrink-0 text-[9.5px] text-ink-secondary">{yr.fy}</span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-ink-secondary">From gross premium written to what is actually earned.</p>
        <div className="mt-4 flex flex-wrap items-stretch gap-1.5">
          <div className="flex w-[104px] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-3 text-center text-white" style={{ background: `linear-gradient(160deg, ${PALETTE.navyDeep} 0%, ${navy} 100%)` }}>
            <span className="text-[8px] font-bold uppercase tracking-[0.08em]" style={{ color: '#E9D49A' }}>Gross premium</span>
            <span className="mt-1 font-display text-[20px] leading-none">₹{b.gwp.toLocaleString('en-IN')}</span>
            <span className="mt-1 text-[8px] leading-tight text-white/70">GWP · Cr</span>
          </div>
          {steps.map((s) => (
            <Fragment key={s.label}>
              <span className="flex shrink-0 items-center px-0.5 text-[13px] font-bold text-ink-secondary/40">{s.total ? '=' : ''}</span>
              <div className="flex min-w-[92px] flex-1 flex-col justify-center rounded-xl border px-3 py-2.5" style={{ background: s.total ? '#fff' : 'rgba(255,255,255,0.7)', borderColor: s.total ? navy : ACCENT_TINT.navy.cardBorder }}>
                <span className="text-[8.5px] font-bold uppercase leading-tight tracking-[0.04em] text-navy-deep">{s.label}</span>
                <span className="mt-1 font-display text-[17px] leading-none" style={{ color: s.color }}>{crc(s.v)}</span>
                <span className="mt-0.5 text-[8px] text-ink-secondary">{s.tech}</span>
              </div>
            </Fragment>
          ))}
          <span className="flex shrink-0 items-center px-0.5 text-[14px] font-bold" style={{ color: tealc }}>→</span>
          <div className="flex w-[110px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={{ background: 'linear-gradient(160deg, #E7F4F3 0%, #F4FBFA 100%)', borderColor: '#C9E5E3', boxShadow: `0 12px 26px ${tealc}33` }}>
            <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: '#0E5B5B' }}>Net earned</span>
            <span className="mt-1 font-display text-[22px] leading-none" style={{ color: tealc }}>₹{b.nep.toLocaleString('en-IN')}</span>
            <span className="mt-1 text-[8px] leading-tight text-ink-secondary">NEP · Cr</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={{ borderColor: `${navy}33`, background: `${navy}0c`, color: navy }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: navy }} />
            {retention}% retained after reinsurance
          </span>
          <SourceTag source="Annual report · Revenue A/c" period={yr.fy} confidence="high" />
        </div>
      </div>
    )
  }
  const latest = series[series.length - 1] as AnnualPoint | undefined
  return (
    <div className="rounded-xl border p-4" style={{ background: ACCENT_TINT.navy.cardBg, borderColor: ACCENT_TINT.navy.cardBorder }}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Premium formation</p>
      <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Premium retained &amp; earned</h3>
      {latest && latest.gwp != null && latest.nep != null ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="rounded-xl px-3 py-2.5 text-white" style={{ background: navy }}>
            <span className="block text-[8px] font-bold uppercase tracking-wide" style={{ color: '#E9D49A' }}>GWP</span>
            <span className="font-display text-[18px]">₹{latest.gwp.toLocaleString('en-IN')} Cr</span>
          </div>
          <span className="text-[14px] font-bold" style={{ color: tealc }}>→</span>
          <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: '#C9E5E3', background: '#F4FBFA' }}>
            <span className="block text-[8px] font-bold uppercase tracking-wide text-ink-secondary">Net earned</span>
            <span className="font-display text-[18px]" style={{ color: tealc }}>₹{latest.nep.toLocaleString('en-IN')} Cr</span>
          </div>
        </div>
      ) : (
        <div className="mt-3"><PendingNote>{`Premium breakdown pending for ${company.shortName}.`}</PendingNote></div>
      )}
      <div className="mt-3 flex justify-end"><SourceTag source="Company filing" period={latest?.fy ?? 'FY25'} confidence="high" /></div>
    </div>
  )
}

// ─── (B) Cost discipline — "where every ₹100 of premium goes" donut ───────────
function CostDonut({ company }: { company: Insurer }) {
  const cost = COST_RATIOS[company.id]
  const cr = STATUTORY_CR[company.id]?.statutory ?? (company.combinedRatio > 0 ? company.combinedRatio : null)
  if (!cost || cr == null) {
    return <div className="rounded-xl border p-4" style={{ background: ACCENT_TINT.emerald.cardBg, borderColor: ACCENT_TINT.emerald.cardBorder }}><PendingNote>{`Cost split pending for ${company.shortName}.`}</PendingNote></div>
  }
  const segs = [
    { name: 'Claims', value: cost.loss, color: PALETTE.coral },
    { name: 'Commission', value: cost.commission, color: PALETTE.amber },
    { name: 'Opex', value: cost.expense, color: PALETTE.navy },
  ]
  const crColor = cr < 100 ? PALETTE.emerald : cr <= 105 ? PALETTE.amber : PALETTE.coral
  const surplus = Math.round((100 - cr) * 10) / 10
  return (
    <div className="rounded-xl border p-4" style={{ background: ACCENT_TINT.emerald.cardBg, borderColor: ACCENT_TINT.emerald.cardBorder }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Cost anatomy</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Where every ₹100 of premium goes</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">FY25</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative h-[148px] w-[148px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={segs} dataKey="value" cx="50%" cy="50%" innerRadius="66%" outerRadius="92%" startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={1.2} isAnimationActive={false}>
                {segs.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[22px] leading-none" style={{ color: crColor }}>{cr.toFixed(1)}%</span>
            <span className="text-[8px] uppercase tracking-wide text-ink-secondary">combined</span>
          </div>
        </div>
        <div className="min-w-[150px] flex-1 space-y-1.5">
          {segs.map((s) => (
            <div key={s.name} className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-navy-deep"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name}</span>
              <span className="font-display text-[13px] text-navy-deep">₹{s.value.toFixed(1)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-[#DCEDE3] pt-1.5">
            <span className="text-[11px] font-semibold text-navy-deep">{surplus >= 0 ? 'Surplus kept' : 'Over ₹100'}</span>
            <span className="font-display text-[13px]" style={{ color: surplus >= 0 ? PALETTE.emerald : PALETTE.coral }}>{surplus >= 0 ? '+' : '−'}₹{Math.abs(surplus).toFixed(1)}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] leading-snug text-ink-secondary">{surplus >= 0 ? 'Claims and costs stay inside ₹100 — a surplus is kept.' : `Claims and costs run ₹${Math.abs(surplus).toFixed(1)} over ₹100.`}</p>
        <SourceTag source="IRDAI public disclosures" period="FY25" confidence="high" />
      </div>
    </div>
  )
}

// ─── (C) Underwriting result — earned premium − claims − commission − opex ────
function UnderwritingWaterfall({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const yr = getEarningsBridge(company.id).find((y) => series.some((p) => p.fy === y.fy)) ?? getEarningsBridge(company.id)[0]
  if (!yr) {
    const latest = series[series.length - 1] as AnnualPoint | undefined
    const uw = latest ? underwritingFor(company.id, latest) : null
    return (
      <div className="rounded-xl border p-4" style={{ background: ACCENT_TINT.teal.cardBg, borderColor: ACCENT_TINT.teal.cardBorder }}>
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Underwriting result</p>
        {uw == null ? <div className="mt-2"><PendingNote>{`Underwriting result pending for ${company.shortName}.`}</PendingNote></div> : <p className="mt-2 font-display text-[28px] leading-none" style={{ color: uw >= 0 ? PALETTE.teal : PALETTE.coral }}>{crc(uw)}</p>}
        <div className="mt-2 flex justify-end"><SourceTag source="Company filing · derived" period={latest?.fy ?? 'FY25'} confidence="high" /></div>
      </div>
    )
  }
  const b = yr.igaap
  const steps = [
    { label: 'Earned premium', tech: 'NEP', v: b.nep, op: '', color: PALETTE.navy, strong: true },
    { label: 'Claims', tech: 'incurred', v: -b.netClaims, op: '−', color: PALETTE.coral, strong: false },
    { label: 'Commission', tech: 'distribution', v: -b.netCommission, op: '−', color: PALETTE.amber, strong: false },
    { label: 'Operating cost', tech: 'opex', v: -b.opex, op: '−', color: PALETTE.navy, strong: false },
    { label: b.underwritingResult >= 0 ? 'Underwriting profit' : 'Underwriting loss', tech: 'core result', v: b.underwritingResult, op: '=', color: b.underwritingResult >= 0 ? PALETTE.teal : PALETTE.coral, strong: true },
  ]
  return (
    <div className="rounded-xl border p-4" style={{ background: ACCENT_TINT.teal.cardBg, borderColor: ACCENT_TINT.teal.cardBorder }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Core result</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Earned premium minus claims and costs</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">{yr.fy}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-stretch gap-1.5">
        {steps.map((s) => (
          <Fragment key={s.label}>
            {s.op && <span className="flex shrink-0 items-center px-0.5 text-[14px] font-bold text-ink-secondary/45">{s.op}</span>}
            <div className="flex min-w-[92px] flex-1 flex-col justify-center rounded-xl border px-3 py-2.5" style={{ background: s.strong ? '#fff' : 'rgba(255,255,255,0.7)', borderColor: s.strong ? s.color : ACCENT_TINT.teal.cardBorder }}>
              <span className="text-[8.5px] font-bold uppercase leading-tight tracking-[0.04em] text-navy-deep">{s.label}</span>
              <span className="mt-1 font-display text-[17px] leading-none" style={{ color: s.color }}>{crc(s.v)}</span>
              <span className="mt-0.5 text-[8px] text-ink-secondary">{s.tech}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10.5px] font-medium leading-snug text-navy-deep/85" style={{ background: `${b.underwritingResult >= 0 ? PALETTE.teal : PALETTE.coral}10` }}>
        <Gauge className="h-3.5 w-3.5 shrink-0" style={{ color: b.underwritingResult >= 0 ? PALETTE.teal : PALETTE.coral }} />
        {b.underwritingResult >= 0 ? 'Underwriting is profitable before investment support.' : 'Underwriting is loss-making before investment support.'}
      </p>
      <div className="mt-2 flex justify-end"><SourceTag source="Annual report · Revenue A/c" period={yr.fy} confidence="high" /></div>
    </div>
  )
}

// ─── (D) Profit conversion — the ₹100 Premium-to-Profit Conversion Engine ─────
function ConversionBridge({ company, series, ctx }: { company: Insurer; series: AnnualPoint[]; ctx: BasisCtx }) {
  const cost = COST_RATIOS[company.id]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const reportedMargin = latest && latest.pat != null && latest.gwp ? (latest.pat / latest.gwp) * 100 : null
  const patMargin = ctx.isIfrs ? ctx.patMargin : reportedMargin
  const periodTag = ctx.isIfrs ? ctx.pLabel : 'FY25'
  const outputCaption = ctx.isIfrs ? `${BASIS_LABEL[ctx.basis]} profit conversion` : 'Reported profit conversion'
  const header = (
    <>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Conversion Engine</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Premium-to-Profit Conversion Engine</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">{periodTag}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">How ₹100 of premium becomes profit.</p>
    </>
  )
  if (!cost) {
    return (
      <div className="rounded-xl border p-4" style={{ background: '#FCF7EA', borderColor: '#ECE1C8' }}>
        {header}
        <div className="mt-3"><PendingNote>{`${company.shortName} is a life carrier — needs a claims / commission / opex split. Pending.`}</PendingNote></div>
      </div>
    )
  }
  const absorbed = cost.loss + cost.commission + cost.expense
  const uwProfit = Math.round((100 - absorbed) * 10) / 10
  const uwPos = uwProfit >= 0
  const bands = [
    { key: 'claims', label: 'Claims', sub: 'Largest absorption', amount: cost.loss, display: `₹${cost.loss.toFixed(1)}`, color: PALETTE.coral, bg: '#FBEFEF', border: '#EFD4D3' },
    { key: 'opex', label: 'Opex', sub: 'Operating cost', amount: cost.expense, display: `₹${cost.expense.toFixed(1)}`, color: PALETTE.navy, bg: '#EEF3FB', border: '#D6E2FA' },
    { key: 'comm', label: 'Commission', sub: 'Distribution cost', amount: cost.commission, display: `₹${cost.commission.toFixed(1)}`, color: PALETTE.amber, bg: '#FBF3E2', border: '#EFE1BE' },
    { key: 'uw', label: uwPos ? 'Underwriting profit' : 'Underwriting loss', sub: uwPos ? 'Spread retained' : 'Spread negative', amount: Math.max(Math.abs(uwProfit), 1.5), display: `${uwPos ? '' : '−'}₹${Math.abs(uwProfit).toFixed(1)}`, color: uwPos ? PALETTE.teal : PALETTE.coral, bg: uwPos ? '#E7F4F3' : '#FBEFEF', border: uwPos ? '#C9E5E3' : '#EFD4D3' },
  ]
  const BASE = 22
  const SPAN = 150
  const GAP = 8
  const heights = bands.map((b) => BASE + (b.amount / 100) * SPAN)
  const totalH = Math.round(heights.reduce((s, h) => s + h, 0) + GAP * (bands.length - 1))
  const centers: number[] = []
  let acc = 0
  heights.forEach((h) => {
    centers.push(acc + h / 2)
    acc += h + GAP
  })
  return (
    <div className="rounded-xl border p-4" style={{ background: '#FCF7EA', borderColor: '#ECE1C8' }}>
      {header}
      <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.16em] text-champagne">₹100 premium journey</p>
      <div className="mt-1.5 flex items-stretch gap-0" style={{ height: totalH }}>
        <div className="flex w-[86px] shrink-0 flex-col items-center justify-center rounded-xl px-2 text-center" style={{ background: `linear-gradient(160deg, ${PALETTE.navyDeep} 0%, ${PALETTE.navy} 100%)` }}>
          <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: '#E9D49A' }}>Premium in</span>
          <span className="mt-1 font-display text-[24px] leading-none text-white">₹100</span>
          <span className="mt-1 text-[8.5px] leading-snug text-white/70">GWP received</span>
        </div>
        <svg className="shrink-0" width={34} height={totalH} viewBox={`0 0 34 ${totalH}`} aria-hidden>
          {bands.map((b, i) => (
            <path key={b.key} d={`M0 ${totalH / 2} C 22 ${totalH / 2}, 12 ${centers[i]}, 34 ${centers[i]}`} fill="none" stroke={b.color} strokeOpacity={0.42} strokeWidth={Math.max(2.5, (b.amount / 100) * 40)} strokeLinecap="round" />
          ))}
        </svg>
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: GAP }}>
          {bands.map((b, i) => (
            <div key={b.key} className="relative flex items-center justify-between overflow-hidden rounded-lg border pl-3.5 pr-3" style={{ height: heights[i], background: b.bg, borderColor: b.border }}>
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: b.color }} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: b.color }} />
                  <span className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-navy-deep">{b.label}</span>
                </div>
                {heights[i] > 46 && <span className="mt-0.5 block pl-3 text-[9.5px] text-ink-secondary">{b.sub}</span>}
              </div>
              <span className="shrink-0 font-display leading-none" style={{ color: b.color, fontSize: heights[i] > 90 ? 21 : heights[i] > 42 ? 16 : 14 }}>{b.display}</span>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center px-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[11px] font-bold leading-none shadow-sm" style={{ borderColor: '#E9D49A', color: GOLD }}>→</span>
        </div>
        <div className="flex w-[112px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 text-center" style={{ background: 'linear-gradient(160deg, #FBF1D8 0%, #FFFAEC 100%)', borderColor: '#E9D49A', boxShadow: `0 14px 28px ${GOLD}40` }}>
          <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: '#9A7B1E' }}>PAT margin</span>
          <span className="mt-1 font-display text-[26px] leading-none" style={{ color: GOLD }}>{patMargin == null ? '—' : `${patMargin.toFixed(1)}%`}</span>
          <span className="mt-1 text-[8.5px] leading-snug text-ink-secondary">{outputCaption}</span>
          <span className="mt-1.5"><LensBasisPill basis={ctx.basis} label={ctx.basisLabel} /></span>
        </div>
      </div>
    </div>
  )
}

// 180° gauge — single arc over a faint zoned track (capital-support meter).
function SemiGauge({ value, min, max, zones, unit = 'x', size = 160 }: { value: number; min: number; max: number; zones: { from: number; to: number; color: string }[]; unit?: string; size?: number }) {
  const clamped = Math.max(min, Math.min(max, value))
  const angle = 180 * ((clamped - min) / (max - min))
  const arcData = [{ name: 'fill', value: angle }, { name: 'rest', value: 180 - angle }]
  return (
    <div className="relative w-full" style={{ height: size * 0.58 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={zones.map((z) => ({ name: z.color, value: ((z.to - z.from) / (max - min)) * 180 }))} dataKey="value" cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="84%" outerRadius="93%" stroke="#fff" strokeWidth={0.5} isAnimationActive={false}>
            {zones.map((z, i) => (
              <Cell key={i} fill={z.color} fillOpacity={0.18} />
            ))}
          </Pie>
          <Pie data={arcData} dataKey="value" cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="94%" outerRadius="100%" stroke="none" isAnimationActive={false}>
            <Cell fill={zones.find((z) => clamped >= z.from && clamped <= z.to)?.color ?? PALETTE.navy} />
            <Cell fill="transparent" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="font-display text-[22px] leading-none text-navy-deep">{value.toFixed(unit === 'x' ? 2 : 1)}{unit}</span>
      </div>
    </div>
  )
}

// ─── (F) Capital support — solvency gauge + buffer + growth support ───────────
function CapitalCard({ company }: { company: Insurer }) {
  const s = company.solvency
  const status = s >= 2 ? { label: 'Comfortable', tone: 'positive' as ChipTone } : s >= 1.5 ? { label: 'Adequate', tone: 'warning' as ChipTone } : { label: 'Tight', tone: 'negative' as ChipTone }
  const growth = s <= 0 ? '—' : s >= 2.5 ? 'Ample headroom to fund growth' : s >= 2 ? 'Comfortable headroom for growth' : 'Adequate, watch as growth uses capital'
  return (
    <div className="rounded-xl border p-4" style={{ background: ACCENT_TINT.deepGreen.cardBg, borderColor: ACCENT_TINT.deepGreen.cardBorder }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Capital support</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Solvency vs the 1.5× floor</h3>
        </div>
        <SignalBadge label={status.label} tone={status.tone} size="sm" />
      </div>
      {s > 0 ? (
        <div className="mt-2 grid items-center gap-3 sm:grid-cols-[1.1fr_1fr]">
          <SemiGauge value={s} min={1} max={3.5} unit="x" zones={[{ from: 1, to: 1.5, color: PALETTE.coral }, { from: 1.5, to: 2, color: PALETTE.amber }, { from: 2, to: 3.5, color: DEEP_GREEN }]} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg border border-[#CFE7DA] bg-white/70 px-3 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Capital buffer</span>
              <span className="font-display text-[14px]" style={{ color: DEEP_GREEN }}>+{(s - 1.5).toFixed(2)}x</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[#CFE7DA] bg-white/70 px-3 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Regulatory floor</span>
              <span className="font-display text-[14px] text-navy-deep">1.50x</span>
            </div>
            <p className="text-[10px] leading-snug text-ink-secondary">{growth}</p>
          </div>
        </div>
      ) : (
        <div className="mt-2"><PendingNote>{`Solvency pending for ${company.shortName}.`}</PendingNote></div>
      )}
      <div className="mt-2 flex justify-end"><SourceTag source="IRDAI public disclosures" period="FY25" confidence="high" /></div>
    </div>
  )
}

// Short interpretation strip — a single plain-English takeaway after an
// infographic, so non-expert users grasp the meaning instantly.
function InsightStrip({ line, accent }: { line: string; accent: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border px-4 py-2.5" style={{ background: `${accent}10`, borderColor: `${accent}3a` }}>
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
      <p className="text-[11.5px] leading-relaxed text-navy-deep/90">{line}</p>
    </div>
  )
}

// One plain-English takeaway per stage (real values; honest pending states).
function lensInsight(id: NodeId, company: Insurer, series: AnnualPoint[], ctx: BasisCtx): string {
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingFor(company.id, latest) : null
  const mm = getMarginMetrics(series)
  const cr = STATUTORY_CR[company.id]?.statutory ?? (company.combinedRatio > 0 ? company.combinedRatio : null)
  const inv = getEarningsBridge(company.id)[0]?.igaap.investmentIncome ?? null
  switch (id) {
    case 'premium': {
      const g = premiumGrowth(series)
      return g != null ? `Premium is scaling (+${g.toFixed(0)}%) and most of it is retained and earned.` : 'Most premium is retained after reinsurance and earned through the year.'
    }
    case 'combined':
      return cr == null ? 'Combined ratio pending.' : cr >= 100 ? `Most of premium is still absorbed by claims and costs — combined ${cr.toFixed(1)}% is above ₹100.` : `Claims and costs stay inside ₹100 — combined ${cr.toFixed(1)}%.`
    case 'underwriting-result':
      return uw == null ? 'Underwriting result pending.' : uw < 0 ? `Combined ratio above 100, so core underwriting is not yet profitable (${crc(uw)}).` : 'Core underwriting is profitable before investment income.'
    case 'conversion':
      return mm.latestPat == null ? 'PAT pending.' : (uw != null && uw < 0 ? `Investment income is still doing the heavy lifting for PAT (${crc(mm.latestPat)}).` : `Underwriting and investment income together drive PAT (${crc(mm.latestPat)}).`)
    case 'capital':
      return company.solvency > 0 ? `Capital support remains strong enough to back growth — ${company.solvency.toFixed(2)}× solvency.` : 'Solvency pending.'
    case 'ifrs-revenue':
      return premiumFigures(company.id, series).nep == null ? 'Insurance revenue pending.' : `Net earned premium is the IFRS-style revenue base — ${crc(premiumFigures(company.id, series).nep!)}.`
    case 'ifrs-service':
      return ctx.combinedRatio == null ? 'IFRS service result pending.' : ctx.combinedRatio < 100 ? `IFRS combined ${ctx.combinedRatio.toFixed(1)}% — the service earns a margin.` : `IFRS combined ${ctx.combinedRatio.toFixed(1)}% — the service result is thin.`
    case 'ifrs-finance':
      return inv == null ? 'Investment result pending.' : `Investment income (${crc(inv)}) carries the IFRS bottom line while the service result is thin.`
    case 'ifrs-profit':
      return ctx.pat == null ? 'IFRS profit pending.' : `IFRS PAT ${crc(ctx.pat)}${ctx.patMargin != null ? ` at a ${ctx.patMargin.toFixed(1)}% margin` : ''}.`
    case 'ifrs-margin':
      return ctx.patMargin == null ? 'IFRS margin pending.' : `${ctx.patMargin.toFixed(1)}% of premium reaches IFRS profit — the shareholder-return read.`
    default:
      return ''
  }
}

// ─── Lens "Accounting details" drawer — basis, bridge, numbers, why, sources ──
function DrawerBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne-deep">{title}</p>
      {children}
    </div>
  )
}

function LensDrawerNumbers({ company, lens }: { company: Insurer; lens: LensConfig }) {
  const periods: BasisPeriod[] = ['FY25', 'FY26']
  const rows: { label: string; fmt: (b: BasisProfit) => string | null }[] = [
    { label: 'PAT (₹ Cr)', fmt: (b) => (b.pat == null ? null : crc(b.pat)) },
    { label: 'PAT margin', fmt: (b) => (b.patMarginGwp == null ? null : `${b.patMarginGwp.toFixed(1)}%`) },
    { label: 'Combined ratio', fmt: (b) => (b.combinedRatio == null ? null : `${b.combinedRatio.toFixed(1)}%`) },
    { label: 'Claims ratio', fmt: (b) => (b.claimsRatio == null ? null : `${b.claimsRatio.toFixed(1)}%`) },
    { label: 'Expense ratio', fmt: (b) => (b.expenseRatio == null ? null : `${b.expenseRatio.toFixed(1)}%`) },
  ]
  if (lens.dataBasis === 'igaap') rows.push({ label: 'Expense of mgmt', fmt: (b) => (b.eom == null ? null : `${b.eom.toFixed(1)}%`) })
  const cells = periods.map((p) => getBasisProfit(company.id, lens.dataBasis, p))
  const usableRows = rows.filter((r) => cells.some((c) => c != null && r.fmt(c) != null))
  if (!hasBasisData(company.id) || usableRows.length === 0) {
    return <p className="text-[12px] leading-snug text-ink-secondary">Reported {lens.basisTag} figures are not tracked for {company.shortName}.</p>
  }
  return (
    <div className="overflow-hidden rounded-xl border border-soft-border">
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-ice/70 text-ink-secondary">
            <th className="px-3 py-1.5 text-left font-semibold">Metric</th>
            {periods.map((p) => (
              <th key={p} className="px-3 py-1.5 text-right font-semibold">{periodLabel(p)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usableRows.map((r) => (
            <tr key={r.label} className="border-t border-soft-border">
              <td className="px-3 py-1.5 text-navy-deep">{r.label}</td>
              {cells.map((c, i) => (
                <td key={i} className="px-3 py-1.5 text-right font-semibold tabular-nums text-navy-deep">{(c ? r.fmt(c) : null) ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LensDetailDrawer({ open, onClose, lens, company }: { open: boolean; onClose: () => void; lens: LensConfig; company: Insurer }) {
  const d = lens.detailDrawer
  const tone = ACCENT_HEX[lens.tone]
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${company.shortName} · ${lens.basisTag}`}
      subtitle="Accounting details — basis, bridge, reported numbers and sources."
      footer={<p className="text-[11px] text-ink-secondary">Check the basis before comparing profit across companies or to valuation.</p>}
    >
      <div className="space-y-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ borderColor: `${tone}55`, background: `${tone}12`, color: tone }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
          {lens.basisTag} basis
        </span>
        <DrawerBlock title="Basis used">
          <p className="text-[12.5px] leading-relaxed text-navy-deep/85">{d.basisUsed}</p>
        </DrawerBlock>
        <DrawerBlock title="Formula / bridge">
          <ul className="space-y-1.5">
            {d.formula.map((f, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-navy-deep/85">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: tone }} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </DrawerBlock>
        <DrawerBlock title="Reported numbers">
          <LensDrawerNumbers company={company} lens={lens} />
        </DrawerBlock>
        <DrawerBlock title="Why this matters">
          <p className="text-[12.5px] leading-relaxed text-navy-deep/85">{d.why}</p>
        </DrawerBlock>
        <DrawerBlock title="Sources">
          <div className="flex flex-wrap gap-2">
            {d.sources.map((s, i) =>
              s.url ? (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-2.5 py-1 text-[11px] font-medium text-navy-primary transition-colors hover:border-muted-blue">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                  {s.label}{s.period ? ` · ${s.period}` : ''}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-2.5 py-1 text-[11px] font-medium text-ink-secondary">
                  {s.label}{s.period ? ` · ${s.period}` : ''}
                </span>
              ),
            )}
          </div>
        </DrawerBlock>
      </div>
    </Drawer>
  )
}

// In-page lens switcher — the three accounting lenses, tone-coded. Keeps the
// sidebar nesting and the page in sync (navigates to the lens route) and gives
// mobile a switcher where the nested sidebar is hidden.
function LensSwitcher({ activeKey, onNavigate }: { activeKey: ProfitLens; onNavigate: (id: string) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
      {LENS_ORDER.map((key) => {
        const l = profitabilityLenses[key]
        const on = key === activeKey
        const tone = ACCENT_HEX[l.tone]
        return (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(l.routeId)}
            aria-pressed={on}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all duration-200"
            style={on ? { background: '#fff', color: PALETTE.navyDeep, boxShadow: '0 2px 8px rgba(23,43,77,0.10)' } : { color: '#6B7488' }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? tone : `${tone}66` }} />
            {l.label}
          </button>
        )
      })}
    </div>
  )
}

function ProfitabilityDetail({ stage, lens, company, series, ctx, period, quarter, quarterPrev, onOpenDrawer }: { stage: LensStage; lens: LensConfig; company: Insurer; series: AnnualPoint[]; ctx: BasisCtx; period: TimePeriod; quarter: BasisPeriod | null; quarterPrev: BasisPeriod | null; onOpenDrawer: () => void }) {
  const id = stage.semantic
  const metaPeriod = ctx.isIfrs ? ctx.pLabel : 'FY25'
  const metaSource = ctx.isIfrs ? ctx.sourceLabel : BASIS_SOURCE_LABEL[lens.dataBasis]
  const meta = stageMeta(stage, metaSource, metaPeriod)
  const status: { label: string; tone: ChipTone } = resolveStage(stage, company, series, ctx, period, quarter).badge
  // The single dynamic trend chart for this stage — a yearly line sourced to
  // match the stage node. The chart area stays put; only its content changes as
  // the reader clicks a different story-map stage.
  const trend = stageTrend(id, company, series, meta.accent)
  const header = <StageStoryHeader meta={meta} stage={stage} status={status} onOpenDrawer={onOpenDrawer} />
  const read = (
    <NodeInvestorRead read={nodeRead(id, company, series, ctx)} accent={meta.accent} src={lensSource(id, company.id)} period={ctx.isIfrs ? ctx.pLabel : meta.period} ctx={ctx} />
  )

  // Quarterly / monthly: a compact standalone-quarter comparison under the
  // storyline header; the yearly trend still shows below.
  if (period !== 'Annual') {
    return (
      <div key={`${lens.key}-${id}`} className="animate-fade-in space-y-4">
        {header}
        {quarterlyNodeBody(stage, lens, company, quarter, quarterPrev)}
        {trend && <StageTrendCard data={trend} accent={meta.accent} />}
        {read}
      </div>
    )
  }

  // Annual — storyline header → stage infographic → fixed trend → interpretation
  // strip → structured investor read. The infographic explains how that stage of
  // profit is built; the trend shows its history; the strip gives the takeaway.
  let infographic: ReactNode
  switch (id) {
    case 'premium':
    case 'ifrs-revenue':
      infographic = <PremiumFlowCard company={company} series={series} />
      break
    case 'combined':
      infographic = <CostDonut company={company} />
      break
    case 'underwriting-result':
      infographic = <UnderwritingWaterfall company={company} series={series} />
      break
    case 'conversion':
      // The premium-to-profit conversion bridge + the profit-quality equation
      // (core underwriting + investment support = PAT, with the investment-led read).
      infographic = (
        <div className="space-y-4">
          <ConversionBridge company={company} series={series} ctx={ctx} />
          <ProfitQualityCheck companyId={company.id} companyShort={company.shortName} />
        </div>
      )
      break
    case 'capital':
      infographic = <CapitalCard company={company} />
      break
    default:
      infographic = <MetricChipsCard detail={stageDetail(id, company, series, ctx)} />
  }

  return (
    <div key={`${lens.key}-${id}`} className="animate-fade-in space-y-4">
      {header}
      {infographic}
      {trend && <StageTrendCard data={trend} accent={meta.accent} />}
      <InsightStrip line={lensInsight(id, company, series, ctx)} accent={meta.accent} />
      {read}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main section — Profitability Story Map (clickable engine drives the page)
// ---------------------------------------------------------------------------

// Bottom-of-section pager — confirms the active stage and offers the next (and
// previous) one. Driven by the active lens's stage order; switching is handled by
// the parent, which also smooth-scrolls back to the story map.
function SectionPager({ stages, current, onGo, onRestart }: { stages: LensStage[]; current: NodeId; onGo: (id: NodeId) => void; onRestart: () => void }) {
  const order = stages.map((s) => s.semantic)
  const idx = order.indexOf(current)
  const labelOf = (id: NodeId) => stages.find((s) => s.semantic === id)?.label ?? ''
  const prev = idx > 0 ? order[idx - 1] : null
  const next = idx < order.length - 1 ? order[idx + 1] : null
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-2xl border border-soft-border bg-white px-4 py-2.5 shadow-soft">
      {/* Left — current-stage marker */}
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal/12 text-teal">
          <Check className="h-3 w-3" />
        </span>
        <span className="text-[11px] text-ink-secondary">Viewing</span>
        <span className="text-[12px] font-semibold text-navy-deep">{labelOf(current)}</span>
      </div>

      {/* Center — quiet progress through the lens's stages */}
      <div className="order-last flex w-full items-center justify-center gap-1.5 sm:order-none sm:w-auto">
        {order.map((id, i) => (
          <span
            key={id}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === idx ? 16 : 6, background: i === idx ? GOLD : i < idx ? PALETTE.teal : '#D9DEE7' }}
          />
        ))}
        <span className="ml-1.5 text-[10px] font-semibold tabular-nums text-ink-secondary">
          {idx + 1}/{order.length}
        </span>
      </div>

      {/* Right — previous (subtle) + next (primary) */}
      <div className="flex items-center gap-2">
        {prev && (
          <button
            type="button"
            onClick={() => onGo(prev)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-ink-secondary transition-colors hover:text-navy-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {labelOf(prev)}
          </button>
        )}
        {next ? (
          <button
            type="button"
            onClick={() => onGo(next)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-navy-primary to-navy-deep px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-soft transition-transform duration-200 hover:-translate-y-px"
          >
            Next: {labelOf(next)}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-ice px-3.5 py-1.5 text-[11px] font-semibold text-navy-primary transition-colors hover:bg-soft-blue"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            Back to first stage
          </button>
        )}
      </div>
    </div>
  )
}

export function ProfitabilityCapital({ onNavigate, lens: lensKey }: { onNavigate?: (id: string) => void; lens?: string }) {
  const lens = lensFromRoute(lensKey)
  const basis = lens.dataBasis
  const company = useActiveCompany()
  // Profitability runs its OWN Quarterly/Annual frequency (it ignores the global
  // header Period toggle — profit isn't reported monthly). Aliased to `period`
  // so the section's existing period-aware logic is unchanged.
  const { range, profitabilityFrequency, setProfitabilityFrequency } = useFilters()
  const period: TimePeriod = profitabilityFrequency
  const navigate = onNavigate ?? (() => {})
  // Clip the annual story to the dashboard-wide Data Range (fiscal-year axis).
  const series = getAnnualSeries(company.id).filter((p) => labelInRange(p.fy, range))
  // The lens overrides the "Basis: …" wording (e.g. "Statutory reporting · IGAAP").
  const basisCtx: BasisCtx = { ...buildBasisCtx(company, basis), basisLabel: lens.basisLabel }

  // Selected stage — reset to the lens's first stage whenever the lens changes,
  // and close the details drawer. The page stays mounted across lens switches so
  // the transition stays calm (no full re-animation), so we reset explicitly.
  const [selected, setSelected] = useState<NodeId>(lens.stages[0].semantic)
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    setSelected(lens.stages[0].semantic)
    setDrawerOpen(false)
  }, [lens.key])
  // Guard against a stale selection mid-switch (the effect runs after render).
  const activeStage = lens.stages.find((s) => s.semantic === selected) ?? lens.stages[0]

  // Period lens. Quarterly profitability exists only as standalone Q4 cells; the
  // latest in-range FY picks the quarter. Monthly has none → Pending.
  const latestFy = series[series.length - 1]?.fy ?? null
  const quarter: BasisPeriod | null =
    period === 'Quarterly' && latestFy && Q4_PERIODS.includes(`Q4${latestFy}` as BasisPeriod)
      ? (`Q4${latestFy}` as BasisPeriod)
      : null
  const quarterPrev: BasisPeriod | null = quarter === 'Q4FY26' && labelInRange('FY25', range) ? 'Q4FY25' : null
  const periodTag = period === 'Quarterly' ? (quarter ? periodLabel(quarter) : 'Quarterly') : 'FY25'

  const stages = buildLensStages(lens, company, series, basisCtx, period, quarter)

  // Bottom-of-section navigation anchors back to the story map.
  const mapRef = useRef<HTMLDivElement>(null)
  const goToSection = (id: NodeId) => {
    setSelected(id)
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ── Hero verdict + signal (lens-aware) ──
  const hasCR = company.combinedRatio > 0
  const headlineCR = STATUTORY_CR[company.id]?.statutory ?? (hasCR ? company.combinedRatio : null)
  const ct = headlineCR != null ? combinedTone(headlineCR) : { label: 'Reported', tone: 'neutral' as Tone }
  const mm = getMarginMetrics(series)

  const latestBridge = getEarningsBridge(company.id)[0] ?? null
  const investmentLed = latestBridge != null && latestBridge.igaap.underwritingResult < 0 && latestBridge.igaap.pat > 0
  const statutoryVerdict = latestBridge != null
    ? investmentLed
      ? `PAT ${mm.latestPat != null ? crc(mm.latestPat) : 'reported'} but investment-income-led — turning underwriting profitable is the next trigger; ${company.solvency.toFixed(2)}× solvency is a strong cushion.`
      : `Core underwriting is profitable — high-quality PAT, with ${company.solvency.toFixed(2)}× solvency.`
    : !hasCR
      ? `Life carrier — ${company.solvency.toFixed(2)}× solvency.`
      : `Combined ${headlineCR != null ? headlineCR.toFixed(1) : '—'}% · ${company.solvency.toFixed(2)}× solvency.`
  const ifrsVerdict = basisCtx.tracked
    ? `Ind AS / IFRS-style (${basisCtx.pLabel}): PAT ${basisCtx.pat == null ? 'pending' : crc(basisCtx.pat)}${basisCtx.patGrowth == null ? '' : ` (${basisCtx.patGrowth >= 0 ? '+' : ''}${basisCtx.patGrowth.toFixed(0)}% YoY)`} · combined ${basisCtx.combinedRatio == null ? 'pending' : `${basisCtx.combinedRatio.toFixed(1)}%`}. The gap to statutory is accounting, not cash.`
    : `Ind AS / IFRS-style profitability is not tracked for ${company.shortName}. Tracked for ${BASIS_TRACKED_COMPANIES.join(', ')}.`
  const verdictSummary = lens.key === 'ifrs' ? ifrsVerdict : statutoryVerdict

  // Hero signal badge + accent. Annual: the lens's combined ratio; quarterly: the
  // quarter's combined ratio (or Pending).
  const ifrsCt = basisCtx.combinedRatio != null ? combinedTone(basisCtx.combinedRatio) : { label: 'Reported', tone: 'neutral' as Tone }
  const annualSignal = lens.key === 'ifrs' ? ifrsCt : ct
  const quarterCR = period === 'Quarterly' && quarter ? getBasisProfit(company.id, basis, quarter)?.combinedRatio ?? null : null
  const signal = period === 'Annual' ? annualSignal : quarterCR != null ? combinedTone(quarterCR) : { label: 'Pending', tone: 'neutral' as Tone }
  const toneHex = (t: Tone) => (t === 'positive' ? PALETTE.emerald : t === 'warning' ? PALETTE.amber : t === 'negative' ? PALETTE.coral : PALETTE.navy)
  const headerTone = toneHex(signal.tone)
  const lensTone = ACCENT_HEX[lens.tone]

  return (
    <div className="space-y-5">
      {/* ─── PAGE HEADER — title · lens · verdict + lens switcher ─── */}
      <section className="card-surface relative overflow-hidden p-4">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: `linear-gradient(180deg, ${headerTone} 0%, ${PALETTE.champagne} 100%)` }} />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-60"
          style={{ background: `radial-gradient(circle at 80% 30%, ${PALETTE.champagneSoft} 0%, transparent 60%), radial-gradient(circle at 60% 80%, ${PALETTE.softBlue} 0%, transparent 60%)` }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-x-5 gap-y-3 pl-2">
          <div className="min-w-[260px] flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-2.5 w-2.5 text-champagne" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Profitability · {lens.basisTag} · {periodTag}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[20px] leading-tight text-navy-deep">{company.shortName} · Profitability</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ borderColor: `${lensTone}55`, background: `${lensTone}12`, color: lensTone }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: lensTone }} />
                {lens.basisTag}
              </span>
              <SignalBadge label={signal.label} tone={signal.tone === 'positive' ? 'positive' : signal.tone === 'warning' ? 'warning' : signal.tone === 'negative' ? 'negative' : 'navy'} size="sm" />
            </div>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-secondary">{lens.question}</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-ink-secondary/85">{period === 'Annual' ? verdictSummary : `${periodTag} view — the story map shows what is reported for this period; the full-year read is on the Annual toggle.`}</p>
            <BasisExplainer basis={basis} className="mt-1.5 max-w-2xl" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {/* Profitability's OWN frequency toggle — independent of the global
                header Period. No Monthly (profit isn't reported monthly). */}
            <div className="flex flex-col items-end gap-0.5">
              <SegmentedControl<ProfitabilityFrequency>
                options={['Quarterly', 'Annual']}
                value={profitabilityFrequency}
                onChange={setProfitabilityFrequency}
                size="sm"
              />
              <span className="text-[9px] uppercase tracking-[0.08em] text-ink-secondary/70">Profitability frequency</span>
            </div>
            <LensSwitcher activeKey={lens.key} onNavigate={navigate} />
          </div>
        </div>
      </section>

      {/* ─── STORY MAP — clickable engine controls the lens ─── */}
      <div ref={mapRef} className="scroll-mt-24">
        <ProfitabilityEngine
          company={company}
          series={series}
          stages={stages}
          selectedId={activeStage.semantic}
          onSelect={setSelected}
          basis={basis}
          basisLabel={basisCtx.basisLabel}
          title={lens.storyMapTitle}
          subtitle={lens.storyMapSubtitle}
        />
      </div>

      {/* ─── ACTIVE LENS DETAIL — one stage's visuals + investor read ─── */}
      <ProfitabilityDetail
        stage={activeStage}
        lens={lens}
        company={company}
        series={series}
        ctx={basisCtx}
        period={period}
        quarter={quarter}
        quarterPrev={quarterPrev}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {/* ─── SECTION PAGER — move stage-to-stage without scrolling up ─── */}
      <SectionPager stages={lens.stages} current={activeStage.semantic} onGo={goToSection} onRestart={() => goToSection(lens.stages[0].semantic)} />

      {/* ─── LENS ACCOUNTING DETAILS DRAWER — basis · bridge · numbers · why ─── */}
      <LensDetailDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} lens={lens} company={company} />
    </div>
  )
}
