# Loupe

## Why this name

A loupe is the small magnifier used to inspect film negatives and print. That is what this project does: it puts social posts under the glass and studies them frame by frame. The word is short, has texture, and every designer knows it.

loupe 是看底片、看印刷時用的放大鏡，正好對應「把貼文放大逐格研究」，而且單字短、有質感，設計圈都認得。

## What it is

A collection archive for studying social posts: curated creator feeds, reactions and follows, an Exp Lab for frame-by-frame studies, open (blank-canvas) studies with uploads, and dated Topics news collections.

| Path | What it is |
| --- | --- |
| `web/` | Next.js frontend (App Router). Proxies same-origin `/api/*` routes to the API Worker and redirects `/media/*` to the media Worker. |
| `api/` | Cloudflare Worker backend — D1 (annotations, follows, Lab, studies, Topics), KV (`NEWS_CACHE`), R2 (`ASSETS` study uploads). |
| `media/` | Cloudflare Worker serving immutable media objects from R2 with byte-range support. |
| `sample-archive/` | Generated placeholder posters, videos and study frames for the sample collection. |

## Run locally

```sh
# backend
cd api && npm install && npm run db:migrate:local && npm run dev      # http://127.0.0.1:8787

# media (optional — serves R2 objects listed in web/content/media-cache.json)
cd media && npx wrangler dev --port 8788                              # http://127.0.0.1:8788

# frontend
cd web && npm install && npm run dev                                  # http://localhost:3000
```

Copy `web/.env.example` to `web/.env.local` and `api/.dev.vars.example` to `api/.dev.vars`, then fill in the keys you need. Neither file is committed.

## Deploying

Nothing in this repo points at deployed resources. Before a remote deploy:

1. Create a D1 database, a KV namespace and the R2 buckets (`loupe-study-assets`, `loupe-media`), and put their IDs into `api/wrangler.jsonc` / `media/wrangler.jsonc`.
2. `cd api && npx wrangler d1 migrations apply DB --remote`, set secrets with `npx wrangler secret put …`, then `npx wrangler deploy`.
3. Deploy `media/`, upload media with `web/scripts/sync-media-r2.py`, and set `COLLECTIONS_ANNOTATIONS_URL` / `COLLECTIONS_MEDIA_ORIGIN` for the frontend.

Study reference images in `web/content/study-references.json` point at the placeholder origin `https://assets.example.com`; republish them with `LOUPE_REFERENCE_ORIGIN=<your origin> python3 web/scripts/publish-study-references.py`.

## Sample data

Everything in `web/content/` and `sample-archive/` is a fictional sample collection — invented creators (@demo.studio, @demo.trail, …), captions, counts and transcripts, with generated placeholder images and videos. Rebuild it with `python3 web/scripts/generate-sample-data.py`. To use your own collection, see `web/README.md`; media is read from `COLLECTIONS_SOURCE_ROOT` (default `sample-archive/`).

See `web/README.md` and `api/README.md` for routes and data details.

## License

[MIT](LICENSE)
