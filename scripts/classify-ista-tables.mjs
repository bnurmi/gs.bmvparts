#!/usr/bin/env node
// Apply the Task #105 classification rubric to every table in
// `data/ista/inventory/inventory.json` and emit:
//   - data/ista/inventory/classification.json — per-table verdict
//   - data/ista/inventory/vin-fa-candidates.json — every table that
//     looks VIN-keyed (17-char column, VEHICLE_ID, FA, SA_LIST,
//     VEHICLE_ORDER, etc.) for the per-VIN FA verdict
//
// The rubric is intentionally pattern-based on table + column names so
// it runs without opening any data. The follow-up sampling step
// (sample-ista-tables.mjs) opens "worth importing" tables and pulls
// row samples; everything else is left untouched.
//
// Buckets:
//   "worth-importing" — chassis/engine/model metadata, SA / paint /
//                       upholstery dictionaries, VIN-keyed data, part
//                       number metadata
//   "not-useful"      — diagnostics, fault codes, wiring, programming
//                       data, ICOM-related tables, localisation-only
//                       resource bundles, blob/binary stores
//   "needs-deeper-look" — anything that doesn't pattern-match cleanly
//
// Usage: node scripts/classify-ista-tables.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const INV = path.join(ROOT, "data", "ista", "inventory", "inventory.json");
const OUT = path.join(ROOT, "data", "ista", "inventory", "classification.json");
const OUT_VIN = path.join(ROOT, "data", "ista", "inventory", "vin-fa-candidates.json");

// --- rubric ---------------------------------------------------------------

const WORTH_TABLE_PATTERNS = [
  // chassis / model / engine metadata
  /\b(model|series|chassis|baureihe|typ|fztyp|motor|engine|getriebe|transmission|karosserie|body)\b/i,
  // SA / option / paint / upholstery dictionaries
  /\b(sa[_-]?code|sa[_-]?text|salapa|option|paint|lack|color|colour|farbe|polster|upholstery|trim)\b/i,
  // part-number metadata
  /\b(part|teile|teil|sachnummer|sach[_-]?nr|partno)\b/i,
  // VIN-keyed factory data
  /\b(vin|vehicle[_-]?order|fa[_-]?list|fa[_-]?data|vehicle[_-]?id|fahrzeug)\b/i,
  // production date / market
  /\b(produktion|production|market|markt|land|country)\b/i,
];

const NOT_USEFUL_TABLE_PATTERNS = [
  /\b(fault|fehler|dtc|error[_-]?code)\b/i,
  /\b(wiring|leitung|kabel|stromlauf)\b/i,
  /\b(diag|diagnos|abl|ablauf|ablaufplan|prozedur|procedure)\b/i,
  /\b(prog|program|sgbm|psdz|svt|coding|codier)\b/i,
  /\b(icom|enet|kline|d[-_]?can|kombi)\b/i,
  /\b(translation|i18n|locale|language|sprache|text[_-]?id|resource[_-]?bundle)\b/i,
  /\b(blob|binary|attachment|image[_-]?data|graphic[_-]?data)\b/i,
  /\b(audit|log|history|migration|version|schema_)\b/i,
  /^sqlite_/i,
];

const VIN_KEY_COLUMN_PATTERNS = [
  /^vin$/i, /vin$/i, /^fin$/i, /fin$/i,
  /vehicle[_-]?id/i, /fahrgestell/i,
];

const FA_COLUMN_PATTERNS = [
  /^fa$/i, /fa[_-]?list/i, /fa[_-]?data/i, /sa[_-]?list/i,
  /vehicle[_-]?order/i, /factory[_-]?order/i, /e[_-]?word/i,
];

function matchAny(s, patterns) {
  return patterns.some(p => p.test(s));
}

function looksVinKeyed(table) {
  return table.columns.some(c =>
    matchAny(c.name, VIN_KEY_COLUMN_PATTERNS) ||
    (c.type && /char\s*\(\s*17\s*\)/i.test(c.type))
  );
}

function looksFa(table) {
  return table.columns.some(c => matchAny(c.name, FA_COLUMN_PATTERNS));
}

function classifyTable(table, fileName) {
  const tName = table.name;
  const reasons = [];

  // VIN-keyed always wins — even if the table name screams "diagnostic".
  const vinKeyed = looksVinKeyed(table);
  const fa = looksFa(table);
  if (vinKeyed || fa) {
    if (vinKeyed) reasons.push("has VIN-shaped column");
    if (fa) reasons.push("has FA/SA-list-shaped column");
    return { bucket: "worth-importing", reasons, vinKeyed, fa };
  }

  if (matchAny(tName, NOT_USEFUL_TABLE_PATTERNS)) {
    reasons.push(`table name matches not-useful pattern`);
    return { bucket: "not-useful", reasons, vinKeyed, fa };
  }
  if (matchAny(tName, WORTH_TABLE_PATTERNS)) {
    reasons.push(`table name matches worth-importing pattern`);
    return { bucket: "worth-importing", reasons, vinKeyed, fa };
  }

  // Column-level sniff: a table with `code` + `text/description/name`
  // columns is likely a dictionary worth a closer look.
  const colNames = table.columns.map(c => c.name.toLowerCase());
  const hasCode = colNames.some(n => /code|nummer|nr$|id$/.test(n));
  const hasText = colNames.some(n => /text|name|desc|bezeichnung|label|title/.test(n));
  if (hasCode && hasText && (table.rowCount || 0) > 0) {
    reasons.push("has code+text columns — possible dictionary");
    return { bucket: "needs-deeper-look", reasons, vinKeyed, fa };
  }

  reasons.push("no clear pattern match");
  return { bucket: "needs-deeper-look", reasons, vinKeyed, fa };
}

// --- main -----------------------------------------------------------------

async function main() {
  const inv = JSON.parse(await readFile(INV, "utf-8"));
  const result = { generatedAt: new Date().toISOString(), buckets: { "worth-importing": [], "not-useful": [], "needs-deeper-look": [] } };
  const vinCandidates = [];

  for (const file of inv.files) {
    for (const t of file.tables) {
      const c = classifyTable(t, file.path);
      const entry = {
        file: file.path,
        table: t.name,
        rowCount: t.rowCount,
        columns: t.columns.length,
        reasons: c.reasons,
      };
      result.buckets[c.bucket].push(entry);
      if (c.vinKeyed || c.fa) {
        vinCandidates.push({
          ...entry,
          vinKeyed: c.vinKeyed,
          fa: c.fa,
          columnList: t.columns.map(col => `${col.name}${col.type ? `:${col.type}` : ""}`),
        });
      }
    }
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(result, null, 2));
  await writeFile(OUT_VIN, JSON.stringify({ generatedAt: result.generatedAt, candidates: vinCandidates }, null, 2));

  for (const [bucket, rows] of Object.entries(result.buckets)) {
    const totalRows = rows.reduce((a, r) => a + (r.rowCount || 0), 0);
    console.log(`[ista-classify] ${bucket}: ${rows.length} tables, ${totalRows} rows`);
  }
  console.log(`[ista-classify] vin-fa candidates: ${vinCandidates.length}`);
  console.log(`[ista-classify] wrote ${OUT}`);
  console.log(`[ista-classify] wrote ${OUT_VIN}`);
}

main().catch(e => { console.error(e); process.exit(1); });
