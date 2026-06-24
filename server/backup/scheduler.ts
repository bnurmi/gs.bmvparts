import cron, { type ScheduledTask } from "node-cron";
import { openSync, writeSync, closeSync, readFileSync, unlinkSync } from "fs";
import { createDbBackup } from "./db-backup";
import { createFileBackup } from "./file-backup";
import { createCodeBackup } from "./code-backup";
import { createAssetBytesBackup } from "./asset-backup";
import { getBackupScheduleSettings } from "./settings";
import { db } from "../storage";
import { sql } from "drizzle-orm";

const LOCK_PATH = "/tmp/.bmv_backup_scheduler.lock";

// Short pause between daily backup phases so the OS has time to reclaim file
// descriptors and flush pipe buffers after the previous step.  Without this,
// a long-running phase (e.g. asset manifest listing) can leave the FD table
// near-exhausted and cause subsequent spawn() calls to fail with EIO.
const INTER_PHASE_DELAY_MS = 10_000;

let acquired = false;
let jobs: ScheduledTask[] = [];
let intervalHandles: NodeJS.Timeout[] = [];
let inFlight = new Set<string>();
type NextRunInfo = { cron: string; nextRunAt: string };
let nextRuns: Record<string, NextRunInfo | null> = {};

function writeLockFile(): boolean {
  // O_EXCL | O_CREAT — atomic create-or-fail across processes.
  try {
    const fd = openSync(LOCK_PATH, "wx");
    try {
      writeSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (err: any) {
    if (err && err.code === "EEXIST") return false;
    throw err;
  }
}

function tryAcquireLock(): boolean {
  try {
    if (writeLockFile()) {
      acquired = true;
      registerLockCleanup();
      return true;
    }
    return false;
  } catch (err) {
    console.error("[Backup/Scheduler] Lock acquisition failed:", err);
    return false;
  }
}

let cleanupRegistered = false;
function registerLockCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const release = () => {
    try {
      const owner = parseInt(readFileSync(LOCK_PATH, "utf8").trim() || "0", 10);
      if (owner === process.pid) unlinkSync(LOCK_PATH);
    } catch {}
  };
  process.on("exit", release);
  process.on("SIGINT", () => { release(); process.exit(0); });
  process.on("SIGTERM", () => { release(); process.exit(0); });
}

async function runOnce(name: string, fn: () => Promise<void>): Promise<void> {
  if (inFlight.has(name)) {
    console.warn(`[Backup/Scheduler] Skipping ${name} — already in flight`);
    return;
  }
  inFlight.add(name);
  try {
    await fn();
  } catch (err) {
    console.error(`[Backup/Scheduler] ${name} job error:`, err);
  } finally {
    inFlight.delete(name);
  }
}

/** Pause between backup phases so the OS can reclaim FDs and pipe buffers. */
function interPhaseDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, INTER_PHASE_DELAY_MS));
}

function clearJobs() {
  for (const j of jobs) {
    try {
      j.stop();
    } catch {}
  }
  jobs = [];
  for (const h of intervalHandles) {
    try {
      clearInterval(h);
    } catch {}
  }
  intervalHandles = [];
  nextRuns = {};
}

// Parse a 5-field cron expression supporting our subset: digits, *, */N, lists are not used.
// Returns next run timestamp >= from. Field order: minute, hour, dayOfMonth, month, dayOfWeek.
function nextRunFromCron(expr: string, from: Date = new Date()): Date | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [mF, hF, domF, monF, dowF] = fields;

  const matches = (val: number, field: string, max: number): boolean => {
    if (field === "*") return true;
    const stepMatch = /^\*\/(\d+)$/.exec(field);
    if (stepMatch) {
      const step = parseInt(stepMatch[1], 10);
      return step > 0 && val % step === 0;
    }
    const numMatch = /^\d+$/.exec(field);
    if (numMatch) return val === parseInt(field, 10);
    return false;
  };

  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Search up to 366 days ahead
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const t = new Date(start.getTime() + i * 60_000);
    const minute = t.getMinutes();
    const hour = t.getHours();
    const dom = t.getDate();
    const month = t.getMonth() + 1;
    const dow = t.getDay();
    if (
      matches(minute, mF, 59) &&
      matches(hour, hF, 23) &&
      matches(dom, domF, 31) &&
      matches(month, monF, 12) &&
      matches(dow, dowF, 6)
    ) {
      return t;
    }
  }
  return null;
}

function computeNextRunInfo(expr: string): NextRunInfo {
  const next = nextRunFromCron(expr);
  return { cron: expr, nextRunAt: next ? next.toISOString() : "" };
}

