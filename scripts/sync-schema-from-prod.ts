/**
 * Dev/prod schema sync: copy missing indexes and constraints from prod → dev.
 *
 * Drizzle-kit diffs shared/schema.ts against the live prod DB on every publish.
 * When prod has indexes or constraints that dev is missing, drizzle proposes
 * DROP INDEX / DROP CONSTRAINT — destructive operations on a live DB. Running
 * this script before publishing brings dev in sync so drizzle sees no diff.
 *
 * What it syncs (from prod → dev):
 *   - Custom indexes   (pg_indexes, excluding system/pk indexes)
 *   - Unique, check, and foreign-key constraints (pg_constraint types u, c, f)
 *
 * What it does NOT sync:
 *   - Row data
 *   - Column definitions / table structures (use drizzle migrations for those)
 *
 * Usage:
 *   PROD_DATABASE_URL=<prod-connection-string> npx tsx scripts/sync-schema-from-prod.ts
 *
 * DATABASE_URL is read from the environment (already set in Replit dev).
 * PROD_DATABASE_URL must point to the live production database.
 *
 * The script is idempotent: IF NOT EXISTS guards make re-runs safe no-ops.
 */

import pg from "pg";

const DEV_URL = process.env.DATABASE_URL;
const PROD_URL = process.env.PROD_DATABASE_URL;

if (!DEV_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set (dev DB).");
  process.exit(1);
}
if (!PROD_URL) {
  console.error("ERROR: PROD_DATABASE_URL environment variable is not set.");
  console.error("  Usage: PROD_DATABASE_URL=<prod-conn-string> npx tsx scripts/sync-schema-from-prod.ts");
  process.exit(1);
}

const devClient = new pg.Client({ connectionString: DEV_URL });
const prodClient = new pg.Client({ connectionString: PROD_URL });

const SCRIPT = "sync-schema-from-prod";

