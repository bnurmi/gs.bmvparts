import { spawn } from "child_process";
import { createHash } from "crypto";
import { createReadStream, statSync, unlinkSync, mkdirSync, rmSync, writeFileSync, statfsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { storage } from "../storage";
import { uploadFromFile, listKeys, downloadToFile } from "./object-storage";
import { offsiteUploadFile, isOffsiteConfigured } from "./offsite";
import { evaluateAndDispatchAlerts } from "./alerts";
import { runRetentionCleanup } from "./db-backup";
import { singleflight } from "./concurrency";
import type { BackupLog } from "@shared/schema";

const ASSET_PREFIXES = ["images/", "uploads/", "assets/", "documents/"];
const TAR_TIMEOUT_MS = 1_800_000; // 30 min — full asset tarball can take a while
const MAX_KEY_PATH_LEN = 200; // safety bound on per-key path length to avoid surprise OS limits
// Disk safety: refuse to start if /tmp has less than this much free.
// Empirical headroom: full mirror is ~1.6 GB raw + ~1.5 GB tar = ~3.2 GB peak.
// 5 GB floor leaves room for concurrent pg_dumps (~250 MB) and routine churn.
const MIN_FREE_TMP_BYTES = 5 * 1024 * 1024 * 1024;

// Refuse to spawn if fewer than this many file descriptors are available.
// A tar child needs ~3 FDs (stdin/stdout/stderr) plus the output file; 64 is
// a generous safety margin that still catches a genuinely exhausted FD table.
const MIN_FREE_FDS = 64;

export interface AssetBackupResult {
  log: BackupLog;
  ok: boolean;
  error?: string;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (c: string | Buffer) => { hash.update(c); });
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function safeRelPath(key: string): string {
  // Reject path-traversal sequences; coerce to forward slashes.
  const normalized = key.replace(/\\/g, "/");
  if (normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error(`Refusing unsafe asset key: ${key}`);
  }
  if (normalized.length > MAX_KEY_PATH_LEN) {
    throw new Error(`Asset key exceeds ${MAX_KEY_PATH_LEN} chars: ${normalized.slice(0, 60)}...`);
  }
  return normalized;
}

/** Read current system state for diagnostic messages (FDs + /tmp space). */
function systemStatSnapshot(): string {
  const parts: string[] = [];
  try {
    const nr = readFileSync("/proc/sys/fs/file-nr", "utf8").trim().split(/\s+/);
    const allocated = parseInt(nr[0] ?? "0", 10);
    const max = parseInt(nr[2] ?? "0", 10);
    const free = max - allocated;
    parts.push(`FDs: ${free} free (${allocated}/${max} allocated)`);
  } catch {
    parts.push("FDs: unknown (no /proc/sys/fs/file-nr)");
  }
  try {
    const s = statfsSync(tmpdir());
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    parts.push(`/tmp free: ${(freeBytes / 1024 / 1024).toFixed(1)} MB`);
  } catch {
    parts.push("/tmp free: unknown");
  }
  return parts.join(", ");
}

function checkTmpFreeSpace(): { ok: boolean; freeBytes: number; reason?: string } {
  try {
    const s = statfsSync(tmpdir());
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    if (freeBytes < MIN_FREE_TMP_BYTES) {
      return {
        ok: false,
        freeBytes,
        reason: `Only ${(freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB free in ${tmpdir()}, need at least ${(MIN_FREE_TMP_BYTES / 1024 / 1024 / 1024).toFixed(0)} GB`,
      };
    }
    return { ok: true, freeBytes };
  } catch (err: any) {
    // statfs failed (e.g. very old kernel) — proceed with a warning rather than block.
    console.warn(`[Backup/Assets] statfs check skipped: ${err.message}`);
    return { ok: true, freeBytes: -1 };
  }
}

/**
 * Check that we have enough file descriptors to safely spawn a tar child
 * process.  Returns an error string if the check fails, or null if safe.
 * Disk-space is checked separately via checkTmpFreeSpace().
 */
function checkFreeFds(): string | null {
  try {
    const nr = readFileSync("/proc/sys/fs/file-nr", "utf8").trim().split(/\s+/);
    const allocated = parseInt(nr[0] ?? "0", 10);
    const max = parseInt(nr[2] ?? "0", 10);
    if (max > 0) {
      const free = max - allocated;
      if (free < MIN_FREE_FDS) {
        return `pre-spawn check failed: only ${free} FDs free (${allocated}/${max} allocated); need at least ${MIN_FREE_FDS}`;
      }
    }
  } catch {
    // Not on Linux or /proc unavailable — skip FD check.
  }
  return null;
}

function runTarCreate(outFile: string, stagingDir: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const args: string[] = ["czf", outFile, "-C", stagingDir, "."];
    const proc = spawn("tar", args);
    const errChunks: Buffer[] = [];
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, TAR_TIMEOUT_MS);
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      // Augment EIO with a system-state snapshot so the failure is
      // self-diagnosing in the backup log.
      const extra = (e.code === "EIO" || (e as any).errno === -5)
        ? ` [system: ${systemStatSnapshot()}]`
        : "";
      resolve({ ok: false, stderr: `spawn failed: ${e.message}${extra}` });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(errChunks).toString("utf8").slice(0, 1000);
      if (killed) return resolve({ ok: false, stderr: `tar timed out after ${TAR_TIMEOUT_MS}ms` });
      if (code !== 0) return resolve({ ok: false, stderr: `tar exited ${code}: ${stderr}` });
      resolve({ ok: true, stderr });
    });
  });
}

