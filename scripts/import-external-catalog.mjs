#!/usr/bin/env node
/**
 * Bulk-import the engineroom (PartsLink24) catalog into our local
 * `external_catalog_parts` table for fast offline lookups.
 *
 * Usage:
 *   node scripts/import-external-catalog.mjs                     # full import
 *   PAGE_SIZE=500 node scripts/import-external-catalog.mjs       # tune page size
 *   START_OFFSET=10000 node scripts/import-external-catalog.mjs  # resume by offset
 *
 * Env:
 *   PARTS_CATALOG_API_URL  (default https://engineroom.gearswap.ai)
 *   PARTS_CATALOG_API_TOKEN | SCRAPER_API_KEY  (auth)
 *   DATABASE_URL                              (target Postgres)
 *
 * Strategy:
 *   - Page through GET /api/catalog-parts?brand=BMW&limit=N&offset=O
 *   - Upsert each page into external_catalog_parts ON CONFLICT(external_id)
 *   - Persist progress to /tmp/external_catalog_import_state.json so
 *     the script can resume if killed.
 */
import pg from "pg";
import fs from "fs";
import path from "path";

const BASE = (process.env.PARTS_CATALOG_API_URL || "https://engineroom.gearswap.ai").replace(/\/+$/, "");
const TOKEN = process.env.PARTS_CATALOG_API_TOKEN || process.env.SCRAPER_API_KEY || "";
const PAGE_SIZE = Math.min(parseInt(process.env.PAGE_SIZE || "500", 10), 1000);
const STATE_FILE = "/tmp/external_catalog_import_state.json";
const LOG_FILE = path.join(process.cwd(), "logs", "external_catalog_import.log");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(2);
}

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
function log(...args) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] ${args.join(" ")}`;
  console.log(line);
  logStream.write(line + "\n");
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { offset: 0, imported: 0, lastTotal: null };
  }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPage(offset, limit) {
  const url = `${BASE}/api/catalog-parts?brand=BMW&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for offset=${offset}`);
  }
  return res.json();
}

function clean(pn) {
  return String(pn || "").replace(/\s+/g, "");
}

async function upsertChunk(pool, parts) {
  if (parts.length === 0) return 0;
  const cols = [
    "external_id", "brand", "model_series", "model", "part_group", "subgroup",
    "part_number", "part_number_clean", "description", "price", "currency",
    "supersession_part_number", "supersession_info", "quantity",
    "diagram_image_path", "diagram_ref_number", "compatibility",
    "hierarchy_path", "source_url", "metadata", "catalog_last_scraped_at",
  ];
  const values = [];
  const placeholders = [];
  let p = 1;
  for (const part of parts) {
    const pn = part.partNumber || "";
    const row = [
      part.id,
      part.brand || "BMW",
      part.modelSeries ?? null,
      part.model ?? null,
      part.partGroup ?? null,
      part.subgroup ?? null,
      pn,
      clean(pn),
      part.description ?? null,
      part.price ?? null,
      part.currency ?? null,
      part.supersessionPartNumber ?? null,
      part.supersessionInfo ?? null,
      part.quantity ?? null,
      part.diagramImagePath ?? null,
      part.diagramRefNumber ?? null,
      part.compatibility ? JSON.stringify(part.compatibility) : null,
      part.hierarchyPath ?? null,
      part.sourceUrl ?? null,
      part.metadata ? JSON.stringify(part.metadata) : null,
      part.lastScrapedAt ?? null,
    ];
    placeholders.push(`(${row.map(() => `$${p++}`).join(",")})`);
    values.push(...row);
  }
  const sql = `
    INSERT INTO external_catalog_parts (${cols.join(",")})
    VALUES ${placeholders.join(",")}
    ON CONFLICT (external_id) DO UPDATE SET
      brand = EXCLUDED.brand,
      model_series = EXCLUDED.model_series,
      model = EXCLUDED.model,
      part_group = EXCLUDED.part_group,
      subgroup = EXCLUDED.subgroup,
      part_number = EXCLUDED.part_number,
      part_number_clean = EXCLUDED.part_number_clean,
      description = EXCLUDED.description,
      price = EXCLUDED.price,
      currency = EXCLUDED.currency,
      supersession_part_number = EXCLUDED.supersession_part_number,
      supersession_info = EXCLUDED.supersession_info,
      quantity = EXCLUDED.quantity,
      diagram_image_path = EXCLUDED.diagram_image_path,
      diagram_ref_number = EXCLUDED.diagram_ref_number,
      compatibility = EXCLUDED.compatibility,
      hierarchy_path = EXCLUDED.hierarchy_path,
      source_url = EXCLUDED.source_url,
      metadata = EXCLUDED.metadata,
      catalog_last_scraped_at = EXCLUDED.catalog_last_scraped_at,
      imported_at = now()
  `;
  await pool.query(sql, values);
  return parts.length;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  let state = loadState();
  if (process.env.START_OFFSET) {
    state.offset = parseInt(process.env.START_OFFSET, 10) || 0;
  }
  log(`Importer starting (page=${PAGE_SIZE}, startOffset=${state.offset}, alreadyImported=${state.imported})`);
  log(`Auth: ${TOKEN ? "Bearer (token set)" : "NO TOKEN"}`);

  const startedAt = Date.now();
  let consecutiveErrors = 0;

  while (true) {
    let resp;
    try {
      resp = await fetchPage(state.offset, PAGE_SIZE);
      consecutiveErrors = 0;
    } catch (e) {
      consecutiveErrors++;
      log(`fetch error @offset=${state.offset}: ${e.message} (consecutive=${consecutiveErrors})`);
      if (consecutiveErrors >= 5) {
        log("5 consecutive errors — bailing");
        break;
      }
      await new Promise(r => setTimeout(r, 2000 * consecutiveErrors));
      continue;
    }

    const parts = resp.parts || [];
    state.lastTotal = resp.total ?? state.lastTotal;
    // Only treat empty page as end-of-catalog when offset has reached total.
    // A short/empty page mid-catalog is treated as a transient anomaly and retried.
    if (parts.length === 0) {
      if (state.lastTotal && state.offset >= state.lastTotal) {
        log(`COMPLETE: offset=${state.offset} >= total=${state.lastTotal}`);
        await pool.end();
        process.exit(0);
      }
      log(`Empty page at offset=${state.offset} but total=${state.lastTotal}; treating as transient, retrying in 5s`);
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    let upsertRetries = 0;
    while (true) {
      try {
        const n = await upsertChunk(pool, parts);
        state.imported += n;
        state.offset += parts.length;
        saveState(state);
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = (state.imported / elapsed).toFixed(1);
        const totalStr = state.lastTotal ? ` / ${state.lastTotal}` : "";
        log(`upserted ${n} (offset=${state.offset}, total imported=${state.imported}${totalStr}, ${rate}/s)`);
        break;
      } catch (e) {
        upsertRetries++;
        if (upsertRetries >= 5) {
          log(`upsert failed 5x at offset=${state.offset}: ${e.message}. BAILING.`);
          await pool.end();
          process.exit(3);
        }
        log(`upsert error (try ${upsertRetries}/5): ${e.message}. Retrying in ${2 * upsertRetries}s.`);
        await new Promise(r => setTimeout(r, 2000 * upsertRetries));
      }
    }

    // Done when we've reached the upstream total; never bail purely on a short page.
    if (state.lastTotal && state.offset >= state.lastTotal) {
      log(`COMPLETE: offset=${state.offset} >= total=${state.lastTotal}`);
      await pool.end();
      process.exit(0);
    }
  }
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});

process.on("uncaughtException", e => { log(`UNCAUGHT: ${e.stack || e.message}`); process.exit(4); });
process.on("unhandledRejection", e => { log(`UNHANDLED REJECTION: ${e?.stack || e?.message || e}`); process.exit(5); });
process.on("SIGTERM", () => { log("SIGTERM received"); process.exit(143); });
process.on("SIGINT", () => { log("SIGINT received"); process.exit(130); });
