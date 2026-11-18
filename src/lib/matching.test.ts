import { describe, expect, it } from "vitest";
import { excludeReason, matchInterest, matchSchools, suggestSix, type MatchItem } from "./matching";
import { EMPTY_PROFILE, type Cop, type Profile, type School } from "./types";

function school(code: string, over: Partial<School> = {}): School {
  return {
    school_code: code,
    name: code,
    address: "",
    postal_code: "",
    zone: "EAST",
    nearest_mrt: "",
    bus_services: "",
    type: "Government",
    nature: "CO-ED",
    session: "",
    main_level: "",
    is_sap: false,
    is_ip: false,
    is_gifted: false,
    is_autonomous: false,
    mother_tongues: ["CHINESE", "MALAY", "TAMIL"],
    website: "",
    phone: "",
    email: "",
    subjects: [],
    ccas: [],
    moe_programmes: [],
    alp: null,
    llp: null,
    lat: 1.35,
    lng: 103.94,
    culture_blurb: null,
    affiliated_primary_schools: [],
    dsa_talent_areas: [],
    electives: [],
    sen_support: null,
    schoolfinder_url: null,
    source_last_updated: null,
    datagov_accessed_at: null,
    ...over,
  };
}

const cop = (code: string, pg3: number): Cop => ({
  school_code: code,
  cop_year: 2025,
  pg3,
  pg2: null,
  pg1: null,
  ip: null,
  affiliated_pg3: null,
  affiliated_pg2: null,
  affiliated_pg1: null,
  pg1_has_vacancy: false,
  hcl_note: null,
});

const profile: Profile = { ...EMPTY_PROFILE, psleScore: 12, postingGroup: 3 };

describe("matchInterest", () => {
  it("matches case-insensitively on word starts", () => {
    expect(matchInterest("basketball", ["BASKETBALL", "CHOIR"])).toBe("BASKETBALL");
    expect(matchInterest("Robot", ["ROBOTICS CLUB"])).toBe("ROBOTICS CLUB");
    expect(matchInterest("ball", ["BASKETBALL"])).toBeNull();
  });
});

describe("excludeReason", () => {
  it("excludes schools the child cannot attend", () => {
    expect(excludeReason({ ...profile, childSex: "M" }, school("g", { nature: "GIRLS" }), null)).toBe("nature");
    expect(excludeReason({ ...profile, childSex: "F" }, school("b", { nature: "BOYS" }), null)).toBe("nature");
  });
  it("respects co-ed / single-sex preferences", () => {
    expect(excludeReason({ ...profile, naturePref: "co-ed" }, school("b", { nature: "BOYS" }), null)).toBe("nature");
    expect(excludeReason({ ...profile, naturePref: "single-sex" }, school("c"), null)).toBe("nature");
  });
  it("excludes specialised schools from posting matches", () => {
    expect(excludeReason(profile, school("s", { type: "Specialised" }), null)).toBe("specialised");
  });
  it("filters by distance and mother tongue", () => {
    expect(excludeReason({ ...profile, maxKm: 5 }, school("x"), 6)).toBe("distance");
    expect(excludeReason({ ...profile, motherTongue: "TAMIL" }, school("x", { mother_tongues: ["CHINESE"] }), null)).toBe("mother-tongue");
  });
});

