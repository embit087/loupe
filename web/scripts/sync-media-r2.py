"""Archive Design/KOL media and ready-to-classify cover images in R2.

Requires boto3, yt-dlp, and ffprobe. Credentials come from R2_* environment
variables. Run repeatedly; completed uploads remain in content/media-cache.json.
"""

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
import certifi
from boto3.s3.transfer import TransferConfig
from botocore.exceptions import ClientError

PROJECT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT.parent / "sample-archive")).resolve()
MANIFEST = PROJECT / "content/media-cache.json"
BUCKET = os.environ.get("COLLECTIONS_MEDIA_BUCKET", "loupe-media")
PREFIX = "collections-platform/media/objects/"


def posts():
    for category, filename in (("design", "atlas.json"), ("kol", "kol.json")):
        for post in json.loads((PROJECT / "content" / filename).read_text())["posts"]:
            yield category, post


def studies():
    files = [PROJECT / "content/experiment-lab.json", *(PROJECT / "content/lab-studies").glob("*.json")]
    for file in files:
        data = json.loads(file.read_text())
        if data.get("author") and data.get("asset"):
            yield data


def local_video(post):
    if post.get("videoPath"):
        candidate = ARCHIVE / post["videoPath"]
        if candidate.is_file():
            return candidate
    for study in studies():
        if study["author"] == post["author"] and study["asset"] == post["asset"] and study.get("sourceFile"):
            candidate = ARCHIVE / study["sourceFile"]
            if candidate.is_file():
                return candidate
    candidate = ARCHIVE / "instagram-data" / "media" / post["author"] / post["asset"]
    return candidate if candidate.is_file() else None


def playable(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "json", str(path)],
                            capture_output=True, text=True, timeout=30)
    if result.returncode:
        return False
    streams = json.loads(result.stdout or "{}").get("streams", [])
    return bool(streams and streams[0].get("width") and streams[0].get("height"))


def download(post):
    target = ARCHIVE / "instagram-data" / "media" / post["author"] / post["asset"]
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as folder:
        output = Path(folder) / "source.mp4"
        child_env = {**os.environ, "SSL_CERT_FILE": os.environ.get("SSL_CERT_FILE", certifi.where())}
        result = subprocess.run(["yt-dlp", "--no-playlist", "--no-warnings", "--no-progress", "--quiet", "--retries", "2", "--socket-timeout", "20",
                                 "-f", "best[ext=mp4]", "-o", str(output), post["permalink"]], capture_output=True, text=True, timeout=120, env=child_env)
        if result.returncode or not output.is_file() or not playable(output):
            raise RuntimeError((result.stderr or "downloaded video could not be decoded").strip()[-250:])
        output.replace(target)
    return target


def first_frame(post, recover):
    target = ARCHIVE / "instagram-data" / "first-frames" / post["author"] / f"{post['asset']}.jpg"
    if target.is_file() and target.stat().st_size > 0:
        return target
    video = local_video(post)
    if video is None and recover:
        video = download(post)
    if video is None:
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as folder:
        output = Path(folder) / "frame.jpg"
        result = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-frames:v", "1", "-q:v", "3", str(output)],
                                capture_output=True, text=True, timeout=45)
        if result.returncode or not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError((result.stderr or "first frame extraction failed").strip()[-250:])
        output.replace(target)
    return target


def upload(client, path, extension, content_type):
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    name = f"{digest}.{extension}"
    key = PREFIX + name
    try:
        head = client.head_object(Bucket=BUCKET, Key=key)
        if head["ContentLength"] == path.stat().st_size:
            return name
    except ClientError as error:
        if error.response["Error"]["Code"] not in ("404", "NoSuchKey", "NotFound"):
            raise
    client.upload_file(str(path), BUCKET, key, ExtraArgs={"ContentType": content_type, "CacheControl": "public, max-age=31536000, immutable"},
                       Config=TransferConfig(max_concurrency=2))
    head = client.head_object(Bucket=BUCKET, Key=key)
    if head["ContentLength"] != path.stat().st_size:
        raise RuntimeError("R2 object size did not match the local file")
    return name


