/**
 * Seed VIN Enrichment Queue (Task #289)
 *
 * Populates vin_enrichment_queue with VINs that don't already have a complete
 * bimmer.work result. Idempotent — silently skips VINs already in the queue.
 *
 * Usage:
 *   npx tsx scripts/seed-vin-enrichment-queue.ts --source vin_cache
 *   npx tsx scripts/seed-vin-enrichment-queue.ts --source user_cars
 *   npx tsx scripts/seed-vin-enrichment-queue.ts --file path/to/vins.txt
 *   npx tsx scripts/seed-vin-enrichment-queue.ts --source vin_cache --source user_cars
 */

import pg from "pg";
import { readFile } from "fs/promises";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

function parseArgs() {
  const args = process.argv.slice(2);
  const sources: string[] = [];
  let file: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) {
      sources.push(args[++i]);
    } else if (args[i] === "--file" && args[i + 1]) {
      file = args[++i];
    }
  }

  if (sources.length === 0 && !file) {
    sources.push("vin_cache");
  }
  return { sources, file };
}

async function ensureQueueTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS vin_enrichment_queue (
      vin VARCHAR(17) PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempted_at TIMESTAMP,
      error TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS vin_enrichment_queue_status_idx ON vin_enrichment_queue(status)
  `);
}

async function getAlreadyEnrichedVins(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query(`
    SELECT vin FROM vin_cache
    WHERE enriched_data IS NOT NULL
      AND (
        enrichment_source -> 'options' ->> 'source' IN ('bimmerwork', 'mdecoder', 'vindecoderz')
        OR enrichment_source -> 'vehicle' ->> 'source' IN ('bimmerwork', 'mdecoder', 'vindecoderz')
      )
  `);
  return new Set(result.rows.map((r: any) => r.vin as string));
}

async function getAlreadyQueuedVins(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query(`SELECT vin FROM vin_enrichment_queue WHERE status IN ('pending', 'in_progress', 'done')`);
  return new Set(result.rows.map((r: any) => r.vin as string));
}

async function getVinsFromSource(client: pg.PoolClient, source: string): Promise<string[]> {
  if (source === "vin_cache") {
    const result = await client.query(`SELECT vin FROM vin_cache WHERE vin IS NOT NULL`);
    return result.rows.map((r: any) => r.vin as string);
  } else if (source === "user_cars") {
    const result = await client.query(`SELECT DISTINCT vin FROM user_cars WHERE vin IS NOT NULL AND length(vin) = 17`);
    return result.rows.map((r: any) => (r.vin as string).toUpperCase());
  } else {
    console.error(`Unknown source: ${source}. Valid sources: vin_cache, user_cars`);
    return [];
  }
}

async function getVinsFromFile(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, "utf-8");
  return content
    .split(/\r?\n/)
    .map(v => v.trim().toUpperCase())
    .filter(v => v.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v));
}

async function batchInsert(client: pg.PoolClient, vins: string[]): Promise<number> {
  if (vins.length === 0) return 0;
  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < vins.length; i += BATCH) {
    const batch = vins.slice(i, i + BATCH);
    const values = batch.map((_, idx) => `($${idx + 1})`).join(", ");
    const result = await client.query(
      `INSERT INTO vin_enrichment_queue (vin) VALUES ${values} ON CONFLICT (vin) DO NOTHING`,
      batch
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function main() {
  const { sources, file } = parseArgs();

  const client = await pool.connect();
  try {
    await ensureQueueTable(client);

    const [enriched, queued] = await Promise.all([
      getAlreadyEnrichedVins(client),
      getAlreadyQueuedVins(client),
    ]);

    console.log(`Already enriched (bimmer.work): ${enriched.size}`);
    console.log(`Already queued (pending/done): ${queued.size}`);

    const allVins = new Set<string>();

    for (const source of sources) {
      const vins = await getVinsFromSource(client, source);
      console.log(`Source '${source}': ${vins.length} VINs`);
      for (const v of vins) allVins.add(v.toUpperCase());
    }

    if (file) {
      const vins = await getVinsFromFile(file);
      console.log(`File '${file}': ${vins.length} VINs`);
      for (const v of vins) allVins.add(v);
    }

    const toQueue = [...allVins].filter(v => !enriched.has(v) && !queued.has(v));
    console.log(`\nTotal unique VINs: ${allVins.size}`);
    console.log(`Skipped (already enriched or queued): ${allVins.size - toQueue.length}`);
    console.log(`New VINs to queue: ${toQueue.length}`);

    if (toQueue.length > 0) {
      const inserted = await batchInsert(client, toQueue);
      console.log(`\n✓ Inserted ${inserted} new VINs into vin_enrichment_queue`);
    } else {
      console.log("\nNothing to insert.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
