interface Env {
  NEWS_CACHE: KVNamespace;
  VISUAL_CACHE_TOKEN?: string;
}

const keyPattern = /^\/api\/visual-find-cache\/([a-f0-9]{64})$/;
const scanPattern = /^\/api\/visual-find-scan\/([a-f0-9]{64})$/;

export async function handleVisualFindCache(request: Request, env: Env): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const match = keyPattern.exec(pathname) || scanPattern.exec(pathname);
  if (!match) return null;
  const scan = scanPattern.test(pathname);
  if (request.method !== "GET" && request.method !== "PUT") return new Response("Method not allowed", { status: 405 });
  if (!env.VISUAL_CACHE_TOKEN || request.headers.get("x-collections-cache-token") !== env.VISUAL_CACHE_TOKEN)
    return new Response("Unauthorized", { status: 401 });

  const key = `${scan ? "visual-find-scan" : "visual-find"}/${match[1]}`;
  if (request.method === "GET") {
    const saved = await env.NEWS_CACHE.get(key);
    return saved ? new Response(saved, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
      : new Response("Not found", { status: 404 });
  }

  const raw = await request.text();
  if (raw.length > (scan ? 2_000_000 : 65536)) return new Response("Visual cache entry too large", { status: 413 });
  let value: { key?: unknown; prediction?: unknown; results?: unknown; complete?: unknown };
  try { value = JSON.parse(raw) as typeof value; }
  catch { return new Response("Invalid JSON", { status: 400 }); }
  if (value.key !== match[1] || (scan
    ? !value.results || typeof value.results !== "object" || Array.isArray(value.results) || typeof value.complete !== "boolean"
    : !value.prediction || typeof value.prediction !== "object"))
    return new Response("Invalid visual cache entry", { status: 400 });
  await env.NEWS_CACHE.put(key, raw);
  return new Response(null, { status: 204 });
}
