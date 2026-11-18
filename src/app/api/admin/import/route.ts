import type { NextRequest } from "next/server";
import { parseCopCsv, parseSchoolFinderCsv } from "@/lib/csv-import";
import { getCopYear, logRefresh, makeResolver, updateSchoolFinderFields, upsertCops } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * POST { kind: "cops" | "schoolfinder", csv: string, commit: boolean }
 * Always validates; only writes when commit=true and there are no errors.
 * Protected by src/proxy.ts (Basic auth).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!csv || (kind !== "cops" && kind !== "schoolfinder")) {
    return Response.json({ error: "Provide kind and csv" }, { status: 400 });
  }
  if (csv.length > 2_000_000) return Response.json({ error: "CSV too large" }, { status: 413 });

  const resolve = await makeResolver();
  const result = kind === "cops" ? parseCopCsv(csv, resolve, await getCopYear()) : parseSchoolFinderCsv(csv, resolve);

  let committed = false;
  if (body.commit === true && result.errors.length === 0 && result.rows.length > 0) {
    if (kind === "cops") await upsertCops(result.rows as Parameters<typeof upsertCops>[0]);
    else await updateSchoolFinderFields(result.rows as Parameters<typeof updateSchoolFinderFields>[0]);
    await logRefresh(kind === "cops" ? "cop-import" : "schoolfinder-import", "ok", `Imported ${result.rows.length} rows`);
    committed = true;
  }
  return Response.json({
    committed,
    rowCount: result.rows.length,
    errors: result.errors,
    warnings: result.warnings,
    preview: result.rows.slice(0, 20),
  });
}
