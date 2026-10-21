const objectPath = /^\/objects\/([a-f0-9]{64})\.(jpg|png|mp4)$/;

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const match = objectPath.exec(new URL(request.url).pathname);
    if (!match) return new Response("Not found", { status: 404 });
    const key = `collections-platform/media/objects/${match[1]}.${match[2]}`;
    const range = request.headers.get("Range");
    if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range)) return new Response("Invalid range", { status: 416 });
    const object = request.method === "HEAD"
      ? await env.MEDIA.head(key)
      : await env.MEDIA.get(key, range ? { range: request.headers } : undefined);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    if (range && "range" in object && object.range) {
      const start = object.range.offset;
      const length = object.range.length;
      headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
      headers.set("Content-Length", String(length));
      return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(object.size));
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  },
};
