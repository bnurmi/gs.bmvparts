#!/usr/bin/env node
// Comprehensive VIN audit. Scans every type code in bmw_models and every
// chassis in the cars table, decodes a synthesized representative VIN per
// type code, and classifies the result into one of four buckets:
//
//   correct       — decoded chassis equals the bmw_models chassis AND the
//                   matcher returned at least one car
//   mismatches    — decoded chassis differs from the bmw_models chassis
//   synonymOnly   — decoder matched, but only via the LCI fallback or fuzzy
//                   layer (the strict chassis stage produced 0 candidates)
//   catalogOnly   — chassis exists in cars but no bmw_models entry maps to
//                   it, so no VIN can ever decode to it
//   missing       — chassis decoded successfully but the catalog does not
//                   carry it (no cars rows)
//
// Counts are persisted to scripts/fixtures/audit-baseline.json so before/after
// regressions can be compared in CI.
//
// Usage:
//   node scripts/vin_audit.mjs                             # uses local server
//   node scripts/vin_audit.mjs --base https://bmv.parts
//   node scripts/vin_audit.mjs --save                      # writes baseline
//   node scripts/vin_audit.mjs --compare                   # diffs vs baseline
//   node scripts/vin_audit.mjs --limit 200                 # cap rows

import { Pool } from "pg";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function arg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}

const baseUrl = arg("--base", "http://localhost:5000");
const limit = parseInt(arg("--limit", "0"), 10) || 0;
// --sample N caps how many type codes per chassis we audit. Default 0 = full
// scan (every type code in bmw_models). The CI baseline runs full so any
// regression in any individual VDS code is caught.
const samplePerChassis = parseInt(arg("--sample", "0"), 10) || 0;
const baselinePath = arg(
  "--baseline",
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "audit-baseline.json"),
);
const save = flag("--save");
const compare = flag("--compare");

// Synthesize a structurally valid 17-char VIN that puts the model-year char
// at position 10 so the decoder's year-aware logic exercises the right path.
// Format: WMI(3) + tc(4) + filler(2) + year(1) + plant(1) + seq(6) = 17.
function synthesizeVin(typeCode, modelYear, isMCar) {
  const tc = (typeCode || "").padEnd(4, "X").slice(0, 4);
  const wmi = isMCar ? "WBS" : "WBA";
  const yearChar = modelYearToChar(modelYear);
  const plant = "V";
  const seq = "123456";
  return `${wmi}${tc}00${yearChar}${plant}${seq}`;
}

const YEAR_TO_CHAR = {
  2010: "A", 2011: "B", 2012: "C", 2013: "D", 2014: "E", 2015: "F", 2016: "G",
  2017: "H", 2018: "J", 2019: "K", 2020: "L", 2021: "M", 2022: "N", 2023: "P",
  2024: "R", 2025: "S", 2026: "T", 2027: "V", 2028: "W", 2029: "X", 2030: "Y",
  2001: "1", 2002: "2", 2003: "3", 2004: "4", 2005: "5", 2006: "6", 2007: "7",
  2008: "8", 2009: "9", 2000: "0",
};

function modelYearToChar(year) {
  if (!year || year < 2000) return "L"; // default 2020
  return YEAR_TO_CHAR[year] || "L";
}

