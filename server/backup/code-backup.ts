import { spawn } from "child_process";
import { createHash } from "crypto";
import { createReadStream, statSync, unlinkSync, readFileSync, statfsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { storage } from "../storage";
import { uploadFromFile } from "./object-storage";
import { offsiteUploadFile, isOffsiteConfigured } from "./offsite";
import { evaluateAndDispatchAlerts } from "./alerts";
import { runRetentionCleanup } from "./db-backup";
import { singleflight } from "./concurrency";
import type { BackupLog } from "@shared/schema";

const PROJECT_ROOT = process.cwd();
const TAR_TIMEOUT_MS = 300_000;

// Refuse to spawn tar if /tmp has less than this free (code archive is typically
// a few hundred MB; 1 GB floor is very conservative but guards against a full disk).
const MIN_FREE_TMP_BYTES_CODE = 1 * 1024 * 1024 * 1024;

// Refuse to spawn if fewer than this many file descriptors are available.
// A tar child needs ~3 FDs (stdin/stdout/stderr) plus the output file; 64 is
// a generous safety margin that still catches a genuinely exhausted FD table.
const MIN_FREE_FDS = 64;

export interface CodeBackupResult {
  log: BackupLog;
  ok: boolean;
  error?: string;
}

const EXCLUDES: string[] = [
  // ── SECURITY-CRITICAL: never include anything that holds plain-text creds.
  // .replit holds [userenv.shared] which is plain-text production secrets
  // (Oxylabs PW, Resend API key, BMV provision key, BMV SSO secret, …).
  // .env, .env.* are the conventional dotenv credential files.
  // tokens/ here is design-tokens CSS (kept), but secrets/ is the reserved
  // path for any future credential dump. Cert/key material is also out.
  "./.replit",
  "./.env",
  "./.env.*",
  "./secrets",
  "*.pem",
  "*.key",
  "*.crt",
  "*.p12",
  "*.pfx",
  // ── BULK: dependencies, VCS, build artifacts, runtime state, large data.
  "./node_modules",
  "./.git",
  "./.local",
  "./.cache",
  "./.upm",
  "./.config",
  "./.pythonlibs",
  "./dist",
  "./logs",
  "./attached_assets",
  "./public/images",
  "./data/etk",
  "./data/psdzdata",
  "./data/export-chunks",
  "./data/export-data.json",
  "./data/export-manifest.json",
  "./bmv_static/cache",
  "*.tar.gz",
  "*.zip",
  "*.7z",
  "*.jetarch",
  "*.jetarch.part*",
  "*.iso",
  "*.log",
  ".tmp_*",
  ".DS_Store",
];

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

/**
 * Check that we have enough file descriptors and /tmp disk space to safely
 * spawn a tar child process.  Returns an error string if the check fails,
 * or null if it is safe to proceed.
 */
function preSpawnCheck(): string | null {
  // FD check via /proc/sys/fs/file-nr (Linux only; skip gracefully elsewhere).
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

  // /tmp disk space check.
  try {
    const s = statfsSync(tmpdir());
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    if (freeBytes < MIN_FREE_TMP_BYTES_CODE) {
      return `pre-spawn check failed: only ${(freeBytes / 1024 / 1024).toFixed(1)} MB free in ${tmpdir()}, need at least ${(MIN_FREE_TMP_BYTES_CODE / 1024 / 1024).toFixed(0)} MB`;
    }
  } catch {
    // statfs not available — proceed with a warning.
    console.warn("[Backup/Code] pre-spawn statfs check skipped: statfs unavailable");
  }

  return null;
}

function runTarCreate(outFile: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const args: string[] = ["czf", outFile];
    for (const e of EXCLUDES) args.push(`--exclude=${e}`);
    args.push("-C", PROJECT_ROOT, ".");
    const proc = spawn("tar", args, { cwd: PROJECT_ROOT });
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
      // tar may emit warnings on stderr but exit 0; treat exit code as truth.
      if (code !== 0) return resolve({ ok: false, stderr: `tar exited ${code}: ${stderr}` });
      resolve({ ok: true, stderr });
    });
  });
}

function runTarVerify(filePath: string): Promise<{ ok: boolean; entries: number; reason?: string }> {
  // tar -tzf <file> | wc -l, but done in-process to capture both pipes.
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
      // Sanity: a healthy code archive must contain >= 50 entries (server/, client/, shared/, package.json, etc).
      if (entries < 50) return resolve({ ok: false, entries, reason: `archive only has ${entries} entries` });
      // Spot-check for anchor files.
      // (Already verified by entry count + tar exit; deeper marker check would require capturing file list.)
      resolve({ ok: true, entries });
    });
  });
}

export async function createCodeBackup(trigger: string = "manual", label?: string): Promise<CodeBackupResult> {
  const sf = await singleflight("backup:code", () => createCodeBackupInner(trigger, label));
  if (!sf.performed) {
    console.log(`[Backup/Code] Coalesced into in-flight run (trigger=${trigger}); reusing result`);
  }
  return sf.result;
}

async function createCodeBackupInner(trigger: string, label?: string): Promise<CodeBackupResult> {
  const startedAt = Date.now();
  const log = await storage.createBackupLog({
    backupType: "code",
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

  const tmpFile = join(tmpdir(), `bmv_code_${process.pid}_${Date.now()}.tar.gz`);
  try {
    console.log(`[Backup/Code] Starting code tarball #${log.id}`);

    // Guard against FD / disk exhaustion before spawning tar.
    const preCheck = preSpawnCheck();
    if (preCheck) {
      throw new Error(preCheck);
    }

    const tarResult = await runTarCreate(tmpFile);
    if (!tarResult.ok) {
      throw new Error(tarResult.stderr || "tar failed");
    }
    const verify = await runTarVerify(tmpFile);
    if (!verify.ok) {
      throw new Error(`Verification failed: ${verify.reason}`);
    }
    const bytes = statSync(tmpFile).size;
    const checksum = await sha256OfFile(tmpFile);

    const key = `backups/code/code_${timestamp()}_${log.id}.tar.gz`;
    await uploadFromFile(key, tmpFile);

    let offsiteStatus: string = "skipped";
    let offsiteKey: string | null = null;
    let offsiteError: string | null = null;
    if (isOffsiteConfigured()) {
      const r = await offsiteUploadFile(key, tmpFile);
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
      details: { entries: verify.entries, excludes: EXCLUDES.length },
      completedAt: new Date(),
    });
    console.log(`[Backup/Code] Backup #${log.id} verified: ${bytes} bytes, ${verify.entries} entries in ${durationMs}ms`);

    try {
      await runRetentionCleanup();
    } catch (err) {
      console.error("[Backup/Code] Retention cleanup failed:", err);
    }
    try {
      await evaluateAndDispatchAlerts();
    } catch (err) {
      console.error("[Backup/Code] Alerts failed:", err);
    }

    return { log: updated || log, ok: true };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.error(`[Backup/Code] Backup #${log.id} failed:`, err.message);
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
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}
