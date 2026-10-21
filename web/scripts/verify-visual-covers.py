"""Verify every Design/KOL prepared cover against its persistent R2 object."""

import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(os.environ.get("COLLECTIONS_SOURCE_ROOT", PROJECT.parent / "sample-archive")).resolve()
BUCKET = os.environ.get("COLLECTIONS_MEDIA_BUCKET", "loupe-media")
PREFIX = "collections-platform/media/objects/"
manifest = json.loads((PROJECT / "content/media-cache.json").read_text())
client = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                      aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")


def verify_post(category, post):
    author, asset = post["author"], post["asset"]
    prefix = f"{author}/{asset}"
    visual = ARCHIVE / "instagram-data" / "visual-inputs" / author / f"{asset}.jpg"
    object_name = manifest["visual"][f"{prefix}/input"]
    with Image.open(visual) as image:
        image.verify()
    with Image.open(visual) as image:
        if image.format != "JPEG" or max(image.size) > 512:
            raise ValueError(f"Invalid prepared image format or dimensions: {image.format} {image.size}")
    expected = hashlib.sha256(visual.read_bytes()).hexdigest()
    if object_name != f"{expected}.jpg":
        raise ValueError("Prepared image hash differs from manifest")
    response = client.get_object(Bucket=BUCKET, Key=PREFIX + object_name)
    remote = hashlib.sha256()
    with response["Body"] as body:
        for chunk in iter(lambda: body.read(1024 * 1024), b""):
            remote.update(chunk)
    if remote.hexdigest() != expected:
        raise ValueError("R2 image bytes differ from local prepared image")
    existing = [(f"{prefix}/poster", ARCHIVE / post["posterPath"])]
    if post["kind"] == "video":
        existing.append((f"{prefix}/first-frame", ARCHIVE / "instagram-data" / "first-frames" / author / f"{asset}.jpg"))
    for key, local in existing:
        archived = manifest["posts"][key]
        head = client.head_object(Bucket=BUCKET, Key=PREFIX + archived)
        if head["ContentLength"] != local.stat().st_size:
            raise ValueError(f"R2 size differs from local {key}")
    return category, post["kind"]


def main():
    jobs = []
    for category, filename in (("design", "atlas.json"), ("kol", "kol.json")):
        jobs.extend((category, post) for post in json.loads((PROJECT / "content" / filename).read_text())["posts"])
    verified = {"design": 0, "kol": 0, "video": 0}
    errors = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(verify_post, *job): job for job in jobs}
        for index, future in enumerate(as_completed(futures), 1):
            try:
                category, kind = future.result()
                verified[category] += 1
                verified["video"] += kind == "video"
            except Exception as error:
                category, post = futures[future]
                errors.append(f"{category}/{post['author']}/{post['asset']}: {error}")
            if index % 100 == 0 or index == len(jobs):
                print(f"Verified {index}/{len(jobs)} posts; errors {len(errors)}", flush=True)
    print(f"Complete: {verified['design']} Design, {verified['kol']} KOL prepared images and covers; "
          f"{verified['video']} video first frames; {len(errors)} errors")
    if errors:
        print("\n".join(errors[:30]))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
