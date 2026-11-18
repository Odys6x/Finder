/** Shared domain types. Safe to import from client and server. */

export type PostingGroup = 1 | 2 | 3;
export type Nature = "CO-ED" | "BOYS" | "GIRLS";
export type Band = "safe" | "borderline" | "reach";

export interface Cca {
  group: string; // e.g. "PHYSICAL SPORTS"
  name: string; // e.g. "BASKETBALL"
}

export interface Programme {
  domain: string;
  title: string;
}

export interface School {
  school_code: string;
  name: string;
  address: string;
  postal_code: string;
  zone: string;
  nearest_mrt: string;
  bus_services: string;
  type: string;
  nature: Nature | string;
  session: string;
  main_level: string;
  is_sap: boolean;
  is_ip: boolean;
  is_gifted: boolean;
  is_autonomous: boolean;
  mother_tongues: string[];
  website: string;
  phone: string;
  email: string;
  subjects: string[];
  ccas: Cca[];
  moe_programmes: string[];
  alp: Programme | null;
  llp: Programme | null;
  lat: number | null;
  lng: number | null;
  culture_blurb: string | null;
  // SchoolFinder (manual admin import)
  affiliated_primary_schools: string[];
  dsa_talent_areas: string[];
  electives: string[];
  sen_support: string | null;
  schoolfinder_url: string | null;
  source_last_updated: string | null;
  datagov_accessed_at: string | null;
}

/** One year of COPs for a school. All score fields are PSLE scores 4–30. */
export interface Cop {
  school_code: string;
  cop_year: number;
  pg3: number | null;
  pg2: number | null;
  pg1: number | null;
  ip: number | null;
  affiliated_pg3: number | null;
  affiliated_pg2: number | null;
  affiliated_pg1: number | null;
  /** PG1 shown as `30*` — school had leftover places. */
  pg1_has_vacancy: boolean;
  /** e.g. SAP schools that factor in Higher Chinese. */
  hcl_note: string | null;
}

/** COPs a parent typed in themselves after checking SchoolFinder. */
export interface UserCop {
  value: number;
  vacancy?: boolean; // they saw 30*
}

export type Track = "any" | "express" | "ip";

/** Lives in the browser only (PDPA). No name, NRIC or primary school name required. */
export interface Profile {
  psleScore: number | null;
  postingGroup: PostingGroup | null;
  homePostal: string;
  home: { lat: number; lng: number; label: string } | null;
  maxKm: number | null;
  /** Max door-to-door public-transport time (needs OneMap routing; ignored for schools without a computed route). */
  maxMinutes: number | null;
  childSex: "" | "M" | "F";
  naturePref: "any" | "co-ed" | "single-sex";
  sapPref: "any" | "prefer" | "avoid";
  track: Track;
  motherTongue: string; // "", "CHINESE", "MALAY", "TAMIL", ...
  interestCcas: string[];
  interestProgrammes: string[];
  affiliatedPrimary: string; // optional
  userCops: Record<string, UserCop>; // keyed by school_code
}

export const EMPTY_PROFILE: Profile = {
  psleScore: null,
  postingGroup: null,
  homePostal: "",
  home: null,
  maxKm: null,
  maxMinutes: null,
  childSex: "",
  naturePref: "any",
  sapPref: "any",
  track: "any",
  motherTongue: "",
  interestCcas: [],
  interestProgrammes: [],
  affiliatedPrimary: "",
  userCops: {},
};

/** Compact record for client-side search, list and map. */
export interface SchoolIndexEntry {
  c: string; // code
  n: string; // name
  z: string; // zone
  t: string; // type
  na: string; // nature
  sap: boolean;
  ip: boolean;
  mt: string[];
  lat: number | null;
  lng: number | null;
  cca: string[]; // cca names
  prog: string[]; // programmes + ALP/LLP domains/titles + electives
  sub: string[];
  mrt: string;
}
