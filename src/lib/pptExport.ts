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

// ── slide content model ───────────────────────────────────────────────────────
const NAVY = '1E4079', GOLD = 'B68B3A', TEAL = '0E6F6D', INK = '26303F', GREY = '6B7280', RISK = 'A8443B', FLAG = '27457E'
const CAT: Record<InsightCategory, { label: string; color: string }> = {
  capital: { label: 'Capital watch', color: RISK },
  earnings_quality: { label: 'Earnings-quality flag', color: RISK },
  valuation: { label: 'Valuation gap', color: GOLD },
  growth: { label: 'Growth standout', color: TEAL },
  quality: { label: 'Quality flag', color: FLAG },
  management: { label: 'Management read', color: FLAG },
  regulatory: { label: 'Regulatory shift', color: FLAG },
  market_structure: { label: 'Market shift', color: FLAG },
}
const NAMES: Record<string, string> = {
  'niva-bupa': 'Niva Bupa', 'star-health': 'Star Health', 'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla', 'manipalcigna': 'ManipalCigna', panel: 'Across the panel',
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

// ── OOXML shape helpers (EMU units; 16:9 slide = 12192000 × 6858000) ──────────
const CX = 12192000, CY = 6858000
function txBox(id: number, name: string, x: number, y: number, w: number, h: number, runs: { t: string; sz: number; color: string; b?: boolean; i?: boolean }[], align = 'l'): string {
  const paras = runs.map((r) =>
    `<a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="en-US" sz="${r.sz}" b="${r.b ? 1 : 0}" i="${r.i ? 1 : 0}"><a:solidFill><a:srgbClr val="${r.color}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xml(r.t)}</a:t></a:r></a:p>`,
  ).join('')
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`
}
function rect(id: number, x: number, y: number, w: number, h: number, color: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="bar${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
}
const slideWrap = (shapes: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`

function titleSlide(file: InsightsFile): string {
  const date = new Date(file.meta.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const shapes = [
    rect(2, 0, 0, CX, 120000, GOLD),
    txBox(3, 'eyebrow', 700000, 1700000, 10000000, 500000, [{ t: 'NIVA BUPA · SAHI HEALTH-INSURANCE DASHBOARD', sz: 1400, color: GOLD, b: true }]),
    txBox(4, 'title', 680000, 2300000, 10800000, 1800000, [{ t: 'What stands out across the dashboard', sz: 4000, color: NAVY, b: true }]),
    txBox(5, 'sub', 700000, 4250000, 10800000, 700000, [{ t: `${file.insights.length} advisor insights · sharpest first · ${date}`, sz: 1600, color: GREY }]),
    txBox(6, 'foot', 700000, 6250000, 10800000, 400000, [{ t: 'Each insight names the single number behind it, what would flip the call, and where to verify it.', sz: 1100, color: GREY, i: true }]),
  ].join('')
  return slideWrap(shapes)
}

function insightSlide(ins: Insight, index: number): string {
  const cat = CAT[ins.category] ?? CAT.quality
  const stat = ins.evidence.find((e) => e.value != null) ?? ins.evidence[0]
  const shapes = [
    rect(2, 0, 0, 120000, CY, cat.color),
    txBox(3, 'cat', 700000, 520000, 10800000, 450000, [{ t: `${cat.label.toUpperCase()}  ·  INSIGHT ${ins.rank}`, sz: 1300, color: cat.color, b: true }]),
    txBox(4, 'headline', 680000, 1050000, 10900000, 1500000, [{ t: ins.shortHeadline, sz: 3200, color: NAVY, b: true }]),
    rect(5, 700000, 2750000, 10800000, 9525, 'D9DEE8'),
    // hero number tile
    txBox(6, 'stat', 700000, 2950000, 10800000, 900000, stat
      ? [{ t: fmtVal(stat.value, stat.unit), sz: 3600, color: cat.color, b: true }, { t: `   ${pretty(stat.insurer)} · ${stat.metric} · ${stat.period}`, sz: 1300, color: GREY }]
      : [{ t: '—', sz: 3600, color: cat.color, b: true }]),
    txBox(7, 'why', 700000, 4050000, 10800000, 1700000, [
      { t: 'Why this matters', sz: 1200, color: cat.color, b: true },
      { t: ins.whatConsensusMisses, sz: 1600, color: INK },
    ]),
    txBox(8, 'src', 700000, 6150000, 10800000, 450000, [
      { t: `Source: ${sourceLine(ins)} · ${stat?.period ?? ''}    ·    Slide ${index + 1}`, sz: 1000, color: GREY, i: true },
    ]),
  ].join('')
  return slideWrap(shapes)
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
const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1E4079"/></a:dk2><a:lt2><a:srgbClr val="EEF1F7"/></a:lt2><a:accent1><a:srgbClr val="1E4079"/></a:accent1><a:accent2><a:srgbClr val="0E6F6D"/></a:accent2><a:accent3><a:srgbClr val="B68B3A"/></a:accent3><a:accent4><a:srgbClr val="A8443B"/></a:accent4><a:accent5><a:srgbClr val="27457E"/></a:accent5><a:accent6><a:srgbClr val="6B7280"/></a:accent6><a:hlink><a:srgbClr val="0E6F6D"/></a:hlink><a:folHlink><a:srgbClr val="9C7430"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

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
  a.download = `Insights-${file.meta.dataAsOf || 'dashboard'}.pptx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
