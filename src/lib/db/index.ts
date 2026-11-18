import "server-only";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "../config";
import * as schema from "./schema";

/**
 * Database access.
 * - DATABASE_URL set → real Postgres (Supabase, Neon, ...). Required in production / on Vercel.
 * - otherwise → embedded PGlite (Postgres in WASM) persisted to PGLITE_DIR, for local dev only.
 * Both speak the same Postgres dialect, so one Drizzle schema and one set of migrations serve both.
 *
 * Serverless (Vercel): every function instance gets its own small pool, so point DATABASE_URL at
 * your provider's *pooled* connection string (Supabase transaction pooler, port 6543; Neon "-pooler"
 * host). Migrations run once at deploy time (`npm run db:migrate` in `vercel-build`), not on cold start.
 */
export type DB = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __spDb?: Promise<DB> };

const isServerless = !!process.env.VERCEL;

async function connect(): Promise<DB> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (config.database.url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      connectionString: config.database.url,
      // Many short-lived instances: keep each pool tiny and release idle connections quickly.
      max: isServerless ? 3 : 10,
      idleTimeoutMillis: isServerless ? 5_000 : 30_000,
      connectionTimeoutMillis: 10_000,
    });
    const db = drizzle({ client: pool, schema });
    if (config.database.migrateOnStart) {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrate(db, { migrationsFolder });
    }
    return db;
  }
  if (isServerless) {
    // The embedded DB writes to local disk, which serverless hosts don't keep. Fail loudly.
    throw new Error("DATABASE_URL is not set. Production and Vercel deployments need a Postgres database.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.resolve(config.database.pgliteDir);
  const fs = await import("node:fs");
  fs.mkdirSync(dir, { recursive: true });

  const open = async () => {
    const client = new PGlite(dir);
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as DB;
  };
  try {
    return await open();
  } catch (first) {
    // A dev server that was killed hard can leave a stale lock and/or damaged files.
    // 1) The embedded DB is single-process, so clearing the lock is safe: retry once.
    const lock = path.join(dir, "postmaster.pid");
    if (fs.existsSync(lock)) {
      console.warn("PGlite: removing stale lock file left by an unclean shutdown and retrying");
      fs.rmSync(lock);
      try {
        return await open();
      } catch {
        /* fall through to rebuild */
      }
    }
    // 2) Still broken: keep the damaged copy for inspection and start fresh. Schools reseed
    //    from data/snapshot automatically; admin-imported COPs must be re-imported.
    const aside = `${dir}-damaged-${Date.now()}`;
    fs.renameSync(dir, aside);
    fs.mkdirSync(dir, { recursive: true });
    console.error(
      `PGlite: the local database could not be opened (${(first as Error).message}). ` +
        `Moved it to ${aside} and created a fresh one. Re-import any COP / SchoolFinder CSVs in /admin.`,
    );
    return open();
  }
}

export function getDb(): Promise<DB> {
  if (!g.__spDb) {
    g.__spDb = connect().catch((err) => {
      g.__spDb = undefined;
      throw err;
    });
  }
  return g.__spDb;
}

export { schema };
