import type { NextRequest } from "next/server";
import { geocode } from "@/lib/geo";

export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; v: Awaited<ReturnType<typeof geocode>> }>();

/** OneMap proxy with a small in-memory cache. The query is not logged or stored. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!q) return Response.json({ error: "Missing q" }, { status: 400 });
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return Response.json({ result: hit.v });
  try {
    const v = await geocode(q);
    if (cache.size > 2000) cache.clear();
    cache.set(q, { at: Date.now(), v });
    return Response.json({ result: v });
  } catch {
    return Response.json({ error: "Location lookup failed. Try again." }, { status: 502 });
  }
}
