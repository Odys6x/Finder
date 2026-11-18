import type { NextRequest } from "next/server";
import { setSetting } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** POST { cop_year } — the yearly "bump cop_year" step (late Dec). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const year = Number(body?.cop_year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return Response.json({ error: "cop_year must be a year" }, { status: 400 });
  }
  await setSetting("cop_year", year);
  return Response.json({ ok: true, cop_year: year });
}
