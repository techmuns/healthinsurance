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
  2  curated source-map: annual_report (hand-transcribed statutory) + company_deck (IFRS)
  3  existing official snapshots (insurer annual/quarterly, peer, industry, channel,
     price, valuation - produced by the TS pipeline)
  9  Screener fallback (Neha, 2026-06-08): a clearly-labelled, LOWEST-rank fallback,
     used ONLY after official fetch/staging fails and ONLY for metrics Screener
     DIRECTLY provides (pe_ttm / price_to_book / roe - none statutory). Tagged
     source_layer=screener_fallback + basis_note "pending official filing
     verification"; an official value (rank 1-3) always supersedes it, never silently
     mixed. It cannot fill a statutory cell (Screener has no statutory metric).
     Trendlyne / broker remain non-statutory analyst-only and are not wired here.

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

# A standalone-quarter period (e.g. "Q1FY25"). In a statutory NL-form the
# "For the Quarter ended" column is the standalone quarter, matching such a cell.
QUARTER_RE = re.compile(r"^Q[1-4]FY\d{2}$")
# Flow ratios accumulate over the year: on a full-year/Q4 NL-form the full-year
# figure is the YTD ("Upto the Quarter ended 31 March") column, NOT the
# standalone-quarter column. The Chunk 2C-A column-aware NL-20 parser tags every
# value with the column it came from (column_basis), so a full-year flow ratio is
# wired ONLY when it is column-verified as "year_to_date". Any other full-year
# flow ratio is still HELD - we never promote a standalone-quarter value into a
# full-year cell. Point-in-time solvency reads identically in the standalone and
# YTD columns, so it is safe at any period.
FLOW_RATIOS = {"combined_ratio", "claims_ratio", "expense_ratio", "commission_ratio"}
YTD_BASIS = "year_to_date"
STANDALONE_BASIS = "standalone_quarter"

# Durable basis rule (Neha, 2026-06-05): insurance ratios can be reported on the
# statutory IRDAI 1/n basis OR a company-adjusted ex-1/n basis. When both exist,
# the Excel cell ALWAYS uses the statutory 1/n value; the differing adjusted value
# is kept on Blocked Data as an alternate basis (basis_mismatch_ex_1n_adjusted),
# never a blocking conflict. If a source's basis is unclear, do not auto-fill.
PREFERRED_RATIO_BASIS = "statutory_1n"
# Ratios subject to the 1/n vs ex-1/n basis distinction. IRDAI NL-20 public
# disclosures are the statutory 1/n source.
RATIO_BASIS_METRICS = {"combined_ratio_igaap", "claims_ratio_igaap",
                       "expense_ratio_igaap", "commission_ratio_igaap"}
# Durable decision (Neha, 2026-06-08): for statutory premium AMOUNTS, the rank-1
# company-filing value (the most recent statutory NL-1 figure, including a restated
# prior-year comparative) supersedes a differing lower-priority snapshot value. The
# superseded figure is recorded as an alternate (as-originally-reported), NOT a
# blocking conflict - so e.g. Niva FY23 NEP fills with the restated 2,662.75 while
# the as-first-reported 2,841 is kept on Blocked Data.
PREMIUM_STATUTORY_SUPERSEDE = {"nep"}
# Statutory metrics where an audited ANNUAL-REPORT value (rank 2) supersedes a
# differing lower-priority snapshot / non-statutory value, recording the old value
# as an alternate (superseded_by_annual_report), not a blocking conflict. Scoped to
# the annual_report layer only, so company_filing (Niva/Care) behaviour is unchanged.
AR_STATUTORY_SUPERSEDE = {"total_gwp", "nwp", "nep", "pat_igaap", "claims_ratio_igaap",
                         "combined_ratio_igaap", "expense_ratio_igaap", "solvency_ratio"}

REPO = Path(__file__).resolve().parents[2]
SNAP = REPO / "src" / "data" / "snapshots"
OUT = REPO / "data" / "processed" / "excel-values.json"
OUT_HELD = REPO / "data" / "processed" / "excel-held-back.json"
DECK = REPO / "data" / "source-map" / "deck-sourced-values.json"
ANNUAL_REPORT = REPO / "data" / "source-map" / "annual-report-values.json"
SCREENER = SNAP / "screener-crosscheck-snapshot.json"
SHAREHOLDING = SNAP / "shareholding-pattern-snapshot.json"

