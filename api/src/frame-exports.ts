type Env = { ASSETS: R2Bucket };

const hashPattern = /^[a-f0-9]{64}$/;
const maxBytes = 12 * 1024 * 1024;

export async function handleFrameExports(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/lab-frame-export/")) return null;
  const hash = path.slice("/api/lab-frame-export/".length);
  if (!hashPattern.test(hash)) return Response.json({ error: "Invalid asset" }, { status: 400 });
  const objectKey = `frame-exports/${hash}.png`;
  if (request.method === "PUT") {
    if (request.headers.get("content-type") !== "image/png") return Response.json({ error: "PNG required" }, { status: 415 });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > maxBytes) return Response.json({ error: "Invalid frame size" }, { status: 400 });
    const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== hash) return Response.json({ error: "Frame hash mismatch" }, { status: 400 });
    if (!await env.ASSETS.head(objectKey)) await env.ASSETS.put(objectKey, bytes, { httpMetadata: { contentType: "image/png" } });
    return Response.json({ hash, saved: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (request.method === "GET") {
    const object = await env.ASSETS.get(objectKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "ETag": object.httpEtag } });
  }
  return new Response("Method not allowed", { status: 405 });
}
