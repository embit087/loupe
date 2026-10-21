"""SocialCrawl client that records every credit it spends.

Follows the provider's agent guidance (https://www.socialcrawl.dev/llms.txt):
the key only ever travels in the x-api-key header, paths must exist in the
catalogue, lists page with pagination.next_cursor, 429/503 wait for
Retry-After, a platform that keeps failing is checked on /v1/status instead of
retried, and every request carries an Idempotency-Key so a retry is never
billed twice.

Each billed call must name a goal from content/socialcrawl-plan.json. Before a
call the script checks the goal's cap and the total budget against the
endpoint's worst-case price; after it, the raw body, request metadata and a
ledger line are written to the archive, so /sources/socialcrawl can compare
spend with the plan.

    python3 scripts/socialcrawl.py status
    python3 scripts/socialcrawl.py balance
    python3 scripts/socialcrawl.py estimate [goal]
    python3 scripts/socialcrawl.py get --goal kol-refresh /v1/instagram/profile handle=demo.trail
    python3 scripts/socialcrawl.py get --goal kol-refresh --pages 2 /v1/instagram/profile/posts handle=demo.trail
    python3 scripts/socialcrawl.py reconcile

The key is read from SOCIALCRAWL_API_KEY, or from .env.local in this project.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT.parent / "sample-archive"))
DATA = ARCHIVE / "socialcrawl-data"
LEDGER = DATA / "ledger.jsonl"
TRANSACTIONS = DATA / "transactions.json"
CATALOG = PROJECT / "content" / "socialcrawl.json"
PLAN = PROJECT / "content" / "socialcrawl-plan.json"
BASE = "https://www.socialcrawl.dev"
MAX_WAITS = 3
WARN_SHARE = 0.8


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def api_key() -> str:
    key = os.environ.get("SOCIALCRAWL_API_KEY")
    env_file = PROJECT / ".env.local"
    if not key and env_file.exists():
        match = re.search(r"^SOCIALCRAWL_API_KEY=(.+)$", env_file.read_text(), re.M)
        key = match.group(1).strip().strip("\"'") if match else None
    if not key:
        sys.exit("SOCIALCRAWL_API_KEY is not set (environment or .env.local)")
    return key


def load_json(path: Path):
    return json.loads(path.read_text())


def ledger_rows() -> list[dict]:
    if not LEDGER.exists():
        return []
    return [json.loads(line) for line in LEDGER.read_text().splitlines() if line.strip()]


def append_ledger(row: dict) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def catalog_index() -> dict[str, dict]:
    return {e["id"]: e for e in load_json(CATALOG)["endpoints"]}


def match_endpoint(index: dict[str, dict], method: str, path: str) -> dict:
    """Resolve a concrete path (/v1/web/jobs/job_1) against the catalogue's templates."""
    bare = path.split("?")[0]
    bare = bare[3:] if bare.startswith("/v1/") else bare
    exact = index.get(f"{method} {bare}")
    if exact:
        return exact
    for entry in index.values():
        if entry["method"] != method:
            continue
        pattern = "^" + re.sub(r"\\\{[^}]+\\\}", "[^/]+", re.escape(entry["path"][3:])) + "$"
        if re.match(pattern, bare):
            return entry
    sys.exit(f"{method} /v1{bare} is not in the catalogue. Never invent paths; run scripts/sync-socialcrawl.py if the API added it.")


def goal_estimate(goal: dict, index: dict[str, dict]) -> dict:
    typical = worst = 0
    for call in goal["calls"]:
        entry = index.get(call["endpoint"])
        if not entry:
            raise SystemExit(f"Goal {goal['id']} names unknown endpoint {call['endpoint']}")
        typical += call["count"] * entry["cost"]
        worst += call["count"] * entry["max"]
    cap = goal.get("cap") or math.ceil(typical * 1.2)
    return {"typical": typical, "worst": worst, "cap": cap}


def spent(rows: list[dict], goal: str | None = None) -> int:
    return sum(r.get("credits_used") or 0 for r in rows if r.get("kind") == "call" and (goal is None or r.get("goal") == goal))


