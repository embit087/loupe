"""Generate the fictional sample collection that ships with the repository.

Usage:
  python3 scripts/generate-sample-data.py

Writes every creator, post, Exp Lab study, study dimension and measure under content/, the matching
placeholder media under ../sample-archive/ (posters, videos, extracted frames), and the seeded
transcript in ../api/migrations/0010_lab_analysis.sql. Every account, caption and count is invented.
Requires Pillow and ffmpeg. The output is deterministic, so rerunning it only changes what you edited.
"""

import colorsys
import hashlib
import json
import math
import random
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

WEB = Path(__file__).resolve().parents[1]
CONTENT = WEB / "content"
ARCHIVE = WEB.parent / "sample-archive"
MIGRATION = WEB.parent / "api" / "migrations" / "0010_lab_analysis.sql"
LAB = ARCHIVE / "output" / "data" / "experiment-lab"
CAPTURED = "2026-10-01"
FONT_PATHS = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
rng = random.Random(2026)


def font(size):
    for candidate in FONT_PATHS:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size=size)


# --- Accounts ------------------------------------------------------------------------------------
# hue drives every image an account gets, so a creator's posts read as one body of work.
DESIGN = [
    ("demo.studio", "Demo Studio", 0.0, "mono"),
    ("north.grid", "North Grid", 0.58, "grid"),
    ("paper.form", "Paper Form", 0.08, "paper"),
    ("demo.type", "Demo Type", 0.0, "type"),
    ("low.signal", "Low Signal", 0.75, "signal"),
    ("mono.press", "Mono Press", 0.97, "press"),
]
KOL = [
    ("demo.trail", "Demo Trail", 0.33, 128_400),
    ("ridge.pack", "Ridge Pack", 0.10, 64_900),
    ("camp.layer", "Camp Layer", 0.52, 41_250),
    ("summit.kit", "Summit Kit", 0.02, 22_800),
]
DESIGN_CAPTIONS = [
    "A new identity system, shown across print, screen and objects.",
    "Poster series for a spring lecture programme.",
    "Type specimen: one family, three widths, a lot of patience.",
    "Packaging study — flat colour, tiny labels, one mark.",
    "Campaign stills from the autumn launch.",
    "Grid experiments from the sketchbook this week.",
    "Wayfinding concepts for a small museum.",
    "Behind the scenes on a motion identity.",
]
KOL_CAPTIONS = [
    "Three layers I bring on every shoulder-season hike.",
    "Pack list for a two-night trip, under 9 kg base weight.",
    "Testing a new rain shell in proper weather.",
    "What I wish I knew before buying my first tent.",
    "Trail-run vs hiking shoe: when each one makes sense.",
    "Five small things that make camp mornings easier.",
]
CATEGORIES = ["collage", "identity", "campaign"]


def code(prefix, number):
    return f"{prefix}{number:05d}"


def swatch(hue, lightness, saturation):
    r, g, b = colorsys.hls_to_rgb(hue % 1, lightness, saturation)
    return int(r * 255), int(g * 255), int(b * 255)


