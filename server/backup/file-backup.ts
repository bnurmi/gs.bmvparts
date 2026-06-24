import { createHash } from "crypto";
import { gzipSync } from "zlib";
import { storage } from "../storage";
import { uploadBytes, listKeys } from "./object-storage";
import { offsiteUpload, isOffsiteConfigured } from "./offsite";
import { evaluateAndDispatchAlerts } from "./alerts";
import { runRetentionCleanup } from "./db-backup";
import type { BackupLog } from "@shared/schema";

const ASSET_PREFIXES = ["images/", "uploads/", "assets/", "documents/"];

export interface FileBackupResult {
  log: BackupLog;
  ok: boolean;
  error?: string;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function createFileBackup(trigger: string = "manual", label?: string): Promise<FileBackupResult> {
  const startedAt = Date.now();
  const log = await storage.createBackupLog({
    backupType: "files",
    trigger,
    label: label ?? null,
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

  try {
    console.log(`[Backup/Files] Starting file manifest backup #${log.id}`);

    // List keys only — do NOT download bytes.  Downloading every asset to
    // compute SHA256 was taking ~71 minutes and exhausting file descriptors,
    // causing subsequent spawn() calls (code / files-full backups) to fail
    // with EIO.  The files-full (asset-bytes) backup already downloads and
    // checksums every file; this manifest exists purely as a lightweight
    // inventory of what keys are present in object storage.
    const assets: { key: string }[] = [];

    for (const prefix of ASSET_PREFIXES) {
      let keys: string[] = [];
      try {
        keys = await listKeys(prefix);
      } catch (err) {
        console.warn(`[Backup/Files] Failed to list ${prefix}:`, err);
        continue;
      }
      for (const k of keys) {
        assets.push({ key: k });
      }
    }

    const manifest = {
      version: 2,
      generatedAt: new Date().toISOString(),
      prefixes: ASSET_PREFIXES,
      note: "Key-only manifest. SHA256 checksums are in the files-full (asset-bytes) backup.",
      totals: { count: assets.length },
      assets,
    };

    const json = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    const gz = gzipSync(json, { level: 6 });
    const checksum = createHash("sha256").update(gz).digest("hex");

    const key = `backups/files/file_manifest_${timestamp()}_${log.id}.json.gz`;
    await uploadBytes(key, gz);

    let offsiteStatus: string = "skipped";
    let offsiteKey: string | null = null;
    let offsiteError: string | null = null;
    if (isOffsiteConfigured()) {
      const r = await offsiteUpload(key, gz);
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
      sizeBytes: gz.length,
      checksum,
      durationMs,
      offsiteStatus,
      offsiteKey,
      offsiteError,
      details: { manifestAssets: assets.length },
      completedAt: new Date(),
    });

    try {
      await runRetentionCleanup();
    } catch (err) {
      console.error("[Backup/Files] Retention cleanup failed:", err);
    }

    try {
      await evaluateAndDispatchAlerts();
    } catch (err) {
      console.error("[Backup/Files] Alerts failed:", err);
    }

    console.log(`[Backup/Files] Backup #${log.id} verified: ${assets.length} assets listed, ${gz.length} bytes in ${durationMs}ms`);
    return { log: updated || log, ok: true };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(`[Backup/Files] Backup #${log.id} failed:`, err.message);
    const updated = await storage.updateBackupLog(log.id, {
      status: "failed",
      durationMs,
      errorMessage: err.message?.slice(0, 1000),
      completedAt: new Date(),
    });
    try {
      await evaluateAndDispatchAlerts();
    } catch {}
    return { log: updated || log, ok: false, error: err.message };
  }
}