describe("matchSchools", () => {
  const schools = [
    school("near-robotics", { ccas: [{ group: "CLUBS", name: "ROBOTICS" }], lat: 1.351, lng: 103.941 }),
    school("far", { lat: 1.44, lng: 103.75 }),
    school("near-plain", { lat: 1.352, lng: 103.942 }),
  ];
  const p: Profile = { ...profile, home: { lat: 1.35, lng: 103.94, label: "home" }, interestCcas: ["Robotics"] };

  it("ranks by fit and explains why", () => {
    const r = matchSchools(p, schools, { cops: new Map(), copPermitted: false });
    expect(r.items.map((i) => i.code)).toEqual(["near-robotics", "near-plain", "far"]);
    expect(r.items[0].reasons.join(" ")).toMatch(/from home.*Robotics/);
  });

  it("does not band when COPs are not permitted and none were entered", () => {
    const cops = new Map([["far", cop("far", 20)]]);
    const r = matchSchools(p, schools, { cops, copPermitted: false });
    expect(r.bandingAvailable).toBe(false);
    expect(r.suggestion).toBeNull();
    expect(r.counts.unbanded).toBe(3);
  });

  it("bands with user-entered COPs even when stored COPs are not permitted", () => {
    const r = matchSchools({ ...p, userCops: { far: { value: 20 } } }, schools, { cops: new Map(), copPermitted: false });
    expect(r.counts.safe).toBe(1);
    expect(r.bandingAvailable).toBe(true);
  });

  it("bands with stored COPs when permitted", () => {
    const cops = new Map([
      ["near-robotics", cop("near-robotics", 10)],
      ["near-plain", cop("near-plain", 12)],
      ["far", cop("far", 20)],
    ]);
    const r = matchSchools(p, schools, { cops, copPermitted: true });
    expect(r.counts).toEqual({ safe: 1, borderline: 2, reach: 0, unbanded: 0 });
  });
});

describe("matchSchools with commute times", () => {
  const home = { lat: 1.35, lng: 103.94, label: "home" };
  const schools = [school("near-but-slow", { lat: 1.351, lng: 103.941 }), school("farther-but-fast", { lat: 1.36, lng: 103.95 })];
  const commute = (minutes: number) => ({ minutes, walkMinutes: 5, transfers: 1, fare: "1.20", legs: [] });

  it("ranks by real travel time when available and explains it", () => {
    const commutes = new Map([
      ["near-but-slow", commute(50)],
      ["farther-but-fast", commute(15)],
    ]);
    const r = matchSchools({ ...profile, home }, schools, { cops: new Map(), copPermitted: false, commutes });
    expect(r.items[0].code).toBe("farther-but-fast");
    expect(r.items[0].reasons[0]).toBe("15 min by public transport (1 transfer)");
  });

  it("filters by max travel time only where a route is known", () => {
    const commutes = new Map([["near-but-slow", commute(50)]]);
    const r = matchSchools({ ...profile, home, maxMinutes: 30 }, schools, { cops: new Map(), copPermitted: false, commutes });
    expect(r.items.map((i) => i.code)).toEqual(["farther-but-fast"]);
    expect(r.excluded).toBe(1);
  });
});

describe("suggestSix", () => {
  const item = (code: string, band: "safe" | "borderline" | "reach", fit = 50): MatchItem => ({
    code,
    name: code,
    zone: "",
    nature: "",
    type: "",
    distanceKm: null,
    commute: null,
    fit,
    reasons: [],
    band: { band, cop: 10, field: "pg3", source: "stored", notes: [] },
  });

  it("picks 2/2/2 ordered reach → borderline → safe", () => {
    const items = ["r1", "r2", "r3"].map((c) => item(c, "reach"))
      .concat(["b1", "b2", "b3"].map((c) => item(c, "borderline")))
      .concat(["s1", "s2", "s3"].map((c) => item(c, "safe")));
    expect(suggestSix(items).codes).toEqual(["r1", "r2", "b1", "b2", "s1", "s2"]);
  });

  it("fills a missing reach band from safer bands", () => {
    const items = ["b1", "b2", "b3"].map((c) => item(c, "borderline")).concat(["s1", "s2", "s3", "s4"].map((c) => item(c, "safe")));
    const r = suggestSix(items);
    expect(r.codes).toHaveLength(6);
    expect(r.codes.filter((c) => c.startsWith("s")).length).toBeGreaterThanOrEqual(2);
  });

  it("fills missing safe from borderline and warns", () => {
    const items = ["r1", "r2"].map((c) => item(c, "reach")).concat(["b1", "b2", "b3", "b4"].map((c) => item(c, "borderline")));
    const r = suggestSix(items);
    expect(r.codes).toEqual(["r1", "r2", "b1", "b2", "b3", "b4"]);
    expect(r.notes.join(" ")).toMatch(/Fewer than 2 safe/);
  });

  it("notes when fewer than 6 can be banded", () => {
    const r = suggestSix([item("s1", "safe")]);
    expect(r.codes).toEqual(["s1"]);
    expect(r.notes[0]).toMatch(/Only 1/);
  });
});
