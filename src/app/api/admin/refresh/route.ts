import { after } from "next/server";
import { config } from "@/lib/config";
import { pullDataGov } from "@/lib/datagov";
import { getSchools, logRefresh, recentRefreshes, upsertDataGovSchools } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Kick off a data.gov.sg refresh in the background; progress is written to refresh_log.
 * The "already running" check uses the DB, so it holds across serverless instances.
 * Runs inside after(), so it is bounded by maxDuration (check your Vercel plan's limit).
 */
export async function POST() {
  if (await refreshRunning()) return Response.json({ error: "A refresh is already running" }, { status: 409 });
  const id = await logRefresh("datagov", "running", "Started");
  after(async () => {
    const lines: string[] = [];
    try {
      const existing = await getSchools();
      const knownCoords = new Map(
        existing.filter((s) => s.lat !== null && s.lng !== null).map((s) => [s.postal_code, { lat: s.lat!, lng: s.lng! }]),
      );
      const res = await pullDataGov({
        apiKey: config.dataGov.apiKey,
        knownCoords,
        log: (m) => {
          lines.push(m);
          void logRefresh("datagov", "running", lines.slice(-3).join(" | "), id);
        },
      });
      await upsertDataGovSchools(res.schools);
      const unmatched = res.unmatched.map((u) => `${u.dataset}: ${u.names.length}`).join(", ");
      await logRefresh("datagov", "ok", `Updated ${res.schools.length} schools.${unmatched ? ` Unmatched rows — ${unmatched}` : ""}`, id);
    } catch (e) {
      await logRefresh("datagov", "error", (e as Error).message, id);
    }
  });
  return Response.json({ started: true, id });
}

/** A "running" row younger than 10 minutes means a refresh is in progress (older = it died). */
async function refreshRunning() {
  const recent = await recentRefreshes(5);
  return recent.some(
    (r) => r.kind === "datagov" && r.status === "running" && Date.now() - r.started_at.getTime() < 10 * 60_000,
  );
}
