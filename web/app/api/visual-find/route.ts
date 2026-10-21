import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { getPost } from "@/lib/atlas";
import { getLabFrame, getLabStudy } from "@/lib/experiment-lab";
import { cachedMediaUrl } from "@/lib/media-cache";
import { collectionsWorkerUrl } from "@/lib/collections-worker";

export const runtime = "nodejs";

const runFile = promisify(execFile);
const model = "barakplasma/jev-omni:292bc2c53f4a46bec43649fb9cad4442995b370140ff357d5eea92c56a7e96bb";
const lunaModel = "gpt-6-luna";
type Provider = "jev-omni" | "gpt-6-luna";
type Coverage = "cover" | "all-slides";
const archiveRoot = path.resolve(/* turbopackIgnore: true */ process.env.COLLECTIONS_SOURCE_ROOT || path.join(process.cwd(), "..", "sample-archive"));
const noStore = { "Cache-Control": "no-store" };
type Prediction = { id?: string; status?: string; output?: { answer?: string; confidence?: number;
  probabilities?: { label?: string; probability?: number }[] }; error?: unknown; metrics?: { predict_time?: number };
  created_at?: string; started_at?: string | null; completed_at?: string | null };
type Saved = { key: string; author: string; asset: string; object: string; source: "first frame" | "post image" | "poster fallback" | "carousel slide" | "lab frame";
  model: string; provider?: Provider; decision?: boolean; createdAt: string; updatedAt: string; submitMs?: number; prediction: Prediction };
type Stage = { stage: string; elapsedMs?: number; kind?: string; source?: Saved["source"]; cache?: "hit" | "miss";
  slideIndex?: number; slideTotal?: number };
type Report = (stage: Stage) => void;
type Outcome = { value: Record<string, unknown>; status: number };
function compactPrediction(value: Prediction): Prediction {
  // Replicate echoes image_base64 in `input`. Keep only fields used by the viewer;
  // otherwise a single prediction can exceed the cloud KV entry limit.
  return { id: value.id, status: value.status, output: value.output, error: value.error, metrics: value.metrics,
    created_at: value.created_at, started_at: value.started_at, completed_at: value.completed_at };
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: noStore });
function cacheHeaders() {
  const token = process.env.VISUAL_CACHE_TOKEN;
  if (!token) throw new Error("Visual prediction cache is not configured");
  return { "x-collections-cache-token": token };
}

