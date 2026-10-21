import { handleCustomStudies } from "./custom-studies";
import { handleTopicNews } from "./topic-news";
import { handleFrameExports } from "./frame-exports";
import { handleVisualFindCache } from "./visual-find-cache";

interface Env { DB: D1Database; ASSETS: R2Bucket; NEWS_CACHE: KVNamespace; EXA_API_KEY?: string; TYPESAFE_API_KEY?: string; OAI_MONITORED_API_KEY?: string; VISUAL_CACHE_TOKEN?: string }

type PostKey = { author: string; asset: string };
type LabCategory = "art-technical-leads" | "seo-leads" | "art-ref-leads";
type Annotation = PostKey & { likes: number; dislikes: number; myReaction: -1 | 0 | 1 };
type Row = PostKey & { likes: number; dislikes: number; myReaction: number };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const authorPattern = /^[a-z0-9._]{1,80}$/i;
const assetPattern = /^[a-zA-Z0-9._-]{1,160}$/;
const framePattern = /^[a-zA-Z0-9_-]{1,40}$/;
const labCategories = new Set<LabCategory>(["art-technical-leads", "seo-leads", "art-ref-leads"]);

function validFrameLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 48
    && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function validPost(value: unknown): value is PostKey & Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const post = value as Record<string, unknown>;
  return typeof post.author === "string" && authorPattern.test(post.author)
    && typeof post.asset === "string" && assetPattern.test(post.asset);
}

function key(post: PostKey): string { return `${post.author}/${post.asset}`; }

async function readLabCategories(db: D1Database, viewerId: string, post: PostKey): Promise<LabCategory[]> {
  const result = await db.prepare("SELECT category FROM lab_post_categories WHERE viewer_id = ? AND author = ? AND asset = ?")
    .bind(viewerId, post.author, post.asset).all<{ category: LabCategory }>();
  return result.results.map((row) => row.category);
}

