import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { config } from "./config";
import { getDb, schema } from "./db";
import { nameKey } from "./datagov";
import type { SchoolFinderFields } from "./csv-import";
import type { Cop, School, SchoolIndexEntry } from "./types";

/**
 * Read path is cached in-process: ~150 schools fit easily in memory, and PSLE results
 * week is read-heavy. Writes (admin import / refresh) call `invalidate()`.
 */
const TTL_MS = 5 * 60 * 1000;

interface Cache {
  at: number;
  schools: School[];
  byCode: Map<string, School>;
  index: SchoolIndexEntry[];
  copYear: number;
  cops: Map<string, Cop>;
  lastDataGovRefresh: string | null;
}

const g = globalThis as unknown as { __spCache?: Cache; __spLoading?: Promise<Cache> };

export function invalidate() {
  g.__spCache = undefined;
}

type SchoolRow = typeof schema.schools.$inferSelect;

function rowToSchool(r: SchoolRow): School {
  return {
    ...r,
    datagov_accessed_at: r.datagov_accessed_at ? r.datagov_accessed_at.toISOString() : null,
  } as unknown as School;
}

function toIndex(s: School): SchoolIndexEntry {
  const prog = [
    ...s.moe_programmes,
    ...s.electives,
    ...(s.alp ? [s.alp.domain, s.alp.title] : []),
    ...(s.llp ? [s.llp.domain, s.llp.title] : []),
  ].filter(Boolean);
  return {
    c: s.school_code,
    n: s.name,
    z: s.zone,
    t: s.type,
    na: s.nature,
    sap: s.is_sap,
    ip: s.is_ip,
    mt: s.mother_tongues,
    lat: s.lat,
    lng: s.lng,
    cca: s.ccas.map((c) => c.name),
    prog,
    sub: s.subjects,
    mrt: s.nearest_mrt,
  };
}

async function load(): Promise<Cache> {
  const db = await getDb();
  await seedFromSnapshotIfEmpty();
  const rows = await db.select().from(schema.schools).orderBy(schema.schools.name);
  const schools = rows.map(rowToSchool);
  const copYear = await getCopYear();
  const copRows = await db.select().from(schema.cops).where(eq(schema.cops.cop_year, copYear));
  const cops = new Map<string, Cop>(copRows.map((c) => [c.school_code, c as Cop]));
  const last = await db
    .select()
    .from(schema.refreshLog)
    .where(and(eq(schema.refreshLog.kind, "datagov"), eq(schema.refreshLog.status, "ok")))
    .orderBy(desc(schema.refreshLog.finished_at))
    .limit(1);
  const lastDataGovRefresh =
    last[0]?.finished_at?.toISOString() ??
    schools.map((s) => s.datagov_accessed_at).filter(Boolean).sort().at(-1) ??
    null;
  return {
    at: Date.now(),
    schools,
    byCode: new Map(schools.map((s) => [s.school_code, s])),
    index: schools.map(toIndex),
    copYear,
    cops,
    lastDataGovRefresh,
  };
}

async function cache(): Promise<Cache> {
  const c = g.__spCache;
  if (c && Date.now() - c.at < TTL_MS) return c;
  if (!g.__spLoading) {
    g.__spLoading = load()
      .then((v) => {
        g.__spCache = v;
        return v;
      })
      .finally(() => {
        g.__spLoading = undefined;
      });
  }
  // Serve stale data while reloading, if we have it.
  return c ?? g.__spLoading;
}

export async function getSchools(): Promise<School[]> {
  return (await cache()).schools;
}

export async function getSchool(code: string): Promise<School | null> {
  return (await cache()).byCode.get(code) ?? null;
}

export async function getSchoolIndex(): Promise<SchoolIndexEntry[]> {
  return (await cache()).index;
}

export async function getDataFreshness(): Promise<{ dataGov: string | null; copYear: number }> {
  const c = await cache();
  return { dataGov: c.lastDataGovRefresh, copYear: c.copYear };
}

/**
 * The ONLY way the app should read stored COPs for display, banding or the AI.
 * Returns an empty map unless COP_SOURCE_PERMITTED=true (spec §3 rule 4).
 */
export async function getPermittedCops(): Promise<Map<string, Cop>> {
  if (!config.copSourcePermitted) return new Map();
  return (await cache()).cops;
}

