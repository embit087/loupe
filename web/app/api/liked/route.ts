import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { validViewerId, viewerCookieName } from "@/lib/viewer";

const workerUrl = collectionsWorkerUrl;

export async function GET(request: NextRequest) {
  const viewerId = validViewerId(request.cookies.get(viewerCookieName)?.value);
  if (!viewerId) return NextResponse.json({ posts: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    const upstream = await fetch(`${workerUrl}/api/annotations/liked`, {
      headers: { "X-Collections-Viewer": viewerId },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Annotation service unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
