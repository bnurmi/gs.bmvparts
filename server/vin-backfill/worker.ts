/**
 * Bulk VIN Enrichment Worker (Task #289)
 *
 * Slow-burn background worker that processes VINs from vin_enrichment_queue
 * through the bimmer.work scraper pipeline at a capped rate of ~1,000/day.
 * One VIN every 90 seconds, pausing once the daily cap is reached.
 *
 * Disabled via BMV_DISABLE_VIN_BACKFILL=true.
 * Daily cap configurable via VIN_BACKFILL_DAILY_LIMIT (default 1000).
 *
 * Retry backoff schedule (applied at dequeue time):
 *   attempt 1 → eligible immediately
 *   attempt 2 → eligible after 5 min from last_attempted_at
 *   attempt 3 → eligible after 15 min from last_attempted_at
 */

import { db } from "../storage";
import { sql } from "drizzle-orm";
import { canProcessMore, recordProcessed, ensureRateLimitTables, getDailyLimit, getTodayCount } from "./rate-limiter";
import { createJob, updateJobProgress, getActiveJob } from "../job-manager";

const TICK_INTERVAL_MS = 90_000;
const MAX_ATTEMPTS = 3;

// Backoff delays per attempt number (attempt is 1-indexed at dequeue time)
// attempt=1 → retry immediately; attempt=2 → 5 min; attempt=3 → 15 min
const BACKOFF_MINUTES: Record<number, number> = { 1: 0, 2: 5, 3: 15 };

let workerTimer: ReturnType<typeof setInterval> | null = null;
let currentJobId: number | null = null;
let isRunning = false;

function isDisabled(): boolean {
  return process.env.BMV_DISABLE_VIN_BACKFILL === "true";
}

async function ensureQueueTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vin_enrichment_queue (
        vin VARCHAR(17) PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempted_at TIMESTAMP,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vin_enrichment_queue_status_idx ON vin_enrichment_queue(status)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vin_enrichment_queue_status_created_idx ON vin_enrichment_queue(status, created_at)
    `);
  } catch (err: any) {
    console.error("[VinBackfill] Failed to ensure queue table:", err.message);
  }
}

/**
 * Dequeues the next eligible VIN respecting exponential backoff.
 *
 * Backoff is enforced inside the SQL WHERE clause so we never grab a row that
 * isn't ready to be retried yet.  The CASE expression maps each attempt count
 * to its required cooling period:
 *   attempts=0 (never tried) → eligible immediately
 *   attempts=1               → eligible after 5 min
 *   attempts=2               → eligible after 15 min
 */
async function dequeueNextVin(): Promise<string | null> {
  try {
    const result = await db.execute(sql`
      UPDATE vin_enrichment_queue
      SET status = 'in_progress', last_attempted_at = NOW(), attempts = attempts + 1
      WHERE vin = (
        SELECT vin FROM vin_enrichment_queue
        WHERE status = 'pending'
          AND attempts < ${MAX_ATTEMPTS}
          AND (
            last_attempted_at IS NULL
            OR (
              attempts = 0
            )
            OR (
              attempts = 1
              AND last_attempted_at < NOW() - INTERVAL '5 minutes'
            )
            OR (
              attempts = 2
              AND last_attempted_at < NOW() - INTERVAL '15 minutes'
            )
          )
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING vin
    `);
    const rows = (result as any).rows || result;
    return rows?.[0]?.vin ?? null;
  } catch (err: any) {
    console.error("[VinBackfill] Dequeue error:", err.message);
    return null;
  }
}

async function markVinDone(vin: string, note?: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE vin_enrichment_queue
      SET status = 'done', error = ${note ?? null}
      WHERE vin = ${vin}
    `);
  } catch (err: any) {
    console.error(`[VinBackfill] markVinDone error for ${vin}:`, err.message);
  }
}

async function markVinFailed(vin: string, error: string): Promise<void> {
  try {
    // Re-read current attempts count to decide permanent vs retriable
    const result = await db.execute(sql`
      SELECT attempts FROM vin_enrichment_queue WHERE vin = ${vin}
    `);
    const rows = (result as any).rows || result;
    const attempts = rows?.[0]?.attempts ?? MAX_ATTEMPTS;

    if (attempts >= MAX_ATTEMPTS) {
      // Max retries exhausted — mark permanently failed
      await db.execute(sql`
        UPDATE vin_enrichment_queue
        SET status = 'failed', error = ${error.slice(0, 500)}, last_attempted_at = NOW()
        WHERE vin = ${vin}
      `);
    } else {
      // Return to pending; dequeue backoff gate will enforce the cooling period
      await db.execute(sql`
        UPDATE vin_enrichment_queue
        SET status = 'pending', error = ${error.slice(0, 500)}, last_attempted_at = NOW()
        WHERE vin = ${vin}
      `);
    }
  } catch (err: any) {
    console.error(`[VinBackfill] markVinFailed error for ${vin}:`, err.message);
  }
}

