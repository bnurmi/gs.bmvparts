import { Pool } from "pg";
import { Client as ObjectStorageClient } from "@replit/object-storage";

const SOURCE_BASE = "https://www.bmw-etk.info";
const CONCURRENCY = 12;
const STATE_PATH = "/tmp/backfill-images-state.json";
const RETRY_LIMIT = 2;

const os = new ObjectStorageClient();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Job = { size: "small" | "big"; filename: string };
type Ref = { source: string; size: "small" | "big"; filename: string };

async function listExistingKeys(prefix: string): Promise<Set<string>> {
  const res = await os.list({ prefix });
  if (!res.ok) throw new Error(`OS list ${prefix} failed: ${res.error?.message}`);
  return new Set(res.value.map((o) => o.name.replace(prefix, "")));
}

// Each entry below is one (table, column) pair that stores a bmw-etk.info
// image URL. The size is encoded in the URL path (`/img/small/` or
// `/img/big/`); we extract both so we know which OS bucket to populate.
// Add new sources here when columns are introduced; the script will
// auto-discover the correct size from each row's URL.
const IMAGE_SOURCES: { label: string; sql: string }[] = [
  {
    label: "subcategories.image_url",
    sql: `SELECT image_url AS url FROM subcategories WHERE image_url IS NOT NULL`,
  },
  {
    label: "subcategories.diagram_image_url",
    sql: `SELECT diagram_image_url AS url FROM subcategories WHERE diagram_image_url IS NOT NULL`,
  },
  {
    label: "categories.image_url",
    sql: `SELECT image_url AS url FROM categories WHERE image_url IS NOT NULL`,
  },
  {
    label: "cars.image_url",
    sql: `SELECT image_url AS url FROM cars WHERE image_url IS NOT NULL`,
  },
];

// Case-insensitive on the extension because some upstream HTML mirrors
// `.JPG`. Filename portion is normalized to lowercase before being used
// as a key/path so OS lookups and uploads stay consistent.
const URL_RE = /\/img\/(small|big)\/(?:Ersatzteile)?(\d+\.jpe?g)/i;

async function collectReferences(): Promise<{
  refs: Ref[];
  perSource: Record<string, { rows: number; refs: number; filenames: number }>;
}> {
  const refs: Ref[] = [];
  const perSource: Record<string, { rows: number; refs: number; filenames: number }> = {};
  for (const src of IMAGE_SOURCES) {
    const r = await pool.query<{ url: string }>(src.sql);
    let matched = 0;
    const seen = new Set<string>();
    for (const row of r.rows) {
      const m = URL_RE.exec(row.url);
      if (!m) continue;
      const size = m[1] as "small" | "big";
      const filename = m[2];
      const key = `${size}/${filename}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ source: src.label, size, filename });
      matched++;
    }
    perSource[src.label] = { rows: r.rows.length, refs: matched, filenames: seen.size };
  }
  return { refs, perSource };
}

type DownloadResult =
  | { kind: "ok"; buf: Buffer }
  | { kind: "missing" }
  | { kind: "failed"; reason: string };

async function downloadOne(size: "small" | "big", filename: string): Promise<DownloadResult> {
  const url = `${SOURCE_BASE}/img/${size}/${filename}`;
  let lastErr = "";
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (BMV.parts catalog backfill)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404 || res.status === 410) return { kind: "missing" };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) return { kind: "missing" };
      return { kind: "ok", buf };
    } catch (err) {
      lastErr = (err as Error).message;
      if (attempt === RETRY_LIMIT) {
        console.warn(`  [warn] ${size}/${filename}: ${lastErr}`);
        return { kind: "failed", reason: lastErr };
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return { kind: "failed", reason: lastErr };
}

async function uploadOne(size: "small" | "big", filename: string, buf: Buffer): Promise<boolean> {
  const key = `images/${size}/${filename}`;
  const res = await os.uploadFromBytes(key, buf);
  if (!res.ok) {
    console.warn(`  [warn] OS upload ${key}: ${res.error?.message}`);
    return false;
  }
  return true;
}

async function processJob(job: Job): Promise<"uploaded" | "missing" | "failed"> {
  const dl = await downloadOne(job.size, job.filename);
  if (dl.kind === "missing") return "missing";
  if (dl.kind === "failed") return "failed";
  const ok = await uploadOne(job.size, job.filename, dl.buf);
  return ok ? "uploaded" : "failed";
}

async function runWorker(queue: Job[], stats: Record<string, number>, workerId: number) {
  while (queue.length > 0) {
    const job = queue.pop();
    if (!job) break;
    const result = await processJob(job);
    stats[result]++;
    const total = stats.uploaded + stats.missing + stats.failed;
    if (total % 100 === 0) {
      console.log(
        `[backfill] ${total} processed | uploaded=${stats.uploaded} missing=${stats.missing} failed=${stats.failed} | queue=${queue.length}`
      );
    }
  }
}

async function main() {
  console.log("[backfill] start");
  console.log("[backfill] loading existing OS keys...");
  const [smallExisting, bigExisting] = await Promise.all([
    listExistingKeys("images/small/"),
    listExistingKeys("images/big/"),
  ]);
  console.log(`[backfill] OS has small=${smallExisting.size} big=${bigExisting.size}`);

  console.log("[backfill] enumerating image references across all known columns...");
  const { refs, perSource } = await collectReferences();
  for (const [label, c] of Object.entries(perSource)) {
    console.log(`  - ${label}: rows=${c.rows} matched=${c.refs} unique=${c.filenames}`);
  }
  // Dedupe across sources by (size, filename) so we count work once.
  const uniq = new Map<string, Ref>();
  for (const r of refs) uniq.set(`${r.size}/${r.filename}`, r);
  console.log(`[backfill] DB references ${uniq.size} distinct (size,filename) pairs`);

  const jobs: Job[] = [];
  const missingBySource: Record<string, number> = {};
  for (const r of uniq.values()) {
    const present =
      r.size === "small" ? smallExisting.has(r.filename) : bigExisting.has(r.filename);
    if (!present) {
      jobs.push({ size: r.size, filename: r.filename });
      missingBySource[r.source] = (missingBySource[r.source] ?? 0) + 1;
    }
  }
  const missingSmall = jobs.filter((j) => j.size === "small").length;
  const missingBig = jobs.filter((j) => j.size === "big").length;
  console.log(`[backfill] missing: ${jobs.length} (small=${missingSmall}, big=${missingBig})`);
  for (const [label, count] of Object.entries(missingBySource)) {
    console.log(`  - ${label}: ${count} missing`);
  }

  if (jobs.length === 0) {
    console.log("[backfill] nothing to do");
    await pool.end();
    return;
  }

  const stats: Record<string, number> = { uploaded: 0, missing: 0, failed: 0 };
  const start = Date.now();
  const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
    runWorker(jobs, stats, i)
  );
  await Promise.all(workers);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[backfill] DONE in ${elapsed}s | uploaded=${stats.uploaded} missing=${stats.missing} failed=${stats.failed}`
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