function runTarVerify(filePath: string, expectedMin: number): Promise<{ ok: boolean; entries: number; reason?: string }> {
  return new Promise((resolve) => {
    const proc = spawn("tar", ["tzf", filePath]);
    let entries = 0;
    let trailing = "";
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => {
      const text = trailing + c.toString("utf8");
      const parts = text.split("\n");
      trailing = parts.pop() || "";
      entries += parts.length;
    });
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", (e: NodeJS.ErrnoException) => {
      const extra = (e.code === "EIO" || (e as any).errno === -5)
        ? ` [system: ${systemStatSnapshot()}]`
        : "";
      resolve({ ok: false, entries, reason: `spawn failed: ${e.message}${extra}` });
    });
    proc.on("close", (code) => {
      if (trailing.length > 0) entries++;
      const stderr = Buffer.concat(errChunks).toString("utf8").slice(0, 500);
      if (code !== 0) return resolve({ ok: false, entries, reason: `tar tzf exited ${code}: ${stderr}` });
      // Manifest + at least one asset directory anchor; require we see >= the count we expected to write.
      // tar tzf includes directory entries too, so the floor is "files + manifest + a few dirs".
      if (entries < expectedMin) {
        return resolve({ ok: false, entries, reason: `archive has ${entries} entries, expected >= ${expectedMin}` });
      }
      resolve({ ok: true, entries });
    });
  });
}

export async function createAssetBytesBackup(trigger: string = "manual"): Promise<AssetBackupResult> {
  const sf = await singleflight("backup:assets-full", () => createAssetBytesBackupInner(trigger));
  if (!sf.performed) {
    console.log(`[Backup/Assets] Coalesced into in-flight run (trigger=${trigger}); reusing result`);
  }
  return sf.result;
}

