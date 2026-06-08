#!/usr/bin/env python3
"""Monthly ingestion of IRDAI Non-Life downloadable Excel sheets.

Flow:
  1. Ask the muns chat agent to scrape https://irdai.gov.in/non-life and
     return every downloadable Excel link.
  2. Pull every IRDAI Excel download URL out of the agent's answer.
  3. Download only the links we have NOT already saved (deduped via a manifest),
     into the repo-root folder `non-life-monthly/`.

Dedup rule: we key on the full download URL. IRDAI bumps the version/timestamp
in the URL whenever a sheet is revised, so a revised sheet reads as a *new*
link and is saved as a new file; an unchanged link is skipped. This matches
"on repeat of files / links, only save the new ones each run."

The access token is read from the MUNS_API_TOKEN environment variable (a GitHub
Actions secret) — never hard-coded here.
"""

import datetime
import json
import os
import re
import sys
import urllib.request
import urllib.error
from urllib.parse import unquote, urlparse

# --- config -----------------------------------------------------------------

API_URL = "https://devde.muns.io/chat/chat-muns"
TARGET_PAGE = "https://irdai.gov.in/non-life"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "non-life-monthly")
MANIFEST_PATH = os.path.join(OUT_DIR, "manifest.json")

# Matches any IRDAI document download URL, stopping at whitespace / markdown
# table pipes / quotes / angle brackets / closing parens.
URL_RE = re.compile(r"https://irdai\.gov\.in/documents/[^\s)|\"'<>]+download=true")

API_TIMEOUT = 600  # the agent scrapes the page live; give it room.
DOWNLOAD_TIMEOUT = 120
USER_AGENT = "Mozilla/5.0 (compatible; monthly-ingestion-bot/1.0)"


# --- helpers ----------------------------------------------------------------

def build_payload():
    """Build the chat request. The scrape window rolls with the run date so a
    recurring job always asks over a current 2-year window."""
    today = datetime.date.today()
    from_date = today.replace(year=today.year - 2)
    return {
        "user_index": 124,
        "tasks": [
            "scrape and gimme a link of all downoadable excel sheets on "
            "https://irdai.gov.in/non-life"
        ],
        "query_context": {
            "TICKER_SYMBOL": [],
            "FROM_DATE": from_date.isoformat(),
            "TO_DATE": today.isoformat(),
            "ANNOUNCEMENT_FORM_TYPE": "all",
            "DOCUMENT_IDS": [],
            "CATEGORIES": [],
            "WEB_SEARCH_ENABLED": True,
            "COUNTRY": [],
            "CONTEXT_EMAIL": "nadamsaluja@gmail.com",
            "CONTEXT_COMPANY_NAME": [],
            "GET_ANNOUNCEMENTS_ENABLED": False,
            "chatHistory": [],
            "mode": "fast",
        },
        "autoAddUpcoming": False,
        "urls": [],
    }


def call_agent(token):
    """POST the scrape request and return the raw text response."""
    data = json.dumps(build_payload()).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        method="POST",
        headers={
            "accept": "*/*",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=API_TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


def extract_answer(text):
    """Return the <ans>...</ans> section (the curated, deduped list) if present,
    else the whole response."""
    m = re.search(r"<ans>(.*?)</ans>", text, re.S)
    return m.group(1) if m else text


def extract_urls(text):
    """All IRDAI Excel download URLs, de-duplicated, order preserved."""
    seen, out = set(), []
    for u in URL_RE.findall(text):
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def derive_filename(url):
    """Build a clean, human-readable .xlsx filename from a download URL.

    The path segment before the document UUID holds the original filename
    (URL-encoded, often a Hindi title + ' _ ' + the English title). We decode
    it, keep up to the first '.xlsx', prefer the English title after ' _ ',
    and sanitise. Falls back to the document UUID if anything looks off."""
    path_parts = urlparse(url).path.split("/")
    uuid = path_parts[-1] if path_parts else ""
    enc = path_parts[-2] if len(path_parts) >= 2 else ""

    name = unquote(enc.replace("+", " ")).strip()

    low = name.lower()
    if ".xlsx" in low:
        name = name[: low.index(".xlsx") + 5]
    if " _ " in name:
        name = name.split(" _ ")[-1].strip()

    # Keep word chars, spaces, dash, dot; collapse whitespace.
    name = re.sub(r"[^\w\-. ]", "", name)
    name = re.sub(r"\s+", " ", name).strip()

    if not name.lower().endswith(".xlsx"):
        name = (name + ".xlsx") if name else f"irdai-nonlife-{uuid}.xlsx"
    return name


def unique_path(name, used):
    """Avoid clobbering: if `name` is taken, suffix with -2, -3, ..."""
    base, ext = os.path.splitext(name)
    candidate, i = name, 2
    while candidate in used or os.path.exists(os.path.join(OUT_DIR, candidate)):
        candidate = f"{base}-{i}{ext}"
        i += 1
    used.add(candidate)
    return candidate


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as resp:
        body = resp.read()
    with open(dest, "wb") as f:
        f.write(body)
    return len(body)


def load_manifest():
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("files"), dict):
                return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"files": {}}  # url -> {filename, bytes, fetched_at}


def save_manifest(manifest):
    manifest["updated_at"] = datetime.datetime.utcnow().isoformat() + "Z"
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)


# --- main -------------------------------------------------------------------

def main():
    token = os.environ.get("MUNS_API_TOKEN", "").strip()
    if not token:
        print("ERROR: MUNS_API_TOKEN is not set. Add it as a GitHub Actions "
              "secret named MUNS_API_TOKEN.", file=sys.stderr)
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = load_manifest()
    known = manifest["files"]

    print(f"Calling agent to scrape {TARGET_PAGE} ...")
    try:
        raw = call_agent(token)
    except urllib.error.HTTPError as e:
        print(f"ERROR: agent call failed: HTTP {e.code} {e.reason}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"ERROR: agent call failed: {e}", file=sys.stderr)
        return 1

    urls = extract_urls(extract_answer(raw))
    if not urls:
        print("WARNING: no IRDAI Excel download links found in the response. "
              "Leaving existing files untouched.", file=sys.stderr)
        # Not a hard failure — nothing to add, nothing to lose.
        return 0

    print(f"Found {len(urls)} distinct download link(s) in the answer.")

    used_names = {v["filename"] for v in known.values() if "filename" in v}
    new_count = 0

    for url in urls:
        if url in known:
            continue  # already have this exact link — skip.
        name = unique_path(derive_filename(url), used_names)
        dest = os.path.join(OUT_DIR, name)
        try:
            size = download(url, dest)
        except Exception as e:  # one bad link must not sink the whole run.
            print(f"  ! failed: {name}  ({e})", file=sys.stderr)
            used_names.discard(name)
            continue
        known[url] = {
            "filename": name,
            "bytes": size,
            "fetched_at": datetime.datetime.utcnow().isoformat() + "Z",
        }
        new_count += 1
        print(f"  + saved: {name}  ({size:,} bytes)")

    save_manifest(manifest)

    print(f"\nDone. {new_count} new file(s) saved; "
          f"{len(urls) - new_count} already had. "
          f"Total tracked: {len(known)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