async function load(key: string): Promise<Saved | null> {
  const response = await fetch(`${collectionsWorkerUrl}/api/visual-find-cache/${key}`, {
    headers: cacheHeaders(), cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Visual cache returned ${response.status}`);
  return await response.json() as Saved;
}

async function save(value: Saved) {
  const response = await fetch(`${collectionsWorkerUrl}/api/visual-find-cache/${value.key}`, {
    method: "PUT", headers: { ...cacheHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(value), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Visual cache returned ${response.status}`);
}

function sourcePath(relative: string): string | null {
  if (!relative) return null;
  const absolute = path.resolve(archiveRoot, relative);
  return absolute.startsWith(`${archiveRoot}${path.sep}`) ? absolute : null;
}

async function imageFor(author: string, asset: string, report: Report, signal: AbortSignal,
  slide?: { index: number; total: number; url: string | null }, frameId?: string) {
  if (frameId) {
    report({ stage: "lab_frame_load" });
    const study = getLabStudy(author, asset);
    const frame = study && getLabFrame(study, frameId);
    if (!study || !frame) return null;
    const started = performance.now();
    const archived = cachedMediaUrl(`${author}/${asset}/${frame.id}/full`, "frame");
    let bytes: Buffer | null = null;
    if (archived) {
      try {
        const response = await fetch(archived, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
        if (response.ok && response.headers.get("content-type")?.startsWith("image/")
          && Number(response.headers.get("content-length") || 0) <= 20 * 1024 * 1024)
          bytes = Buffer.from(await response.arrayBuffer());
      } catch { /* A local archived frame may still be available. */ }
    }
    if (!bytes) {
      const local = path.join(archiveRoot, "output", "data", "experiment-lab", path.parse(study.asset).name,
        "frames", `${frame.id}.png`);
      try { bytes = await readFile(/* turbopackIgnore: true */ local); } catch { return null; }
    }
    report({ stage: "media_ready", elapsedMs: Math.round(performance.now() - started), source: "lab frame" });
    report({ stage: "image_prepare" });
    const prepareStarted = performance.now();
    const compact = await sharp(bytes).rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 74 }).toBuffer();
    report({ stage: "image_ready", elapsedMs: Math.round(performance.now() - prepareStarted), source: "lab frame" });
    return { compact, source: "lab frame" as const };
  }
  report({ stage: "post_lookup" });
  const post = getPost(author, asset);
  if (!post) return null;
  report({ stage: "media_kind", kind: post.kind });
  if (slide) report({ stage: "carousel_slide", slideIndex: slide.index + 1, slideTotal: slide.total, kind: "carousel" });
  const mediaStarted = performance.now();
  const visualInput = !slide || slide.index === 0 ? cachedMediaUrl(`${author}/${asset}/input`, "visual") : null;
  if (visualInput) {
    report({ stage: "visual_input_cache" });
    try {
      const response = await fetch(visualInput, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
        const compact = Buffer.from(await response.arrayBuffer());
        const source: Saved["source"] = post.kind === "video"
          ? cachedMediaUrl(`${author}/${asset}/first-frame`, "post") ? "first frame" : "poster fallback"
          : "post image";
        report({ stage: "visual_input_hit", elapsedMs: Math.round(performance.now() - mediaStarted), source });
        report({ stage: "media_ready", elapsedMs: Math.round(performance.now() - mediaStarted), source });
        report({ stage: "image_ready", elapsedMs: 0, source });
        return { compact, source };
      }
    } catch { /* Fall back to the original archived frame or poster. */ }
    report({ stage: "visual_input_miss", elapsedMs: Math.round(performance.now() - mediaStarted) });
  }
  let bytes: Buffer | null = null;
  let source: Saved["source"] = slide && slide.index > 0 ? "carousel slide" : post.kind === "video" ? "poster fallback" : "post image";
  if (slide && slide.index > 0) {
    if (!slide.url) throw new Error(`Carousel slide ${slide.index + 1} has no archived source image`);
    report({ stage: "carousel_slide_load", slideIndex: slide.index + 1, slideTotal: slide.total });
    const sourceUrl = new URL(slide.url);
    if (sourceUrl.protocol !== "https:" || !/(^|\.)(fbcdn\.net|cdninstagram\.com)$/.test(sourceUrl.hostname))
      throw new Error(`Carousel slide ${slide.index + 1} has an unsupported source`);
    const response = await fetch(sourceUrl, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    if (!response.ok) throw new Error(`Carousel slide ${slide.index + 1} returned ${response.status}`);
    if (!response.headers.get("content-type")?.startsWith("image/") || Number(response.headers.get("content-length") || 0) > 10 * 1024 * 1024)
      throw new Error(`Carousel slide ${slide.index + 1} is not a supported image`);
    if (!response.body) throw new Error(`Carousel slide ${slide.index + 1} has no image body`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new Error(`Carousel slide ${slide.index + 1} is too large`); }
      chunks.push(value);
    }
    bytes = Buffer.concat(chunks);
  }
  const archivedFrame = post.kind === "video" ? cachedMediaUrl(`${author}/${asset}/first-frame`, "post") : null;
  if (post.kind === "video") report({ stage: "video_frame_cache" });
  if (archivedFrame) {
    try {
      const response = await fetch(archivedFrame, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      if (response.ok) {
        bytes = Buffer.from(await response.arrayBuffer());
        source = "first frame";
        report({ stage: "video_frame_hit", elapsedMs: Math.round(performance.now() - mediaStarted) });
      }
    } catch { /* The archived poster remains available. */ }
  }
  if (post.kind === "video" && !bytes) report({ stage: "video_frame_miss", elapsedMs: Math.round(performance.now() - mediaStarted) });
  const video = !bytes && post.kind === "video" ? sourcePath(post.videoPath || getLabStudy(author, asset)?.sourceFile || "") : null;
  if (video) {
    report({ stage: "video_extract" });
    try {
      const result = await runFile("ffmpeg", ["-v", "error", "-i", video, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
        { encoding: "buffer", maxBuffer: 16 * 1024 * 1024, timeout: 20000, signal });
      bytes = Buffer.from(result.stdout);
      source = "first frame";
    } catch { /* A missing or damaged local video can still use its archived poster. */ }
  }
  if (!bytes) {
    report({ stage: "poster_load" });
    const archived = cachedMediaUrl(`${author}/${asset}/poster`, "post");
    if (archived) {
      const response = await fetch(archived, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) return null;
      bytes = Buffer.from(await response.arrayBuffer());
    } else {
      const poster = sourcePath(post.posterPath);
      if (!poster) return null;
      try { bytes = await readFile(/* turbopackIgnore: true */ poster); } catch { return null; }
    }
  }
  const mediaMs = Math.round(performance.now() - mediaStarted);
  report({ stage: "media_ready", elapsedMs: mediaMs, source });
  report({ stage: "image_prepare" });
  const prepareStarted = performance.now();
  const compact = await sharp(bytes).rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 74 }).toBuffer();
  report({ stage: "image_ready", elapsedMs: Math.round(performance.now() - prepareStarted), source });
  return { compact, source };
}