def draw_card(size, hue, style, title, subtitle, index=0, mono=False):
    """One flat, poster-like placeholder: background, a mark, and two lines of label text."""
    width, height = size
    sat = 0 if mono else 0.55
    background = swatch(hue + index * 0.03, 0.9 - (index % 4) * 0.18, sat * 0.6)
    ink = (16, 16, 16) if sum(background) > 380 else (245, 245, 240)
    image = Image.new("RGB", size, background)
    draw = ImageDraw.Draw(image)
    cx, cy, unit = width / 2, height * 0.45, min(width, height)
    accent = swatch(hue + 0.5 if not mono else 0, 0.45, sat)
    shape = (index + len(title)) % 4
    if style in ("grid", "paper"):
        for x in range(0, width, max(12, width // 12)):
            draw.line([(x, 0), (x, height)], fill=swatch(hue, 0.75, sat * 0.4), width=1)
        for y in range(0, height, max(12, width // 12)):
            draw.line([(0, y), (width, y)], fill=swatch(hue, 0.75, sat * 0.4), width=1)
    if shape == 0:
        draw.ellipse([cx - unit * 0.22, cy - unit * 0.22, cx + unit * 0.22, cy + unit * 0.22], fill=ink if mono else accent)
    elif shape == 1:
        draw.rectangle([cx - unit * 0.25, cy - unit * 0.12, cx + unit * 0.25, cy + unit * 0.12], fill=ink if mono else accent)
    elif shape == 2:
        draw.polygon([(cx, cy - unit * 0.25), (cx + unit * 0.25, cy + unit * 0.18), (cx - unit * 0.25, cy + unit * 0.18)], fill=ink if mono else accent)
    else:
        for step in range(2):
            x0 = cx - unit * 0.2 + step * unit * 0.16
            draw.line([(x0, cy - unit * 0.15), (x0 + unit * 0.12, cy), (x0, cy + unit * 0.15)], fill=ink, width=max(4, int(unit * 0.04)))
    draw.text((width * 0.07, height * 0.82), title, font=font(max(12, int(unit * 0.07))), fill=ink)
    draw.text((width * 0.07, height * 0.9), subtitle, font=font(max(9, int(unit * 0.035))), fill=ink)
    return image


def save_jpeg(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "JPEG", quality=82, optimize=True)


def save_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def encode_video(slides, fps, path):
    """slides: [(image, frame_count)] → an H.264 MP4 at fps."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        number = 0
        for image, count in slides:
            for _ in range(count):
                image.save(Path(temp) / f"{number:05d}.png")
                number += 1
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(fps), "-i", f"{temp}/%05d.png",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-movflags", "+faststart", str(path)], check=True)
    return number


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --- Posts ---------------------------------------------------------------------------------------
def date_for(index):
    month = 9 - index // 4
    return f"2026{month:02d}{28 - (index % 4) * 6:02d}"


def design_posts():
    posts, authors = [], []
    for account_index, (handle, name, hue, style) in enumerate(DESIGN):
        mono = style in ("mono", "type")
        total = 6 if handle == "demo.studio" else 4
        for index in range(total):
            number = account_index * 100 + index + 1
            post_code = code("DEMO", number)
            date = "20260517" if handle == "demo.studio" and index == 0 else date_for(index + account_index)
            kind = "video" if handle == "demo.studio" else ["carousel", "photo", "video", "carousel"][index % 4]
            if handle == "paper.form" and index == 0:
                kind = "carousel"
            asset = f"{date}_{post_code}.mp4" if handle == "demo.studio" else f"{post_code}.{ {'video': 'mp4', 'photo': 'jpg', 'carousel': 'carousel'}[kind] }"
            poster_size = (360, 640) if kind == "video" else (400, 500)
            poster = draw_card(poster_size, hue, style, f"@{handle}", f"{kind} · {date[:4]}.{date[4:6]}.{date[6:]}", index, mono)
            poster_path = f"posters/{handle}/{post_code}.jpg"
            save_jpeg(poster, ARCHIVE / poster_path)
            video_path = ""
            if kind == "video" and not (handle == "demo.studio" and index == 0):
                video_path = f"videos/{handle}/{post_code}.mp4"
                frames = [(draw_card(poster_size, hue, style, f"@{handle}", f"scene {step + 1}", index + step, mono), 12) for step in range(3)]
                encode_video(frames, 12, ARCHIVE / video_path)
            seed_video = handle == "demo.studio"
            posts.append({
                "author": handle, "asset": asset, "code": post_code, "kind": kind, "date": date,
                "caption": "" if seed_video else DESIGN_CAPTIONS[(number * 3) % len(DESIGN_CAPTIONS)],
                "category": CATEGORIES[index % 3] if seed_video else "",
                "posterPath": poster_path, "videoPath": video_path, "videoUrl": "", "imageUrl": "",
                "permalink": f"https://example.com/posts/{post_code}",
                "likeCount": None if seed_video else rng.randint(40, 2400),
                "commentCount": None if seed_video else rng.randint(0, 80),
                "carouselCount": 5 if kind == "carousel" else 0,
            })
        authors.append({"username": handle, "name": name, "count": total})
    return authors, posts


def kol_posts():
    posts, authors = [], []
    for account_index, (handle, name, hue, followers) in enumerate(KOL):
        total = 6 if handle == "demo.trail" else 4
        for index in range(total):
            number = 100 + account_index * 20 + index + 1
            post_code = code("DEMO", number)
            kind = "video" if index % 3 != 2 else "carousel"
            asset = f"{post_code}.{'mp4' if kind == 'video' else 'carousel'}"
            date = date_for(index + account_index)
            size = (360, 640) if kind == "video" else (400, 500)
            poster_path = f"posters/{handle}/{post_code}.jpg"
            save_jpeg(draw_card(size, hue, "kol", f"@{handle}", f"{kind} · {date[:4]}.{date[4:6]}.{date[6:]}", index), ARCHIVE / poster_path)
            video_path = ""
            if kind == "video" and not (handle == "demo.trail" and index == 0):
                video_path = f"videos/{handle}/{post_code}.mp4"
                encode_video([(draw_card(size, hue, "kol", f"@{handle}", f"scene {step + 1}", index + step), 12) for step in range(3)], 12, ARCHIVE / video_path)
            hidden = handle == "summit.kit" and index == 1
            likes = rng.randint(int(followers * 0.004), int(followers * 0.03))
            posts.append({
                "author": handle, "asset": asset, "code": post_code, "kind": kind, "date": date,
                "caption": KOL_CAPTIONS[(number + index) % len(KOL_CAPTIONS)], "category": "",
                "posterPath": poster_path, "videoPath": video_path, "videoUrl": "", "imageUrl": "",
                "permalink": f"https://example.com/posts/{post_code}",
                "likeCount": None if hidden else likes, "commentCount": rng.randint(2, 140),
                "playCount": None if kind != "video" or hidden else likes * rng.randint(12, 30),
                "countsHidden": hidden, "carouselCount": 4 if kind == "carousel" else 0,
                "shareCount": rng.randint(5, 400) if handle == "demo.trail" else None,
                "source": "Sample data", "countsSource": "Sample data", "countsAt": CAPTURED,
            })
        authors.append({"username": handle, "name": name, "count": total, "followers": followers})
    return authors, posts


# --- Studies -------------------------------------------------------------------------------------
def write_study_frames(stem, slides):
    """slides: [(id, image)] → frames/<id>.png and thumbs/<id>.jpg under the study folder."""
    folder = LAB / stem
    for frame_id, image in slides:
        save_png(image, folder / "frames" / f"{frame_id}.png")
        thumb = image.copy()
        thumb.thumbnail((240, 240))
        save_jpeg(thumb, folder / "thumbs" / f"{frame_id}.jpg")


def video_study(stem, slides, sequence, fps):
    """sequence: [(slide index, frames held)] in playback order → frames + held-state occurrences."""
    frames = {}
    cursor = 0
    for slide, hold in sequence:
        start, end = cursor, cursor + hold
        entry = frames.setdefault(slide, {"id": f"{slide + 1:02d}", "sourceFrame": start, "timeSeconds": round(start / fps, 3), "totalVisibleSeconds": 0, "occurrences": []})
        entry["occurrences"].append({"startFrame": start, "endFrame": end, "startSeconds": round(start / fps, 3), "endSeconds": round(end / fps, 3), "durationSeconds": round(hold / fps, 3)})
        entry["totalVisibleSeconds"] = round(entry["totalVisibleSeconds"] + hold / fps, 3)
        cursor = end
    write_study_frames(stem, [(f"{index + 1:02d}", image) for index, image in enumerate(slides)])
    return [frames[index] for index in sorted(frames)], cursor


def featured_study():
    """The Design seed's frame study: a quick-cut identity reel with repeats."""
    stem, asset, fps = "20260517_DEMO00001", "20260517_DEMO00001.mp4", 25
    labels = ["IDENTITY_SYSTEM", "APP ICON", "POSTER A2", "TOTE BAG", "BUSINESS CARD", "SIGNAGE", "PACKAGING", "END CARD"]
    slides = [draw_card((540, 960), 0, "mono", label, f"slide {index + 1:02d} / demo.studio", index, mono=True) for index, label in enumerate(labels)]
    sequence = [(0, 10), (1, 2), (2, 2), (1, 2), (3, 2), (4, 2), (2, 2), (5, 2), (6, 4), (4, 4), (7, 20)]
    frames, total = video_study(stem, slides, sequence, fps)
    video = ARCHIVE / "videos" / "demo.studio" / asset
    encode_video([(slides[slide], hold) for slide, hold in sequence], fps, video)
    return {
        "asset": asset, "author": "demo.studio", "sourceSha256": sha256(video), "fps": float(fps),
        "totalFrames": total, "durationSeconds": round(total / fps, 3), "heldStates": len(sequence), "uniqueSlides": len(slides),
        "method": "Sample study: every decoded frame was compared to the previous one; repeats are grouped with their first appearance.",
        "frames": frames,
    }, video


TRAIL_SCENES = [
    ("Opening guide", "Presenter on a ridge with three jackets laid out.", ["LAYERING 101"], "Three layers, one simple rule: you should be a little cold when you start walking."),
    ("Base layer", "Close-up of a thin merino top.", ["BASE", "merino 150"], "The base layer moves sweat. Wool or synthetic, never cotton."),
    ("Mid layer", "Fleece held up against the light.", ["MID", "grid fleece"], "The mid layer traps warmth. A grid fleece breathes on the climb."),
    ("Shell", "Rain shell zipped up in wind.", ["SHELL", "2.5 layer"], "The shell blocks wind and rain. Keep it in the top of your pack."),
    ("Recap", "All three layers stacked on a rock.", ["BASE + MID + SHELL"], "Add and remove layers before you overheat, not after."),
]


def trail_study():
    stem, asset, fps = "DEMO00101", "DEMO00101.mp4", 12
    slides = [draw_card((360, 640), 0.33, "kol", scene[2][0], scene[0], index) for index, scene in enumerate(TRAIL_SCENES)]
    sequence = [(index, 36) for index in range(len(slides))]
    frames, total = video_study(stem, slides, sequence, fps)
    source = LAB / stem / "source" / "source.mp4"
    encode_video([(slides[slide], hold) for slide, hold in sequence], fps, source)
    scenes, transcript, ocr = [], [], []
    for index, (title, visual, on_screen, narration) in enumerate(TRAIL_SCENES):
        start, end = index * 3.0, (index + 1) * 3.0
        scenes.append({"frameId": f"{index + 1:02d}", "startSeconds": start, "endSeconds": end, "title": title, "visual": visual, "onScreen": on_screen, "narration": narration})
        transcript.append({"startSeconds": start, "endSeconds": end, "text": narration})
        ocr += [{"timeSeconds": start + offset, "strings": on_screen} for offset in (0.0, 1.0, 2.0)]
    return {
        "asset": asset, "author": "demo.trail", "kind": "video",
        "sourceFile": str(source.relative_to(ARCHIVE)), "sourceSha256": [sha256(source)],
        "feed": "sample", "fps": float(fps), "width": 360, "height": 640,
        "totalFrames": total, "durationSeconds": round(total / fps, 3), "heldStates": len(sequence), "uniqueSlides": len(slides),
        "segmentation": "visual scenes",
        "method": "Sample study: one settled moment per scene, with an invented transcript and on-screen text.",
        "frames": frames,
        "analysis": {
            "title": "Layering guide for shoulder-season hikes",
            "summary": "Demo Trail explains a three-layer system — base, mid and shell — one garment per scene, and ends on a recap of when to add or remove each layer.",
            "frameSampleCount": len(ocr), "ocrIntervalSeconds": 1.0,
            "audioMethod": "Sample transcript written for the demo; no audio was analysed.",
            "caption": "Three layers I bring on every shoulder-season hike.",
            "scenes": scenes, "transcript": transcript, "ocrSamples": ocr,
        },
    }


def carousel_study():
    stem, asset = "DEMO00201", "DEMO00201.carousel"
    labels = ["Aa", "Bb", "Rr", "Gg", "Index"]
    items = [draw_card((800, 1000), 0.08, "paper", label, f"specimen {index + 1:02d} / paper.form", index) for index, label in enumerate(labels)]
    write_study_frames(stem, [(f"{index + 1:02d}", image) for index, image in enumerate(items)])
    hashes = [sha256(LAB / stem / "frames" / f"{index + 1:02d}.png") for index in range(len(items))]
    return {
        "asset": asset, "author": "paper.form", "kind": "carousel", "sourceFile": None, "sourceSha256": hashes,
        "feed": "sample", "fps": 0, "width": 800, "height": 1000, "totalFrames": len(items), "durationSeconds": 0,
        "heldStates": len(items), "uniqueSlides": len(items), "segmentation": "items",
        "method": "Sample study: each carousel item is one slide.",
        "frames": [{"id": f"{index + 1:02d}", "sourceFrame": index, "timeSeconds": 0, "totalVisibleSeconds": 0, "occurrences": []} for index in range(len(items))],
    }


# --- Measures and dimensions ---------------------------------------------------------------------
def measure_frame(path):
    image = Image.open(path).convert("RGB")
    small = image.resize((180, int(180 * image.height / image.width)))
    grey = small.convert("L")
    stat = ImageStat.Stat(grey)
    hsv = ImageStat.Stat(small.convert("HSV"))
    pixels = list(small.getdata())
    rg = [r - g for r, g, _ in pixels]
    yb = [(r + g) / 2 - b for r, g, b in pixels]
    mean = lambda values: sum(values) / len(values)
    std = lambda values: math.sqrt(mean([(value - mean(values)) ** 2 for value in values]))
    colourfulness = math.sqrt(std(rg) ** 2 + std(yb) ** 2) + 0.3 * math.sqrt(mean(rg) ** 2 + mean(yb) ** 2)
    edges = ImageStat.Stat(grey.filter(ImageFilter.FIND_EDGES))
    quantised = small.quantize(colors=4)
    palette = quantised.getpalette()[:12]
    counts = sorted(quantised.getcolors(), reverse=True)
    colours = [{"hex": "#%02x%02x%02x" % tuple(palette[index * 3:index * 3 + 3]), "share": round(count / len(pixels), 3)} for count, index in counts]
    return {
        "brightness": round(stat.mean[0] / 255, 3), "contrast": round(stat.stddev[0] / 255, 3),
        "saturation": round(hsv.mean[1] / 255, 3), "colourfulness": round(colourfulness, 3),
        "sharpness": round(edges.var[0], 1), "colours": colours,
    }


def measures(study):
    stem = Path(study["asset"]).stem
    frames = [{"id": frame["id"], **measure_frame(LAB / stem / "frames" / f"{frame['id']}.png")} for frame in study["frames"]]
    thirds = [frames[i * len(frames) // 3:(i + 1) * len(frames) // 3] or frames for i in range(3)]
    palette = {}
    for frame in frames:
        for colour in frame["colours"]:
            palette[colour["hex"]] = palette.get(colour["hex"], 0) + colour["share"] / len(frames)
    avg = lambda key: round(sum(frame[key] for frame in frames) / len(frames), 3)
    return {
        "author": study["author"], "asset": study["asset"], "method": "Pillow on the extracted frames, in viewing order (sample data).",
        "summary": {
            "brightness": avg("brightness"), "brightnessArc": [round(sum(f["brightness"] for f in part) / len(part), 3) for part in thirds],
            "contrast": avg("contrast"), "saturation": avg("saturation"), "colourfulness": avg("colourfulness"),
            "monochrome": avg("saturation") < 0.05, "sharpness": round(sum(f["sharpness"] for f in frames) / len(frames), 1),
            "palette": [{"hex": hex_, "weight": round(weight, 3)} for hex_, weight in sorted(palette.items(), key=lambda item: -item[1])[:6]],
        },
        "frames": frames,
    }


# English value → Traditional Chinese, so the judged values read naturally in the default locale.
FEATURED_VALUES = {
    "transitions": ("Hard cuts only; no dissolves or wipes", "只有硬切，沒有溶接或劃接", "high"),
    "motionInFrame": ("None: every slide is a still; movement comes from the cutting", "無：每張畫面都是靜態圖，動感來自剪接", "high"),
    "texture": ("Flat digital colour, no grain", "平塗數位色彩，沒有顆粒", "high"),
    "markPlacement": ("One mark centred at roughly a fifth of the frame width", "單一標誌置中，約佔畫面寬度五分之一", "medium"),
    "negativeSpace": ("Generous negative space around a single central mark", "單一置中標誌周圍留有大量留白", "medium"),
    "framing": ("Straight-on, centred compositions", "正面、置中的構圖", "high"),
    "typeFamilies": ("One bold grotesk for every label", "所有標籤都使用同一款粗體無襯線字", "medium"),
    "typeSetting": ("Small uppercase labels with underscores, bottom left", "左下角的小型大寫標籤，以底線連接", "medium"),
    "motif": ("One geometric mark repeated across every application", "同一個幾何標誌在每個應用中重複出現", "high"),
    "contexts": ("App icon, poster, tote bag, business card, signage, packaging", "App 圖示、海報、托特包、名片、指標與包裝", "high"),
    "photography": ("None: flat illustrated mockups", "無：平面插畫式樣機", "high"),
    "audio": ("Not analysed", "未分析", "low"),
    "genre": ("Brand identity showcase reel (quick-cut mockup montage)", "品牌識別展示短片（快速剪接的樣機蒙太奇）", "high"),
    "communication": ("A fast barrage proves the mark works everywhere; the long end card lets it land", "快速連發證明標誌適用於各種場合，最後停留較久的結尾卡讓它被記住", "medium"),
    "voice": ("Precise · restrained · confident", "精準 · 克制 · 自信", "medium"),
    "references": ("Flash-cut identity reels", "快閃剪接的識別展示短片", "medium"),
    "relevance": ("Shows how one mark carries across many surfaces", "示範單一標誌如何延伸到多種載體", "medium"),
    "limits": ("Sample data: values were written for the demo, not measured from a real post", "範例資料：數值為示範而撰寫，並非從真實貼文量測", "high"),
}
CAROUSEL_VALUES = {
    "transitions": ("Not applicable: a carousel viewed swipe by swipe", "不適用：以滑動逐張查看的輪播", "high"),
    "motionInFrame": ("None: still images", "無：靜態圖像", "high"),
    "texture": ("Warm paper tone with a faint construction grid", "暖色紙張色調，帶有淡淡的構圖格線", "medium"),
    "markPlacement": ("One glyph pair centred on each sheet", "每張頁面中央放一組字形", "medium"),
    "negativeSpace": ("Working-sheet grid with wide margins", "寬邊距的工作用紙格線", "medium"),
    "framing": ("Flat, front-on specimen sheets", "平放、正面拍攝的樣本頁", "high"),
    "typeFamilies": ("One bold grotesk shown in several glyphs", "以數個字形呈現同一款粗體無襯線字", "medium"),
    "typeSetting": ("Large glyph pair, small caption line underneath", "大型字形組合，下方一行小字說明", "medium"),
    "motif": ("Letter pairs studied one per sheet", "每頁研究一組字母", "high"),
    "contexts": ("Type specimen sheets", "字體樣本頁", "high"),
    "photography": ("None", "無", "high"),
    "audio": ("None (image carousel)", "無（圖片輪播）", "high"),
    "genre": ("Type specimen carousel", "字體樣本輪播", "high"),
    "communication": ("Sheet by sheet, the family is shown one glyph pair at a time", "逐頁一次呈現一組字形，介紹整個字族", "medium"),
    "voice": ("Calm · methodical · craft-proud", "沉穩 · 有條理 · 引以為傲的工藝", "medium"),
    "references": ("Designers' process posts and specimen sheets", "設計師的流程貼文與字體樣本頁", "medium"),
    "relevance": ("A clear model for presenting a typeface on social", "在社群上呈現字體的清楚範例", "medium"),
    "limits": ("Sample data: values were written for the demo, not measured from a real post", "範例資料：數值為示範而撰寫，並非從真實貼文量測", "high"),
}
GENERATION = {
    "demo.studio": {"keep": ["strict monochrome", "one mark in every frame", "hard cuts held for 2 frames", "a long final hold"],
                    "vary": ["the mockup objects", "the label wording"], "avoid": ["colour", "dissolves", "more than one logo"]},
    "paper.form": {"keep": ["warm paper tone", "one glyph pair per sheet", "small caption line"],
                   "vary": ["the letters shown", "the grid density"], "avoid": ["photography", "busy layouts"]},
}


def dimensions(study, values):
    return {
        "author": study["author"], "asset": study["asset"], "assessedAt": CAPTURED,
        "assessedBy": "Sample data, written for the demo",
        "values": {key: {"value": english, "confidence": confidence} for key, (english, _, confidence) in values.items()},
        **GENERATION[study["author"]],
    }


def module_name(author, asset):
    return re.sub(r"[^A-Za-z0-9]", "_", f"{author}__{Path(asset).stem}")


def write_index(folder, records, header, export, multiline=False):
    lines = [header, ""]
    names = []
    for record in records:
        name = module_name(record["author"], record["asset"])
        names.append(name)
        lines.append(f'import {name} from "./{record["author"]}__{Path(record["asset"]).stem}.json";')
    lines += ["", f"export const {export} = [{', '.join(names)}];", ""]
    (folder / "index.ts").write_text("\n".join(lines))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n")


def reset(folder):
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)


def sql(value):
    return "'" + str(value).replace("'", "''") + "'"


def write_migration(study):
    text = MIGRATION.read_text()
    head = text.split("-- Seeded from", 1)[0]
    analysis = study["analysis"]
    lines = [f"-- Seeded from web/content/lab-studies/{study['author']}__{Path(study['asset']).stem}.json (sample data).",
             "INSERT INTO lab_analysis_sources (author, asset, audio_method, ocr_method, ocr_interval_seconds)",
             f"VALUES ({sql(study['author'])}, {sql(study['asset'])}, {sql(analysis['audioMethod'])}, {sql('Sample on-screen text written for the demo.')}, {analysis['ocrIntervalSeconds']});", ""]
    for index, passage in enumerate(analysis["transcript"]):
        lines += ["INSERT INTO lab_transcript_passages (author, asset, passage_index, start_seconds, end_seconds, text)",
                  f"VALUES ({sql(study['author'])}, {sql(study['asset'])}, {index}, {passage['startSeconds']}, {passage['endSeconds']}, {sql(passage['text'])});", ""]
    for sample in analysis["ocrSamples"]:
        lines += ["INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)",
                  f"VALUES ({sql(study['author'])}, {sql(study['asset'])}, {sample['timeSeconds']}, {sql(json.dumps(sample['strings']))});", ""]
    MIGRATION.write_text(head + "\n".join(lines))


def main():
    reset(ARCHIVE)
    design_authors, design = design_posts()
    kol_authors, kol = kol_posts()
    featured, featured_video = featured_study()
    for post in design:
        if post["author"] == "demo.studio" and post["asset"] == featured["asset"]:
            post["videoPath"] = str(featured_video.relative_to(ARCHIVE))
    write_json(CONTENT / "atlas.json", {"authors": design_authors, "posts": design})
    write_json(CONTENT / "kol.json", {"captures": [{"source": "Sample data", "date": CAPTURED}], "authors": kol_authors, "posts": kol})
    write_json(CONTENT / "experiment-lab.json", featured)

    built = [trail_study(), carousel_study()]
    reset(CONTENT / "lab-studies")
    for study in built:
        write_json(CONTENT / "lab-studies" / f"{study['author']}__{Path(study['asset']).stem}.json", study)
    write_index(CONTENT / "lab-studies", built, "// Generated by scripts/build-lab-studies.py or scripts/generate-sample-data.py. Do not edit.", "builtStudies")

    featured_record = {**featured, "kind": "video"}
    reset(CONTENT / "study-measures")
    measured = [measures(study) for study in [featured_record, *built]]
    for record in measured:
        write_json(CONTENT / "study-measures" / f"{record['author']}__{Path(record['asset']).stem}.json", record)
    write_index(CONTENT / "study-measures", measured, "// Generated by scripts/measure-study-frames.py or scripts/generate-sample-data.py. Do not edit.", "studyMeasures")

    reset(CONTENT / "study-dimensions")
    judged = [dimensions(featured_record, FEATURED_VALUES), dimensions(built[1], CAROUSEL_VALUES)]
    for record in judged:
        write_json(CONTENT / "study-dimensions" / f"{record['author']}__{Path(record['asset']).stem}.json", record)
    write_index(CONTENT / "study-dimensions", judged, "// Written (judged) study-dimension records, one per studied post. Add each new file here.", "studyAssessments")

    translations = {english: chinese for values in (FEATURED_VALUES, CAROUSEL_VALUES) for english, chinese, _ in values.values()}
    write_json(CONTENT / "study-dimension-values-zh.json", translations)
    write_json(CONTENT / "media-cache.json", {"posts": {}, "frames": {}, "visual": {}})
    write_json(CONTENT / "study-references.json", {})
    write_json(CONTENT / "study-prompts-zh.json", {})
    write_json(CONTENT / "study-prompts-en-hashes.json", {})
    write_migration(built[0])
    total = sum(path.stat().st_size for path in ARCHIVE.rglob("*") if path.is_file())
    print(f"{len(design)} design posts, {len(kol)} KOL posts, {1 + len(built)} studies, sample archive {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
