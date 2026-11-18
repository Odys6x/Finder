import type { Band, Cop, PostingGroup, Track, UserCop } from "./types";

export interface BandThresholds {
  safeMargin: number; // Safe when s <= c - safeMargin
  borderlineMargin: number; // Borderline when c - (safeMargin-1) <= s <= c + borderlineMargin
}

export const DEFAULT_THRESHOLDS: BandThresholds = { safeMargin: 3, borderlineMargin: 2 };

export type CopField =
  | "pg3"
  | "pg2"
  | "pg1"
  | "ip"
  | "affiliated_pg3"
  | "affiliated_pg2"
  | "affiliated_pg1"
  | "user";

export interface BandResult {
  band: Band | null;
  cop: number | null;
  field: CopField | null;
  source: "stored" | "user" | null;
  /** Why there is no band, when band is null. */
  unbandedReason?: "disabled" | "no-cop" | "pg-not-offered" | "invalid-score";
  notes: string[];
}

export function isValidScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 4 && n <= 30;
}

/** Core rule from spec §2. Lower PSLE score is better. */
export function bandFor(score: number, cop: number, t: BandThresholds = DEFAULT_THRESHOLDS): Band {
  if (score <= cop - t.safeMargin) return "safe";
  if (score <= cop + t.borderlineMargin) return "borderline";
  return "reach";
}

export interface BandInput {
  score: number | null;
  postingGroup: PostingGroup | null;
  track: Track;
  /** Stored SchoolFinder COPs; ignored unless copPermitted. */
  cop: Cop | null;
  copPermitted: boolean;
  /** A COP the parent typed in after checking SchoolFinder. Always allowed. */
  userCop?: UserCop | null;
  /** Child's primary school is affiliated to this secondary school. */
  isAffiliated: boolean;
  thresholds?: BandThresholds;
}

function pgField(pg: PostingGroup, affiliated: boolean): CopField {
  return (affiliated ? `affiliated_pg${pg}` : `pg${pg}`) as CopField;
}

/** Pick the COP column that applies to this child, or explain why none does. */
export function selectCop(
  cop: Cop,
  pg: PostingGroup,
  track: Track,
  isAffiliated: boolean,
): { field: CopField; value: number } | { field: null; value: null } {
  const hasPg = cop.pg1 !== null || cop.pg2 !== null || cop.pg3 !== null;
  const ipOnly = !hasPg && cop.ip !== null;

  // IP COP applies if the family is aiming for IP, or the school only offers IP.
  if ((track === "ip" || ipOnly) && cop.ip !== null) {
    return { field: "ip", value: cop.ip };
  }
  if (isAffiliated) {
    const f = pgField(pg, true);
    const v = cop[f as keyof Cop] as number | null;
    if (v !== null && v !== undefined) return { field: f, value: v };
  }
  const f = pgField(pg, false);
  const v = cop[f as keyof Cop] as number | null;
  if (v !== null && v !== undefined) return { field: f, value: v };
  return { field: null, value: null };
}

export function bandSchool(input: BandInput): BandResult {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const notes: string[] = [];

  if (!isValidScore(input.score) || !input.postingGroup) {
    return { band: null, cop: null, field: null, source: null, unbandedReason: "invalid-score", notes };
  }
  const score = input.score;

  // 1. Parent-entered COP always wins — they read it from SchoolFinder themselves.
  if (input.userCop && isValidScore(input.userCop.value)) {
    if (input.userCop.vacancy && input.postingGroup === 1) {
      notes.push("Last year this school had leftover places for PG1 (30*).");
      return { band: "safe", cop: 30, field: "user", source: "user", notes };
    }
    return {
      band: bandFor(score, input.userCop.value, t),
      cop: input.userCop.value,
      field: "user",
      source: "user",
      notes,
    };
  }

  // 2. Stored COPs only when legally permitted (spec §3 rule 4).
  if (!input.copPermitted) {
    return { band: null, cop: null, field: null, source: null, unbandedReason: "disabled", notes };
  }
  if (!input.cop) {
    return { band: null, cop: null, field: null, source: null, unbandedReason: "no-cop", notes };
  }

  const sel = selectCop(input.cop, input.postingGroup, input.track, input.isAffiliated);
  if (sel.field === null) {
    return {
      band: null,
      cop: null,
      field: null,
      source: "stored",
      unbandedReason: "pg-not-offered",
      notes: [`No PG${input.postingGroup} COP last year — the school may not have offered places for this posting group.`],
    };
  }

  if (sel.field.startsWith("affiliated")) notes.push("Uses the affiliated COP.");
  if (sel.field === "ip") notes.push("Uses the Integrated Programme COP.");
  if (input.cop.hcl_note) notes.push(input.cop.hcl_note);

  const isPg1 = sel.field === "pg1" || sel.field === "affiliated_pg1";
  if (isPg1 && input.cop.pg1_has_vacancy) {
    notes.push("Last year this school had leftover places for PG1 (30*).");
    return { band: "safe", cop: sel.value, field: sel.field, source: "stored", notes };
  }

  return {
    band: bandFor(score, sel.value, t),
    cop: sel.value,
    field: sel.field,
    source: "stored",
    notes,
  };
}

/** Typical PSLE score → posting group mapping (Full SBB). The results slip is authoritative. */
export function likelyPostingGroups(score: number): PostingGroup[] {
  if (!isValidScore(score)) return [];
  if (score <= 20) return [3];
  if (score <= 22) return [3, 2];
  if (score <= 24) return [2];
  if (score === 25) return [2, 1];
  return [1];
}
