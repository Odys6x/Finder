import { adminCopStats, getCopYear, getDataFreshness, getSchools, recentRefreshes } from "@/lib/repo";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const [schools, copYear, copStats, log, fresh] = await Promise.all([
    getSchools(),
    getCopYear(),
    adminCopStats(),
    recentRefreshes(10),
    getDataFreshness(),
  ]);
  return Response.json({
    schoolCount: schools.length,
    withCoords: schools.filter((s) => s.lat !== null).length,
    withSchoolFinderUrl: schools.filter((s) => s.schoolfinder_url).length,
    withAffiliations: schools.filter((s) => s.affiliated_primary_schools.length).length,
    withBlurb: schools.filter((s) => s.culture_blurb).length,
    copYear,
    copStats,
    copSourcePermitted: config.copSourcePermitted,
    dataGovAsOf: fresh.dataGov,
    log,
  });
}
