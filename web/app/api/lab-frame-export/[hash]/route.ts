import { NextRequest } from "next/server";
import { customLabFetch } from "@/lib/custom-lab";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return new Response("Invalid asset", { status: 400 });
  try {
    const upstream = await customLabFetch(`/api/lab-frame-export/${hash}`);
    if (!upstream.ok) return new Response("Not found", { status: upstream.status });
    return new Response(upstream.body, { headers: {
      "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable",
      ...(upstream.headers.get("etag") ? { ETag: upstream.headers.get("etag")! } : {}),
    } });
  } catch { return new Response("Frame unavailable", { status: 503 }); }
}
