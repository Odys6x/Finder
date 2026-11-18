/**
 * Smart matching (spec §5.4). Pure: takes schools, permitted COPs and a profile;
 * returns ranked matches with reasons, bands and a balanced 6-choice suggestion.
 * Neutral by design — it ranks by *fit to this family's stated preferences*, never
 * by whether a school is "good".
 */
import { bandSchool, type BandResult, type BandThresholds, DEFAULT_THRESHOLDS } from "./banding";
import { nameKey } from "./datagov";
import { formatKm, haversineKm, roughMinutes } from "./geo";
import { commuteReason, type Commute } from "./commute-parse";
import type { Band, Cop, Profile, School } from "./types";

export interface MatchItem {
  code: string;
  name: string;
  zone: string;
  nature: string;
  type: string;
  distanceKm: number | null;
  /** Real public-transport commute (OneMap), when computed. */
  commute: Commute | null;
  fit: number; // 0–100
  reasons: string[];
  band: BandResult;
}

export interface MatchResult {
  items: MatchItem[];
  counts: Record<Band | "unbanded", number>;
  bandingAvailable: boolean;
  suggestion: { codes: string[]; notes: string[] } | null;
  excluded: number;
}

/** Schools that admit mainly via DSA/direct admission rather than S1 posting. */
export function isPostingSchool(s: School): boolean {
  return !/specialised/i.test(s.type);
}

import { matchInterest } from "./matching-lite";
export { matchInterest };

function niceLabel(s: string): string {
  return s.length > 3 && s === s.toUpperCase()
    ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
    : s;
}

export function isAffiliated(profile: Profile, s: School): boolean {
  if (!profile.affiliatedPrimary.trim()) return false;
  const k = nameKey(profile.affiliatedPrimary);
  return s.affiliated_primary_schools.some((p) => nameKey(p) === k);
}

export interface MatchOptions {
  cops: Map<string, Cop>;
  copPermitted: boolean;
  thresholds?: BandThresholds;
  /** school_code → commute (null = no route found). Missing = not computed yet. */
  commutes?: Map<string, Commute | null>;
}

export function excludeReason(p: Profile, s: School, distanceKm: number | null, commute?: Commute | null): string | null {
  if (p.maxMinutes && commute && commute.minutes > p.maxMinutes) return "travel-time";
  if (!isPostingSchool(s)) return "specialised";
  if (p.childSex === "M" && s.nature === "GIRLS") return "nature";
  if (p.childSex === "F" && s.nature === "BOYS") return "nature";
  if (p.naturePref === "co-ed" && s.nature !== "CO-ED") return "nature";
  if (p.naturePref === "single-sex" && s.nature === "CO-ED") return "nature";
  if (p.sapPref === "avoid" && s.is_sap) return "sap";
  if (p.motherTongue && s.mother_tongues.length && !s.mother_tongues.includes(p.motherTongue)) return "mother-tongue";
  if (p.maxKm && distanceKm !== null && distanceKm > p.maxKm) return "distance";
  return null;
}

export function scoreSchool(
  p: Profile,
  s: School,
  distanceKm: number | null,
  commute?: Commute | null,
): { fit: number; reasons: string[] } {
  let pts = 0;
  let max = 0;
  const reasons: string[] = [];

  if (p.home) {
    max += 40;
    if (commute) {
      // Real travel time: full marks up to 15 min, nothing at 60 min or more.
      pts += 40 * Math.min(1, Math.max(0, (60 - commute.minutes) / 45));
      reasons.push(commuteReason(commute));
    } else if (distanceKm !== null) {
      pts += 40 * Math.max(0, 1 - distanceKm / 15);
      reasons.push(`${formatKm(distanceKm)} from home (~${roughMinutes(distanceKm)} min est.)`);
    }
  }

  const ccaLabels = s.ccas.map((c) => c.name);
  if (p.interestCcas.length) {
    max += 36;
    let hits = 0;
    for (const i of p.interestCcas) {
      const m = matchInterest(i, ccaLabels);
      if (m && hits < 3) {
        hits++;
        reasons.push(`Has ${niceLabel(m)} CCA`);
      }
    }
    pts += hits * 12;
  }

  const progLabels = [
    ...s.moe_programmes,
    ...s.electives,
    ...(s.alp ? [`${s.alp.domain} ${s.alp.title}`] : []),
    ...(s.llp ? [`${s.llp.domain} ${s.llp.title}`] : []),
  ];
  if (p.interestProgrammes.length) {
    max += 30;
    let hits = 0;
    for (const i of p.interestProgrammes) {
      const m = matchInterest(i, progLabels);
      if (m && hits < 3) {
        hits++;
        const isAlp = s.alp && m.startsWith(s.alp.domain);
        const isLlp = s.llp && m.startsWith(s.llp.domain);
        reasons.push(
          isAlp ? `ALP: ${s.alp!.domain}` : isLlp ? `LLP: ${s.llp!.domain}` : niceLabel(m),
        );
      }
    }
    pts += hits * 10;
  }

  if (p.sapPref === "prefer") {
    max += 8;
    if (s.is_sap) {
      pts += 8;
      reasons.push("SAP school");
    }
  }
  if (p.track === "ip") {
    max += 10;
    if (s.is_ip) {
      pts += 10;
      reasons.push("Offers the Integrated Programme");
    }
  }

  const fit = max === 0 ? 50 : Math.round((pts / max) * 100);
  return { fit, reasons };
}