function present(saved: Saved, cache: "hit" | "miss") {
  const luna = saved.provider === "gpt-6-luna";
  const output = saved.prediction.output;
  const yes = output?.probabilities?.find((item) => item.label?.toLowerCase() === "yes")?.probability;
  const probability = luna ? null : typeof yes === "number" ? yes : output?.answer?.toLowerCase() === "yes" ? output?.confidence ?? 0 : 1 - (output?.confidence ?? 1);
  const created = Date.parse(saved.prediction.created_at || "");
  const started = Date.parse(saved.prediction.started_at || "");
  const queueSeconds = Number.isFinite(created) && Number.isFinite(started) ? Math.max(0, (started - created) / 1000) : null;
  return { key: saved.key, author: saved.author, asset: saved.asset, object: saved.object, source: saved.source,
    provider: luna ? "OpenAI · GPT-6 Luna" : "Replicate · Jev-Omni", model: saved.model, status: saved.prediction.status,
    probability: saved.prediction.status === "succeeded" ? probability : null,
    matched: saved.prediction.status === "succeeded" ? luna ? saved.decision === true : (probability ?? 0) >= 0.75 : null,
    predictionId: saved.prediction.id, predictSeconds: saved.prediction.metrics?.predict_time ?? null,
    queueSeconds, replicateCreatedAt: saved.prediction.created_at ?? saved.createdAt,
    submitMs: saved.submitMs ?? null,
    error: saved.prediction.status === "failed" ? String(saved.prediction.error ?? "Prediction failed") : null, cache };
}

async function replicateKey() {
  const key = (process.env.REPLICATE_API_TOKEN ?? "").trim();
  if (!key.startsWith("r8_")) throw new Error("Replicate key unavailable");
  return key;
}

async function openaiKey() {
  const key = (process.env.VISUAL_LUNA_API_KEY ?? "").trim();
  if (!key.startsWith("sk-")) throw new Error("OpenAI key unavailable");
  return key;
}

async function carouselSlides(author: string, asset: string): Promise<{ index: number; total: number; url: string | null }[]> {
  const post = getPost(author, asset);
  if (!post || post.kind !== "carousel") return [];
  const accountsRoot = path.join(archiveRoot, "instagram-data", "accounts");
  const accounts = await readdir(accountsRoot).catch(() => [] as string[]);
  const account = accounts.find((entry) => entry.endsWith(`_${author}`));
  const candidates = [account ? path.join(accountsRoot, account, "feed.json") : "",
    path.join(archiveRoot, "instagram-data", "kol", author, "feed.json")].filter(Boolean);
  let raw: { items?: { code?: string; carousel_media?: { image_versions2?: { candidates?: { url?: string }[] } }[] }[] } | null = null;
  for (const candidate of candidates) {
    try { raw = JSON.parse(await readFile(/* turbopackIgnore: true */ candidate, "utf8")); break; }
    catch { /* Try the next archived feed. */ }
  }
  const media = raw?.items?.find((item) => item.code === post.code)?.carousel_media ?? [];
  if (media.length < Math.max(1, post.carouselCount))
    throw new Error(`Only ${media.length} of ${post.carouselCount} carousel slides are available in the source feed`);
  return media.map((item, index) => ({ index, total: media.length,
    url: index === 0 ? null : item.image_versions2?.candidates?.find((candidate) => candidate.url)?.url ?? null }));
}