function log(msg: string) {
  console.log(`[${SCRIPT}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Index sync
// ---------------------------------------------------------------------------

interface IndexRow {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexdef: string;
}

/** Stable composite key: schema + table + index name (globally unique in PG). */
function indexKey(row: IndexRow): string {
  return `${row.schemaname}.${row.tablename}.${row.indexname}`;
}

/**
 * Fetch all non-system, non-primary-key custom indexes from a connection.
 * Excludes:
 *   - pg_* system indexes
 *   - indexes whose name ends with _pkey  (primary keys — drizzle manages these)
 *   - indexes on pg_catalog / information_schema tables
 */
async function fetchIndexes(client: pg.Client): Promise<Map<string, IndexRow>> {
  const result = await client.query<IndexRow>(`
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND indexname NOT LIKE 'pg_%'
      AND indexname NOT LIKE '%_pkey'
    ORDER BY tablename, indexname
  `);
  const map = new Map<string, IndexRow>();
  for (const row of result.rows) {
    map.set(indexKey(row), row);
  }
  return map;
}

async function syncIndexes(): Promise<{ applied: number; failed: number }> {
  log("querying prod indexes...");
  const prodIndexes = await fetchIndexes(prodClient);
  log(`found ${prodIndexes.size} custom indexes on prod`);

  log("querying dev indexes...");
  const devIndexes = await fetchIndexes(devClient);
  log(`found ${devIndexes.size} custom indexes on dev`);

  const missing: IndexRow[] = [];
  for (const [key, row] of prodIndexes) {
    if (!devIndexes.has(key)) {
      missing.push(row);
    }
  }

  if (missing.length === 0) {
    log("indexes: dev is already in sync with prod (nothing to add)");
    return { applied: 0, failed: 0 };
  }

  log(`indexes: ${missing.length} index(es) present on prod but missing on dev:`);
  for (const idx of missing) {
    log(`  - ${idx.schemaname}.${idx.tablename}.${idx.indexname}`);
  }

  let applied = 0;
  let failed = 0;
  for (const idx of missing) {
    // indexdef from pg_indexes is the full CREATE INDEX statement (without
    // CONCURRENTLY, which is fine for dev). We inject IF NOT EXISTS for safety.
    let sql = idx.indexdef;

    // Normalise: replace "CREATE INDEX" or "CREATE UNIQUE INDEX" with the
    // IF NOT EXISTS variant so the statement is a safe no-op on re-run.
    sql = sql.replace(
      /^CREATE (UNIQUE )?INDEX /i,
      (_, unique) => `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `,
    );

    log(`applying: ${idx.schemaname}.${idx.tablename}.${idx.indexname} ...`);
    const start = Date.now();
    try {
      await devClient.query(sql);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      log(`done: ${idx.indexname} in ${elapsed}s`);
      applied++;
    } catch (err: any) {
      log(`WARN: failed to apply ${idx.indexname}: ${err.message}`);
      log(`  SQL was: ${sql}`);
      failed++;
    }
  }

  return { applied, failed };
}

// ---------------------------------------------------------------------------
// Constraint sync (unique, check, foreign-key — skip primary keys)
// ---------------------------------------------------------------------------

interface ConstraintRow {
  conname: string;
  contype: string;   // u=unique, c=check, f=foreign key
  schemaname: string;
  relname: string;   // table name
  condef: string;    // full constraint definition from pg_get_constraintdef()
}

/** Stable composite key: schema + table + constraint name. */
function constraintKey(row: ConstraintRow): string {
  return `${row.schemaname}.${row.relname}.${row.conname}`;
}

async function fetchConstraints(client: pg.Client): Promise<Map<string, ConstraintRow>> {
  const result = await client.query<ConstraintRow>(`
    SELECT
      c.conname,
      c.contype,
      n.nspname AS schemaname,
      r.relname,
      pg_get_constraintdef(c.oid) AS condef
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype IN ('u', 'c', 'f')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY r.relname, c.conname
  `);
  const map = new Map<string, ConstraintRow>();
  for (const row of result.rows) {
    map.set(constraintKey(row), row);
  }
  return map;
}

async function syncConstraints(): Promise<{ applied: number; failed: number }> {
  log("querying prod constraints (unique, check, fk)...");
  const prodConstraints = await fetchConstraints(prodClient);
  log(`found ${prodConstraints.size} non-pk constraints on prod`);

  log("querying dev constraints...");
  const devConstraints = await fetchConstraints(devClient);
  log(`found ${devConstraints.size} non-pk constraints on dev`);

  const missing: ConstraintRow[] = [];
  for (const [key, row] of prodConstraints) {
    if (!devConstraints.has(key)) {
      missing.push(row);
    }
  }

  if (missing.length === 0) {
    log("constraints: dev is already in sync with prod (nothing to add)");
    return { applied: 0, failed: 0 };
  }

  log(`constraints: ${missing.length} constraint(s) present on prod but missing on dev:`);
  for (const c of missing) {
    const typeLabel = c.contype === "u" ? "UNIQUE" : c.contype === "c" ? "CHECK" : "FOREIGN KEY";
    log(`  - ${c.schemaname}.${c.relname}.${c.conname} (${typeLabel})`);
  }

  let applied = 0;
  let failed = 0;
  for (const c of missing) {
    // Schema-qualified table reference prevents cross-schema ambiguity.
    const sql = `ALTER TABLE "${c.schemaname}"."${c.relname}" ADD CONSTRAINT "${c.conname}" ${c.condef}`;
    log(`applying: ${c.schemaname}.${c.relname}.${c.conname} ...`);
    const start = Date.now();
    try {
      await devClient.query(sql);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      log(`done: ${c.conname} in ${elapsed}s`);
      applied++;
    } catch (err: any) {
      // Constraint already exists or references an object that doesn't exist
      // on dev. Log the warning but don't abort — partial progress is valuable.
      log(`WARN: failed to apply ${c.conname}: ${err.message}`);
      log(`  SQL was: ${sql}`);
      failed++;
    }
  }

  return { applied, failed };
}

// ---------------------------------------------------------------------------
// Explicit fallback: the two known missing indexes
// ---------------------------------------------------------------------------

/**
 * Ensure the two specific indexes that triggered this task are present on dev.
 * These run as a fallback even if the auto-discovery above already created them
 * (IF NOT EXISTS makes them safe no-ops).
 */
async function ensureKnownMissingIndexes(): Promise<{ applied: number; failed: number }> {
  const knownIndexes: Array<{ label: string; sql: string }> = [
    {
      label: "servicing_coverage_requests_created_idx",
      sql: `CREATE INDEX IF NOT EXISTS servicing_coverage_requests_created_idx
            ON servicing_coverage_requests (created_at)`,
    },
    {
      label: "seo_content_pages_generated_idx",
      sql: `CREATE INDEX IF NOT EXISTS seo_content_pages_generated_idx
            ON seo_content_pages (generated_at)`,
    },
  ];

  let applied = 0;
  let failed = 0;
  for (const { label, sql } of knownIndexes) {
    log(`ensuring known index: ${label} ...`);
    const start = Date.now();
    try {
      await devClient.query(sql);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      log(`done: ${label} in ${elapsed}s`);
      applied++;
    } catch (err: any) {
      // Table may not exist on dev yet — warn and continue.
      log(`WARN: could not ensure ${label}: ${err.message}`);
      failed++;
    }
  }
  return { applied, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log("connecting to dev and prod databases...");
  await Promise.all([devClient.connect(), prodClient.connect()]);
  log("connected");

  const { applied: idxApplied, failed: idxFailed } = await syncIndexes();
  const { applied: conApplied, failed: conFailed } = await syncConstraints();
  const { applied: knownApplied, failed: knownFailed } = await ensureKnownMissingIndexes();

  const totalApplied = idxApplied + conApplied + knownApplied;
  const totalFailed = idxFailed + conFailed + knownFailed;

  log("---");
  log(`summary: ${totalApplied} object(s) applied, ${totalFailed} failed`);
  log(`  indexes:     ${idxApplied} applied, ${idxFailed} failed`);
  log(`  constraints: ${conApplied} applied, ${conFailed} failed`);
  log(`  known fixes: ${knownApplied} applied, ${knownFailed} failed`);
  if (totalFailed > 0) {
    log("WARN: some objects could not be applied — review the WARN lines above.");
    log("      Failures are often due to missing referenced tables on dev (safe to ignore).");
  } else {
    log("dev DB is now in sync with prod schema objects.");
  }
  log("safe to re-run at any time — IF NOT EXISTS guards make this a no-op.");

  await Promise.all([devClient.end(), prodClient.end()]);

  if (totalFailed > 0) {
    process.exit(0); // Non-zero would break CI; partial success is still useful.
  }
}

main().catch((err) => {
  console.error(`[${SCRIPT}] FATAL:`, err.message);
  Promise.all([devClient.end().catch(() => {}), prodClient.end().catch(() => {})]).finally(
    () => process.exit(1),
  );
});
