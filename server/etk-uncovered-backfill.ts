import { db, storage } from "./storage";
import { sql } from "drizzle-orm";
import {
  createJob,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,
} from "./job-manager";
import type { JobType } from "./job-manager";
import { scrapeCarDirect } from "./scraper";

const JOB_TYPE: JobType = "etk_uncovered_backfill";

// Chassis prefixes that belong to BMW Motorrad, MINI, or Rolls-Royce.
// ETK for these brands is a separate system — exclude them from the BMW car backfill.
const EXCLUDED_PREFIXES = ["K", "R1", "R2", "R5", "R6", "RR"];

function isExcludedChassis(chassis: string): boolean {
  const upper = (chassis || "").toUpperCase();
  return EXCLUDED_PREFIXES.some((p) => upper.startsWith(p));
}

export interface UncoveredCar {
  id: number;
  chassis: string;
  displayName: string;
  catalogUrl: string;
  series: string;
}

export async function getUncoveredCars(): Promise<UncoveredCar[]> {
  type Row = {
    id: number;
    chassis: string;
    display_name: string;
    catalog_url: string;
    series: string;
  };

  const result = await db.execute(sql`
    SELECT id, chassis, display_name, catalog_url, series
    FROM cars
    WHERE (total_parts IS NULL OR total_parts = 0)
      AND catalog_url IS NOT NULL AND catalog_url <> ''
      AND scrape_status <> 'running'
      AND series <> 'Motorrad'
    ORDER BY chassis, id
  `);

  const rows = result.rows as Row[];

  return rows
    .filter((r) => !isExcludedChassis(r.chassis || ""))
    .map((r) => ({
      id: r.id,
      chassis: r.chassis,
      displayName: r.display_name,
      catalogUrl: r.catalog_url,
      series: r.series,
    }));
}

export interface EtkBackfillState {
  running: boolean;
  jobId: number | null;
  total: number;
  done: number;
  partsFound: number;
  currentChassis: string | null;
  currentCarName: string | null;
  errors: string[];
}

const state: EtkBackfillState & { cancelRequested: boolean } = {
  running: false,
  jobId: null,
  total: 0,
  done: 0,
  partsFound: 0,
  currentChassis: null,
  currentCarName: null,
  errors: [],
  cancelRequested: false,
};

export function getState(): EtkBackfillState {
  const { cancelRequested: _cr, ...pub } = state;
  return { ...pub };
}

export async function startEtkUncoveredBackfill(): Promise<{
  ok: boolean;
  message: string;
  jobId?: number;
  total?: number;
}> {
  if (state.running) {
    return { ok: false, message: "ETK uncovered backfill is already running" };
  }

  const uncoveredCars = await getUncoveredCars();
  if (uncoveredCars.length === 0) {
    return { ok: false, message: "No uncovered BMW car chassis found — all cars already have parts or no catalog URLs" };
  }

  const job = await createJob(JOB_TYPE, {
    total: uncoveredCars.length,
    done: 0,
    partsFound: 0,
    currentChassis: null,
    currentCarName: null,
    errors: [],
  });

  state.running = true;
  state.jobId = job.id;
  state.total = uncoveredCars.length;
  state.done = 0;
  state.partsFound = 0;
  state.currentChassis = null;
  state.currentCarName = null;
  state.errors = [];
  state.cancelRequested = false;

  runBackfill(job.id, uncoveredCars).catch((err) => {
    console.error("[EtkUncoveredBackfill] Fatal error:", err);
    state.running = false;
    state.jobId = null;
    failJob(job.id, err.message || String(err)).catch(() => {});
  });

  return {
    ok: true,
    message: `Started ETK uncovered backfill for ${uncoveredCars.length} cars`,
    jobId: job.id,
    total: uncoveredCars.length,
  };
}

async function runBackfill(jobId: number, cars: UncoveredCar[]): Promise<void> {
  try {
    for (let i = 0; i < cars.length; i++) {
      if (state.cancelRequested) {
        console.log("[EtkUncoveredBackfill] Cancel requested — stopping");
        break;
      }

      const car = cars[i];
      state.currentChassis = car.chassis;
      state.currentCarName = car.displayName;

      console.log(
        `[EtkUncoveredBackfill] ${i + 1}/${cars.length}: ${car.displayName} (chassis=${car.chassis})`
      );

      try {
        const fullCar = await storage.getCar(car.id);
        if (!fullCar) {
          state.errors.push(`Car ${car.id} not found`);
          state.done++;
          continue;
        }

        await scrapeCarDirect(fullCar);

        const updated = await storage.getCar(car.id);
        const partsAdded = updated?.totalParts ?? 0;

        if (partsAdded > 0) {
          state.partsFound += partsAdded;
          console.log(
            `[EtkUncoveredBackfill] ${car.displayName}: ${partsAdded} parts → complete`
          );
        } else {
          // Task spec: "Cars whose ETK page returns no parts after a real
          // attempt get scrape_status = idle left unchanged — they may be
          // genuine catalog gaps."
          // scrapeCarCatalog sets status = "complete" for zero-part results
          // with no subcategory errors, so we reset it back to idle here.
          // We only do this when the scraper finished without errors
          // (scrapeStatus === "complete" with 0 parts); we leave genuine
          // scrape failures (scrapeStatus === "error") untouched so admins
          // can see them.
          if (updated?.scrapeStatus === "complete") {
            await storage.updateCar(car.id, { scrapeStatus: "idle" });
          }
          console.log(
            `[EtkUncoveredBackfill] ${car.displayName}: 0 parts — genuine catalog gap, left as idle`
          );
        }
      } catch (err: any) {
        const msg = `${car.displayName} (${car.chassis}): ${err.message}`;
        console.warn("[EtkUncoveredBackfill] Error —", msg);
        state.errors.push(msg);
      }

      state.done++;

      await updateJobProgress(jobId, {
        total: state.total,
        done: state.done,
        partsFound: state.partsFound,
        currentChassis: state.currentChassis,
        currentCarName: state.currentCarName,
        errors: state.errors.slice(-20),
      });
    }

    const finalProgress = {
      total: state.total,
      done: state.done,
      partsFound: state.partsFound,
      currentChassis: null,
      currentCarName: null,
      errors: state.errors.slice(-20),
    };

    if (state.cancelRequested) {
      await cancelJob(jobId);
      console.log(
        `[EtkUncoveredBackfill] Cancelled after ${state.done}/${state.total} cars, ${state.partsFound} parts found`
      );
    } else {
      await completeJob(jobId, finalProgress);
      console.log(
        `[EtkUncoveredBackfill] Complete: ${state.done}/${state.total} cars processed, ${state.partsFound} total parts found`
      );
    }
  } finally {
    state.running = false;
    state.currentChassis = null;
    state.currentCarName = null;
    state.jobId = null;
  }
}

export function cancelEtkUncoveredBackfill(): { ok: boolean; message: string } {
  if (!state.running) {
    return { ok: false, message: "No ETK uncovered backfill is currently running" };
  }
  state.cancelRequested = true;
  return { ok: true, message: "Cancel requested — will stop after current car finishes" };
}