def task(client, entry, recover):
    section, name, path, extension, content_type, post = entry
    try:
        if name.endswith("/first-frame") and post is not None:
            path = first_frame(post, recover)
        elif path is None and recover and post is not None:
            path = download(post)
        if path is None or not path.is_file():
            return section, name, None, "local asset missing"
        if extension == "mp4" and not playable(path):
            return section, name, None, "video is not decodable"
        return section, name, upload(client, path, extension, content_type), None
    except Exception as error:
        return section, name, None, str(error)[:300]


def entries(cache, recover, category_filter):
    for category, post in posts():
        if category_filter and category != category_filter:
            continue
        prefix = f"{post['author']}/{post['asset']}"
        poster_key = f"{prefix}/poster"
        if poster_key not in cache["posts"]:
            yield ("posts", poster_key, ARCHIVE / post["posterPath"], "jpg", "image/jpeg", None)
        visual_key = f"{prefix}/input"
        visual_path = ARCHIVE / "instagram-data" / "visual-inputs" / post["author"] / f"{post['asset']}.jpg"
        yield ("visual", visual_key, visual_path, "jpg", "image/jpeg", None)
        if post["kind"] == "video":
            video_key = f"{prefix}/video"
            if video_key not in cache["posts"]:
                yield ("posts", video_key, local_video(post), "mp4", "video/mp4", post if recover else None)
            frame_key = f"{prefix}/first-frame"
            if frame_key not in cache["posts"]:
                yield ("posts", frame_key, None, "jpg", "image/jpeg", post)
    for study in studies():
        author, asset = study["author"], study["asset"]
        if category_filter and not any(p["author"] == author and p["asset"] == asset and c == category_filter for c, p in posts()):
            continue
        for frame in study.get("frames", []):
            for variant, folder, extension, content_type in (("thumb", "thumbs", "jpg", "image/jpeg"), ("full", "frames", "png", "image/png")):
                name = f"{author}/{asset}/{frame['id']}/{variant}"
                if name in cache["frames"]:
                    continue
                path = ARCHIVE / "output/data/experiment-lab" / Path(asset).stem / folder / f"{frame['id']}.{extension}"
                yield ("frames", name, path, extension, content_type, None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--recover-videos", action="store_true", help="Re-fetch public posts with yt-dlp when their original signed URL has expired")
    parser.add_argument("--category", choices=("design", "kol"))
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--skip-preprocess", action="store_true", help="Use visual inputs already prepared on disk")
    args = parser.parse_args()
    cache = json.loads(MANIFEST.read_text())
    cache.setdefault("visual", {})
    if not args.skip_preprocess:
        command = ["node", str(PROJECT / "scripts/preprocess-visual-covers.mjs")]
        if args.category:
            command.extend(["--category", args.category])
        subprocess.run(command, check=True, cwd=PROJECT)
    client = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                          aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")
    work = list(entries(cache, args.recover_videos, args.category))
    if args.limit:
        work = work[:args.limit]
    errors = {}
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
        futures = [pool.submit(task, client, item, args.recover_videos) for item in work]
        for index, future in enumerate(as_completed(futures), 1):
            section, name, object_name, error = future.result()
            if object_name:
                if cache[section].get(name) != object_name:
                    cache[section][name] = object_name
                    temp = MANIFEST.with_suffix(".tmp")
                    temp.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
                    temp.replace(MANIFEST)
            else:
                errors[name] = error
            if index % 25 == 0 or index == len(work):
                print(f"{index}/{len(work)} checked; archived {sum(map(len, cache.values()))}; errors {len(errors)}", flush=True)
    report = PROJECT / ".next/media-sync-errors.json"
    report.parent.mkdir(exist_ok=True)
    report.write_text(json.dumps(errors, indent=2) + "\n")
    print(f"Finished: {len(work) - len(errors)} uploaded or verified, {len(errors)} missing. Details: {report}")


if __name__ == "__main__":
    main()
