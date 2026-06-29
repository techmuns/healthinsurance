# Task Checklist & Build Update — 2026-06-29

Prepared for **Paragon Partners (India)**, by Munshot.

A checklist deck (`Paragon-Task-Checklist.pdf`, landscape A4) covering the seven
requested changes: a cover, a one-page checklist, then one detail page per task
(the ask + the work done + a zoomed-in screenshot of the live dashboard).

## Status

| # | Task | Status | Where it lives |
|---|------|--------|----------------|
| 01 | Remove life insurance from the industry data | Done | Industry → Industry Snapshot |
| 02 | Pie chart for general insurance (Health, Motor, …) | Done | Industry → General Insurance Premium Mix |
| 03 | Move FY25 references to FY26 | Updated for live data | Whole dashboard (FY26 where published) |
| 04 | Star Health data visibility | Done | SAHI → Companies → Peer Scorecard |
| 05 | IGAAP ⇄ IFRS toggle | Done | SAHI → Companies → Accounting Basis |
| 06 | Channel/retail-mix conflict (67% vs 88–96%) | Done | SAHI → Premium & Distribution |
| 07 | Clarify "60% guidance delivered" (3 met / 2 missed) | Done | SAHI → Governance → Promise Tracker |

Six delivered and verified; task 03 rolls forward automatically as fresh FY26
data is published (periods without FY26 data stay honestly labelled).

## Regenerate

Screenshots in `screenshots/` were captured from the running dev server
(`npm run dev`) with Playwright at 2× scale. The deck is built with:

```bash
python3 progress-updates/paragon-task-checklist-2026-06-29/build_pdf.py
```

(Needs `pymupdf` and `pillow`. Reads the PNGs in `screenshots/`, writes
`Paragon-Task-Checklist.pdf`.)
