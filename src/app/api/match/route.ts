import { after, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { commuteEnabled, getCommutes } from "@/lib/commute";
import { haversineKm } from "@/lib/geo";
import { excludeReason, matchSchools } from "@/lib/matching";
import { parseProfile } from "@/lib/profile-schema";
import { getCopYear, getPermittedCops, getSchools } from "@/lib/repo";
import { hasPass } from "@/lib/session";

export const dynamic = "force-dynamic";
// Room for the 4s commute budget plus background lookups via after().
export const maxDuration = 60;

/** Only route the schools a family could realistically pick, to keep OneMap calls low. */
const COMMUTE_RADIUS_KM = 15;
const COMMUTE_MAX_SCHOOLS = 40;

/**
 * Smart matching. The profile is used for this request only and not stored (PDPA).
 * Gating happens here, server-side: free users get a preview plus band counts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const profile = parseProfile(body?.profile);
  const [schools, cops, paid, copYear] = await Promise.all([getSchools(), getPermittedCops(), hasPass(), getCopYear()]);

  let commutes: Awaited<ReturnType<typeof getCommutes>> = { commutes: new Map(), pending: 0, settled: Promise.resolve() };
  if (profile.home && commuteEnabled()) {
    const home = profile.home;
    const candidates = schools
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => ({ s, km: haversineKm(home, { lat: s.lat!, lng: s.lng! }) }))
      .filter(({ s, km }) => km <= (profile.maxKm ?? COMMUTE_RADIUS_KM) && !excludeReason(profile, s, km))
      .sort((a, b) => a.km - b.km)
      .slice(0, COMMUTE_MAX_SCHOOLS)
      .map(({ s }) => ({ code: s.school_code, lat: s.lat!, lng: s.lng! }));
    commutes = await getCommutes(home, candidates);
    // Serverless hosts freeze the function after responding; keep slow lookups alive so they get cached.
    if (commutes.pending > 0) after(() => commutes.settled);
  }

  const result = matchSchools(profile, schools, {
    cops,
    copPermitted: config.copSourcePermitted,
    thresholds: config.banding,
    commutes: commutes.commutes,
  });

  const preview = config.free.matchPreview;
  return Response.json({
    paid,
    copPermitted: config.copSourcePermitted,
    copYear,
    thresholds: config.banding,
    commuteEnabled: commuteEnabled(),
    commutePending: commutes.pending,
    counts: result.counts,
    total: result.items.length,
    excluded: result.excluded,
    bandingAvailable: result.bandingAvailable,
    items: paid ? result.items : result.items.slice(0, preview),
    lockedCount: paid ? 0 : Math.max(0, result.items.length - preview),
    suggestion: paid ? result.suggestion : null,
    suggestionLocked: !paid && result.suggestion !== null,
  });
}
