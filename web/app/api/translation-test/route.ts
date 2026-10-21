export const runtime = "nodejs";

const models = new Set([
  "gpt-5.4", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1",
  "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5-mini", "gpt-5-nano",
]);
const targets: Record<string, string> = {
  "zh-TW": "Traditional Chinese as used in Taiwan",
  ja: "Japanese",
  fr: "French",
};
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || request.headers.get("origin") !== url.origin) {
    return Response.json({ error: "This test is available only from the local page." }, { status: 403, headers: noStore });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers: noStore });
  }
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid request." }, { status: 400, headers: noStore });
  }
  const { model, input, target } = payload as Record<string, unknown>;
  if (typeof model !== "string" || !models.has(model) || typeof input !== "string" || !input.trim() || input.length > 5000 || typeof target !== "string" || !targets[target]) {
    return Response.json({ error: "Choose a listed model, target language, and text of at most 5,000 characters." }, { status: 400, headers: noStore });
  }

  let apiKey: string;
  try {
    apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey.startsWith("sk-")) throw new Error("Invalid key format");
  } catch {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503, headers: noStore });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        instructions: `Translate the English social-media post into ${targets[target]}. Preserve meaning, paragraph breaks, handles, hashtags, and emoji. Output only the translation, without notes or a preface.`,
        input: input.trim(),
        ...(new Set(["gpt-5", "gpt-5-mini", "gpt-5-nano"]).has(model) ? { reasoning: { effort: "minimal" } } : {}),
        max_output_tokens: 1800,
        store: false,
        stream: true,
      }),
      cache: "no-store",
      signal: request.signal,
    });
    if (!upstream.ok || !upstream.body) {
      const errorBody = await upstream.json().catch(() => null) as { error?: { message?: string } } | null;
      const message = errorBody?.error?.message ?? `OpenAI returned HTTP ${upstream.status}.`;
      return Response.json({ error: message }, { status: upstream.status, headers: noStore });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json({ error: "Could not connect to OpenAI." }, { status: 502, headers: noStore });
  }
}
