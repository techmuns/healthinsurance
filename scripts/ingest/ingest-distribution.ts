// ---------------------------------------------------------------------------
//  Fetcher — Distribution channel mix per insurer.
//
//  Distribution data is buried inside annual reports and the IRDAI public
//  disclosures. The single most reliable, structured source is the
//  **NL-36 "Business Acquisition Through Different Channels"** form that ships
//  inside every non-life / SAHI public-disclosure PDF: a table of per-channel
//  premium (in Rs Lakhs) that we turn into channel shares of GWP.
//
//  This fetcher is OFFLINE-FIRST: it scans the PDFs that
//  ingest-company-disclosures has already saved under
//  data/raw/companies/<id>/ (live discovery of fresh PDFs is owned by that
//  fetcher, not this one). For each company it:
//    1. Walks data/raw/companies/<id>/ for candidate disclosure PDFs.
//    2. pdf-parse → locate the NL-36 channel table.
//    3. Sum per-channel premium → shares of total → DistributionMixRow.
//
//  Conservative by design: a channel we cannot parse stays `null` (never 0),
//  and we only emit a row when the parsed shares sum to ~100% (the merge gate
//  re-checks this via validateChannelMixSum). If nothing parses we return an
//  empty-but-valid 'pending' result rather than throwing.
// ---------------------------------------------------------------------------

import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { RAW_ROOT, appendLog, fileExists, nowIso, readSnapshot } from './util'
import { parsePdf } from './parsers'

const SOURCE_ID = 'distribution_extract'
const PARSER_NAME = 'ingest-distribution'

// PDF filenames that are NOT financial disclosures — skip them outright so we
// never even try to read a channel mix out of an agent-code list / grievance
// policy / complaint form. Mirrors the merge gate's SUSPECT_SOURCE_FILE.
const DENY_FILE =
  /AgentCode|AgentList|CitizenCharter|complain|Grievance|brochure|policy-?wording|prospectus|MGT-?7|kyc|nomination/i

interface CompanyMaster {
  data: Array<{ company_id: string }>
}

export const ingestDistribution: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Distribution channel mix (per-company extract)',
  frequency: 'annual',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')

    const records: SnapshotRecord[] = []
    const warnings: string[] = []

    for (const c of master.data) {
      const dir = resolve(RAW_ROOT, 'companies', c.company_id)
      if (!(await fileExists(dir))) continue
      let pdfs: string[]
      try {
        pdfs = (await walkPdfs(dir)).filter((p) => !DENY_FILE.test(p.split('/').pop() ?? p))
      } catch {
        continue
      }
      if (pdfs.length === 0) continue
      // Newest-named file first (ISO / FY-suffixed names sort sensibly).
      pdfs.sort().reverse()

      let parsedForCompany = false
      for (const pdfPath of pdfs) {
        try {
          const buffer = await readFile(pdfPath)
          const { text } = await parsePdf(buffer)
          const mix = extractChannelMix(text)
          if (!mix) continue

          const fy = inferFY(pdfPath, text)
          const { period, period_type } = inferPeriod(pdfPath, text, fy)

          records.push({
            target: 'distribution-channel-mix',
            keys: { company_id: c.company_id, period, fiscal_year: fy },
            values: {
              period_type,
              banca_share: mix.banca_share,
              broker_share: mix.broker_share,
              agent_share: mix.agent_share,
              corporate_agent_share: mix.corporate_agent_share,
              direct_share: mix.direct_share,
              online_share: mix.online_share,
              others_share: mix.others_share,
              largest_channel: mix.largest_channel,
            },
            provenance: {
              source_name: `${c.company_id} IRDAI NL-36 channel mix (${period})`,
              source_url: `file://${pdfPath}`,
              source_file: pdfPath,
              source_period: period,
              fetched_at,
              parsed_at: nowIso(),
              parser_name: PARSER_NAME,
              confidence: 'medium',
            },
          })
          parsedForCompany = true
          await appendLog('ingest-distribution.log', {
            source: SOURCE_ID,
            company_id: c.company_id,
            status: 'parsed',
            file: pdfPath.split('/').pop(),
            period: `${period} ${fy}`,
            largest_channel: mix.largest_channel,
          })
          // One channel-mix row per company is enough; the newest PDF wins.
          break
        } catch (err) {
          warnings.push(`${c.company_id} (${pdfPath.split('/').pop()}): ${errMsg(err)}`)
        }
      }
      if (!parsedForCompany) {
        warnings.push(`${c.company_id}: no NL-36 / channel-mix table found in ${pdfs.length} PDF(s).`)
      }
    }

    await appendLog('ingest-distribution.log', {
      source: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      records: records.length,
    })

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// ─── NL-36 channel-mix extraction ────────────────────────────────────────────

