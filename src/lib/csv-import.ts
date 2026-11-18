/**
 * Admin CSV import for COPs and SchoolFinder fields (spec §5.8). Pure: parsing and
 * validation only, no DB access, so it is unit-tested and reused by the admin API.
 */
import Papa from "papaparse";
import type { Cop } from "./types";

export interface Issue {
  row: number; // 1-based data row (header = row 0)
  field?: string;
  message: string;
}

export interface ParsedImport<T> {
  rows: T[];
  errors: Issue[];
  warnings: Issue[];
}

/** Resolve a school_code or school name to a known school_code. */
export type SchoolResolver = (codeOrName: string) => string | null;

const SCORE_FIELDS = ["pg3", "pg2", "pg1", "ip", "affiliated_pg3", "affiliated_pg2", "affiliated_pg1"] as const;
type ScoreField = (typeof SCORE_FIELDS)[number];

export const COP_CSV_HEADERS = ["school_code", "cop_year", ...SCORE_FIELDS, "hcl_note"];

export interface ParsedScore {
  value: number | null;
  vacancy: boolean;
  error?: string;
}

/**
 * Accepts: blank / "-" / "NA" → null; "12" → 12; "8-12" (SchoolFinder ranges) → 12, the
 * upper end, which is the COP; "30*" → 30 with the vacancy flag.
 */
export function parseScore(raw: string | undefined): ParsedScore {
  const s = (raw ?? "").trim();
  if (s === "" || s === "-" || /^n\.?a\.?$/i.test(s)) return { value: null, vacancy: false };
  const star = s.endsWith("*");
  const body = star ? s.slice(0, -1).trim() : s;
  const range = body.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
  let n: number;
  if (range) {
    const lo = Number(range[1]);
    n = Number(range[2]);
    if (lo > n) return { value: null, vacancy: false, error: `range "${s}" is reversed` };
  } else if (/^\d{1,2}$/.test(body)) {
    n = Number(body);
  } else {
    return { value: null, vacancy: false, error: `"${s}" is not a PSLE score` };
  }
  if (n < 4 || n > 30) return { value: null, vacancy: false, error: `${n} is outside 4–30` };
  if (star && n !== 30) return { value: null, vacancy: false, error: `"*" is only valid as 30*` };
  return { value: n, vacancy: star };
}

function readCsv(text: string): { data: Record<string, string>[]; errors: Issue[] } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const errors = res.errors.map((e) => ({ row: (e.row ?? 0) + 1, message: e.message }));
  return { data: res.data, errors };
}

export function parseCopCsv(text: string, resolve: SchoolResolver, expectedYear?: number): ParsedImport<Cop> {
  const { data, errors } = readCsv(text);
  const warnings: Issue[] = [];
  const rows: Cop[] = [];
  const seen = new Set<string>();

  if (data.length === 0) errors.push({ row: 0, message: "No data rows found." });
  const headers = data[0] ? Object.keys(data[0]) : [];
  if (data.length && !headers.includes("school_code") && !headers.includes("school_name")) {
    errors.push({ row: 0, message: "Missing a school_code or school_name column." });
    return { rows, errors, warnings };
  }

  data.forEach((r, i) => {
    const row = i + 1;
    const rowErrors: Issue[] = [];
    const ref = (r.school_code || r.school_name || "").trim();
    const code = ref ? resolve(ref) : null;
    if (!code) rowErrors.push({ row, field: "school_code", message: `Unknown school "${ref}"` });

    const year = Number((r.cop_year ?? "").trim());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      rowErrors.push({ row, field: "cop_year", message: `Invalid cop_year "${r.cop_year ?? ""}"` });
    } else if (expectedYear && year !== expectedYear) {
      warnings.push({ row, field: "cop_year", message: `cop_year ${year} differs from the current year setting ${expectedYear}` });
    }

    const vals = {} as Record<ScoreField, number | null>;
    let vacancy = false;
    for (const f of SCORE_FIELDS) {
      const p = parseScore(r[f]);
      if (p.error) rowErrors.push({ row, field: f, message: p.error });
      if (p.vacancy) {
        if (f === "pg1" || f === "affiliated_pg1") vacancy = true;
        else rowErrors.push({ row, field: f, message: "30* is only valid for PG1" });
      }
      vals[f] = p.value;
    }

    const key = `${code}|${year}`;
    if (code && seen.has(key)) rowErrors.push({ row, message: `Duplicate row for ${code} ${year}` });
    seen.add(key);

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    // Sanity checks: warn, don't block — real data has odd cases.
    if (SCORE_FIELDS.every((f) => vals[f] === null)) warnings.push({ row, message: "All COP fields are empty" });
    const order: [ScoreField, ScoreField][] = [
      ["pg3", "pg2"],
      ["pg2", "pg1"],
      ["pg3", "pg1"],
    ];
    for (const [a, b] of order) {
      if (vals[a] !== null && vals[b] !== null && vals[a]! > vals[b]!) {
        warnings.push({ row, message: `${a.toUpperCase()} COP (${vals[a]}) is less stringent than ${b.toUpperCase()} (${vals[b]}) — check ordering` });
      }
    }
    for (const pg of ["pg3", "pg2", "pg1"] as const) {
      const aff = vals[`affiliated_${pg}`];
      if (aff !== null && vals[pg] !== null && aff < vals[pg]!) {
        warnings.push({ row, message: `Affiliated ${pg.toUpperCase()} COP (${aff}) is stricter than non-affiliated (${vals[pg]})` });
      }
    }
    if (vals.ip !== null && vals.pg3 !== null && vals.ip > vals.pg3) {
      warnings.push({ row, message: `IP COP (${vals.ip}) is less stringent than PG3 (${vals.pg3})` });
    }

    rows.push({
      school_code: code!,
      cop_year: year,
      ...vals,
      pg1_has_vacancy: vacancy,
      hcl_note: (r.hcl_note ?? "").trim() || null,
    });
  });

  return { rows, errors, warnings };
}