CONF_ORDER = {"high": 0, "medium": 1, "low": 2, "pending": 3, None: 4}
RANK_CF_DISCLOSURE = 1
RANK_SHAREHOLDING = 1  # official exchange shareholding-pattern filing (Reg. 31 LODR)
RANK_DECK = 2
RANK_AR = 2
RANK_EXISTING = 3
RANK_SEED = 8  # Neha's workbook history seed — every official source supersedes it
RANK_BACKUP = 9

# Screener fallback (Neha, 2026-06-08): map a Screener metric -> schema metric ONLY
# when Screener directly provides it AND it maps cleanly to a cell. Screener's
# adapter yields pe_ttm / price_to_book / roe (valuation); none are statutory, and
# none map cleanly to a current cell (pe_ttm != pe_3yr_avg; no P/B or ROE cells), so
# this map is intentionally EMPTY today -> Screener wires nothing. The labelled,
# lowest-rank, supersedable mechanism is in place for when a provided metric both
# has data and maps to a cell. Statutory metrics are never added here.
SCREENER_MAP: dict[str, str] = {}


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
        "sanity_status": extra.get("sanity_status"), "column_basis": extra.get("column_basis"),
        "ratio_basis": extra.get("ratio_basis"), "basis_note": extra.get("basis_note"),
    })


def snap_candidate(entity, metric, period, raw_value, transform, unit, prov, status="available"):
    """Existing-snapshot candidate (rank 3), normalized via TRANSFORMS."""
    if raw_value is None:
        return
    fn, label = TRANSFORMS[transform]
    add_candidate(entity, metric, period, raw_value, fn(raw_value), label, unit, prov,
                  RANK_EXISTING, "official_snapshot", status)


# Curated audit-overlay metrics that the overlay carries as PERCENTAGES (e.g.
# 70.3, 101.2) but the store keeps as fractions (0.703, 1.012). Everything else
# (premium/PAT/net-worth amounts, and solvency which is a multiple) is used as-is.
OVERLAY = SNAP / "audit-overlay.json"
OVERLAY_PCT_METRICS = {
    "combined_ratio_igaap", "claims_ratio_igaap", "expense_ratio_igaap", "commission_ratio_igaap",
    "combined_ratio_ifrs", "claims_ratio_ifrs", "expense_ratio_ifrs", "commission_ratio_ifrs",
    "settlement_ratio", "customer_retention", "renewal_rate", "persistency_ratio",
    "retail_health_market_share", "sahi_segment_share", "overall_health_market_share", "health_market_share",
    "investment_yield",
}
RANK_OVERLAY = 0  # curated overlay — highest priority

# Our curated values sometimes carry a different metric name than the Excel
# template's cell. Project a curated value into the template metric(s) too so no
# verified figure is left unmapped. Our net-worth values are the statutory IGAAP
# net worth (Share Capital + Reserves − accumulated deficit), so they fill the
# template's generic `net_worth` and `net_worth_igaap` rows as well.
OVERLAY_METRIC_ALIAS = {
    "net_worth_ifrs": ["net_worth", "net_worth_igaap"],
}


def collect_overlay():
    """Curated values staged in src/data/snapshots/audit-overlay.json — the same
    layer the Audit grid reads. GAP-FILL ONLY: a curated value is added only where
    no extracted candidate already exists for that cell, so it lifts store coverage
    (and the Extracted-Data-Audit '% of template') without ever conflicting with an
    extracted figure. Value-less tag entries (display_tag only) are skipped."""
    try:
        data = json.loads(OVERLAY.read_text()).get("data", {})
    except Exception:
        return
    for key, e in data.items():
        if not isinstance(e, dict) or e.get("value") is None:
            continue
        parts = key.split("::")
        if len(parts) != 3:
            continue
        entity, metric, period = parts
        val = e["value"]
        is_pct = metric in OVERLAY_PCT_METRICS
        norm = pct_to_fraction(val) if is_pct else val
        label = "percent -> fraction (value / 100)" if is_pct else "identity (value used as-is)"
        unit = "ratio" if is_pct else ("x" if metric == "solvency_ratio" else "INR_cr")
        prov = {
            "source_name": e.get("source_name"), "source_url": e.get("source_url"),
            "source_file": e.get("source_file"), "fetched_at": e.get("fetched_at"),
            "confidence": e.get("confidence") or "high",
        }
        # Fill the overlay metric AND any template-metric aliases. Gap-fill each
        # target: never override an extracted value already in the store.
        for target in [metric] + OVERLAY_METRIC_ALIAS.get(metric, []):
            if f"{entity}::{target}::{period}" in CANDIDATES:
                continue
            add_candidate(entity, target, period, val, norm, label, unit, prov,
                          RANK_OVERLAY, "curated_overlay", e.get("source_status", "available"),
                          {"basis_note": e.get("note")})


