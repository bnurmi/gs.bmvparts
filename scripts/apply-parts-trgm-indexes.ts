/**
 * One-time migration: apply GIN trigram indexes to the parts table.
 *
 * Must be run manually against prod BEFORE publishing, because:
 * - CREATE INDEX CONCURRENTLY cannot run inside a transaction (which drizzle
 *   startup migrations use), so it cannot be added to server/index.ts.
 * - On 5.97M rows the index build takes ~30-120s; CONCURRENTLY avoids a
 *   table-level write lock so the live site stays up during the build.
 *
 * Usage (dev):
 *   npx tsx scripts/apply-parts-trgm-indexes.ts
 *
 * Usage (prod):
 *   DATABASE_URL=<prod-connection-string> npx tsx scripts/apply-parts-trgm-indexes.ts
 *
 * The script is idempotent: IF NOT EXISTS guards make re-runs safe no-ops.
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

const STATEMENTS: Array<{ label: string; sql: string }> = [
  {
    label: "pg_trgm extension",
    sql: "CREATE EXTENSION IF NOT EXISTS pg_trgm",
  },
  {
    label: "idx_parts_description_trgm (GIN, CONCURRENTLY)",
    sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parts_description_trgm ON parts USING gin (description gin_trgm_ops)",
  },
  {
    label: "idx_parts_part_number_trgm (GIN, CONCURRENTLY)",
    sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parts_part_number_trgm ON parts USING gin (part_number gin_trgm_ops)",
  },
  {
    label: "idx_parts_part_number_clean_trgm (GIN, CONCURRENTLY)",
    sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parts_part_number_clean_trgm ON parts USING gin (part_number_clean gin_trgm_ops)",
  },
];

async function main() {
  await client.connect();
  console.log("[apply-parts-trgm-indexes] connected to database");

  for (const { label, sql } of STATEMENTS) {
    console.log(`[apply-parts-trgm-indexes] running: ${label} ...`);
    const start = Date.now();
    await client.query(sql);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[apply-parts-trgm-indexes] done: ${label} in ${elapsed}s`);
  }

  console.log("[apply-parts-trgm-indexes] all indexes applied successfully");
  await client.end();
}

main().catch((err) => {
  console.error("[apply-parts-trgm-indexes] FATAL:", err.message);
  client.end().catch(() => {});
  process.exit(1);
});
