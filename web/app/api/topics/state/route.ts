import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { validViewerId, viewerCookieName } from "@/lib/viewer";

const workerUrl = collectionsWorkerUrl;
const noStore = { "Cache-Control": "no-store" };

async function forward(request: NextRequest, method: "GET" | "POST" | "PUT" | "DELETE") {
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  }
  const existing = validViewerId(request.cookies.get(viewerCookieName)?.value);
  if (method === "GET" && !existing) return NextResponse.json({ items: [], directions: [] }, { headers: noStore });
  const viewerId = existing ?? crypto.randomUUID();
  try {
    const upstream = await fetch(`${workerUrl}/api/topics/state`, {
      method,
      headers: { "X-Collections-Viewer": viewerId, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
      body: method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const result = await upstream.json();
    const response = NextResponse.json(result, { status: upstream.status, headers: noStore });
    if (upstream.ok && !existing) response.cookies.set(viewerCookieName, viewerId, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "News state unavailable" }, { status: 503, headers: noStore });
  }
}

export function GET(request: NextRequest) { return forward(request, "GET"); }
export function POST(request: NextRequest) { return forward(request, "POST"); }
export function PUT(request: NextRequest) { return forward(request, "PUT"); }
export function DELETE(request: NextRequest) { return forward(request, "DELETE"); }
