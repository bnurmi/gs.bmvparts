import { spawn } from "child_process";
import { createHash } from "crypto";
import { createGzip, createGunzip } from "zlib";
import { createReadStream, createWriteStream, statSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { storage } from "../storage";
import { uploadFromFile, deleteKey, listKeys, downloadToFile } from "./object-storage";
import { offsiteUploadFile, offsiteList, offsiteDelete, isOffsiteConfigured } from "./offsite";
import { evaluateAndDispatchAlerts } from "./alerts";
import { getBackupRetentionSettings } from "./settings";
import type { BackupLog } from "@shared/schema";

const PG_DUMP_TIMEOUT_MS = (() => {
  const raw = process.env.PG_DUMP_TIMEOUT_MS;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return 1_200_000;
})();

export type DbBackupKind = "manual" | "hourly" | "daily" | "weekly" | "monthly" | "pre-deploy";

export interface DbBackupOptions {
  trigger: DbBackupKind;
  label?: string;
}

export interface DbBackupResult {
  log: BackupLog;
  ok: boolean;
  error?: string;
}

function prefixForTrigger(trigger: DbBackupKind): string {
  switch (trigger) {
    case "hourly":
      return "backups/db/hourly/";
    case "weekly":
      return "backups/db/weekly/";
    case "monthly":
      return "backups/db/monthly/";
    case "pre-deploy":
      return "backups/db/pre_deploy/";
    case "daily":
    case "manual":
    default:
      return "backups/db/";
  }
}

function timestamp(): string {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-");
}

interface DumpFileInfo {
  filePath: string;
  bytes: number;
  sha256: string;
  rawBytes: number;
}

async function runPgDumpToFile(): Promise<DumpFileInfo> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const filePath = join(tmpdir(), `bmv_dump_${process.pid}_${Date.now()}.sql.gz`);

  return await new Promise<DumpFileInfo>((resolve, reject) => {
    const proc = spawn("pg_dump", ["--no-owner", "--no-privileges", databaseUrl], {
      env: { ...process.env, PGCONNECT_TIMEOUT: "30" },
    });
    const errChunks: Buffer[] = [];
    const hash = createHash("sha256");
    const gzip = createGzip({ level: 6 });
    const out = createWriteStream(filePath);
    let killed = false;
    let rawBytes = 0;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, PG_DUMP_TIMEOUT_MS);

    proc.stdout.on("data", (c: Buffer) => { rawBytes += c.length; });
    gzip.on("data", (c: Buffer) => { hash.update(c); });
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));

    proc.stdout.pipe(gzip).pipe(out);

    let pgClosed = false;
    let pgCode: number | null = null;
    proc.on("error", (e) => {
      clearTimeout(timer);
      try { unlinkSync(filePath); } catch {}
      reject(new Error(`pg_dump spawn failed: ${e.message}`));
    });
    proc.on("close", (code) => {
      pgClosed = true;
      pgCode = code;
    });
    out.on("error", (e) => {
      clearTimeout(timer);
      try { unlinkSync(filePath); } catch {}
      reject(new Error(`Write to dump file failed: ${e.message}`));
    });
    out.on("close", () => {
      clearTimeout(timer);
      if (killed) {
        try { unlinkSync(filePath); } catch {}
        return reject(new Error(`pg_dump timed out after ${PG_DUMP_TIMEOUT_MS}ms`));
      }
      if (!pgClosed) {
        // Wait briefly for pg_dump to close
        setTimeout(() => finalize(), 50);
      } else {
        finalize();
      }
      function finalize() {
        if (pgCode !== 0) {
          try { unlinkSync(filePath); } catch {}
          return reject(new Error(`pg_dump exited with code ${pgCode}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`));
        }
        let bytes = 0;
        try { bytes = statSync(filePath).size; } catch {}
        resolve({ filePath, bytes, sha256: hash.digest("hex"), rawBytes });
      }
    });
  });
}

