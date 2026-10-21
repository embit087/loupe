import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { getPost } from "@/lib/atlas";
import { isLabCategory } from "@/lib/lab-categories";
import { labWorkspaceId } from "@/lib/lab-workspace";

const workerUrl = collectionsWorkerUrl;
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const upstream = await fetch(`${workerUrl}/api/lab-posts`, {
      headers: { "X-Collections-Viewer": labWorkspaceId },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Exp Lab unavailable" }, { status: 503, headers: noStore });
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
  const validAction = typeof input.selected === "boolean"
    || (isLabCategory(input.category) && typeof input.enabled === "boolean");
  if (typeof input.author !== "string" || typeof input.asset !== "string"
    || !getPost(input.author, input.asset) || !validAction) {
    return NextResponse.json({ error: "Invalid lab post" }, { status: 400, headers: noStore });
  }

  try {
    const upstream = await fetch(`${workerUrl}/api/lab-posts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: input.author, asset: input.asset,
        ...(typeof input.selected === "boolean" ? { selected: input.selected } : { category: input.category, enabled: input.enabled }), viewerId: labWorkspaceId }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Exp Lab unavailable" }, { status: 503, headers: noStore });
  }
}