// Pick a sane representative model year per chassis. For LCI chassis (with
// trailing N) pick a year well into the LCI window so the decoder + matcher
// exercise the LCI variant path.
function representativeYear(chassis) {
  if (!chassis) return 2020;
  const upper = chassis.toUpperCase();
  const isLci = upper.endsWith("N");
  const base = isLci ? upper.slice(0, -1) : upper;
  const RANGES = {
    E36: [1991, 1999], E39: [1996, 2003], E46: [1999, 2006],
    E60: [2003, 2007], E60N: [2008, 2010],
    E70: [2007, 2009], E70N: [2010, 2013],
    E81: [2004, 2006], E81N: [2007, 2011],
    E82: [2007, 2007], E82N: [2008, 2013],
    E87: [2004, 2006], E87N: [2007, 2011],
    E88: [2008, 2007], E88N: [2008, 2013],
    E83: [2003, 2005], E83N: [2006, 2010],
    E90: [2005, 2008], E90N: [2009, 2011],
    E91: [2006, 2008], E91N: [2009, 2012],
    E92: [2007, 2009], E92N: [2010, 2013],
    E93: [2007, 2009], E93N: [2010, 2013],
    F10: [2010, 2013], F10N: [2014, 2017],
    F11: [2010, 2013], F11N: [2014, 2017],
    F20: [2012, 2014], F20N: [2015, 2019],
    F22: [2014, 2017], F22N: [2018, 2021],
    F30: [2012, 2015], F30N: [2016, 2019],
    F31: [2013, 2015], F31N: [2016, 2019],
    F32: [2014, 2016], F32N: [2017, 2020],
    F33: [2014, 2016], F33N: [2017, 2020],
    F36: [2014, 2016], F36N: [2017, 2020],
    F45: [2015, 2017], F45N: [2018, 2022],
    F48: [2016, 2018], F48N: [2019, 2022],
    G80: [2021, 2024], G81: [2023, 2024], G82: [2021, 2024],
    G83: [2021, 2024], G87: [2023, 2024],
    F80: [2014, 2018], F82: [2014, 2020], F83: [2014, 2020],
    F87: [2016, 2017], F87N: [2018, 2021], F90: [2018, 2024],
  };
  const [start, end] = RANGES[upper] || RANGES[base] || [2018, 2020];
  return Math.floor((start + end) / 2);
}

const M_DIVISION_PREFIXES = ["G80", "G81", "G82", "G83", "G87", "F80", "F82", "F83", "F87", "F90", "F91", "F92", "F93", "F95", "F96", "F97", "F98"];
function isMChassis(chassis) {
  if (!chassis) return false;
  const c = chassis.toUpperCase().replace(/N$/, "");
  return M_DIVISION_PREFIXES.includes(c);
}

async function loadVdsPatternChassis() {
  const src = await readFile(path.join(here, "..", "server", "vin-decoder.ts"), "utf-8");
  const set = new Set();
  for (const m of src.matchAll(/chassis:\s*"([A-Z0-9]+)"/g)) set.add(m[1]);
  return set;
}
const here = path.dirname(fileURLToPath(import.meta.url));

async function loadAuditInputs() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Default: full scan over every bmw_models type code so the CI baseline
    // catches drift on any individual VDS code, not just per-chassis samples.
    // Pass `--sample N` to cap to N type codes per chassis when iterating
    // locally (useful for fast feedback during decoder edits).
    const sampleClause = samplePerChassis > 0 ? `WHERE rn <= ${samplePerChassis}` : "";
    const types = await pool.query(`
      SELECT type_code, chassis, model_name FROM (
        SELECT type_code, chassis, model_name,
               ROW_NUMBER() OVER (PARTITION BY chassis ORDER BY type_code) AS rn
        FROM bmw_models
        WHERE type_code IS NOT NULL AND type_code <> ''
      ) t
      ${sampleClause}
      ORDER BY chassis, type_code
    `);
    const carsChassis = await pool.query(`
      SELECT chassis, COUNT(*) AS car_count
      FROM cars
      WHERE chassis IS NOT NULL AND chassis <> ''
      GROUP BY chassis
    `);
    const decoderChassis = await pool.query(`
      SELECT DISTINCT chassis FROM bmw_models WHERE chassis IS NOT NULL
    `);
    return {
      typeCodes: types.rows,
      carsChassis: new Map(carsChassis.rows.map((r) => [r.chassis, parseInt(r.car_count, 10)])),
      decoderChassis: new Set(decoderChassis.rows.map((r) => r.chassis)),
    };
  } finally {
    await pool.end();
  }
}