async function readAnnotations(db: D1Database, posts: PostKey[], viewerId: string): Promise<Annotation[]> {
  if (posts.length === 0) return [];
  const found = new Map<string, Row>();
  // D1 limits bound parameters per statement; each post uses two, plus the viewer.
  for (let start = 0; start < posts.length; start += 40) {
    const chunk = posts.slice(start, start + 40);
    const values = chunk.flatMap((post) => [post.author, post.asset]);
    const placeholders = chunk.map(() => "(?, ?)").join(", ");
    const result = await db.prepare(`
      SELECT author, asset,
        SUM(CASE WHEN reaction = 1 THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN reaction = -1 THEN 1 ELSE 0 END) AS dislikes,
        SUM(CASE WHEN viewer_id = ? THEN reaction ELSE 0 END) AS myReaction
      FROM reactions WHERE (author, asset) IN (${placeholders})
      GROUP BY author, asset
    `).bind(viewerId, ...values).all<Row>();
    for (const row of result.results) found.set(key(row), row);
  }
  return posts.map((post) => {
    const row = found.get(key(post));
    return { author: post.author, asset: post.asset, likes: row?.likes ?? 0, dislikes: row?.dislikes ?? 0,
      myReaction: (row?.myReaction ?? 0) as -1 | 0 | 1 };
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true });
    const visualFindCacheResponse = await handleVisualFindCache(request, env);
    if (visualFindCacheResponse) return visualFindCacheResponse;
    const frameExportResponse = await handleFrameExports(request, env);
    if (frameExportResponse) return frameExportResponse;
    const topicNewsResponse = await handleTopicNews(request, env);
    if (topicNewsResponse) return topicNewsResponse;
    const customStudyResponse = await handleCustomStudies(request, env);
    if (customStudyResponse) return customStudyResponse;
    if (url.pathname === "/api/lab-analysis") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const post = { author: url.searchParams.get("author"), asset: url.searchParams.get("asset") };
      if (!validPost(post)) return json({ error: "Invalid study" }, 400);
      try {
        const [source, transcript, ocr] = await env.DB.batch([
          env.DB.prepare(`SELECT audio_method AS audioMethod, ocr_method AS ocrMethod,
              ocr_interval_seconds AS ocrIntervalSeconds
            FROM lab_analysis_sources WHERE author = ? AND asset = ?`).bind(post.author, post.asset),
          env.DB.prepare(`SELECT start_seconds AS startSeconds, end_seconds AS endSeconds, text
            FROM lab_transcript_passages WHERE author = ? AND asset = ? ORDER BY passage_index`)
            .bind(post.author, post.asset),
          env.DB.prepare(`SELECT time_seconds AS timeSeconds, strings_json AS stringsJson
            FROM lab_ocr_samples WHERE author = ? AND asset = ? ORDER BY time_seconds`)
            .bind(post.author, post.asset),
        ]);
        const metadata = source.results[0] as { audioMethod: string; ocrMethod: string; ocrIntervalSeconds: number } | undefined;
        if (!metadata) return json({ error: "Study analysis not found" }, 404);
        return json({
          ...metadata,
          transcript: transcript.results,
          ocrSamples: (ocr.results as { timeSeconds: number; stringsJson: string }[])
            .map(({ timeSeconds, stringsJson }) => ({ timeSeconds, strings: JSON.parse(stringsJson) as string[] })),
        });
      } catch (error) {
        console.error("Lab analysis D1 request failed", error);
        return json({ error: "Lab database unavailable" }, 503);
      }
    }
    if (url.pathname === "/api/lab-frames") {
      if (request.method !== "GET" && request.method !== "POST" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      try {
        if (request.method === "GET") {
          const viewerId = request.headers.get("x-collections-viewer");
          const post = { author: url.searchParams.get("author"), asset: url.searchParams.get("asset") };
          if (!viewerId || !uuid.test(viewerId) || !validPost(post)) return json({ error: "Invalid study" }, 400);
          const [result, custom] = await env.DB.batch([
            env.DB.prepare("SELECT frame_id AS frameId, category AS label FROM lab_frame_categories WHERE viewer_id = ? AND author = ? AND asset = ?")
              .bind(viewerId, post.author, post.asset),
            env.DB.prepare("SELECT name FROM lab_custom_frame_labels WHERE viewer_id = ? ORDER BY name COLLATE NOCASE").bind(viewerId),
          ]);
          return json({ labels: result.results, customLabels: (custom.results as { name: string }[]).map((row) => row.name) });
        }
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; }
        catch { return json({ error: "Invalid JSON" }, 400); }
        if (!body || typeof body.viewerId !== "string" || !uuid.test(body.viewerId))
          return json({ error: "Invalid frame labels" }, 400);
        if (request.method === "POST") {
          if (!validFrameLabel(body.name) || labCategories.has(body.name as LabCategory))
            return json({ error: "Invalid custom label" }, 400);
          await env.DB.prepare("INSERT INTO lab_custom_frame_labels (viewer_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING")
            .bind(body.viewerId, body.name).run();
          const saved = await env.DB.prepare("SELECT name FROM lab_custom_frame_labels WHERE viewer_id = ? AND name = ? COLLATE NOCASE")
            .bind(body.viewerId, body.name).first<{ name: string }>();
          return json({ label: saved?.name ?? body.name });
        }
        if (!validPost(body) || !Array.isArray(body.frameIds)
          || body.frameIds.length < 1 || body.frameIds.length > 200
          || !body.frameIds.every((id) => typeof id === "string" && framePattern.test(id))
          || !Array.isArray(body.labels) || body.labels.length < 1 || body.labels.length > 12
          || !body.labels.every(validFrameLabel)
          || typeof body.enabled !== "boolean") return json({ error: "Invalid frame labels" }, 400);
        const frameIds = [...new Set(body.frameIds as string[])];
        const labels = [...new Set(body.labels as string[])];
        const custom = await env.DB.prepare("SELECT name FROM lab_custom_frame_labels WHERE viewer_id = ?")
          .bind(body.viewerId).all<{ name: string }>();
        const available = new Set([...labCategories, ...custom.results.map((row) => row.name)]);
        if (!labels.every((label) => available.has(label))) return json({ error: "Unknown frame label" }, 400);
        const statements = frameIds.flatMap((frameId) => labels.map((label) => body.enabled
          ? env.DB.prepare(`INSERT INTO lab_frame_categories (viewer_id, author, asset, frame_id, category) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT (viewer_id, author, asset, frame_id, category) DO NOTHING`)
              .bind(body.viewerId, body.author, body.asset, frameId, label)
          : env.DB.prepare("DELETE FROM lab_frame_categories WHERE viewer_id = ? AND author = ? AND asset = ? AND frame_id = ? AND category = ?")
              .bind(body.viewerId, body.author, body.asset, frameId, label)));
        await env.DB.batch(statements);
        return json({ frameIds, labels, enabled: body.enabled });
      } catch (error) {
        console.error("Lab frame labels D1 request failed", error);
        return json({ error: "Lab database unavailable" }, 503);
      }
    }
    if (url.pathname === "/api/lab-posts") {
      if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      try {
        if (request.method === "GET") {
          const viewerId = request.headers.get("x-collections-viewer");
          if (!viewerId || !uuid.test(viewerId)) return json({ error: "Invalid viewer" }, 400);
          const [saved, tagged] = await env.DB.batch([
            env.DB.prepare("SELECT author, asset FROM lab_posts WHERE viewer_id = ? ORDER BY added_at DESC, rowid DESC").bind(viewerId),
            env.DB.prepare("SELECT author, asset, category FROM lab_post_categories WHERE viewer_id = ?").bind(viewerId),
          ]);
          const categories = new Map<string, LabCategory[]>();
          for (const row of tagged.results as (PostKey & { category: LabCategory })[]) {
            const id = key(row);
            categories.set(id, [...(categories.get(id) ?? []), row.category]);
          }
          return json({ posts: (saved.results as PostKey[]).map((post) => ({ ...post, categories: categories.get(key(post)) ?? [] })) });
        }
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; }
        catch { return json({ error: "Invalid JSON" }, 400); }
        const viewerId = body?.viewerId;
        if (!body || typeof viewerId !== "string" || !uuid.test(viewerId) || !validPost(body))
          return json({ error: "Invalid lab post" }, 400);
        if (typeof body.selected === "boolean") {
          if (body.selected) {
            await env.DB.prepare(`INSERT INTO lab_posts (viewer_id, author, asset) VALUES (?, ?, ?)
              ON CONFLICT (viewer_id, author, asset) DO NOTHING`)
              .bind(viewerId, body.author, body.asset).run();
          } else {
            await env.DB.prepare("DELETE FROM lab_posts WHERE viewer_id = ? AND author = ? AND asset = ?")
              .bind(viewerId, body.author, body.asset).run();
          }
          return json({ author: body.author, asset: body.asset, selected: body.selected,
            categories: body.selected ? await readLabCategories(env.DB, viewerId, body) : [] });
        }
        if (typeof body.category !== "string" || !labCategories.has(body.category as LabCategory)
          || typeof body.enabled !== "boolean") return json({ error: "Invalid lab category" }, 400);
        const existing = await env.DB.prepare("SELECT 1 FROM lab_posts WHERE viewer_id = ? AND author = ? AND asset = ?")
          .bind(viewerId, body.author, body.asset).first();
        if (!existing) return json({ error: "Post is not saved to Exp Lab" }, 404);
        if (body.enabled) {
          await env.DB.prepare(`INSERT INTO lab_post_categories (viewer_id, author, asset, category) VALUES (?, ?, ?, ?)
            ON CONFLICT (viewer_id, author, asset, category) DO NOTHING`)
            .bind(viewerId, body.author, body.asset, body.category).run();
        } else {
          await env.DB.prepare("DELETE FROM lab_post_categories WHERE viewer_id = ? AND author = ? AND asset = ? AND category = ?")
            .bind(viewerId, body.author, body.asset, body.category).run();
        }
        return json({ author: body.author, asset: body.asset, category: body.category, enabled: body.enabled,
          categories: await readLabCategories(env.DB, viewerId, body) });
      } catch (error) {
        console.error("Lab posts D1 request failed", error);
        return json({ error: "Lab database unavailable" }, 503);
      }
    }
    if (url.pathname === "/api/follows") {
      if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      const headerViewer = request.headers.get("x-collections-viewer");
      let viewerId: string | null = headerViewer && uuid.test(headerViewer) ? headerViewer : null;
      try {
        if (request.method === "GET") {
          if (!viewerId) return json({ error: "Invalid viewer" }, 400);
          const result = await env.DB.prepare("SELECT author FROM follows WHERE viewer_id = ? ORDER BY updated_at DESC, author")
            .bind(viewerId).all<{ author: string }>();
          return json({ authors: result.results.map((row) => row.author) });
        }
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; }
        catch { return json({ error: "Invalid JSON" }, 400); }
        if (!body || typeof body.viewerId !== "string" || !uuid.test(body.viewerId)
          || typeof body.author !== "string" || !authorPattern.test(body.author)
          || typeof body.following !== "boolean") return json({ error: "Invalid follow" }, 400);
        viewerId = body.viewerId;
        if (body.following) {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM archived_profiles WHERE viewer_id = ? AND author = ?")
              .bind(viewerId, body.author),
            env.DB.prepare(`INSERT INTO follows (viewer_id, author) VALUES (?, ?)
              ON CONFLICT (viewer_id, author) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`)
              .bind(viewerId, body.author),
          ]);
        } else {
          await env.DB.prepare("DELETE FROM follows WHERE viewer_id = ? AND author = ?")
            .bind(viewerId, body.author).run();
        }
        return json({ author: body.author, following: body.following });
      } catch (error) {
        console.error("Follows D1 request failed", error);
        return json({ error: "Follow database unavailable" }, 503);
      }
    }
    if (url.pathname === "/api/archived-profiles") {
      if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      const headerViewer = request.headers.get("x-collections-viewer");
      try {
        if (request.method === "GET") {
          if (!headerViewer || !uuid.test(headerViewer)) return json({ error: "Invalid viewer" }, 400);
          const result = await env.DB.prepare("SELECT author FROM archived_profiles WHERE viewer_id = ? ORDER BY updated_at DESC, author")
            .bind(headerViewer).all<{ author: string }>();
          return json({ authors: result.results.map((row) => row.author) });
        }
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; }
        catch { return json({ error: "Invalid JSON" }, 400); }
        if (!body || typeof body.viewerId !== "string" || !uuid.test(body.viewerId)
          || typeof body.author !== "string" || !authorPattern.test(body.author)
          || typeof body.archived !== "boolean") return json({ error: "Invalid archive action" }, 400);
        if (body.archived) {
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO archived_profiles (viewer_id, author) VALUES (?, ?)
              ON CONFLICT (viewer_id, author) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`)
              .bind(body.viewerId, body.author),
            env.DB.prepare("DELETE FROM follows WHERE viewer_id = ? AND author = ?")
              .bind(body.viewerId, body.author),
          ]);
        } else {
          await env.DB.prepare("DELETE FROM archived_profiles WHERE viewer_id = ? AND author = ?")
            .bind(body.viewerId, body.author).run();
        }
        return json({ author: body.author, archived: body.archived, following: false });
      } catch (error) {
        console.error("Archived profiles D1 request failed", error);
        return json({ error: "Profile archive database unavailable" }, 503);
      }
    }
    if (url.pathname === "/api/annotations/liked" || url.pathname === "/api/annotations/disliked") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const viewerId = request.headers.get("x-collections-viewer");
      if (!viewerId || !uuid.test(viewerId)) return json({ error: "Invalid viewer" }, 400);
      try {
        const reaction = url.pathname.endsWith("/disliked") ? -1 : 1;
        const result = await env.DB.prepare(`
          SELECT author, asset FROM reactions
          WHERE viewer_id = ? AND reaction = ?
          ORDER BY updated_at DESC, author, asset
        `).bind(viewerId, reaction).all<PostKey>();
        return json({ posts: result.results });
      } catch (error) {
        console.error("Liked posts D1 request failed", error);
        return json({ error: "Annotation database unavailable" }, 503);
      }
    }
    if (url.pathname !== "/api/annotations") return json({ error: "Not found" }, 404);
    if (request.method !== "POST" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);

    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);
    const input = body as Record<string, unknown>;
    if (typeof input.viewerId !== "string" || !uuid.test(input.viewerId)) return json({ error: "Invalid viewer" }, 400);
    const viewerId = input.viewerId;

    try {
      if (request.method === "POST") {
        if (!Array.isArray(input.posts) || input.posts.length > 100 || !input.posts.every(validPost)) {
          return json({ error: "Expected at most 100 valid posts" }, 400);
        }
        const posts = [...new Map(input.posts.map((post: PostKey) => [key(post), post])).values()];
        return json({ annotations: await readAnnotations(env.DB, posts, viewerId) });
      }

      const reaction = input.reaction;
      if (!validPost(input) || ![-1, 0, 1].includes(reaction as number)) {
        return json({ error: "Invalid reaction" }, 400);
      }
      if (reaction === 0) {
        await env.DB.prepare("DELETE FROM reactions WHERE author = ? AND asset = ? AND viewer_id = ?")
          .bind(input.author, input.asset, viewerId).run();
      } else {
        await env.DB.prepare(`INSERT INTO reactions (author, asset, viewer_id, reaction) VALUES (?, ?, ?, ?)
          ON CONFLICT (author, asset, viewer_id) DO UPDATE SET reaction = excluded.reaction, updated_at = CURRENT_TIMESTAMP`)
          .bind(input.author, input.asset, viewerId, reaction).run();
      }
      const [annotation] = await readAnnotations(env.DB, [input], viewerId);
      return json({ annotation });
    } catch (error) {
      console.error("Annotation D1 request failed", error);
      return json({ error: "Annotation database unavailable" }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
