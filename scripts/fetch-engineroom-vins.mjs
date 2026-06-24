#!/usr/bin/env node
// Phase 1: paginate full partsonline feed and dump VIN-bearing rows to JSONL.
import fs from "fs";

const TOKEN = process.env.SCRAPER_API_KEY;
if (!TOKEN) { console.error("SCRAPER_API_KEY missing"); process.exit(2); }

const BASE = "https://engineroom.gearswap.ai";
const UA = "BMV.parts/1.0 (vin-import)";
const PAGE = 500;
const OUT = process.env.OUT || "/tmp/engineroom_partsonline_vins.jsonl";

const seen = new Set();
let kept = 0;
let offset = 0, total = Infinity;
const out = fs.createWriteStream(OUT);
const t0 = Date.now();
while (offset < total) {
  const url = `${BASE}/api/partsonline/listings?make=BMW&limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": UA } });
  if (!res.ok) { console.error(`HTTP ${res.status} at offset ${offset}`); process.exit(3); }
  const j = await res.json();
  total = j.total;
  for (const r of (j.listings || [])) {
    if (!r.vin || seen.has(r.vin)) continue;
    seen.add(r.vin);
    out.write(JSON.stringify({ vin: r.vin, year: r.year, make: r.make, model: r.model }) + "\n");
    kept++;
  }
  offset += PAGE;
  if (offset % 5000 === 0) console.log(`  ${offset}/${total}  uniqueVINs=${kept}  elapsed=${((Date.now()-t0)/1000).toFixed(1)}s`);
}
out.end();
console.log(`Done. ${kept} unique VIN-bearing rows from ${total} total. ${OUT}`);
