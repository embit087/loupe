#!/usr/bin/env python3
"""Probe one visual search prediction without printing credentials or image data.

Examples:
  python3 scripts/probe-visual-find.py --mode direct
  python3 scripts/probe-visual-find.py --mode next
"""

import argparse
import base64
import json
import os
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGE = ROOT.parent / "sample-archive/style-atlas-thumbs/20260806_DbtOhFKOFqw.jpg"
VERSION = "barakplasma/jev-omni:292bc2c53f4a46bec43649fb9cad4442995b370140ff357d5eea92c56a7e96bb"
TERMINAL = {"succeeded", "failed", "canceled", "aborted"}


def request_json(url, *, method="GET", data=None, token=None, timeout=30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=json.dumps(data).encode() if data is not None else None,
                      headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), json.load(response)
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            body = {"detail": body[:500]}
        return error.code, dict(error.headers), body


def token():
    value = os.environ.get("REPLICATE_API_TOKEN", "").strip()
    if not value.startswith("r8_"):
        raise ValueError("Replicate API token is unavailable")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("direct", "next"), default="direct")
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE)
    parser.add_argument("--object", default="a bag")
    parser.add_argument("--author", default="demo.studio")
    parser.add_argument("--asset", default="20260806_DbtOhFKOFqw.mp4")
    parser.add_argument("--next-url", default="http://localhost:3000")
    parser.add_argument("--timeout", type=int, default=240, help="Seconds to poll")
    args = parser.parse_args()

    if args.mode == "direct":
        payload = {"version": VERSION, "input": {
            "image_base64": base64.b64encode(args.image.read_bytes()).decode("ascii"),
            "question_type": "yes_no",
            "question": f"Does this image visibly contain {args.object}? Answer yes only when the object can be identified in the pixels, not inferred from text or context.",
            "state": "Classify only the supplied post image or the first video frame.",
        }}
        api_token = token()
        url = "https://api.replicate.com/v1/predictions"
    else:
        payload = {"author": args.author, "asset": args.asset, "object": args.object}
        api_token = None
        url = f"{args.next_url.rstrip('/')}/api/visual-find"

    started = time.monotonic()
    status, headers, body = request_json(url, method="POST", data=payload, token=api_token)
    print(f"create HTTP {status}, elapsed {time.monotonic() - started:.1f}s")
    if status >= 400:
        print("error:", body.get("detail") or body.get("error") or body)
        print("retry-after:", headers.get("Retry-After", "absent"))
        return 1

    prediction_id = body.get("id") or body.get("predictionId")
    prediction_key = body.get("key")
    print("prediction:", prediction_id, "status:", body.get("status"), "cache:", body.get("cache", "n/a"))
    while body.get("status") not in TERMINAL and time.monotonic() - started < args.timeout:
        time.sleep(10)
        if args.mode == "direct":
            poll_url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
        else:
            poll_url = f"{args.next_url.rstrip('/')}/api/visual-find?key={prediction_key}"
        status, _, body = request_json(poll_url, token=api_token)
        print(f"poll HTTP {status}, elapsed {time.monotonic() - started:.1f}s, status: {body.get('status')}")
        if status >= 400:
            print("error:", body.get("detail") or body.get("error") or body)
            return 1

    print("final:", {key: body.get(key) for key in ("status", "output", "probability", "matched", "error", "metrics") if key in body})
    return 0 if body.get("status") == "succeeded" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, URLError, ValueError) as error:
        print(f"probe failed: {type(error).__name__}: {error}")
        raise SystemExit(1) from None
