// Upload public/images/{small,big,models,cars,vin}/* to Object Storage with
// high parallelism. Idempotent: skips objects already present. Run repeatedly
// until COMPLETE message appears.
//
// OS layout: images/<subdir>/<filename> mirrors public/images/<subdir>/<filename>

import { Client } from "@replit/object-storage";
import { readdirSync, statSync, existsSync } from "node:fs";

const client = new Client();
const ROOT = "public/images";
const SUBDIRS = ["cars", "small", "big", "models", "vin"];
const CONCURRENCY = 40;
const PREFIX = "images/";

// Build full work list
const work = [];
for (const sub of SUBDIRS) {
  const dir = `${ROOT}/${sub}`;
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    work.push({ src: `${dir}/${name}`, key: `${PREFIX}${sub}/${name}` });
  }
}
const totalBytes = work.reduce((s, w) => { try { return s + statSync(w.src).size; } catch { return s; } }, 0);
console.log(`Found ${work.length} images, ${(totalBytes/1024/1024).toFixed(1)} MB total`);

// Pre-fetch existing object set so we skip without per-file network round-trip
console.log("listing existing objects in OS...");
const existing = new Set();
const r = await client.list({ prefix: PREFIX });
if (!r.ok) throw new Error(`list failed: ${JSON.stringify(r.error)}`);
for (const o of r.value) existing.add(o.name);
console.log(`already in OS: ${existing.size}`);

const tStart = Date.now();
let nextIndex = 0;
let done = 0;
let skipped = 0;
let failed = 0;
const failures = [];

async function worker() {
  while (true) {
    const i = nextIndex++;
    if (i >= work.length) return;
    const { src, key } = work[i];
    if (existing.has(key)) { skipped++; continue; }
    try {
      const r = await client.uploadFromFilename(key, src);
      if (!r.ok) { failed++; failures.push([key, JSON.stringify(r.error)]); continue; }
      done++;
      if ((done + skipped + failed) % 200 === 0) {
        const total = done + skipped + failed;
        const elapsed = (Date.now() - tStart) / 1000;
        const rate = done / Math.max(elapsed, 0.001);
        const remaining = work.length - total;
        const eta = remaining / Math.max(rate, 0.1);
        console.log(`  ${total}/${work.length} (uploaded=${done} skipped=${skipped} failed=${failed}) — ${rate.toFixed(1)}/s — ETA ${(eta/60).toFixed(1)} min`);
      }
    } catch (e) {
      failed++;
      failures.push([key, e.message]);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const totalMin = (Date.now() - tStart) / 60000;
console.log(`COMPLETE in ${totalMin.toFixed(1)} min: uploaded=${done} skipped=${skipped} failed=${failed}`);
if (failed > 0) {
  console.log("first 10 failures:");
  for (const [k, e] of failures.slice(0, 10)) console.log(`  ${k}: ${e}`);
  process.exit(1);
}
console.log("STATUS: SUCCESS");