export interface SchoolFinderFields {
  school_code: string;
  affiliated_primary_schools?: string[];
  dsa_talent_areas?: string[];
  electives?: string[];
  sen_support?: string | null;
  schoolfinder_url?: string | null;
  source_last_updated?: string | null;
  culture_blurb?: string | null;
}

export const SCHOOLFINDER_CSV_HEADERS = [
  "school_code",
  "affiliated_primary_schools",
  "dsa_talent_areas",
  "electives",
  "sen_support",
  "schoolfinder_url",
  "source_last_updated",
  "culture_blurb",
];

const list = (s: string) =>
  s
    .split(/[;|\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Only columns present in the CSV are updated; blank cells clear the field. */
export function parseSchoolFinderCsv(text: string, resolve: SchoolResolver): ParsedImport<SchoolFinderFields> {
  const { data, errors } = readCsv(text);
  const warnings: Issue[] = [];
  const rows: SchoolFinderFields[] = [];
  if (data.length === 0) errors.push({ row: 0, message: "No data rows found." });
  const headers = new Set(data[0] ? Object.keys(data[0]) : []);

  data.forEach((r, i) => {
    const row = i + 1;
    const ref = (r.school_code || r.school_name || "").trim();
    const code = ref ? resolve(ref) : null;
    if (!code) {
      errors.push({ row, field: "school_code", message: `Unknown school "${ref}"` });
      return;
    }
    const out: SchoolFinderFields = { school_code: code };
    if (headers.has("affiliated_primary_schools")) out.affiliated_primary_schools = list(r.affiliated_primary_schools ?? "");
    if (headers.has("dsa_talent_areas")) out.dsa_talent_areas = list(r.dsa_talent_areas ?? "");
    if (headers.has("electives")) out.electives = list(r.electives ?? "");
    if (headers.has("sen_support")) out.sen_support = (r.sen_support ?? "").trim() || null;
    if (headers.has("schoolfinder_url")) {
      const u = (r.schoolfinder_url ?? "").trim();
      if (u && !/^https:\/\/www\.moe\.gov\.sg\/schoolfinder/i.test(u)) {
        errors.push({ row, field: "schoolfinder_url", message: "URL must start with https://www.moe.gov.sg/schoolfinder" });
        return;
      }
      out.schoolfinder_url = u || null;
    }
    if (headers.has("source_last_updated")) {
      const d = (r.source_last_updated ?? "").trim();
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        errors.push({ row, field: "source_last_updated", message: "Use YYYY-MM-DD" });
        return;
      }
      out.source_last_updated = d || null;
    }
    if (headers.has("culture_blurb")) {
      const b = (r.culture_blurb ?? "").trim();
      if (b.length > 600) warnings.push({ row, field: "culture_blurb", message: "Blurb is long (>600 chars) — keep it short and in our own words" });
      out.culture_blurb = b || null;
    }
    rows.push(out);
  });
  return { rows, errors, warnings };
}
