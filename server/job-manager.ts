import { db } from "./storage";
import { backgroundJobs } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { BackgroundJob } from "@shared/schema";

export type JobType = "enrichment" | "crossref" | "model_scrape" | "car_scrape" | "resume_incomplete" | "catalog_audit" | "realoem_backfill" | "part-appearance-harvest" | "ista_import" | "bimmerwork_bulk_discover" | "etk_uncovered_backfill" | "vin_enrichment_backfill";

export async function ensureBackgroundJobsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id SERIAL PRIMARY KEY,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        progress JSONB DEFAULT '{}',
        started_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        error TEXT
      )
    `);
  } catch (err) {
    console.error("[JobManager] Failed to ensure background_jobs table:", err);
  }
}

export interface JobProgress {
  [key: string]: any;
}

const CHECKPOINT_INTERVAL_MS = 10_000;
const activeTimers = new Map<number, NodeJS.Timeout>();

export async function createJob(jobType: JobType, initialProgress: JobProgress = {}): Promise<BackgroundJob> {
  await db.update(backgroundJobs)
    .set({ status: "cancelled", completedAt: new Date(), error: "Superseded by new job" })
    .where(and(eq(backgroundJobs.jobType, jobType), eq(backgroundJobs.status, "running")));

  const [job] = await db.insert(backgroundJobs).values({
    jobType,
    status: "running",
    progress: initialProgress,
  }).returning();

  console.log(`[JobManager] Created job #${job.id} (${jobType})`);
  return job;
}

export async function updateJobProgress(jobId: number, progress: JobProgress): Promise<void> {
  await db.update(backgroundJobs)
    .set({ progress, updatedAt: new Date() })
    .where(eq(backgroundJobs.id, jobId));
}

/**
 * Merge a partial patch into the existing progress JSONB without overwriting
 * unrelated keys. Uses PostgreSQL || operator for a shallow top-level merge.
 */
export async function mergeJobProgress(jobId: number, patch: JobProgress): Promise<void> {
  await db.execute(sql`
    UPDATE background_jobs
    SET progress = COALESCE(progress, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
        updated_at = NOW()
    WHERE id = ${jobId}
  `);
}

export function startPeriodicCheckpoint(jobId: number, getProgress: () => JobProgress): void {
  if (activeTimers.has(jobId)) {
    clearInterval(activeTimers.get(jobId)!);
  }
  const timer = setInterval(async () => {
    try {
      await updateJobProgress(jobId, getProgress());
    } catch (err) {
      console.error(`[JobManager] Checkpoint error for job #${jobId}:`, err);
    }
  }, CHECKPOINT_INTERVAL_MS);
  activeTimers.set(jobId, timer);
}

export function stopPeriodicCheckpoint(jobId: number): void {
  const timer = activeTimers.get(jobId);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(jobId);
  }
}

export async function completeJob(jobId: number, finalProgress?: JobProgress): Promise<void> {
  stopPeriodicCheckpoint(jobId);
  await db.update(backgroundJobs)
    .set({
      status: "complete",
      completedAt: new Date(),
      updatedAt: new Date(),
      ...(finalProgress ? { progress: finalProgress } : {}),
    })
    .where(eq(backgroundJobs.id, jobId));
  console.log(`[JobManager] Job #${jobId} completed`);
}

export async function failJob(jobId: number, error: string, finalProgress?: JobProgress): Promise<void> {
  stopPeriodicCheckpoint(jobId);
  await db.update(backgroundJobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      updatedAt: new Date(),
      error,
      ...(finalProgress ? { progress: finalProgress } : {}),
    })
    .where(eq(backgroundJobs.id, jobId));
  console.log(`[JobManager] Job #${jobId} failed: ${error}`);
}

export async function interruptJob(jobId: number): Promise<void> {
  stopPeriodicCheckpoint(jobId);
  await db.update(backgroundJobs)
    .set({
      status: "interrupted",
      updatedAt: new Date(),
      error: "Server restarted — job can be manually re-triggered from the Admin panel",
    })
    .where(eq(backgroundJobs.id, jobId));
  console.log(`[JobManager] Job #${jobId} marked interrupted (server restart)`);
}

export async function cancelJob(jobId: number): Promise<void> {
  stopPeriodicCheckpoint(jobId);
  await db.update(backgroundJobs)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, jobId));
  console.log(`[JobManager] Job #${jobId} cancelled`);
}

export async function cancelJobByType(jobType: JobType): Promise<number | null> {
  const [active] = await db.select()
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.jobType, jobType), eq(backgroundJobs.status, "running")))
    .limit(1);

  if (active) {
    await cancelJob(active.id);
    return active.id;
  }
  return null;
}

export async function getActiveJob(jobType: JobType): Promise<BackgroundJob | null> {
  const [job] = await db.select()
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.jobType, jobType), eq(backgroundJobs.status, "running")))
    .limit(1);
  return job || null;
}

export async function getLatestJob(jobType: JobType): Promise<BackgroundJob | null> {
  const [job] = await db.select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.jobType, jobType))
    .orderBy(sql`started_at DESC`)
    .limit(1);
  return job || null;
}

export async function getInterruptedJobs(): Promise<BackgroundJob[]> {
  const jobs = await db.select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.status, "running"));
  return jobs;
}

export async function getAllJobs(limit = 20): Promise<BackgroundJob[]> {
  return db.select()
    .from(backgroundJobs)
    .orderBy(sql`started_at DESC`)
    .limit(limit);
}
