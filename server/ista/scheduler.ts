// Periodic poll for new `.istapackage` files in BMV-Bucket (Task #109).
//
// Replit Object Storage doesn't expose bucket-event hooks, so the worker
// polls. Default cadence is 30 minutes — quarterly ISTA releases don't
// need anything tighter. Override with ISTA_INGEST_POLL_MINUTES.
//
// Lock semantics: we don't bother with a process-wide lock here because
// the actual ingest in `ingest-worker.ts` already serializes per-version
// via `ista_ingest_locks`. Multiple replicas polling at the same moment
// will all see the same bucket listing, but only one will win the
// per-version DB lock for any given file.

import { scanAndIngestNewPackages } from "./ingest-worker";

let _interval: NodeJS.Timeout | null = null;
let _lastRunAt: Date | null = null;
let _nextRunAt: Date | null = null;
let _intervalMs = 30 * 60_000;

export function startIstaScheduler(): void {
  if (_interval) return;

  // Honour explicit disable so dev environments stay quiet while the
  // deployed instance owns ingest.
  const disabled = process.env.BMV_DISABLE_ISTA_SCHEDULER;
  if (disabled && disabled !== "0" && disabled.toLowerCase() !== "false") {
    console.log("[ISTA/Scheduler] BMV_DISABLE_ISTA_SCHEDULER set; scheduler will NOT start in this process");
    return;
  }

  const minutes = Math.max(5, parseInt(process.env.ISTA_INGEST_POLL_MINUTES || "30", 10) || 30);
  _intervalMs = minutes * 60_000;

  const fire = async () => {
    _lastRunAt = new Date();
    try {
      const results = await scanAndIngestNewPackages();
      if (results.length > 0) {
        console.log(`[ISTA/Scheduler] Processed ${results.length} new package(s)`);
      }
    } catch (err: any) {
      console.error("[ISTA/Scheduler] Scan failed:", err?.message || err);
    } finally {
      _nextRunAt = new Date(Date.now() + _intervalMs);
    }
  };

  // Defer the first scan ~2 minutes after boot so we don't compete with
  // the rest of the startup-time work.
  setTimeout(() => { void fire(); }, 2 * 60_000);
  _interval = setInterval(() => { void fire(); }, _intervalMs);
  _nextRunAt = new Date(Date.now() + 2 * 60_000);
  console.log(`[ISTA/Scheduler] Started (poll every ${minutes}m)`);
}

export function getIstaSchedulerStatus(): { active: boolean; intervalMs: number; lastRunAt: string | null; nextRunAt: string | null } {
  return {
    active: !!_interval,
    intervalMs: _intervalMs,
    lastRunAt: _lastRunAt ? _lastRunAt.toISOString() : null,
    nextRunAt: _nextRunAt ? _nextRunAt.toISOString() : null,
  };
}
