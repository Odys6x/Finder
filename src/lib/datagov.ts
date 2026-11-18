/**
 * Pulls MOE "School Directory and Information" (data.gov.sg collection 457).
 * Licensed under the Singapore Open Data Licence — attribution is shown in the UI.
 * Only facts are stored (names, lists, codes); no descriptive text is copied.
 */
import { geocode } from "./geo";
import type { Cca, Programme, School } from "./types";

export const DATASETS = {
  general: "d_688b934f82c1059ed0a6993d2a829089",
  ccas: "d_9aba12b5527843afb0b2e8e4ed6ac6bd",
  programmes: "d_b0697d22a7837a4eddf72efb66a36fc2",
  subjects: "d_f1d144e423570c9d84dbc5102c2e664d",
  distinctive: "d_db1faeea02c646fa3abccfa5aba99214",
} as const;

type Row = Record<string, string | number | null>;
type Log = (msg: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch every row of a dataset, politely: paced requests and backoff on 429. */
export async function fetchAll(resourceId: string, apiKey: string, log: Log): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 5000;
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const url = `https://data.gov.sg/api/action/datastore_search?resource_id=${resourceId}&limit=${pageSize}&offset=${offset}`;
    let attempt = 0;
    for (;;) {
      const res = await fetch(url, { headers: apiKey ? { "x-api-key": apiKey } : {} });
      if (res.status === 429 && attempt < 6) {
        attempt++;
        log(`  rate limited, waiting 11s (attempt ${attempt})`);
        await sleep(11_000);
        continue;
      }
      if (!res.ok) throw new Error(`data.gov.sg ${resourceId} HTTP ${res.status}`);
      const body = (await res.json()) as { success: boolean; result: { total: number; records: Row[] } };
      if (!body.success) throw new Error(`data.gov.sg ${resourceId} returned success=false`);
      total = body.result.total;
      rows.push(...body.result.records);
      offset += pageSize;
      break;
    }
    await sleep(apiKey ? 500 : 2500);
  }
  return rows;
}

const str = (v: unknown) => (v === null || v === undefined || v === "na" ? "" : String(v).trim());
const yes = (v: unknown) => str(v).toLowerCase() === "yes";

