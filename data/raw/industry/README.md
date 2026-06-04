# Drop industry-source documents here

Place the source document for the **SAHI market-share history** in this folder — for example:

- **Niva Bupa IPO industry report** (RedSeer / CRISIL "Project Vijay"), or
- **IRDAI Handbook on Indian Insurance Statistics**, or
- any annual report / filing that tabulates standalone-health-insurer premium or share by year.

**Accepted:** `.pdf` or `.xlsx`.

Once the file is here (committed to the repo, or added by Claude from a chat
attachment), the FY21–FY24 SAHI market-share-by-year is parsed from it into
`src/data/snapshots/sahi-share-history.json` — **with this exact file cited as
the source** — and the Executive Overview bubble + trend charts read from it.

Real, source-backed data only. No fabricated history (see `CLAUDE.md` →
"No real data? Ask — every time").
