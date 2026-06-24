// Shared in-process concurrency guard for backup runs.
// Both the scheduler and the admin manual-trigger routes call into
// createCodeBackup / createAssetBytesBackup. Without coordination
// they could race (two pg_dumps, two tarballs to /tmp, two
// concurrent retention runs deleting the same offsite keys).
// This module gives each backup type a single-flight lock at the
// process level. If a second caller arrives while a backup of that
// type is in flight, it gets back the SAME promise as the first
// caller and they share the result — no double work.

const inflight = new Map<string, Promise<unknown>>();

export interface SingleflightResult<T> {
  /** True if this caller actually performed the work; false if it shared an in-flight result. */
  performed: boolean;
  result: T;
}

export async function singleflight<T>(name: string, fn: () => Promise<T>): Promise<SingleflightResult<T>> {
  const existing = inflight.get(name);
  if (existing) {
    const result = (await existing) as T;
    return { performed: false, result };
  }
  const p = (async () => {
    try {
      return await fn();
    } finally {
      // Always release on completion (success OR failure) so the
      // next caller can run a fresh attempt.
      inflight.delete(name);
    }
  })();
  inflight.set(name, p);
  const result = (await p) as T;
  return { performed: true, result };
}

export function isInFlight(name: string): boolean {
  return inflight.has(name);
}
