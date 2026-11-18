import { describe, expect, it } from "vitest";
import { cardFacts, interestsFromGroups, nextStep, onboardingSteps, parsePostalInput, parseQuickAnswer, parseScoreInput, schoolInitials } from "./guided";
import type { MatchItem } from "./matching";
import { EMPTY_PROFILE } from "./types";

describe("nextStep", () => {
  it("starts with the score", () => expect(nextStep(EMPTY_PROFILE, [])).toBe("score"));
  it("asks posting group only when the score is ambiguous", () => {
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 12 }, ["score"])).toBe("home");
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 21 }, ["score"])).toBe("pg");
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 25 }, ["score"])).toBe("pg");
  });
  it("goes straight to results once score and home are answered (the rest are optional boosters)", () => {
    expect(nextStep({ ...EMPTY_PROFILE, psleScore: 12 }, ["score", "home"])).toBe("results");
  });
});

describe("onboardingSteps", () => {
  it("is 2 questions for a clear score, 3 when the posting group is ambiguous", () => {
    expect(onboardingSteps({ ...EMPTY_PROFILE, psleScore: 12 }, ["score"])).toEqual(["score", "home"]);
    expect(onboardingSteps({ ...EMPTY_PROFILE, psleScore: 21 }, ["score"])).toEqual(["score", "pg", "home"]);
  });
});

describe("parseQuickAnswer", () => {
  it("reads everything from one line", () => {
    const r = parseQuickAnswer("12, 529889, girl, likes basketball and music, within 30 min");
    expect(r.patch).toMatchObject({ psleScore: 12, postingGroup: 3, childSex: "F", maxMinutes: 30 });
    expect(r.postal).toBe("529889");
    expect(r.interestIds).toEqual(["ball", "music"]);
    expect(r.answered).toEqual(["score", "pg"]);
    expect(r.understood).toEqual(["🚇 ≤ 30 min", "Score 12", "PG3", "👧 Girl", "🏀 Ball games", "🎵 Music"]);
  });
  it("handles just a score", () => {
    expect(parseQuickAnswer("12").patch).toMatchObject({ psleScore: 12, postingGroup: 3 });
  });
  it("leaves the posting group open for ambiguous scores unless stated", () => {
    expect(parseQuickAnswer("21").answered).toEqual(["score"]);
    expect(parseQuickAnswer("21 PG2").patch.postingGroup).toBe(2);
    expect(parseQuickAnswer("21 PG2").answered).toEqual(["score", "pg"]);
  });
  it("doesn't mistake travel limits or postal digits for a score", () => {
    const r = parseQuickAnswer("son, 529889, within 5 km");
    expect(r.patch.psleScore).toBeUndefined();
    expect(r.patch).toMatchObject({ childSex: "M", maxKm: 5 });
  });
  it("understands natural phrasing", () => {
    const r = parseQuickAnswer("My daughter scored 9, she loves robotics and drama, co-ed near home, interested in IP");
    expect(r.patch).toMatchObject({ psleScore: 9, childSex: "F", naturePref: "co-ed", maxKm: 5, track: "ip" });
    expect(r.interestIds).toEqual(["tech", "stage"]);
  });
  it("doesn't count martial arts as art", () => {
    expect(parseQuickAnswer("he does martial arts").interestIds).toEqual(["martial"]);
  });
  it("ignores out-of-range numbers", () => {
    expect(parseQuickAnswer("3").patch.psleScore).toBeUndefined();
    expect(parseQuickAnswer("31").patch.psleScore).toBeUndefined();
  });
});

describe("schoolInitials", () => {
  it.each([
    ["Bedok Green Secondary School", "BG"],
    ["Anglican High School", "AH"],
    ["CHIJ St. Nicholas Girls' School", "CS"],
    ["Raffles Institution", "RI"],
    ["Methodist Girls' School (Secondary)", "MG"],
  ])("%s → %s", (n, i) => expect(schoolInitials(n)).toBe(i));
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
