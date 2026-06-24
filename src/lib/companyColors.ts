// ---------------------------------------------------------------------------
//  Company colour identity — one source of truth for how the Data Audit tables
//  tell companies apart. Soft, premium, muted tones used ONLY on the frame
//  (column-block bands, left strips, dots, name tags, group dividers) — never as
//  a heavy cell background, so they never fight the QA status tints inside the
//  data cells. Every audit table (spreadsheet grid, broker coverage, historical
//  stock) reads through this, so a company looks the same wherever it appears.
//
//  Pins, per the owner's brief: Niva Bupa keeps its own steady navy/blue (it's the
//  focal insurer); Star takes a soft yellow/gold; every other company gets its
//  own muted, distinct tone. Aggregates / segments ("Total", "Others", "SAHI",
//  "Private", "PSUs"…) are deliberately NOT companies, so they stay calm slate.
// ---------------------------------------------------------------------------

import companyMaster from '@/data/snapshots/company-master.json'

export interface CompanyColor {
  /** Strong accent — left strips, dots, band underline. */
  key: string
  /** Very soft background wash for a band / strip (premium, never heavy). */
  tint: string
  /** Readable text colour on white. */
  text: string
  /** Soft divider / border between companies. */
  border: string
}

// Calm slate for anything that isn't a single company (industry aggregates,
// segment rows, "Others"/"Total"). Keeps the colour code honest: only real
// companies carry a company colour.
export const NEUTRAL_COMPANY_COLOR: CompanyColor = {
  key: '#8C97A8',
  tint: '#F1F3F6',
  text: '#5A6677',
  border: 'rgba(140,151,168,0.30)',
}

// Explicit, hand-tuned identities for the companies that actually surface in the
// comparison sheets. Soft and muted — a premium wash, never a harsh block.
const PINNED: Record<string, CompanyColor> = {
  // Focal — its own steady navy/blue (matches the dashboard's "selected" tone).
  'niva-bupa': { key: '#27457E', tint: '#EDF2FB', text: '#27457E', border: 'rgba(39,69,126,0.30)' },
  // Star — soft yellow / gold identity (as briefed).
  'star-health': { key: '#B68B3A', tint: '#F7F0DD', text: '#876621', border: 'rgba(182,139,58,0.34)' },
  // The rest — distinct but muted.
  'care-health': { key: '#168E8E', tint: '#E6F3F2', text: '#0F6F6F', border: 'rgba(22,142,142,0.30)' },
  'aditya-birla': { key: '#8A5FA3', tint: '#F1ECF7', text: '#6E4A84', border: 'rgba(138,95,163,0.30)' },
  'manipalcigna': { key: '#4F77A8', tint: '#EAF1F8', text: '#3E5F86', border: 'rgba(79,119,168,0.32)' },
  'icici-lombard': { key: '#B0705A', tint: '#F6EDE8', text: '#8C5642', border: 'rgba(176,112,90,0.32)' },
  'godigit': { key: '#3E8C9C', tint: '#E7F2F4', text: '#2E6B78', border: 'rgba(62,140,156,0.30)' },
  'hdfc-ergo': { key: '#8A7B3A', tint: '#F2EFE0', text: '#6B5F2C', border: 'rgba(138,123,58,0.32)' },
  'bajaj-general': { key: '#6173A6', tint: '#ECEFF7', text: '#4C5C88', border: 'rgba(97,115,166,0.32)' },
}

// Fallback rotation for any other real company id not pinned above — still soft
// and muted, just assigned by a stable hash so it stays consistent run-to-run.
const ROTATION: CompanyColor[] = [
  { key: '#5B8A72', tint: '#EAF2EC', text: '#436B57', border: 'rgba(91,138,114,0.30)' },
  { key: '#9A6B8E', tint: '#F4ECF1', text: '#7A5170', border: 'rgba(154,107,142,0.30)' },
  { key: '#7E7AAE', tint: '#EFEEF7', text: '#605C8E', border: 'rgba(126,122,174,0.30)' },
  { key: '#A07C45', tint: '#F4EEE1', text: '#7C5F32', border: 'rgba(160,124,69,0.30)' },
  { key: '#4E8597', tint: '#E8F1F4', text: '#3A6675', border: 'rgba(78,133,151,0.30)' },
]

// Real companies (vs aggregate/segment labels) come from the company master.
const COMPANY_IDS = new Set(
  (companyMaster as { data: { company_id: string }[] }).data.map((c) => c.company_id),
)

function hashIndex(id: string, mod: number): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % mod
}

/** Colour identity for an entity id. Pinned where defined, a stable muted tone
 *  for any other real company, and calm slate for non-company entities. */
export function companyColor(entityId: string | undefined): CompanyColor {
  if (!entityId) return NEUTRAL_COMPANY_COLOR
  if (PINNED[entityId]) return PINNED[entityId]
  if (COMPANY_IDS.has(entityId)) return ROTATION[hashIndex(entityId, ROTATION.length)]
  return NEUTRAL_COMPANY_COLOR
}

/** Is this entity a real, single company (so the colour code is meaningful)? */
export function isCompanyEntity(entityId: string | undefined): boolean {
  return !!entityId && COMPANY_IDS.has(entityId)
}

// Short, clean labels for the company filter (the master display names carry
// long legal suffixes that read poorly in a compact control).
const SHORT_NAME: Record<string, string> = {
  'niva-bupa': 'Niva Bupa',
  'star-health': 'Star Health',
  'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla',
  'manipalcigna': 'ManipalCigna',
  'icici-lombard': 'ICICI Lombard',
  'godigit': 'Go Digit',
  'hdfc-ergo': 'HDFC ERGO',
  'bajaj-general': 'Bajaj Allianz',
  'sbi-general': 'SBI General',
  'reliance-general': 'Reliance General',
  'new-india': 'New India',
  'national-insurance': 'National',
  'oriental-insurance': 'Oriental',
  'united-india': 'United India',
  'galaxy-health': 'Galaxy Health',
  'narayana-health': 'Narayana Health',
}

/** A compact, readable company name for filters/tags — falls back to a trimmed
 *  version of the supplied long label. */
export function companyShortName(id: string, fallbackLabel?: string): string {
  if (SHORT_NAME[id]) return SHORT_NAME[id]
  const base = fallbackLabel ?? id
  return base.replace(/ (Health and Allied|and Allied|Health) Insurance$/i, '').replace(/ Insurance$/i, '').trim()
}
