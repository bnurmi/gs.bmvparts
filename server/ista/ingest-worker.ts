// ISTA quarterly auto-ingest worker (Task #109).
//
// Picks up `.istapackage` files dropped into the Replit Object Storage
// bucket (BMV-Bucket), runs the SSP/FUB extractor against each new
// version, computes a diff against the previous successful ingest, and
// records a structured run report. Failures alert the admin email
// reusing the same email plumbing as the backup-alerts work.
//
// Trigger: a periodic poll (default every 30 minutes) — Replit Object
// Storage doesn't expose bucket-event hooks, so polling is the simplest
// thing that works. Concurrency is enforced by `ista_ingest_locks`
// (per-version primary key + ON CONFLICT DO NOTHING insert), so two
// scheduler ticks racing on the same file collide cleanly.

import { hostname } from "os";
import { storage } from "../storage";
import { listKeys } from "../backup/object-storage";
import { sendIngestFailureAlert } from "./alerts";
import {
  getExtractor, downloadPackage, cleanupPackage,
  type ExtractorContext, type ExtractorResult, type ExtractorSection,
} from "./extractor";
import type { IstaIngestRun, InsertIstaIngestRun, IstaRunDiff, IstaRunDiffSection, IstaRunTrigger } from "@shared/schema";

// Files in the bucket follow the BMW naming convention
// `BMW_ISPI_ISTA-BLP_<version>.istapackage`. We accept any `.istapackage`
// at the bucket root so the worker also picks up smoke-test copies (see
// step 6 of the task plan) named e.g. `…4.59.10-smoke.istapackage`.
const PACKAGE_SUFFIX = ".istapackage";

export interface DiscoveredPackage {
  bucketKey: string;
  version: string;
}

export interface RunResult {
  run: IstaIngestRun;
  skipped?: "already_ingested" | "lock_held";
}

