import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream, statSync } from "fs";

/**
 * Offsite backup adapter for the shared MinIO bucket.
 *
 * The bucket is shared across sibling Replit projects. Each project owns
 * exactly one top-level prefix (OFFSITE_BACKUP_PREFIX, e.g. "bmv.parts/")
 * and MUST never read, list, or write outside its own prefix. This module
 * is the single chokepoint that enforces that rule.
 *
 * Callers pass *logical* keys (e.g. "backups/db/db_xxx.sql.gz"). Every
 * upload / list / delete here transparently prepends the project prefix
 * and strips it back off again on the way out, so the rest of the app
 * stays oblivious to the namespacing. Any attempt to operate on an
 * absolute key already starting with another project's prefix is a hard
 * error.
 */

export interface OffsiteConfig {
  endpoint: string;
  bucket: string;
  prefix: string; // always ends with "/"
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

// Strict allowlist for OFFSITE_BACKUP_PREFIX:
//   - first char alphanumeric
//   - followed by alphanumerics, dots, underscores, hyphens, slashes
//   - must end with '/'
//   - dot-segments ('..') and backslashes explicitly disallowed
const PREFIX_ALLOWLIST = /^[a-z0-9][a-z0-9._\-\/]*\/$/i;

function isPrefixSafe(prefix: string): boolean {
  if (!PREFIX_ALLOWLIST.test(prefix)) return false;
  if (prefix.includes("..")) return false;
  if (prefix.includes("\\")) return false;
  if (prefix.includes("//")) return false; // collapsing slashes are an escape vector
  return true;
}

export function getOffsiteConfig(): OffsiteConfig | null {
  const endpoint = process.env.OFFSITE_BACKUP_ENDPOINT;
  const bucket = process.env.OFFSITE_BACKUP_BUCKET;
  const prefix = process.env.OFFSITE_BACKUP_PREFIX;
  const accessKeyId = process.env.OFFSITE_BACKUP_ACCESS_KEY;
  const secretAccessKey = process.env.OFFSITE_BACKUP_SECRET_KEY;
  if (!endpoint || !bucket || !prefix || !accessKeyId || !secretAccessKey) return null;
  if (!isPrefixSafe(prefix)) {
    console.warn(`[Backup/Offsite] OFFSITE_BACKUP_PREFIX failed safety check (must match ${PREFIX_ALLOWLIST}, no '..', '\\\\', or '//'); got '${prefix}'. Treating as misconfigured.`);
    return null;
  }
  return {
    endpoint,
    bucket,
    prefix,
    accessKeyId,
    secretAccessKey,
    region: process.env.OFFSITE_BACKUP_REGION || "us-east-1",
  };
}

export function isOffsiteConfigured(): boolean {
  return getOffsiteConfig() !== null;
}

let _client: S3Client | null = null;
function getClient(cfg: OffsiteConfig): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true,
  });
  return _client;
}

/**
 * Validate that a key (logical or absolute) is free of escape sequences.
 * Applied to EVERY input regardless of whether it already carries the
 * project prefix — pre-prefixed keys must still pass the same gauntlet
 * because S3 paths can be normalised by intermediaries (proxies,
 * MinIO's path handling, future SDK changes) in ways that turn '..'
 * segments into real directory traversal at the storage layer.
 */
function assertKeyShape(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("offsite key must be a non-empty string");
  }
  if (key.startsWith("/")) {
    throw new Error(`offsite key must not start with '/': '${key}'`);
  }
  if (key.includes("..")) {
    throw new Error(`offsite key must not contain '..': '${key}'`);
  }
  if (key.includes("\\")) {
    throw new Error(`offsite key must not contain backslash: '${key}'`);
  }
  if (key.includes("//")) {
    throw new Error(`offsite key must not contain '//': '${key}'`);
  }
  // Reject ASCII control characters (0x00-0x1F, 0x7F) — these have no
  // legitimate use in a backup object key and have caused real-world
  // path-handling exploits in S3-compatible servers.
  if (/[\x00-\x1F\x7F]/.test(key)) {
    throw new Error(`offsite key contains control characters: '${JSON.stringify(key)}'`);
  }
}

