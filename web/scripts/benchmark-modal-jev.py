"""Measure Jev-Omni cold and warm requests on the deployed Modal classes.

Run with a Python environment containing `modal`, or:
  uv tool run --from modal python scripts/benchmark-modal-jev.py
"""

import argparse
import base64
import json
import time
from urllib.request import urlopen

import modal

APP_NAME = "collections-jev-omni"
SAMPLE_IMAGE = "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=512&q=80"


def invoke(class_name: str, label: str, item: dict) -> None:
    cls = modal.Cls.from_name(APP_NAME, class_name)
    started = time.perf_counter()
    result = cls().classify.remote(item)
    print(
        json.dumps(
            {
                "variant": class_name,
                "request": label,
                "wall_seconds": round(time.perf_counter() - started, 3),
                **result,
            },
            sort_keys=True,
        ),
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=["plain", "snapshot", "both"], default="both")
    parser.add_argument("--cold-pause", type=int, default=30)
    parser.add_argument("--calls", type=int, choices=[1, 2, 3], default=3)
    parser.add_argument("--object", default="cat")
    args = parser.parse_args()

    with urlopen(SAMPLE_IMAGE, timeout=30) as response:
        image = response.read()
    item = {"object": args.object, "image_base64": base64.b64encode(image).decode("ascii")}

    names = (
        ["JevOmniPlain", "JevOmniSnapshot"]
        if args.variant == "both"
        else ["JevOmniPlain" if args.variant == "plain" else "JevOmniSnapshot"]
    )
    for class_name in names:
        invoke(class_name, "first_cold", item)
        if args.calls >= 2:
            invoke(class_name, "warm", item)
        if args.calls >= 3:
            time.sleep(args.cold_pause)
            invoke(class_name, "after_pause", item)


if __name__ == "__main__":
    main()
