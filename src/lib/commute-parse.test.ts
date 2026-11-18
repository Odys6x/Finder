import { describe, expect, it } from "vitest";
import { commuteReason, nextSchoolDay, originKey, parseOneMapPt, summariseLegs } from "./commute-parse";

// Trimmed from the sample response in OneMap's routing docs.
const sample = {
  plan: {
    itineraries: [
      {
        duration: 2475,
        walkTime: 583,
        transfers: 2,
        fare: "1.81",
        legs: [{ mode: "WALK", route: "", duration: 292, from: { name: "Origin" }, to: { name: "BUS STOP" } }],
      },
      {
        duration: 2238,
        walkTime: 1129,
        transfers: 1,
        fare: "1.77",
        legs: [
          { mode: "WALK", route: "", duration: 629, from: { name: "Origin" }, to: { name: "FARRER PARK MRT STATION" } },
          { mode: "SUBWAY", route: "NE", duration: 714, from: { name: "FARRER PARK MRT STATION" }, to: { name: "HARBOURFRONT MRT STATION" } },
          { mode: "BUS", route: "65", duration: 189, from: { name: "HARBOURFRONT" }, to: { name: "OPP BLK 1" } },
          { mode: "WALK", route: "", duration: 133, from: { name: "OPP BLK 1" }, to: { name: "Destination" } },
        ],
      },
    ],
  },
};

describe("parseOneMapPt", () => {
  it("picks the fastest itinerary and converts to minutes", () => {
    const c = parseOneMapPt(sample)!;
    expect(c).toMatchObject({ minutes: 37, walkMinutes: 19, transfers: 1, fare: "1.77" });
    expect(c.legs).toHaveLength(4);
    expect(c.legs[1]).toEqual({ mode: "SUBWAY", route: "NE", from: "Farrer Park MRT Station", to: "Harbourfront MRT Station", minutes: 12 });
    expect(c.legs[0].from).toBe("Home");
    expect(c.legs[3].to).toBe("School");
  });
  it("returns null for empty or malformed responses", () => {
    expect(parseOneMapPt({})).toBeNull();
    expect(parseOneMapPt({ plan: { itineraries: [] } })).toBeNull();
    expect(parseOneMapPt(null)).toBeNull();
  });
  it("summarises legs and reasons", () => {
    const c = parseOneMapPt(sample)!;
    expect(summariseLegs(c)).toBe("Walk 10 min → MRT NE → Bus 65 → Walk 2 min");
    expect(commuteReason(c)).toBe("37 min by public transport (1 transfer)");
    expect(commuteReason({ ...c, transfers: 0 })).toMatch(/direct/);
  });
});

describe("originKey", () => {
  it("rounds to 3 decimal places (~100 m)", () => {
    expect(originKey({ lat: 1.340825955, lng: 103.949467227 })).toBe("1.341,103.949");
  });
});

describe("nextSchoolDay", () => {
  // Times are UTC; Singapore is UTC+8.
  it("returns the next weekday in MM-DD-YYYY", () => {
    expect(nextSchoolDay(new Date("2026-11-18T03:00:00Z"))).toBe("11-19-2026"); // Wed → Thu
  });
  it("skips the weekend", () => {
    expect(nextSchoolDay(new Date("2026-11-20T03:00:00Z"))).toBe("11-23-2026"); // Fri → Mon
    expect(nextSchoolDay(new Date("2026-11-21T03:00:00Z"))).toBe("11-23-2026"); // Sat → Mon
  });
  it("uses the Singapore date, not UTC", () => {
    // 2026-11-20 17:00 UTC is already Saturday 01:00 in Singapore → next school day Monday.
    expect(nextSchoolDay(new Date("2026-11-20T17:00:00Z"))).toBe("11-23-2026");
  });
});
