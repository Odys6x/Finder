import { describe, expect, it } from "vitest";
import { findAdmissionPromise, findCopFigures, findValueJudgement } from "./guard";

describe("findCopFigures", () => {
  it.each([
    "Bedok Green's COP was 22 last year.",
    "The PG3 cut-off point is around 12.",
    "Its PSLE score range for PG3 was 8 - 12.",
    "PG2: 21",
    "Expect a cut-off of 9 for the IP.",
    "Scores of 6-8 are within the COP range.",
  ])("flags %s", (t) => expect(findCopFigures(t).length).toBeGreaterThan(0));

  it.each([
    "PSLE scores range from 4 to 30, and lower is better.",
    "COPs come from the previous year's posting.",
    "A PG1 COP of 30* means the school had leftover places.",
    "You can list up to 6 choices.",
    "Check the COP on SchoolFinder for 2025.",
    "There are 3 posting groups.",
  ])("allows %s", (t) => expect(findCopFigures(t)).toEqual([]));
});

describe("findAdmissionPromise", () => {
  it("flags promises", () => {
    expect(findAdmissionPromise("With a score of 8 your child will get in.")).toBeTruthy();
    expect(findAdmissionPromise("This guarantees a place.")).toBeTruthy();
  });
  it("allows negated statements", () => {
    expect(findAdmissionPromise("Meeting the COP does not guarantee a place.")).toBeNull();
    expect(findAdmissionPromise("No one can be sure to get in.")).toBeNull();
  });
});

describe("findValueJudgement", () => {
  it("flags good/bad rankings", () => {
    expect(findValueJudgement("It is the best school in the east.")).toBeTruthy();
    expect(findValueJudgement("That's a top school.")).toBeTruthy();
  });
  it("allows neutral text", () => {
    expect(findValueJudgement("It offers Robotics and is 2 km from home.")).toBeNull();
  });
});
