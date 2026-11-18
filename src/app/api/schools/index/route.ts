import { getDataFreshness, getSchoolIndex } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Compact index for client-side search, list and map. CDN-cacheable for PSLE week spikes. */
export async function GET() {
  const [index, freshness] = await Promise.all([getSchoolIndex(), getDataFreshness()]);
  return Response.json(
    { index, dataAsOf: freshness.dataGov },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=86400" } },
  );
}