export async function rescheduleJobs(): Promise<void> {
  if (!acquired) return;
  clearJobs();
  const s = await getBackupScheduleSettings();

  if (s.hourlyEnabled) {
    const minutes = Math.min(1440, Math.max(5, s.hourlyIntervalMinutes || 60));
    const intervalMs = minutes * 60_000;
    const fire = () =>
      runOnce("hourly", async () => {
        try {
          await createDbBackup({ trigger: "hourly" });
        } finally {
          nextRuns.hourly = {
            cron: `every ${minutes}m`,
            nextRunAt: new Date(Date.now() + intervalMs).toISOString(),
          };
        }
      });
    const handle = setInterval(fire, intervalMs);
    intervalHandles.push(handle);
    nextRuns.hourly = {
      cron: `every ${minutes}m`,
      nextRunAt: new Date(Date.now() + intervalMs).toISOString(),
    };
  }

  if (s.dailyEnabled) {
    const expr = `0 ${s.dailyHour} * * *`;
    const t = cron.schedule(expr, () => runOnce("daily", async () => {
      // Phase 1: database backup (fast, ~seconds)
      await createDbBackup({ trigger: "daily" });

      if (s.fileBackupOnDaily) {
        // Phase 2: file manifest (now fast — key-listing only, no byte downloads)
        await interPhaseDelay();
        await createFileBackup("daily");
      }

      // Phase 3: code tarball — pause first so any FDs from phases 1-2 are released
      await interPhaseDelay();
      try {
        await createCodeBackup("daily");
      } catch (err) {
        console.error("[Backup/Scheduler] daily code backup failed:", err);
      }

      // Phase 4: full asset bytes — most resource-intensive; pause after code backup
      await interPhaseDelay();
      try {
        await createAssetBytesBackup("daily");
      } catch (err) {
        console.error("[Backup/Scheduler] daily asset-bytes backup failed:", err);
      }
    }));
    jobs.push(t);
    nextRuns.daily = computeNextRunInfo(expr);
  }

  if (s.weeklyEnabled) {
    const expr = `30 ${s.weeklyHour} * * ${s.weeklyDayOfWeek}`;
    const t = cron.schedule(expr, () => runOnce("weekly", async () => { await createDbBackup({ trigger: "weekly" }); }));
    jobs.push(t);
    nextRuns.weekly = computeNextRunInfo(expr);
  }

  if (s.monthlyEnabled) {
    const expr = `15 ${s.monthlyHour} 1 * *`;
    const t = cron.schedule(expr, () => runOnce("monthly", async () => { await createDbBackup({ trigger: "monthly" }); }));
    jobs.push(t);
    nextRuns.monthly = computeNextRunInfo(expr);
  }

  console.log(`[Backup/Scheduler] ${jobs.length} jobs scheduled`);
}

export function getNextRuns(): Record<string, NextRunInfo | null> {
  return { ...nextRuns };
}

export function isSchedulerActive(): boolean {
  return acquired;
}

export async function startScheduler(): Promise<void> {
  // Honour explicit disable so the dev environment can stay quiet while the
  // deployed instance owns the daily fire. Prevents two schedulers writing
  // duplicate tarballs to the same onsite/offsite buckets and racing on
  // retention pruning. Set BMV_DISABLE_BACKUP_SCHEDULER=1 (development env
  // only) to silence; leave unset in production.
  const disabled = process.env.BMV_DISABLE_BACKUP_SCHEDULER;
  if (disabled && disabled !== "0" && disabled.toLowerCase() !== "false") {
    console.log("[Backup/Scheduler] BMV_DISABLE_BACKUP_SCHEDULER set; scheduler will NOT start in this process");
    return;
  }
  // /tmp is per-container — any lock file left over belongs to a dead process.
  // Unconditionally remove it before attempting the atomic create so a stale
  // lock never prevents the scheduler from starting after a container restart.
  try {
    unlinkSync(LOCK_PATH);
  } catch {}
  if (!tryAcquireLock()) {
    console.log("[Backup/Scheduler] Another worker holds the scheduler lock; skipping");
    return;
  }
  await rescheduleJobs();
}

const CATCHUP_THRESHOLD_MS = 25 * 60 * 60 * 1000; // 25 hours

export async function runCatchupBackupsIfStale(): Promise<void> {
  const types = ["database", "files", "code"] as const;
  await Promise.all(
    types.map(async (backupType) => {
      try {
        const rows = await db.execute(sql`
          SELECT completed_at
          FROM backup_logs
          WHERE backup_type = ${backupType}
            AND status = 'verified'
          ORDER BY completed_at DESC
          LIMIT 1
        `);
        const row = (rows as any).rows?.[0];
        const lastVerified: Date | null = row?.completed_at ? new Date(row.completed_at) : null;
        const isStale = !lastVerified || Date.now() - lastVerified.getTime() > CATCHUP_THRESHOLD_MS;
        if (!isStale) {
          console.log(`[Backup/Catchup] ${backupType} backup is fresh (last: ${lastVerified?.toISOString()}); skipping`);
          return;
        }
        console.log(`[Backup/Catchup] ${backupType} backup is stale (last: ${lastVerified?.toISOString() ?? "never"}); starting catch-up run`);
        void runOnce(`catchup:${backupType}`, async () => {
          if (backupType === "database") {
            await createDbBackup({ trigger: "manual", label: "startup-catchup" });
          } else if (backupType === "files") {
            await createFileBackup("manual", "startup-catchup");
          } else if (backupType === "code") {
            await createCodeBackup("manual", "startup-catchup");
          }
        });
      } catch (err) {
        console.error(`[Backup/Catchup] Failed to check/enqueue catch-up for ${backupType}:`, err);
      }
    })
  );
}
