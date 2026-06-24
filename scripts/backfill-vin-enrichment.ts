// One-time backfill: enrich every cached VIN through the orchestrator
// so each row gets options/images/manuals (where available) and a
// fully-populated `enrichment_source` column.
//
// Resumable — persists cursor to the `background_jobs` table so a
// Replit restart resumes from exactly where it left off instead of
// restarting from 0. Falls back to the file-based progress as a
// secondary store.
//
// Per-VIN speed is dominated by mdecoder's internal 18-second wait
// when ETK has no factory order data. The default mode (FAST=1)
// disables third-party scrapers so the full corpus (~219k VINs)
// completes in a few hours; this still records etk/configurator/
// bmw_manuals when first-party sources have data and `none` for
// the rest. Set FAST=0 to also try mdecoder/vindecoderz/bimmerwork
// for stragglers (multi-day single-threaded; bump CONCURRENCY).
//
// Run with:  npx tsx scripts/backfill-vin-enrichment.ts
// Env:
//   BMV_BACKFILL_FAST        "1" first-party only, skip third-party (default 1)
//   BMV_BACKFILL_LIMIT       cap on how many VINs to process (default ALL)
//   BMV_BACKFILL_CONCURRENCY parallel workers (default 4 fast, 1 slow)
//   BMV_BACKFILL_THROTTLE    ms between VINs per worker (default 50 fast, 200 slow)
//   BMV_BACKFILL_PROGRESS    progress file (default /tmp/backfill_enrichment.json)
//   BMV_BACKFILL_LOG         log file (default /tmp/backfill_enrichment.log)
//   BMV_BACKFILL_RESET       "1" to ignore previous progress and start over

import fs from "node:fs";
import { Client } from "pg";
import { upsertVinCacheWorker } from "../server/storage";
import { enrichVin } from "../server/vin-enrichment-service";
import { downloadVinImages } from "../server/vin-images";

const PROGRESS_PATH = process.env.BMV_BACKFILL_PROGRESS || "/tmp/backfill_enrichment.json";
const LOG_PATH = process.env.BMV_BACKFILL_LOG || "/tmp/backfill_enrichment.log";
const FAST = process.env.BMV_BACKFILL_FAST !== "0";
const ALLOW_THIRD_PARTY = !FAST;
const THROTTLE_MS = Number(process.env.BMV_BACKFILL_THROTTLE || (FAST ? "50" : "200"));
const CONCURRENCY = Math.max(1, Number(process.env.BMV_BACKFILL_CONCURRENCY || (FAST ? "4" : "1")));
const LIMIT = process.env.BMV_BACKFILL_LIMIT ? Number(process.env.BMV_BACKFILL_LIMIT) : null;
const RESET = process.env.BMV_BACKFILL_RESET === "1";

const DB_JOB_TYPE = "vin_enrichment_backfill";

interface Progress {
  startedAt: string;
  cursor: number;
  processed: number;
  enriched: number;
  skipped: number;
  failed: number;
  bySource: Record<string, number>;
}

// ── File-based progress (secondary / legacy) ──────────────────────────────

function readFileProgress(): Progress | null {
  if (!RESET && fs.existsSync(PROGRESS_PATH)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8")); } catch {}
  }
  return null;
}

function writeFileProgress(p: Progress) {
  try { fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2)); } catch {}
}

// ── DB-based progress (primary) ───────────────────────────────────────────
//
// We keep a single row in background_jobs with jobType='vin_enrichment_backfill'.
// The `progress` JSONB column stores the full Progress object including cursor.
// On restart the script finds this row and picks up from p.cursor.

let dbJobId: number | null = null;

async function loadDbProgress(pg: Client): Promise<Progress | null> {
  if (RESET) return null;
  try {
    const { rows } = await pg.query<{ id: number; progress: Progress }>(
      `SELECT id, progress FROM background_jobs
       WHERE job_type = $1 AND status != 'reset'
       ORDER BY started_at DESC LIMIT 1`,
      [DB_JOB_TYPE],
    );
    if (rows.length && rows[0].progress?.cursor != null) {
      dbJobId = rows[0].id;
      return rows[0].progress as Progress;
    }
  } catch (e: any) {
    log(`[db-cursor] load failed (non-fatal): ${e.message}`);
  }
  return null;
}

