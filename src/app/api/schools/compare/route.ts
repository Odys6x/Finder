import type { NextRequest } from "next/server";
import { config, SCHOOLFINDER_URL } from "@/lib/config";
import { getPermittedCops, getSchool } from "@/lib/repo";
import { hasPass } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Side-by-side comparison (Season Pass feature). */
export async function GET(req: NextRequest) {
  if (!(await hasPass())) return Response.json({ error: "pass-required" }, { status: 402 });
  const codes = (req.nextUrl.searchParams.get("codes") ?? "").split(",").filter(Boolean).slice(0, 10);
  const cops = await getPermittedCops();
  const schools = (await Promise.all(codes.map((c) => getSchool(c)))).filter((s) => s !== null);
  return Response.json({
    copPermitted: config.copSourcePermitted,
    schools: schools.map((s) => ({
      code: s.school_code,
      name: s.name,
      type: s.type,
      nature: s.nature,
      zone: s.zone,
      lat: s.lat,
      lng: s.lng,
      mrt: s.nearest_mrt,
      sap: s.is_sap,
      ip: s.is_ip,
      mother_tongues: s.mother_tongues,
      ccas: s.ccas.map((c) => c.name),
      subjects: s.subjects,
      programmes: s.moe_programmes,
      alp: s.alp,
      llp: s.llp,
      electives: s.electives,
      cop: config.copSourcePermitted ? (cops.get(s.school_code) ?? null) : null,
      schoolfinderUrl: s.schoolfinder_url ?? SCHOOLFINDER_URL,
    })),
  });
}