def request(method: str, url: str, key: str | None, idempotency: str | None = None) -> tuple[int, dict, bytes]:
    headers = {"Accept": "application/json", "User-Agent": "loupe-web/socialcrawl"}
    if key:
        headers["x-api-key"] = key
    if idempotency:
        headers["Idempotency-Key"] = idempotency
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def platform_state(platform: str) -> str:
    status, _, body = request("GET", f"{BASE}/v1/status", None)
    if status != 200:
        return f"/v1/status returned HTTP {status}"
    try:
        platforms = json.loads(body).get("platforms", {})
    except json.JSONDecodeError:
        return "unreadable /v1/status response"
    return (platforms.get(platform) or {}).get("status", "not listed")


def cmd_status(_args) -> None:
    status, _, body = request("GET", f"{BASE}/v1/status", None)
    print(f"HTTP {status}")
    print(body.decode(errors="replace")[:4000])


def cmd_balance(_args) -> None:
    status, _, body = request("GET", f"{BASE}/v1/credits/balance", api_key())
    payload = json.loads(body)
    if status != 200 or not payload.get("success"):
        sys.exit(f"HTTP {status}: {payload.get('error')}")
    append_ledger({"kind": "balance", "at": now(), "credits_remaining": payload["data"]["balance"], "recent_deductions": payload["data"].get("recent_deductions")})
    print(f"balance {payload['data']['balance']:,} credits")


def cmd_estimate(args) -> None:
    plan, index, rows = load_json(PLAN), catalog_index(), ledger_rows()
    total_typical = 0
    for goal in plan["goals"]:
        if args.goal and goal["id"] != args.goal:
            continue
        est = goal_estimate(goal, index)
        total_typical += est["typical"]
        print(f"{goal['id']:<18} typical {est['typical']:>6,}  worst {est['worst']:>6,}  cap {est['cap']:>6,}  spent {spent(rows, goal['id']):>6,}")
    print(f"planned {total_typical:,} of budget {plan['budget']['credits']:,}; spent {spent(rows):,}")


