#!/usr/bin/env node
// Batch-tests the local /api/vin/decode endpoint against a representative
// VIN per known type code from bmw_models + any real VINs supplied via CLI.
//
// Usage:
//   node scripts/vin_batch_test.mjs                    # uses local DB sample
//   node scripts/vin_batch_test.mjs --base https://bmv.parts
//   node scripts/vin_batch_test.mjs --fixture          # asserts against
//                                                     # scripts/fixtures/realoem-vin-truth.json
//   echo "WBAFW12030C830379\nWBA2C12040V612821" | node scripts/vin_batch_test.mjs --stdin

import { Pool } from "pg";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const args = process.argv.slice(2);
const baseUrl = (() => {
  const i = args.indexOf("--base");
  return i >= 0 ? args[i + 1] : "http://localhost:5000";
})();
const useStdin = args.includes("--stdin");
const useFixture = args.includes("--fixture");
const fixturePath = (() => {
  const i = args.indexOf("--fixture-file");
  if (i >= 0) return args[i + 1];
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "fixtures", "realoem-vin-truth.json");
})();
const sampleEvery = (() => {
  const i = args.indexOf("--every");
  return i >= 0 ? parseInt(args[i + 1], 10) : 1;
})();

// Build a structurally plausible 17-char VIN with the given 4-char type code
// at positions 4-7. WMI=WBA (BMW AG), then type code, fixed check digit (not
// validated by our decoder), plant code V, sequence 612821.
function synthesizeVin(typeCode) {
  const tc = (typeCode || "").padEnd(4, "X").slice(0, 4);
  return `WBA${tc}0V612821`.padEnd(17, "0").slice(0, 17);
}

async function loadTypeCodes() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(`
      SELECT bm.type_code, bm.chassis, bm.model_name,
             EXISTS(SELECT 1 FROM cars c WHERE c.chassis = bm.chassis) AS in_cars
      FROM bmw_models bm
      WHERE bm.type_code IS NOT NULL AND bm.type_code <> ''
      ORDER BY bm.chassis, bm.type_code
    `);
    return r.rows;
  } finally {
    await pool.end();
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () =>
      resolve(
        data
          .split(/\r?\n/)
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length === 17),
      ),
    );
  });
}

async function decodeOne(vin) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/vin/decode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vin }),
      signal: AbortSignal.timeout(60_000),
    });
    const elapsed = Date.now() - t0;
    if (!res.ok) return { vin, ok: false, elapsed, error: `HTTP ${res.status}` };
    const json = await res.json();
    return {
      vin,
      ok: true,
      elapsed,
      status: json.decodeStatus || "?",
      chassis: json.decoded?.chassis || null,
      typeCode: json.decoded?.typeCode || null,
      matched: (json.matchedCars || []).length,
    };
  } catch (e) {
    return { vin, ok: false, elapsed: Date.now() - t0, error: e.message };
  }
}

async function loadFixture() {
  const text = await readFile(fixturePath, "utf-8");
  const json = JSON.parse(text);
  return (json.cases || []).map((c) => ({
    type_code: c.vin.slice(3, 7),
    chassis: c.expectedChassis || "?",
    model_name: c.expectedSeries || "?",
    in_cars: "?",
    vin: c.vin,
    expected: c,
  }));
}

