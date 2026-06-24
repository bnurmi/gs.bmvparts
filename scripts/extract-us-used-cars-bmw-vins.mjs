#!/usr/bin/env node
// Robust CSV extractor for us-used-cars (handles multi-line quoted fields).
// We only care about a few short columns (vin, make_name, year, model_name)
// and us-used-cars puts the long quoted "description" field early in the row,
// so we MUST handle embedded newlines inside quotes correctly.
import { spawn } from "child_process";
import fs from "fs";
import { isValidVin } from "./lib/vin-check-digit.mjs";

const ZIP = process.env.ZIP || "/tmp/us-used-cars.zip";
const ENTRY = process.env.ENTRY || "used_cars_data.csv";
const OUT = process.env.OUT || "/tmp/us_used_cars_bmw_vins.jsonl";

if (!fs.existsSync(ZIP)) { console.error(`zip missing: ${ZIP}`); process.exit(1); }

const BMW_WMI = /^(WBA|WBS|WBY|WBX|WBG|4US|5UX|5UJ|5UM|7LA|7FC)/;
const proc = spawn("unzip", ["-p", ZIP, ENTRY]);
proc.stderr.on("data", () => {});

let total = 0, bmwRaw = 0, kept = 0;
const seen = new Set();
const out = fs.createWriteStream(OUT);

let header = null;
let vinIdx = -1, makeIdx = -1, yearIdx = -1, modelIdx = -1, trimIdx = -1;

// Streaming quote-aware CSV row parser.
// Maintains: buffer of bytes, current row's fields, current field text, inQuote state.
// `pendingQuoteAtChunkEnd` handles the edge case where the doubled-quote
// escape sequence (`""`) is split across chunk boundaries: we hit a `"` while
// in-quote at the very last byte of a chunk, so we can't peek the next byte —
// defer the decision until the next chunk arrives.
let curFields = [];
let curField = "";
let inQuote = false;
let pendingQuoteAtChunkEnd = false;

function emitRecord() {
  curFields.push(curField);
  const f = curFields;
  curFields = [];
  curField = "";
  if (!header) {
    header = f;
    vinIdx = header.indexOf("vin");
    makeIdx = header.indexOf("make_name");
    yearIdx = header.indexOf("year");
    modelIdx = header.indexOf("model_name");
    trimIdx = header.indexOf("trim_name");
    console.error(`us-used-cars header: vin=${vinIdx} make=${makeIdx} year=${yearIdx} model=${modelIdx} trim=${trimIdx} cols=${header.length}`);
    return;
  }
  total++;
  const make = (f[makeIdx] || "").toUpperCase().trim();
  if (make !== "BMW") return;
  bmwRaw++;
  const vin = (f[vinIdx] || "").trim().toUpperCase();
  if (vin.length !== 17) return;
  if (!BMW_WMI.test(vin)) return;
  if (/X{2,}/i.test(vin.slice(0, 10))) return;
  if (!isValidVin(vin)) return;
  if (seen.has(vin)) return;
  seen.add(vin);
  const year = parseInt(f[yearIdx], 10);
  const modelParts = [f[modelIdx], f[trimIdx]].filter(Boolean).map(s => s.trim()).filter(Boolean);
  const model = modelParts.join(" ").trim();
  out.write(JSON.stringify({ vin, year: Number.isFinite(year) ? year : null, model: model || null }) + "\n");
  kept++;
  if (kept % 1000 === 0) console.error(`  kept=${kept} scanned=${total} bmwRaw=${bmwRaw}`);
}

proc.stdout.on("data", (chunk) => {
  const s = chunk.toString("utf8");
  let startIdx = 0;
  // Resolve a quote that landed at the previous chunk's last byte.
  if (pendingQuoteAtChunkEnd) {
    pendingQuoteAtChunkEnd = false;
    if (s.length === 0) {
      // empty chunk; defer again
      pendingQuoteAtChunkEnd = true;
    } else if (s[0] === '"') {
      // doubled-quote escape: consume one quote
      curField += '"';
      startIdx = 1;
    } else {
      // standalone closing quote: exit quote mode and process this chunk normally
      inQuote = false;
    }
  }
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === '"') {
        if (i + 1 < s.length) {
          if (s[i+1] === '"') { curField += '"'; i++; }
          else inQuote = false;
        } else {
          // Last byte of chunk is a quote — defer the decision until next chunk.
          pendingQuoteAtChunkEnd = true;
          // (leave inQuote=true; next chunk's first byte resolves it)
        }
      } else {
        curField += c;
      }
    } else {
      if (c === '"') inQuote = true;
      else if (c === ",") { curFields.push(curField); curField = ""; }
      else if (c === "\n") {
        // strip trailing \r
        if (curField.endsWith("\r")) curField = curField.slice(0, -1);
        emitRecord();
      } else {
        curField += c;
      }
    }
  }
});
proc.on("close", () => {
  // emit final partial record if any content
  if (curField.length > 0 || curFields.length > 0) {
    if (curField.endsWith("\r")) curField = curField.slice(0, -1);
    emitRecord();
  }
  out.end();
  console.error(`done: scanned=${total} bmw_rows=${bmwRaw} unique_bmw_vins=${kept}`);
  console.log(JSON.stringify({ scanned: total, bmwRaw, uniqueKept: kept, output: OUT }));
});