def collect_shareholding():
    """Per-holder shareholding share counts from the quarterly exchange
    shareholding-pattern filing (src/data/snapshots/shareholding-pattern-snapshot.json).
    Fills the Captable tab's `shareholding_shares::<holder>` cells (unit 'shares',
    rank-1 official filing). Integer counts; missing stays missing — a holder is
    wired only when the snapshot carries a real sourced count.

    NOTE on the source: the named per-holder list is NOT on Screener's public page
    (login-only there), so the authoritative source is the company's exchange
    shareholding-pattern filing — the same document Screener itself copies from. The
    automated fetcher (scripts/ingest/fetch-shareholding.ts) refreshes the snapshot
    each quarter under a strict sum-ties-to-total gate, so a wrong number can never
    land here."""
    try:
        snap = json.loads(SHAREHOLDING.read_text())
    except Exception:
        return
    for r in snap.get("data", []):
        if not isinstance(r, dict):
            continue
        entity, holder, period, shares = (
            r.get("company_id"), r.get("holder"), r.get("period"), r.get("shares"),
        )
        if not (entity and holder and period) or shares is None:
            continue
        prov = r.get("provenance", {}) or {}
        add_candidate(
            entity, f"shareholding_shares::{holder}", period,
            shares, shares, "identity (value used as-is)", "shares", prov,
            RANK_SHAREHOLDING, "official_filing", prov.get("source_status", "available"),
            {"filing_date": r.get("filing_date") or period,
             "document_type": "shareholding_pattern",
             "document_title": prov.get("source_name"),
             "basis_note": prov.get("note")},
        )


def load(name):
    p = SNAP / f"{name}.json"
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("data", [])


# Industry Growth history seed (Neha's workbook, 2026-06-10): rank 8, so any
# official value silently supersedes it and a seed can never raise a conflict
# (the conflict check only considers rank ≤ 3 candidates). Built by
# scripts/excel/build_industry_growth_seed.py from the committed workbook.
SEED_FILE = REPO / "data" / "source-map" / "industry-growth-seed.json"


def collect_workbook_seed():
    try:
        values = json.loads(SEED_FILE.read_text()).get("values", {})
    except Exception:
        return
    for key, e in values.items():
        if not isinstance(e, dict) or e.get("value") is None:
            continue
        entity, metric, period = key.split("::")
        prov = {
            "source_name": e.get("source_name"), "source_url": e.get("source_url"),
            "source_file": e.get("source_file"), "fetched_at": None,
            "confidence": "medium",
        }
        add_candidate(entity, metric, period, e["value"], e["value"],
                      "identity (value used as-is)", e.get("unit") or "INR_cr", prov,
                      RANK_SEED, "user_workbook_seed", "seed",
                      {"basis_note": e.get("note")})


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
    ("other_premium", "Others", "gi_segment_gross_premium"),
    ("total_gi_premium", "Total", "gi_segment_gross_premium"),
]
# GI Council health-portfolio snapshot (gic-health-portfolio.json) -> the
# Industry Growth sheet's carrier-type and per-insurer health rows. Aggregate
# entities map to the template's carrier rows; insurer rows are gated by the
# carrier_group the GIC report printed them under, so the SAHI-era HDFC Ergo
# Health (Apollo Munich) feeds the SAHI section while HDFC Ergo General feeds
# the retail-by-insurer section.
GIC_CARRIER_ENTITY = {"SAHI": "SAHI", "Private": "Private", "PSUs": "PSUs", "INDUSTRY": "Total"}
GIC_RETAIL_INSURER_IDS = {
    "star-health", "care-health", "niva-bupa", "hdfc-ergo", "new-india",
    "national-insurance", "icici-lombard", "aditya-birla", "oriental-insurance",
    "united-india", "manipalcigna",
}
# The "FY26 GWP" tab's per-insurer rows (total_health_gwp / retail_health_gwp,
# periods H1FYxx / 9MFYxx from gic-health-quarterly, FYxx from the annual
# gic-health-portfolio). The tab's Total row entity is the template's label.
GIC_GWP_TAB_IDS = GIC_RETAIL_INSURER_IDS | {
    "galaxy-health", "narayana-health", "bajaj-general", "reliance-general", "sbi-general",
}
GIC_GWP_TOTAL_ENTITY = "Total Health GWP (INR cr)"


