import { customLabFetch } from "@/lib/custom-lab";

export const runtime = "nodejs";
type Props = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: Props) {
  const { id } = await params;
  if (!uuid.test(id)) return new Response("Not found", { status: 404 });
  try {
    const headers = new Headers();
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);
    const upstream = await customLabFetch(`/api/custom-study-files/${id}`, {
      headers, signal: AbortSignal.timeout(30000),
    });
    const responseHeaders = new Headers();
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition", "cache-control"]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response("File unavailable", { status: 503 });
  }
}
