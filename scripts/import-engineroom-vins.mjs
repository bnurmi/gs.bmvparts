#!/usr/bin/env node
import fs from "fs";
import { decodeVin } from "../server/vin-decoder.ts";

const TOKEN = process.env.SCRAPER_API_KEY;
if (!TOKEN) { console.error("SCRAPER_API_KEY missing"); process.exit(2); }

const BASE = "https://engineroom.gearswap.ai";
const UA = "BMV.parts/1.0 (vin-import)";
const PAGE = 500;

async function fetchPage(offset) {
  // Paginate the full feed (no make filter) — make field is unreliable for BMW.
  // We re-classify by WMI prefix below.
  const url = `${BASE}/api/partsonline/listings?limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t=>t.slice(0,200))}`);
  return res.json();
}

const seen = new Set();
const rows = [];
let offset = 0, total = Infinity;
while (offset < total) {
  const j = await fetchPage(offset);
  total = j.total;
  for (const r of (j.listings || [])) {
    if (!r.vin || seen.has(r.vin)) continue;
    seen.add(r.vin);
    rows.push({ vin: r.vin, year: r.year, model: r.model });
  }
  offset += PAGE;
  await new Promise(r => setTimeout(r, 250));
}
console.log(`Pulled ${rows.length} unique VIN-bearing rows from ${total} BMW listings.`);

const BMW_WMI = new Set(["WBA", "WBS", "WBY", "WBX", "WBG", "4US"]);
const dropped = { wrongMake: [], badLength: [], redacted: [] };
const cleanRows = [];
for (const r of rows) {
  if (r.vin.length !== 17) { dropped.badLength.push(r); continue; }
  // Only reject when redaction touches WMI/VDS/check (chars 0-9); serial-only redaction is fine.
  if (/X{2,}/i.test(r.vin.slice(0, 10))) { dropped.redacted.push(r); continue; }
  if (!BMW_WMI.has(r.vin.slice(0,3))) { dropped.wrongMake.push(r); continue; }
  cleanRows.push(r);
}
console.log(`Filtered: ${rows.length} → ${cleanRows.length} (dropped: wrongMake=${dropped.wrongMake.length}, badLength=${dropped.badLength.length}, redacted=${dropped.redacted.length})`);
if (dropped.wrongMake.length) console.log("  wrongMake samples:", dropped.wrongMake.slice(0,5).map(r=>r.vin));
if (dropped.badLength.length) console.log("  badLength samples:", dropped.badLength.slice(0,5).map(r=>`${r.vin}(${r.vin.length})`));
if (dropped.redacted.length) console.log("  redacted samples:", dropped.redacted.slice(0,5).map(r=>r.vin));

const decoded = [], failed = [];
for (const r of cleanRows) {
  const d = await decodeVin(r.vin);
  if (d.chassis) decoded.push({ ...r, chassis: d.chassis, source: d.chassisSource });
  else failed.push({ ...r, vds: r.vin.slice(3,7), wmi: r.vin.slice(0,3) });
}
console.log(`Decoded: ${decoded.length}/${rows.length} (${(decoded.length/rows.length*100).toFixed(1)}%)`);
console.log(`Failed: ${failed.length}`);

const vdsFreq = {};
for (const f of failed) vdsFreq[f.vds] = (vdsFreq[f.vds]||0)+1;
console.log("\nTop failing VDS codes:");
Object.entries(vdsFreq).sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([k,v])=>{
  const sample = failed.find(f=>f.vds===k);
  console.log(`  ${k}  ×${v}  e.g. ${sample.vin}  ${sample.model} ${sample.year}`);
});

const out = process.env.OUT || "/tmp/engineroom_vins.json";
fs.writeFileSync(out, JSON.stringify({ rows, decoded, failed }, null, 2));
console.log(`\nFull dump: ${out}`);
