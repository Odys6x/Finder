/** Geo helpers. Pure functions are safe on client; `geocode` hits OneMap (server or client). */

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Very rough door-to-door estimate from straight-line distance. Clearly labelled
 * as an estimate in the UI; real public-transport routing is a "Later" feature.
 */
export function roughMinutes(km: number): number {
  return Math.round(8 + km * 4.5);
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function isPostalCode(s: string): boolean {
  return /^\d{6}$/.test(s.trim());
}

export interface GeocodeResult extends LatLng {
  label: string;
}

/** OneMap elastic search: accepts a postal code or place name. No API key needed. */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;
  const url =
    "https://www.onemap.gov.sg/api/common/elastic/search?returnGeom=Y&getAddrDetails=N&pageNum=1&searchVal=" +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    results?: { SEARCHVAL: string; LATITUDE: string; LONGITUDE: string }[];
  };
  const hit = body.results?.[0];
  if (!hit) return null;
  const lat = Number(hit.LATITUDE);
  const lng = Number(hit.LONGITUDE);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: hit.SEARCHVAL };
}
