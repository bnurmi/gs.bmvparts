#!/usr/bin/env node
// Generalized importer: take a JSONL file of {vin, year, model} BMW VIN rows
// and append decoded seed rows to data/seed/vin-cache-backfill.jsonl.
//
// Env:
//   IN              path to jsonl input (required)
//   SOURCE_NAME     e.g. "tn_mvr_backfill" (required) — written to row.source and decoded_data.source
//   FEED_PLATFORM   e.g. "tn_mvr" — written to decoded_data.feedSourcePlatform (required)
//   SEED            seed file path (default data/seed/vin-cache-backfill.jsonl)
//   APPEND=1        append to seed (default: write to /tmp/<source>_seed_rows.jsonl)
//   DRY=1           print preview row only
import fs from "fs";
import { BMW_VDS_PATTERNS, lookupBmwModelsTypeCode } from "../server/vin-decoder.ts";
import { isValidVin } from "./lib/vin-check-digit.mjs";

const M_DIVISION_CHASSIS = new Set([
  "G80","G81","G82","G83","G87","F80","F82","F83","F87",
  "F90","F95","F96","F97","F98","G90","E92N","E93N",
]);
// Cars/SAVs only — WB1/WB3 are BMW Motorrad (motorcycles), excluded.
const BMW_WMI = new Set(["WBA","WBS","WBY","WBX","WBG","4US","5UX","5UJ","5UM","7LA","7FC"]);

async function fastDecode(vin) {
  const vds = vin.slice(3, 7).toUpperCase();
  const wmi = vin.slice(0, 3).toUpperCase();
  const isMDivisionWmi = wmi === "WBS" || wmi === "5UM";
  const pattern = BMW_VDS_PATTERNS[vds];
  const patternIsMCar = !!pattern && M_DIVISION_CHASSIS.has(pattern.chassis);
  const useCurated = !!pattern && (!patternIsMCar || isMDivisionWmi);
  if (useCurated) {
    return {
      chassis: pattern.chassis,
      modelName: pattern.modelName ?? null,
      typeCode: vds,
      typeCodeSource: "vds_pattern",
    };
  }
  const fromBmwModels = await lookupBmwModelsTypeCode(vds);
  if (fromBmwModels) {
    return {
      chassis: fromBmwModels.chassis,
      modelName: fromBmwModels.modelName ?? null,
      typeCode: fromBmwModels.matchedTypeCode,
      typeCodeSource: fromBmwModels.exact ? "bmw_models" : "bmw_models_prefix",
    };
  }
  return { chassis: null, modelName: null, typeCode: vds, typeCodeSource: null };
}

const IN = process.env.IN;
const SOURCE_NAME = process.env.SOURCE_NAME;
const FEED_PLATFORM = process.env.FEED_PLATFORM;
const SEED = process.env.SEED || "data/seed/vin-cache-backfill.jsonl";
const APPEND = process.env.APPEND === "1";
const DRY = process.env.DRY === "1";

if (!IN || !SOURCE_NAME || !FEED_PLATFORM) {
  console.error("required env: IN, SOURCE_NAME, FEED_PLATFORM");
  process.exit(2);
}
if (!fs.existsSync(IN)) { console.error(`missing input ${IN}`); process.exit(1); }

const inRows = fs.readFileSync(IN, "utf8").trim().split("\n").map((l) => JSON.parse(l));
console.log(`loaded ${inRows.length} ${FEED_PLATFORM} BMW VIN rows`);

const existingVins = new Set();
if (fs.existsSync(SEED)) {
  for (const l of fs.readFileSync(SEED, "utf8").trim().split("\n")) {
    if (l) existingVins.add(JSON.parse(l).vin);
  }
}
console.log(`existing seed has ${existingVins.size} VINs`);

const dropped = { wrongMake: 0, alreadySeed: 0, badCheckDigit: 0 };
const seedRows = [];
const decodeStats = { vds_pattern: 0, bmw_models: 0, bmw_models_prefix: 0, none: 0 };

const t0 = Date.now();
let i = 0;
for (const r of inRows) {
  if (!BMW_WMI.has(r.vin.slice(0, 3))) { dropped.wrongMake++; continue; }
  if (!isValidVin(r.vin)) { dropped.badCheckDigit++; continue; }
  if (existingVins.has(r.vin)) { dropped.alreadySeed++; continue; }
  const dec = await fastDecode(r.vin);
  decodeStats[dec.typeCodeSource || "none"] = (decodeStats[dec.typeCodeSource || "none"] || 0) + 1;
  const cleanModel = (r.model || "").replace(/\s+/g, " ").trim() || null;
  seedRows.push({
    vin: r.vin,
    source: SOURCE_NAME,
    enriched_data: null,
    catalog_matches: null,
    decoded_data: {
      isBmw: true,
      plant: null,
      engine: null,
      series: dec.chassis ? `${dec.chassis.replace(/\d.*/, "")} Series` : null,
      source: SOURCE_NAME,
      chassis: dec.chassis,
      feedYear: r.year ?? null,
      typeCode: dec.typeCode,
      decodedAt: new Date().toISOString(),
      feedModel: cleanModel,
      modelName: dec.modelName || cleanModel,
      modelYear: r.year ?? null,
      typeCodeSource: dec.typeCodeSource,
      feedSourcePlatform: FEED_PLATFORM,
    },
    enrichment_source: null,
  });
  if (++i % 5000 === 0) console.log(`  decoded ${i}/${inRows.length}  elapsed=${((Date.now()-t0)/1000).toFixed(1)}s`);
}

console.log(`\ndropped: wrongMake=${dropped.wrongMake} alreadySeed=${dropped.alreadySeed}`);
console.log(`new rows ready: ${seedRows.length}`);
console.log(`decode source breakdown: ${JSON.stringify(decodeStats)}`);
console.log(`with chassis: ${seedRows.filter((r) => r.decoded_data.chassis).length}`);
console.log(`without chassis: ${seedRows.filter((r) => !r.decoded_data.chassis).length}`);

if (DRY) {
  console.log("\n[DRY] preview row:");
  console.log(JSON.stringify(seedRows[0], null, 2));
  process.exit(0);
}

if (seedRows.length === 0) {
  console.log("no new rows; nothing to write");
  process.exit(0);
}

const lines = seedRows.map((r) => JSON.stringify(r)).join("\n") + "\n";
if (APPEND) {
  fs.appendFileSync(SEED, lines);
  console.log(`\nappended ${seedRows.length} rows to ${SEED}`);
} else {
  const outPath = process.env.OUT || `/tmp/${FEED_PLATFORM}_seed_rows.jsonl`;
  fs.writeFileSync(outPath, lines);
  console.log(`\nwrote ${seedRows.length} rows to ${outPath} (use APPEND=1 to merge into seed)`);
}
