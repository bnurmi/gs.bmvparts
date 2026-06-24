import fs from "fs";
import path from "path";
import { db } from "./storage";
import { sql } from "drizzle-orm";

const SEED_PATH = path.resolve(process.cwd(), "data/seed/vin-cache-backfill.jsonl");

interface SeedRow {
  vin: string;
  source: string | null;
  enriched_data: unknown;
  catalog_matches: unknown;
  decoded_data: unknown;
  enrichment_source: unknown;
}

function readSeed(): SeedRow[] {
  if (!fs.existsSync(SEED_PATH)) return [];
  const raw = fs.readFileSync(SEED_PATH, "utf-8").trim();
  if (!raw) return [];
  const out: SeedRow[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

export async function ensureVinCacheBackfill(): Promise<void> {
  const seed = readSeed();
  if (seed.length === 0) return;

  // Per-source target counts derived from the seed file. We compare each
  // source's row count in the DB to its seed-derived target individually so
  // that a partially-completed prior run can resume just the under-filled
  // source(s) instead of either re-doing everything or (worse) skipping
  // forever after a 90%-threshold short-circuit.
  const targetBySource = new Map<string, number>();
  for (const r of seed) {
    if (!r.source) continue;
    targetBySource.set(r.source, (targetBySource.get(r.source) ?? 0) + 1);
  }
  const sources = Array.from(targetBySource.keys());

  const sourceList = sql.join(sources.map((s) => sql`${s}`), sql`, `);
  const haveBySourceRes = await db.execute(sql`
    SELECT source, COUNT(*)::int AS n FROM vin_cache
    WHERE source IN (${sourceList})
    GROUP BY source
  `);
  const haveBySource = new Map<string, number>();
  for (const row of (haveBySourceRes.rows ?? []) as Array<{ source: string; n: number }>) {
    haveBySource.set(row.source, Number(row.n) || 0);
  }

  const underFilled = new Set<string>();
  for (const [src, target] of targetBySource.entries()) {
    const have = haveBySource.get(src) ?? 0;
    if (have < target) underFilled.add(src);
  }

  if (underFilled.size === 0) {
    const summary = sources.map((s) => `${s}=${haveBySource.get(s) ?? 0}/${targetBySource.get(s)}`).join(" ");
    console.log(`[vin-cache-bootstrap] all sources complete (${summary}); skipping`);
    return;
  }

  const summary = sources
    .map((s) => `${s}=${haveBySource.get(s) ?? 0}/${targetBySource.get(s)}${underFilled.has(s) ? "*" : ""}`)
    .join(" ");
  console.log(`[vin-cache-bootstrap] under-filled sources: [${Array.from(underFilled).join(",")}] (${summary}); ingesting`);

  // Only stream rows whose source is under-filled — avoids re-attempting
  // already-complete sources (which is harmless via ON CONFLICT but wastes
  // round-trips when the seed grows to hundreds of thousands of rows).
  const toIngest = seed.filter((r) => r.source && underFilled.has(r.source));

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toIngest.length; i += BATCH) {
    const slice = toIngest.slice(i, i + BATCH);
    const values = slice.map((r) => sql`(
      ${r.vin},
      ${r.source},
      ${r.enriched_data ? JSON.stringify(r.enriched_data) : null}::jsonb,
      ${r.catalog_matches ? JSON.stringify(r.catalog_matches) : null}::jsonb,
      ${r.decoded_data ? JSON.stringify(r.decoded_data) : null}::jsonb,
      ${r.enrichment_source ? JSON.stringify(r.enrichment_source) : null}::jsonb,
      NOW(),
      NOW()
    )`);
    const joined = sql.join(values, sql`, `);
    const result = await db.execute(sql`
      WITH ins AS (
        INSERT INTO vin_cache (vin, source, enriched_data, catalog_matches, decoded_data, enrichment_source, created_at, updated_at)
        VALUES ${joined}
        ON CONFLICT (vin) DO NOTHING
        RETURNING vin
      )
      SELECT COUNT(*)::int AS n FROM ins
    `);
    inserted += Number((result.rows?.[0] as any)?.n ?? 0);
    if (i > 0 && i % 5000 === 0) {
      console.log(`[vin-cache-bootstrap] progress: ${i}/${toIngest.length} batches done, inserted=${inserted}`);
    }
  }
  console.log(`[vin-cache-bootstrap] inserted=${inserted} (idempotent; ${toIngest.length} rows considered)`);
}
