// Upload data/export-chunks/* and data/export-manifest.json to Object Storage.
// Idempotent: re-running skips files already in OS. Safe for large fan-out
// because each chunk is well under the SDK's ~1 GB silent-fail threshold.

import { Client } from "@replit/object-storage";
import { readdirSync, statSync, existsSync, appendFileSync } from "node:fs";

const LOG = "/tmp/upload.log";
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { appendFileSync(LOG, line); } catch {}
}

const client = new Client();
const SRC_DIR = "data/export-chunks";
const SRC_MANIFEST = "data/export-manifest.json";
const DST_PREFIX = "export/chunks/";
const DST_MANIFEST = "export/export-manifest.json";

if (!existsSync(SRC_DIR) || !existsSync(SRC_MANIFEST)) {
  log("missing source files; aborting");
  process.exit(1);
}

const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".json")).sort();
const totalBytes = files.reduce((s, f) => s + statSync(`${SRC_DIR}/${f}`).size, 0);
log(`Uploading ${files.length} chunks (${(totalBytes/1024/1024).toFixed(1)} MB) + manifest`);

const tStart = Date.now();
let done = 0;
let bytesUploaded = 0;
const failures = [];

for (let i = 0; i < files.length; i++) {
  const name = files[i];
  const src = `${SRC_DIR}/${name}`;
  const dst = `${DST_PREFIX}${name}`;
  const sz = statSync(src).size;
  try {
    const ex = await client.exists(dst);
    if (ex.ok && ex.value) {
      log(`[${i+1}/${files.length}] skip ${name} (already in OS)`);
      done++; bytesUploaded += sz; continue;
    }
  } catch {}
  const t0 = Date.now();
  try {
    const r = await client.uploadFromFilename(dst, src);
    if (!r.ok) { failures.push([dst, JSON.stringify(r.error)]); log(`[${i+1}/${files.length}] FAIL ${name}: ${JSON.stringify(r.error)}`); continue; }
    const dt = (Date.now() - t0) / 1000;
    done++; bytesUploaded += sz;
    const elapsed = (Date.now() - tStart) / 1000;
    const eta = bytesUploaded > 0 ? elapsed * (totalBytes / bytesUploaded - 1) : 0;
    log(`[${i+1}/${files.length}] ${name} (${(sz/1024/1024).toFixed(1)} MB) in ${dt.toFixed(1)}s — ETA ${(eta/60).toFixed(1)} min`);
  } catch (e) {
    failures.push([dst, e.message]);
    log(`[${i+1}/${files.length}] EXCEPTION ${name}: ${e.message}`);
  }
}

// Manifest last so its presence signals a complete upload set.
log(`uploading manifest -> ${DST_MANIFEST}`);
const mr = await client.uploadFromFilename(DST_MANIFEST, SRC_MANIFEST);
if (!mr.ok) { log(`MANIFEST FAILED: ${JSON.stringify(mr.error)}`); failures.push([DST_MANIFEST, JSON.stringify(mr.error)]); }

const totalMin = (Date.now() - tStart) / 60000;
log(`COMPLETE in ${totalMin.toFixed(1)} min, ${done}/${files.length} chunks ok, ${failures.length} failures`);
log(`STATUS: ${failures.length === 0 ? "SUCCESS" : "PARTIAL"}`);
