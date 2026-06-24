#!/usr/bin/env node
import { spawn } from "child_process";
import fs from "fs";
import { isValidVin } from "./lib/vin-check-digit.mjs";

const ZIP = process.env.ZIP || "/tmp/marketcheck.zip";
const ENTRIES = (process.env.ENTRIES || "us-dealers-used.csv,ca-dealers-used.csv").split(",");
const OUT = process.env.OUT || "/tmp/marketcheck_bmw_vins.jsonl";

if (!fs.existsSync(ZIP)) { console.error(`zip missing: ${ZIP}`); process.exit(1); }

const BMW_WMI = /^(WBA|WBS|WBY|WBX|WBG|4US|5UX|5UJ|5UM|7LA|7FC)/;

let total = 0, bmwRaw = 0, kept = 0;
const seen = new Set();
const out = fs.createWriteStream(OUT);

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

async function processEntry(entry) {
  return new Promise((resolve) => {
    console.error(`\n[entry] ${entry}`);
    const proc = spawn("unzip", ["-p", ZIP, entry]);
    proc.stderr.on("data", () => {});
    let buf = "";
    let header = null;
    let vinIdx = -1, makeIdx = -1, yearIdx = -1, modelIdx = -1, trimIdx = -1;
    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!header) {
          header = parseCsvLine(line);
          vinIdx = header.indexOf("vin");
          makeIdx = header.indexOf("make");
          yearIdx = header.indexOf("year");
          modelIdx = header.indexOf("model");
          trimIdx = header.indexOf("trim");
          console.error(`  header: vin=${vinIdx} make=${makeIdx} year=${yearIdx} model=${modelIdx} trim=${trimIdx}`);
          continue;
        }
        total++;
        const f = parseCsvLine(line);
        const make = (f[makeIdx] || "").toLowerCase().trim();
        if (make !== "bmw") continue;
        bmwRaw++;
        const vin = (f[vinIdx] || "").trim().toUpperCase();
        if (vin.length !== 17) continue;
        if (!BMW_WMI.test(vin)) continue;
        if (/X{2,}/i.test(vin.slice(0, 10))) continue;
        if (!isValidVin(vin)) continue;
        if (seen.has(vin)) continue;
        seen.add(vin);
        const year = parseInt(f[yearIdx], 10);
        const modelParts = [f[modelIdx], f[trimIdx]].filter(Boolean).map(s => s.trim()).filter(Boolean);
        const model = modelParts.join(" ").trim();
        out.write(JSON.stringify({ vin, year: Number.isFinite(year) ? year : null, model: model || null }) + "\n");
        kept++;
        if (kept % 500 === 0) console.error(`  kept=${kept} scanned=${total} bmwRaw=${bmwRaw}`);
      }
    });
    proc.on("close", () => resolve());
  });
}

for (const entry of ENTRIES) {
  await processEntry(entry);
}
out.end();
console.error(`done: scanned=${total} bmw_rows=${bmwRaw} unique_bmw_vins=${kept}`);
console.log(JSON.stringify({ scanned: total, bmwRaw, uniqueKept: kept, output: OUT }));
