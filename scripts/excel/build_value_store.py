#!/usr/bin/env python3
"""
Phase 2 bridge - normalized value store for the Excel filler (Chunk 2B).

Two-pass collect-then-resolve:
  Pass 1 gathers candidate values per "<entity>::<metric>::<period>" from every
         source, each tagged with a conservative priority rank + full source proof.
  Pass 2 picks the highest-priority candidate; if a lower-priority OFFICIAL
         candidate differs by >1%, flags conflict_needs_review (never averages,
         never silently drops the disagreement).

Sources & priority (lower rank wins):
  1  company filings - public disclosure (IRDAI NL-form, statutory IGAAP ratios)
  3  existing official snapshots (insurer annual/quarterly, peer, industry, channel,
     price, valuation - produced by the TS pipeline)
  9  third-party backup (screener/trendlyne; only used when nothing official exists)

STRICTNESS (accuracy > coverage, per the governing charter):
  * Only company-filings records with eligible_for_excel=true are read.
  * From company filings we wire ONLY statutory ratios from PUBLIC DISCLOSURES
    (combined/claims/expense/commission/solvency -> *_igaap). Annual-report ratios
    (company-adjusted basis, e.g. "without 1/n") and all premium/PAT amounts
    (GDPI-vs-GWP, IGAAP-vs-IFRS scope ambiguity) are NOT wired here - they remain
    visible in company-filings-snapshot.json for review.
  * Missing stays missing (never 0). Every entry keeps the full source-proof
    contract so the dashboard can link back to the exact document.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

# A standalone-quarter period (e.g. "Q1FY25"). In a statutory NL-form the FIRST
# data column is the standalone quarter, which matches a standalone-quarter cell.
QUARTER_RE = re.compile(r"^Q[1-4]FY\d{2}$")
# Flow ratios accumulate over the year, so on a full-year/Q4 NL-form the full-year
# figure is the YTD column, NOT the first (standalone-quarter) column this path
# reads. Selecting the YTD column is column-aware work deferred to Chunk 2C, so
# full-year flow ratios are HELD. Point-in-time solvency reads identically in the
# standalone and YTD columns, so it is safe at any period.
FLOW_RATIOS = {"combined_ratio", "claims_ratio", "expense_ratio", "commission_ratio"}

REPO = Path(__file__).resolve().parents[2]
SNAP = REPO / "src" / "data" / "snapshots"
OUT = REPO / "data" / "processed" / "excel-values.json"
OUT_HELD = REPO / "data" / "processed" / "excel-held-back.json"

CONF_ORDER = {"high": 0, "medium": 1, "low": 2, "pending": 3, None: 4}
RANK_CF_DISCLOSURE = 1
RANK_EXISTING = 3
RANK_BACKUP = 9


def pct_to_fraction(v):
    return v / 100.0


def identity(v):
    return v


TRANSFORMS = {
    "identity": (identity, "identity (value used as-is)"),
    "pct_to_fraction": (pct_to_fraction, "percent -> fraction (value / 100)"),
}

CANDIDATES: dict[str, list[dict]] = {}


def add_candidate(entity, metric, period, raw_value, normalized_value, transformation, unit,
                  prov, rank, source_layer, status="available", extra=None):
    """Append a candidate value for a key. Nulls dropped (missing != zero)."""
    if normalized_value is None:
        return
    extra = extra or {}
    key = f"{entity}::{metric}::{period}"
    CANDIDATES.setdefault(key, []).append({
        "entity": entity, "metric": metric, "period": period, "unit": unit,
        "raw_value": raw_value, "normalized_value": normalized_value,
        "transformation_used": transformation,
        "source_name": prov.get("source_name"), "source_url": prov.get("source_url"),
        "source_file": prov.get("source_file"), "fetched_at": prov.get("fetched_at"),
        "confidence": prov.get("confidence", "medium"), "source_status": status,
        "priority_rank": rank, "source_layer": source_layer,
        "document_type": extra.get("document_type"), "document_title": extra.get("document_title"),
        "filing_date": extra.get("filing_date"), "extraction_status": extra.get("extraction_status"),
        "sanity_status": extra.get("sanity_status"),
    })


def snap_candidate(entity, metric, period, raw_value, transform, unit, prov, status="available"):
    """Existing-snapshot candidate (rank 3), normalized via TRANSFORMS."""
    if raw_value is None:
        return
    fn, label = TRANSFORMS[transform]
    add_candidate(entity, metric, period, raw_value, fn(raw_value), label, unit, prov,
                  RANK_EXISTING, "official_snapshot", status)


def load(name):
    p = SNAP / f"{name}.json"
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("data", [])


ANNUAL_MAP = [
    ("gross_direct_premium", "total_gwp", "identity", "INR_cr"),
    ("nwp", "nwp", "identity", "INR_cr"), ("nep", "nep", "identity", "INR_cr"),
    ("pat", "pat_igaap", "identity", "INR_cr"),
    ("combined_ratio", "combined_ratio_igaap", "pct_to_fraction", "ratio"),
    ("claims_ratio", "claims_ratio_igaap", "pct_to_fraction", "ratio"),
    ("expense_ratio", "expense_ratio_igaap", "pct_to_fraction", "ratio"),
    ("solvency_ratio", "solvency_ratio", "identity", "ratio"),
]
QUARTERLY_MAP = [
    ("gwp", "total_gwp", "identity", "INR_cr"),
    ("nwp", "nwp", "identity", "INR_cr"), ("nep", "nep", "identity", "INR_cr"),
    ("pat", "pat_igaap", "identity", "INR_cr"),
    ("combined_ratio", "combined_ratio_igaap", "pct_to_fraction", "ratio"),
    ("claims_ratio", "claims_ratio_igaap", "pct_to_fraction", "ratio"),
    ("expense_ratio", "expense_ratio_igaap", "pct_to_fraction", "ratio"),
    ("solvency_ratio", "solvency_ratio", "identity", "ratio"),
]
INDUSTRY_MAP = [
    ("health_premium", "Health Insurance", "gi_segment_gross_premium"),
    ("motor_premium", "Motor Insurance", "gi_segment_gross_premium"),
    ("total_gi_premium", "Total", "gi_segment_gross_premium"),
]
CHANNEL_MAP = [
    ("banca_share", "channel_gwp_mix::Banca"), ("broker_share", "channel_gwp_mix::Brokers"),
    ("agent_share", "channel_gwp_mix::Individual agents"),
    ("corporate_agent_share", "channel_gwp_mix::Corporate Agents - Others"),
    ("direct_share", "channel_gwp_mix::Direct Business"), ("others_share", "channel_gwp_mix::Others"),
]
# Company-filings ratio metric -> schema target (statutory IGAAP). Premiums/PAT
# intentionally excluded here (definition/basis ambiguity).
CF_RATIO_MAP = {
    "combined_ratio": "combined_ratio_igaap", "claims_ratio": "claims_ratio_igaap",
    "expense_ratio": "expense_ratio_igaap", "commission_ratio": "commission_ratio_igaap",
    "solvency_ratio": "solvency_ratio",
}


def collect_existing():
    for r in load("insurer-annual-snapshot"):
        prov, period = r.get("provenance", {}), r.get("fiscal_year")
        if not period:
            continue
        for field, metric, tf, unit in ANNUAL_MAP:
            snap_candidate(r["company_id"], metric, period, r.get(field), tf, unit, prov)
    for r in load("sahi-peer-comparison"):
        prov, period = r.get("provenance", {}), r.get("fiscal_year")
        if not period:
            continue
        snap_candidate(r["company_id"], "overall_health_market_share", period,
                       r.get("health_market_share"), "pct_to_fraction", "ratio", prov)
        snap_candidate(r["company_id"], "retail_health_market_share", period,
                       r.get("retail_health_market_share"), "pct_to_fraction", "ratio", prov)
    for r in load("insurer-quarterly-financials"):
        prov, q, fy = r.get("provenance", {}), r.get("quarter"), r.get("fiscal_year")
        if not (q and fy):
            continue
        period = f"{q}{fy}"
        for field, metric, tf, unit in QUARTERLY_MAP:
            snap_candidate(r["company_id"], metric, period, r.get(field), tf, unit, prov)
    for r in load("industry-segment-premium"):
        prov, period = r.get("provenance", {}), (r.get("fiscal_year") or r.get("period"))
        if not period:
            continue
        for field, entity, metric in INDUSTRY_MAP:
            snap_candidate(entity, metric, period, r.get(field), "identity", "INR_cr", prov)
    for r in load("price-history-snapshot"):
        prov, date = r.get("provenance", {}), r.get("date")
        if not date:
            continue
        snap_candidate(r["company_id"], "close_price", date, r.get("close"), "identity", "INR", prov)
        snap_candidate(r["company_id"], "traded_quantity", date, r.get("traded_qty"), "identity", "shares", prov)
        snap_candidate(r["company_id"], "deliverable_quantity", date, r.get("deliverable_qty"), "identity", "shares", prov)
    latest = {}
    for r in load("valuation-snapshot"):
        cid, d = r.get("company_id"), r.get("date", "")
        if cid and (cid not in latest or d > latest[cid].get("date", "")):
            latest[cid] = r
    for cid, r in latest.items():
        prov = r.get("provenance", {})
        snap_candidate(cid, "market_cap", "as_on_run_date", r.get("market_cap"), "identity", "INR_cr", prov)
        snap_candidate(cid, "enterprise_value", "as_on_run_date", r.get("enterprise_value"), "identity", "INR_cr", prov)
    for r in load("distribution-channel-mix"):
        prov, period = r.get("provenance", {}), (r.get("fiscal_year") or r.get("period"))
        if not period:
            continue
        for field, metric in CHANNEL_MAP:
            snap_candidate(r["company_id"], metric, period, r.get(field), "pct_to_fraction", "ratio", prov, status="partial")


def collect_company_filings():
    """Wire ONLY eligible statutory ratios from public disclosures (rank 1).
    Other eligible-but-extracted values are HELD (basis/scope unclear), not wired,
    and returned for the Blocked Data report - they are NOT parser failures."""
    wired = 0
    held: list[dict] = []
    for r in load("company-filings-snapshot"):
        if not r.get("eligible_for_excel") or r.get("normalized_value") is None:
            continue
        metric = r.get("metric")
        # Wire: statutory ratios from public disclosures only (basis is unambiguous).
        if r.get("document_type") == "public_disclosure" and metric in CF_RATIO_MAP:
            period = r.get("filing_period") or ""
            # Full-year flow ratios live in the YTD column (not this path's first
            # column) -> hold for the Chunk 2C column-aware parser; the annual
            # snapshot supplies the full-year cell in the meantime.
            if metric in FLOW_RATIOS and not QUARTER_RE.match(period):
                held.append({
                    "company_id": r["company_id"], "metric": metric, "raw_value": r.get("raw_value"),
                    "normalized_value": r.get("normalized_value"), "unit": r.get("unit"),
                    "filing_period": period, "document_type": r.get("document_type"),
                    "document_title": r.get("document_title"), "filing_date": r.get("filing_date"),
                    "source_url": r.get("source_url"), "source_file": r.get("source_file"),
                    "confidence": r.get("provenance", {}).get("confidence"),
                    "hold_reason": "period_unclear", "source_description": r.get("source_description"),
                    "note": "full-year NL-form: statutory full-year flow ratio is the YTD column; "
                            "standalone-column value withheld; annual snapshot supplies the cell; "
                            "column-aware selection deferred to Chunk 2C",
                })
                continue
            p = r.get("provenance", {})
            prov = {"source_name": p.get("source_name") or r.get("source_description"),
                    "source_url": r.get("source_url"), "source_file": r.get("source_file"),
                    "fetched_at": p.get("parsed_at"), "confidence": p.get("confidence", "high")}
            extra = {"document_type": r.get("document_type"), "document_title": r.get("document_title"),
                     "filing_date": r.get("filing_date"), "extraction_status": r.get("extraction_status"),
                     "sanity_status": r.get("sanity_status")}
            add_candidate(r["company_id"], CF_RATIO_MAP[metric], r.get("filing_period"), r.get("raw_value"),
                          r.get("normalized_value"), r.get("transformation_used"), r.get("unit"),
                          prov, RANK_CF_DISCLOSURE, "company_filing", "available", extra)
            wired += 1
            continue
        # Hold: well-extracted but basis/scope cannot be matched to the Excel cell.
        reason = "scope_unclear" if metric in ("gwp", "nwp", "nep") else "basis_unclear"
        held.append({
            "company_id": r["company_id"], "metric": metric, "raw_value": r.get("raw_value"),
            "normalized_value": r.get("normalized_value"), "unit": r.get("unit"),
            "filing_period": r.get("filing_period"), "document_type": r.get("document_type"),
            "document_title": r.get("document_title"), "filing_date": r.get("filing_date"),
            "source_url": r.get("source_url"), "source_file": r.get("source_file"),
            "confidence": r.get("provenance", {}).get("confidence"),
            "hold_reason": reason, "source_description": r.get("source_description"),
            "note": ("annual-report / non-statutory basis may differ from the statutory IGAAP cell"
                     if reason == "basis_unclear"
                     else "company-wide vs health-only / GDPI vs total GWP scope not confirmed for the cell"),
        })
    return wired, held


def resolve():
    store = {}
    conflicts = 0
    for key, cands in CANDIDATES.items():
        cands.sort(key=lambda c: (c["priority_rank"], CONF_ORDER.get(c["confidence"], 4)))
        winner = cands[0]
        conflict_status, competing = "none", []
        for c in cands[1:]:
            if c["priority_rank"] <= RANK_EXISTING and c["normalized_value"] is not None and winner["normalized_value"] is not None:
                a, b = winner["normalized_value"], c["normalized_value"]
                denom = max(abs(a), abs(b)) or 1.0
                if abs(a - b) / denom > 0.01:
                    conflict_status = "conflict_needs_review"
                    competing.append({"normalized_value": b, "source_layer": c["source_layer"],
                                      "source_name": c["source_name"], "priority_rank": c["priority_rank"]})
        if conflict_status == "conflict_needs_review":
            conflicts += 1
        store[key] = {
            **{k: winner[k] for k in (
                "entity", "metric", "period", "unit", "raw_value", "normalized_value",
                "transformation_used", "source_name", "source_url", "source_file", "fetched_at",
                "confidence", "source_status", "source_layer", "priority_rank",
                "document_type", "document_title", "filing_date", "extraction_status", "sanity_status")},
            "eligible_for_excel": True,
            "conflict_status": conflict_status,
            "competing_values": competing,
        }
    return store, conflicts


def main():
    collect_existing()
    wired, held = collect_company_filings()
    store, conflicts = resolve()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(store, indent=2, ensure_ascii=False))
    OUT_HELD.write_text(json.dumps({
        "_meta": {
            "id": "excel-held-back",
            "description": "Company-filings values that were well-extracted (eligible) but NOT wired to Excel because the metric basis/scope cannot be unambiguously matched to the cell. These are NOT parser failures - they keep full source proof and appear on the Blocked Data sheet.",
            "reasons": {"basis_unclear": "non-statutory / adjusted basis vs the statutory IGAAP cell",
                        "scope_unclear": "company-wide vs health-only / GDPI vs total GWP"},
        },
        "data": held,
    }, indent=2, ensure_ascii=False))
    from collections import Counter
    by_layer = Counter(v["source_layer"] for v in store.values())
    print(f"excel-values.json written -> {OUT}")
    print(f"  {len(store)} resolved values  |  company-filing-sourced: {by_layer.get('company_filing', 0)}"
          f"  |  conflicts flagged: {conflicts}  |  CF ratio candidates wired: {wired}  |  held-back: {len(held)}")
    by_metric = Counter(v["metric"].split("::")[0] for v in store.values())
    for metric, n in by_metric.most_common():
        print(f"    {metric:<32} {n}")


if __name__ == "__main__":
    main()
