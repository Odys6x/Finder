/** Pure school search over the compact index. Shared by the search page (client) and the AI chat tool (server). */
import { haversineKm, type LatLng } from "./geo";
import { matchInterest } from "./matching-lite";
import type { SchoolIndexEntry } from "./types";

export interface SearchFilters {
  q?: string;
  zone?: string;
  nature?: string; // "CO-ED" | "BOYS" | "GIRLS"
  type?: string;
  cca?: string;
  programme?: string;
  subject?: string;
  mt?: string;
  sap?: boolean;
  ip?: boolean;
  maxKm?: number;
}

export interface SearchHit {
  s: SchoolIndexEntry;
  distanceKm: number | null;
  matched: { cca?: string; programme?: string; subject?: string };
}

export function searchIndex(index: SchoolIndexEntry[], f: SearchFilters, origin?: LatLng | null): SearchHit[] {
  const q = f.q?.trim().toLowerCase();
  const hits: SearchHit[] = [];
  for (const s of index) {
    if (q && !s.n.toLowerCase().includes(q) && !s.mrt.toLowerCase().includes(q)) continue;
    if (f.zone && s.z !== f.zone.toUpperCase()) continue;
    if (f.nature && s.na !== f.nature.toUpperCase()) continue;
    if (f.type && s.t.toLowerCase() !== f.type.toLowerCase()) continue;
    if (f.sap !== undefined && s.sap !== f.sap) continue;
    if (f.ip !== undefined && s.ip !== f.ip) continue;
    if (f.mt && !s.mt.includes(f.mt.toUpperCase())) continue;
    const matched: SearchHit["matched"] = {};
    if (f.cca) {
      const m = matchInterest(f.cca, s.cca);
      if (!m) continue;
      matched.cca = m;
    }
    if (f.programme) {
      const m = matchInterest(f.programme, s.prog);
      if (!m) continue;
      matched.programme = m;
    }
    if (f.subject) {
      const m = matchInterest(f.subject, s.sub);
      if (!m) continue;
      matched.subject = m;
    }
    const distanceKm = origin && s.lat !== null && s.lng !== null ? haversineKm(origin, { lat: s.lat, lng: s.lng }) : null;
    if (f.maxKm && origin && (distanceKm === null || distanceKm > f.maxKm)) continue;
    hits.push({ s, distanceKm, matched });
  }
  hits.sort((a, b) =>
    a.distanceKm !== null && b.distanceKm !== null ? a.distanceKm - b.distanceKm : a.s.n.localeCompare(b.s.n),
  );
  return hits;
}

/** Facet values for filter dropdowns. */
export function facets(index: SchoolIndexEntry[]) {
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  return {
    zones: uniq(index.map((s) => s.z)),
    types: uniq(index.map((s) => s.t)),
    natures: uniq(index.map((s) => s.na)),
    mts: uniq(index.flatMap((s) => s.mt)),
    ccas: uniq(index.flatMap((s) => s.cca)),
    subjects: uniq(index.flatMap((s) => s.sub)),
  };
}
