import { createHash } from "node:crypto";
import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { getCategoryPosts } from "@/lib/atlas";

export const runtime = "nodejs";

type Provider = "jev-omni" | "gpt-6-luna";
type Coverage = "cover" | "all-slides";
type Scan = { key: string; category: string; object: string; provider: Provider; coverage: Coverage; results: Record<string, unknown>; complete: boolean; updatedAt: string };
const noStore = { "Cache-Control": "no-store" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: noStore });

function location(category: string, object: string, provider: string, coverage: string) {
  if (!/^(design|kol)$/.test(category) || object.length < 2 || object.length > 80 || /[\x00-\x1f\x7f]/.test(object)) return null;
  if (provider !== "jev-omni" && provider !== "gpt-6-luna") return null;
  if (coverage !== "cover" && coverage !== "all-slides") return null;
  if (coverage === "all-slides" && provider !== "gpt-6-luna") return null;
  const normalized = object.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const key = createHash("sha256").update(coverage === "all-slides" ? `v3\n${provider}\n${coverage}\n${category}\n${normalized}` :
    provider === "jev-omni" ? `v1\n${category}\n${normalized}` : `v2\n${provider}\n${category}\n${normalized}`).digest("hex");
  return { key, url: `${collectionsWorkerUrl}/api/visual-find-scan/${key}` };
}

function headers() {
  const token = process.env.VISUAL_CACHE_TOKEN;
  if (!token) throw new Error("Visual scan cache is not configured");
  return { "x-collections-cache-token": token };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = location(params.get("category") || "", params.get("object") || "", params.get("provider") || "jev-omni", params.get("coverage") || "cover");
  if (!target) return json({ error: "Invalid visual scan" }, 400);
  try {
    const response = await fetch(target.url, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (response.status === 404) return json({ key: target.key, results: {}, complete: false });
    if (!response.ok) throw new Error(`Visual scan cache returned ${response.status}`);
    return new Response(response.body, { headers: { ...noStore, "Content-Type": "application/json" } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Visual scan cache unavailable" }, 503); }
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);
  const body = await request.json().catch(() => null) as Partial<Scan> | null;
  const category = typeof body?.category === "string" ? body.category : "";
  const object = typeof body?.object === "string" ? body.object : "";
  const provider = body?.provider || "jev-omni";
  const coverage = body?.coverage || "cover";
  const target = location(category, object, provider, coverage);
  if (!target || !body || !body.results || typeof body.results !== "object" || Array.isArray(body.results) || typeof body.complete !== "boolean")
    return json({ error: "Invalid visual scan" }, 400);
  const valid = Object.entries(body.results).every(([id, result]) => /^[\w.-]+\/[\w.-]+$/.test(id)
    && result && typeof result === "object" && (result as { status?: unknown; model?: unknown }).status === "succeeded"
    && (provider === "jev-omni" ? (result as { model?: string }).model?.startsWith("barakplasma/jev-omni:") : (result as { model?: string }).model === "gpt-6-luna"));
  if (!valid) return json({ error: "Invalid scan results" }, 400);
  try {
    const existingResponse = await fetch(target.url, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (existingResponse.status !== 404 && !existingResponse.ok) throw new Error(`Visual scan cache returned ${existingResponse.status}`);
    const existing = existingResponse.ok ? await existingResponse.json() as Partial<Scan> : null;
    const results = { ...(existing?.results && typeof existing.results === "object" ? existing.results : {}), ...body.results };
    const complete = getCategoryPosts(category as "design" | "kol").every((post) =>
      Object.hasOwn(results, `${post.author}/${post.asset}`));
    const response = await fetch(target.url, { method: "PUT", headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ key: target.key, category, object, provider, coverage, results, complete, updatedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Visual scan cache returned ${response.status}`);
    return json({ ok: true });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Visual scan cache unavailable" }, 503); }
}
