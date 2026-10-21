"""Build the local Next collection index from the Demo Studio motion atlas."""

import json
import re
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parent / "sample-archive" / "style-atlas.html"
OUTPUT = PROJECT / "content" / "atlas.json"

html = SOURCE.read_text()


def inline_json(name):
    match = re.search(rf"^const {name}=(.*?);$", html, re.M)
    if not match:
        raise RuntimeError(f"Missing {name} in {SOURCE}")
    return json.loads(match.group(1))


local_items = inline_json("items")
candidates = inline_json("candidates")
candidate_media = inline_json("candidateMedia")
authors = [
    {"username": "demo.studio", "name": "Demo Studio", "count": len(local_items)},
    *[
        {
            "username": profile["username"],
            "name": profile["name"] or profile["username"],
            "count": len(candidate_media.get(profile["id"], [])),
        }
        for profile in candidates
    ],
]

posts = []
for item in local_items:
    posts.append(
        {
            "author": "demo.studio",
            "asset": item["file"],
            "code": item["code"],
            "kind": "video",
            "date": item["date"],
            "caption": item.get("caption") or "",
            "category": item.get("cat") or "",
            "posterPath": item["thumb"],
            "videoPath": item["file"],
            "videoUrl": "",
            "imageUrl": "",
            "permalink": f'https://www.instagram.com/p/{item["code"]}/',
            "likeCount": None,
            "commentCount": None,
            "carouselCount": 0,
        }
    )

suffix = {"video": ".mp4", "photo": ".jpg", "carousel": ".carousel"}
for profile in candidates:
    for item in candidate_media.get(profile["id"], []):
        kind = item["kind"]
        posts.append(
            {
                "author": profile["username"],
                "asset": item["code"] + suffix.get(kind, ".post"),
                "code": item["code"],
                "kind": kind,
                "date": item["date"],
                "caption": item.get("caption") or "",
                "category": "",
                "posterPath": item["thumb"],
                "videoPath": "",
                "videoUrl": item.get("videoUrl") or "",
                "imageUrl": item.get("imageFull") or "",
                "permalink": item.get("permalink") or "",
                "likeCount": item.get("likeCount"),
                "commentCount": item.get("commentCount"),
                "carouselCount": item.get("carouselCount") or 0,
            }
        )

posts.sort(key=lambda post: (post["date"], post["author"], post["asset"]), reverse=True)
keys = [(post["author"], post["asset"]) for post in posts]
assert len(authors) == 80
assert len(posts) == len(local_items) + sum(len(items) for items in candidate_media.values())
assert len(set(keys)) == len(keys)
assert all(post["date"].startswith("2026") for post in posts)
assert all(re.fullmatch(r"[A-Za-z0-9._-]+", post["author"]) and re.fullmatch(r"[A-Za-z0-9._-]+", post["asset"]) for post in posts)
assert all(post["kind"] in suffix for post in posts)
assert all((PROJECT.parent / "sample-archive" / post["posterPath"]).is_file() for post in posts)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps({"authors": authors, "posts": posts}, ensure_ascii=False, separators=(",", ":")))
print(f"Wrote {len(posts)} posts from {len(authors)} authors to {OUTPUT}")
