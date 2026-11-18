import { describe, expect, it } from "vitest";
import { parseCopCsv, parseSchoolFinderCsv, parseScore } from "./csv-import";

const known: Record<string, string> = {
  "bedok-green-secondary": "bedok-green-secondary",
  "BEDOK GREEN SECONDARY SCHOOL": "bedok-green-secondary",
  "raffles-institution": "raffles-institution",
};
const resolve = (s: string) => known[s] ?? null;

describe("parseScore", () => {
  it("parses plain scores", () => expect(parseScore("12")).toEqual({ value: 12, vacancy: false }));
  it("treats blanks as null", () => {
    expect(parseScore("")).toEqual({ value: null, vacancy: false });
    expect(parseScore("-")).toEqual({ value: null, vacancy: false });
    expect(parseScore("NA")).toEqual({ value: null, vacancy: false });
    expect(parseScore(undefined)).toEqual({ value: null, vacancy: false });
  });
  it("takes the upper end of a range", () => expect(parseScore("8 - 12").value).toBe(12));
  it("parses 30*", () => expect(parseScore("30*")).toEqual({ value: 30, vacancy: true }));
  it("rejects out-of-range scores", () => {
    expect(parseScore("3").error).toBeTruthy();
    expect(parseScore("31").error).toBeTruthy();
  });
  it("rejects stars on non-30", () => expect(parseScore("25*").error).toBeTruthy());
  it("rejects garbage", () => expect(parseScore("abc").error).toBeTruthy());
  it("rejects reversed ranges", () => expect(parseScore("12-8").error).toBeTruthy());
});

describe("parseCopCsv", () => {
  const header = "school_code,cop_year,pg3,pg2,pg1,ip,affiliated_pg3,affiliated_pg2,affiliated_pg1,hcl_note";

  it("imports a valid row", () => {
    const r = parseCopCsv(`${header}\nbedok-green-secondary,2025,14,22,30*,,,,,`, resolve, 2025);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ pg3: 14, pg2: 22, pg1: 30, pg1_has_vacancy: true, ip: null });
  });

  it("accepts school names", () => {
    const r = parseCopCsv(`school_name,cop_year,pg3\nBEDOK GREEN SECONDARY SCHOOL,2025,14`, resolve);
    expect(r.rows[0].school_code).toBe("bedok-green-secondary");
  });

  it("errors on unknown schools and bad scores", () => {
    const r = parseCopCsv(`${header}\nnope,2025,14,,,,,,,\nbedok-green-secondary,2025,2,,,,,,,`, resolve);
    expect(r.rows).toHaveLength(0);
    expect(r.errors.map((e) => e.row)).toEqual([1, 2]);
  });

  it("errors on 30* outside PG1", () => {
    const r = parseCopCsv(`${header}\nbedok-green-secondary,2025,30*,,,,,,,`, resolve);
    expect(r.errors[0].message).toMatch(/PG1/);
  });

  it("errors on duplicates and bad years", () => {
    const r = parseCopCsv(
      `${header}\nbedok-green-secondary,2025,14,,,,,,,\nbedok-green-secondary,2025,14,,,,,,,\nraffles-institution,20x5,,,,6,,,,`,
      resolve,
    );
    expect(r.errors.some((e) => /Duplicate/.test(e.message))).toBe(true);
    expect(r.errors.some((e) => e.field === "cop_year")).toBe(true);
  });

  it("warns on PG ordering problems", () => {
    const r = parseCopCsv(`${header}\nbedok-green-secondary,2025,24,22,26,,,,,`, resolve);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /PG3 COP \(24\)/.test(w.message))).toBe(true);
  });

  it("warns when affiliated COP is stricter than non-affiliated", () => {
    const r = parseCopCsv(`${header}\nbedok-green-secondary,2025,14,,,,10,,,`, resolve);
    expect(r.warnings.some((w) => /Affiliated PG3/.test(w.message))).toBe(true);
  });

  it("warns on year mismatch and empty rows", () => {
    const r = parseCopCsv(`${header}\nbedok-green-secondary,2024,,,,,,,,`, resolve, 2025);
    expect(r.warnings.map((w) => w.message).join(" ")).toMatch(/2024.*2025|differs/);
    expect(r.warnings.some((w) => /empty/.test(w.message))).toBe(true);
  });

  it("supports IP-only schools", () => {
    const r = parseCopCsv(`${header}\nraffles-institution,2025,,,,6,,,,`, resolve);
    expect(r.rows[0]).toMatchObject({ ip: 6, pg3: null });
  });

  it("rejects a file with no school column", () => {
    const r = parseCopCsv(`foo,bar\n1,2`, resolve);
    expect(r.errors[0].message).toMatch(/school_code/);
  });
});

describe("parseSchoolFinderCsv", () => {
  it("parses lists and only touches present columns", () => {
    const r = parseSchoolFinderCsv(
      `school_code,affiliated_primary_schools,electives\nbedok-green-secondary,Bedok Green Primary; Opera Estate Primary,MEP`,
      resolve,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toEqual({
      school_code: "bedok-green-secondary",
      affiliated_primary_schools: ["Bedok Green Primary", "Opera Estate Primary"],
      electives: ["MEP"],
    });
  });
  it("validates SchoolFinder URLs and dates", () => {
    const r = parseSchoolFinderCsv(
      `school_code,schoolfinder_url,source_last_updated\nbedok-green-secondary,https://evil.example,2025-01-01\nraffles-institution,,01/02/2025`,
      resolve,
    );
    expect(r.errors).toHaveLength(2);
  });
});