/** Join key across datasets: names differ in case, punctuation and a trailing "School". */
export function nameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/['’�]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/&/g, " AND ")
    .replace(/\bST\.?\s/g, "SAINT ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\bSCHOOL\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function schoolCode(name: string): string {
  return nameKey(name).toLowerCase().replace(/ /g, "-");
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bChij\b/g, "CHIJ")
    .replace(/\b(Sji|Acs|Sst|Nus|Nps)\b/g, (m) => m.toUpperCase())
    .replace(/'S\b/g, "'s");
}

function schoolType(r: Row): string {
  const t = str(r.type_code).toUpperCase();
  if (t.includes("SPECIALISED")) return "Specialised";
  if (t.includes("INDEPENDENT")) return "Independent";
  if (yes(r.autonomous_ind)) return "Autonomous";
  if (t.includes("AIDED")) return "Aided";
  return "Government";
}

function nature(r: Row): string {
  const n = str(r.nature_code).toUpperCase();
  if (n.startsWith("BOYS")) return "BOYS";
  if (n.startsWith("GIRLS")) return "GIRLS";
  return "CO-ED";
}

/** e.g. "SECONDARY (S1-S5)", "MIXED LEVEL (S1-JC2)", "MIXED LEVEL (P1-S4)". */
const isSecondaryLevel = (level: string) => /^(SECONDARY|MIXED LEVEL)/.test(level.toUpperCase());

export interface RefreshResult {
  schools: Omit<School, "affiliated_primary_schools" | "dsa_talent_areas" | "electives" | "sen_support" | "schoolfinder_url" | "source_last_updated" | "culture_blurb">[];
  unmatched: { dataset: string; names: string[] }[];
}

export async function pullDataGov(opts: {
  apiKey?: string;
  log?: Log;
  /** Existing coordinates keyed by postal code, to avoid re-geocoding. */
  knownCoords?: Map<string, { lat: number; lng: number }>;
}): Promise<RefreshResult> {
  const log = opts.log ?? (() => {});
  const apiKey = opts.apiKey ?? "";
  const accessed = new Date().toISOString();

  log("Fetching general information…");
  const general = await fetchAll(DATASETS.general, apiKey, log);
  log("Fetching CCAs…");
  const ccaRows = await fetchAll(DATASETS.ccas, apiKey, log);
  log("Fetching MOE programmes…");
  const progRows = await fetchAll(DATASETS.programmes, apiKey, log);
  log("Fetching subjects…");
  const subjRows = await fetchAll(DATASETS.subjects, apiKey, log);
  log("Fetching school distinctive programmes…");
  const sdpRows = await fetchAll(DATASETS.distinctive, apiKey, log);

  const sec = general.filter((r) => isSecondaryLevel(str(r.mainlevel_code)));
  log(`${sec.length} secondary / mixed-level schools`);

  const byKey = new Map<string, RefreshResult["schools"][number]>();
  for (const r of sec) {
    const name = titleCase(str(r.school_name));
    const mts = [r.mothertongue1_code, r.mothertongue2_code, r.mothertongue3_code]
      .map((m) => str(m).toUpperCase())
      .filter(Boolean);
    byKey.set(nameKey(str(r.school_name)), {
      school_code: schoolCode(str(r.school_name)),
      name,
      address: str(r.address).replace(/\s+/g, " "),
      postal_code: str(r.postal_code).padStart(6, "0"),
      zone: str(r.zone_code).toUpperCase(),
      nearest_mrt: str(r.mrt_desc),
      bus_services: str(r.bus_desc),
      type: schoolType(r),
      nature: nature(r),
      session: str(r.session_code),
      main_level: str(r.mainlevel_code),
      is_sap: yes(r.sap_ind),
      is_ip: yes(r.ip_ind),
      is_gifted: yes(r.gifted_ind),
      is_autonomous: yes(r.autonomous_ind),
      mother_tongues: mts,
      website: str(r.url_address),
      phone: str(r.telephone_no),
      email: str(r.email_address),
      subjects: [],
      ccas: [],
      moe_programmes: [],
      alp: null,
      llp: null,
      lat: null,
      lng: null,
      datagov_accessed_at: accessed,
    });
  }

  const unmatched: RefreshResult["unmatched"] = [];
  function attach(dataset: string, rows: Row[], nameField: string, fn: (s: RefreshResult["schools"][number], r: Row) => void) {
    const missing = new Set<string>();
    for (const r of rows) {
      const s = byKey.get(nameKey(str(r[nameField])));
      if (s) fn(s, r);
      else missing.add(str(r[nameField]));
    }
    // Rows for primary schools / JCs are expected to be unmatched; only report likely-secondary names.
    const secLike = [...missing].filter((n) => /SECONDARY|HIGH|INSTITUTION|COLLEGE|ACADEMY/i.test(n));
    if (secLike.length) unmatched.push({ dataset, names: secLike.slice(0, 50) });
  }

  attach("ccas", ccaRows.filter((r) => isSecondaryLevel(str(r.school_section))), "School_name", (s, r) => {
    const cca: Cca = {
      group: str(r.cca_generic_name),
      name: str(r.cca_customized_name) || str(r.cca_grouping_desc),
    };
    if (cca.name && !s.ccas.some((c) => c.name === cca.name)) s.ccas.push(cca);
  });
  attach("subjects", subjRows, "School_Name", (s, r) => {
    const sub = str(r.Subject_Desc);
    if (sub && !s.subjects.includes(sub)) s.subjects.push(sub);
  });
  attach("programmes", progRows, "school_name", (s, r) => {
    const p = str(r.moe_programme_desc);
    if (p && !s.moe_programmes.includes(p)) s.moe_programmes.push(p);
  });
  attach("distinctive", sdpRows, "school_name", (s, r) => {
    const alp: Programme = { domain: str(r.alp_domain), title: str(r.alp_title) };
    const llp: Programme = { domain: str(r.llp_domain1), title: str(r.llp_title) };
    if (alp.domain || alp.title) s.alp = alp;
    if (llp.domain || llp.title) s.llp = llp;
  });

  const schools = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of schools) {
    s.subjects.sort();
    s.ccas.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }

  // Geocode via OneMap (postal code → lat/lng), reusing known coordinates.
  let geocoded = 0;
  for (const s of schools) {
    const known = opts.knownCoords?.get(s.postal_code);
    if (known) {
      s.lat = known.lat;
      s.lng = known.lng;
      continue;
    }
    if (!s.postal_code) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const g = (await geocode(s.postal_code)) ?? (await geocode(s.address));
        if (g) {
          s.lat = g.lat;
          s.lng = g.lng;
          geocoded++;
          break;
        }
      } catch {
        /* retry below; leave null if all attempts fail */
      }
      await sleep(2000 * (attempt + 1));
    }
    await sleep(400); // OneMap allows ~250 req/min
  }
  const missing = schools.filter((s) => s.lat === null).map((s) => s.name);
  if (missing.length) log(`No coordinates for: ${missing.join(", ")}`);
  log(`Geocoded ${geocoded} new postal codes`);

  return { schools, unmatched };
}
