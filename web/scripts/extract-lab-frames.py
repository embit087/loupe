"""Extract the reviewed, visually distinct slides from the first lab video.

Requires OpenCV, NumPy, and Pillow. The duplicate map was checked against a
contact sheet of every held state in this exact source video.
"""

import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = Path(
    os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT_ROOT.parent / "sample-archive")
).resolve()
ASSET = "20260517_DEMO00001.mp4"
EXPECTED_SHA256 = "9162cc47ee4a7799158899d18634e9b328a779e599e59df4440f9a59d1fd90b5"
ANALYSIS_SIZE = (180, 320)
STATE_CHANGE_MAE = 1.0

# Run numbers refer to the 50 held states detected in this exact source. A
# matching run is kept in the manifest as another occurrence of its first slide.
REVIEWED_DUPLICATES = {
    9: 3,
    35: 26,
    36: 5,
    37: 3,
    38: 19,
    39: 8,
    40: 17,
    42: 11,
    43: 19,
    44: 16,
    45: 13,
    46: 27,
    47: 33,
    48: 18,
    49: 8,
}


def seconds(frame, fps):
    return round(frame / fps, 3)


def main():
    source = ARCHIVE_ROOT / ASSET
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit("Source video changed; review the held states before reusing the duplicate map.")

    capture = cv2.VideoCapture(str(source))
    fps = capture.get(cv2.CAP_PROP_FPS)
    analyzed = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        analyzed.append(cv2.resize(frame, ANALYSIS_SIZE, interpolation=cv2.INTER_AREA))
    capture.release()
    if not analyzed or fps <= 0:
        raise SystemExit("Could not decode the video.")

    samples = np.stack(analyzed).astype(np.int16)
    changes = np.abs(samples[1:] - samples[:-1]).mean(axis=(1, 2, 3))
    starts = [0] + [index for index, difference in enumerate(changes, 1) if difference > STATE_CHANGE_MAE]
    if len(starts) != 50 or len(analyzed) != 160:
        raise SystemExit("Held-state boundaries changed; review them before reusing the duplicate map.")
    ends = starts[1:] + [len(analyzed)]

    output = ARCHIVE_ROOT / "output" / "data" / "experiment-lab" / source.stem
    full_dir, thumb_dir = output / "frames", output / "thumbs"
    full_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    kept_runs = [index for index in range(len(starts)) if index not in REVIEWED_DUPLICATES]
    identifiers = {run: f"{position:02d}" for position, run in enumerate(kept_runs, 1)}
    manifest = {
        "asset": ASSET,
        "author": "demo.studio",
        "sourceSha256": digest,
        "fps": fps,
        "totalFrames": len(analyzed),
        "durationSeconds": seconds(len(analyzed), fps),
        "heldStates": len(starts),
        "uniqueSlides": len(kept_runs),
        "method": "Every decoded frame was compared at 180×320 RGB resolution. Mean absolute pixel change >1 separated held states. Near matches were checked on contact sheets; reviewed repeats are grouped with their first occurrence.",
        "frames": [],
    }

    for run in kept_runs:
        related = [run] + [index for index, original in REVIEWED_DUPLICATES.items() if original == run]
        occurrences = [
            {
                "startFrame": starts[index],
                "endFrame": ends[index],
                "startSeconds": seconds(starts[index], fps),
                "endSeconds": seconds(ends[index], fps),
                "durationSeconds": seconds(ends[index] - starts[index], fps),
            }
            for index in sorted(related)
        ]
        frame_index = starts[run] + (ends[run] - starts[run] - 1) // 2
        manifest["frames"].append(
            {
                "id": identifiers[run],
                "sourceFrame": frame_index,
                "timeSeconds": seconds(frame_index, fps),
                "totalVisibleSeconds": round(sum(item["durationSeconds"] for item in occurrences), 3),
                "occurrences": occurrences,
            }
        )

    desired = {item["sourceFrame"]: item["id"] for item in manifest["frames"]}
    capture = cv2.VideoCapture(str(source))
    for index in range(len(analyzed)):
        ok, frame = capture.read()
        if not ok:
            raise SystemExit(f"Could not decode source frame {index} on the second pass.")
        identifier = desired.get(index)
        if identifier is None:
            continue
        cv2.imwrite(str(full_dir / f"{identifier}.png"), frame)
        thumb = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        thumb.thumbnail((360, 640))
        thumb.save(thumb_dir / f"{identifier}.jpg", quality=89, optimize=True)
    capture.release()

    cell_width, cell_height, columns = 180, 342, 7
    rows = (len(manifest["frames"]) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), (237, 234, 228))
    draw = ImageDraw.Draw(sheet)
    for position, item in enumerate(manifest["frames"]):
        x, y = position % columns * cell_width, position // columns * cell_height
        thumb = Image.open(thumb_dir / f"{item['id']}.jpg")
        thumb.thumbnail((cell_width, 320))
        sheet.paste(thumb, (x, y))
        draw.text((x + 4, y + 322), f"{item['id']}  {item['timeSeconds']:.2f}s", fill=(25, 25, 25))
    sheet.save(output / "contact-sheet.jpg", quality=92)

    serialized = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    (output / "manifest.json").write_text(serialized)
    (PROJECT_ROOT / "content" / "experiment-lab.json").write_text(serialized)
    print(f"Decoded {len(analyzed)} frames into {len(starts)} held states; kept {len(kept_runs)} unique slides.")
    print(output)


if __name__ == "__main__":
    main()
