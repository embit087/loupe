import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { labWorkspaceId } from "@/lib/lab-workspace";

const workerUrl = collectionsWorkerUrl;
const noStore = { "Cache-Control": "no-store" };
const allowed = new Set(["news", "calendar", "cost", "dedup", "dedup/confirm", "theme-match", "lab", "jev-settings", "translation"]);

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }, method: "GET" | "POST" | "PUT") {
  const { path } = await context.params;
  const action = path.join("/");
  if (!allowed.has(action) ||
    method === "GET" && !["news", "calendar", "cost", "dedup", "lab", "jev-settings", "translation"].includes(action) ||
    method === "POST" && !["news", "dedup", "dedup/confirm", "theme-match", "translation"].includes(action) ||
    method === "PUT" && !["lab", "jev-settings"].includes(action))
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  }
  try {
    const upstream = await fetch(`${workerUrl}/api/topics/${action}${request.nextUrl.search}`, {
      method,
      headers: { "X-Collections-Viewer": labWorkspaceId, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
      body: method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(method === "POST" && action === "theme-match" ? 180000 :
        method === "POST" && ["news", "dedup", "translation"].includes(action) ? 75000 : 40000),
    });
    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Topics service unavailable" }, { status: 503, headers: noStore });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context, "GET");
}
export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context, "POST");
}
export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context, "PUT");
}
