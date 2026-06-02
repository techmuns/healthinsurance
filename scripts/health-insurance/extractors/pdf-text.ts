// ---------------------------------------------------------------------------
//  PDF text extraction (pdf-parse).
//
//  Returns the full text PLUS a per-page array, so a metric can be attributed
//  to the page it was found on (the spec asks for pageNumber where available).
//  pdf-parse ships a CJS entry that reads a bundled test PDF at import time, so
//  we import its inner module to avoid that side effect — the same approach the
//  existing ingest pipeline uses.
// ---------------------------------------------------------------------------

import pdfParse from 'pdf-parse/lib/pdf-parse.js'

export interface PdfText {
  text: string
  numpages: number
  /** Page-indexed text (pages[0] is page 1). Best-effort; may be empty. */
  pages: string[]
  /** Document-level metadata where the PDF exposes it. */
  info: Record<string, unknown> | null
}

// Re-implements pdf-parse's default page renderer but also captures each page's
// text into an array we can return alongside the concatenated body.
function makePageCapture(pages: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (pageData: any): Promise<string> => {
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    })
    let lastY: number | undefined
    let text = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of textContent.items as any[]) {
      if (lastY === item.transform[5] || lastY === undefined) text += item.str
      else text += '\n' + item.str
      lastY = item.transform[5]
    }
    pages.push(text)
    return text
  }
}

export async function extractPdfText(buffer: Buffer): Promise<PdfText> {
  const pages: string[] = []
  const result = await (pdfParse as (b: Buffer, o?: unknown) => Promise<{
    text: string
    numpages: number
    info?: Record<string, unknown>
  }>)(buffer, { pagerender: makePageCapture(pages) })
  return {
    text: result.text ?? '',
    numpages: result.numpages ?? pages.length,
    pages,
    info: result.info ?? null,
  }
}

/** Find the 1-based page number whose text contains `snippet`, or null. */
export function pageOf(pages: string[], snippet: string): number | null {
  if (!snippet) return null
  const needle = snippet.replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase()
  if (!needle) return null
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].replace(/\s+/g, ' ').toLowerCase().includes(needle)) return i + 1
  }
  return null
}
