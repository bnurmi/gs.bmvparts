#!/usr/bin/env node
// Replays the prior 106-VIN audit through the *current* /api/vin/decode
// (which now includes the RealOEM Tier 1 fallback) and categorizes the
// results. Goal: identify how many holes the fallback closed and where
// real gaps remain.

import { readFile, writeFile } from "fs/promises";

const BASE = process.env.BASE || "http://localhost:5000";
const PRIOR = "/tmp/vin_audit_results.json";

const prior = JSON.parse(await readFile(PRIOR, "utf8"));
const all = prior.results || [];
console.log(`Loaded ${all.length} prior VIN results`);

const buckets = {
  matched_local: [],            // status=matched, no realoem call needed
  matched_via_realoem: [],      // status=matched and realoemFallback.status=confirmed
  chassis_resolved_no_parts: [],// realoem found chassis but we don't carry it
  vin_not_found_upstream: [],   // realoem returned vin_not_found
  fallback_disabled_or_error: [],
  rate_limited: [],
  no_chassis_carried: [],       // local pipeline says "we know chassis but no parts" — and fallback didn't fire
  invalid_vin: [],
  not_bmw: [],
  enriching: [],
  valid_but_unknown: [],
  other: [],
  errors: [],
};

let n = 0;
for (const row of all) {
  n++;
  process.stdout.write(`\r${n}/${all.length} `);
  try {
    const res = await fetch(`${BASE}/api/vin/decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${(n % 250) + 1}` }, // spread across IPs to dodge rate limit
      body: JSON.stringify({ vin: row.vin }),
    });
    const j = await res.json();
    const out = {
      vin: row.vin,
      expected: row.expected,
      priorDecoded: row.decoded,
      newChassis: j.knownChassis,
      decodeStatus: j.decodeStatus,
      matched: j.matchedCars?.length || 0,
      realoem: j.realoemFallback,
      model: row.model,
    };

    const fb = j.realoemFallback;
    if (j.decodeStatus === "matched") {
      if (fb && fb.attempted && fb.status === "confirmed") buckets.matched_via_realoem.push(out);
      else buckets.matched_local.push(out);
    } else if (j.decodeStatus === "chassis_resolved_no_local_parts") {
      buckets.chassis_resolved_no_parts.push(out);
    } else if (fb && fb.status === "vin_not_found") {
      buckets.vin_not_found_upstream.push(out);
    } else if (fb && (fb.status === "disabled" || fb.status === "fetch_error" || fb.status === "budget_exceeded")) {
      buckets.fallback_disabled_or_error.push(out);
    } else if (fb && fb.status === "rate_limited") {
      buckets.rate_limited.push(out);
    } else if (j.decodeStatus === "no_chassis_carried") {
      buckets.no_chassis_carried.push(out);
    } else if (j.decodeStatus === "invalid_vin") {
      buckets.invalid_vin.push(out);
    } else if (j.decodeStatus === "not_bmw") {
      buckets.not_bmw.push(out);
    } else if (j.decodeStatus === "enriching") {
      buckets.enriching.push(out);
    } else if (j.decodeStatus === "valid_but_unknown") {
      buckets.valid_but_unknown.push(out);
    } else {
      buckets.other.push(out);
    }
  } catch (e) {
    buckets.errors.push({ vin: row.vin, error: String(e?.message || e) });
  }
}

process.stdout.write("\n");
const summary = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
console.log("\n=== Re-audit summary (with RealOEM fallback live) ===");
console.log(JSON.stringify(summary, null, 2));

const remaining = [
  ...buckets.chassis_resolved_no_parts.map(r => ({ kind: "chassis_resolved_no_parts", ...r })),
  ...buckets.no_chassis_carried.map(r => ({ kind: "no_chassis_carried", ...r })),
  ...buckets.vin_not_found_upstream.map(r => ({ kind: "vin_not_found_upstream", ...r })),
  ...buckets.invalid_vin.map(r => ({ kind: "invalid_vin", ...r })),
  ...buckets.valid_but_unknown.map(r => ({ kind: "valid_but_unknown", ...r })),
];

console.log(`\n=== Remaining holes (${remaining.length}) ===`);
for (const r of remaining) {
  console.log(`  [${r.kind}] ${r.vin}  expected=${r.expected || "?"}  newChassis=${r.newChassis || "-"}  realoem=${r.realoem?.status || "-"}  model=${r.model || ""}`);
}

await writeFile("/tmp/vin_audit_post_fallback.json", JSON.stringify({ summary, buckets }, null, 2));
console.log("\nFull results: /tmp/vin_audit_post_fallback.json");