/** Admin-only: raw COPs regardless of the flag (for the import preview / checklist). */
export async function adminCopStats(): Promise<{ year: number; count: number }[]> {
  const db = await getDb();
  const rows = await db
    .select({ year: schema.cops.cop_year, count: sql<number>`count(*)::int` })
    .from(schema.cops)
    .groupBy(schema.cops.cop_year)
    .orderBy(desc(schema.cops.cop_year));
  return rows;
}

/* ----------------------------- settings ----------------------------- */

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const r = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return (r[0]?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  invalidate();
}

export async function getCopYear(): Promise<number> {
  return (await getSetting<number>("cop_year")) ?? config.defaultCopYear;
}

/* ----------------------------- school resolution ----------------------------- */

export async function makeResolver(): Promise<(ref: string) => string | null> {
  const schools = await getSchools();
  const byCode = new Set(schools.map((s) => s.school_code));
  const byName = new Map(schools.map((s) => [nameKey(s.name), s.school_code]));
  return (ref: string) => {
    const r = ref.trim();
    if (byCode.has(r)) return r;
    return byName.get(nameKey(r)) ?? null;
  };
}

/* ----------------------------- writes ----------------------------- */

type DataGovSchool = Omit<
  School,
  | "affiliated_primary_schools"
  | "dsa_talent_areas"
  | "electives"
  | "sen_support"
  | "schoolfinder_url"
  | "source_last_updated"
  | "culture_blurb"
>;

/** Upsert data.gov.sg fields; never touches SchoolFinder fields or our own blurbs. */
export async function upsertDataGovSchools(list: DataGovSchool[]) {
  const db = await getDb();
  for (const s of list) {
    const values = {
      ...s,
      datagov_accessed_at: s.datagov_accessed_at ? new Date(s.datagov_accessed_at) : null,
      updated_at: new Date(),
    };
    const { school_code: _code, ...update } = values;
    void _code;
    await db.insert(schema.schools).values(values).onConflictDoUpdate({ target: schema.schools.school_code, set: update });
  }
  invalidate();
}

export async function upsertCops(rows: Cop[]) {
  const db = await getDb();
  for (const c of rows) {
    const { school_code: _s, cop_year: _y, ...rest } = c;
    void _s;
    void _y;
    await db
      .insert(schema.cops)
      .values({ ...c, imported_at: new Date() })
      .onConflictDoUpdate({
        target: [schema.cops.school_code, schema.cops.cop_year],
        set: { ...rest, imported_at: new Date() },
      });
  }
  invalidate();
}

export async function updateSchoolFinderFields(rows: SchoolFinderFields[]) {
  const db = await getDb();
  for (const r of rows) {
    const { school_code, ...set } = r;
    if (Object.keys(set).length === 0) continue;
    await db
      .update(schema.schools)
      .set({ ...set, updated_at: new Date() })
      .where(eq(schema.schools.school_code, school_code));
  }
  invalidate();
}

export async function logRefresh(kind: string, status: "running" | "ok" | "error", message = "", id?: number) {
  const db = await getDb();
  if (id) {
    await db
      .update(schema.refreshLog)
      .set({ status, message, finished_at: status === "running" ? null : new Date() })
      .where(eq(schema.refreshLog.id, id));
    return id;
  }
  const r = await db
    .insert(schema.refreshLog)
    .values({ kind, status, message, finished_at: status === "running" ? null : new Date() })
    .returning({ id: schema.refreshLog.id });
  return r[0].id;
}

export async function recentRefreshes(limit = 10) {
  const db = await getDb();
  return db.select().from(schema.refreshLog).orderBy(desc(schema.refreshLog.started_at)).limit(limit);
}

/* ----------------------------- first-run seed ----------------------------- */

let seeded = false;
async function seedFromSnapshotIfEmpty() {
  if (seeded) return;
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.schools);
  if (n === 0) {
    const file = path.join(process.cwd(), "data", "snapshot", "schools.json");
    if (fs.existsSync(file)) {
      const snap = JSON.parse(fs.readFileSync(file, "utf8")) as { schools: DataGovSchool[]; accessed_at: string };
      await upsertDataGovSchools(snap.schools);
      await db.insert(schema.refreshLog).values({
        kind: "datagov",
        status: "ok",
        message: `Seeded ${snap.schools.length} schools from bundled snapshot`,
        started_at: new Date(snap.accessed_at),
        finished_at: new Date(snap.accessed_at),
      });
    }
  }
  seeded = true;
}