/**
 * Check vin_cache to see if this VIN already has bimmer.work enrichment.
 * Returns { alreadyEnriched: true, chassis, saCount } if it does.
 */
async function checkAlreadyEnriched(vin: string): Promise<{
  alreadyEnriched: boolean;
  chassis: string | null;
  saCount: number;
}> {
  try {
    const result = await db.execute(sql`
      SELECT enrichment_source, enriched_data
      FROM vin_cache
      WHERE vin = ${vin}
      LIMIT 1
    `);
    const rows = (result as any).rows || result;
    if (!rows?.[0]) return { alreadyEnriched: false, chassis: null, saCount: 0 };

    const row = rows[0];
    let source: any = row.enrichment_source;
    if (typeof source === "string") {
      try { source = JSON.parse(source); } catch { source = {}; }
    }

    // VIN is already bimmer.work-enriched if any tab has source === 'bimmerwork'
    const hasBimmerwork = source && typeof source === "object" &&
      Object.values(source).some((tab: any) => tab?.source === "bimmerwork");

    if (!hasBimmerwork) return { alreadyEnriched: false, chassis: null, saCount: 0 };

    let enrichedData: any = row.enriched_data;
    if (typeof enrichedData === "string") {
      try { enrichedData = JSON.parse(enrichedData); } catch { enrichedData = {}; }
    }
    const chassis = enrichedData?.vehicle?.chassis ?? null;
    const saCount = Array.isArray(enrichedData?.options) ? enrichedData.options.length : 0;

    return { alreadyEnriched: true, chassis, saCount };
  } catch {
    return { alreadyEnriched: false, chassis: null, saCount: 0 };
  }
}

async function processVin(vin: string): Promise<{
  success: boolean;
  saCodes: number;
  chassis: string | null;
  error?: string;
  skipped?: boolean;
}> {
  try {
    // Dequeue-time guard: skip VINs already enriched via bimmer.work
    const check = await checkAlreadyEnriched(vin);
    if (check.alreadyEnriched) {
      return { success: true, saCodes: check.saCount, chassis: check.chassis, skipped: true };
    }

    const { enrichVin } = await import("../vin-enrichment-service");

    const result = await enrichVin(vin, {
      allowThirdParty: true,
      _forceBypassEtkGate: true,
    });

    if (!result?.data) {
      return { success: false, saCodes: 0, chassis: null, error: "No data returned from enrichVin" };
    }

    const { data, enrichmentSource } = result;

    const enrichedData = {
      vehicle: data.vehicle,
      options: data.options,
      images: data.images,
      manuals: data.manuals,
      fetchedAt: data.fetchedAt,
    };

    const bimmerworkHash = data.hash !== "etk" ? data.hash : null;

    await db.execute(sql`
      INSERT INTO vin_cache (vin, enriched_data, bimmerwork_hash, enrichment_source, updated_at)
      VALUES (${vin}, ${JSON.stringify(enrichedData)}::jsonb, ${bimmerworkHash}, ${JSON.stringify(enrichmentSource)}::jsonb, NOW())
      ON CONFLICT (vin) DO UPDATE
      SET enriched_data = EXCLUDED.enriched_data,
          bimmerwork_hash = COALESCE(EXCLUDED.bimmerwork_hash, vin_cache.bimmerwork_hash),
          enrichment_source = EXCLUDED.enrichment_source,
          updated_at = NOW()
    `);

    const sas = (data.options || []).map((o: any) => o.code).filter(Boolean);
    const chassis = data.vehicle?.chassis ?? null;

    return { success: true, saCodes: sas.length, chassis };
  } catch (err: any) {
    return { success: false, saCodes: 0, chassis: null, error: err.message };
  }
}

