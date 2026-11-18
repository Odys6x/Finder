/**
 * Apply Drizzle migrations to DATABASE_URL once, at deploy time.
 * Vercel runs this via the `vercel-build` script before `next build`.
 */
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  // Prefer a direct (non-pooled) URL for DDL if provided; transaction poolers can reject some statements.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    // Don't fail the build: on Vercel the database is usually connected after the first deploy.
    // The app itself refuses to run without DATABASE_URL, so this can't go unnoticed.
    console.warn("WARNING: DATABASE_URL is not set — skipping migrations. Connect a database and redeploy.");
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
