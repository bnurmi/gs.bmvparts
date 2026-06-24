#!/usr/bin/env node
// Render `docs/ista-sqlite-inventory.md` from the live JSON artefacts
// produced by enumerate-ista-sqlite.mjs, classify-ista-tables.mjs,
// and sample-ista-tables.mjs.
//
// The doc has three personas it serves:
//   1. The author of the next planning round — they need the
//      per-VIN FA verdict at the very top, then the prioritised
//      "worth importing" list with row deltas.
//   2. A future agent picking the work back up — they need the raw
//      inventory + classification visible inline so they don't have
//      to re-run the pipeline to remember what's there.
//   3. Anyone auditing scope — they need the explicit "not useful"
//      list so we never re-investigate diagnostics tables.
//
// Usage: node scripts/render-ista-inventory-doc.mjs
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const INV = path.join(ROOT, "data", "ista", "inventory", "inventory.json");
const CLASS = path.join(ROOT, "data", "ista", "inventory", "classification.json");
const VIN = path.join(ROOT, "data", "ista", "inventory", "vin-fa-candidates.json");
const SAMPLES_DIR = path.join(ROOT, "data", "ista", "inventory", "samples");
const OUT = path.join(ROOT, "docs", "ista-sqlite-inventory.md");

function fmtBytes(n) {
  if (n == null) return "?";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

async function readSample(file, table) {
  // Mirror sample-ista-tables.mjs::sampleFileName so the renderer
  // looks at the same path the sampler wrote.
  const hash = createHash("sha1").update(file).digest("hex").slice(0, 8);
  const safe = `${path.basename(file)}__${hash}__${table}.csv`
    .replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  const p = path.join(SAMPLES_DIR, safe);
  if (!existsSync(p)) return null;
  const raw = await readFile(p, "utf-8");
  // limit doc size: first ~12 lines of the CSV
  return raw.split(/\r?\n/).slice(0, 12).join("\n");
}

async function main() {
  if (!existsSync(INV)) {
    console.error(`[ista-doc] missing ${INV}; run scripts/enumerate-ista-sqlite.mjs first`);
    process.exit(2);
  }
  const inv = JSON.parse(await readFile(INV, "utf-8"));
  const cls = existsSync(CLASS) ? JSON.parse(await readFile(CLASS, "utf-8")) : null;
  const vin = existsSync(VIN) ? JSON.parse(await readFile(VIN, "utf-8")) : null;

  const lines = [];
  lines.push(`# ISTA+ SQLite inventory (Task #105)`);
  lines.push("");
  lines.push(`Generated from \`data/ista/inventory/*.json\` on ${inv.generatedAt}.`);
  lines.push(`Re-render with \`bash scripts/ista-pipeline.sh\` (or \`node scripts/render-ista-inventory-doc.mjs\` if just the doc needs refreshing).`);
  lines.push("");
  lines.push(`> **Scope guard.** Everything in this doc is exploration-only. No ISTA+ data has been imported into PostgreSQL or any user-facing surface. The full extracted tree lives under the gitignored quarantine \`data/ista/extracted/\`. Promotion of any "worth importing" table is a separate, planned task.`);
  lines.push("");

  // ---- Per-VIN FA verdict (top of doc, per task spec) -------------------
  lines.push(`## Per-VIN FA verdict`);
  lines.push("");
  if (!vin) {
    lines.push(`_Not yet computed — run \`node scripts/classify-ista-tables.mjs\`._`);
  } else if (vin.candidates.length === 0) {
    lines.push(`**No.** No table in any ISTA+ SQLite database carries a VIN-shaped column or an FA-shaped column. ISTA+ does not ship a static per-VIN factory-order table; per-VIN FA must continue to come from PartsLink24 / the ETK FA dump pipeline (\`server/etk-vin-fa.ts\`).`);
  } else {
    lines.push(`**Candidate tables found — review required before final yes/no:**`);
    lines.push("");
    lines.push(`| File | Table | Rows | Cols | VIN-shaped | FA-shaped |`);
    lines.push(`| --- | --- | ---: | ---: | :---: | :---: |`);
    for (const c of vin.candidates) {
      lines.push(`| \`${c.file}\` | \`${c.table}\` | ${c.rowCount ?? "?"} | ${c.columns} | ${c.vinKeyed ? "✓" : ""} | ${c.fa ? "✓" : ""} |`);
    }
    lines.push("");
    lines.push(`Each candidate needs a manual sample-row review (CSVs in \`data/ista/inventory/samples/\`) to decide whether it's a static dataset (useful) or a runtime cache stub (not useful). Final verdict to be entered here.`);
  }
  lines.push("");

  // ---- Storage layout & extraction status -------------------------------
  lines.push(`## Storage layout`);
  lines.push("");
  lines.push(`- Archive: \`data/ista/raw/SQLiteDBs4.55.12.7z\` (user-provided, ~23 GB)`);
  lines.push(`- Password: \`data/ista/raw/password.txt\` (single line)`);
  lines.push(`- Extracted SQLite tree: \`data/ista/extracted/\` (gitignored, ~60–100 GB)`);
  lines.push(`- Inventory JSON: \`data/ista/inventory/{inventory,classification,vin-fa-candidates}.json\``);
  lines.push(`- Row samples: \`data/ista/inventory/samples/*.csv\``);
  lines.push("");
  lines.push(`Disk vs Object Storage: chose **local disk** because the workspace volume has ~162 GB free (more than the ~100 GB extracted footprint), and SQLite reads are dramatically faster against local files than against an object-storage FUSE mount. The whole \`data/ista/\` tree is gitignored so the extracted blob never enters git.`);
  lines.push("");

  // ---- File-level summary -----------------------------------------------
  lines.push(`## Files`);
  lines.push("");
  lines.push(`| File | Size | Tables | Total rows |`);
  lines.push(`| --- | ---: | ---: | ---: |`);
  for (const f of inv.files) {
    const totalRows = f.tables.reduce((a, t) => a + (t.rowCount || 0), 0);
    lines.push(`| \`${f.path}\` | ${fmtBytes(f.sizeBytes)} | ${f.tables.length} | ${totalRows} |`);
  }
  lines.push("");

  // ---- Worth importing --------------------------------------------------
  lines.push(`## Worth importing`);
  lines.push("");
  if (!cls) {
    lines.push(`_Not yet computed._`);
  } else {
    const w = cls.buckets["worth-importing"];
    if (w.length === 0) {
      lines.push(`_No tables matched the worth-importing rubric. (Either nothing is genuinely useful, or the rubric in \`scripts/classify-ista-tables.mjs\` needs widening.)_`);
    } else {
      lines.push(`All ${w.length} candidates, sorted by row count (also in \`classification.json\`):`);
      lines.push("");
      const sorted = [...w].sort((a, b) => (b.rowCount || 0) - (a.rowCount || 0));
      for (const r of sorted) {
        lines.push(`### \`${r.table}\` — \`${r.file}\``);
        lines.push("");
        lines.push(`- Rows: **${r.rowCount ?? "?"}**, columns: ${r.columns}`);
        lines.push(`- Why: ${r.reasons.join("; ")}`);
        const sample = await readSample(r.file, r.table);
        if (sample) {
          lines.push("");
          lines.push("Sample rows:");
          lines.push("```csv");
          lines.push(sample);
          lines.push("```");
        }
        lines.push(`- Sketched mapping: _to fill in — likely target is one of \`bmw_models\` / \`sa_codes\` / \`paint_codes\` / \`upholstery_codes\` / \`vin_factory_options\`._`);
        lines.push(`- Estimated row delta vs current schema: _to fill in after diffing against the live table._`);
        lines.push("");
      }
      if (sorted.length > 30) {
        lines.push(`_…${sorted.length - 30} more worth-importing tables in \`classification.json\`._`);
        lines.push("");
      }
    }
  }

  // ---- Not useful -------------------------------------------------------
  lines.push(`## Not useful (do not revisit)`);
  lines.push("");
  if (!cls) {
    lines.push(`_Not yet computed._`);
  } else {
    const n = cls.buckets["not-useful"];
    lines.push(`${n.length} tables. Categories matched: diagnostic / fault-code / wiring / programming / ICOM / localisation-only / migration metadata. Also mirrored in \`classification.json\`.`);
    lines.push("");
    for (const r of n) {
      lines.push(`- \`${r.table}\` (${r.file}) — ${r.reasons.join("; ")}`);
    }
  }
  lines.push("");

  // ---- Needs deeper look ------------------------------------------------
  lines.push(`## Needs deeper look`);
  lines.push("");
  if (!cls) {
    lines.push(`_Not yet computed._`);
  } else {
    const m = cls.buckets["needs-deeper-look"];
    lines.push(`${m.length} tables that the rubric couldn't classify. Each needs a manual look at the column list + 5-row sample to decide. Also mirrored in \`classification.json\`.`);
    lines.push("");
    for (const r of m) {
      lines.push(`- \`${r.table}\` (${r.file}, ${r.rowCount ?? "?"} rows) — ${r.reasons.join("; ")}`);
    }
  }
  lines.push("");

  // ---- Recommendations placeholder --------------------------------------
  lines.push(`## Recommended follow-up tasks`);
  lines.push("");
  lines.push(`_To be filled in once the inventory has been reviewed against the candidates above. Each recommendation should be small enough to plan independently, e.g.:_`);
  lines.push("");
  lines.push(`- Import N net-new SA codes from ISTA+ \`<table>\` into \`sa_codes\` (delta: +N codes).`);
  lines.push(`- Merge ISTA+ engine technical specs from \`<table>\` into chassis hub blurbs (delta: enriches M chassis pages).`);
  lines.push(`- Backfill paint-code finish/RGB metadata from ISTA+ \`<table>\` into \`paint_codes\` (delta: +K codes get RGB).`);
  lines.push(`- (Per-VIN FA promotion only if the FA verdict above turns out to be **yes**.)`);
  lines.push("");

  await writeFile(OUT, lines.join("\n"));
  console.log(`[ista-doc] wrote ${OUT} (${(await stat(OUT)).size} bytes)`);
}

main().catch(e => { console.error(e); process.exit(1); });