async function getQueueCounts(): Promise<{
  total: number;
  pending: number;
  done: number;
  failed: number;
  inProgress: number;
}> {
  try {
    const result = await db.execute(sql`
      SELECT status, COUNT(*) as cnt FROM vin_enrichment_queue GROUP BY status
    `);
    const rows = (result as any).rows || result;
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = Number(row.cnt);
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return {
      total,
      pending: byStatus.pending ?? 0,
      done: byStatus.done ?? 0,
      failed: byStatus.failed ?? 0,
      inProgress: byStatus.in_progress ?? 0,
    };
  } catch {
    return { total: 0, pending: 0, done: 0, failed: 0, inProgress: 0 };
  }
}

async function tick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const ok = await canProcessMore();
    if (!ok) {
      const todayCount = await getTodayCount();
      const cap = getDailyLimit();
      console.log(`[VinBackfill] Daily cap reached (${todayCount}/${cap}). Pausing until midnight UTC.`);
      return;
    }

    const vin = await dequeueNextVin();
    if (!vin) {
      return;
    }

    console.log(`[VinBackfill] Processing ${vin}...`);
    const startedAt = Date.now();
    const result = await processVin(vin);
    const elapsed = Date.now() - startedAt;

    if (result.success) {
      await markVinDone(vin, result.skipped ? "already-enriched" : undefined);
      if (!result.skipped) {
        // Only count against the daily cap for actual scrape calls
        await recordProcessed();
      }
      const tag = result.skipped ? "skipped (already enriched)" : `${result.saCodes} SA codes`;
      console.log(`[VinBackfill] ✓ ${vin} — ${tag}, chassis: ${result.chassis ?? "unknown"} (${elapsed}ms)`);
    } else {
      await markVinFailed(vin, result.error ?? "unknown error");
      console.log(`[VinBackfill] ✗ ${vin} — ${result.error} (${elapsed}ms)`);
    }

    if (currentJobId) {
      const counts = await getQueueCounts();
      const todayCount = await getTodayCount();
      await updateJobProgress(currentJobId, {
        ...counts,
        today_count: todayCount,
        daily_cap: getDailyLimit(),
        last_vin: vin,
        last_vin_status: result.success ? "done" : "failed",
        last_vin_chassis: result.chassis,
        last_vin_sa_count: result.saCodes,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    console.error("[VinBackfill] tick error:", err.message);
  } finally {
    isRunning = false;
  }
}

export async function startVinBackfillWorker(): Promise<void> {
  if (isDisabled()) {
    console.log("[VinBackfill] Disabled via BMV_DISABLE_VIN_BACKFILL=true");
    return;
  }

  await ensureQueueTable();
  await ensureRateLimitTables();

  const counts = await getQueueCounts();
  if (counts.pending === 0 && counts.total === 0) {
    console.log("[VinBackfill] Queue empty — worker is idle. Seed VINs via scripts/seed-vin-enrichment-queue.ts");
  } else {
    console.log(`[VinBackfill] Queue: ${counts.pending} pending, ${counts.done} done, ${counts.failed} failed (total: ${counts.total})`);
  }

  const existing = await getActiveJob("vin_enrichment_backfill");
  if (existing) {
    currentJobId = existing.id;
    console.log(`[VinBackfill] Resuming job #${currentJobId}`);
  } else if (counts.pending > 0 || counts.inProgress > 0) {
    const job = await createJob("vin_enrichment_backfill", {
      pending: counts.pending,
      done: counts.done,
      failed: counts.failed,
      today_count: 0,
      daily_cap: getDailyLimit(),
    });
    currentJobId = job.id;
    console.log(`[VinBackfill] Created job #${currentJobId}`);
  }

  if (workerTimer) clearInterval(workerTimer);
  workerTimer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  console.log(`[VinBackfill] Worker started — tick every ${TICK_INTERVAL_MS / 1000}s, cap: ${getDailyLimit()}/day`);

  void tick();
}

export function stopVinBackfillWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  console.log("[VinBackfill] Worker stopped");
}

export async function getVinBackfillStatus(): Promise<{
  total: number;
  pending: number;
  done: number;
  failed: number;
  inProgress: number;
  todayCount: number;
  dailyCap: number;
  etaDays: number | null;
  jobId: number | null;
}> {
  const counts = await getQueueCounts();
  const todayCount = await getTodayCount();
  const dailyCap = getDailyLimit();
  const etaDays = counts.pending > 0 ? Math.ceil(counts.pending / dailyCap) : null;
  return { ...counts, todayCount, dailyCap, etaDays, jobId: currentJobId };
}
