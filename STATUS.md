# Project Status — Official Filings → Excel Pipeline

_Last updated: 2026-06-24. Branch: `main`._

This is the handoff/status doc for the official-filings → Excel-fill work. The
container is ephemeral, so this lives in the repo so the next session can pick up
without re-deriving state.

## Where it stands
- **AI Mode in the Data Audit table** (Neha, 2026-06-24): a lightweight **AI Mode**
  toggle sits on the Data Audit page. With it on, the reviewer **drag-selects cells
  like Excel** (rectangular range; Esc / Clear to reset); a floating bar shows
  "N cells selected · R ready · G gaps". **Analyse selected data** opens a compact
  right drawer with an instant, free in-browser readout (count · ready/gaps ·
  highest/lowest · peer rank · formula) and, on click, a short AI read (4-6 bullets
  + a useful formula + a plain conclusion) via the Cloudflare Pages function
  `functions/api/insight.ts` (Anthropic key stays server-side; output passes a
  fail-closed grounding + no-advice gate, retried once; identical selections are
  cached). No separate tab/grid — it lives inside the existing audit table; AI Mode
  off leaves all existing behaviour (click-to-source, verifier overlay) untouched.
  Uses the audit table's own `AuditCell` as the single source of truth; only ready,
  numeric cells feed the stats (missing/blocked ≠ 0); single-FY selections never
  imply a trend. **One manual step to switch the AI on:** set `ANTHROPIC_API_KEY` in
  the Cloudflare Pages project settings (Workers & Pages → project → Settings →
  Environment variables). The instant readout works without it. Runbook:
  `functions/README.md`.
- **Full-auto across every Data Audit tab** (Neha, 2026-06-11): every fetch
  workflow now has a schedule — nothing is dispatch-only any more (company
  PDFs monthly-7th, SAHI financials monthly-8th, deck metrics monthly-9th,
  ownership monthly-12th, valuation weekly-Tue, intelligence weekly-Wed,
  screener weekly-Thu, distribution quarterly, IRDAI handbook yearly-Dec,
  GIC every-3-days, analyst coverage monthly-5th). New:
  `analyst-coverage-fetch.yml` + `analyst-coverage-agent.ts` — reads the 55
  DATED broker reports from schema-map.json (so template edits change the ask
  automatically), the muns agent resolves each report's target price +
  price-at-reco from public aggregator pages (sanctioned low-confidence
  backup; rows without a source URL are dropped), snapshot →
  `analyst_target_price::<broker>` / `analyst_price_at_reco::<broker>` at
  rank 9. Valuation agent now also covers ICICI Lombard + Go Digit (Comps
  peers). The 33 genuinely not-applicable Industry Growth cells (insurers
  not yet licensed / merged away / exited) now render grey "not applicable"
  with per-cell reasons via data/source-map/not-applicable-cells.json —
  real data still wins if it ever appears.
- **1,859 fillable cells filled (83.8%). QA passes (no hard violations).**
- **Channel Mix tab 556/556 filled + automated** (Neha, 2026-06-11): the tab now
  binds all four blocks (mix %, avg premium/policy, % commission, agents
  GWP/policies; rows 31/33/35 stay in-sheet formulas). 206 cells fill from the
  rebuilt **NL-36/NL-40 business-acquisition parser** (`ingest-distribution.ts`,
  caption-anchored, column-aware: up-to-period premium + policies, dominance-
  picked column group, Total(A) tie-out gate, committed parse cache) — Care all
  8 columns official, Niva FY22→9MFY26 official; 350 cells from
  **Neha's workbook seed** (`channel-mix-seed.json`, rank 8, zeros kept — they
  are genuine 0% commission figures). Verified: the workbook IS the NL-form
  premium basis (matches to the 4th decimal on every overlapping cell; the only
  >0.15pp deltas are Care FY25/9MFY26 cells where the workbook itself holds
  estimates and the official parse now wins). The old snapshot's 2 wrong rows
  (policy-count shares mislabelled as premium mix, one mis-dated) were removed.
  Star rides the seed until its 403-blocked disclosures land. % commission by
  channel has no NL-form source → seed-only by design. Quarterly cadence in the
  scheduled ingest keeps future columns filling hands-off. Runbook:
  EXCEL-INGESTION.md "Channel Mix sheet".
