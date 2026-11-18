import type { NextRequest } from "next/server";
import { z } from "zod";
import { commuteEnabled, getCommute } from "@/lib/commute";
import { getSchool } from "@/lib/repo";

export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().max(80),
  home: z.object({ lat: z.number().min(1).max(2), lng: z.number().min(103).max(105) }),
});

/** Commute for one school. POST so the home location stays out of URLs and logs. */
export async function POST(req: NextRequest) {
  if (!commuteEnabled()) return Response.json({ enabled: false, commute: null });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const s = await getSchool(parsed.data.code);
  if (!s || s.lat === null || s.lng === null) return Response.json({ error: "Unknown school" }, { status: 404 });
  try {
    const commute = await getCommute(parsed.data.home, { code: s.school_code, lat: s.lat, lng: s.lng });
    return Response.json({ enabled: true, commute });
  } catch {
    return Response.json({ enabled: true, commute: null, error: "Route lookup failed" }, { status: 502 });
  }
}
