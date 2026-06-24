#!/usr/bin/env node
// Probe the live decode pipeline with a list of real production VINs.
// Reads VINs from the attached pasted file, hits /api/vin/decode for each,
// categorizes the result, and reports holes.

import { readFile, writeFile } from "fs/promises";

const BASE = process.env.BASE || "http://localhost:5000";
const SRC = process.env.SRC || process.argv[2] || "attached_assets/Pasted--PI-62246429-2016-M4-WBS3U920505A07866-PI-62249947-2025_1776841518571.txt";

const text = await readFile(SRC, "utf8");
const rows = [];
for (const line of text.split("\n")) {
  // Lines look like: | PI-62246429 | 2016 | M4 | WBS3U920505A07866 |
  const m = line.match(/\|\s*PI-\d+\s*\|\s*(\d{4})\s*\|\s*([^|]+?)\s*\|\s*([A-Z0-9]{17})\s*\|/);
  if (m) rows.push({ year: m[1], model: m[2].trim(), vin: m[3].trim() });
}
console.log(`Parsed ${rows.length} VINs`);

async function probe(r) {
  try {
    const res = await fetch(`${BASE}/api/vin/decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin: r.vin }),
      signal: AbortSignal.timeout(90_000),
    });
    const j = await res.json();
    return {
      vin: r.vin, year: r.year, model: r.model,
      decodedChassis: j.decoded?.chassis,
      knownChassis: j.knownChassis,
      decodeStatus: j.decodeStatus,
      matched: j.matchedCars?.length || 0,
      totalParts: (j.matchedCars || []).reduce((s, c) => s + (c.totalParts || 0), 0),
      realoem: j.realoemFallback,
    };
  } catch (e) {
    return { vin: r.vin, year: r.year, model: r.model, error: String(e?.message || e) };
  }
}

const CONCURRENCY = 8;
const out = [];
let done = 0;
async function worker(queue) {
  while (queue.length) {
    const r = queue.shift();
    if (!r) return;
    const result = await probe(r);
    out.push(result);
    done++;
    if (done % 8 === 0) process.stdout.write(`\r${done}/${rows.length} `);
  }
}
const queue = rows.slice();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
process.stdout.write(`\r${done}/${rows.length}\n`);

const buckets = {};
for (const r of out) {
  const key = r.error ? "error"
    : r.decodeStatus === "matched" && r.realoem?.status === "confirmed" ? "matched_via_realoem"
    : r.decodeStatus === "matched" ? "matched_local"
    : r.decodeStatus === "chassis_resolved_no_local_parts" ? "chassis_resolved_no_parts"
    : r.realoem?.status === "vin_not_found" ? "vin_not_found_upstream"
    : r.realoem?.status === "rate_limited" ? "rate_limited"
    : r.realoem?.status === "fetch_error" ? "fetch_error"
    : r.decodeStatus || "unknown";
  (buckets[key] = buckets[key] || []).push(r);
}

console.log("\n=== Summary ===");
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(32)} ${v.length}`);
}

const holes = [
  ...(buckets.chassis_resolved_no_parts || []),
  ...(buckets.no_chassis_carried || []),
  ...(buckets.vin_not_found_upstream || []),
  ...(buckets.invalid_vin || []),
  ...(buckets.valid_but_unknown || []),
  ...(buckets.fetch_error || []),
  ...(buckets.rate_limited || []),
  ...(buckets.error || []),
];

if (holes.length) {
  console.log(`\n=== ${holes.length} VINs without a parts match ===`);
  for (const r of holes) {
    const tag = r.error ? "ERROR"
      : r.decodeStatus === "chassis_resolved_no_local_parts" ? "no-local-parts"
      : r.realoem?.status || r.decodeStatus;
    console.log(`  [${tag.padEnd(20)}] ${r.vin}  ${r.year} ${r.model.padEnd(12)}  decoded=${r.decodedChassis||"-"}  known=${r.knownChassis||"-"}`);
  }
}

// Coverage stats
const matched = (buckets.matched_local?.length || 0) + (buckets.matched_via_realoem?.length || 0);
console.log(`\nCoverage: ${matched}/${rows.length} (${(matched / rows.length * 100).toFixed(1)}%) returned at least one matched car.`);

// Models with holes
if (holes.length) {
  const byModel = {};
  for (const r of holes) byModel[r.model] = (byModel[r.model] || 0) + 1;
  console.log(`\nHoles by model:`);
  for (const [m, c] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(20)} ${c}`);
  }
}

await writeFile("/tmp/real_vin_probe.json", JSON.stringify({ buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])), results: out }, null, 2));
console.log("\nFull results: /tmp/real_vin_probe.json");
