import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLabFrame, getLabStudy, labFrameSourceHash, labFrameUid, labStudyHref } from "@/lib/experiment-lab";
import { cachedMediaUrl } from "@/lib/media-cache";

export const runtime = "nodejs";

type Props = { params: Promise<{ author: string; asset: string; frame: string; variant: string }> };

const archiveRoot = path.resolve(/*turbopackIgnore: true*/ process.env.COLLECTIONS_SOURCE_ROOT || path.join(process.cwd(), "..", "sample-archive"));

export async function GET(_request: Request, { params }: Props) {
  const { author, asset, frame, variant } = await params;
  const study = getLabStudy(author, asset);
  const frameData = study && getLabFrame(study, frame);
  if (!study || !frameData || (variant !== "thumb" && variant !== "full")) {
    return new Response("Not found", { status: 404 });
  }

  const cached = cachedMediaUrl(`${author}/${asset}/${frame}/${variant}`, "frame");
  if (cached) return Response.redirect(cached, 307);

  const folder = variant === "thumb" ? "thumbs" : "frames";
  const extension = variant === "thumb" ? "jpg" : "png";
  const file = path.join(archiveRoot, "output", "data", "experiment-lab", path.parse(study.asset).name, folder, `${frame}.${extension}`);
  let bytes: Buffer;
  try {
    bytes = await readFile(/*turbopackIgnore: true*/ file);
  } catch {
    return new Response("Local lab frame unavailable", { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": variant === "thumb" ? "image/jpeg" : "image/png",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${labFrameSourceHash(study, frameData)}-f${frameData.sourceFrame}.${extension}"`,
      "X-Collections-Frame-Id": labFrameUid(study, frameData),
      "Link": `<${labStudyHref(study)}>; rel="describedby"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