async function saveDbProgress(pg: Client, p: Progress, status = "running") {
  try {
    if (dbJobId == null) {
      const { rows } = await pg.query<{ id: number }>(
        `INSERT INTO background_jobs (job_type, status, progress, started_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id`,
        [DB_JOB_TYPE, status, JSON.stringify(p)],
      );
      dbJobId = rows[0].id;
    } else {
      await pg.query(
        `UPDATE background_jobs
         SET progress = $1, status = $2, updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(p), status, dbJobId],
      );
    }
  } catch (e: any) {
    log(`[db-cursor] save failed (non-fatal): ${e.message}`);
  }
}

// ── Logging ───────────────────────────────────────────────────────────────

function log(line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  try { fs.appendFileSync(LOG_PATH, stamped + "\n"); } catch {}
}

// ── Per-VIN processing ────────────────────────────────────────────────────

interface Row {
  vin: string;
  enrichment_source: any;
  catalog_matches: any;
}

async function processOne(row: Row, progress: Progress): Promise<void> {
  const { vin, enrichment_source, catalog_matches } = row;

  const es = enrichment_source as any;
  if (es && (
    (es.options?.source && es.options.source !== "none") ||
    (es.images?.source && es.images.source !== "none") ||
    (es.manuals?.source && es.manuals.source !== "none")
  )) {
    progress.skipped += 1;
    return;
  }

  try {
    const enriched = await enrichVin(vin, { allowThirdParty: ALLOW_THIRD_PARTY });
    if (!enriched) {
      progress.failed += 1;
      return;
    }

    try {
      const { images: dlImages, optionImageMap } = await downloadVinImages(
        vin,
        enriched.data.images,
        enriched.data.options?.map(o => ({ code: o.code, imageUrl: o.imageUrl })),
      );
      if (dlImages) enriched.data.images = dlImages;
      if (enriched.data.options && Object.keys(optionImageMap).length > 0) {
        enriched.data.options = enriched.data.options.map((o: any) => ({
          ...o,
          imageUrl: optionImageMap[o.code] || o.imageUrl,
        }));
      }
    } catch (imgErr: any) {
      log(`  ${vin} image dl warn: ${imgErr.message}`);
    }

    const dominant =
      enriched.enrichmentSource.vehicle?.source ||
      enriched.enrichmentSource.options?.source ||
      "bimmerwork";

    await upsertVinCacheWorker({
      vin,
      source: dominant,
      enrichedData: enriched.data as any,
      catalogMatches: (catalog_matches as any) || [],
      decodedData: null,
      enrichmentSource: enriched.enrichmentSource as any,
    });
    progress.enriched += 1;
    for (const tab of ["vehicle", "options", "images", "manuals"] as const) {
      const s = (enriched.enrichmentSource as any)[tab]?.source || "none";
      const k = `${tab}:${s}`;
      progress.bySource[k] = (progress.bySource[k] || 0) + 1;
    }
  } catch (err: any) {
    progress.failed += 1;
    log(`  ${vin} ERR ${err?.message || err}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  // Load cursor: DB first (survives restarts), file second (legacy), else start fresh.
  const dbProgress = await loadDbProgress(pg);
  const fileProgress = readFileProgress();

  let progress: Progress;
  if (dbProgress && (!fileProgress || dbProgress.cursor >= fileProgress.cursor)) {
    progress = dbProgress;
    log(`backfill resuming from DB cursor=${progress.cursor}`);
  } else if (fileProgress) {
    progress = fileProgress;
    log(`backfill resuming from file cursor=${progress.cursor}`);
  } else {
    progress = {
      startedAt: new Date().toISOString(),
      cursor: 0,
      processed: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      bySource: {},
    };
    log(`backfill starting fresh`);
  }

  log(`backfill start cursor=${progress.cursor} concurrency=${CONCURRENCY} throttle=${THROTTLE_MS}ms`);

  const { rows } = await pg.query<Row>(
    `SELECT vin, enrichment_source, catalog_matches FROM vin_cache ORDER BY vin ASC`,
  );
  log(`pulled ${rows.length} cached VINs`);

  const startIdx = Math.min(progress.cursor, rows.length);
  const target = LIMIT ? Math.min(rows.length, startIdx + LIMIT) : rows.length;
  log(`processing rows[${startIdx}..${target}) of ${rows.length}`);

  // Save initial job row to DB so it exists for status checks.
  await saveDbProgress(pg, progress, "running");

  const t0 = Date.now();
  let lastFlush = Date.now();
  let nextIdx = startIdx;

  // Cursor must reflect a contiguous watermark — only advance to i+1
  // when every index < i is also done. Out-of-order completion is
  // recorded in `done` and drained whenever the watermark catches up.
  let watermark = startIdx;
  const done = new Set<number>();
  function advanceWatermark() {
    while (done.has(watermark)) {
      done.delete(watermark);
      watermark += 1;
    }
    progress.cursor = watermark;
  }

  async function worker(workerId: number) {
    while (true) {
      const i = nextIdx++;
      if (i >= target) break;
      await processOne(rows[i], progress);
      progress.processed += 1;
      done.add(i);
      advanceWatermark();

      if (progress.processed % 25 === 0 || Date.now() - lastFlush > 5000) {
        writeFileProgress(progress);
        // Flush cursor to DB every 500 VINs so restarts lose at most 500 items.
        if (progress.processed % 500 === 0 || Date.now() - lastFlush > 30_000) {
          await saveDbProgress(pg, progress, "running");
        }
        lastFlush = Date.now();
        const completed = progress.processed;
        const rate = completed / Math.max(1, (Date.now() - t0) / 1000);
        const remain = target - watermark;
        const eta = remain / Math.max(rate, 0.001);
        log(`  watermark=${watermark}/${target} (${(watermark / target * 100).toFixed(1)}%) processed=${completed} — ${rate.toFixed(2)} VIN/s — ETA ${(eta / 60).toFixed(1)}min — enriched=${progress.enriched} skipped=${progress.skipped} failed=${progress.failed} [w${workerId}]`);
      }

      if (THROTTLE_MS > 0) {
        await new Promise(r => setTimeout(r, THROTTLE_MS));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, w) => worker(w)));
  advanceWatermark();

  writeFileProgress(progress);
  await saveDbProgress(pg, progress, "completed");
  await pg.end();

  log(`backfill done — processed=${progress.processed} enriched=${progress.enriched} skipped=${progress.skipped} failed=${progress.failed}`);
  log(`bySource=${JSON.stringify(progress.bySource)}`);
  process.exit(0);
}

main().catch(err => {
  log(`FATAL ${err?.message || err}`);
  process.exit(1);
});
