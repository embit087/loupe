"""Build Exp Lab studies for saved posts from their saved feed responses.

Usage:
  python3 scripts/build-lab-studies.py author/asset [author/asset ...]

Requires OpenCV, NumPy, and Pillow. Each post's media is downloaded once from
the signed URLs in its account's saved feed response and kept in the archive
under output/data/experiment-lab/<asset stem>/source/, so the study keeps
working after those URLs expire. Stop-motion videos are split into held
states; continuous footage keeps only its settled moments. Visually repeated
states are grouped with their first appearance. Carousels become one slide
per item; photos become a single slide.

The reviewed Demo Studio study is built by extract-lab-frames.py instead.
"""

import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = Path(
    os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT_ROOT.parent / "sample-archive")
).resolve()
FEEDS = ARCHIVE_ROOT / "instagram-data"
STUDIES = PROJECT_ROOT / "content" / "lab-studies"
ANALYSIS_LONG_EDGE = 320
STATE_CHANGE_MAE = 1.0
# Continuous footage changes on almost every frame. There, a slide is a
# settled moment: change stays below SETTLED_MAE for at least SETTLED_SECONDS,
# and the motion between settled moments is treated as transition.
MAX_HELD_STATES = 60
SETTLED_MAE = 3.0
SETTLED_SECONDS = 0.2
REPEAT_MAE = 2.5
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"


def seconds(frame, fps):
    return round(frame / fps, 3)


def find_media(code):
    for feed in sorted(FEEDS.glob("**/feed.json")):
        found = search(json.loads(feed.read_text()), code)
        if found:
            return found, feed
    raise SystemExit(f"No saved feed response contains {code}.")


def search(node, code):
    if isinstance(node, dict):
        if node.get("code") == code and "media_type" in node:
            return node
        values = node.values()
    elif isinstance(node, list):
        values = node
    else:
        return None
    for value in values:
        found = search(value, code)
        if found:
            return found
    return None


def best_url(item):
    if item.get("video_versions"):
        return item["video_versions"][0]["url"], ".mp4"
    candidates = item.get("image_versions2", {}).get("candidates") or []
    if not candidates:
        raise SystemExit("A media item has no image or video URL.")
    best = max(candidates, key=lambda candidate: candidate.get("width", 0) * candidate.get("height", 0))
    return best["url"], ".jpg"


def download(url, target):
    if target.exists() and target.stat().st_size:
        return
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    target.write_bytes(data)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def analysis_size(width, height):
    scale = ANALYSIS_LONG_EDGE / max(width, height)
    return max(1, round(width * scale)), max(1, round(height * scale))


def save_frame(frame_bgr, identifier, full_dir, thumb_dir):
    cv2.imwrite(str(full_dir / f"{identifier}.png"), frame_bgr)
    thumb = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    thumb.thumbnail((360, 640))
    thumb.save(thumb_dir / f"{identifier}.jpg", quality=89, optimize=True)


def settled_runs(changes, minimum):
    starts, ends, start = [], [], None
    # changes[i] compares frames i and i + 1; a run of still changes spans one more frame.
    for index, difference in enumerate(list(changes) + [float("inf")]):
        if difference < SETTLED_MAE:
            start = index if start is None else start
            continue
        if start is not None and index + 1 - start >= minimum:
            starts.append(start)
            ends.append(index + 1)
        start = None
    return starts, ends


