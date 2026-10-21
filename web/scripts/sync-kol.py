"""Build the KOL index from saved RapidAPI and SocialCrawl responses and local previews.

Instagram Looter (RapidAPI) feeds are the base: every account's first feed page.
Saved SocialCrawl post lists (socialcrawl-data/raw/<goal>/, written by
scripts/socialcrawl.py) are merged on top by shortcode:

- a post only SocialCrawl returned is added, and its poster is downloaded once
  into the account's thumbnails folder while the signed URL is still valid;
- a post both returned takes the newer counts and media URLs, plus the fields
  only SocialCrawl reports (shares, video length, pinned, collaborators,
  caption language).

Every post records which response its counts came from and when. No API calls
are made, so a rebuild costs no credits.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parent / "sample-archive"
KOL = SOURCE / "instagram-data" / "kol"
SOCIALCRAWL = SOURCE / "socialcrawl-data" / "raw"
OUTPUT = PROJECT / "content" / "kol.json"
POST_LISTS = {"/v1/instagram/profile/posts", "/v1/instagram/profile/posts/full"}

manifest = json.loads((KOL / "manifest.json").read_text())
authors = []
posts = []
suffix = {1: ".jpg", 2: ".mp4", 8: ".carousel"}
kind = {1: "photo", 2: "video", 8: "carousel"}
sc_kind = {"image": "photo", "photo": "photo", "video": "video", "carousel": "carousel"}
sc_suffix = {"photo": ".jpg", "video": ".mp4", "carousel": ".carousel"}


def shortcode(url: str) -> str:
    match = re.search(r"/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)", url)
    if not match:
        raise RuntimeError(f"No shortcode in {url}")
    return match.group(1)


def socialcrawl_posts() -> dict[str, dict[str, dict]]:
    """username -> shortcode -> the newest saved SocialCrawl record of that post."""
    found: dict[str, dict[str, dict]] = {}
    for meta_path in sorted(SOCIALCRAWL.glob("*/*.meta.json")):
        meta = json.loads(meta_path.read_text())
        if meta.get("endpoint") not in POST_LISTS or meta.get("http_status") != 200:
            continue
        body = json.loads(meta_path.with_name(meta_path.name.replace(".meta.json", ".json")).read_text())
        if not body.get("success"):
            continue
        for item in body["data"]["items"]:
            post = item["post"]
            username = post["author"]["username"]
            code = shortcode(post["url"])
            record = {"post": post, "computed": item.get("computed") or {}, "at": meta["requested_at"], "file": str(meta_path.relative_to(SOURCE))}
            current = found.setdefault(username, {}).get(code)
            if not current or current["at"] < record["at"]:
                found[username][code] = record
    return found


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
    if not body.startswith(b"\xff\xd8"):
        raise RuntimeError(f"Poster for {target.name} is not a JPEG")
    target.write_bytes(body)


def socialcrawl_fields(record: dict) -> dict:
    post, computed = record["post"], record["computed"]
    engagement, content, ext = post["engagement"], post["content"], post["ext"]
    return {
        "shareCount": engagement.get("shares"),
        "durationSeconds": round(content["duration_seconds"], 1) if content.get("duration_seconds") else None,
        "pinned": bool((post.get("flags") or {}).get("pinned")),
        "coauthors": [author["username"] for author in ext.get("coauthors") or []],
        "language": computed.get("language") or "",
        "countsSource": "SocialCrawl",
        "countsAt": record["at"][:10],
    }


def media_urls(content: dict) -> list[str]:
    urls = content.get("media_urls") or []
    return [urls] if isinstance(urls, str) else list(urls)


socialcrawl = socialcrawl_posts()
added = enriched = downloaded = 0

for account in manifest["accounts"]:
    username = account["username"]
    profile = json.loads((KOL / username / "profile.json").read_text())
    if profile.get("username") != username:
        raise RuntimeError(f"Profile mismatch for @{username}")
    followers = profile.get("edge_followed_by", {}).get("count")
    if not isinstance(followers, int):
        raise RuntimeError(f"Missing follower count for @{username}")
    if account["feed_status"] != 200:
        raise RuntimeError(f"Feed unavailable for @{username}")
    feed = json.loads((KOL / account["feed_path"]).read_text())
    feed_meta = json.loads((KOL / account["feed_path"].replace(".json", ".meta.json")).read_text())
    account_posts = []
    for item in feed["items"]:
        media_type = item.get("media_type")
        if media_type not in kind:
            continue
        date = dt.datetime.fromtimestamp(item["taken_at"], dt.timezone.utc).strftime("%Y%m%d")
        if not date.startswith("2026"):
            continue
        code = item["code"]
        images = item.get("image_versions2", {}).get("candidates", [])
        if not images:
            raise RuntimeError(f"Missing image candidates for @{username}/{code}")
        poster = f"instagram-data/kol/{username}/thumbnails/{code}.jpg"
        if not (SOURCE / poster).is_file():
            raise RuntimeError(f"Missing local preview: {poster}")
        videos = item.get("video_versions") or []
        counts_hidden = item.get("like_and_view_counts_disabled") is True
        if media_type == 2 and not videos:
            raise RuntimeError(f"Missing video source for @{username}/{code}")
        account_posts.append(
            {
                "author": username,
                "asset": code + suffix[media_type],
                "code": code,
                "kind": kind[media_type],
                "date": date,
                "caption": (item.get("caption") or {}).get("text") or "",
                "category": "",
                "posterPath": poster,
                "videoPath": "",
                "videoUrl": videos[0]["url"] if videos else "",
                "imageUrl": images[0]["url"],
                "permalink": f"https://www.instagram.com/p/{code}/",
                "likeCount": None if counts_hidden else item.get("like_count"),
                "commentCount": item.get("comment_count"),
                "playCount": None if counts_hidden or media_type != 2 else item.get("play_count"),
                "countsHidden": counts_hidden,
                "carouselCount": len(item.get("carousel_media") or []),
                "shareCount": None,
                "source": "Instagram Looter",
                "countsSource": "Instagram Looter",
                "countsAt": feed_meta["requested_at"][:10],
            }
        )
    if len(account_posts) != account["posts_2026"]:
        raise RuntimeError(f"2026 count changed for @{username}")

    by_code = {post["code"]: post for post in account_posts}
    for code, record in socialcrawl.get(username, {}).items():
        sc = record["post"]
        date = dt.datetime.fromtimestamp(sc["ext"]["published_at_epoch"], dt.timezone.utc).strftime("%Y%m%d")
        if not date.startswith("2026"):
            continue
        media_kind = sc_kind.get(sc["ext"]["media_type"])
        if not media_kind:
            raise RuntimeError(f"Unknown SocialCrawl media type {sc['ext']['media_type']} for @{username}/{code}")
        engagement, content = sc["engagement"], sc["content"]
        urls = media_urls(content)
        image = content.get("thumbnail_url") or (urls[0] if media_kind != "video" and urls else "")
        video = urls[0] if media_kind == "video" and urls else ""
        # SocialCrawl reports hidden counts as null rather than with a flag.
        counts = {
            "likeCount": engagement.get("likes"),
            "commentCount": engagement.get("comments"),
            "playCount": engagement.get("views") if media_kind == "video" else None,
        }
        existing = by_code.get(code)
        if existing:
            if existing["kind"] != media_kind:
                raise RuntimeError(f"@{username}/{code} is a {existing['kind']} in the feed but a {media_kind} in SocialCrawl")
            existing.update({key: value for key, value in counts.items() if value is not None})
            existing["countsHidden"] = existing["countsHidden"] and counts["likeCount"] is None
            existing.update(socialcrawl_fields(record))
            existing["videoUrl"] = video or existing["videoUrl"]
            existing["imageUrl"] = image or existing["imageUrl"]
            enriched += 1
            continue
        poster = f"instagram-data/kol/{username}/thumbnails/{code}.jpg"
        if not (SOURCE / poster).is_file():
            if not image:
                raise RuntimeError(f"No poster URL for new post @{username}/{code}")
            download(image, SOURCE / poster)
            downloaded += 1
        if media_kind == "video" and not video:
            raise RuntimeError(f"Missing video source for @{username}/{code}")
        post = {
            "author": username,
            "asset": code + sc_suffix[media_kind],
            "code": code,
            "kind": media_kind,
            "date": date,
            "caption": content.get("text") or "",
            "category": "",
            "posterPath": poster,
            "videoPath": "",
            "videoUrl": video,
            "imageUrl": image,
            "permalink": f"https://www.instagram.com/p/{code}/",
            **counts,
            "countsHidden": False,
            "carouselCount": sc["ext"].get("carousel_count") or 0,
            "source": "SocialCrawl",
            **socialcrawl_fields(record),
        }
        account_posts.append(post)
        by_code[code] = post
        added += 1

    authors.append({"username": username, "name": account["name"], "count": len(account_posts), "followers": followers})
    posts.extend(account_posts)

posts.sort(key=lambda post: (post["date"], post["author"], post["asset"]), reverse=True)
keys = [(post["author"], post["asset"]) for post in posts]
assert len(authors) == 10 and len(set(keys)) == len(keys)
assert len({post["code"] for post in posts}) == len(posts)
assert len(posts) == sum(author["count"] for author in authors)
assert all(re.fullmatch(r"[A-Za-z0-9._-]+", post["author"]) and re.fullmatch(r"[A-Za-z0-9._-]+", post["asset"]) for post in posts)
captures = sorted({(post["countsSource"], post["countsAt"]) for post in posts})
OUTPUT.write_text(json.dumps({"captures": [{"source": source, "date": date} for source, date in captures], "authors": authors, "posts": posts}, ensure_ascii=False, separators=(",", ":")))
print(f"Wrote {len(posts)} KOL posts from {len(authors)} authors to {OUTPUT}")
print(f"SocialCrawl: {added} posts added, {enriched} enriched, {downloaded} posters downloaded")