/**
 * Translate a caller-supplied logical key into the absolute bucket key
 * under this project's prefix. Validates the input against escape
 * sequences first, then either returns it as-is (if it already carries
 * the project prefix — round-trip from list→delete) or prepends the
 * prefix. Final result is asserted to live under cfg.prefix; if not,
 * we throw rather than silently issue an out-of-prefix S3 call.
 */
function toAbsoluteKey(cfg: OffsiteConfig, logicalKey: string): string {
  assertKeyShape(logicalKey);
  const absKey = logicalKey.startsWith(cfg.prefix) ? logicalKey : `${cfg.prefix}${logicalKey}`;
  if (!absKey.startsWith(cfg.prefix)) {
    // Defensive — should be impossible given the branch above.
    throw new Error(`offsite key resolved outside project prefix: '${absKey}' vs '${cfg.prefix}'`);
  }
  return absKey;
}

/** Strip the project prefix off an absolute key for caller-visible logical keys. */
function toLogicalKey(cfg: OffsiteConfig, absoluteKey: string): string {
  if (!absoluteKey.startsWith(cfg.prefix)) {
    // Should never happen — we always list with Prefix=cfg.prefix — but
    // surface loudly if it does so we don't silently mishandle a stray key.
    throw new Error(`offsite list returned key outside project prefix: '${absoluteKey}'`);
  }
  return absoluteKey.slice(cfg.prefix.length);
}

// Network-layer error codes we treat as transient. Everything else is
// either an application bug (4xx) or an unknown that we don't want to
// hammer the bucket with.
const TRANSIENT_NET_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE",
  "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH",
]);

function isTransient(err: any): boolean {
  const status: number | undefined = err?.$metadata?.httpStatusCode;
  if (typeof status === "number") {
    if (status === 429) return true;        // rate-limited — back off and try again
    if (status >= 500 && status < 600) return true; // server-side / gateway
    return false;                            // 4xx (incl. 400/401/403/404/409) is a bug to fix
  }
  // No HTTP status — check for transient network error codes
  const code = err?.code || err?.cause?.code;
  if (code && TRANSIENT_NET_CODES.has(String(code))) return true;
  // SDK signals retryability separately on some errors
  if (err?.$retryable?.throttling || err?.$retryable === true) return true;
  return false;
}

/**
 * Spec calls for "up to 3 attempts, sleeping 2^n seconds between them
 * (2s, 4s, 8s)" — implemented as 3 attempts with sleeps of 2s and 4s
 * between them (3 attempts → 2 inter-attempt sleeps). The 8s case
 * would only apply at attempts=4. Retry only on transient errors per
 * `isTransient` above.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isTransient(err)) {
        const status = err?.$metadata?.httpStatusCode;
        const tag = typeof status === "number" ? `HTTP ${status}` : (err?.code ? `code ${err.code}` : "non-transient");
        console.error(`[Backup/Offsite] ${label} failed with ${tag} (non-retryable):`, err.message);
        throw err;
      }
      if (i < attempts - 1) {
        const wait = Math.pow(2, i + 1) * 1000; // 2s before retry #2, 4s before retry #3
        console.warn(`[Backup/Offsite] ${label} attempt ${i + 1}/${attempts} transient failure, retrying in ${wait}ms:`, err.message);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

export async function offsiteUpload(logicalKey: string, body: Buffer): Promise<{ uploaded: boolean; error?: string }> {
  const cfg = getOffsiteConfig();
  if (!cfg) return { uploaded: false };
  try {
    const absKey = toAbsoluteKey(cfg, logicalKey);
    const client = getClient(cfg);
    const startedAt = Date.now();
    await withRetry(`upload ${absKey}`, async () => {
      await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: absKey, Body: body }));
    });
    console.log(`[Backup/Offsite] upload ok key=${absKey} bytes=${body.length} elapsedMs=${Date.now() - startedAt}`);
    return { uploaded: true };
  } catch (err: any) {
    console.error(`[Backup/Offsite] upload failed key=${logicalKey}:`, err.message);
    return { uploaded: false, error: err.message };
  }
}

export async function offsiteUploadFile(logicalKey: string, srcPath: string): Promise<{ uploaded: boolean; error?: string }> {
  const cfg = getOffsiteConfig();
  if (!cfg) return { uploaded: false };
  try {
    const absKey = toAbsoluteKey(cfg, logicalKey);
    const client = getClient(cfg);
    const size = statSync(srcPath).size;
    const startedAt = Date.now();
    await withRetry(`upload-file ${absKey}`, async () => {
      await client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: absKey,
        Body: createReadStream(srcPath),
        ContentLength: size,
      }));
    });
    console.log(`[Backup/Offsite] upload-file ok key=${absKey} bytes=${size} elapsedMs=${Date.now() - startedAt}`);
    return { uploaded: true };
  } catch (err: any) {
    console.error(`[Backup/Offsite] upload-file failed key=${logicalKey}:`, err.message);
    return { uploaded: false, error: err.message };
  }
}

export async function offsiteDownloadToFile(logicalKey: string, destPath: string): Promise<void> {
  const cfg = getOffsiteConfig();
  if (!cfg) throw new Error("Offsite backup not configured");
  const absKey = toAbsoluteKey(cfg, logicalKey);
  const client = getClient(cfg);
  await withRetry(`download-file ${absKey}`, async () => {
    const r = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: absKey }));
    const stream = r.Body as any;
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(destPath);
      stream.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
      stream.on("error", reject);
    });
  });
}

export async function offsiteDownload(logicalKey: string): Promise<Buffer> {
  const cfg = getOffsiteConfig();
  if (!cfg) throw new Error("Offsite backup not configured");
  const absKey = toAbsoluteKey(cfg, logicalKey);
  const client = getClient(cfg);
  return withRetry(`download ${absKey}`, async () => {
    const r = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: absKey }));
    const chunks: Buffer[] = [];
    const stream = r.Body as any;
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks);
  });
}

/**
 * List logical keys under a sub-prefix. The sub-prefix is interpreted
 * RELATIVE to the project prefix; calling offsiteList("") returns every
 * key the project owns, never anything else. Returned keys are stripped
 * back down to logical form (without the project prefix).
 */