/** Parse the version token out of the BMW filename convention. */
export function parseVersionFromKey(key: string): string {
  const base = key.replace(/^.*\//, "");
  // Strip the .istapackage suffix.
  const withoutExt = base.endsWith(PACKAGE_SUFFIX) ? base.slice(0, -PACKAGE_SUFFIX.length) : base;
  // Standard form: BMW_ISPI_ISTA-BLP_4.59.10[-suffix]
  const m = withoutExt.match(/(\d+\.\d+\.\d+)/);
  if (m) {
    // If a suffix follows the version (e.g. "-smoke"), include it so
    // the smoke-test copy doesn't collide with the canonical version.
    const idx = withoutExt.indexOf(m[1]);
    const after = withoutExt.slice(idx + m[1].length);
    const suffix = after.replace(/^[-_]/, "").trim();
    return suffix ? `${m[1]}-${suffix}` : m[1];
  }
  // Fall back to the basename so we still get a stable lock key.
  return withoutExt;
}

// Prefix pattern for ISTA SQLite package directories in object storage.
// A version is discoverable either via a .istapackage archive OR via the
// pre-extracted SQLite files uploaded directly under the GLOBAL prefix.
const SQLITE_GLOBAL_PREFIX = "BMW_ISPI_ISTA-DATA_GLOBAL_";

/**
 * Synthetic bucket key used when a version is discovered from SQLite file
 * prefixes but no .istapackage archive exists.  downloadPackage() calls
 * bucketExists() on this key; it returns false, so an empty placeholder is
 * created and SqliteExtractor proceeds to download the SQLite files directly.
 */
function virtualKey(version: string): string {
  return `ista-sqlite-virtual/${version}.istapackage`;
}

/**
 * List discoverable ISTA versions, newest first.
 *
 * Discovery strategy (both paths are combined, version wins via .istapackage
 * when both exist):
 *  1. `.istapackage` files at bucket root — the traditional archive path.
 *  2. `BMW_ISPI_ISTA-DATA_GLOBAL_{version}/` prefixes — present when only
 *     the pre-extracted SQLite files have been uploaded (no .istapackage).
 */
export async function listBucketPackages(): Promise<DiscoveredPackage[]> {
  const keys = await listKeys("");
  const versionMap = new Map<string, string>(); // version → bucketKey

  // Pass 1: real .istapackage archives (preferred — worker uses them for fileSizeBytes).
  for (const k of keys) {
    if (k.toLowerCase().endsWith(PACKAGE_SUFFIX)) {
      const v = parseVersionFromKey(k);
      if (!versionMap.has(v)) versionMap.set(v, k);
    }
  }

  // Pass 2: versions discoverable only from SQLite GLOBAL prefix keys.
  for (const k of keys) {
    if (k.startsWith(SQLITE_GLOBAL_PREFIX)) {
      // Key form: BMW_ISPI_ISTA-DATA_GLOBAL_{version}/{filename}
      const afterPrefix = k.slice(SQLITE_GLOBAL_PREFIX.length);
      const m = afterPrefix.match(/^(\d+\.\d+\.\d+)/);
      if (m) {
        const v = m[1];
        if (!versionMap.has(v)) {
          // No .istapackage for this version — use a virtual placeholder key.
          versionMap.set(v, virtualKey(v));
        }
      }
    }
  }

  const pkgs = Array.from(versionMap.entries()).map(([version, bucketKey]) => ({ bucketKey, version }));
  // Sort newest version-string first (lexicographic is fine for our 3-segment versions).
  pkgs.sort((a, b) => (a.version < b.version ? 1 : a.version > b.version ? -1 : 0));
  return pkgs;
}

function emptySection(): IstaRunDiffSection {
  return { added: 0, changed: 0, removed: 0, perChassis: {} };
}

function diffSections(current: ExtractorSection, previous: ExtractorSection | null): IstaRunDiffSection {
  // The extractor reports per-chassis added/changed/removed counts vs the
  // previous version it knows about (it owns the SSP/FUB tables and is
  // best positioned to compute the diff during the upsert pass). We
  // simply forward those counts and only synthesize a "everything added"
  // diff when there's no previous run on record.
  if (!previous) {
    const perChassis: Record<string, { added: number; changed: number; removed: number }> = {};
    let total = 0;
    for (const [chassis, counts] of Object.entries(current.perChassis)) {
      perChassis[chassis] = { added: counts.added, changed: 0, removed: 0 };
      total += counts.added;
    }
    return { added: total || current.totalRows, changed: 0, removed: 0, perChassis };
  }
  const perChassis: Record<string, { added: number; changed: number; removed: number }> = {};
  let added = 0, changed = 0, removed = 0;
  for (const [chassis, counts] of Object.entries(current.perChassis)) {
    perChassis[chassis] = counts;
    added += counts.added;
    changed += counts.changed;
    removed += counts.removed;
  }
  return { added, changed, removed, perChassis };
}

function buildDiff(result: ExtractorResult, hasPrevious: boolean): IstaRunDiff {
  return {
    ssp: diffSections(result.ssp, hasPrevious ? { totalRows: 0, perChassis: {} } : null),
    fub: diffSections(result.fub, hasPrevious ? { totalRows: 0, perChassis: {} } : null),
  };
}

export interface IngestOptions {
  bucketKey: string;
  trigger: IstaRunTrigger;
  triggeredBy?: string | null;
  /** Force a re-run even if a successful run for this version already exists. */
  force?: boolean;
}

/**
 * Ingest a single `.istapackage`. Idempotent on success: a second call
 * with the same version short-circuits with skipped="already_ingested"
 * and a `noop` run record (unless force is set). Concurrency-safe: two
 * concurrent calls collide on the per-version DB lock and the loser
 * returns skipped="lock_held" without writing a run record.
 */
export async function ingestPackage(opts: IngestOptions): Promise<RunResult> {
  const { bucketKey, trigger, force } = opts;
  const version = parseVersionFromKey(bucketKey);

  if (!force && await storage.hasSuccessfulIstaIngestForVersion(version)) {
    // Record the no-op so the admin Runs view shows the worker did
    // notice the file (instead of mysteriously doing nothing).
    const startedAt = new Date();
    const skipPayload: InsertIstaIngestRun = {
      version,
      bucketKey,
      status: "noop",
      trigger,
      triggeredBy: opts.triggeredBy ?? null,
      sspRows: 0,
      fubRows: 0,
      diff: { ssp: emptySection(), fub: emptySection() },
      warnings: [`Version ${version} already ingested; skipping (use force=true to re-run).`],
    };
    const run = await storage.createIstaIngestRun(skipPayload);
    await storage.updateIstaIngestRun(run.id, {
      finishedAt: startedAt,
      durationMs: 0,
    });
    return { run, skipped: "already_ingested" };
  }

  const owner = `${hostname()}#${process.pid}`;
  const acquired = await storage.tryAcquireIstaLock(version, bucketKey, owner);
  if (!acquired) {
    // Don't write a run record — there's already a concurrent worker
    // doing exactly that. The caller can poll listIstaIngestRuns to see
    // the in-flight run.
    const recent = (await storage.listIstaIngestRuns(20)).find(r => r.version === version && r.status === "running");
    if (recent) return { run: recent, skipped: "lock_held" };
    throw new Error(`Lock held for ${version} but no running run record found — race window?`);
  }

  // Everything below holds the per-version lock — wrap in try/finally so
  // an exception between acquire and the first await (e.g. createIstaIngestRun
  // failing to write a row) can never wedge the lock.
  const started = Date.now();
  let packagePath: string | null = null;
  let failedStep: string | null = null;
  let run: IstaIngestRun | null = null;
  try {
    failedStep = "create_run";
    const initialPayload: InsertIstaIngestRun = {
      version,
      bucketKey,
      status: "running",
      trigger,
      triggeredBy: opts.triggeredBy ?? null,
      sspRows: 0,
      fubRows: 0,
      warnings: [],
    };
    run = await storage.createIstaIngestRun(initialPayload);

    failedStep = "download";
    const dl = await downloadPackage(bucketKey);
    packagePath = dl.packagePath;
    await storage.updateIstaIngestRun(run.id, { fileSizeBytes: dl.fileSizeBytes });

    failedStep = "extract";
    const ctx: ExtractorContext = {
      bucketKey,
      version,
      packagePath,
      fileSizeBytes: dl.fileSizeBytes,
      log: (m: string) => console.log(`[ISTA/Worker:${version}] ${m}`),
    };
    const previousRun = await storage.getLatestSuccessfulIstaIngestRun(version);
    const result = await getExtractor().extract(ctx);

    failedStep = "diff";
    const diff = buildDiff(result, !!previousRun);

    failedStep = "db_write";
    // First-time ingest (or a forced re-run) always finalizes as
    // `succeeded` — even if the diff is all zeros — so version-level
    // dedupe works and the worker doesn't keep re-processing the same
    // file every poll. The `noop` status is reserved for the explicit
    // already-ingested short-circuit above.
    const finalRun = await storage.updateIstaIngestRun(run.id, {
      status: "succeeded",
      sspRows: result.ssp.totalRows,
      fubRows: result.fub.totalRows,
      diff,
      warnings: result.warnings,
      finishedAt: new Date(),
      durationMs: Date.now() - started,
    });
    return { run: finalRun! };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[ISTA/Worker:${version}] Failed at step=${failedStep}: ${message}`);
    if (run) {
      const finalRun = await storage.updateIstaIngestRun(run.id, {
        status: "failed",
        failedStep: failedStep || "other",
        errorMessage: message,
        finishedAt: new Date(),
        durationMs: Date.now() - started,
      });
      if (finalRun) {
        try {
          await sendIngestFailureAlert(finalRun);
        } catch (alertErr) {
          console.error(`[ISTA/Worker:${version}] Alert dispatch failed:`, alertErr);
        }
        return { run: finalRun };
      }
    }
    // No run record could be written — surface the original error so the
    // caller (scan loop or admin route) sees it instead of a phantom
    // "ok" result.
    throw err;
  } finally {
    if (packagePath) await cleanupPackage(packagePath);
    await storage.releaseIstaLock(version);
  }
}

/**
 * Scan the bucket and ingest any package whose version we haven't yet
 * recorded a successful run for. Returns one RunResult per ingest
 * attempt (newest version first); skipped versions are reported with
 * skipped="already_ingested".
 */
export async function scanAndIngestNewPackages(): Promise<RunResult[]> {
  const pkgs = await listBucketPackages();
  const results: RunResult[] = [];
  for (const pkg of pkgs) {
    if (await storage.hasSuccessfulIstaIngestForVersion(pkg.version)) continue;
    try {
      const result = await ingestPackage({ bucketKey: pkg.bucketKey, trigger: "scheduled" });
      results.push(result);
    } catch (err: any) {
      console.error(`[ISTA/Worker] Unhandled error processing ${pkg.bucketKey}:`, err?.message || err);
    }
  }
  return results;
}