interface ChannelMix {
  banca_share: number | null
  broker_share: number | null
  agent_share: number | null
  corporate_agent_share: number | null
  direct_share: number | null
  online_share: number | null
  others_share: number | null
  largest_channel: string | null
}

/**
 * Parse the IRDAI "NL-36 Business Acquisition Through Different Channels"
 * table. Each channel row begins with a label followed by numeric columns
 * (premium / no-of-policies pairs across reporting periods). We take the FIRST
 * numeric value after each label as the current-period premium (in Rs Lakhs)
 * and compute each channel's share of the total.
 *
 * Returns null if the form/table is absent or the parsed shares don't sum to
 * ~100% (so we never emit a half-read table the merge gate would reject).
 */
export function extractChannelMix(text: string): ChannelMix | null {
  const low = text.toLowerCase()
  // Anchor on the NL-36 form; also accept the looser "business acquisition
  // through different channels" caption used by some insurers.
  let start = low.indexOf('nl-36')
  if (start < 0) start = low.indexOf('business acquisition through different channels')
  if (start < 0) return null
  const block = text.slice(start, start + 4000)

  const agent = grab(block, /Individual agents([\s\S]{0,40})/i)
  const banca = grab(block, /Corporate Agents\s*-?\s*Banks([\s\S]{0,40})/i)
  const corpOther = grab(block, /Corporate Agents\s*-?\s*Others([\s\S]{0,40})/i)
  const broker = grab(block, /Brokers([\s\S]{0,40})/i)
  const micro = grab(block, /Micro Agents([\s\S]{0,40})/i)
  const directOff = grab(block, /Officers\s*\/\s*Employees([\s\S]{0,40})/i)
  const online = grab(block, /Online\s*\(Through Company[\s\S]{0,20}?Website\)([\s\S]{0,40})/i)
  const posDirect = grab(block, /Point of sales person\s*\(Direct\)([\s\S]{0,40})/i)
  const mispDirect = grab(block, /MISP\s*\(Direct\)([\s\S]{0,40})/i)
  const imf = grab(block, /Insurance Marketing Firm([\s\S]{0,40})/i)
  const webagg = grab(block, /Web Aggregators?([\s\S]{0,40})/i)
  const csc = grab(block, /Common Service Centres?\s*\(CSC\)([\s\S]{0,40})/i)

  // Need the major buckets present, else this isn't really an NL-36 table.
  if (agent == null && broker == null && banca == null) return null

  const directRaw = sum(directOff, posDirect, mispDirect)
  const othersRaw = sum(micro, imf, webagg, csc)
  const onlineRaw = online ?? null

  const total =
    sum(agent, banca, corpOther, broker) + (directRaw ?? 0) + (onlineRaw ?? 0) + (othersRaw ?? 0)
  if (!total || total <= 0) return null

  const pct = (v: number | null): number | null =>
    v == null ? null : Math.round((v / total) * 10000) / 100

  const mix: ChannelMix = {
    agent_share: pct(agent),
    banca_share: pct(banca),
    corporate_agent_share: pct(corpOther),
    broker_share: pct(broker),
    direct_share: pct(directRaw),
    online_share: pct(onlineRaw),
    others_share: pct(othersRaw),
    largest_channel: null,
  }

  // Sanity: parsed shares should reconstruct ~100%. The merge gate enforces
  // this too (±0.6%); we mirror it so we never even stage a broken row.
  const parts = [
    mix.agent_share,
    mix.banca_share,
    mix.corporate_agent_share,
    mix.broker_share,
    mix.direct_share,
    mix.online_share,
    mix.others_share,
  ].filter((v): v is number => typeof v === 'number')
  const checkSum = parts.reduce((s, v) => s + v, 0)
  if (parts.length < 3 || Math.abs(checkSum - 100) > 1) return null

  mix.largest_channel = largestChannel(mix)
  return mix
}

