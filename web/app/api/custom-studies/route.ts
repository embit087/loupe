import { NextRequest, NextResponse } from "next/server";
import { customLabFetch, getCustomStudy } from "@/lib/custom-lab";

const noStore = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    if (!uuid.test(id)) return NextResponse.json({ error: "Invalid study" }, { status: 400, headers: noStore });
    const detail = await getCustomStudy(id);
    return NextResponse.json(detail ?? { error: "Study unavailable" }, { status: detail ? 200 : 404, headers: noStore });
  }
  const category = request.nextUrl.searchParams.get("category");
  if (category !== "design" && category !== "kol" && category !== "topics")
    return NextResponse.json({ error: "Invalid category" }, { status: 400, headers: noStore });
  try {
    const response = await customLabFetch(`/api/custom-studies?category=${category}`);
    return NextResponse.json(await response.json(), { status: response.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Studies unavailable" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Invalid study" }, { status: 400, headers: noStore });
  const body = input as Record<string, unknown>;
  if (body.category !== "design" && body.category !== "kol" && body.category !== "topics")
    return NextResponse.json({ error: "Invalid category" }, { status: 400, headers: noStore });
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled study";
  if (title.length > 120) return NextResponse.json({ error: "Title is too long" }, { status: 400, headers: noStore });
  try {
    const response = await customLabFetch("/api/custom-studies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), category: body.category, title }),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Could not create study" }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers: noStore });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Invalid study" }, { status: 400, headers: noStore });
  const body = input as Record<string, unknown>;
  if (typeof body.id !== "string" || !uuid.test(body.id)
    || typeof body.title !== "string" || !body.title.trim() || body.title.length > 120)
    return NextResponse.json({ error: "Invalid title" }, { status: 400, headers: noStore });
  try {
    const response = await customLabFetch("/api/custom-studies", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: body.id, title: body.title.trim() }),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Could not rename study" }, { status: 503, headers: noStore });
  }
}