async function decodeOne(vin) {
  try {
    const res = await fetch(`${baseUrl}/api/vin/decode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vin }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    return {
      ok: true,
      status: json.decodeStatus,
      chassis: json.decoded?.chassis || null,
      typeCode: json.decoded?.typeCode || null,
      typeCodeSource: json.decoded?.typeCodeSource || null,
      matched: (json.matchedCars || []).length,
      selectedStage: json.matchTrace?.selectedStage || null,
      stages: json.matchTrace?.stages || [],
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  const inputs = await loadAuditInputs();
  const rows = limit > 0 ? inputs.typeCodes.slice(0, limit) : inputs.typeCodes;

  console.log(`Auditing ${rows.length} type codes against ${baseUrl}`);
  const buckets = {
    correct: 0,
    mismatches: 0,
    synonymOnly: 0,
    missing: 0,
    error: 0,
  };
  const mismatchSamples = [];
  const synonymSamples = [];
  const missingSamples = [];

  let processed = 0;
  const CONCURRENCY = 10;
  async function processRow(row) {
    const expectedChassis = row.chassis;
    const year = representativeYear(expectedChassis);
    const vin = synthesizeVin(row.type_code, year, isMChassis(expectedChassis));
    const r = await decodeOne(vin);
    return { row, vin, expectedChassis, r };
  }
  // Process in concurrency batches
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processRow));
    for (const { row, vin, expectedChassis, r } of results) {
    processed++;
    if (!r.ok) {
      buckets.error++;
      continue;
    }
    if (r.chassis !== expectedChassis) {
      // Allow LCI sibling: E60 expected, decoded E60N (same vehicle, year-correct).
      const a = (r.chassis || "").toUpperCase();
      const b = (expectedChassis || "").toUpperCase();
      const sameLciFamily =
        a && b && (a === b + "N" || b === a + "N");
      if (sameLciFamily && r.matched > 0) {
        buckets.correct++;
      } else {
        buckets.mismatches++;
        if (mismatchSamples.length < 30) {
          mismatchSamples.push({ vin, expected: expectedChassis, got: r.chassis, model: row.model_name, status: r.status });
        }
      }
    } else if (r.matched === 0) {
      buckets.missing++;
      if (missingSamples.length < 20) {
        missingSamples.push({ vin, chassis: r.chassis, status: r.status });
      }
    } else if (r.selectedStage && (r.selectedStage.includes("fallback") || r.selectedStage.startsWith("fuzzy"))) {
      buckets.synonymOnly++;
      if (synonymSamples.length < 20) {
        synonymSamples.push({ vin, chassis: r.chassis, stage: r.selectedStage });
      }
    } else {
      buckets.correct++;
    }

    if (processed % 100 === 0) {
      const pct = ((processed / rows.length) * 100).toFixed(1);
      process.stdout.write(`\r  ${processed}/${rows.length} (${pct}%) correct=${buckets.correct} mismatch=${buckets.mismatches} synonym=${buckets.synonymOnly} missing=${buckets.missing}`);
    }
    }
  }
  console.log();

  // Catalog-only: chassis in cars table but never produced by any decoder
  // route (neither bmw_models nor BMW_VDS_PATTERNS). Many catalog chassis
  // are reachable only via VDS_PATTERNS (e.g. G80/G82/F95) so we union both
  // sources before computing the gap.
  const decoderReachable = new Set([
    ...inputs.decoderChassis,
    ...await loadVdsPatternChassis(),
  ]);
  const catalogOnly = [];
  for (const [chassis, count] of inputs.carsChassis) {
    if (!decoderReachable.has(chassis)) {
      catalogOnly.push({ chassis, carCount: count });
    }
  }
  catalogOnly.sort((a, b) => b.carCount - a.carCount);

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    totalTypeCodes: rows.length,
    buckets: { ...buckets, catalogOnly: catalogOnly.length },
    catalogOnly,
    samples: {
      mismatches: mismatchSamples,
      synonymOnly: synonymSamples,
      missing: missingSamples,
    },
  };

  console.log("\n=== Audit summary ===");
  console.log(JSON.stringify(report.buckets, null, 2));
  if (mismatchSamples.length) {
    console.log(`\nMismatch samples (first ${mismatchSamples.length}):`);
    for (const m of mismatchSamples.slice(0, 10)) {
      console.log(`  ${m.vin}  expected=${m.expected}  got=${m.got}  ${m.model}`);
    }
  }
  if (catalogOnly.length) {
    console.log(`\nCatalog-only chassis (${catalogOnly.length}):`);
    for (const c of catalogOnly) console.log(`  ${c.chassis}  ${c.carCount} cars`);
  }

  if (save) {
    await mkdir(path.dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, JSON.stringify(report, null, 2));
    console.log(`\nSaved baseline → ${baselinePath}`);
  }

  if (compare && existsSync(baselinePath)) {
    const prev = JSON.parse(await readFile(baselinePath, "utf-8"));
    console.log("\n=== Before/after vs baseline ===");
    for (const [k, v] of Object.entries(report.buckets)) {
      const before = prev.buckets?.[k] ?? 0;
      const delta = v - before;
      const sign = delta > 0 ? "+" : "";
      console.log(`  ${k.padEnd(14)} before=${String(before).padEnd(5)} after=${String(v).padEnd(5)} delta=${sign}${delta}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
