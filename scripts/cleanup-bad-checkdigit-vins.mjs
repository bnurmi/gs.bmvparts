// One-shot cleanup: remove VINs that fail the ISO 3779 check-digit from
// (a) the production-bound seed file and (b) the local vin_cache table.
// After this runs and the seed is re-published, no transcription-error VIN
// will reach SSR or the sitemap from any layer.
import fs from "fs";
import pg from "pg";
import { isValidVin } from "./lib/vin-check-digit.mjs";

const { Pool } = pg;
const SEED = process.env.SEED || "data/seed/vin-cache-backfill.jsonl";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1) Filter the seed file in place (atomic write via temp + rename).
console.log(`[cleanup] reading seed: ${SEED}`);
const lines = fs.readFileSync(SEED, "utf8").split("\n");
let kept = 0, dropped = 0;
const droppedVins = [];
const tmp = SEED + ".tmp";
const out = fs.createWriteStream(tmp);
for (const l of lines) {
  if (!l) continue;
  try {
    const r = JSON.parse(l);
    if (isValidVin(r.vin)) { out.write(l + "\n"); kept++; }
    else { dropped++; if (droppedVins.length < 20) droppedVins.push(r.vin); }
  } catch {
    // preserve unparseable lines untouched (none expected, but be safe)
    out.write(l + "\n");
    kept++;
  }
}
out.end();
await new Promise((r) => out.on("close", r));
fs.renameSync(tmp, SEED);
console.log(`[cleanup] seed: kept=${kept} dropped=${dropped}`);
if (droppedVins.length) console.log(`[cleanup] sample dropped VINs: ${droppedVins.join(",")}`);

// 2) Walk the DB in batches and DELETE the same set.
console.log(`[cleanup] scanning vin_cache for invalid check-digit VINs...`);
const { rows } = await pool.query("SELECT vin FROM vin_cache");
const badInDb = rows.map(r => r.vin).filter(v => !isValidVin(v));
console.log(`[cleanup] DB: scanned=${rows.length} badCheckDigit=${badInDb.length}`);
if (badInDb.length) {
  const BATCH = 500;
  let deleted = 0;
  for (let i = 0; i < badInDb.length; i += BATCH) {
    const slice = badInDb.slice(i, i + BATCH);
    const r = await pool.query("DELETE FROM vin_cache WHERE vin = ANY($1::text[])", [slice]);
    deleted += r.rowCount;
  }
  console.log(`[cleanup] DB: deleted=${deleted}`);
}

// 3) Final verification.
const { rows: post } = await pool.query("SELECT source, COUNT(*)::int AS n FROM vin_cache GROUP BY source ORDER BY n DESC");
console.log("\n[cleanup] post-cleanup vin_cache breakdown:");
for (const r of post) console.log(`  ${r.source}: ${r.n}`);
const totalDb = post.reduce((a,r) => a + r.n, 0);
console.log(`  total: ${totalDb}`);

await pool.end();
console.log("\n[cleanup] done");
