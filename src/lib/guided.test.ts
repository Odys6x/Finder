import { describe, expect, it } from "vitest";
import { cardFacts, interestsFromGroups, nextStep, parsePostalInput, parseScoreInput } from "./guided";
import type { MatchItem } from "./matching";
import { EMPTY_PROFILE } from "./types";

describe("nextStep", () => {
  it("starts with the score", () => expect(nextStep(EMPTY_PROFILE, [])).toBe("score"));
  it("asks posting group only when the score is ambiguous", () => {
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 12 }, ["score"])).toBe("home");
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 21 }, ["score"])).toBe("pg");
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 25 }, ["score"])).toBe("pg");
  });
  it("skips travel when there is no home", () => {
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 12 }, ["score", "home", "sex", "interests"])).toBe("results");
    const withHome = { ...EMPTY_PROFILE, psleScore: 12, home: { lat: 1.3, lng: 103.9, label: "x" } };
    expect(nextStep(withHome, ["score", "home", "sex", "interests"])).toBe("travel");
  });
});

describe("parseScoreInput", () => {
  it.each([
    ["12", 12],
    ["score 12", 12],
    ["She got 9", 9],
    ["my son scored 21.", 21],
    ["PSLE score is 30", 30],
  ])("%s → %s", (t, n) => expect(parseScoreInput(t)).toBe(n));
  it.each(["what is a COP?", "3", "31", "12 schools near me", ""])("rejects %s", (t) => expect(parseScoreInput(t)).toBeNull());
});

describe("parsePostalInput", () => {
  it("accepts 6 digits", () => {
    expect(parsePostalInput("529889")).toBe("529889");
    expect(parsePostalInput("S(529889)")).toBe("529889");
  });
  it("rejects other text", () => expect(parsePostalInput("near tampines")).toBeNull());
});

describe("interestsFromGroups", () => {
  it("merges and de-duplicates", () => {
    const r = interestsFromGroups(["ball", "fitness"]);
    expect(r.interestCcas).toContain("Basketball");
    expect(r.interestCcas).toContain("Swimming");
    expect(r.interestProgrammes).toEqual(["Sports"]);
  });
});

describe("cardFacts", () => {
  const base: MatchItem = {
    code: "x",
    name: "X",
    zone: "EAST",
    nature: "CO-ED",
    type: "Government",
    distanceKm: 1.4,
    commute: null,
    fit: 60,
    reasons: ["1.4 km from home (~14 min est.)", "Has BASKETBALL CCA", "LLP: Music & Performing Arts", "SAP school"],
    band: { band: "safe", cop: 20, field: "pg3", source: "user", notes: [] },
  };
  it("leads with distance and shortens reasons", () => {
    expect(cardFacts(base)).toEqual(["📍 1.4 km", "🏀 Basketball", "🎵 Music & Performing…"]);
  });
  it("prefers real commute time", () => {
    const c = { minutes: 18, walkMinutes: 5, transfers: 1, fare: null, legs: [] };
    expect(cardFacts({ ...base, commute: c })[0]).toBe("🚇 18 min");
  });
});
