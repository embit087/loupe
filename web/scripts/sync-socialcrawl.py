"""Snapshot SocialCrawl's endpoint prices into content/socialcrawl.json.

Reads the public OpenAPI spec (every operation carries x-credit-tier,
x-credit-cost and, for metered endpoints, x-credit-cost-min/max and a
formula), llms.txt, and the credit packs on the pricing page. The raw
documents are kept in the archive under socialcrawl-data/docs/<date>/ so a
price change can be traced to the snapshot that recorded it. No API key is
needed and no credits are spent.

    python3 scripts/sync-socialcrawl.py            # fetch live docs
    python3 scripts/sync-socialcrawl.py --offline  # rebuild from the latest saved docs
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT.parent / "sample-archive"))
DOCS = ARCHIVE / "socialcrawl-data" / "docs"
OUTPUT = PROJECT / "content" / "socialcrawl.json"
SITE = "https://www.socialcrawl.dev"
SOURCES = {
    "openapi.json": f"{SITE}/v1/openapi.json",
    "llms.txt": f"{SITE}/llms.txt",
    "pricing.html": f"{SITE}/pricing",
}
METHODS = ("get", "post", "put", "patch", "delete")


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "loupe-web/sync-socialcrawl"})
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f"{url} returned HTTP {response.status}")
        return response.read()


def load_docs(offline: bool) -> tuple[Path, dict[str, bytes]]:
    if offline:
        saved = sorted(p for p in DOCS.glob("*") if p.is_dir())
        if not saved:
            raise RuntimeError(f"No saved docs under {DOCS}; run without --offline first")
        folder = saved[-1]
        return folder, {name: (folder / name).read_bytes() for name in SOURCES}
    folder = DOCS / dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    docs = {}
    for name, url in SOURCES.items():
        body = fetch(url)
        (folder / name).write_bytes(body)
        docs[name] = body
    return folder, docs


def parse_packs(html: str) -> list[dict]:
    """Credit packs from the pricing page's JSON-LD offers plus the visible pack cards."""
    offers = re.search(r'"offers":(\[\{"@type":"Offer".*?\}\])', html.replace('\\"', '"'))
    if not offers:
        raise RuntimeError("Pricing page no longer carries JSON-LD offers")
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    packs = [{"name": "Free", "price": 0, "currency": "GBP", "credits": 100, "note": "One-time, on sign-up"}]
    for offer in json.loads(offers.group(1)):
        name = offer["name"]
        # Card text reads "<Name> <description> [<old> credits] <credits> credits £<price>"; the last
        # credits figure before the price is the one sold (an earlier one is a struck-through amount).
        card = re.search(re.escape(name) + r" " + re.escape(offer["description"]) + r" ((?:[\d,]+ credits ){1,2})£" + re.escape(offer["price"]), text)
        if not card:
            raise RuntimeError(f"Pricing card for {name} not found")
        amounts = [int(a.replace(",", "")) for a in re.findall(r"([\d,]+) credits", card.group(1))]
        packs.append({
            "name": name,
            "price": float(offer["price"]),
            "currency": offer["priceCurrency"],
            "credits": amounts[-1],
            "note": offer["description"] + (f" (was {amounts[0]:,} credits)" if len(amounts) > 1 else ""),
        })
    for pack in packs:
        pack["perCredit"] = round(pack["price"] / pack["credits"], 6) if pack["credits"] else 0
    return packs


def build(folder: Path, docs: dict[str, bytes]) -> dict:
    spec = json.loads(docs["openapi.json"])
    llms = docs["llms.txt"].decode()
    updated = re.search(r"Last updated: (\S+)", llms)
    endpoints = []
    for path, ops in spec["paths"].items():
        for method in METHODS:
            op = ops.get(method)
            if not isinstance(op, dict):
                continue
            cost = op.get("x-credit-cost")
            if cost is None:
                continue
            tier = op.get("x-credit-tier") or "account"
            endpoints.append({
                "id": f"{method.upper()} {path}",
                "method": method.upper(),
                "path": f"/v1{path}",
                "platform": path.strip("/").split("/")[0],
                "summary": op.get("summary", ""),
                "tier": tier,
                "cost": cost,
                "min": op.get("x-credit-cost-min", cost),
                "max": op.get("x-credit-cost-max", cost),
                "metered": "x-credit-cost-min" in op or "x-credit-cost-formula" in op,
                "formula": op.get("x-credit-cost-formula", ""),
            })
    endpoints.sort(key=lambda e: (e["platform"], e["path"], e["method"]))
    tiers = {}
    for e in endpoints:
        tiers.setdefault(e["tier"], 0)
        tiers[e["tier"]] += 1
    priced = [e for e in endpoints if e["tier"] != "account"]
    if len(priced) < 600:
        raise RuntimeError(f"Only {len(priced)} priced endpoints parsed; the spec format may have changed")
    return {
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "docsUpdated": updated.group(1) if updated else None,
        "docsFolder": str(folder.relative_to(ARCHIVE)),
        "sources": SOURCES,
        "specVersion": spec.get("info", {}).get("version"),
        "packs": parse_packs(docs["pricing.html"].decode()),
        "tiers": tiers,
        "endpoints": endpoints,
    }


def main() -> None:
    folder, docs = load_docs("--offline" in sys.argv)
    snapshot = build(folder, docs)
    OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n")
    platforms = len({e["platform"] for e in snapshot["endpoints"]})
    print(f"{len(snapshot['endpoints'])} endpoints across {platforms} platforms, tiers {snapshot['tiers']}")
    print(f"packs: " + ", ".join(f"{p['name']} {p['credits']:,} cr £{p['price']:g}" for p in snapshot["packs"]))
    print(f"wrote {OUTPUT.relative_to(PROJECT)}; raw docs in {folder}")


if __name__ == "__main__":
    main()