- **QA gate unblocked again** (2026-06-11): the 6 url-less derived group-GWP
  overlay entries (manipalcigna/aditya-birla FY23–FY25, added 2026-06-10) now
  cite the GI Council segment workbook of their retail leg — these were failing
  every scheduled run's QA step.
- **FY26 GWP tab wired to the GIC quarter-end editions** (2026-06-10):
  `gic-health-quarterly.json` holds the printed Jun/Sep/Dec cumulatives
  (Q1/H1/9M, current + restated prior-year) per insurer; FY columns come from
  `gic-health-portfolio.json`. 136/200 inputs filled — the H1 columns wait on
  the Sep-2024/Sep-2025 editions, which the dedicated workflow fetches.
  Reliance General is "IndusInd General" from the Mar-2026 edition (alias
  mapped, as-printed name kept on the row).
- **Industry Growth history seeded from Neha's workbook** (her instruction,
  2026-06-10): 257 cells via `data/source-map/industry-growth-seed.json`
  (built by `scripts/excel/build_industry_growth_seed.py` from the committed
  workbook in `data/uploads/`). Rank-8: ANY official value supersedes a seed;
  seeds can't raise conflicts; the workbook's 38 not-applicable zeros stayed
  empty (missing ≠ zero). 261/295 inputs filled — the 34 gaps are defunct /
  not-yet-licensed insurer eras.
- **Dedicated `gic-segment-monthly.yml` workflow**: the whole GIC chain
  (tiered fetch → parse → value store → fill → audit index → QA → commit with
  rebase+retry) on its own clock (3rd monthly + dispatch + chained from the
  agent pull), immune to slow unrelated sources. The big ingest also gained
  per-fetcher timeouts + a run budget so it always reaches its commit step.
- **QA gate repaired + scheduled commits unblocked** (2026-06-10): all 115
  url-less audit-overlay citations (the cause of 54 hard violations that were
  failing EVERY scheduled ingest run at the QA step, before the commit) now
  carry their document URL — exact PDF links where recorded in the repo's
  manifests, the official disclosures landing page (honestly noted in the
  entry) where the exact file link was never captured.
- **GIC fetch made bullet-proof** (2026-06-10): all gicouncil.in requests go
  through `scripts/ingest/gic-fetch.ts` — direct → headless browser →
  INGEST_FETCH_PROXY → ScraperAPI → keyless public relays → Internet Archive
  (incl. fresh Save-Page-Now captures), with byte-level validation at every
  tier and a muns-agent listing fallback. The monthly agent workflow now
  enumerates ALL listing links, and `ingest-gicouncil-segment-annual.ts`
  auto-scans every agent-pull manifest (full-FY files feed the FY columns,
  monthly editions auto-stage for the monthly pipeline). The agent workflow
  chains into the main ingest, which rebuilds the grid and commits.
- **Industry Growth tab filled from the GI Council segment-wise report**
  (2026-06-10): 19 → 124 cells. FY26 column 30/30, FY25 30/32 (the 2 gaps are
  honest — Reliance Health exited 2019, HDFC Ergo Health merged FY21; no FY25
  SAHI rows exist). FY23/FY24 back-filled from the same three official workbooks
  already committed under `data/agent-pulls/` (sha256-manifested). New pipeline:
  `npm run ingest:gic-segment-annual` → `gic-health-portfolio.json` snapshot +
  gap-fills `industry-segment-premium.json`; March / "final segment" editions
  only; newest GIC statement per FY wins (restatements supersede); idempotent;
  136-check independent verification against the raw XLSX passed. Note: FY23
  industry total moved 2,56,984 → 2,56,894.25 (GIC's own March-2024 restated
  comparative replacing the handbook-seeded figure, per the canonical rule; the
  row now sums exactly). See EXCEL-INGESTION.md "Industry Growth sheet" for the
  yearly refresh runbook.
