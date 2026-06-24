// Task #105 — Harvest the per-part-page chassis cross-reference block
// for every part we already know about, and persist it to
// `part_chassis_appearances`.
//
// Why this exists:
//   The existing `realoem-crossref.ts` queries `/bmw/enUS/partxref?q=…`
//   which returns series-only data (E90, F30 — no LCI distinction, no
//   production dates, no source car id). The per-part page
//   `/bmw/enUS/part?id=…&q=…` renders the richer
//   "Part X was found on the following vehicles:" block with
//   facelift-level chassis granularity ("E90" vs "E90 LCI") and
//   "MM/YYYY — MM/YYYY" production dates. That richer index is what
//   powers Task #105's chassis-coverage / gap-fill workflow.
//
// Architecture mirrors `realoem-crossref.ts`:
//   - throttled fetch loop (CONCURRENCY=5, DELAY_MS=250, BATCH_SIZE=100)
//   - resumable via `realoem_checked_parts`-style freshness window
//   - own job-manager record so the admin status endpoint can poll
//
// Important non-goals for this module:
//   - We do NOT chase supersession lineage here (that lives in
//     `partCrossReferences` already, populated by `realoem-crossref.ts`).
//     We DO record any supersession candidates we observe as warnings
//     in the job log so an operator can decide.
//   - We do NOT auto-trigger from the diagram backfill. That's deferred
//     to a follow-up task once we see how dense the index gets.

import { db } from "./storage";
import { sql } from "drizzle-orm";
import { extractPartPageAppearances, PartPageDriftError, type PartPageExtraction } from "./realoem-part-page-parser";
import { createJob, completeJob, failJob, startPeriodicCheckpoint, stopPeriodicCheckpoint, getActiveJob, cancelJobByType } from "./job-manager";
import { proxyFetch } from "./proxy-router";

const REALOEM_BASE = "https://www.realoem.com";
const CONCURRENCY = 5;
const DELAY_MS = 250;
const BATCH_SIZE = 100;
// Default freshness window: re-harvest a part page after 60 days. The
// cross-ref block changes when BMW supersedes a part, so a refresh is
// useful but not urgent.
const DEFAULT_FRESH_HOURS = 60 * 24;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildPartPageUrl(carId: string, partNumberClean: string): string {
  return `${REALOEM_BASE}/bmw/enUS/part?id=${encodeURIComponent(carId)}&q=${encodeURIComponent(partNumberClean)}`;
}

export interface HarvestState {
  running: boolean;
  totalParts: number;
  fetchedCount: number;
  appearancesUpserted: number;
  driftCount: number;
  errorCount: number;
  startedAt: Date | null;
  estimatedEndAt: Date | null;
  cancelled: boolean;
  currentPart: string;
  partsPerSecond: number;
  freshHours: number;
}

const state: HarvestState = {
  running: false,
  totalParts: 0,
  fetchedCount: 0,
  appearancesUpserted: 0,
  driftCount: 0,
  errorCount: 0,
  startedAt: null,
  estimatedEndAt: null,
  cancelled: false,
  currentPart: "",
  partsPerSecond: 0,
  freshHours: DEFAULT_FRESH_HOURS,
};

let harvestJobId: number | null = null;

export function getHarvestStatus(): HarvestState {
  return { ...state };
}

export function cancelHarvest(): void {
  state.cancelled = true;
  if (harvestJobId) {
    cancelJobByType("part-appearance-harvest").catch(() => {});
  }
}

interface CandidateRow {
  partNumberClean: string;
  sourceCarId: string;
}

