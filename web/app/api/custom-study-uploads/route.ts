import { NextRequest, NextResponse } from "next/server";
import { customLabFetch } from "@/lib/custom-lab";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxBytes = 50 * 1024 * 1024;
const mimeByExtension: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/markdown", ".vtt": "text/vtt", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg",
};

function uploadMime(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  return mimeByExtension[extension] ?? "application/octet-stream";
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const form = await request.formData().catch(() => null);
  const studyId = form?.get("studyId");
  const file = form?.get("file");
  const assetKind = form?.get("assetKind");
  if (typeof studyId !== "string" || !uuid.test(studyId) || !(file instanceof File)
    || !file.size || file.size > maxBytes || !file.name || file.name.length > 200
    || (assetKind !== "auto" && assetKind !== "transcript" && assetKind !== "ocr"))
    return NextResponse.json({ error: "Choose a file up to 50 MB" }, { status: 400, headers: noStore });
  try {
    const bytes = await file.arrayBuffer();
    const response = await customLabFetch(`/api/custom-study-uploads?studyId=${encodeURIComponent(studyId)}`, {
      method: "PUT",
      headers: { "Content-Type": uploadMime(file), "X-File-Name": file.name,
        "X-File-Size": String(bytes.byteLength), "X-Asset-Kind": assetKind },
      body: bytes,
      signal: AbortSignal.timeout(60000),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Upload unavailable" }, { status: 503, headers: noStore });
  }
}