def gic_gwp_candidates(r, period, ent, grp, prov):
    """Project one GIC health row onto the FY26 GWP tab's two metrics."""
    if grp in ("sahi", "general") and ent in GIC_GWP_TAB_IDS:
        snap_candidate(ent, "total_health_gwp", period, r.get("health_total"), "identity", "INR_cr", prov)
        snap_candidate(ent, "retail_health_gwp", period, r.get("health_retail"), "identity", "INR_cr", prov)
    if grp == "aggregate" and ent == "INDUSTRY":
        snap_candidate(GIC_GWP_TOTAL_ENTITY, "total_health_gwp", period, r.get("health_total"), "identity", "INR_cr", prov)
        snap_candidate(GIC_GWP_TOTAL_ENTITY, "retail_health_gwp", period, r.get("health_retail"), "identity", "INR_cr", prov)
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
# Company-filings premium AMOUNT -> schema target, wired from the statutory NL-1
# revenue account (public disclosure only). Per Neha (2026-06-08): Net Earned
# Premium is filled from the statutory filing (cross-validated to the rupee).
# GWP/NWP are deliberately NOT wired from company filings here - the annual
# snapshot already supplies GWP on the direct-premium (GDPI) basis, and the only
# company-filing GWP figure is the ex-1/n headline (held; not comparable to the
# statutory cell). Premium is a premium measure, never a profit measure.
CF_PREMIUM_MAP = {"nep": "nep"}


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
        # overall_health_market_share is NOT wired from sahi-peer-comparison: that
        # field is a back-of-envelope estimate (company premium / industry segment
        # premium) carrying a provenance mis-cited to a retail-only press release.
        # The real overall-health share comes from the GI Council segment-wise
        # report (staged in audit-overlay.json) — see Neha, 2026-06-10. Leaving it
        # out here keeps the regenerated store from re-introducing the bad estimate.
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
        # ANNUAL rows only: the snapshot also carries monthly flow rows (period
        # "2026-01" + a fiscal_year tag) whose single-month values must never
        # masquerade as a fiscal-year figure.
        if r.get("period_type") not in (None, "annual"):
            continue
        prov, period = r.get("provenance", {}), (r.get("fiscal_year") or r.get("period"))
        if not period or not str(period).startswith("FY"):
            continue
        for field, entity, metric in INDUSTRY_MAP:
            snap_candidate(entity, metric, period, r.get(field), "identity", "INR_cr", prov)
    for r in load("gic-health-quarterly"):
        period, ent, grp = r.get("period"), r.get("entity"), r.get("carrier_group")
        if not period or not ent:
            continue
        prov = dict(r.get("provenance", {}))
        basis = r.get("basis")
        if basis and str(basis).startswith("derived"):
            prov["source_name"] = f"{prov.get('source_name')} · {basis}"
        gic_gwp_candidates(r, period, ent, grp, prov)
    for r in load("gic-health-portfolio"):
        period, ent, grp = r.get("fiscal_year"), r.get("entity"), r.get("carrier_group")
        if not period or not ent:
            continue
        prov = dict(r.get("provenance", {}))
        basis = r.get("basis")
        if basis and str(basis).startswith("derived"):
            # Surface the arithmetic (e.g. "Private = General sub-total − PSUs")
            # right on the source label so the audit cell explains itself.
            prov["source_name"] = f"{prov.get('source_name')} · {basis}"
        gic_gwp_candidates(r, period, ent, grp, prov)  # the FY columns of the GWP tab
        if grp == "aggregate":
            if ent in GIC_CARRIER_ENTITY:
                snap_candidate(GIC_CARRIER_ENTITY[ent], "health_premium_by_carrier_type", period,
                               r.get("health_total"), "identity", "INR_cr", prov)
            if ent == "SAHI":  # the SAHI sections' printed Total rows
                snap_candidate("Total", "sahi_total_health_premium", period,
                               r.get("health_total"), "identity", "INR_cr", prov)
                snap_candidate("Total", "sahi_retail_health_premium", period,
                               r.get("health_retail"), "identity", "INR_cr", prov)
            if ent == "INDUSTRY":
                snap_candidate("Total", "retail_health_premium", period,
                               r.get("health_retail"), "identity", "INR_cr", prov)
            if ent == "Others":
                snap_candidate("Others", "retail_health_premium", period,
                               r.get("health_retail"), "identity", "INR_cr", prov)
            continue
        if grp == "sahi":
            snap_candidate(ent, "sahi_total_health_premium", period,
                           r.get("health_total"), "identity", "INR_cr", prov)
            snap_candidate(ent, "sahi_retail_health_premium", period,
                           r.get("health_retail"), "identity", "INR_cr", prov)
        if ent in GIC_RETAIL_INSURER_IDS:
            snap_candidate(ent, "retail_health_premium", period,
                           r.get("health_retail"), "identity", "INR_cr", prov)
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
            column_basis = r.get("column_basis")
            # Full-year flow ratios live in the YTD ("Upto the Quarter ended")
            # column. Wire one ONLY when the column-aware parser confirms it came
            # from that column (column_basis == "year_to_date"). Otherwise it
            # could be a standalone-quarter value mislabelled as the full year ->
            # hold it (never promote a quarter value into a full-year cell).
            if metric in FLOW_RATIOS and not QUARTER_RE.match(period) and column_basis != YTD_BASIS:
                held.append({
                    "company_id": r["company_id"], "metric": metric, "raw_value": r.get("raw_value"),
                    "normalized_value": r.get("normalized_value"), "unit": r.get("unit"),
                    "filing_period": period, "document_type": r.get("document_type"),
                    "document_title": r.get("document_title"), "filing_date": r.get("filing_date"),
                    "source_url": r.get("source_url"), "source_file": r.get("source_file"),
                    "confidence": r.get("provenance", {}).get("confidence"),
                    "hold_reason": "period_unclear", "source_description": r.get("source_description"),
                    "note": "full-year flow ratio not column-verified as the YTD column; "
                            "standalone-column value withheld so it is not promoted to a full-year cell",
                })
                continue
            p = r.get("provenance", {})
            prov = {"source_name": p.get("source_name") or r.get("source_description"),
                    "source_url": r.get("source_url"), "source_file": r.get("source_file"),
                    "fetched_at": p.get("parsed_at"), "confidence": p.get("confidence", "high")}
            # IRDAI NL-20 public-disclosure ratios are the statutory 1/n basis.
            extra = {"document_type": r.get("document_type"), "document_title": r.get("document_title"),
                     "filing_date": r.get("filing_date"), "extraction_status": r.get("extraction_status"),
                     "sanity_status": r.get("sanity_status"), "column_basis": column_basis,
                     "ratio_basis": PREFERRED_RATIO_BASIS if CF_RATIO_MAP[metric] in RATIO_BASIS_METRICS else None}
            add_candidate(r["company_id"], CF_RATIO_MAP[metric], r.get("filing_period"), r.get("raw_value"),
                          r.get("normalized_value"), r.get("transformation_used"), r.get("unit"),
                          prov, RANK_CF_DISCLOSURE, "company_filing", "available", extra)
            wired += 1
            continue
        # Wire: statutory premium AMOUNTS from public disclosures (NL-1 revenue
        # account). These are FLOW amounts that accumulate over the year, so the
        # column rule applies exactly as for flow ratios: a full-period cell
        # (FY/H1/9M) takes the YTD ("Upto the Quarter ended") column, a quarter
        # cell takes the standalone-quarter column. A value whose column does not
        # match its period is HELD (period_unclear) so a quarter value is never
        # promoted into a full-period cell, or vice-versa.
        if r.get("document_type") == "public_disclosure" and metric in CF_PREMIUM_MAP:
            period = r.get("filing_period") or ""
            column_basis = r.get("column_basis")
            want_col = STANDALONE_BASIS if QUARTER_RE.match(period) else YTD_BASIS
            if column_basis != want_col:
                held.append({
                    "company_id": r["company_id"], "metric": metric, "raw_value": r.get("raw_value"),
                    "normalized_value": r.get("normalized_value"), "unit": r.get("unit"),
                    "filing_period": period, "document_type": r.get("document_type"),
                    "document_title": r.get("document_title"), "filing_date": r.get("filing_date"),
                    "source_url": r.get("source_url"), "source_file": r.get("source_file"),
                    "confidence": r.get("provenance", {}).get("confidence"),
                    "hold_reason": "period_unclear", "source_description": r.get("source_description"),
                    "note": f"{metric} column basis ({column_basis}) does not match the {period} cell "
                            f"(expected {want_col}); withheld so a quarter value is not promoted to a "
                            "full-period cell or vice-versa",
                })
                continue
            p = r.get("provenance", {})
            prov = {"source_name": p.get("source_name") or r.get("source_description"),
                    "source_url": r.get("source_url"), "source_file": r.get("source_file"),
                    "fetched_at": p.get("parsed_at"), "confidence": p.get("confidence", "high")}
            extra = {"document_type": r.get("document_type"), "document_title": r.get("document_title"),
                     "filing_date": r.get("filing_date"), "extraction_status": r.get("extraction_status"),
                     "sanity_status": r.get("sanity_status"), "column_basis": column_basis,
                     "ratio_basis": None}
            add_candidate(r["company_id"], CF_PREMIUM_MAP[metric], period, r.get("raw_value"),
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


def collect_deck_sourced():
    """Values transcribed by hand from official company investor decks, with
    page-level provenance (data/source-map/deck-sourced-values.json). Wired per
    Neha's 2026-06-08 decision to use deck figures for the IFRS cells - this
    OVERRIDES the default 'no PPT values' rule for IFRS metrics only.

    IFRS here is the company's SPECIAL-PURPOSE IFRS statement (audited annually,
    not the statutory IRDAI/IGAAP filing); the basis caveat is carried on the
    source name so every audit row states it plainly. Rank 2: below the statutory
    filing, above generic snapshots - though IFRS cells have no other source."""
    n = 0
    if not DECK.exists():
        return n
    for r in json.loads(DECK.read_text()).get("data", []):
        if r.get("raw_value") is None:
            continue
        fn, label = TRANSFORMS[r.get("transform", "identity")]
        caveat = ("IFRS special-purpose financials (company investor deck; audited annually, "
                  "NOT the statutory IRDAI/IGAAP filing)")
        src = f"{r.get('source_title')} p.{r.get('source_page')} - {caveat}"
        prov = {"source_name": src, "source_url": r.get("source_url"),
                "source_file": r.get("source_file"), "fetched_at": r.get("as_of"),
                "confidence": r.get("confidence", "high")}
        extra = {"document_type": "investor_presentation", "document_title": r.get("source_title"),
                 "filing_date": r.get("as_of"), "extraction_status": "deck_transcribed",
                 "sanity_status": "ok", "column_basis": None, "ratio_basis": None}
        add_candidate(r["company_id"], r["metric"], r["period"], r.get("raw_value"),
                      fn(r["raw_value"]), label, r.get("unit"), prov,
                      RANK_DECK, "company_deck", "deck", extra)
        n += 1
    return n


def collect_annual_report():
    """Statutory IGAAP values hand-transcribed from official ANNUAL REPORTS, with
    page-level provenance (data/source-map/annual-report-values.json). Read directly
    from the cited PDF pages because the generic NL-form parser mangles annual-report
    layouts (fused columns). These are the audited financial statements - the
    authoritative statutory source. Rank 2: below an NL-form public disclosure, above
    generic snapshots. A rank-2 annual_report value supersedes a differing lower-
    priority value for statutory metrics (see resolve / AR_STATUTORY_SUPERSEDE)."""
    n = 0
    if not ANNUAL_REPORT.exists():
        return n
    for r in json.loads(ANNUAL_REPORT.read_text()).get("data", []):
        if r.get("raw_value") is None:
            continue
        fn, label = TRANSFORMS[r.get("transform", "identity")]
        src = f"{r.get('source_title')} p.{r.get('source_page')} - {r.get('exact_label')} [statutory IGAAP]"
        prov = {"source_name": src, "source_url": r.get("source_url"),
                "source_file": r.get("source_file"), "fetched_at": None,
                "confidence": r.get("confidence", "high")}
        extra = {"document_type": "annual_report", "document_title": r.get("source_title"),
                 "filing_date": None, "extraction_status": "annual_report_transcribed",
                 "sanity_status": "ok", "column_basis": None, "ratio_basis": None,
                 "basis_note": r.get("basis_note")}
        add_candidate(r["company_id"], r["metric"], r["period"], r.get("raw_value"),
                      fn(r["raw_value"]), label, r.get("unit"), prov,
                      RANK_AR, "annual_report", "available", extra)
        n += 1
    return n


def collect_screener():
    """Screener.in cross-check as a clearly-labelled, LOWEST-rank fallback (rank 9).
    Reads screener-crosscheck-snapshot.json and wires ONLY metrics in SCREENER_MAP
    (those Screener directly provides AND that map to a cell). Each value is tagged
    source_layer=screener_fallback, source_status=backup, low confidence, and a
    basis_note 'Screener fallback - pending official filing verification'. Any
    official value (rank 1-3) supersedes it and it is never silently mixed; it can
    never fill a statutory cell (Screener has no statutory metric)."""
    n = 0
    if not SCREENER.exists() or not SCREENER_MAP:
        return n
    for r in json.loads(SCREENER.read_text()).get("data", []) or []:
        target = SCREENER_MAP.get(r.get("metric"))
        if not target or r.get("value") is None:
            continue
        p = r.get("provenance", {}) or {}
        prov = {"source_name": f"Screener.in cross-check ({r.get('metric')}) - fallback, pending official verification",
                "source_url": p.get("source_url"), "source_file": None,
                "fetched_at": p.get("fetched_at"), "confidence": "low"}
        extra = {"document_type": "screener_fallback", "document_title": "Screener.in (backup aggregator)",
                 "filing_date": p.get("fetched_at"), "extraction_status": "screener_crosscheck",
                 "sanity_status": "ok", "column_basis": None, "ratio_basis": None,
                 "basis_note": "Screener fallback - pending official filing verification"}
        add_candidate(r["company_id"], target, r.get("period") or "TTM", r.get("value"),
                      r.get("value"), "identity (Screener fallback)", r.get("unit") or "",
                      prov, RANK_BACKUP, "screener_fallback", "backup", extra)
        n += 1
    return n


def resolve():
    store = {}
    conflicts = 0
    alternates: list[dict] = []
    for key, cands in CANDIDATES.items():
        cands.sort(key=lambda c: (c["priority_rank"], CONF_ORDER.get(c["confidence"], 4)))
        winner = cands[0]
        # preferred_ratio_basis = statutory_1n: when the winner is a statutory 1/n
        # ratio, a differing lower-priority value is an alternate BASIS (ex-1/n /
        # adjusted), not a conflict - the statutory value still fills the cell.
        winner_statutory = winner["metric"] in RATIO_BASIS_METRICS and winner.get("ratio_basis") == PREFERRED_RATIO_BASIS
        # A rank-1 statutory premium amount supersedes a differing lower-priority
        # value as an alternate (as-originally-reported), not a blocking conflict.
        winner_premium_statutory = (winner.get("source_layer") == "company_filing"
                                    and winner["metric"] in PREMIUM_STATUTORY_SUPERSEDE)
        # An audited annual-report statutory value supersedes a differing lower-priority
        # snapshot / non-statutory value (scoped to the annual_report layer only).
        winner_ar_statutory = (winner.get("source_layer") == "annual_report"
                               and winner["metric"] in AR_STATUTORY_SUPERSEDE)
        conflict_status, competing = "none", []
        for c in cands[1:]:
            if c["priority_rank"] <= RANK_EXISTING and c["normalized_value"] is not None and winner["normalized_value"] is not None:
                a, b = winner["normalized_value"], c["normalized_value"]
                denom = max(abs(a), abs(b)) or 1.0
                if abs(a - b) / denom > 0.01:
                    if winner_statutory and c.get("ratio_basis") != PREFERRED_RATIO_BASIS:
                        alternates.append({
                            "company_id": winner["entity"], "metric": winner["metric"],
                            "filing_period": winner["period"], "raw_value": c.get("raw_value"),
                            "normalized_value": b, "unit": c.get("unit"),
                            "document_type": c.get("document_type"), "filing_date": c.get("filing_date"),
                            "source_url": c.get("source_url") or c.get("source_file"),
                            "confidence": c.get("confidence"), "hold_reason": "basis_mismatch_ex_1n_adjusted",
                            "source_description": c.get("source_name"),
                            "note": "Annual report adjusted ex-1/n ratio; not comparable to statutory 1/n cell",
                        })
                    elif winner_premium_statutory and c.get("source_layer") != "company_filing":
                        alternates.append({
                            "company_id": winner["entity"], "metric": winner["metric"],
                            "filing_period": winner["period"], "raw_value": c.get("raw_value"),
                            "normalized_value": b, "unit": c.get("unit"),
                            "document_type": c.get("document_type"), "filing_date": c.get("filing_date"),
                            "source_url": c.get("source_url") or c.get("source_file"),
                            "confidence": c.get("confidence"), "hold_reason": "superseded_by_statutory_filing",
                            "source_description": c.get("source_name"),
                            "note": "As-originally-reported figure superseded by the statutory NL-1 filing "
                                    "(restated comparative); the statutory value fills the cell",
                        })
                    elif winner_ar_statutory and c.get("source_layer") != "annual_report":
                        alternates.append({
                            "company_id": winner["entity"], "metric": winner["metric"],
                            "filing_period": winner["period"], "raw_value": c.get("raw_value"),
                            "normalized_value": b, "unit": c.get("unit"),
                            "document_type": c.get("document_type"), "filing_date": c.get("filing_date"),
                            "source_url": c.get("source_url") or c.get("source_file"),
                            "confidence": c.get("confidence"), "hold_reason": "superseded_by_annual_report",
                            "source_description": c.get("source_name"),
                            "note": "Lower-priority / non-statutory value superseded by the audited "
                                    "annual-report statutory IGAAP figure; the annual-report value fills the cell",
                        })
                    else:
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
                "document_type", "document_title", "filing_date", "extraction_status", "sanity_status",
                "column_basis")},
            "ratio_basis": winner.get("ratio_basis"),
            "basis_note": winner.get("basis_note"),
            "eligible_for_excel": True,
            "conflict_status": conflict_status,
            "competing_values": competing,
        }
    return store, conflicts, alternates


