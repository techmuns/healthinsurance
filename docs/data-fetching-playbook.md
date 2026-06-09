# Data-fetching playbook

What reliably works for pulling insurer financials into the audit grid, and the
traps that wasted time — so future fetches are clean. Keep this current as new
routes prove out.

## Routes that work (in order of preference)

1. **Parse a PDF already in the repo** (`pdf-parse` on files under
   `data/raw/companies/<id>/` or `data/agent-pulls/.../sources/`). Most reliable —
   no network. The dashboard's numbers should trace to one of these files.
2. **Agent fetch** (`sahi-financials-fetch.yml` → `sahi-financials-agent.ts`,
   muns chat + India-IP proxy). Good at *finding* NSE-archived docs
   (`nsearchives.nseindia.com/...`) and downloading them into `sources/`. Use it
   to discover the right document and its URL.
3. **Direct-PDF fetch** (`fetch-company-pdfs.yml` → `fetch-company-pdfs.ts`).
   Downloads a *curated exact PDF URL* through the India IP. Use once the agent
   (or you) has the precise URL. Add the URL to `TARGETS`.

## Key insight: investor decks carry BOTH accounting bases

A company's quarterly **earnings-call / investor presentation** ("the PPT")
usually contains, in an appendix, both:
- **IND AS (IFRS)** KPIs, and
- an **"IGAAP measures vs IndAS"** table + an **IND-AS-to-IGAAP profit
  reconciliation**.

So the deck alone can fill *both* the IGAAP and the IFRS rows — read the whole
deck, not just the front KPI page. Validate each filled year against a known
audited year before trusting it (e.g. the deck's IGAAP FY25 should match the
audited annual-report value). **Standing rule: prefer the PPT on any mismatch.**

## Basis discipline (do not cross-fill)

`1/n` vs `n`-basis GWP, and IGAAP vs IND AS, are **different measures, not a
mismatch**. Never put an IND-AS figure in an IGAAP cell or an `n`-basis premium in
a `1/n` cell. If only the wrong-basis number is available, leave the cell tagged.

## Traps (already fixed / known)

- **`period` must stay path-safe.** It's free text (can carry steering hints), but
  `sahi-financials-agent.ts` now slugifies it for filenames — a raw `/` or `&`
  used to crash the run with `ENOENT`. Still, keep dispatch `period` short.
- **Empty agent replies no longer clobber.** The agent script now skips writing a
  blank answer, so a failed search can't overwrite a prior good pull with 0 bytes.
- **BSE `AttachLive` PDF URLs block proxy/datacenter IPs** — the direct fetcher
  can't pull `bseindia.com/xml-data/corpfiling/AttachLive/*.pdf` even via the
  India relay. Prefer the NSE-archived copy of the same filing, or wait for the
  document on the company's own IR site.
- **JS-gated landing pages return empty** (e.g. `starhealth.in/public-disclosures`)
  — point the agent at a *document*, not a navigation page.
- **Screener.in has no statutory line items** (values are AJAX-loaded) — useless
  for GWP/NWP/NEP/ratios. Backup-tier only.

## When a cell can't be filled

Tag it (value-less overlay entry with `display_tag` + `note`) so the grid shows a
calm "Not available" with the reason on the surface — never leave a naked blank,
never invent a number. Common tags: `IFRS not reported`, `FY26 premium pending`,
`FY25 only`, `Basis changed (FY24)`.