// Pick one (part_number_clean, source car_id) pair per unharvested part.
// We pick ANY car the part appears on — RealOEM doesn't care which
// variant context renders the cross-ref block, the block is per-part.
async function loadCandidateBatch(freshHours: number, limit: number): Promise<CandidateRow[]> {
  const result = await db.execute(sql`
    SELECT
      p.part_number_clean AS part_number_clean,
      c.realoem_partgrp_id AS source_car_id
    FROM (
      SELECT DISTINCT ON (part_number_clean)
        part_number_clean,
        car_id
      FROM parts
      WHERE part_number_clean IS NOT NULL
        AND part_number_clean <> ''
      ORDER BY part_number_clean, id
    ) p
    JOIN cars c ON c.id = p.car_id
    LEFT JOIN (
      SELECT part_number_clean, MAX(harvested_at) AS last_harvested
      FROM part_chassis_appearances
      GROUP BY part_number_clean
    ) h ON h.part_number_clean = p.part_number_clean
    WHERE c.realoem_partgrp_id IS NOT NULL
      AND (
        h.last_harvested IS NULL
        OR h.last_harvested < NOW() - (${freshHours}::int || ' hours')::interval
      )
    ORDER BY p.part_number_clean
    LIMIT ${limit}
  `);

  return ((result as unknown as { rows: Array<{ part_number_clean: string; source_car_id: string }> }).rows).map(
    (r) => ({ partNumberClean: r.part_number_clean, sourceCarId: r.source_car_id }),
  );
}

async function loadTotalUnharvested(freshHours: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM (
      SELECT DISTINCT p.part_number_clean
      FROM parts p
      JOIN cars c ON c.id = p.car_id
      LEFT JOIN (
        SELECT part_number_clean, MAX(harvested_at) AS last_harvested
        FROM part_chassis_appearances
        GROUP BY part_number_clean
      ) h ON h.part_number_clean = p.part_number_clean
      WHERE p.part_number_clean IS NOT NULL
        AND p.part_number_clean <> ''
        AND c.realoem_partgrp_id IS NOT NULL
        AND (
          h.last_harvested IS NULL
          OR h.last_harvested < NOW() - (${freshHours}::int || ' hours')::interval
        )
    ) unharvested
  `);
  return Number((result as unknown as { rows: Array<{ cnt: string }> }).rows[0].cnt);
}

async function upsertExtraction(
  candidate: CandidateRow,
  url: string,
  extraction: PartPageExtraction,
): Promise<number> {
  let upserted = 0;
  for (const ap of extraction.appearances) {
    try {
      await db.execute(sql`
        INSERT INTO part_chassis_appearances (
          part_number_clean, chassis, chassis_label_raw,
          production_from, production_to,
          source_car_id, source_part_url
        ) VALUES (
          ${candidate.partNumberClean},
          ${ap.chassis},
          ${ap.chassisLabelRaw},
          ${ap.productionFrom},
          ${ap.productionTo},
          ${candidate.sourceCarId},
          ${url}
        )
        ON CONFLICT (part_number_clean, chassis) DO UPDATE SET
          chassis_label_raw = EXCLUDED.chassis_label_raw,
          production_from = EXCLUDED.production_from,
          production_to = EXCLUDED.production_to,
          source_car_id = EXCLUDED.source_car_id,
          source_part_url = EXCLUDED.source_part_url,
          harvested_at = NOW()
      `);
      upserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[part-appearance] upsert failed for ${candidate.partNumberClean}/${ap.chassis}: ${msg}`);
    }
  }
  return upserted;
}