def main():
    collect_existing()
    collect_shareholding()  # rank-1 per-holder shareholding shares (Captable tab)
    wired, held = collect_company_filings()
    deck = collect_deck_sourced()
    ar = collect_annual_report()
    screener = collect_screener()
    collect_overlay()  # curated gap-fills, last so it only fills cells still empty
    collect_workbook_seed()  # rank-8 history seed — only wins where nothing official exists
    store, conflicts, alternates = resolve()
    # Alternate-basis (ex-1/n) ratio values superseded by the statutory 1/n value
    # land on Blocked Data alongside the held company-filing values.
    held = held + alternates
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(store, indent=2, ensure_ascii=False))
    OUT_HELD.write_text(json.dumps({
        "_meta": {
            "id": "excel-held-back",
            "description": "Company-filings values that were well-extracted (eligible) but NOT wired to Excel because the metric basis/scope cannot be unambiguously matched to the cell. These are NOT parser failures - they keep full source proof and appear on the Blocked Data sheet.",
            "preferred_ratio_basis": "statutory_1n",
            "preferred_ratio_basis_rule": "For combined/claims/expense/commission ratios, when both the statutory IRDAI 1/n basis and a company-adjusted ex-1/n basis exist, the Excel cell uses the statutory 1/n value; the adjusted value is recorded here as basis_mismatch_ex_1n_adjusted. If a source's basis is unclear, it is held basis_unclear and not auto-filled.",
            "reasons": {"basis_unclear": "non-statutory / adjusted basis vs the statutory IGAAP cell; basis (1/n vs ex-1/n) not clearly stated",
                        "scope_unclear": "company-wide vs health-only / GDPI vs total GWP",
                        "basis_mismatch_ex_1n_adjusted": "ex-1/n / management-adjusted ratio superseded by the statutory 1/n value for the Excel cell",
                        "superseded_by_statutory_filing": "as-originally-reported premium superseded by the statutory NL-1 filing (restated comparative); statutory value fills the cell",
                        "period_unclear": "premium amount whose NL-form column basis does not match the cell's period (quarter vs full-period); withheld so it is not promoted into the wrong cell"},
        },
        "data": held,
    }, indent=2, ensure_ascii=False))
    from collections import Counter
    by_layer = Counter(v["source_layer"] for v in store.values())
    print(f"excel-values.json written -> {OUT}")
    print(f"  {len(store)} resolved values  |  company-filing-sourced: {by_layer.get('company_filing', 0)}"
          f"  |  deck-sourced: {by_layer.get('company_deck', 0)}"
          f"  |  annual-report-sourced: {by_layer.get('annual_report', 0)}"
          f"  |  screener-fallback: {by_layer.get('screener_fallback', 0)} (wired {screener})"
          f"  |  conflicts flagged: {conflicts}  |  CF ratio candidates wired: {wired}  |  held-back: {len(held)}")
    by_metric = Counter(v["metric"].split("::")[0] for v in store.values())
    for metric, n in by_metric.most_common():
        print(f"    {metric:<32} {n}")


if __name__ == "__main__":
    main()
