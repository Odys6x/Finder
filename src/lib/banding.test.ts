import { describe, expect, it } from "vitest";
import { bandFor, bandSchool, likelyPostingGroups, selectCop, type BandInput } from "./banding";
import type { Cop } from "./types";

const baseCop: Cop = {
  school_code: "x",
  cop_year: 2025,
  pg3: 12,
  pg2: 22,
  pg1: 26,
  ip: null,
  affiliated_pg3: 16,
  affiliated_pg2: null,
  affiliated_pg1: null,
  pg1_has_vacancy: false,
  hcl_note: null,
};

const base: BandInput = {
  score: 10,
  postingGroup: 3,
  track: "any",
  cop: baseCop,
  copPermitted: true,
  isAffiliated: false,
};

describe("bandFor (spec thresholds 3/2)", () => {
  it("is safe at exactly c - 3", () => expect(bandFor(9, 12)).toBe("safe"));
  it("is borderline at c - 2", () => expect(bandFor(10, 12)).toBe("borderline"));
  it("is borderline at c", () => expect(bandFor(12, 12)).toBe("borderline"));
  it("is borderline at c + 2", () => expect(bandFor(14, 12)).toBe("borderline"));
  it("is reach at c + 3", () => expect(bandFor(15, 12)).toBe("reach"));
  it("uses configurable thresholds", () => {
    expect(bandFor(10, 12, { safeMargin: 2, borderlineMargin: 1 })).toBe("safe");
    expect(bandFor(14, 12, { safeMargin: 2, borderlineMargin: 1 })).toBe("reach");
  });
  it("handles the score range edges", () => {
    expect(bandFor(4, 4)).toBe("borderline");
    expect(bandFor(4, 7)).toBe("safe");
    expect(bandFor(30, 27)).toBe("reach");
  });
});

