#!/usr/bin/env tsx
// Seed `vin_cache` with real BMW VINs harvested from the engineroom feeds
// (partsonline + salvage, excluding IAAI which currently emits broken VINs).
// Each VIN is decoded with the existing `decodeVin()` pipeline and upserted
// in the shape that `projectVinCacheRow` (server/seo/vin-landing.ts) expects,
// so the per-VIN landing pages SSR with full markup and `sitemap-vins-N.xml`
// emits them.
//
// Never touches `user_cars`. Idempotent: VINs already cached are skipped
// unless --force is passed. Safe to run nightly.
//
// Usage:
//   npx tsx scripts/backfill-vin-cache.ts                 # fetch + decode + upsert
//   npx tsx scripts/backfill-vin-cache.ts --limit 50      # cap upserts (smoke test)
//   npx tsx scripts/backfill-vin-cache.ts --dry-run       # decode but don't write
//   npx tsx scripts/backfill-vin-cache.ts --force         # re-decode existing rows
//   npx tsx scripts/backfill-vin-cache.ts --skip-fetch    # reuse /tmp dumps
//
// Required env: DATABASE_URL, SCRAPER_API_KEY (omit when --skip-fetch).

import fs from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { storage } from "../server/storage";
import { decodeVin } from "../server/vin-decoder";
import { isStructurallyValidVin, isBmwWmi } from "../server/seo/vin-landing";
import type { InsertVinCache } from "@shared/schema";

type DecodedDataJson = NonNullable<InsertVinCache["decodedData"]>;

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const PARTSONLINE_DUMP = "/tmp/engineroom_partsonline_vins.jsonl";
const SALVAGE_DUMP = "/tmp/engineroom_salvage_vins.jsonl";
const BACKFILL_SOURCE = "engineroom_backfill";

interface CliOpts {
  limit: number | null;
  dryRun: boolean;
  force: boolean;
  skipFetch: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { limit: null, dryRun: false, force: false, skipFetch: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--skip-fetch") opts.skipFetch = true;
    else if (a === "--limit") {
      const n = parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(n) && n > 0) opts.limit = n;
    }
  }
  return opts;
}

interface FeedRow {
  vin: string;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  sourcePlatform?: string | null;
}

function runFetcher(script: string, outPath: string): void {
  console.log(`[backfill-vin] running ${script} -> ${outPath}`);
  const res = spawnSync(process.execPath, [path.join("scripts", script)], {
    stdio: "inherit",
    env: { ...process.env, OUT: outPath },
  });
  if (res.status !== 0) {
    throw new Error(`${script} exited with status ${res.status}`);
  }
}

