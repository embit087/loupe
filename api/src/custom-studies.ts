type StudyEnv = { DB: D1Database; ASSETS: R2Bucket };
type Study = { id: string; viewerId: string; category: "design" | "kol" | "topics"; title: string; createdAt: string; updatedAt: string };
type StudyAsset = {
  id: string; studyId: string; sourceKey: string; kind: string; author: string | null; asset: string | null;
  frameId: string | null; textContent: string | null; externalUrl: string | null; objectKey: string | null;
  fileName: string | null; mimeType: string | null; byteSize: number | null; topicItemId: string | null; sourceTitle: string | null; createdAt: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const authorPattern = /^[a-z0-9._]{1,80}$/i;
const assetPattern = /^[a-zA-Z0-9._-]{1,160}$/;
const framePattern = /^[a-zA-Z0-9_-]{1,40}$/;
const assetKinds = new Set(["post", "caption", "poster", "video", "audio", "frame", "transcript", "ocr", "note", "image", "file", "article"]);
const maxUploadBytes = 50 * 1024 * 1024;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function validViewer(request: Request): string | null {
  const viewerId = request.headers.get("x-collections-viewer");
  return viewerId && uuid.test(viewerId) ? viewerId : null;
}

async function readStudy(db: D1Database, viewerId: string, id: string): Promise<Study | null> {
  return db.prepare(`SELECT id, viewer_id AS viewerId, category, title,
      created_at AS createdAt, updated_at AS updatedAt
    FROM lab_custom_studies WHERE id = ? AND viewer_id = ?`).bind(id, viewerId).first<Study>();
}

async function readAssets(db: D1Database, studyId: string): Promise<StudyAsset[]> {
  const result = await db.prepare(`SELECT id, study_id AS studyId, source_key AS sourceKey, kind,
      author, asset, frame_id AS frameId, text_content AS textContent, external_url AS externalUrl,
      object_key AS objectKey, file_name AS fileName, mime_type AS mimeType, byte_size AS byteSize,
      topic_item_id AS topicItemId, source_title AS sourceTitle,
      created_at AS createdAt
    FROM lab_custom_study_assets WHERE study_id = ? ORDER BY created_at, rowid`).bind(studyId).all<StudyAsset>();
  return result.results;
}

function uploadKindFor(mimeType: string): string | null {
  if (/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) return "image";
  if (/^video\/(mp4|webm|quicktime)$/.test(mimeType)) return "video";
  if (/^audio\/(mpeg|mp4|wav|ogg|webm|x-wav)$/.test(mimeType)) return "audio";
  if (/^(text\/plain|text\/markdown|text\/vtt|application\/json)$/.test(mimeType)) return "file";
  return null;
}

export async function handleCustomStudies(request: Request, env: StudyEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/custom-studies") {
    if (!["GET", "POST", "PATCH"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
    const viewerId = validViewer(request);
    if (!viewerId) return json({ error: "Invalid workspace" }, 400);
    try {
      if (request.method === "GET") {
        const id = url.searchParams.get("id");
        if (id) {
          if (!uuid.test(id)) return json({ error: "Invalid study" }, 400);
          const study = await readStudy(env.DB, viewerId, id);
          if (!study) return json({ error: "Study not found" }, 404);
          return json({ study, assets: await readAssets(env.DB, id) });
        }
        const category = url.searchParams.get("category");
        if (category !== "design" && category !== "kol" && category !== "topics") return json({ error: "Invalid category" }, 400);
        const result = await env.DB.prepare(`SELECT s.id, s.category, s.title, s.created_at AS createdAt,
            s.updated_at AS updatedAt, COUNT(a.id) AS assetCount
          FROM lab_custom_studies s LEFT JOIN lab_custom_study_assets a ON a.study_id = s.id
          WHERE s.viewer_id = ? AND s.category = ? GROUP BY s.id
          ORDER BY s.updated_at DESC, s.created_at DESC, s.id`)
          .bind(viewerId, category).all();
        return json({ studies: result.results });
      }
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; }
      catch { return json({ error: "Invalid JSON" }, 400); }
      if (!body || typeof body !== "object") return json({ error: "Invalid study" }, 400);
      if (request.method === "POST") {
        if (typeof body.id !== "string" || !uuid.test(body.id)
          || (body.category !== "design" && body.category !== "kol" && body.category !== "topics")
          || typeof body.title !== "string" || !body.title.trim() || body.title.length > 120)
          return json({ error: "Invalid study" }, 400);
        await env.DB.prepare("INSERT INTO lab_custom_studies (id, viewer_id, category, title) VALUES (?, ?, ?, ?)")
          .bind(body.id, viewerId, body.category, body.title.trim()).run();
        return json({ study: await readStudy(env.DB, viewerId, body.id) }, 201);
      }
      if (typeof body.id !== "string" || !uuid.test(body.id)
        || typeof body.title !== "string" || !body.title.trim() || body.title.length > 120)
        return json({ error: "Invalid study title" }, 400);
      const study = await readStudy(env.DB, viewerId, body.id);
      if (!study) return json({ error: "Study not found" }, 404);
      await env.DB.prepare("UPDATE lab_custom_studies SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(body.title.trim(), body.id).run();
      return json({ study: await readStudy(env.DB, viewerId, body.id) });
    } catch (error) {
      console.error("Custom studies D1 request failed", error);
      return json({ error: "Study database unavailable" }, 503);
    }
  }

  if (url.pathname === "/api/custom-study-assets") {
    if (request.method !== "POST" && request.method !== "DELETE") return json({ error: "Method not allowed" }, 405);
    const viewerId = validViewer(request);
    if (!viewerId) return json({ error: "Invalid workspace" }, 400);
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body.studyId !== "string" || !uuid.test(body.studyId)) return json({ error: "Invalid study" }, 400);
    try {
      const study = await readStudy(env.DB, viewerId, body.studyId);
      if (!study) return json({ error: "Study not found" }, 404);
      if (request.method === "DELETE") {
        if (typeof body.id !== "string" || !uuid.test(body.id)) return json({ error: "Invalid asset" }, 400);
        const previous = await env.DB.prepare("SELECT object_key AS objectKey FROM lab_custom_study_assets WHERE id = ? AND study_id = ?")
          .bind(body.id, body.studyId).first<{ objectKey: string | null }>();
        await env.DB.prepare("DELETE FROM lab_custom_study_assets WHERE id = ? AND study_id = ?")
          .bind(body.id, body.studyId).run();
        if (previous?.objectKey) {
          try { await env.ASSETS.delete(previous.objectKey); }
          catch (error) { console.error("Orphaned study upload", previous.objectKey, error); }
        }
        await env.DB.prepare("UPDATE lab_custom_studies SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(body.studyId).run();
        return json({ removed: body.id });
      }
      if (typeof body.id !== "string" || !uuid.test(body.id)
        || typeof body.kind !== "string" || !assetKinds.has(body.kind)
        || typeof body.sourceKey !== "string" || !body.sourceKey || body.sourceKey.length > 300)
        return json({ error: "Invalid asset" }, 400);
      const author = typeof body.author === "string" && authorPattern.test(body.author) ? body.author : null;
      const asset = typeof body.asset === "string" && assetPattern.test(body.asset) ? body.asset : null;
      const frameId = typeof body.frameId === "string" && framePattern.test(body.frameId) ? body.frameId : null;
      let textContent = typeof body.textContent === "string" && body.textContent.length <= 100000 ? body.textContent : null;
      let externalUrl = typeof body.externalUrl === "string" && body.externalUrl.length <= 2048 ? body.externalUrl : null;
      let sourceKey: string = body.sourceKey;
      let topicItemId: string | null = null;
      let sourceTitle: string | null = null;
      if (body.kind === "article") {
        if (study.category !== "topics" || typeof body.topicItemId !== "string" || !/^[a-f0-9]{32}$/.test(body.topicItemId))
          return json({ error: "Invalid Topics source" }, 400);
        const topicItem = await env.DB.prepare("SELECT article_url AS url, title, summary FROM topic_lab_items WHERE viewer_id=? AND item_id=?")
          .bind(viewerId, body.topicItemId).first<{ url: string; title: string; summary: string }>();
        if (!topicItem) return json({ error: "Saved Topics source not found" }, 404);
        topicItemId = body.topicItemId;
        sourceTitle = topicItem.title;
        externalUrl = topicItem.url;
        textContent = topicItem.summary;
        sourceKey = "article:" + topicItemId;
      } else if (study.category === "topics" && author) {
        return json({ error: "Use a saved Topics source in this study" }, 400);
      }
      if (externalUrl && !/^https?:\/\//i.test(externalUrl)) return json({ error: "Invalid asset URL" }, 400);
      if (!author && !textContent && !externalUrl) return json({ error: "Asset has no source" }, 400);
      if (author && !asset) return json({ error: "Invalid post source" }, 400);
      await env.DB.prepare(`INSERT INTO lab_custom_study_assets
          (id, study_id, source_key, kind, author, asset, frame_id, text_content, external_url, topic_item_id, source_title)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (study_id, source_key) DO NOTHING`)
        .bind(body.id, body.studyId, sourceKey, body.kind, author, asset, frameId, textContent, externalUrl, topicItemId, sourceTitle).run();
      await env.DB.prepare("UPDATE lab_custom_studies SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(body.studyId).run();
      const saved = await env.DB.prepare("SELECT id FROM lab_custom_study_assets WHERE study_id = ? AND source_key = ?")
        .bind(body.studyId, sourceKey).first<{ id: string }>();
      return json({ assetId: saved?.id ?? body.id }, 201);
    } catch (error) {
      console.error("Custom study assets D1 request failed", error);
      return json({ error: "Study database unavailable" }, 503);
    }
  }

  if (url.pathname === "/api/custom-study-uploads" && request.method === "PUT") {
    const viewerId = validViewer(request);
    const studyId = url.searchParams.get("studyId");
    const fileName = request.headers.get("x-file-name")?.trim() ?? "";
    const mimeType = request.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
    const size = Number(request.headers.get("x-file-size"));
    const requestedKind = request.headers.get("x-asset-kind");
    const detectedKind = uploadKindFor(mimeType);
    if (!viewerId || !studyId || !uuid.test(studyId) || !fileName || fileName.length > 200
      || !Number.isInteger(size) || size < 1 || size > maxUploadBytes || !detectedKind
      || (detectedKind === "file" && size > 1024 * 1024)
      || (requestedKind && requestedKind !== "auto" && !(detectedKind === "file" && (requestedKind === "transcript" || requestedKind === "ocr"))))
      return json({ error: "Invalid upload (50 MB maximum)" }, 400);
    try {
      const study = await readStudy(env.DB, viewerId, studyId);
      if (!study) return json({ error: "Study not found" }, 404);
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength !== size) return json({ error: "Upload size mismatch" }, 400);
      const id = crypto.randomUUID();
      const kind = requestedKind && requestedKind !== "auto" ? requestedKind : detectedKind;
      const objectKey = `studies/${studyId}/${id}`;
      await env.ASSETS.put(objectKey, bytes, { httpMetadata: { contentType: mimeType } });
      try {
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO lab_custom_study_assets
              (id, study_id, source_key, kind, object_key, file_name, mime_type, byte_size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(id, studyId, `upload:${id}`, kind, objectKey, fileName, mimeType, size),
          env.DB.prepare("UPDATE lab_custom_studies SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(studyId),
        ]);
      } catch (error) {
        await env.ASSETS.delete(objectKey);
        throw error;
      }
      return json({ assetId: id, kind, fileName, byteSize: size }, 201);
    } catch (error) {
      console.error("Custom study upload failed", error);
      return json({ error: "Upload unavailable" }, 503);
    }
  }

  if (url.pathname.startsWith("/api/custom-study-files/") && request.method === "GET") {
    const viewerId = validViewer(request);
    const id = url.pathname.slice("/api/custom-study-files/".length);
    if (!viewerId || !uuid.test(id)) return json({ error: "Invalid file" }, 400);
    try {
      const file = await env.DB.prepare(`SELECT a.object_key AS objectKey, a.mime_type AS mimeType,
          a.file_name AS fileName, a.byte_size AS byteSize
        FROM lab_custom_study_assets a JOIN lab_custom_studies s ON s.id = a.study_id
        WHERE a.id = ? AND s.viewer_id = ? AND a.object_key IS NOT NULL`)
        .bind(id, viewerId).first<{ objectKey: string; mimeType: string; fileName: string; byteSize: number }>();
      if (!file) return json({ error: "File not found" }, 404);
      const range = request.headers.get("range");
      let offset = 0;
      let length = file.byteSize;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.byteSize}` } });
        offset = Number(match[1]);
        const end = match[2] ? Number(match[2]) : file.byteSize - 1;
        if (offset >= file.byteSize || end < offset || end >= file.byteSize)
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.byteSize}` } });
        length = end - offset + 1;
      }
      const object = await env.ASSETS.get(file.objectKey, range ? { range: { offset, length } } : undefined);
      if (!object) return json({ error: "File unavailable" }, 404);
      const headers = new Headers({
        "Content-Type": file.mimeType,
        "Content-Length": String(length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      });
      if (range) headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${file.byteSize}`);
      return new Response(object.body, { status: range ? 206 : 200, headers });
    } catch (error) {
      console.error("Custom study file read failed", error);
      return json({ error: "File unavailable" }, 503);
    }
  }

  return null;
}
