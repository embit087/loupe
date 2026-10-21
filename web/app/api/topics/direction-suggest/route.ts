import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { validViewerId, viewerCookieName } from "@/lib/viewer";

const workerUrl = collectionsWorkerUrl;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const existing = validViewerId(request.cookies.get(viewerCookieName)?.value);
  const viewerId = existing ?? crypto.randomUUID();
  try {
    const body = await request.text();
    if (body.length > 4096)
      return NextResponse.json({ error: "Topic input is too long" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    const upstream = await fetch(`${workerUrl}/api/topics/direction-suggest`, {
      method: "POST", headers: { "X-Collections-Viewer": viewerId, "Content-Type": "application/json" },
      body, cache: "no-store", signal: AbortSignal.timeout(50_000),
    });
    const result = await upstream.json();
    const response = NextResponse.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    if (!existing) response.cookies.set(viewerCookieName, viewerId, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Suggestion service unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