async function verifyDumpFile(filePath: string): Promise<{ ok: boolean; lines: number; reason?: string }> {
  // Stream-decompress the entire file; require ≥10 lines AND at least one SQL marker.
  return await new Promise((resolve) => {
    let lines = 0;
    let trailing = "";
    let sawCreateTable = false;
    let sawCopyOrInsert = false;
    let sawDumpHeader = false;
    const src = createReadStream(filePath);
    const gunzip = createGunzip();
    src.on("error", (e) => resolve({ ok: false, lines, reason: `read failed: ${e.message}` }));
    gunzip.on("error", (e) => resolve({ ok: false, lines, reason: `gunzip failed: ${e.message}` }));
    gunzip.on("data", (chunk: Buffer) => {
      const text = trailing + chunk.toString("utf8");
      const parts = text.split("\n");
      trailing = parts.pop() || "";
      lines += parts.length;
      for (const p of parts) {
        if (!sawCreateTable && p.includes("CREATE TABLE")) sawCreateTable = true;
        if (!sawCopyOrInsert && (p.startsWith("COPY ") || p.includes("INSERT INTO"))) sawCopyOrInsert = true;
        if (!sawDumpHeader && p.includes("PostgreSQL database dump")) sawDumpHeader = true;
      }
    });
    gunzip.on("end", () => {
      if (trailing.length > 0) lines++;
      const hasMarker = sawCreateTable || sawCopyOrInsert || sawDumpHeader;
      if (lines < 10) return resolve({ ok: false, lines, reason: `Dump only has ${lines} lines` });
      if (!hasMarker) return resolve({ ok: false, lines, reason: "No SQL markers (CREATE TABLE / COPY / INSERT / dump header)" });
      resolve({ ok: true, lines });
    });
    src.pipe(gunzip);
  });
}