async function main() {
  let cases;
  if (useFixture) {
    cases = await loadFixture();
  } else if (useStdin) {
    const vins = await readStdin();
    cases = vins.map((vin) => ({
      type_code: vin.slice(3, 7),
      chassis: "?",
      model_name: "?",
      in_cars: "?",
      vin,
    }));
  } else {
    const rows = await loadTypeCodes();
    cases = rows
      .filter((_, i) => i % sampleEvery === 0)
      .map((r) => ({ ...r, vin: synthesizeVin(r.type_code) }));
  }

  console.log(`Testing ${cases.length} VINs against ${baseUrl}/api/vin/decode\n`);
  const buckets = {
    matched: 0,
    no_chassis_carried: 0,
    valid_but_unknown: 0,
    enriching: 0,
    invalid_vin: 0,
    not_bmw: 0,
    other: 0,
    error: 0,
  };
  let totalMs = 0,
    slow = 0;
  const gaps = [];
  const mismatches = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const r = await decodeOne(c.vin);
    totalMs += r.elapsed;
    if (r.elapsed > 2000) slow++;
    if (!r.ok) {
      buckets.error++;
      console.log(
        `[${i + 1}/${cases.length}] ${c.vin} (${c.chassis} ${c.model_name})  ERROR ${r.error}  ${r.elapsed}ms`,
      );
      continue;
    }
    const b = buckets[r.status] !== undefined ? r.status : "other";
    buckets[b]++;
    if (r.status === "no_chassis_carried" || r.status === "valid_but_unknown") {
      gaps.push({ chassis: c.chassis, type_code: c.type_code, model_name: c.model_name, status: r.status });
    }

    // Fixture assertion: compare decoded chassis against expected.
    if (c.expected) {
      const exp = c.expected.expectedChassis;
      const actual = r.chassis;
      const chassisOk = !exp || actual === exp;
      const expStatus = c.expected.expectedStatus;
      const statusOk =
        !expStatus ||
        expStatus === r.status ||
        (expStatus.includes("or_matched") && (r.status === "matched" || r.status === "no_chassis_carried"));
      if (!chassisOk || !statusOk) {
        mismatches.push({
          vin: c.vin,
          category: c.expected.category,
          expected: exp,
          actual,
          expectedStatus: expStatus,
          actualStatus: r.status,
        });
      }
      const mark = chassisOk && statusOk ? "PASS" : "FAIL";
      console.log(
        `[${i + 1}/${cases.length}] ${mark} ${c.vin}  exp=${(exp || "?").padEnd(5)} got=${(actual || "?").padEnd(5)} status=${(r.status || "?").padEnd(20)} matches=${r.matched}  ${r.elapsed}ms  (${c.expected.category})`,
      );
    } else if (i < 10 || i % 25 === 0) {
      console.log(
        `[${i + 1}/${cases.length}] ${c.vin}  ${(c.chassis + "/" + c.type_code).padEnd(10)} → ${(r.status || "?").padEnd(20)} matches=${r.matched}  ${r.elapsed}ms`,
      );
    }
  }

  const avgMs = (totalMs / cases.length).toFixed(0);
  console.log("\n=== Summary ===");
  for (const [k, v] of Object.entries(buckets)) {
    if (v > 0) console.log(`  ${k.padEnd(22)} ${v}  (${((v / cases.length) * 100).toFixed(1)}%)`);
  }
  console.log(`\n  avg decode time: ${avgMs}ms`);
  console.log(`  slow (>2s):      ${slow}`);

  if (mismatches.length > 0) {
    console.log(`\n=== Fixture mismatches (${mismatches.length}) ===`);
    for (const m of mismatches) {
      console.log(
        `  [${m.category}] ${m.vin}  expected ${m.expected || "?"} got ${m.actual || "?"}  (status: ${m.expectedStatus || "?"} → ${m.actualStatus})`,
      );
    }
  } else if (useFixture) {
    console.log(`\n=== All ${cases.length} fixture cases passed ===`);
  }

  if (gaps.length > 0) {
    const byChassis = new Map();
    for (const g of gaps) {
      byChassis.set(g.chassis, (byChassis.get(g.chassis) || 0) + 1);
    }
    const sorted = [...byChassis.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n=== Top catalog gaps (chassis decoded but no parts data) ===`);
    for (const [chassis, count] of sorted.slice(0, 25)) {
      console.log(`  ${chassis.padEnd(8)} ${count} type codes`);
    }
  }

  // Non-zero exit when the fixture has any failing case so CI can gate.
  if (useFixture && mismatches.length > 0) return 1;
  return 0;
}

main()
  .then((exitCode) => {
    if (typeof exitCode === "number") process.exit(exitCode);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
