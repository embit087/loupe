import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { getLabStudy } from "@/lib/experiment-lab";
import { labWorkspaceId } from "@/lib/lab-workspace";

const workerUrl = collectionsWorkerUrl;
const noStore = { "Cache-Control": "no-store" };

function validLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 48
    && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
}

export async function GET(request: NextRequest) {
  const author = request.nextUrl.searchParams.get("author") ?? "";
  const asset = request.nextUrl.searchParams.get("asset") ?? "";
  if (!getLabStudy(author, asset)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404, headers: noStore });
  }
  try {
    const url = new URL(`${workerUrl}/api/lab-frames`);
    url.searchParams.set("author", author);
    url.searchParams.set("asset", asset);
    const upstream = await fetch(url, {
      headers: { "X-Collections-Viewer": labWorkspaceId },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Frame labels unavailable" }, { status: 503, headers: noStore });
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
  const study = typeof input.author === "string" && typeof input.asset === "string"
    ? getLabStudy(input.author, input.asset) : undefined;
  if (!study || !Array.isArray(input.frameIds) || input.frameIds.length < 1
    || input.frameIds.length > study.frames.length
    || !input.frameIds.every((id) => typeof id === "string" && study.frames.some((frame) => frame.id === id))
    || !Array.isArray(input.labels) || input.labels.length < 1 || input.labels.length > 12
    || !input.labels.every(validLabel) || typeof input.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid frame labels" }, { status: 400, headers: noStore });
  }
  try {
    const upstream = await fetch(`${workerUrl}/api/lab-frames`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: input.author, asset: input.asset,
        frameIds: [...new Set(input.frameIds)], labels: [...new Set(input.labels)], enabled: input.enabled,
        viewerId: labWorkspaceId }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Frame labels unavailable" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  const name = body && typeof body === "object" ? (body as Record<string, unknown>).name : undefined;
  if (!validLabel(name)) {
    return NextResponse.json({ error: "Invalid custom label" }, { status: 400, headers: noStore });
  }
  try {
    const upstream = await fetch(`${workerUrl}/api/lab-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, viewerId: labWorkspaceId }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Frame labels unavailable" }, { status: 503, headers: noStore });
  }
}
