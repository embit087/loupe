import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { customLabFetch } from "@/lib/custom-lab";
import { getLabFrame, getLabStudy } from "@/lib/experiment-lab";
import { cachedMediaUrl } from "@/lib/media-cache";

export const runtime = "nodejs";
const archiveRoot = path.resolve(/*turbopackIgnore: true*/ process.env.COLLECTIONS_SOURCE_ROOT || path.join(process.cwd(), "..", "sample-archive"));
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => null) as { author?: unknown; asset?: unknown; frameIds?: unknown } | null;
  if (typeof body?.author !== "string" || typeof body.asset !== "string" ||
    !Array.isArray(body.frameIds) || body.frameIds.length < 1 || body.frameIds.length > 300 ||
    body.frameIds.some((id) => typeof id !== "string"))
    return NextResponse.json({ error: "Select 1–300 frames" }, { status: 400, headers: noStore });
  const study = getLabStudy(body.author, body.asset);
  if (!study || body.frameIds.some((id) => !getLabFrame(study, id)))
    return NextResponse.json({ error: "Unknown frame" }, { status: 404, headers: noStore });
  try {
    const frames: { id: string; url: string }[] = [];
    for (let start = 0; start < body.frameIds.length; start += 4) {
      const batch = await Promise.all(body.frameIds.slice(start, start + 4).map(async (id) => {
        const archived = cachedMediaUrl(`${study.author}/${study.asset}/${id}/full`, "frame");
        let bytes: Uint8Array;
        if (archived) {
          const response = await fetch(archived, { signal: AbortSignal.timeout(60000) });
          if (!response.ok) throw new Error(`Archived frame ${id} is unavailable`);
          bytes = new Uint8Array(await response.arrayBuffer());
        } else {
          const file = path.join(archiveRoot, "output", "data", "experiment-lab", path.parse(study.asset).name, "frames", `${id}.png`);
          bytes = new Uint8Array(await readFile(file));
        }
        const hash = createHash("sha256").update(bytes).digest("hex");
        const upstream = await customLabFetch(`/api/lab-frame-export/${hash}`, {
          method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array(bytes),
          signal: AbortSignal.timeout(60000),
        });
        if (!upstream.ok) throw new Error(`Upload failed for frame ${id}`);
        return { id, url: new URL(`/api/lab-frame-export/${hash}`, request.nextUrl.origin).toString() };
      }));
      frames.push(...batch);
    }
    return NextResponse.json({ frames }, { headers: noStore });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Frame export unavailable" }, { status: 503, headers: noStore });
  }
}