async function createVisual(author: string, asset: string, object: string, provider: Provider, coverage: Coverage,
  report: Report, signal: AbortSignal, frameId?: string): Promise<Outcome> {
  if (frameId) return createPrediction(author, asset, object, provider, report, signal, undefined, frameId);
  const post = getPost(author, asset);
  if (coverage === "cover" || post?.kind !== "carousel" || post.carouselCount <= 1)
    return createPrediction(author, asset, object, provider, report, signal);
  let slides: Awaited<ReturnType<typeof carouselSlides>>;
  try { slides = await carouselSlides(author, asset); }
  catch (error) { return { value: { error: error instanceof Error ? error.message : "Carousel slides unavailable" }, status: 422 }; }
  let completed = 0;
  const outcomes = await Promise.all(slides.map(async (slide) => {
    const outcome = await createPrediction(author, asset, object, provider, (stage) => report({ ...stage,
      slideIndex: stage.slideIndex ?? slide.index + 1, slideTotal: slides.length }), signal, slide);
    report({ stage: "carousel_progress", slideIndex: ++completed, slideTotal: slides.length, kind: "carousel" });
    return outcome;
  }));
  const failed = outcomes.find((outcome) => outcome.status !== 200 || outcome.value.status !== "succeeded");
  if (failed) return { value: { error: failed.value.error || "Could not classify every carousel slide",
    checkedImages: completed, totalImages: slides.length,
    retryAfterSeconds: failed.value.retryAfterSeconds }, status: failed.status === 429 ? 429 : 502 };
  const matchingSlides = outcomes.flatMap((outcome, index) => outcome.value.matched === true ? [index + 1] : []);
  const cache = outcomes.every((outcome) => outcome.value.cache === "hit") ? "hit" : "miss";
  const key = createHash("sha256").update(`carousel\n${provider}\n${author}/${asset}\n${object.toLocaleLowerCase()}`)
    .update(outcomes.map((outcome) => outcome.value.key).join("\n")).digest("hex");
  return { value: { key, status: "succeeded", author, asset, object, provider: "OpenAI · GPT-6 Luna",
    model: lunaModel, source: `carousel · ${slides.length} slides`, matched: matchingSlides.length > 0,
    matchingSlides, checkedImages: slides.length, totalImages: slides.length, probability: null, cache }, status: 200 };
}

