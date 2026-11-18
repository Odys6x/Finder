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
    console.error("DATABASE_URL is not set — cannot run migrations.");
    process.exit(1);
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
