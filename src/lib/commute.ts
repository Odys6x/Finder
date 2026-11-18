import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { config } from "./config";
import { getDb, schema } from "./db";
import type { LatLng } from "./geo";
import { nextSchoolDay, originKey, parseOneMapPt, type Commute } from "./commute-parse";

/**
 * Door-to-door public-transport commute times from OneMap routing.
 * Results are cached in memory and in the DB per (rounded home, school), so a busy
 * PSLE week mostly hits the cache instead of OneMap.
 */

export function commuteEnabled() {
  return !!(config.oneMap.email && config.oneMap.password);
}

const CACHE_DAYS = 30;
const mem = new Map<string, Commute | null>();
const inflight = new Map<string, Promise<Commute | null>>();

let token: { value: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

/** After a failed login, stop trying for a while and fall back to straight-line distance. */
const AUTH_COOLDOWN_MS = 5 * 60_000;
let authFailedAt = 0;
function authCoolingDown() {
  return Date.now() - authFailedAt < AUTH_COOLDOWN_MS;
}

async function getToken(): Promise<string> {
  // Tokens last 3 days; refresh an hour early.
  if (token && Date.now() < token.expiresAt - 3600_000) return token.value;
  if (authCoolingDown()) throw new Error("OneMap auth cooling down");
  tokenPromise ??= (async () => {
    try {
      const r = await fetch("https://www.onemap.gov.sg/api/auth/post/getToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: config.oneMap.email, password: config.oneMap.password }),
      });
      if (!r.ok) {
        authFailedAt = Date.now();
        console.error(`OneMap auth failed (HTTP ${r.status}) — check ONEMAP_EMAIL / ONEMAP_PASSWORD`);
        throw new Error(`OneMap auth failed (HTTP ${r.status})`);
      }
      const b = (await r.json()) as { access_token: string; expiry_timestamp: string };
      token = { value: b.access_token, expiresAt: Number(b.expiry_timestamp) * 1000 };
      return token.value;
    } finally {
      tokenPromise = null;
    }
  })();
  return tokenPromise;
}

/* Simple concurrency limiter: OneMap allows roughly 250 requests/min. */
const MAX_CONCURRENT = 4;
let active = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

async function fetchRoute(from: LatLng, to: LatLng): Promise<Commute | null> {
  const p = new URLSearchParams({
    start: `${from.lat},${from.lng}`,
    end: `${to.lat},${to.lng}`,
    routeType: "pt",
    mode: "TRANSIT",
    date: nextSchoolDay(),
    time: config.oneMap.departTime,
    maxWalkDistance: "1000",
    numItineraries: "3",
  });
  return limited(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(`https://www.onemap.gov.sg/api/public/routingsvc/route?${p}`, {
        headers: { Authorization: await getToken() },
      });
      if (r.status === 401 && attempt === 0) {
        token = null; // expired early: re-authenticate once
        continue;
      }
      if (r.status === 429) throw new Error("OneMap rate limited");
      if (!r.ok) return null;
      return parseOneMapPt(await r.json());
    }
    return null;
  });
}

/** Fetch (or reuse) one commute and store it. Shared by concurrent callers. */
function loadOne(key: string, home: LatLng, code: string, dest: LatLng): Promise<Commute | null> {
  const k = `${key}|${code}`;
  if (mem.has(k)) return Promise.resolve(mem.get(k)!);
  let p = inflight.get(k);
  if (!p) {
    p = fetchRoute(home, dest)
      .then(async (c) => {
        mem.set(k, c);
        const db = await getDb();
        await db
          .insert(schema.commuteCache)
          .values({ origin_key: key, school_code: code, data: c })
          .onConflictDoUpdate({
            target: [schema.commuteCache.origin_key, schema.commuteCache.school_code],
            set: { data: c, created_at: new Date() },
          });
        return c;
      })
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

/**
 * Commutes from `home` to each school. Waits at most `budgetMs` for uncached routes;
 * anything slower keeps loading in the background (and is cached for the next request)
 * and is reported in `pending`.
 */
export async function getCommutes(
  home: LatLng,
  schools: { code: string; lat: number; lng: number }[],
  budgetMs = 4000,
): Promise<{
  commutes: Map<string, Commute | null>;
  pending: number;
  /** Resolves when background lookups finish. Pass to `after()` so serverless hosts don't freeze them. */
  settled: Promise<unknown>;
}> {
  const out = new Map<string, Commute | null>();
  const done = Promise.resolve();
  if (!commuteEnabled() || schools.length === 0) return { commutes: out, pending: 0, settled: done };
  const key = originKey(home);
  // Route from the rounded point, so cached results are identical for everyone sharing a key.
  const [lat, lng] = key.split(",").map(Number);
  const origin = { lat, lng };

  // 1. Memory, then DB.
  const missing: typeof schools = [];
  for (const s of schools) {
    const k = `${key}|${s.code}`;
    if (mem.has(k)) out.set(s.code, mem.get(k)!);
    else missing.push(s);
  }
  if (missing.length) {
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.commuteCache)
      .where(and(eq(schema.commuteCache.origin_key, key), inArray(schema.commuteCache.school_code, missing.map((s) => s.code))));
    const fresh = Date.now() - CACHE_DAYS * 86400_000;
    for (const r of rows) {
      if (r.created_at.getTime() < fresh) continue;
      mem.set(`${key}|${r.school_code}`, r.data as Commute | null);
      out.set(r.school_code, r.data as Commute | null);
    }
  }

  // 2. Fetch the rest from OneMap, within the time budget.
  const todo = missing.filter((s) => !out.has(s.code));
  if (todo.length === 0) return { commutes: out, pending: 0, settled: done };
  const tasks = todo.map((s) =>
    loadOne(key, origin, s.code, s)
      .then((c) => out.set(s.code, c))
      .catch(() => {
        /* rate limit or network: leave pending, fall back to estimate */
      }),
  );
  const settled = Promise.allSettled(tasks);
  await Promise.race([settled, new Promise((r) => setTimeout(r, budgetMs))]);
  // If login is failing, nothing is really pending: don't make the page keep polling.
  const pending = authCoolingDown() ? 0 : todo.filter((s) => !out.has(s.code)).length;
  return { commutes: new Map(out), pending, settled };
}

export async function getCommute(home: LatLng, school: { code: string; lat: number; lng: number }) {
  const { commutes } = await getCommutes(home, [school], 10_000);
  return commutes.get(school.code) ?? null;
}
