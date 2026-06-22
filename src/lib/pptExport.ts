// ---------------------------------------------------------------------------
//  pptExport — client-side "Export to PowerPoint" for the Insights tab.
//
//  A .pptx is a zip of OOXML parts. With no pptx library available (and no way
//  to add one), this builds a minimal, valid presentation by hand: a title
//  slide + one slide per insight (category, headline, the hero number, the plain
//  "why it matters", and the honest source/period). Text-only by design — no
//  images or charts — so the file stays small and robust.
//
//  The byte-building (pptxBytes / zipStore) is pure and runs in Node too, so it
//  can be structurally validated offline; the download helper is browser-only.
// ---------------------------------------------------------------------------

import type { Insight, InsightCategory, InsightsFile } from '@/insights/types'

const enc = new TextEncoder()
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── tiny STORE-method zip writer (no compression, so no deflate dependency) ───
interface ZipEntry { name: string; data: Uint8Array }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zipStore(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

  for (const e of entries) {
    const nameB = enc.encode(e.name)
    const crc = crc32(e.data)
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(e.data.length), u32(e.data.length), u16(nameB.length), u16(0), nameB, e.data,
    ])
    chunks.push(local)
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(e.data.length), u32(e.data.length),
      u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameB,
    ]))
    offset += local.length
  }
  const cd = concat(central)
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0),
  ])
  return concat([...chunks, cd, eocd])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

// ── design tokens — mirror the dashboard (tailwind.config.js) so the deck reads
//    like the Insights tab: an editorial-serif voice on an institutional navy /
//    champagne palette, not a generic Office deck. ─────────────────────────────
const NAVY = '27457E', NAVY_DEEP = '172B4D', GOLD = 'B68B3A', TEAL = '168E8E',
  INK = '26303F', GREY = '6B7280', CORAL = 'C75D54', BORDER = 'E1E6EF',
  ICE = 'F4F7FC', MUTE = 'B6C0D2'
// The Insights tab's fonts: Cormorant Garamond (editorial serif — headlines &
// narrative) and Inter (numbers, labels, eyebrows). Both fall back to Georgia /
// a system sans on machines that don't have them installed.
const SERIF = 'Cormorant Garamond', SANS = 'Inter'
const CAT: Record<InsightCategory, { label: string; color: string; soft: string }> = {
  capital: { label: 'Capital watch', color: CORAL, soft: 'F8ECEC' },
  earnings_quality: { label: 'Earnings-quality flag', color: CORAL, soft: 'F8ECEC' },
  valuation: { label: 'Valuation gap', color: GOLD, soft: 'F4ECDB' },
  growth: { label: 'Growth standout', color: TEAL, soft: 'E1F2F1' },
  quality: { label: 'Quality flag', color: NAVY, soft: 'EEF4FF' },
  management: { label: 'Management read', color: NAVY, soft: 'EEF4FF' },
  regulatory: { label: 'Regulatory shift', color: NAVY, soft: 'EEF4FF' },
  market_structure: { label: 'Market shift', color: NAVY, soft: 'EEF4FF' },
}
const NAMES: Record<string, string> = {
  'niva-bupa': 'Niva Bupa', 'star-health': 'Star Health', 'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla', 'manipalcigna': 'ManipalCigna', panel: 'Panel mean',
}
const pretty = (id: string) => NAMES[id] ?? id
const fmtVal = (v: number | null, unit: string) =>
  v == null ? 'n/a' : unit === 'x' ? `${v}x` : unit === '%' || unit === 'pp' ? `${v}${unit}` : `${v} ${unit}`
