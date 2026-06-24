#!/usr/bin/env node
// Phase 2: read JSONL of VINs, classify, decode (chassis-only, fast — skips NHTSA fetch).
import fs from "fs";
import { BMW_VDS_PATTERNS, lookupBmwModelsTypeCode } from "../server/vin-decoder.ts";

const M_DIVISION_CHASSIS = new Set([
  "G80","G81","G82","G83","G87","F80","F82","F83","F87",
  "F90","F95","F96","F97","F98","G90","E92N","E93N",
]);

async function fastChassisDecode(vin) {
  const vds = vin.slice(3, 7).toUpperCase();
  const wmi = vin.slice(0, 3).toUpperCase();
  const isMDivisionWmi = wmi === "WBS" || wmi === "5UM";
  const pattern = BMW_VDS_PATTERNS[vds];
  const patternIsMCar = !!pattern && M_DIVISION_CHASSIS.has(pattern.chassis);
  const useCurated = !!pattern && (!patternIsMCar || isMDivisionWmi);
  if (useCurated) return { chassis: pattern.chassis, source: "vds_pattern", typeCode: vds };
  const fromBmwModels = await lookupBmwModelsTypeCode(vds);
  if (fromBmwModels) return { chassis: fromBmwModels.chassis, source: fromBmwModels.exact ? "bmw_models" : "bmw_models_prefix", typeCode: fromBmwModels.matchedTypeCode };
  return { chassis: null };
}

const IN = process.env.IN || "/tmp/engineroom_salvage_vins.jsonl";
const OUT = process.env.OUT || "/tmp/engineroom_salvage_decoded.json";

const rows = fs.readFileSync(IN, "utf-8").trim().split("\n").map(l => JSON.parse(l));
console.log(`Loaded ${rows.length} VIN rows from ${IN}`);

const BMW_WMI = new Set(["WBA","WBS","WBY","WBX","WBG","4US"]);
const dropped = { wrongMake: [], badLength: [], redacted: [] };
const cleanRows = [];
for (const r of rows) {
  if (r.vin.length !== 17) { dropped.badLength.push(r); continue; }
  if (/X{2,}/i.test(r.vin.slice(0,10))) { dropped.redacted.push(r); continue; }
  if (!BMW_WMI.has(r.vin.slice(0,3))) { dropped.wrongMake.push(r); continue; }
  cleanRows.push(r);
}
console.log(`Filtered: ${rows.length} → ${cleanRows.length}  (wrongMake=${dropped.wrongMake.length}, badLength=${dropped.badLength.length}, criticalRedaction=${dropped.redacted.length})`);

const t0 = Date.now();
const decoded = [], failed = [];
let i = 0;
for (const r of cleanRows) {
  const d = await fastChassisDecode(r.vin);
  if (d.chassis) decoded.push({ ...r, chassis: d.chassis, source: d.source, typeCode: d.typeCode });
  else failed.push({ ...r, vds: r.vin.slice(3,7), wmi: r.vin.slice(0,3) });
  if (++i % 200 === 0) console.log(`  ${i}/${cleanRows.length}  elapsed=${((Date.now()-t0)/1000).toFixed(1)}s`);
}
console.log(`\nDecoded: ${decoded.length}/${cleanRows.length} (${(decoded.length/cleanRows.length*100).toFixed(2)}%)`);
console.log(`Failed:  ${failed.length}`);

const vdsFreq = {};
for (const f of failed) (vdsFreq[f.vds] ??= []).push(f);
const top = Object.entries(vdsFreq).sort((a,b)=>b[1].length-a[1].length);
console.log(`\nTop failing VDS codes (${top.length} unique):`);
top.slice(0, 50).forEach(([k, arr]) => {
  const sample = arr[0];
  const models = [...new Set(arr.map(f => f.model).filter(Boolean))].slice(0, 3).join(" | ") || "—";
  const years = [...new Set(arr.map(f => f.year).filter(Boolean))].sort().slice(0, 4).join(",") || "—";
  console.log(`  ${k}  ×${arr.length}  models=[${models}]  years=[${years}]  sample=${sample.vin}`);
});

const srcFreq = {};
for (const d of decoded) srcFreq[d.source || "unknown"] = (srcFreq[d.source || "unknown"]||0) + 1;
console.log(`\nDecode source breakdown:`);
Object.entries(srcFreq).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

fs.writeFileSync(OUT, JSON.stringify({ decoded, failed, dropped, summary: { total: rows.length, clean: cleanRows.length, decoded: decoded.length, failed: failed.length } }, null, 2));
console.log(`\nFull dump: ${OUT}`);
process.exit(0);
