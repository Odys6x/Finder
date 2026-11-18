/** Pure helpers for OneMap public-transport routing. Safe for client and tests. */
import type { LatLng } from "./geo";

export interface CommuteLeg {
  mode: string; // WALK | BUS | SUBWAY | TRAM (LRT) | ...
  route: string; // bus number or MRT line code, "" for walking
  from: string;
  to: string;
  minutes: number;
}

export interface Commute {
  minutes: number;
  walkMinutes: number;
  transfers: number;
  fare: string | null;
  legs: CommuteLeg[];
}

interface OneMapLeg {
  mode?: string;
  route?: string;
  duration?: number;
  from?: { name?: string };
  to?: { name?: string };
}
interface OneMapItinerary {
  duration?: number;
  walkTime?: number;
  transfers?: number;
  fare?: string;
  legs?: OneMapLeg[];
}

const clean = (s: string | undefined) =>
  (s ?? "")
    .replace(/^Origin$/i, "Home")
    .replace(/^Destination$/i, "School")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Mrt|Lrt)\b/g, (m) => m.toUpperCase());

/** Pick the fastest itinerary from a OneMap `routeType=pt` response. */
export function parseOneMapPt(json: unknown): Commute | null {
  const its = (json as { plan?: { itineraries?: OneMapItinerary[] } })?.plan?.itineraries;
  if (!Array.isArray(its) || its.length === 0) return null;
  const best = [...its].filter((i) => typeof i.duration === "number").sort((a, b) => a.duration! - b.duration!)[0];
  if (!best) return null;
  return {
    minutes: Math.round(best.duration! / 60),
    walkMinutes: Math.round((best.walkTime ?? 0) / 60),
    transfers: best.transfers ?? 0,
    fare: best.fare ?? null,
    legs: (best.legs ?? []).map((l) => ({
      mode: (l.mode ?? "").toUpperCase(),
      route: l.route ?? "",
      from: clean(l.from?.name),
      to: clean(l.to?.name),
      minutes: Math.max(1, Math.round((l.duration ?? 0) / 60)),
    })),
  };
}

/** Round home to ~100 m for the cache key: good enough for walking legs, not a precise address. */
export function originKey(p: LatLng): string {
  return `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
}

/** Next weekday in Singapore as MM-DD-YYYY (OneMap's format). School commutes are weekday mornings. */
export function nextSchoolDay(now = new Date()): string {
  const sg = new Date(now.getTime() + 8 * 3600 * 1000); // shift to SGT, read with UTC getters
  const d = new Date(Date.UTC(sg.getUTCFullYear(), sg.getUTCMonth(), sg.getUTCDate() + 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

const MODE_LABEL: Record<string, string> = { BUS: "Bus", SUBWAY: "MRT", TRAM: "LRT", RAIL: "MRT" };

/** e.g. "Walk 5 min → MRT NE → Bus 69 → Walk 3 min" */
export function summariseLegs(c: Commute): string {
  return c.legs
    .map((l) => (l.mode === "WALK" ? `Walk ${l.minutes} min` : `${MODE_LABEL[l.mode] ?? l.mode} ${l.route}`.trim()))
    .join(" → ");
}

export function commuteReason(c: Commute): string {
  const t = c.transfers === 0 ? "direct" : `${c.transfers} transfer${c.transfers === 1 ? "" : "s"}`;
  return `${c.minutes} min by public transport (${t})`;
}