def cmd_get(args) -> None:
    plan, index, rows = load_json(PLAN), catalog_index(), ledger_rows()
    goals = {g["id"]: g for g in plan["goals"]}
    if args.goal not in goals:
        sys.exit(f"Unknown goal {args.goal!r}; add it to {PLAN.relative_to(PROJECT)} first. Goals: {', '.join(goals)}")
    entry = match_endpoint(index, args.method, args.path)
    query = dict(pair.split("=", 1) for pair in args.params)
    if "cursor" in query and args.pages > 1:
        sys.exit("Pass either an explicit cursor or --pages, not both")
    est = goal_estimate(goals[args.goal], index)
    budget = plan["budget"]["credits"]
    key = api_key()
    path = entry["path"] if "{" not in entry["path"] else ("/v1" + re.sub(r"^/v1", "", args.path.split("?")[0]))
    run = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = re.sub(r"[^a-z0-9]+", "-", f"{path}-{'-'.join(query.values())}".lower()).strip("-")[:90]
    folder = DATA / "raw" / args.goal
    folder.mkdir(parents=True, exist_ok=True)

    for page in range(1, args.pages + 1):
        walked = max(int(query.get(name, "1")) if query.get(name, "1").isdigit() else 1 for name in ("max_pages", "scan_pages"))
        worst = entry["max"] * walked
        goal_spent, total_spent = spent(rows, args.goal), spent(rows)
        if total_spent + worst > budget and not args.over_budget:
            sys.exit(f"Stopped: {total_spent:,} spent + up to {worst} for this call exceeds the {budget:,} credit budget")
        if goal_spent + worst > est["cap"] and not args.over_cap:
            sys.exit(f"Stopped: goal {args.goal} has spent {goal_spent:,} of its {est['cap']:,} cap; this call can cost up to {worst}")
        if total_spent + worst > budget * WARN_SHARE:
            print(f"warning: total spend would pass {int(WARN_SHARE * 100)}% of the budget", file=sys.stderr)

        url = f"{BASE}{path}?{urllib.parse.urlencode(query)}" if query else f"{BASE}{path}"
        idempotency = str(uuid.uuid4())
        failures = 0
        while True:
            requested_at = now()
            status, headers, body = request(args.method, url, key, idempotency)
            if status in (429, 503) and failures < MAX_WAITS:
                wait = int(headers.get("Retry-After") or 5)
                failures += 1
                print(f"HTTP {status}; waiting {wait}s (Retry-After) then retrying with the same Idempotency-Key", file=sys.stderr)
                time.sleep(wait)
                continue
            if status in (502, 503) and failures >= 1:
                print(f"{entry['platform']} on /v1/status: {platform_state(entry['platform'])}", file=sys.stderr)
            break

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"success": False, "error": {"type": "non_json", "message": body[:300].decode(errors="replace")}}
        stem = f"{run}_{slug}" + (f"_p{page}" if args.pages > 1 else "")
        (folder / f"{stem}.json").write_bytes(body)
        meta = {
            "requested_at": requested_at,
            "goal": args.goal,
            "method": args.method,
            "endpoint": path,
            "catalog_id": entry["id"],
            "query": query,
            "http_status": status,
            "idempotency_key": idempotency,
            "request_id": payload.get("request_id"),
            "cached": payload.get("cached"),
            "x_cache": headers.get("X-Cache"),
            "credits_used": payload.get("credits_used"),
            "credits_remaining": payload.get("credits_remaining"),
            "x_credits_remaining": headers.get("X-Credits-Remaining"),
            "estimate": {"cost": entry["cost"], "max": entry["max"]},
            "error": payload.get("error"),
        }
        (folder / f"{stem}.meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
        row = {"kind": "call", "at": requested_at, **{k: meta[k] for k in ("goal", "method", "endpoint", "catalog_id", "query", "http_status", "request_id", "cached", "credits_used", "credits_remaining")},
               "estimate_cost": entry["cost"], "estimate_max": entry["max"], "file": str((folder / f"{stem}.json").relative_to(ARCHIVE))}
        append_ledger(row)
        rows.append(row)
        print(f"{status} {path} page {page}: {meta['credits_used']} credits (cached={meta['cached']}), balance {meta['credits_remaining']}")
        if not payload.get("success"):
            error = payload.get("error") or {}
            sys.exit(f"{error.get('type')}: {error.get('message')} — see {error.get('doc_url')}")
        pagination = payload.get("pagination") or (payload.get("data") or {}).get("pagination") or {}
        if page == args.pages or not pagination.get("has_more"):
            break
        query["cursor"] = pagination["next_cursor"]


def cmd_reconcile(_args) -> None:
    key = api_key()
    items, cursor = [], None
    while True:
        query = {"limit": 100, **({"cursor": cursor} if cursor else {})}
        status, _, body = request("GET", f"{BASE}/v1/credits/transactions?{urllib.parse.urlencode(query)}", key)
        payload = json.loads(body)
        if status != 200 or not payload.get("success"):
            sys.exit(f"HTTP {status}: {payload.get('error')}")
        items += payload["data"]["items"]
        cursor = payload["data"].get("next_cursor")
        if not cursor:
            break
    DATA.mkdir(parents=True, exist_ok=True)
    TRANSACTIONS.write_text(json.dumps({"fetched_at": now(), "items": items}, ensure_ascii=False, indent=1) + "\n")
    provider = -sum(t["amount"] for t in items)
    ledger = spent(ledger_rows())
    by_request = {r.get("request_id") for r in ledger_rows() if r.get("kind") == "call"}
    unknown = [t for t in items if t.get("request_id") and t["request_id"] not in by_request]
    print(f"provider net spend {provider:,}; ledger {ledger:,}; {len(unknown)} transactions not made by this script")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status").set_defaults(run=cmd_status)
    sub.add_parser("balance").set_defaults(run=cmd_balance)
    sub.add_parser("reconcile").set_defaults(run=cmd_reconcile)
    estimate = sub.add_parser("estimate")
    estimate.add_argument("goal", nargs="?")
    estimate.set_defaults(run=cmd_estimate)
    get = sub.add_parser("get")
    get.add_argument("--goal", required=True)
    get.add_argument("--method", default="GET", type=str.upper)
    get.add_argument("--pages", type=int, default=1, help="follow pagination.next_cursor up to this many pages")
    get.add_argument("--over-cap", action="store_true", help="allow this goal to pass its cap")
    get.add_argument("--over-budget", action="store_true", help="allow total spend to pass the budget")
    get.add_argument("path")
    get.add_argument("params", nargs="*", help="query parameters as key=value")
    get.set_defaults(run=cmd_get)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
