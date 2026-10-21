import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPost } from "@/lib/atlas";
import { getLabStudy } from "@/lib/experiment-lab";
import { cachedMediaUrl } from "@/lib/media-cache";

export const runtime = "nodejs";

type Props = { params: Promise<{ author: string; asset: string; variant: string }> };

const archiveRoot = path.resolve(/*turbopackIgnore: true*/ process.env.COLLECTIONS_SOURCE_ROOT || path.join(process.cwd(), "..", "sample-archive"));

export async function GET(request: Request, { params }: Props) {
  const { author, asset, variant } = await params;
  const post = getPost(author, asset);
  if (!post || (variant !== "poster" && variant !== "video")) return new Response("Not found", { status: 404 });

  const cached = cachedMediaUrl(`${author}/${asset}/${variant}`, "post");
  if (cached) return Response.redirect(cached, 307);

  // A lab study keeps its own copy of the video once the signed URL may have expired.
  const videoPath = post.videoPath || getLabStudy(author, asset)?.sourceFile || "";
  if (variant === "video" && !videoPath) {
    return new Response("Video not archived", { status: 404 });
  }

  const relativePath = variant === "poster" ? post.posterPath : videoPath;
  if (!relativePath) return new Response("Not found", { status: 404 });
  const file = path.resolve(archiveRoot, relativePath);
  if (!file.startsWith(archiveRoot + path.sep)) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readFile(/*turbopackIgnore: true*/ file);
  } catch {
    return new Response("Local archive asset unavailable", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": variant === "poster" ? "image/jpeg" : "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  const range = request.headers.get("range");
  if (range && variant === "video") {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : bytes.length - 1;
    if (start >= bytes.length || end < start || end >= bytes.length) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    }
    const slice = bytes.subarray(start, end + 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
    headers.set("Content-Length", String(slice.length));
    return new Response(new Uint8Array(slice), { status: 206, headers });
  }
  headers.set("Content-Length", String(bytes.length));
  return new Response(new Uint8Array(bytes), { headers });
}