export async function createDbBackup(options: DbBackupOptions): Promise<DbBackupResult> {
  const startedAt = Date.now();
  const log = await storage.createBackupLog({
    backupType: "database",
    trigger: options.trigger,
    label: options.label || null,
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

  let result: DbBackupResult = { log, ok: false };

  let tmpFile: string | null = null;
  try {
    console.log(`[Backup/DB] Starting ${options.trigger} backup #${log.id}`);
    const dump = await runPgDumpToFile();
    tmpFile = dump.filePath;

    const verification = await verifyDumpFile(dump.filePath);
    if (!verification.ok) {
      throw new Error(`Verification failed: ${verification.reason}`);
    }

    const key = `${prefixForTrigger(options.trigger)}db_${timestamp()}_${log.id}.sql.gz`;
    await uploadFromFile(key, dump.filePath);

    let offsiteStatus: string = "skipped";
    let offsiteKey: string | null = null;
    let offsiteError: string | null = null;
    if (isOffsiteConfigured()) {
      const r = await offsiteUploadFile(key, dump.filePath);
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
      sizeBytes: dump.bytes,
      checksum: dump.sha256,
      durationMs,
      offsiteStatus,
      offsiteKey,
      offsiteError,
      details: { dumpLines: verification.lines, dumpBytes: dump.rawBytes },
      completedAt: new Date(),
    });
    result = { log: updated || log, ok: true };
    console.log(`[Backup/DB] Backup #${log.id} verified: ${dump.bytes} bytes in ${durationMs}ms`);
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(`[Backup/DB] Backup #${log.id} failed:`, err.message);
    const updated = await storage.updateBackupLog(log.id, {
      status: "failed",
      durationMs,
      errorMessage: err.message?.slice(0, 1000),
      completedAt: new Date(),
    });
    result = { log: updated || log, ok: false, error: err.message };
  } finally {
    if (tmpFile) {
      try { unlinkSync(tmpFile); } catch {}
    }
  }

  try {
    await runRetentionCleanup();
  } catch (err) {
    console.error("[Backup/DB] Retention cleanup failed:", err);
  }

  try {
    await evaluateAndDispatchAlerts();
  } catch (err) {
    console.error("[Backup/DB] Alerts failed:", err);
  }

  return result;
}

export async function createPreDeployBackup(): Promise<DbBackupResult> {
  return createDbBackup({ trigger: "pre-deploy", label: "pre_deploy" });
}

const PREFIX_TO_RETENTION_KEY: { prefix: string; key: keyof Awaited<ReturnType<typeof getBackupRetentionSettings>> }[] = [
  { prefix: "backups/db/hourly/", key: "hourly" },
  { prefix: "backups/db/weekly/", key: "weekly" },
  { prefix: "backups/db/monthly/", key: "monthly" },
  { prefix: "backups/db/pre_deploy/", key: "preDeploy" },
  { prefix: "backups/db/", key: "daily" }, // catches manual + daily; runs last so subprefixes already cleaned
  { prefix: "backups/code/", key: "code" },
  { prefix: "backups/files/full/", key: "assetsFull" }, // must run BEFORE backups/files/ so its keys aren't double-counted
  { prefix: "backups/files/", key: "files" }, // manifest-only; filtered to exclude full/ subprefix
];

async function pruneOnsite(prefix: string, keep: number): Promise<number> {
  if (keep <= 0) return 0;
  let keys = await listKeys(prefix);
  // Filter out anything under sub-prefixes (only direct children for the loose db/ prefix)
  if (prefix === "backups/db/") {
    keys = keys.filter((k) => !k.startsWith("backups/db/hourly/") && !k.startsWith("backups/db/weekly/") && !k.startsWith("backups/db/monthly/") && !k.startsWith("backups/db/pre_deploy/"));
  }
  if (prefix === "backups/files/") {
    keys = keys.filter((k) => !k.startsWith("backups/files/full/"));
  }
  keys.sort();
  const excess = keys.length - keep;
  if (excess <= 0) return 0;
  const toRemove = keys.slice(0, excess);
  for (const k of toRemove) {
    try {
      await deleteKey(k);
    } catch (err) {
      console.error(`[Backup/Retention] Failed to delete ${k}:`, err);
    }
  }
  return toRemove.length;
}

async function pruneOffsite(prefix: string, keep: number): Promise<number> {
  if (!isOffsiteConfigured() || keep <= 0) return 0;
  let keys = await offsiteList(prefix);
  if (prefix === "backups/db/") {
    keys = keys.filter((k) => !k.startsWith("backups/db/hourly/") && !k.startsWith("backups/db/weekly/") && !k.startsWith("backups/db/monthly/") && !k.startsWith("backups/db/pre_deploy/"));
  }
  if (prefix === "backups/files/") {
    keys = keys.filter((k) => !k.startsWith("backups/files/full/"));
  }
  keys.sort();
  const excess = keys.length - keep;
  if (excess <= 0) return 0;
  const toRemove = keys.slice(0, excess);
  for (const k of toRemove) {
    try {
      await offsiteDelete(k);
    } catch (err) {
      console.error(`[Backup/Retention] Offsite delete failed ${k}:`, err);
    }
  }
  return toRemove.length;
}

export async function runRetentionCleanup(): Promise<{ onsite: Record<string, number>; offsite: Record<string, number> }> {
  const settings = await getBackupRetentionSettings();
  const onsite: Record<string, number> = {};
  const offsite: Record<string, number> = {};
  for (const { prefix, key } of PREFIX_TO_RETENTION_KEY) {
    onsite[prefix] = await pruneOnsite(prefix, settings[key]);
    offsite[prefix] = await pruneOffsite(prefix, settings[key]);
  }
  return { onsite, offsite };
}

export async function restoreFromKey(key: string, source: "onsite" | "offsite"): Promise<{ ok: boolean; durationMs: number; error?: string; bytes?: number }> {
  const startedAt = Date.now();
  const log = await storage.createBackupLog({
    backupType: "restore",
    trigger: "manual",
    label: `restore:${key}`,
    status: "pending",
    storageKey: key,
    sizeBytes: null,
    checksum: null,
    durationMs: null,
    offsiteStatus: source === "offsite" ? "used" : "skipped",
    offsiteKey: source === "offsite" ? key : null,
    offsiteError: null,
    errorMessage: null,
    details: { source },
    completedAt: null,
  });

  const tmp = join(tmpdir(), `bmv_restore_${process.pid}_${Date.now()}.sql.gz`);
  try {
    try {
      await downloadToTempFile(key, source, tmp);
    } catch (err) {
      if (source === "onsite" && isOffsiteConfigured()) {
        console.warn(`[Backup/Restore] Onsite download failed, falling back to offsite for ${key}`);
        await downloadToTempFile(key, "offsite", tmp);
      } else {
        throw err;
      }
    }
    const bytes = statSync(tmp).size;
    await applyDumpFromFile(tmp);
    const durationMs = Date.now() - startedAt;
    await storage.updateBackupLog(log.id, {
      status: "verified",
      sizeBytes: bytes,
      durationMs,
      completedAt: new Date(),
      details: { source, downloadedBytes: bytes },
    });
    return { ok: true, durationMs, bytes };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    await storage.updateBackupLog(log.id, {
      status: "failed",
      durationMs,
      errorMessage: err.message?.slice(0, 1000),
      completedAt: new Date(),
    });
    return { ok: false, durationMs, error: err.message };
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

async function downloadToTempFile(key: string, source: "onsite" | "offsite", destPath: string): Promise<void> {
  if (source === "offsite") {
    const { offsiteDownloadToFile } = await import("./offsite");
    await offsiteDownloadToFile(key, destPath);
  } else {
    await downloadToFile(key, destPath);
  }
}

async function applyDumpFromFile(gzPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  return await new Promise<void>((resolve, reject) => {
    const proc = spawn("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1"]);
    const errChunks: Buffer[] = [];
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", (e) => reject(new Error(`psql spawn failed: ${e.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`psql exited with code ${code}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`));
      }
      resolve();
    });
    const src = createReadStream(gzPath);
    const gunzip = createGunzip();
    src.on("error", (e) => reject(e));
    gunzip.on("error", (e) => reject(e));
    src.pipe(gunzip).pipe(proc.stdin);
  });
}