- **Aditya Birla Health + ManipalCigna Health statutory cells filled** (2026-06-08)
  from their audited FY25 annual reports — both **auto-fetched** by the
  `fetch-company-pdfs` workflow (grasim & manipalcigna.com served the Actions runner
  directly, no ScraperAPI key needed). GWP/GDPI/NWP/NEP/PAT (FY23–FY25) + claims/
  expense/solvency ratios, via the `annual_report` layer. ManipalCigna FY23 ratios
  came from its FY2022-23 report. Two audited solvency figures corrected wrong
  snapshots (Aditya 2.5→1.84, ManipalCigna 1.7→1.76; old values on Blocked Data).
  NB: ManipalCigna's Summary swaps GWP/GDPI labels (Schedule 1 used); its claims
  ratio is the Health-segment (= company) value, disclosed in whole %.
- Full pipeline working: **extract → bridge → fill → QA**.
- **Star Health statutory cells from its FY25 Annual Report** (Neha, 2026-06-08):
  GWP / NWP / NEP / claims+combined+expense ratios / solvency for FY25 (+FY24, +FY23
  where the 5-yr summary prints them) hand-transcribed from Annexure 2 (p238) &
  Annexure 3 (p239), statutory IGAAP. Corrected the mangled NEP FY25 (14822.2012→
  14822.20), non-statutory PAT FY25 (787→645.86), and expense FY25 (30.4%→30.8%);
  old values on Blocked Data as `superseded_by_annual_report`. GDPI recorded
  separately from GWP. Star quarterly/H1/9M/FY26 stay blank (public disclosures are
  403-blocked, not in repo).
- Niva Bupa **FY25 + FY26 headline ratios** (claims, combined, solvency) now fill
  from the year-end public disclosures, cross-validated across two filings.
- **Statutory NEP wired** (Neha, 2026-06-08): Niva FY26 / H1FY25 / Q4FY25 / H1FY26 /
  Q4FY26 fill from the NL-1 revenue account; FY24/FY25 upgraded to the statutory
  source; FY23 fills the **restated** 2,662.75 (as-first-reported 2,841 kept on
  Blocked Data). All 8 Niva NEP cells now filled.
- **IFRS cells via company decks** (Neha, 2026-06-08 — `no PPT` rule overridden for
  IFRS only): **16 of Niva's 20 IFRS cells** filled from its Q4FY26 / H1FY26 / Q3FY26 /
  Q4FY25 decks — all 8 `pat_ifrs`, `claims_ratio_ifrs` + `expense_ratio_ifrs` for the
  cumulative periods (FY/H1/9M), and `net_worth_ifrs`. The 4 standalone-quarter ratios
  (Q4FY25/Q4FY26 claims+expense) aren't printed in any deck → honestly empty.
  Transcribed by hand with page-level provenance; every audit row states
  "special-purpose IFRS, not the statutory filing".
- Workbook (gitignored build artifact): `output/Niva_Bupa_portfolio_review__filled.xlsx`.
- **Setup note:** fill/QA need `openpyxl` (`pip3 install openpyxl`). Re-extracting
  deck figures needs `pypdfium2`; the values are already transcribed into
  `data/source-map/deck-sourced-values.json`, so the pipeline itself doesn't need it.

## Regenerate the workbook
```bash
npx tsx scripts/ingest/fetch-company-filings.ts   # parse staged PDFs -> company-filings-snapshot.json
python3 scripts/excel/build_value_store.py         # bridge -> data/processed/excel-values.json
python3 scripts/excel/fill_template.py             # fill the workbook
python3 scripts/excel/qa_checks.py                 # QA gate (non-zero exit on hard failure)
```
If you drop NEW official PDFs into `data/raw/company-filings/<company>/<period>/`,
run `python3 scripts/excel/build_filings_inventory.py` first to stage them.

## What's built (chunks 2A–2F + basis rule)
- **Column-aware NL-20 parser**, both layouts — Care decimal, Niva/ICICI percent/`**`,
  ICICI segmental detected & blocked: `scripts/ingest/nl-form-parser.ts`.
