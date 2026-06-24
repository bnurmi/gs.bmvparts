import path from "path";
import { readFile } from "fs/promises";
import { sql } from "drizzle-orm";
import { db } from "./storage";
import { importBmwModels } from "./bmw-models-importer";
import { invalidateBmwModelsIndex } from "./vin-decoder";

/**
 * Greenfield-deploy seed for the bmw_models reference table.
 *
 * data/bmw-models-seed.json is a snapshot of the prod bmw_models table
 * (snake_case PG dump shape). On startup we count existing rows; if the
 * table is sparser than the seed (covers fresh deploys, restored
 * backups missing this table, or a manual truncate), we load the seed
 * and call importBmwModels (idempotent via ON CONFLICT DO NOTHING).
 *
 * Skipped quickly on warm boots — the COUNT(*) check is the only DB
 * round-trip when the table is already populated.
 *
 * Fire-and-forget from server/index.ts after listen() so it never
 * blocks the server from accepting traffic / passing healthchecks.
 */

// Threshold: skip seed when the table already has at least this many
// rows. Set conservatively below the seed size (6,560) so a slightly
// stale seed never blocks a recently-grown table from being trusted.
const SEED_SKIP_THRESHOLD = 6000;

export async function runBmwModelsSeed(): Promise<void> {
  if (process.env.BMW_MODELS_SEED_DISABLED === "1") {
    console.log("[bmw-models-seed] disabled via BMW_MODELS_SEED_DISABLED=1");
    return;
  }

  const startedAt = Date.now();

  try {
    const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM bmw_models`));
    const currentCount = (countResult as any).rows?.[0]?.c ?? (countResult as any)[0]?.c ?? 0;

    if (currentCount >= SEED_SKIP_THRESHOLD) {
      console.log(`[bmw-models-seed] skipped: table has ${currentCount} rows (>= ${SEED_SKIP_THRESHOLD})`);
      return;
    }

    const seedPath = path.resolve(process.cwd(), "data", "bmw-models-seed.json");
    let seedRaw: string;
    try {
      seedRaw = await readFile(seedPath, "utf-8");
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        console.warn(`[bmw-models-seed] seed file not found at ${seedPath}; skipping`);
        return;
      }
      throw err;
    }

    const models = JSON.parse(seedRaw);
    if (!Array.isArray(models)) {
      console.error("[bmw-models-seed] seed file is not an array; skipping");
      return;
    }

    console.log(`[bmw-models-seed] table has ${currentCount} rows < ${SEED_SKIP_THRESHOLD}; loading seed (${models.length} rows)`);
    const result = await importBmwModels(models);
    invalidateBmwModelsIndex();

    const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[bmw-models-seed] done in ${dur}s: ${result.inserted} inserted, ${result.existed} already present`);
  } catch (err: any) {
    console.error("[bmw-models-seed] failed:", err?.message || err);
  }
}
