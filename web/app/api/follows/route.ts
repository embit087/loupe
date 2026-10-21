import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { getAuthor } from "@/lib/atlas";
import { validViewerId, viewerCookieName } from "@/lib/viewer";

const workerUrl = collectionsWorkerUrl;
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const viewerId = validViewerId(request.cookies.get(viewerCookieName)?.value);
  if (!viewerId) return NextResponse.json({ authors: [] }, { headers: noStore });

  try {
    const upstream = await fetch(`${workerUrl}/api/follows`, {
      headers: { "X-Collections-Viewer": viewerId },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Follow service unavailable" }, { status: 503, headers: noStore });
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: noStore });
  }
  const input = body as Record<string, unknown>;
  if (typeof input.author !== "string" || !getAuthor(input.author) || typeof input.following !== "boolean") {
    return NextResponse.json({ error: "Invalid follow" }, { status: 400, headers: noStore });
  }

  const viewerId = validViewerId(request.cookies.get(viewerCookieName)?.value) ?? crypto.randomUUID();
  try {
    const upstream = await fetch(`${workerUrl}/api/follows`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: input.author, following: input.following, viewerId }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const result = await upstream.json();
    const response = NextResponse.json(result, { status: upstream.status, headers: noStore });
    if (upstream.ok) response.cookies.set(viewerCookieName, viewerId, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Follow service unavailable" }, { status: 503, headers: noStore });
  }
}
