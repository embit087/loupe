"""Publish reference images for studied posts to R2 so generation prompts can cite them.

Usage:
  python3 scripts/publish-study-references.py

Requires Pillow and a logged-in Wrangler. For every study with a judged record in
content/study-dimensions, it takes every distinct frame in viewing order (every extracted slide of a
video, every carousel item, the photo), converts them to JPEG (long edge 1080px),
uploads them to the R2 bucket $LOUPE_REFERENCE_BUCKET (default loupe-media) under collections/exp-lab/<author>/<stem>/<frame>.jpg, checks
each public URL, and records them in content/study-references.json. Unchanged images are skipped.
"""

import hashlib
import io
import json
import os
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = Path(os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT_ROOT.parent / "sample-archive")).resolve()
WRANGLER_DIR = PROJECT_ROOT.parent / "api"
MANIFEST = PROJECT_ROOT / "content" / "study-references.json"
BUCKET = os.environ.get("LOUPE_REFERENCE_BUCKET", "loupe-media")
PUBLIC = os.environ.get("LOUPE_REFERENCE_ORIGIN", "https://assets.example.com").rstrip("/")


def study_manifest(author, asset):
    featured = json.loads((PROJECT_ROOT / "content" / "experiment-lab.json").read_text())
    if featured["author"] == author and featured["asset"] == asset:
        return featured
    path = PROJECT_ROOT / "content" / "lab-studies" / f"{author}__{Path(asset).stem}.json"
    return json.loads(path.read_text()) if path.exists() else None


def pick(study):
    # Every distinct frame, in the order a viewer meets it.
    return sorted(study["frames"], key=lambda frame: frame["occurrences"][0]["startFrame"] if frame.get("occurrences") else frame["sourceFrame"])


def label(study, frame):
    if study.get("kind", "video") == "video" and frame.get("occurrences"):
        return f"Slide {frame['id']} at {frame['timeSeconds']:.2f}s"
    if study.get("kind") == "photo":
        return "The photo"
    return f"Item {frame['id']} of {len(study['frames'])}"


def jpeg(path):
    image = Image.open(path).convert("RGB")
    image.thumbnail((1080, 1080))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=85, optimize=True, progressive=True)
    return buffer.getvalue(), image.size


def check(url):
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "collections-reference-check"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.status, response.headers.get("content-type", "")


def main():
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    for record_path in sorted((PROJECT_ROOT / "content" / "study-dimensions").glob("*.json")):
        record = json.loads(record_path.read_text())
        author, asset = record["author"], record["asset"]
        study = study_manifest(author, asset)
        if not study:
            print(f"skip {author}/{asset}: no study manifest")
            continue
        stem = Path(asset).stem
        folder = ARCHIVE_ROOT / "output" / "data" / "experiment-lab" / stem / "frames"
        previous = {item["id"]: item for item in manifest.get(f"{author}/{asset}", [])}
        references = []
        for frame in pick(study):
            data, (width, height) = jpeg(folder / f"{frame['id']}.png")
            digest = hashlib.sha256(data).hexdigest()
            key = f"collections/exp-lab/{author}/{stem}/{frame['id']}.jpg"
            url = f"{PUBLIC}/{key}"
            if previous.get(frame["id"], {}).get("sha256") != digest:
                if frame["id"] in previous:
                    print(f"  note: {key} changed; purge its CDN copy after upload")
                temp = PROJECT_ROOT / ".next" / "cache" / "study-reference.jpg"
                temp.parent.mkdir(parents=True, exist_ok=True)
                temp.write_bytes(data)
                subprocess.run(["npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{key}", "--file", str(temp), "--content-type", "image/jpeg", "--remote"],
                               cwd=WRANGLER_DIR, check=True, capture_output=True)
                temp.unlink()
            status, content_type = check(url)
            if status != 200 or not content_type.startswith("image/jpeg"):
                raise SystemExit(f"{url} answered {status} {content_type}")
            references.append({"id": frame["id"], "url": url, "label": label(study, frame), "width": width, "height": height, "sha256": digest})
        manifest[f"{author}/{asset}"] = references
        print(f"{author}/{asset}: {len(references)} references")
    MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")


if __name__ == "__main__":
    main()
