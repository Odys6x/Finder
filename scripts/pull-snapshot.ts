/**
 * Pull data.gov.sg into data/snapshot/schools.json so the app can be seeded
 * offline. Usage: npm run data:snapshot
 */
import fs from "node:fs";
import path from "node:path";
import { pullDataGov } from "../src/lib/datagov";

const out = path.join(process.cwd(), "data", "snapshot", "schools.json");

async function main() {
  let known: Map<string, { lat: number; lng: number }> | undefined;
  if (fs.existsSync(out)) {
    const prev = JSON.parse(fs.readFileSync(out, "utf8")) as { schools: { postal_code: string; lat: number | null; lng: number | null }[] };
    known = new Map(
      prev.schools.filter((s) => s.lat !== null && s.lng !== null).map((s) => [s.postal_code, { lat: s.lat!, lng: s.lng! }]),
    );
  }
  const res = await pullDataGov({ apiKey: process.env.DATA_GOV_SG_API_KEY, log: console.log, knownCoords: known });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ accessed_at: new Date().toISOString(), ...res }, null, 1));
  console.log(`Wrote ${res.schools.length} schools to ${out}`);
  for (const u of res.unmatched) console.log(`Unmatched in ${u.dataset}:`, u.names.join(" | "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