const LAYER_WORD: Record<string, string> = {
  statutory: 'IRDAI statutory filings', annual_report: 'annual reports', ifrs: 'IFRS accounts',
  broker: 'broker notes', aggregator: 'market aggregators', exchange: 'exchange data',
  derived: 'derived metrics', manual: 'curated filings',
}
function sourceLine(ins: Insight): string {
  const words = [...new Set(ins.evidence.flatMap((e) => e.layers).map((l) => LAYER_WORD[l]))].filter(Boolean).slice(0, 2)
  return words.length ? words.join(', ') : 'dashboard data'
}
// The largest set of evidence values that share ONE unit — an honest like-for-like
// comparison we can draw as bars (never mix % with x). Up to 5.
interface Bar { insurer: string; metric: string; value: number; unit: string }
function barGroup(ins: Insight): Bar[] {
  const vals: Bar[] = ins.evidence
    .filter((e) => typeof e.value === 'number')
    .map((e) => ({ insurer: e.insurer, metric: e.metric, value: e.value as number, unit: e.unit }))
  const byUnit = new Map<string, Bar[]>()
  for (const e of vals) byUnit.set(e.unit || '', [...(byUnit.get(e.unit || '') ?? []), e])
  let best: Bar[] = []
  for (const g of byUnit.values()) if (g.length > best.length) best = g
  return best.slice(0, 5)
}