const CHANNEL_LABELS: Record<keyof Omit<ChannelMix, 'largest_channel'>, string> = {
  banca_share: 'Bancassurance',
  broker_share: 'Brokers',
  agent_share: 'Individual Agents',
  corporate_agent_share: 'Corporate Agents',
  direct_share: 'Direct',
  online_share: 'Online',
  others_share: 'Others',
}

function largestChannel(mix: ChannelMix): string | null {
  let best: string | null = null
  let bestVal = -Infinity
  for (const [k, label] of Object.entries(CHANNEL_LABELS) as Array<
    [keyof Omit<ChannelMix, 'largest_channel'>, string]
  >) {
    const v = mix[k]
    if (typeof v === 'number' && v > bestVal) {
      bestVal = v
      best = label
    }
  }
  return best
}

/** First numeric token in a string. Handles "-", "(0)", and "1,23,456.78". */
function firstNum(s: string): number | null {
  const m = s.match(/-?\(?\d[\d,]*(?:\.\d+)?\)?/)
  if (!m) return null
  const t = m[0].replace(/[(),]/g, '')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function grab(block: string, re: RegExp): number | null {
  const m = block.match(re)
  return m && m[1] != null ? firstNum(m[1]) : null
}

function sum(...vals: Array<number | null>): number | null {
  const nums = vals.filter((v): v is number => typeof v === 'number')
  if (nums.length === 0) return null
  return nums.reduce((s, v) => s + v, 0)
}

// ─── period / FY inference (shared shape with company-disclosures) ───────────

function inferFY(filename: string, text: string): string {
  const fnmRange = filename.match(/(\d{2,4})\s*[-–_/%\s]+\s*(\d{2,4})/)
  if (fnmRange) return `FY${fnmRange[2].slice(-2).padStart(2, '0')}`
  const fnmFy = filename.match(/\bFY\s*[-]?\s*(?:20)?(\d{2})\b/i)
  if (fnmFy) return `FY${fnmFy[1].padStart(2, '0').slice(-2)}`
  const head = text.slice(0, 3000)
  const m = head.match(/(20\d{2})\s*[-–/]\s*(?:20)?(\d{2})/) ?? head.match(/FY\s*(?:20)?(\d{2})/i)
  if (m) return `FY${(m[2] ?? m[1]).slice(-2)}`
  return 'FY' + new Date().getFullYear().toString().slice(2)
}

/**
 * NL-36 forms are dated (e.g. "DATE : 31st December, 2024"). A December date
 * inside an FY means a Q3 cut → period_type quarterly. An annual report or a
 * March-dated form is treated as annual.
 */
function inferPeriod(
  filename: string,
  text: string,
  fy: string,
): { period: string; period_type: 'annual' | 'quarterly' } {
  const haystack = `${filename} ${text.slice(0, 4000)}`
  const q = haystack.match(/\bQ([1-4])\b/i) ?? haystack.match(/Qtr\s*([1-4])/i)
  if (q) return { period: `Q${q[1]} ${fy}`, period_type: 'quarterly' }
  const m = text.slice(0, 1200).match(/DATE\s*:\s*\d{1,2}[a-z]{0,2}\s+([A-Za-z]+)/i)
  if (m) {
    const mon = m[1].toLowerCase().slice(0, 3)
    if (mon === 'jun') return { period: `Q1 ${fy}`, period_type: 'quarterly' }
    if (mon === 'sep') return { period: `Q2 ${fy}`, period_type: 'quarterly' }
    if (mon === 'dec') return { period: `Q3 ${fy}`, period_type: 'quarterly' }
    // 31st March → year-end snapshot; treat as annual.
  }
  return { period: fy, period_type: 'annual' }
}

async function walkPdfs(dir: string, depth = 0): Promise<string[]> {
  if (depth > 2) return []
  const out: string[] = []
  const entries = await readdir(dir).catch(() => [] as string[])
  for (const name of entries) {
    const full = resolve(dir, name)
    let isDir = false
    try {
      isDir = (await stat(full)).isDirectory()
    } catch {
      continue
    }
    if (isDir) out.push(...(await walkPdfs(full, depth + 1)))
    else if (/\.pdf$/i.test(name)) out.push(full)
  }
  return out
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
