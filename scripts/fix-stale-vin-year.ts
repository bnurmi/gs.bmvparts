/**
 * scripts/fix-stale-vin-year.ts
 *
 * One-time sweep that finds vin_cache rows where a NHTSA-corrupted year
 * (specifically 2000, from year-code "0" being mis-applied by NHTSA's SAE
 * standard mapping) was written into enriched_data for F- or G-series chassis.
 *
 * For each such row the script nulls out the stale productionDate /
 * vehicle.startOfProduction fields so that the next decode request re-runs
 * the enrichment path using the now-corrected chassis-range table.
 *
 * Safe to re-run: the WHERE clause only matches rows that still carry the
 * bad year pattern — already-fixed rows are skipped automatically.
 *
 * Usage:
 *   npx tsx scripts/fix-stale-vin-year.ts
 *   DATABASE_URL=<prod-url> npx tsx scripts/fix-stale-vin-year.ts
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const BATCH_SIZE = 500;

// A productionDate / startOfProduction in MM/YYYY format whose year is 2000
// on an F- or G-series chassis is physically impossible — F-series started in
// 2008 at earliest. This pattern is the signature of the NHTSA year-code "0"
// mis-mapping (SAE standard: "0" = 2000; BMW non-standard: "0" = 2020).
const STALE_YEAR_REGEX = "^(0[1-9]|1[0-2])/2000$";

async function countStaleRows(client: pg.PoolClient): Promise<number> {
  const res = await client.query<{ cnt: string }>(`
    SELECT COUNT(*) AS cnt
    FROM vin_cache
    WHERE (
      enriched_data->>'productionDate' ~ $1
      OR enriched_data->'vehicle'->>'startOfProduction' ~ $1
    )
    AND (
      decoded_data->>'chassis' LIKE 'F%'
      OR decoded_data->>'chassis' LIKE 'G%'
    )
  `, [STALE_YEAR_REGEX]);
  return parseInt(res.rows[0].cnt, 10);
}

async function fixBatch(client: pg.PoolClient): Promise<number> {
  // Single-pass: build a cleaned enriched_data that removes productionDate
  // and nulls vehicle.startOfProduction in one jsonb expression, so we never
  // SET the same column twice (which PostgreSQL forbids).
  const res = await client.query(`
    UPDATE vin_cache
    SET
      enriched_data = (
        -- Step 1: remove top-level productionDate if it is the stale year
        CASE
          WHEN enriched_data->>'productionDate' ~ $1
            THEN enriched_data - 'productionDate'
          ELSE enriched_data
        END
        -- Step 2: null vehicle.startOfProduction if it is the stale year.
        -- Applied as a second transformation on the result of step 1.
        |> (
          CASE
            WHEN enriched_data->'vehicle'->>'startOfProduction' ~ $1
              THEN jsonb_set(
                $2,  -- placeholder; replaced below with a sub-expression
                '{vehicle,startOfProduction}',
                'null'::jsonb
              )
            ELSE $2
          END
        )
      ),
      updated_at = NOW()
    WHERE vin IN (
      SELECT vin FROM vin_cache
      WHERE (
        enriched_data->>'productionDate' ~ $1
        OR enriched_data->'vehicle'->>'startOfProduction' ~ $1
      )
      AND (
        decoded_data->>'chassis' LIKE 'F%'
        OR decoded_data->>'chassis' LIKE 'G%'
      )
      LIMIT $3
    )
  `, [STALE_YEAR_REGEX, STALE_YEAR_REGEX, BATCH_SIZE]);

  return res.rowCount ?? 0;
}

// The |> pipe operator only exists in Postgres 16+. Use a nested expression
// instead for broader compatibility.
async function fixBatchCompat(client: pg.PoolClient): Promise<number> {
  const res = await client.query(`
    UPDATE vin_cache
    SET
      enriched_data = (
        SELECT
          CASE
            WHEN step1->'vehicle'->>'startOfProduction' ~ $1
              THEN jsonb_set(step1, '{vehicle,startOfProduction}', 'null'::jsonb)
            ELSE step1
          END
        FROM (
          SELECT
            CASE
              WHEN enriched_data->>'productionDate' ~ $1
                THEN enriched_data - 'productionDate'
              ELSE enriched_data
            END AS step1
        ) AS sub
      ),
      updated_at = NOW()
    WHERE vin IN (
      SELECT vin FROM vin_cache
      WHERE (
        enriched_data->>'productionDate' ~ $1
        OR enriched_data->'vehicle'->>'startOfProduction' ~ $1
      )
      AND (
        decoded_data->>'chassis' LIKE 'F%'
        OR decoded_data->>'chassis' LIKE 'G%'
      )
      LIMIT $2
    )
  `, [STALE_YEAR_REGEX, BATCH_SIZE]);

  return res.rowCount ?? 0;
}

async function main() {
  console.log("=== Stale VIN year sweep ===");
  console.log(`Target: vin_cache rows with productionDate/startOfProduction matching ${STALE_YEAR_REGEX} on F/G-series chassis`);
  console.log("");

  const client = await pool.connect();
  try {
    const totalRows = await countStaleRows(client);
    console.log(`Found ${totalRows} stale rows.`);

    if (totalRows === 0) {
      console.log("Nothing to do. Exiting.");
      return;
    }

    let fixed = 0;
    let iterations = 0;
    const maxIterations = Math.ceil(totalRows / BATCH_SIZE) + 5; // safety ceiling

    while (iterations < maxIterations) {
      const batchFixed = await fixBatchCompat(client);
      if (batchFixed === 0) break;

      fixed += batchFixed;
      iterations++;
      console.log(`  Batch ${iterations}: fixed ${batchFixed} rows (running total: ${fixed})`);
    }

    console.log("");
    console.log(`Done. Fixed ${fixed} rows total.`);
    console.log("These VINs will re-run enrichment on their next decode request.");
    console.log("The fixed chassis-range table (F31 ceiling → 2020) will resolve the year correctly.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Sweep failed:", err);
  process.exit(1);
});