export function matchSchools(profile: Profile, schools: School[], opts: MatchOptions): MatchResult {
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const items: MatchItem[] = [];
  let excluded = 0;

  for (const s of schools) {
    const distanceKm =
      profile.home && s.lat !== null && s.lng !== null ? haversineKm(profile.home, { lat: s.lat, lng: s.lng }) : null;
    const commute = opts.commutes?.get(s.school_code) ?? null;
    if (excludeReason(profile, s, distanceKm, commute)) {
      excluded++;
      continue;
    }
    const { fit, reasons } = scoreSchool(profile, s, distanceKm, commute);
    const affiliated = isAffiliated(profile, s);
    if (affiliated) reasons.push("Affiliated to your child's primary school");
    const band = bandSchool({
      score: profile.psleScore,
      postingGroup: profile.postingGroup,
      track: profile.track,
      cop: opts.cops.get(s.school_code) ?? null,
      copPermitted: opts.copPermitted,
      userCop: profile.userCops[s.school_code] ?? null,
      isAffiliated: affiliated,
      thresholds: t,
    });
    items.push({
      code: s.school_code,
      name: s.name,
      zone: s.zone,
      nature: s.nature,
      type: s.type,
      distanceKm,
      commute,
      fit,
      reasons,
      band,
    });
  }

  items.sort(
    (a, b) =>
      b.fit - a.fit ||
      (a.commute?.minutes ?? Infinity) - (b.commute?.minutes ?? Infinity) ||
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
      a.name.localeCompare(b.name),
  );

  const counts = { safe: 0, borderline: 0, reach: 0, unbanded: 0 };
  for (const i of items) counts[i.band.band ?? "unbanded"]++;

  const bandingAvailable = counts.safe + counts.borderline + counts.reach > 0;
  return {
    items,
    counts,
    bandingAvailable,
    suggestion: bandingAvailable ? suggestSix(items) : null,
    excluded,
  };
}

/**
 * Balanced 6-choice list: aim for 2 reach, 2 borderline, 2 safe (best fit within each band),
 * borrowing from neighbouring bands when one is short. Always tries to keep at least
 * 2 safe choices (MOE tip: include 2–3 schools with less stringent COPs).
 * Ordered reach → borderline → safe, since choices are considered in the order listed.
 */
export function suggestSix(items: MatchItem[]): { codes: string[]; notes: string[] } {
  const by = (b: Band) => items.filter((i) => i.band.band === b);
  const pools = { reach: by("reach"), borderline: by("borderline"), safe: by("safe") };
  const want = { reach: 2, borderline: 2, safe: 2 };
  const notes: string[] = [];

  // Shortfalls move toward safer bands first, then the other way.
  const order: Band[] = ["reach", "borderline", "safe"];
  for (const b of order) {
    const short = want[b] - Math.min(want[b], pools[b].length);
    if (short <= 0) continue;
    want[b] -= short;
    const fallback: Band[] = b === "reach" ? ["borderline", "safe"] : b === "borderline" ? ["safe", "reach"] : ["borderline", "reach"];
    let left = short;
    for (const f of fallback) {
      const spare = pools[f].length - want[f];
      const take = Math.max(0, Math.min(spare, left));
      want[f] += take;
      left -= take;
    }
  }

  const picks = order.flatMap((b) => pools[b].slice(0, want[b]));
  if (picks.length < 6) notes.push(`Only ${picks.length} schools could be banded — add COPs for more schools to fill all 6 choices.`);
  if (want.safe < 2) notes.push("Fewer than 2 safe options found. Consider adding schools with less stringent COPs (MOE suggests 2–3).");
  notes.push("Choices are considered in the order you list them — reorder to reflect your real preference.");
  return { codes: picks.map((p) => p.code), notes };
}