- **NL-1 revenue-account parser** (statutory NEP): same file.
- **Inventory period fix** (`Mon-YYYY` → correct fiscal quarter; `fetched_at` preserved):
  `scripts/excel/build_filings_inventory.py`.
- **Bridge** with source-priority resolution, conflict handling, the statutory-1/n
  basis rule, and the NEP restatement-supersede rule: `scripts/excel/build_value_store.py`.
- **Deck-sourced layer** (`company_deck`, rank 2): hand-transcribed, page-cited values
  from official investor decks, wired for IFRS cells only — `collect_deck_sourced()`
  reads `data/source-map/deck-sourced-values.json`. Each audit row carries the
  "special-purpose IFRS, not statutory" caveat.
- **Annual-report layer** (`annual_report`, rank 2): hand-transcribed, page-cited
  statutory IGAAP values from official annual reports — `collect_annual_report()`
  reads `data/source-map/annual-report-values.json`. A rank-2 annual-report value
  supersedes a differing lower-priority snapshot/non-statutory value (recorded
  `superseded_by_annual_report`); scoped to the `annual_report` layer + the statutory
  metric set, so company-filing (Niva/Care) behaviour is unchanged. Read with
  `pypdfium2` (the generic parser mangles annual-report fused columns). Used for Star.
- **Visible basis notes**: value records carry an optional `basis_note` surfaced in the
  Source Audit "Basis note" column (exact label, page, basis, GWP-vs-GDPI, supersede).
- **Filler + QA**: `scripts/excel/fill_template.py`, `scripts/excel/qa_checks.py`.
- **Manual-download worklist** (source-blocked frontier): `data/source-map/coverage-worklist.json`.