def video_study(source, full_dir, thumb_dir):
    capture = cv2.VideoCapture(str(source))
    fps = capture.get(cv2.CAP_PROP_FPS)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    size = analysis_size(width, height)
    analyzed = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        analyzed.append(cv2.resize(frame, size, interpolation=cv2.INTER_AREA))
    capture.release()
    if not analyzed or fps <= 0:
        raise SystemExit(f"Could not decode {source}.")

    samples = np.stack(analyzed).astype(np.int16)
    changes = np.abs(samples[1:] - samples[:-1]).mean(axis=(1, 2, 3))
    segmentation = "held states"
    starts = [0] + [index for index, difference in enumerate(changes, 1) if difference > STATE_CHANGE_MAE]
    ends = starts[1:] + [len(analyzed)]
    if len(starts) > MAX_HELD_STATES:
        segmentation = "settled moments"
        starts, ends = settled_runs(changes, max(2, round(SETTLED_SECONDS * fps)))
        if not starts:
            raise SystemExit(f"{source} never settles; review the thresholds for this video.")
    middles = [start + (end - start - 1) // 2 for start, end in zip(starts, ends)]

    # Group each run with the first earlier kept run that looks the same.
    first_of = {}
    kept = []
    for run, middle in enumerate(middles):
        match = next(
            (other for other in kept if np.abs(samples[middle] - samples[middles[other]]).mean() < REPEAT_MAE),
            None,
        )
        first_of[run] = run if match is None else match
        if match is None:
            kept.append(run)

    identifiers = {run: f"{position:02d}" for position, run in enumerate(kept, 1)}
    frames = []
    for run in kept:
        related = [index for index in range(len(starts)) if first_of[index] == run]
        occurrences = [
            {
                "startFrame": starts[index],
                "endFrame": ends[index],
                "startSeconds": seconds(starts[index], fps),
                "endSeconds": seconds(ends[index], fps),
                "durationSeconds": seconds(ends[index] - starts[index], fps),
            }
            for index in related
        ]
        frames.append(
            {
                "id": identifiers[run],
                "sourceFrame": middles[run],
                "timeSeconds": seconds(middles[run], fps),
                "totalVisibleSeconds": round(sum(item["durationSeconds"] for item in occurrences), 3),
                "occurrences": occurrences,
            }
        )

    desired = {item["sourceFrame"]: item["id"] for item in frames}
    capture = cv2.VideoCapture(str(source))
    for index in range(len(analyzed)):
        ok, frame = capture.read()
        if not ok:
            raise SystemExit(f"Could not decode source frame {index} on the second pass.")
        if index in desired:
            save_frame(frame, desired[index], full_dir, thumb_dir)
    capture.release()

    if segmentation == "held states":
        split = f"Mean absolute pixel change >{STATE_CHANGE_MAE:g} separated held states."
    else:
        split = (
            f"The footage moves on most frames, so only settled moments were kept: runs of at least "
            f"{SETTLED_SECONDS:g}s where mean absolute pixel change stayed <{SETTLED_MAE:g}. Motion between them is transition."
        )
    return {
        "fps": fps,
        "width": width,
        "height": height,
        "totalFrames": len(analyzed),
        "durationSeconds": seconds(len(analyzed), fps),
        "heldStates": len(starts),
        "uniqueSlides": len(kept),
        "segmentation": segmentation,
        "method": (
            f"Every decoded frame was compared at {size[0]}×{size[1]} RGB resolution. {split} Runs whose middle "
            f"frames differed by <{REPEAT_MAE:g} were grouped with their first appearance. Slides were checked on the contact sheet."
        ),
        "frames": frames,
    }


def still_study(sources, full_dir, thumb_dir):
    frames = []
    width = height = 0
    for position, source in enumerate(sources, 1):
        image = cv2.imread(str(source))
        if image is None:
            raise SystemExit(f"Could not decode {source}.")
        if position == 1:
            height, width = image.shape[:2]
        identifier = f"{position:02d}"
        save_frame(image, identifier, full_dir, thumb_dir)
        frames.append(
            {
                "id": identifier,
                "sourceFrame": position - 1,
                "timeSeconds": 0,
                "totalVisibleSeconds": 0,
                "occurrences": [],
            }
        )
    count = len(frames)
    return {
        "fps": 0,
        "width": width,
        "height": height,
        "totalFrames": count,
        "durationSeconds": 0,
        "heldStates": count,
        "uniqueSlides": count,
        "segmentation": "items",
        "method": (
            "Each carousel item was saved at the largest size in the feed response, in posting order."
            if count > 1
            else "The photo was saved at the largest size in the feed response."
        ),
        "frames": frames,
    }


def contact_sheet(frames, thumb_dir, target, aspect):
    cell_width = 180
    image_height = round(cell_width / aspect)
    cell_height = image_height + 22
    columns = min(7, len(frames))
    rows = (len(frames) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), (237, 234, 228))
    draw = ImageDraw.Draw(sheet)
    for position, item in enumerate(frames):
        x, y = position % columns * cell_width, position // columns * cell_height
        thumb = Image.open(thumb_dir / f"{item['id']}.jpg")
        thumb.thumbnail((cell_width, image_height))
        sheet.paste(thumb, (x, y))
        label = f"{item['id']}  {item['timeSeconds']:.2f}s" if item["occurrences"] else item["id"]
        if len(item["occurrences"]) > 1:
            label += f"  ×{len(item['occurrences'])}"
        draw.text((x + 4, y + image_height + 4), label, fill=(25, 25, 25))
    sheet.save(target, quality=92)