// ── OOXML shape helpers (EMU units; 16:9 slide = 12192000 × 6858000) ──────────
const CX = 12192000, CY = 6858000
const r0 = Math.round
interface Run { t: string; sz: number; color: string; b?: boolean; i?: boolean; font?: string; spc?: number }
function txBox(id: number, name: string, x: number, y: number, w: number, h: number, runs: Run[], align = 'l', anchor = 't'): string {
  const paras = runs.map((rn) =>
    `<a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="en-US" sz="${rn.sz}" b="${rn.b ? 1 : 0}" i="${rn.i ? 1 : 0}"${rn.spc != null ? ` spc="${rn.spc}"` : ''}><a:solidFill><a:srgbClr val="${rn.color}"/></a:solidFill><a:latin typeface="${rn.font ?? SANS}"/></a:rPr><a:t>${xml(rn.t)}</a:t></a:r></a:p>`,
  ).join('')
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${r0(x)}" y="${r0(y)}"/><a:ext cx="${r0(w)}" cy="${r0(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`
}
function rect(id: number, x: number, y: number, w: number, h: number, color: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="bar${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${r0(x)}" y="${r0(y)}"/><a:ext cx="${r0(w)}" cy="${r0(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
}
function roundRect(id: number, x: number, y: number, w: number, h: number, color: string, adj = 5500): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="rr${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${r0(x)}" y="${r0(y)}"/><a:ext cx="${r0(w)}" cy="${r0(h)}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
}
const slideWrap = (shapes: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FCFCFB"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`

function titleSlide(file: InsightsFile): string {
  const date = new Date(file.meta.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const shapes = [
    rect(2, 0, 0, CX, 150000, GOLD),                  // champagne top rule
    rect(3, 0, CY - 64000, CX, 64000, NAVY_DEEP),     // navy bottom hairline
    txBox(4, 'eyebrow', 760000, 1620000, 10600000, 460000, [{ t: 'NIVA BUPA   ·   SAHI HEALTH-INSURANCE DASHBOARD', sz: 1350, color: GOLD, b: true, spc: 160 }]),
    txBox(5, 'title', 740000, 2220000, 10900000, 1900000, [{ t: 'What stands out across the dashboard', sz: 4600, color: NAVY_DEEP, b: true, font: SERIF }]),
    rect(6, 770000, 4360000, 900000, 13000, GOLD),    // short gold underline
    txBox(7, 'sub', 760000, 4560000, 10800000, 560000, [{ t: `${file.insights.length} advisor insights   ·   sharpest first   ·   ${date}`, sz: 1550, color: GREY }]),
    txBox(8, 'foot', 760000, 6150000, 10800000, 460000, [{ t: 'Each insight names the single number behind it, what would flip the call, and where to verify it.', sz: 1200, color: GREY, i: true, font: SERIF }]),
  ].join('')
  return slideWrap(shapes)
}

function insightSlide(ins: Insight, index: number): string {
  const cat = CAT[ins.category] ?? CAT.quality
  const stat = ins.evidence.find((e) => e.value != null) ?? ins.evidence[0]
  const heroInsurer = stat?.insurer ?? ''
  const shapes: string[] = []
  let id = 2
  const nid = () => id++

  shapes.push(rect(nid(), 0, 0, 95000, CY, cat.color))   // left category rail
  shapes.push(txBox(nid(), 'cat', 760000, 470000, 10900000, 360000, [{ t: `${cat.label.toUpperCase()}   ·   INSIGHT ${ins.rank}`, sz: 1150, color: cat.color, b: true, spc: 120 }]))
  shapes.push(txBox(nid(), 'headline', 740000, 870000, 11050000, 1450000, [{ t: ins.shortHeadline, sz: 3400, color: NAVY_DEEP, b: true, font: SERIF }]))
  shapes.push(rect(nid(), 760000, 2430000, 10680000, 11000, BORDER))   // divider rule

  // LEFT — hero tile + the plain read (editorial serif)
  const colY = 2680000
  shapes.push(roundRect(nid(), 760000, colY, 5350000, 1330000, cat.soft))
  shapes.push(txBox(nid(), 'stat', 985000, colY + 145000, 5000000, 800000, [{ t: stat && stat.value != null ? fmtVal(stat.value, stat.unit) : '—', sz: 4200, color: cat.color, b: true }]))
  shapes.push(txBox(nid(), 'statlbl', 990000, colY + 945000, 5000000, 320000, [{ t: stat ? `${pretty(stat.insurer)} · ${stat.metric} · ${stat.period}` : '', sz: 1050, color: GREY, b: true }]))
  shapes.push(txBox(nid(), 'whylbl', 760000, 4290000, 5350000, 300000, [{ t: 'WHY THIS MATTERS', sz: 1000, color: cat.color, b: true, spc: 100 }]))
  shapes.push(txBox(nid(), 'why', 760000, 4620000, 5350000, 1650000, [{ t: ins.whatConsensusMisses || ins.summary, sz: 1550, color: INK, font: SERIF }]))

  // RIGHT — the visual evidence
  const rx = 6450000, rw = 5000000
  shapes.push(txBox(nid(), 'vtitle', rx, colY - 30000, rw, 340000, [{ t: ins.chart.title, sz: 1050, color: GREY, b: true }]))
  const grp = barGroup(ins)
  const top = colY + 380000, chartH = 2700000
  if (grp.length >= 2) {
    const sameIns = new Set(grp.map((g) => g.insurer)).size === 1
    const maxV = Math.max(...grp.map((g) => Math.abs(g.value)), 0.0001)
    const labelW = 1450000, valueW = 760000, trackX = rx + labelW, trackW = rw - labelW - valueW
    const rowH = r0(Math.min(560000, chartH / grp.length))
    const barH = r0(rowH * 0.46)
    const thr = (ins.chart.annotations ?? []).find((a) => a.kind === 'threshold' && typeof a.value === 'number')
    if (thr && (thr.value as number) >= 0 && (thr.value as number) <= maxV * 1.15) {
      const tx = trackX + r0(((thr.value as number) / maxV) * trackW)
      shapes.push(rect(nid(), tx, top - 30000, 9000, rowH * grp.length + 60000, MUTE))
      shapes.push(txBox(nid(), 'thr', tx - 1150000, top + rowH * grp.length + 30000, 2300000, 280000, [{ t: thr.label, sz: 850, color: GREY, i: true }], 'ctr'))
    }
    grp.forEach((g, i) => {
      const y = top + i * rowH
      const barW = Math.max(46000, r0((Math.abs(g.value) / maxV) * trackW))
      const focal = sameIns ? i === 0 : g.insurer === heroInsurer
      shapes.push(txBox(nid(), `bl${i}`, rx, y + (rowH - 300000) / 2, labelW - 90000, 300000, [{ t: sameIns ? g.metric : pretty(g.insurer), sz: 950, color: INK }], 'r', 'ctr'))
      shapes.push(roundRect(nid(), trackX, y + (rowH - barH) / 2, barW, barH, focal ? cat.color : MUTE, 14000))
      shapes.push(txBox(nid(), `bv${i}`, trackX + barW + 70000, y + (rowH - 300000) / 2, valueW, 300000, [{ t: fmtVal(g.value, g.unit), sz: 950, color: focal ? cat.color : INK, b: true }], 'l', 'ctr'))
    })
  } else {
    // fallback: up to 3 evidence values as clean stat chips
    ins.evidence.filter((e) => typeof e.value === 'number').slice(0, 3).forEach((e, i) => {
      const y = top + i * 720000
      shapes.push(roundRect(nid(), rx, y, rw, 620000, ICE))
      shapes.push(txBox(nid(), `cv${i}`, rx + 210000, y, 2150000, 620000, [{ t: fmtVal(e.value as number, e.unit), sz: 2000, color: cat.color, b: true }], 'l', 'ctr'))
      shapes.push(txBox(nid(), `cl${i}`, rx + 2300000, y, rw - 2450000, 620000, [{ t: `${pretty(e.insurer)} · ${e.metric}`, sz: 1000, color: GREY }], 'l', 'ctr'))
    })
  }

  shapes.push(txBox(nid(), 'src', 760000, 6380000, 10680000, 340000, [{ t: `Source: ${sourceLine(ins)}${stat?.period ? ' · ' + stat.period : ''}     ·     ${index + 1}`, sz: 950, color: GREY, i: true }]))
  return slideWrap(shapes.join(''))
}

// ── the fixed scaffolding (content types, rels, presentation, master, layout, theme) ──
function contentTypes(n: number): string {
  const slides = Array.from({ length: n }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides}</Types>`
}
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`

function presentation(n: number): string {
  const ids = Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${CX}" cy="${CY}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
}
function presentationRels(n: number): string {
  const slides = Array.from({ length: n }, (_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}</Relationships>`
}
const SLIDE_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`
const SLIDE_MASTER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`
const SLIDE_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>`
const SLIDE_LAYOUT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`
const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1E4079"/></a:dk2><a:lt2><a:srgbClr val="EEF1F7"/></a:lt2><a:accent1><a:srgbClr val="1E4079"/></a:accent1><a:accent2><a:srgbClr val="0E6F6D"/></a:accent2><a:accent3><a:srgbClr val="B68B3A"/></a:accent3><a:accent4><a:srgbClr val="A8443B"/></a:accent4><a:accent5><a:srgbClr val="27457E"/></a:accent5><a:accent6><a:srgbClr val="6B7280"/></a:accent6><a:hlink><a:srgbClr val="0E6F6D"/></a:hlink><a:folHlink><a:srgbClr val="9C7430"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Fraunces"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Inter"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

/** Pure: assemble the full .pptx as zip bytes (Node + browser). */
export function pptxBytes(file: InsightsFile): Uint8Array {
  const insights = [...file.insights].sort((a, b) => a.rank - b.rank)
  const parts: ZipEntry[] = []
  const add = (name: string, s: string) => parts.push({ name, data: enc.encode(s) })
  add('[Content_Types].xml', contentTypes(insights.length + 1))
  add('_rels/.rels', ROOT_RELS)
  add('ppt/presentation.xml', presentation(insights.length + 1))
  add('ppt/_rels/presentation.xml.rels', presentationRels(insights.length + 1))
  add('ppt/slideMasters/slideMaster1.xml', SLIDE_MASTER)
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', SLIDE_MASTER_RELS)
  add('ppt/slideLayouts/slideLayout1.xml', SLIDE_LAYOUT)
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', SLIDE_LAYOUT_RELS)
  add('ppt/theme/theme1.xml', THEME)
  // slide 1 = title; then one per insight
  add('ppt/slides/slide1.xml', titleSlide(file))
  add('ppt/slides/_rels/slide1.xml.rels', slideRels)
  insights.forEach((ins, i) => {
    add(`ppt/slides/slide${i + 2}.xml`, insightSlide(ins, i + 1))
    add(`ppt/slides/_rels/slide${i + 2}.xml.rels`, slideRels)
  })
  return zipStore(parts)
}

/** Browser: build the .pptx and trigger a download. */
export function exportInsightsPptx(file: InsightsFile): void {
  const bytes = pptxBytes(file)
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Insights.pptx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
