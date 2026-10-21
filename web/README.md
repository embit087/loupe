# Loupe — web frontend

Next.js frontend for Loupe. The repository ships with a **fictional sample collection**: six Design creators (seed: Demo Studio, @demo.studio) and four KOL creators (seed: Demo Trail, @demo.trail), 44 posts, and three Exp Lab studies. Every account, caption, count and transcript is invented; the images and videos are generated placeholders in `../sample-archive/`. Regenerate everything with `python3 scripts/generate-sample-data.py` (Pillow and ffmpeg required).

## Routes

| URL | View |
| --- | --- |
| `/` / `/category/design` | Design creators, newest first |
| `/category/kol` | Ten KOL profiles, newest first |
| `/focused-profiles?category=design` / `?category=kol` | Why Demo Studio and @demo.trail are the collection starting profiles |
| `/?type=video` / `/?type=post` | Videos or image and carousel posts |
| `/liked?category=design` / `?category=kol` | Posts liked by this browser in one creator category |
| `/liked?type=video` / `?type=post` | Liked posts with a media filter |
| `/followed?category=design` / `?category=kol` | Posts from followed accounts in one creator category |
| `/followed?type=video` / `?type=post` | Followed accounts' posts with a media filter |
| `/exp-lab` | Design saved posts and featured frame study |
| `/exp-lab/kol` | KOL saved posts, separate from Design |
| `/exp-lab/studies/<id>` | Open a shared, editable Design or KOL study created from a blank canvas |
| `/exp-lab/<author>/<asset>` | Open one study: play a video and browse its extracted slides, or browse a carousel's or photo's items |
| `/exp-lab/<author>/<asset>/frames/<frame>` | Full-resolution view and timing for one extracted slide |
| `/media/exp-lab/<author>/<asset>/<frame>/thumb` / `/full` | Archived slide thumbnail or full-resolution frame |
| `/<author>` | One creator's collected posts |
| `/<author>?type=video` / `?type=post` | One creator with a media filter |
| `/<author>/<asset>` | Canonical page for one collected asset |
| `/media/<author>/<asset>/poster` | Archived poster thumbnail |
| `/media/<author>/<asset>/video` | Archived Design or KOL video with byte-range playback |
| `/api/annotations` | Same-origin proxy for batched reaction reads and like/dislike writes |
| `/api/liked` | Same-origin read of this browser's liked post keys |
| `/api/follows` | Same-origin read and write of this browser's followed accounts |
| `/api/archived-profiles` | Same-origin read and write of profiles hidden from the related list |
| `/sources/socialcrawl` | SocialCrawl price catalogue, credit plan and spend monitor |
| `/api/lab-posts` | Same-origin read and write of posts saved to Exp Lab |
| `/api/custom-studies` | List, create, read, and rename blank studies |
| `/api/custom-study-assets` / `/api/custom-study-catalog` | Attach and remove source or processed assets; search collected posts |
| `/api/custom-study-uploads` / `/api/custom-study-files/<id>` | Upload and play files kept in R2 |
| `/topics` / `/topics/lab` / `/topics/studies/<id>` | Dated news collections, Topics Lab, and open Topics studies |
| `/api/topics/*` | Same-origin proxy for archived Exa news, Jev dedup proposals, and saved Topics sources |
Every card links to its asset page. Unknown authors and assets return 404. The featured Design study is `/exp-lab/demo.studio/20260517_DEMO00001.mp4`, the KOL study with a timed scene summary and transcript is `/exp-lab/demo.trail/DEMO00101.mp4`, and `/exp-lab/paper.form/DEMO00201.carousel` is a carousel study.

## Run locally

```bash
npm install
npm run dev
```

Likes, dislikes, follows, archives, Exp Lab saves, Topics news, open studies, and uploads use the `../api` Worker (D1, KV, R2). The Next.js server defaults to `http://127.0.0.1:8787`; set `COLLECTIONS_ANNOTATIONS_URL` to point at a deployed Worker. Pages still render when the Worker is offline, but saved state is unavailable. A private browser cookie identifies a viewer for votes, follows, and archived profiles; Exp Lab posts and open studies use a shared workspace.

Media is served from `COLLECTIONS_SOURCE_ROOT` (default `../sample-archive`). Posters, videos and lab frames listed in `content/media-cache.json` are redirected to the media Worker at `COLLECTIONS_MEDIA_ORIGIN` instead; the sample ships with an empty cache. `scripts/sync-media-r2.py` uploads an archive to R2 and fills the cache.

## Using your own collection

- `content/atlas.json` (Design) and `content/kol.json` (KOL) list creators and posts. Paths in `posterPath` / `videoPath` are relative to the archive root.
- `content/experiment-lab.json` is the featured frame study; `content/lab-studies/*.json` are the others (built by `scripts/build-lab-studies.py`). Their frames live under `<archive>/output/data/experiment-lab/<asset stem>/{frames,thumbs}/`.
- `content/study-measures/` (from `scripts/measure-study-frames.py`) and `content/study-dimensions/` (judged values) feed the study-dimension panel and generated prompts.
- `scripts/sync-atlas.py`, `scripts/sync-kol.py` and `scripts/socialcrawl.py` rebuild the indexes from saved Instagram Looter and SocialCrawl responses; they overwrite the sample data. Respect each platform's terms and the creators' rights when you collect real posts.
- Visual object search needs `REPLICATE_API_TOKEN` (and `VISUAL_CACHE_TOKEN` in both the frontend and the Worker).

## SocialCrawl costs

`/sources/socialcrawl` compares SocialCrawl spend with a credit plan. `content/socialcrawl.json` is a snapshot of the provider's published price catalogue; `content/socialcrawl-plan.json` holds the budget and goals. Make calls through `python3 scripts/socialcrawl.py` with `SOCIALCRAWL_API_KEY` in the environment or `.env.local`; it refuses calls outside the catalogue or over a goal's cap and logs every call to a ledger.