def build(key):
    author, asset = key.split("/", 1)
    stem, extension = os.path.splitext(asset)
    code = re.sub(r"^\d{8}_", "", stem)
    media, feed = find_media(code)
    items = media.get("carousel_media") or [media]
    kind = "carousel" if extension == ".carousel" else "video" if extension == ".mp4" else "photo"

    output = ARCHIVE_ROOT / "output" / "data" / "experiment-lab" / stem
    source_dir, full_dir, thumb_dir = output / "source", output / "frames", output / "thumbs"
    for folder in (source_dir, full_dir, thumb_dir):
        folder.mkdir(parents=True, exist_ok=True)
    # A rebuild can produce fewer slides; drop the previous run's images.
    for stale in [*full_dir.glob("*.png"), *thumb_dir.glob("*.jpg")]:
        stale.unlink()

    sources = []
    for position, item in enumerate(items, 1):
        url, suffix = best_url(item)
        target = source_dir / (f"source{suffix}" if len(items) == 1 else f"{position:02d}{suffix}")
        download(url, target)
        sources.append(target)

    if kind == "video":
        if sources[0].suffix != ".mp4":
            raise SystemExit(f"{key} is saved as a video but its feed item has no video URL.")
        study = video_study(sources[0], full_dir, thumb_dir)
    else:
        study = still_study(sources, full_dir, thumb_dir)

    manifest = {
        "asset": asset,
        "author": author,
        "kind": kind,
        "sourceFile": str(sources[0].relative_to(ARCHIVE_ROOT)) if kind == "video" else None,
        "sourceSha256": [sha256(source) for source in sources],
        "feed": str(feed.relative_to(ARCHIVE_ROOT)),
        **study,
    }
    contact_sheet(manifest["frames"], thumb_dir, output / "contact-sheet.jpg", manifest["width"] / manifest["height"])

    serialized = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    (output / "manifest.json").write_text(serialized)
    STUDIES.mkdir(parents=True, exist_ok=True)
    (STUDIES / f"{author}__{stem}.json").write_text(serialized)
    detail = f"{manifest['totalFrames']} frames into {manifest['heldStates']} {manifest['segmentation']}; " if kind == "video" else ""
    print(f"{key}: {detail}{manifest['uniqueSlides']} slides → {output}")


def main():
    keys = sys.argv[1:]
    if not keys or any(not re.fullmatch(r"[^/]+/[^/]+\.(mp4|jpg|carousel)", key) for key in keys):
        raise SystemExit(__doc__)
    for key in keys:
        build(key)
    write_index()


def write_index():
    files = sorted(STUDIES.glob("*.json"))
    names = [re.sub(r"\W", "_", path.stem) for path in files]
    lines = ["// Generated by scripts/build-lab-studies.py. Do not edit.", ""]
    lines += [f'import {name} from "./{path.name}";' for name, path in zip(names, files)]
    lines += ["", f"export const builtStudies = [{', '.join(names)}];", ""]
    (STUDIES / "index.ts").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
