#!/usr/bin/env node
import { spawn } from "child_process";
import fs from "fs";
import { isValidVin } from "./lib/vin-check-digit.mjs";

const ZIP = process.env.ZIP || "/tmp/tn-mvr.zip";
const ENTRY = process.env.ENTRY || "tn_mvr_2018-2022.csv";
const OUT = process.env.OUT || "/tmp/tn_mvr_bmw_vins.jsonl";

if (!fs.existsSync(ZIP)) { console.error(`zip missing: ${ZIP}`); process.exit(1); }

const BMW_WMI = /^(WBA|WBS|WBY|WBX|WBG|4US|5UX|5UJ|5UM|7LA|7FC)/;
const proc = spawn("unzip", ["-p", ZIP, ENTRY]);
proc.stderr.on("data", () => {});

let total = 0, bmwRaw = 0, kept = 0, badCheckDigit = 0;
const seen = new Set();
const out = fs.createWriteStream(OUT);

let buf = "";
let header = null;
let vinIdx = -1, makeIdx = -1, yearIdx = -1, modelIdx = -1;

proc.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    let line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!header) {
      // strip UTF-8 BOM
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      header = line.split("\t");
      vinIdx = header.indexOf("VIN");
      makeIdx = header.indexOf("MakeCode");
      yearIdx = header.indexOf("ModelYear");
      modelIdx = header.indexOf("ModelCode");
      console.error(`tn-mvr header indices: vin=${vinIdx} make=${makeIdx} year=${yearIdx} model=${modelIdx}`);
      continue;
    }
    total++;
    const f = line.split("\t");
    const make = (f[makeIdx] || "").toUpperCase().trim();
    if (make !== "BMW") continue;
    bmwRaw++;
    const vin = (f[vinIdx] || "").trim().toUpperCase();
    if (vin.length !== 17) continue;
    if (!BMW_WMI.test(vin)) continue;
    if (/X{2,}/i.test(vin.slice(0, 10))) continue;
    if (!isValidVin(vin)) { badCheckDigit++; continue; }
    if (seen.has(vin)) continue;
    seen.add(vin);
    const year = parseInt(f[yearIdx], 10);
    const model = (f[modelIdx] || "").trim();
    out.write(JSON.stringify({ vin, year: Number.isFinite(year) ? year : null, model: model || null }) + "\n");
    kept++;
    if (kept % 500 === 0) console.error(`  kept=${kept} scanned=${total} bmwRaw=${bmwRaw} badCheckDigit=${badCheckDigit}`);
  }
});
proc.on("close", () => {
  out.end();
  console.error(`done: scanned=${total} bmw_rows=${bmwRaw} unique_bmw_vins=${kept}`);
  console.log(JSON.stringify({ scanned: total, bmwRaw, uniqueKept: kept, output: OUT }));
});