describe("bandSchool", () => {
  it("bands with stored COP when permitted", () => {
    const r = bandSchool({ ...base, score: 8 });
    expect(r).toMatchObject({ band: "safe", cop: 12, field: "pg3", source: "stored" });
  });

  it("is disabled when COP source is not permitted", () => {
    const r = bandSchool({ ...base, copPermitted: false });
    expect(r.band).toBeNull();
    expect(r.unbandedReason).toBe("disabled");
  });

  it("uses a user-entered COP even when the stored source is not permitted", () => {
    const r = bandSchool({ ...base, copPermitted: false, userCop: { value: 20 }, score: 22 });
    expect(r).toMatchObject({ band: "borderline", cop: 20, source: "user" });
  });

  it("ignores an invalid user COP and falls back", () => {
    const r = bandSchool({ ...base, userCop: { value: 99 }, score: 8 });
    expect(r.source).toBe("stored");
  });

  it("returns invalid-score for out-of-range scores", () => {
    expect(bandSchool({ ...base, score: 3 }).unbandedReason).toBe("invalid-score");
    expect(bandSchool({ ...base, score: 31 }).unbandedReason).toBe("invalid-score");
    expect(bandSchool({ ...base, score: null }).unbandedReason).toBe("invalid-score");
    expect(bandSchool({ ...base, postingGroup: null }).unbandedReason).toBe("invalid-score");
  });

  it("returns no-cop when no stored COP exists", () => {
    expect(bandSchool({ ...base, cop: null }).unbandedReason).toBe("no-cop");
  });

  describe("30* PG1 vacancy", () => {
    const cop: Cop = { ...baseCop, pg1: 30, pg1_has_vacancy: true };
    it("treats PG1 as safe even at score 30", () => {
      const r = bandSchool({ ...base, cop, postingGroup: 1, score: 30 });
      expect(r.band).toBe("safe");
      expect(r.notes.join(" ")).toMatch(/30\*/);
    });
    it("does not affect PG3 banding", () => {
      const r = bandSchool({ ...base, cop, postingGroup: 3, score: 15 });
      expect(r.band).toBe("reach");
    });
    it("works for a user-entered 30*", () => {
      const r = bandSchool({
        ...base,
        copPermitted: false,
        userCop: { value: 30, vacancy: true },
        postingGroup: 1,
        score: 29,
      });
      expect(r.band).toBe("safe");
    });
    it("without the vacancy flag, PG1 COP 30 bands normally", () => {
      const r = bandSchool({ ...base, cop: { ...baseCop, pg1: 30 }, postingGroup: 1, score: 29 });
      expect(r.band).toBe("borderline");
    });
  });

  describe("affiliated COPs", () => {
    it("uses the affiliated COP when affiliated", () => {
      const r = bandSchool({ ...base, isAffiliated: true, score: 13 });
      expect(r).toMatchObject({ field: "affiliated_pg3", cop: 16, band: "safe" });
    });
    it("falls back to the non-affiliated COP when no affiliated COP exists for the PG", () => {
      const r = bandSchool({ ...base, isAffiliated: true, postingGroup: 2, score: 22 });
      expect(r).toMatchObject({ field: "pg2", cop: 22 });
    });
    it("does not use the affiliated COP when not affiliated", () => {
      const r = bandSchool({ ...base, isAffiliated: false, score: 13 });
      expect(r).toMatchObject({ field: "pg3", band: "borderline" });
    });
  });

  describe("IP COPs", () => {
    const ipCop: Cop = { ...baseCop, ip: 7 };
    it("uses the IP COP when the family targets IP", () => {
      const r = bandSchool({ ...base, cop: ipCop, track: "ip", score: 6 });
      expect(r).toMatchObject({ field: "ip", cop: 7, band: "borderline" });
    });
    it("uses the PG COP for express track at a dual-track school", () => {
      const r = bandSchool({ ...base, cop: ipCop, track: "express", score: 6 });
      expect(r.field).toBe("pg3");
    });
    it("uses the IP COP for IP-only schools regardless of track", () => {
      const ipOnly: Cop = { ...baseCop, pg1: null, pg2: null, pg3: null, affiliated_pg3: null, ip: 6 };
      const r = bandSchool({ ...base, cop: ipOnly, track: "any", score: 4 });
      expect(r).toMatchObject({ field: "ip", band: "borderline" });
    });
    it("track ip at a school with no IP COP falls back to PG COP", () => {
      const r = bandSchool({ ...base, track: "ip", score: 8 });
      expect(r.field).toBe("pg3");
    });
  });

  it("reports pg-not-offered when the school had no COP for the child's PG", () => {
    const cop: Cop = { ...baseCop, pg1: null };
    const r = bandSchool({ ...base, cop, postingGroup: 1, score: 27 });
    expect(r.unbandedReason).toBe("pg-not-offered");
  });

  it("carries the HCL note for SAP schools", () => {
    const r = bandSchool({ ...base, cop: { ...baseCop, hcl_note: "Includes HCL bonus" }, score: 8 });
    expect(r.notes).toContain("Includes HCL bonus");
  });
});

describe("selectCop", () => {
  it("returns null field when nothing applies", () => {
    const cop: Cop = { ...baseCop, pg1: null, pg2: null, pg3: null, affiliated_pg3: null };
    expect(selectCop(cop, 3, "any", false)).toEqual({ field: null, value: null });
  });
});

describe("likelyPostingGroups", () => {
  it("maps scores to typical posting groups", () => {
    expect(likelyPostingGroups(4)).toEqual([3]);
    expect(likelyPostingGroups(20)).toEqual([3]);
    expect(likelyPostingGroups(21)).toEqual([3, 2]);
    expect(likelyPostingGroups(24)).toEqual([2]);
    expect(likelyPostingGroups(25)).toEqual([2, 1]);
    expect(likelyPostingGroups(30)).toEqual([1]);
    expect(likelyPostingGroups(2)).toEqual([]);
  });
});
