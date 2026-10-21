import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getPost } from "@/lib/atlas";
import { customLabFetch, getCustomStudy, postInCustomStudyCategory } from "@/lib/custom-lab";
import { getLabFrame, getLabStudy } from "@/lib/experiment-lab";

const noStore = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const archiveKinds = new Set(["post", "caption", "poster", "video", "audio", "frame", "transcript", "ocr"]);
const pastedKinds = new Set(["transcript", "ocr", "note"]);
const urlKinds = new Set(["image", "video", "audio", "file"]);

function invalid(message: string) { return NextResponse.json({ error: message }, { status: 400, headers: noStore }); }
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return invalid("Invalid asset");
  const body = input as Record<string, unknown>;
  if (typeof body.studyId !== "string" || !uuid.test(body.studyId) || typeof body.kind !== "string")
    return invalid("Invalid asset");
  const detail = await getCustomStudy(body.studyId);
  if (!detail) return NextResponse.json({ error: "Study unavailable" }, { status: 404, headers: noStore });

  const id = crypto.randomUUID();
  let sourceKey: string;
  let author: string | undefined;
  let asset: string | undefined;
  let frameId: string | undefined;
  let topicItemId: string | undefined;
  let textContent: string | undefined;
  let externalUrl: string | undefined;

  if (body.kind === "article" && typeof body.topicItemId === "string") {
    if (detail.study.category !== "topics" || !/^[a-f0-9]{32}$/.test(body.topicItemId))
      return invalid("Choose a saved Topics source");
    topicItemId = body.topicItemId;
    sourceKey = `article:${topicItemId}`;
  } else if (typeof body.author === "string" && typeof body.asset === "string") {
    if (detail.study.category === "topics") return invalid("Choose a saved Topics source");
    author = body.author;
    asset = body.asset;
    if (!archiveKinds.has(body.kind) || !postInCustomStudyCategory(author, asset, detail.study.category))
      return invalid("That archive asset is unavailable in this collection");
    const post = getPost(author, asset)!;
    const labStudy = getLabStudy(author, asset);
    if (body.kind === "caption" && !post.caption.trim()) return invalid("This post has no wording");
    if (body.kind === "poster" && !post.posterPath) return invalid("This post has no saved cover image");
    if ((body.kind === "video" || body.kind === "audio") && post.kind !== "video")
      return invalid("This post has no video track");
    if (body.kind === "frame") {
      if (typeof body.frameId !== "string" || !labStudy || !getLabFrame(labStudy, body.frameId))
        return invalid("Frame unavailable");
      frameId = body.frameId;
    }
    if ((body.kind === "transcript" || body.kind === "ocr") && !labStudy?.analysis)
      return invalid("No processed text is available for this post");
    sourceKey = `${body.kind}:${author}/${asset}${frameId ? `/${frameId}` : ""}`;
  } else if (typeof body.textContent === "string") {
    if (!pastedKinds.has(body.kind) || !body.textContent.trim() || body.textContent.length > 100000)
      return invalid("Invalid pasted content");
    textContent = body.textContent.trim();
    sourceKey = `pasted:${id}`;
  } else if (typeof body.externalUrl === "string") {
    if (!urlKinds.has(body.kind) || body.externalUrl.length > 2048) return invalid("Invalid media URL");
    try {
      const url = new URL(body.externalUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return invalid("Use an HTTP or HTTPS URL");
      externalUrl = url.toString();
    } catch { return invalid("Invalid media URL"); }
    sourceKey = `url:${body.kind}:${createHash("sha256").update(externalUrl).digest("hex")}`;
  } else {
    return invalid("Choose an archive item, paste content, or add a URL");
  }

  try {
    const response = await customLabFetch("/api/custom-study-assets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, studyId: body.studyId, kind: body.kind, sourceKey,
        author, asset, frameId, topicItemId, textContent, externalUrl }),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Could not add asset" }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return invalid("Invalid asset");
  const body = input as Record<string, unknown>;
  if (typeof body.studyId !== "string" || !uuid.test(body.studyId)
    || typeof body.id !== "string" || !uuid.test(body.id)) return invalid("Invalid asset");
  try {
    const response = await customLabFetch("/api/custom-study-assets", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyId: body.studyId, id: body.id }),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Could not remove asset" }, { status: 503, headers: noStore });
  }
}
