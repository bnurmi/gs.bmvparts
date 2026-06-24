#!/usr/bin/env node
import { spawn } from "child_process";
import fs from "fs";

const ZIP = process.env.ZIP || "/tmp/cl.zip";
const OUT = process.env.OUT || "/tmp/cl_bmw_vins.jsonl";

if (!fs.existsSync(ZIP)) { console.error(`zip missing: ${ZIP}`); process.exit(1); }

const BMW_WMI = /^(WBA|WBS|WBY|WBX|WBG|4US|5UX|5UJ|5UM|7LA|7FC|WB1|WB3)/;
const proc = spawn("unzip", ["-p", ZIP, "vehicles.csv"]);
proc.stderr.on("data", () => {});

let total = 0, bmwRaw = 0, kept = 0;
const seen = new Set();
const out = fs.createWriteStream(OUT);

let buf = "";
let header = null;
let manufIdx = -1, vinIdx = -1, yearIdx = -1, modelIdx = -1;

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

proc.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!header) {
      header = parseCsvLine(line);
      manufIdx = header.indexOf("manufacturer");
      vinIdx = header.indexOf("VIN");
      yearIdx = header.indexOf("year");
      modelIdx = header.indexOf("model");
      console.error(`header indices: manuf=${manufIdx} vin=${vinIdx} year=${yearIdx} model=${modelIdx}`);
      continue;
    }
    total++;
    const f = parseCsvLine(line);
    const mfg = (f[manufIdx] || "").toLowerCase().trim();
    if (mfg !== "bmw") continue;
    bmwRaw++;
    const vin = (f[vinIdx] || "").trim().toUpperCase();
    if (vin.length !== 17) continue;
    if (!BMW_WMI.test(vin)) continue;
    if (/X{2,}/i.test(vin.slice(0, 10))) continue;
    if (seen.has(vin)) continue;
    seen.add(vin);
    const year = parseInt(f[yearIdx], 10);
    const model = (f[modelIdx] || "").trim();
    out.write(JSON.stringify({ vin, year: Number.isFinite(year) ? year : null, model: model || null }) + "\n");
    kept++;
    if (kept % 500 === 0) console.error(`  kept=${kept} scanned=${total} bmwRaw=${bmwRaw}`);
  }
});
proc.on("close", () => {
  out.end();
  console.error(`done: scanned=${total} bmw_rows=${bmwRaw} unique_bmw_vins=${kept}`);
  console.log(JSON.stringify({ scanned: total, bmwRaw, uniqueKept: kept, output: OUT }));
});