async function processBatch(batch: CandidateRow[]): Promise<void> {
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    if (state.cancelled) return;
    const chunk = batch.slice(i, i + CONCURRENCY);

    await Promise.all(
      chunk.map(async (candidate) => {
        if (state.cancelled) return;
        const url = buildPartPageUrl(candidate.sourceCarId, candidate.partNumberClean);
        try {
          const html = await proxyFetch("realoem", url, { render: true });
          state.currentPart = candidate.partNumberClean;
          const extraction = extractPartPageAppearances(html, {
            sourceUrl: url,
            partNumberHint: candidate.partNumberClean,
          });
          const upserted = await upsertExtraction(candidate, url, extraction);
          state.appearancesUpserted += upserted;
          state.fetchedCount++;
        } catch (err) {
          if (err instanceof PartPageDriftError) {
            state.driftCount++;
            console.warn(`[part-appearance] DRIFT (${err.kind}) ${candidate.partNumberClean}: ${err.message}`);
          } else {
            state.errorCount++;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[part-appearance] error ${candidate.partNumberClean}: ${msg}`);
          }
          state.fetchedCount++;
        }
        await sleep(DELAY_MS);
      }),
    );

    if (state.fetchedCount > 0 && state.startedAt) {
      const elapsed = (Date.now() - state.startedAt.getTime()) / 1000;
      state.partsPerSecond = state.fetchedCount / elapsed;
      const remaining = Math.max(0, state.totalParts - state.fetchedCount);
      const etaSeconds = remaining / (state.partsPerSecond || 1);
      state.estimatedEndAt = new Date(Date.now() + etaSeconds * 1000);
    }
  }
}

export async function startPartAppearanceHarvest(opts: { freshHours?: number; isResume?: boolean } = {}): Promise<void> {
  if (state.running) throw new Error("Part appearance harvest already running");

  state.running = true;
  state.cancelled = false;
  state.fetchedCount = 0;
  state.appearancesUpserted = 0;
  state.driftCount = 0;
  state.errorCount = 0;
  state.startedAt = new Date();
  state.estimatedEndAt = null;
  state.currentPart = "";
  state.partsPerSecond = 0;
  state.freshHours = opts.freshHours ?? DEFAULT_FRESH_HOURS;

  if (!opts.isResume) {
    const job = await createJob("part-appearance-harvest", { status: "starting", freshHours: state.freshHours });
    harvestJobId = job.id;
  } else {
    const active = await getActiveJob("part-appearance-harvest");
    harvestJobId = active?.id ?? null;
  }

  if (harvestJobId) {
    startPeriodicCheckpoint(harvestJobId, () => ({ ...state }));
  }

  try {
    state.totalParts = await loadTotalUnharvested(state.freshHours);
    console.log(`[part-appearance] starting harvest: ${state.totalParts} unharvested parts (freshHours=${state.freshHours})`);

    if (state.totalParts === 0) {
      console.log(`[part-appearance] nothing to do`);
      if (harvestJobId) {
        await completeJob(harvestJobId, { ...state });
        harvestJobId = null;
      }
      state.running = false;
      return;
    }

    while (!state.cancelled) {
      const batch = await loadCandidateBatch(state.freshHours, BATCH_SIZE);
      if (batch.length === 0) break;
      await processBatch(batch);
    }

    const wasCancelled = state.cancelled;
    console.log(`[part-appearance] harvest ${wasCancelled ? "cancelled" : "complete"}: fetched=${state.fetchedCount}, appearances=${state.appearancesUpserted}, drift=${state.driftCount}, errors=${state.errorCount}`);

    if (harvestJobId) {
      if (wasCancelled) {
        await cancelJobByType("part-appearance-harvest");
      } else {
        await completeJob(harvestJobId, { ...state });
      }
      harvestJobId = null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[part-appearance] harvest error: ${msg}`);
    if (harvestJobId) {
      await failJob(harvestJobId, msg, { ...state }).catch(() => {});
      harvestJobId = null;
    }
  } finally {
    state.running = false;
    if (harvestJobId) {
      stopPeriodicCheckpoint(harvestJobId);
    }
  }
}

// Coverage analysis for a chassis: how many parts does the appearance
// index *predict* should exist on this chassis (from cross-refs we've
// harvested off OTHER chassis), and how many do we actually have
// materialized in our parts table for cars whose chassis matches?
export interface ChassisCoverage {
  chassis: string;
  predictedPartCount: number;       // distinct parts the appearance index says belong on this chassis
  materializedPartCount: number;    // distinct parts actually in `parts` for cars on this chassis
  intersectionCount: number;        // predicted ∩ materialized (already covered)
  gapCount: number;                 // predicted - materialized (work remaining)
  gapSamplePartNumbers: string[];   // up to 25 of the gap parts, useful for spot-check
}

export async function getChassisCoverage(chassis: string): Promise<ChassisCoverage> {
  const norm = chassis.trim().toUpperCase();

  const predictedRow = (await db.execute(sql`
    SELECT COUNT(DISTINCT part_number_clean) AS cnt
    FROM part_chassis_appearances
    WHERE chassis = ${norm}
  `)) as unknown as { rows: Array<{ cnt: string }> };
  const predictedPartCount = Number(predictedRow.rows[0].cnt);

  const materializedRow = (await db.execute(sql`
    SELECT COUNT(DISTINCT p.part_number_clean) AS cnt
    FROM parts p
    JOIN cars c ON c.id = p.car_id
    WHERE c.chassis = ${norm}
      AND p.part_number_clean IS NOT NULL
      AND p.part_number_clean <> ''
  `)) as unknown as { rows: Array<{ cnt: string }> };
  const materializedPartCount = Number(materializedRow.rows[0].cnt);

  const intersectionRow = (await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM (
      SELECT DISTINCT a.part_number_clean
      FROM part_chassis_appearances a
      JOIN parts p ON p.part_number_clean = a.part_number_clean
      JOIN cars c ON c.id = p.car_id
      WHERE a.chassis = ${norm}
        AND c.chassis = ${norm}
    ) i
  `)) as unknown as { rows: Array<{ cnt: string }> };
  const intersectionCount = Number(intersectionRow.rows[0].cnt);

  const gapCount = Math.max(0, predictedPartCount - intersectionCount);

  const gapSampleRow = (await db.execute(sql`
    SELECT a.part_number_clean
    FROM part_chassis_appearances a
    WHERE a.chassis = ${norm}
      AND NOT EXISTS (
        SELECT 1 FROM parts p
        JOIN cars c ON c.id = p.car_id
        WHERE p.part_number_clean = a.part_number_clean
          AND c.chassis = ${norm}
      )
    GROUP BY a.part_number_clean
    ORDER BY a.part_number_clean
    LIMIT 25
  `)) as unknown as { rows: Array<{ part_number_clean: string }> };

  return {
    chassis: norm,
    predictedPartCount,
    materializedPartCount,
    intersectionCount,
    gapCount,
    gapSamplePartNumbers: gapSampleRow.rows.map((r) => r.part_number_clean),
  };
}

export interface AppearanceStats {
  totalRows: number;
  distinctParts: number;
  distinctChassis: number;
  topChassis: { chassis: string; partCount: number }[];
  topParts: { partNumberClean: string; chassisCount: number }[];
}

export async function getAppearanceStats(): Promise<AppearanceStats> {
  const totalRow = (await db.execute(sql`SELECT COUNT(*) AS cnt FROM part_chassis_appearances`)) as unknown as { rows: Array<{ cnt: string }> };
  const distinctPartsRow = (await db.execute(sql`SELECT COUNT(DISTINCT part_number_clean) AS cnt FROM part_chassis_appearances`)) as unknown as { rows: Array<{ cnt: string }> };
  const distinctChassisRow = (await db.execute(sql`SELECT COUNT(DISTINCT chassis) AS cnt FROM part_chassis_appearances`)) as unknown as { rows: Array<{ cnt: string }> };
  const topChassisRow = (await db.execute(sql`
    SELECT chassis, COUNT(DISTINCT part_number_clean) AS cnt
    FROM part_chassis_appearances
    GROUP BY chassis
    ORDER BY cnt DESC
    LIMIT 20
  `)) as unknown as { rows: Array<{ chassis: string; cnt: string }> };
  const topPartsRow = (await db.execute(sql`
    SELECT part_number_clean, COUNT(DISTINCT chassis) AS cnt
    FROM part_chassis_appearances
    GROUP BY part_number_clean
    ORDER BY cnt DESC
    LIMIT 20
  `)) as unknown as { rows: Array<{ part_number_clean: string; cnt: string }> };

  return {
    totalRows: Number(totalRow.rows[0].cnt),
    distinctParts: Number(distinctPartsRow.rows[0].cnt),
    distinctChassis: Number(distinctChassisRow.rows[0].cnt),
    topChassis: topChassisRow.rows.map((r) => ({ chassis: r.chassis, partCount: Number(r.cnt) })),
    topParts: topPartsRow.rows.map((r) => ({ partNumberClean: r.part_number_clean, chassisCount: Number(r.cnt) })),
  };
}