async function createPrediction(author: string, asset: string, object: string, provider: Provider, report: Report, signal: AbortSignal,
  slide?: { index: number; total: number; url: string | null }, frameId?: string): Promise<Outcome> {
  let image: Awaited<ReturnType<typeof imageFor>>;
  try { image = await imageFor(author, asset, report, signal, slide, frameId); }
  catch (error) { return { value: { error: signal.aborted ? "Scan stopped" : error instanceof Error ? error.message : "Image preparation failed" },
    status: signal.aborted ? 499 : 502 }; }
  if (signal.aborted) return { value: { error: "Scan stopped" }, status: 499 };
  if (!image) return { value: { error: frameId ? "This study frame is unavailable" : "This post has no available first frame or image" }, status: 404 };
  const selectedModel = provider === "gpt-6-luna" ? lunaModel : model;
  const key = createHash("sha256").update(selectedModel).update("\n").update(object.toLocaleLowerCase()).update("\n").update(image.compact).digest("hex");
  let cached: Saved | null;
  report({ stage: "prediction_cache" });
  const cacheStarted = performance.now();
  try { cached = await load(key); }
  catch (error) { return { value: { error: error instanceof Error ? error.message : "Visual cache unavailable" }, status: 503 }; }
  report({ stage: "prediction_cache_checked", elapsedMs: Math.round(performance.now() - cacheStarted), cache: cached ? "hit" : "miss" });
  if (signal.aborted) return { value: { error: "Scan stopped" }, status: 499 };
  if (cached && !["failed", "canceled", "aborted"].includes(cached.prediction.status || ""))
    return { value: present(cached, "hit"), status: 200 };
  if (provider === "gpt-6-luna") {
    try {
      report({ stage: "openai_submit" });
      const started = performance.now();
      const token = await openaiKey();
      report({ stage: "openai_processing" });
      const upstream = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: lunaModel, store: false, reasoning: { effort: "none" }, max_output_tokens: 120,
          input: [{ role: "user", content: [
            { type: "input_text", text: `Does this image visibly contain ${JSON.stringify(object)}? Answer true only if the object itself can be identified in the pixels. Do not infer it from text, branding, or context. Analyze this image only.` },
            { type: "input_image", image_url: `data:image/jpeg;base64,${image.compact.toString("base64")}`, detail: "auto" },
          ] }], text: { format: { type: "json_schema", name: "visual_object_presence", strict: true,
            schema: { type: "object", properties: { present: { type: "boolean" } }, required: ["present"], additionalProperties: false } } } }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]) });
      const submitMs = Math.round(performance.now() - started);
      const raw = await upstream.json() as { id?: string; status?: string; error?: { message?: string }; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
      if (upstream.status === 429) {
        const retry = Number(upstream.headers.get("Retry-After"));
        return { value: { error: raw.error?.message || "OpenAI is rate limiting image checks",
          retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.min(300, retry) : 3 }, status: 429 };
      }
      if (!upstream.ok) return { value: { error: raw.error?.message || `OpenAI returned ${upstream.status}` }, status: upstream.status };
      const outputText = raw.output?.flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "").join("") ?? "";
      let parsed: { present?: unknown } | null = null;
      try { parsed = JSON.parse(outputText); } catch { /* Reject incomplete or invalid structured output below. */ }
      if (raw.status !== "completed" || typeof parsed?.present !== "boolean")
        return { value: { error: raw.error?.message || "OpenAI did not return a complete object decision" }, status: 502 };
      if (signal.aborted) return { value: { error: "Scan stopped" }, status: 499 };
      report({ stage: "openai_completed", elapsedMs: submitMs });
      const now = new Date().toISOString();
      const saved: Saved = { key, author, asset, object, source: image.source, provider, model: lunaModel, decision: parsed.present,
        createdAt: now, updatedAt: now, submitMs, prediction: { id: raw.id, status: "succeeded", created_at: now,
          started_at: now, completed_at: now, metrics: { predict_time: submitMs / 1000 } } };
      report({ stage: "saving_prediction" });
      await save(saved);
      return { value: present(saved, "miss"), status: 200 };
    } catch (error) { return { value: { error: signal.aborted ? "Scan stopped" : error instanceof Error ? error.message : "OpenAI image check unavailable" },
      status: signal.aborted ? 499 : 502 }; }
  }
  try {
    report({ stage: "replicate_submit" });
    const submitStarted = performance.now();
    const token = await replicateKey();
    const upstream = await fetch("https://api.replicate.com/v1/predictions", { method: "POST", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "collections-platform/1.0" },
      body: JSON.stringify({ version: model, input: { image_base64: image.compact.toString("base64"),
        question_type: "yes_no", question: `Does this image visibly contain ${object}? Answer yes only when the object can be identified in the pixels, not inferred from text or context.`,
        state: "Classify only the supplied post image or the first video frame." } }), signal: AbortSignal.timeout(25000) });
    const submitMs = Math.round(performance.now() - submitStarted);
    const raw = await upstream.json() as Prediction & { detail?: string };
    if (upstream.status === 429) {
      const fromHeader = Number(upstream.headers.get("Retry-After"));
      const fromBody = Number(/(?:resets in\s*~?|expected available in\s+)(\d+)\s*(?:s|seconds?)/i.exec(raw.detail || "")?.[1]);
      const retryAfterSeconds = Math.max(1, Math.min(300, Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : fromBody || 2));
      return { value: { error: raw.detail || "Replicate is rate limiting prediction creation", retryAfterSeconds }, status: 429 };
    }
    if (!upstream.ok || !raw.id) return { value: { error: raw.detail || `Replicate returned ${upstream.status}` }, status: 502 };
    report({ stage: "replicate_accepted", elapsedMs: submitMs });
    const saved: Saved = { key, author, asset, object, source: image.source, provider, model, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), submitMs, prediction: compactPrediction(raw) };
    report({ stage: "saving_prediction" });
    await save(saved);
    return { value: present(saved, "miss"), status: 200 };
  } catch (error) { return { value: { error: error instanceof Error ? error.message : "Visual check unavailable" }, status: 502 }; }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);
  const body = await request.json().catch(() => null) as { author?: unknown; asset?: unknown; object?: unknown; provider?: unknown; coverage?: unknown; frameId?: unknown } | null;
  const author = typeof body?.author === "string" ? body.author : "";
  const asset = typeof body?.asset === "string" ? body.asset : "";
  const object = typeof body?.object === "string" ? body.object.trim().replace(/\s+/g, " ") : "";
  const provider = body?.provider === undefined ? "jev-omni" : body.provider;
  const coverage = body?.coverage === undefined ? "cover" : body.coverage;
  const frameId = body?.frameId === undefined ? undefined : typeof body.frameId === "string" ? body.frameId : "";
  if (!/^[\w.-]{1,80}$/.test(author) || !/^[\w.-]{1,150}$/.test(asset) || object.length < 2 || object.length > 80 || /[\x00-\x1f\x7f]/.test(object))
    return json({ error: "Choose a collected post and an object of 2–80 characters" }, 400);
  if (provider !== "jev-omni" && provider !== "gpt-6-luna") return json({ error: "Unknown visual search method" }, 400);
  if (coverage !== "cover" && coverage !== "all-slides") return json({ error: "Unknown visual coverage" }, 400);
  if (frameId !== undefined && (!getLabStudy(author, asset)?.frames.some((frame) => frame.id === frameId) || coverage !== "cover"))
    return json({ error: "Choose a frame from this study" }, 400);
  if (coverage === "all-slides" && provider !== "gpt-6-luna") return json({ error: "All-slide search requires GPT-6 Luna" }, 400);
  if (new URL(request.url).searchParams.get("stream") !== "1") {
    const outcome = await createVisual(author, asset, object, provider, coverage, () => undefined, request.signal, frameId);
    return json(outcome.value, outcome.status);
  }
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (message: Record<string, unknown>) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      };
      void createVisual(author, asset, object, provider, coverage, (stage) => send({ type: "stage", ...stage }),
        AbortSignal.any([request.signal, abort.signal]), frameId)
        .then((outcome) => send({ type: "result", status: outcome.status, result: outcome.value }))
        .catch((error) => send({ type: "result", status: 502, result: { error: error instanceof Error ? error.message : "Visual check unavailable" } }))
        .finally(() => { if (!closed) { closed = true; controller.close(); } });
    },
    cancel() { closed = true; abort.abort(); },
  });
  return new Response(stream, { headers: { ...noStore, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" } });
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!/^[a-f0-9]{64}$/.test(key)) return json({ error: "Invalid prediction key" }, 400);
  let saved: Saved | null;
  try { saved = await load(key); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Visual cache unavailable" }, 503); }
  if (!saved) return json({ error: "Prediction not found" }, 404);
  if (["succeeded", "failed", "canceled", "aborted"].includes(saved.prediction.status || "")) return json(present(saved, "hit"));
  try {
    const token = await replicateKey();
    const upstream = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(saved.prediction.id || "")}`, { headers: {
      Authorization: `Bearer ${token}`, "User-Agent": "collections-platform/1.0" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    const raw = await upstream.json() as Prediction;
    if (!upstream.ok) return json({ error: `Replicate returned ${upstream.status}` }, 502);
    saved.prediction = compactPrediction(raw);
    saved.updatedAt = new Date().toISOString();
    await save(saved);
    return json(present(saved, "hit"));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Prediction check unavailable" }, 502); }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!/^[a-f0-9]{64}$/.test(key)) return json({ error: "Invalid prediction key" }, 400);
  try {
    const saved = await load(key);
    if (!saved) return json({ error: "Prediction not found" }, 404);
    if (saved.provider === "gpt-6-luna" || saved.model !== model) return json({ error: "Only Replicate predictions can be canceled here" }, 400);
    if (["succeeded", "failed", "canceled", "aborted"].includes(saved.prediction.status || ""))
      return json({ status: saved.prediction.status, canceled: saved.prediction.status === "canceled" });
    if (!saved.prediction.id) return json({ error: "Prediction ID unavailable" }, 409);
    const token = await replicateKey();
    const upstream = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(saved.prediction.id)}/cancel`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "User-Agent": "collections-platform/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return json({ error: `Replicate cancellation returned ${upstream.status}` }, 502);
    const prediction = await upstream.json() as Prediction;
    saved.prediction = compactPrediction(prediction);
    saved.updatedAt = new Date().toISOString();
    await save(saved);
    return json({ status: saved.prediction.status, canceled: saved.prediction.status === "canceled" });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Could not cancel prediction" }, 502); }
}