function readJsonl(filePath: string): FeedRow[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];
  const out: FeedRow[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

function gatherCandidateVins(): Map<string, FeedRow> {
  const merged = new Map<string, FeedRow>();
  const partsonline = readJsonl(PARTSONLINE_DUMP);
  console.log(`[backfill-vin] partsonline rows: ${partsonline.length}`);
  for (const r of partsonline) {
    if (!r.vin) continue;
    const vin = r.vin.toUpperCase();
    if (!isStructurallyValidVin(vin) || !isBmwWmi(vin)) continue;
    if (!merged.has(vin)) merged.set(vin, { ...r, vin, sourcePlatform: "partsonline" });
  }

  const salvage = readJsonl(SALVAGE_DUMP);
  console.log(`[backfill-vin] salvage rows: ${salvage.length}`);
  let droppedIaai = 0;
  for (const r of salvage) {
    if (!r.vin) continue;
    // IAAI VINs from the engineroom salvage feed are unreliable (often
    // truncated / OCR'd from auction photos) — skip them entirely.
    if ((r.sourcePlatform ?? "").toLowerCase() === "iaai") {
      droppedIaai++;
      continue;
    }
    const vin = r.vin.toUpperCase();
    if (!isStructurallyValidVin(vin) || !isBmwWmi(vin)) continue;
    if (!merged.has(vin)) merged.set(vin, { ...r, vin });
  }
  console.log(`[backfill-vin] dropped ${droppedIaai} IAAI rows`);
  return merged;
}

interface DecodedRow {
  chassis: string | null;
  series: string | null;
  modelYear: number | null;
  modelName: string | null;
  engine: string | null;
  isBmw: boolean;
  plant: { city: string | null; country: string | null } | null;
  source: typeof BACKFILL_SOURCE;
  feedYear: number | null;
  feedModel: string | null;
  feedSourcePlatform: string | null;
  decodedAt: string;
  typeCode: string | null;
  typeCodeSource: string | null;
  [key: string]: unknown;
}

function buildDecodedData(
  decoded: Awaited<ReturnType<typeof decodeVin>>,
  feed: FeedRow,
): DecodedRow {
  return {
    chassis: decoded.chassis ?? null,
    series: decoded.series ?? null,
    modelYear: decoded.modelYear ?? null,
    modelName: decoded.modelName ?? null,
    engine: decoded.engine ?? null,
    isBmw: decoded.isBmw === true,
    plant: decoded.plant
      ? { city: decoded.plant.city ?? null, country: decoded.plant.country ?? null }
      : null,
    source: BACKFILL_SOURCE,
    feedYear: feed.year != null ? Number(feed.year) || null : null,
    feedModel: feed.model ?? null,
    feedSourcePlatform: feed.sourcePlatform ?? null,
    decodedAt: new Date().toISOString(),
    typeCode: decoded.typeCode ?? null,
    typeCodeSource: decoded.typeCodeSource ?? null,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`[backfill-vin] opts=${JSON.stringify(opts)}`);

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(2);
  }

  if (!opts.skipFetch) {
    if (!process.env.SCRAPER_API_KEY) {
      console.error("SCRAPER_API_KEY missing (use --skip-fetch to reuse /tmp dumps)");
      process.exit(2);
    }
    runFetcher("fetch-engineroom-vins.mjs", PARTSONLINE_DUMP);
    runFetcher("fetch-engineroom-salvage-vins.mjs", SALVAGE_DUMP);
  } else {
    console.log("[backfill-vin] --skip-fetch: reusing existing dumps");
  }

  const candidates = gatherCandidateVins();
  console.log(`[backfill-vin] unique candidate BMW VINs: ${candidates.size}`);

  const stats = {
    skipped_existing: 0,
    decoded_ok: 0,
    decoded_no_chassis: 0,
    decoded_not_bmw: 0,
    decode_failed: 0,
    upserted: 0,
  };
  const failures: { vin: string; reason: string }[] = [];

  // Worker pool — most VINs need a slow NHTSA fetch so concurrency cuts
  // a 25-minute serial run down to ~3-4 minutes.
  const CONCURRENCY = 8;
  const queue = Array.from(candidates.entries());
  let qIdx = 0;
  let stopped = false;

  async function worker(workerId: number) {
    while (!stopped) {
      const limitCounter = opts.dryRun ? stats.decoded_ok : stats.upserted;
      if (opts.limit != null && limitCounter >= opts.limit) {
        stopped = true;
        return;
      }
      const idx = qIdx++;
      if (idx >= queue.length) return;
      const [vin, feed] = queue[idx];

      if (!opts.force) {
        const existing = await storage.getVinCache(vin);
        if (existing) {
          stats.skipped_existing++;
          continue;
        }
      }

      let decoded: Awaited<ReturnType<typeof decodeVin>>;
      try {
        decoded = await decodeVin(vin);
      } catch (err: unknown) {
        stats.decode_failed++;
        failures.push({ vin, reason: describeError(err) });
        continue;
      }

      if (!decoded.isBmw) {
        stats.decoded_not_bmw++;
        continue;
      }
      if (!decoded.chassis) {
        // No chassis means projectVinCacheRow returns a near-empty page that
        // SSRs with "BMW Vehicle" placeholder. Skip — not worth indexing.
        stats.decoded_no_chassis++;
        continue;
      }
      stats.decoded_ok++;

      const decodedData = buildDecodedData(decoded, feed);

      if (opts.dryRun) {
        if (stats.decoded_ok <= 5) {
          console.log(
            `[dry-run] ${vin} -> ${decodedData.modelYear ?? "?"} ${decodedData.modelName ?? decodedData.chassis}`,
          );
        }
        continue;
      }

      try {
        await storage.upsertVinCache({
          vin,
          source: BACKFILL_SOURCE,
          // Leave enrichedData null — a real ETK / configurator enrichment
          // run can fill it in later. The landing page still renders a
          // useful SSR card from decodedData alone.
          enrichedData: null,
          catalogMatches: null,
          decodedData: decodedData satisfies DecodedDataJson,
          enrichmentSource: null,
        });
        stats.upserted++;
        if (stats.upserted % 50 === 0) {
          const seen = stats.upserted + stats.skipped_existing + stats.decoded_not_bmw + stats.decoded_no_chassis + stats.decode_failed;
          console.log(`[backfill-vin] upserted=${stats.upserted} processed=${seen}/${queue.length} (worker ${workerId})`);
        }
      } catch (err: unknown) {
        stats.decode_failed++;
        failures.push({ vin, reason: `upsert: ${describeError(err)}` });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  const cacheTotal = await storage.countVinCache();
  console.log(`[backfill-vin] DONE. stats=${JSON.stringify(stats)} vin_cache_total=${cacheTotal}`);
  if (failures.length > 0) {
    console.log(`[backfill-vin] first failures:`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f.vin}  ${f.reason}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-vin] fatal:", err);
    process.exit(1);
  });