async function createAssetBytesBackupInner(trigger: string): Promise<AssetBackupResult> {
  const startedAt = Date.now();
  const log = await storage.createBackupLog({
    backupType: "files-full",
    trigger,
    label: null,
    status: "pending",
    storageKey: null,
    sizeBytes: null,
    checksum: null,
    durationMs: null,
    offsiteStatus: "skipped",
    offsiteKey: null,
    offsiteError: null,
    errorMessage: null,
    details: null,
    completedAt: null,
  });

  const stagingDir = join(tmpdir(), `bmv_assets_${process.pid}_${Date.now()}`);
  const tmpTar = join(tmpdir(), `bmv_assets_${process.pid}_${Date.now()}.tar.gz`);
  let downloadedFiles = 0;
  let downloadedBytes = 0;
  let skippedKeys = 0;

  try {
    console.log(`[Backup/Assets] Starting full asset backup #${log.id}`);
    const space = checkTmpFreeSpace();
    if (!space.ok) {
      throw new Error(`Disk-space precheck failed: ${space.reason}`);
    }
    if (space.freeBytes > 0) {
      console.log(`[Backup/Assets] /tmp free: ${(space.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
    }

    // FD check before downloading hundreds of files (each open() costs a FD).
    const fdCheck = checkFreeFds();
    if (fdCheck) {
      throw new Error(fdCheck);
    }

    mkdirSync(stagingDir, { recursive: true });

    const manifestEntries: { key: string; size: number; sha256: string }[] = [];

    for (const prefix of ASSET_PREFIXES) {
      let keys: string[] = [];
      try {
        keys = await listKeys(prefix);
      } catch (err) {
        console.warn(`[Backup/Assets] Failed to list ${prefix}:`, err);
        continue;
      }
      console.log(`[Backup/Assets] ${prefix}: ${keys.length} keys`);
      for (const k of keys) {
        let rel: string;
        try {
          rel = safeRelPath(k);
        } catch (err: any) {
          console.warn(`[Backup/Assets] ${err.message}`);
          skippedKeys++;
          continue;
        }
        const dest = join(stagingDir, rel);
        try {
          mkdirSync(dirname(dest), { recursive: true });
          await downloadToFile(k, dest);
          const size = statSync(dest).size;
          const sha = await sha256OfFile(dest);
          manifestEntries.push({ key: k, size, sha256: sha });
          downloadedFiles++;
          downloadedBytes += size;
        } catch (err: any) {
          console.warn(`[Backup/Assets] Skipping unreadable ${k}: ${err.message}`);
          skippedKeys++;
        }
      }
    }

    // Embed manifest at archive root for fast indexing without extracting all bytes.
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      prefixes: ASSET_PREFIXES,
      totals: { count: manifestEntries.length, bytes: downloadedBytes, skipped: skippedKeys },
      assets: manifestEntries,
    };
    writeFileSync(join(stagingDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

    // Re-check resources immediately before spawning tar — the download loop
    // above may have consumed additional FDs and disk space.
    const fdCheckPre = checkFreeFds();
    if (fdCheckPre) {
      throw new Error(fdCheckPre);
    }
    const spacePre = checkTmpFreeSpace();
    if (!spacePre.ok) {
      throw new Error(`Disk-space precheck (pre-spawn) failed: ${spacePre.reason}`);
    }

    const tarResult = await runTarCreate(tmpTar, stagingDir);
    if (!tarResult.ok) throw new Error(tarResult.stderr || "tar failed");

    // Floor: every downloaded file + manifest + at least one directory entry
    // (tar emits dirs as separate entries). +2 gives a safer floor than +1.
    const expectedMinEntries = downloadedFiles + 2;
    const verify = await runTarVerify(tmpTar, expectedMinEntries);
    if (!verify.ok) throw new Error(`Verification failed: ${verify.reason}`);

    const bytes = statSync(tmpTar).size;
    const checksum = await sha256OfFile(tmpTar);

    const key = `backups/files/full/file_assets_${timestamp()}_${log.id}.tar.gz`;
    await uploadFromFile(key, tmpTar);

    let offsiteStatus: string = "skipped";
    let offsiteKey: string | null = null;
    let offsiteError: string | null = null;
    if (isOffsiteConfigured()) {
      const r = await offsiteUploadFile(key, tmpTar);
      if (r.uploaded) {
        offsiteStatus = "uploaded";
        offsiteKey = key;
      } else {
        offsiteStatus = "failed";
        offsiteError = r.error || "unknown";
      }
    }

    const durationMs = Date.now() - startedAt;
    const updated = await storage.updateBackupLog(log.id, {
      status: "verified",
      storageKey: key,
      sizeBytes: bytes,
      checksum,
      durationMs,
      offsiteStatus,
      offsiteKey,
      offsiteError,
      details: {
        entries: verify.entries,
        downloadedFiles,
        downloadedBytes,
        skippedKeys,
        compressionRatio: downloadedBytes > 0 ? Number((bytes / downloadedBytes).toFixed(3)) : null,
      },
      completedAt: new Date(),
    });
    console.log(
      `[Backup/Assets] Backup #${log.id} verified: ${downloadedFiles} files, raw=${downloadedBytes} bytes, gz=${bytes} bytes, dur=${durationMs}ms`,
    );

    try {
      await runRetentionCleanup();
    } catch (err) {
      console.error("[Backup/Assets] Retention cleanup failed:", err);
    }
    try {
      await evaluateAndDispatchAlerts();
    } catch (err) {
      console.error("[Backup/Assets] Alerts failed:", err);
    }

    return { log: updated || log, ok: true };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(`[Backup/Assets] Backup #${log.id} failed:`, err.message);
    const updated = await storage.updateBackupLog(log.id, {
      status: "failed",
      durationMs,
      errorMessage: err.message?.slice(0, 1000),
      details: { downloadedFiles, downloadedBytes, skippedKeys },
      completedAt: new Date(),
    });
    try {
      await evaluateAndDispatchAlerts();
    } catch {}
    return { log: updated || log, ok: false, error: err.message };
  } finally {
    try { unlinkSync(tmpTar); } catch {}
    try { rmSync(stagingDir, { recursive: true, force: true }); } catch {}
  }
}