export async function offsiteList(logicalPrefix: string): Promise<string[]> {
  const cfg = getOffsiteConfig();
  if (!cfg) return [];
  // Reject anyone trying to bypass the prefix by passing "/" or "..".
  if (logicalPrefix.startsWith("/") || logicalPrefix.includes("..")) {
    throw new Error(`offsite list prefix must be project-relative: '${logicalPrefix}'`);
  }
  const absPrefix = logicalPrefix.startsWith(cfg.prefix) ? logicalPrefix : `${cfg.prefix}${logicalPrefix}`;
  const client = getClient(cfg);
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: absPrefix, ContinuationToken: token }));
    for (const o of r.Contents || []) {
      if (o.Key) out.push(toLogicalKey(cfg, o.Key));
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export async function offsiteDelete(logicalKey: string): Promise<void> {
  const cfg = getOffsiteConfig();
  if (!cfg) return;
  const absKey = toAbsoluteKey(cfg, logicalKey);
  // Belt-and-braces: refuse to issue a DELETE that doesn't sit under our prefix.
  if (!absKey.startsWith(cfg.prefix)) {
    throw new Error(`offsite delete refused: key '${absKey}' is outside project prefix '${cfg.prefix}'`);
  }
  const client = getClient(cfg);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: absKey }));
  console.log(`[Backup/Offsite] delete ok key=${absKey}`);
}

export async function offsiteExists(logicalKey: string): Promise<boolean> {
  const list = await offsiteList(logicalKey);
  return list.includes(logicalKey);
}

/**
 * Connectivity check. Uses a prefix-scoped list with MaxKeys=1 instead
 * of HeadBucket — project IAM keys on the shared bucket are typically
 * scoped to the project's prefix and don't have bucket-level perms, so
 * HeadBucket would falsely report failure.
 */
export async function offsiteTestConnection(): Promise<{ configured: boolean; ok: boolean; error?: string; bucket?: string; endpoint?: string; prefix?: string }> {
  const cfg = getOffsiteConfig();
  if (!cfg) return { configured: false, ok: false };
  try {
    const client = getClient(cfg);
    await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.prefix, MaxKeys: 1 }));
    return { configured: true, ok: true, bucket: cfg.bucket, endpoint: cfg.endpoint, prefix: cfg.prefix };
  } catch (err: any) {
    return { configured: true, ok: false, error: err.message, bucket: cfg.bucket, endpoint: cfg.endpoint, prefix: cfg.prefix };
  }
}
