"""Measure the extracted frames of every Exp Lab study for the study-dimensions record.

Usage:
  python3 scripts/measure-study-frames.py

Requires OpenCV and NumPy. For each study with extracted frames it records, per frame and in
viewing order: brightness, contrast, saturation, colourfulness, sharpness and dominant colours.
Results go to content/study-measures/<author>__<stem>.json plus a generated index.ts.
These are the measured colour dimensions; judged ones are written in content/study-dimensions.
"""

import json
import os
import re
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = Path(os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT_ROOT.parent / "sample-archive")).resolve()
OUTPUT = PROJECT_ROOT / "content" / "study-measures"


def studies():
    featured = json.loads((PROJECT_ROOT / "content" / "experiment-lab.json").read_text())
    yield featured
    for path in sorted((PROJECT_ROOT / "content" / "lab-studies").glob("*.json")):
        yield json.loads(path.read_text())


def dominant_colours(image, count=4):
    pixels = cv2.resize(image, (64, 64), interpolation=cv2.INTER_AREA).reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centres = cv2.kmeans(pixels, count, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    shares = np.bincount(labels.flatten(), minlength=count) / len(labels)
    order = np.argsort(-shares)
    return [{"hex": "#%02x%02x%02x" % tuple(int(v) for v in centres[i][::-1]), "share": round(float(shares[i]), 3)} for i in order]


def measure(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    b, g, r = [channel.astype(np.float32) for channel in cv2.split(image)]
    rg, yb = r - g, 0.5 * (r + g) - b
    # Hasler & Suesstrunk colourfulness: under ~10 reads as monochrome.
    colourfulness = float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))
    return {
        "brightness": round(float(gray.mean()) / 255, 3),
        "contrast": round(float(gray.std()) / 128, 3),
        "saturation": round(float(hsv[..., 1].mean()) / 255, 3),
        "colourfulness": round(colourfulness, 1),
        "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
        "colours": dominant_colours(image),
    }


def summary(frames):
    def mean(key, items):
        return round(float(np.mean([item[key] for item in items])), 3) if items else 0
    third = max(1, len(frames) // 3)
    parts = [frames[:third], frames[third:len(frames) - third] or frames[:third], frames[len(frames) - third:]]
    # Merge colours closer than a small RGB distance, so near-identical blacks count as one.
    palette = []
    for frame in frames:
        for colour in frame["colours"]:
            rgb = np.array([int(colour["hex"][i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
            match = next((entry for entry in palette if np.linalg.norm(entry[0] - rgb) < 40), None)
            if match is None:
                palette.append([rgb, colour["share"]])
            else:
                total = match[1] + colour["share"]
                match[0] = (match[0] * match[1] + rgb * colour["share"]) / total
                match[1] = total
    top = [("#%02x%02x%02x" % tuple(int(round(v)) for v in rgb), weight) for rgb, weight in sorted(palette, key=lambda item: -item[1])[:6]]
    colourfulness = mean("colourfulness", frames)
    return {
        "brightness": mean("brightness", frames),
        "brightnessArc": [mean("brightness", part) for part in parts],
        "contrast": mean("contrast", frames),
        "saturation": mean("saturation", frames),
        "colourfulness": colourfulness,
        "monochrome": colourfulness < 10,
        "sharpness": round(float(np.median([frame["sharpness"] for frame in frames])), 1),
        "palette": [{"hex": hex_value, "weight": round(weight / len(frames), 3)} for hex_value, weight in top],
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    written = []
    for study in studies():
        stem = Path(study["asset"]).stem
        folder = ARCHIVE_ROOT / "output" / "data" / "experiment-lab" / stem / "frames"
        if not folder.is_dir() or not study.get("frames"):
            continue
        # Viewing order: by first appearance for videos, posting order for stills.
        ordered = sorted(study["frames"], key=lambda frame: (frame["occurrences"][0]["startFrame"] if frame.get("occurrences") else frame["sourceFrame"]))
        frames = []
        for frame in ordered:
            image = cv2.imread(str(folder / f"{frame['id']}.png"))
            if image is None:
                continue
            frames.append({"id": frame["id"], **measure(image)})
        if not frames:
            continue
        record = {"author": study["author"], "asset": study["asset"], "method": "OpenCV on the extracted frames, in viewing order.", "summary": summary(frames), "frames": frames}
        name = f"{study['author']}__{stem}"
        (OUTPUT / f"{name}.json").write_text(json.dumps(record, indent=1) + "\n")
        written.append(name)
        print(f"{study['author']}/{study['asset']}: {len(frames)} frames measured")
    names = sorted(written)
    identifiers = [re.sub(r"\W", "_", name) for name in names]
    lines = ["// Generated by scripts/measure-study-frames.py. Do not edit.", ""]
    lines += [f'import {ident} from "./{name}.json";' for ident, name in zip(identifiers, names)]
    lines += ["", f"export const studyMeasures = [{', '.join(identifiers)}];", ""]
    (OUTPUT / "index.ts").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
