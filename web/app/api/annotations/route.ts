import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { NextRequest, NextResponse } from "next/server";
import { getPost } from "@/lib/atlas";
import { validViewerId, viewerCookieName } from "@/lib/viewer";

const workerUrl = collectionsWorkerUrl;

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function forward(request: NextRequest, method: "POST" | "PUT") {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return badRequest("Invalid origin", 403);

  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("Invalid JSON"); }
  if (!body || typeof body !== "object") return badRequest("Invalid body");
  const input = body as Record<string, unknown>;

  if (method === "POST") {
    if (!Array.isArray(input.posts) || input.posts.length > 100 ||
      !input.posts.every((post) => post && typeof post === "object" &&
        typeof post.author === "string" && typeof post.asset === "string" && getPost(post.author, post.asset))) {
      return badRequest("Expected at most 100 collected posts");
    }
  } else if (typeof input.author !== "string" || typeof input.asset !== "string" ||
    !getPost(input.author, input.asset) || ![-1, 0, 1].includes(input.reaction as number)) {
    return badRequest("Invalid reaction");
  }

  const viewerId = validViewerId(request.cookies.get(viewerCookieName)?.value) ?? crypto.randomUUID();
  try {
    const upstream = await fetch(`${workerUrl}/api/annotations`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, viewerId }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const result = await upstream.json();
    const response = NextResponse.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    response.cookies.set(viewerCookieName, viewerId, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch {
    return badRequest("Annotation service unavailable", 503);
  }
}

export function POST(request: NextRequest) { return forward(request, "POST"); }
export function PUT(request: NextRequest) { return forward(request, "PUT"); }
