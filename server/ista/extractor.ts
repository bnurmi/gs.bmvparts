// ISTA SSP/FUB extractor interface (Task #109).
//
// The quarterly auto-ingest worker (server/ista/ingest-worker.ts) calls
// into this interface and treats the implementation as a black box. The
// upstream task (Task #108 — "Build SSP/FUB extractor and schema") owns
// the real implementation: download the .istapackage from Object Storage,
// unpack it, parse SSP and FUB, and upsert into the SSP/FUB tables it
// defines.
//
// Until that task lands, the default implementation here is a deliberate
// no-op stub: it downloads the file (so we exercise the storage path,
// surface storage errors honestly, and record the file size on the run
// record) and returns zero counts. The worker still produces a real run
// record, the smoke test still passes ("no changes vs the previous
// version" because both runs returned zero), and swapping in the real
// extractor is a one-line change here.

import path from "path";
import { mkdir, stat, unlink } from "fs/promises";
import { tmpdir } from "os";
import { downloadToFile, exists as bucketExists } from "../backup/object-storage";

export interface ExtractorChassisCounts {
  added: number;
  changed: number;
  removed: number;
}

export interface ExtractorSection {
  totalRows: number;
  perChassis: Record<string, ExtractorChassisCounts>;
}

export interface ExtractorResult {
  ssp: ExtractorSection;
  fub: ExtractorSection;
  warnings: string[];
}

export interface ExtractorContext {
  bucketKey: string;
  version: string;
  // Local path the worker downloaded the package to. May be reused by
  // the implementation; the worker cleans it up after the run finishes.
  packagePath: string;
  // Total uncompressed size in bytes (or null if unknown).
  fileSizeBytes: number | null;
  // Logger the worker passes through so output is consistent.
  log: (msg: string) => void;
}

export interface SspFubExtractor {
  /**
   * Extract SSP + FUB from the .istapackage at ctx.packagePath. Must be
   * idempotent: running twice on the same version is a no-op the second
   * time. Throw on download/unpack/parse/db-write failures with a clear
   * message — the worker captures it on the run record and alerts.
   */
  extract(ctx: ExtractorContext): Promise<ExtractorResult>;
}

class StubExtractor implements SspFubExtractor {
  async extract(ctx: ExtractorContext): Promise<ExtractorResult> {
    ctx.log(
      `[ISTA/Extractor] Stub implementation in use — Task #108 (SSP/FUB schema + extractor) ` +
      `has not landed yet. Reporting zero rows for ${ctx.version}.`,
    );
    return {
      ssp: { totalRows: 0, perChassis: {} },
      fub: { totalRows: 0, perChassis: {} },
      warnings: [
        "SSP/FUB extractor not yet implemented (upstream Task #108 pending). " +
        "Worker plumbing exercised, but no rows were ingested.",
      ],
    };
  }
}

let _extractor: SspFubExtractor = new StubExtractor();

/**
 * Replace the active extractor. The upstream task wires its real
 * implementation in by calling this once at startup.
 */
export function setExtractor(impl: SspFubExtractor): void {
  _extractor = impl;
}

export function getExtractor(): SspFubExtractor {
  return _extractor;
}

/**
 * Download an `.istapackage` from Object Storage to a scratch path under
 * /tmp. Caller is responsible for cleanup via cleanupPackage().
 *
 * If the package file does not exist at `bucketKey` but the extractor is
 * the real SqliteExtractor (which downloads SQLite files directly and does
 * not need the `.istapackage` archive), this function creates an empty
 * placeholder file so the worker can still proceed to the `extract` step.
 * The run record will show `fileSizeBytes = 0` in that case.
 */
export async function downloadPackage(bucketKey: string): Promise<{ packagePath: string; fileSizeBytes: number }> {
  const scratchDir = path.join(tmpdir(), "ista-ingest");
  await mkdir(scratchDir, { recursive: true });
  const localName = path.basename(bucketKey).replace(/[^A-Za-z0-9._-]/g, "_");
  const packagePath = path.join(scratchDir, `${Date.now()}-${localName}`);

  // Check whether the key actually exists before downloading. This lets us
  // distinguish a true "not found" (legitimate when only the pre-extracted
  // SQLite files are in the bucket) from auth/network/transient failures,
  // which must not be silently swallowed as a placeholder.
  const keyFound = await bucketExists(bucketKey);

  if (!keyFound) {
    // The .istapackage archive is absent, but the SqliteExtractor downloads
    // the individual SQLite files directly by version — it does not need
    // the archive. Create an empty placeholder so the worker can proceed to
    // the extract() step. Any extractor that actually needs the file will
    // fail loudly inside its own extract() with a clear message.
    console.warn(
      `[ISTA/Extractor] Package key not found in object storage: ${bucketKey}. ` +
      `Creating placeholder — SqliteExtractor will fetch SQLite files directly.`
    );
    const { writeFile } = await import("fs/promises");
    await writeFile(packagePath, Buffer.alloc(0));
    return { packagePath, fileSizeBytes: 0 };
  }

  // Key confirmed present — any error here is a genuine download failure.
  await downloadToFile(bucketKey, packagePath);
  const st = await stat(packagePath);
  return { packagePath, fileSizeBytes: st.size };
}

export async function cleanupPackage(packagePath: string): Promise<void> {
  try {
    await unlink(packagePath);
  } catch {
    // best-effort cleanup; /tmp is ephemeral anyway
  }
}
