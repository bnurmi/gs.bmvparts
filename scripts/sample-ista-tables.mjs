#!/usr/bin/env node
// For every "worth-importing" table (and every VIN-FA candidate),
// pull a 10-row sample CSV into `data/ista/inventory/samples/` so the
// human writeup in docs/ista-sqlite-inventory.md has something
// concrete to quote.
//
// Read-only; opens the source DBs with `?mode=ro&immutable=1`.
//
// Usage: node scripts/sample-ista-tables.mjs [--rows 10]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CLASS = path.join(ROOT, "data", "ista", "inventory", "classification.json");
const VIN = path.join(ROOT, "data", "ista", "inventory", "vin-fa-candidates.json");
const OUT_DIR = path.join(ROOT, "data", "ista", "inventory", "samples");

const rowsArg = process.argv.indexOf("--rows");
const N = rowsArg > -1 ? Number(process.argv[rowsArg + 1]) || 10 : 10;

function sampleCsv(file, table, n) {
  const uri = `file:${file}?mode=ro&immutable=1`;
  const sql = `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT ${n}`;
  return execFileSync(
    "sqlite3",
    ["-csv", "-header", "-readonly", uri, sql],
    { maxBuffer: 64 * 1024 * 1024, encoding: "utf-8" },
  );
}

function safeFileName(s) {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
}

// Collision-proof sample filename: include a short hash of the full
// relative DB path so two DBs with the same basename in different
// folders don't overwrite each other's samples.
function sampleFileName(relFile, table) {
  const hash = createHash("sha1").update(relFile).digest("hex").slice(0, 8);
  return safeFileName(`${path.basename(relFile)}__${hash}__${table}.csv`);
}

async function main() {
  const cls = JSON.parse(await readFile(CLASS, "utf-8"));
  const vin = JSON.parse(await readFile(VIN, "utf-8"));
  await mkdir(OUT_DIR, { recursive: true });

  const targets = new Map();
  for (const r of cls.buckets["worth-importing"]) {
    targets.set(`${r.file}::${r.table}`, r);
  }
  for (const r of vin.candidates) {
    targets.set(`${r.file}::${r.table}`, r);
  }

  console.log(`[ista-sample] sampling ${targets.size} tables (${N} rows each)`);

  let ok = 0, fail = 0;
  for (const r of targets.values()) {
    const absFile = path.join(ROOT, r.file);
    const outName = sampleFileName(r.file, r.table);
    const outPath = path.join(OUT_DIR, outName);
    try {
      const csv = sampleCsv(absFile, r.table, N);
      await writeFile(outPath, csv);
      ok++;
    } catch (e) {
      await writeFile(outPath + ".err", String(e.message || e));
      fail++;
    }
  }
  console.log(`[ista-sample] wrote ${ok} samples (${fail} failed) into ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