## Durable rules in force
- **`preferred_ratio_basis = statutory_1n`** — for combined/claims/expense/commission,
  the statutory IRDAI 1/n value wins; an adjusted ex-1/n value → Blocked Data
  (`basis_mismatch_ex_1n_adjusted`, "Annual report adjusted ex-1/n ratio; not
  comparable to statutory 1/n cell"); unclear basis → held `basis_unclear`, not filled.
- **Missing ≠ zero** — never coerce a missing value to 0; hold/mark it.
- **Column rule** — FY cells use the YTD column, quarter cells the standalone column,
  solvency is point-in-time (verified per cell in Source Audit → "Column basis").
- **No PPT values. No annual-report fused tables. No unofficial sources.**
  *Exception (Neha, 2026-06-08): the `no PPT` rule is overridden for **IFRS cells
  only** — deck figures are wired via the `company_deck` layer, hand-transcribed with
  page-level provenance and labelled "special-purpose IFRS, not the statutory filing".*
  *The `no annual-report fused tables` rule bans the **mangled auto-parse**, not the
  report itself: clean, hand-transcribed, page-cited statutory figures (Annexure 2/3)
  via the `annual_report` layer are allowed and authoritative (Neha, 2026-06-08).*
- **Screener fallback (Neha, 2026-06-08)** — Screener.in is allowed ONLY as a
  clearly-labelled, **lowest-rank (9)** fallback: after official fetch/staging fails,
  and ONLY for metrics it directly provides (`pe_ttm` / `price_to_book` / `roe` —
  none statutory). Tagged `source_layer=screener_fallback` + basis_note "pending
  official filing verification"; **superseded by any official value (rank 1–3), never
  silently mixed, and it can never fill a statutory cell** (Screener has no statutory
  metric). `collect_screener()` + `SCREENER_MAP` in `build_value_store.py` — the map
  is currently empty (pe_ttm ≠ pe_3yr_avg; no P/B / ROE cells) AND the Screener
  snapshot is empty, so it wires **0** values today; the mechanism is in place for
  when a provided metric has data and a cell. Surfaced in the dashboard's
  **Source Automation & Fallback** module (warning badge + verification status).

---

## PENDING — your decision
1. ~~Wire NEP into Excel?~~ **DONE** (Neha, 2026-06-08) — statutory NL-1 NEP wired
   with the flow/column rule. See "Where it stands".
2. ~~GWP basis.~~ **RESOLVED** — the annual snapshot already supplies Niva GWP on
   the **direct-premium (GDPI)** basis (FY25 = 6,762.23 cr); the ex-1/n headline
   (7,407) stays held. Neha chose "use direct premium" → already in effect for the
   filled cells. Gap remaining: FY26 / H1 / 9M GWP have no direct-premium source.
3. ~~FY23 NEP restatement.~~ **DONE** (Neha, 2026-06-08) — FY23 fills the restated
   2,662.75; as-first-reported 2,841 documented on Blocked Data
   (`superseded_by_statutory_filing`).
4. **IFRS cells (63) — Niva DONE, 6 companies pending.** Niva: 16/20 filled from its
   four decks; the 4 unfilled are standalone-quarter claims/expense ratios that no deck
   prints. **Remaining ~47 cells = the other 6 companies** (Star/Care/ManipalCigna/
   Aditya-Birla/ICICI/GoDigit) — **no decks staged**. Drop their investor decks into
   `data/raw/companies/<id>/`, add page-cited rows to `deck-sourced-values.json`, rerun
   the bridge. Sandbox is 403-blocked on insurer sites, so Neha/an enabled fetch must
   supply the decks.

## PENDING — manual download (this sandbox is 403-blocked on insurer sites)
> **Auto-fetch path (try this first):** `fetch-company-pdfs` workflow (manual
> `workflow_dispatch`) → `scripts/ingest/fetch-company-pdfs.ts` downloads official
> PDFs through ScraperAPI's India IP (gets past the WAF/403). **Runs only in GitHub
> Actions** (needs the `SCRAPERAPI_KEY` secret; api.scraperapi.com is blocked from
> this sandbox). Curated direct-URL targets: Aditya Birla grasim FY25 (primary),
> FY24 (guess), ManipalCigna AR-2023. On success the PDFs land in
> `data/raw/companies/<id>/` and feed the annual_report layer / NL-form parser.
> Manual download below is the fallback if the proxy can't reach a source.
5. **Star Health — FY annuals DONE from the annual report; quarters/FY26 pending.**
   FY25/FY24/FY23 statutory cells now filled from the FY25 AR (see "Where it stands").
   Still missing (no source in repo): **H1/9M/Q4 FY25–FY26 and full-year FY26** ratios
   & premiums — these live in Star's quarterly **public disclosures (NL-20/NL-1)**,
   which are 403-blocked. Steps/links in `coverage-worklist.json`; the NL-form parser
   handles Star's layout — drop files in and they fill automatically. (FY23 NEP and
   the FY23 claims/combined/expense ratios aren't printed in the FY25 AR → also pending
   the FY24/FY23 annual reports or public disclosures.)
6. **Care FY23** — the 31-Mar-2023 disclosure (3 cells). Same worklist.

## PENDING — future build chunks
7. **PAT (IGAAP)** — statutory NL-2 P&L is blank; the IGAAP PAT is reachable from the
   **deck I-GAAP→IFRS reconciliation** (Niva Q4 FY26 deck p.30: I-GAAP PAT FY24 81.9 /
   FY25 213.5 / FY26 130.8) via the same `deck-sourced-values.json` mechanism — a
   pending decision since it's deck-sourced, not the statutory filing.
8. **Expense ratio (Niva/Care, IGAAP)** — held: NL-20 prints 2–3 expense bases, mapping
   not certain. Needs a basis decision or stays held. (IFRS expense ratio is in the deck.)
9. **ICICI** — only a segmental NL-20 staged (correctly blocked); no ICICI cells in
   the schema today. Pursue only if ICICI becomes a peer column.

## Minor tidy-ups (non-blocking)
10. ~50 snapshot-sourced audit rows have a named source but no structured
    `document_type` / `filing_date` — could be back-filled for cleaner click-through.

---

## Highest-leverage next step
**Get the other six insurers' investor decks** (Star/Care/ManipalCigna/Aditya-Birla/
ICICI/GoDigit) — that unlocks ~47 IFRS cells through the same page-cited deck mechanism —
and **download Star's public disclosures** (biggest statutory-ratio gap). Niva's deck
mining is complete (16/20; the rest aren't printed anywhere).
