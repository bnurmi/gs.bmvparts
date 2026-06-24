#!/usr/bin/env node
/**
 * Daily delta importer for the engineroom catalog.
 *
 * Engineroom returns parts in descending-id order and exposes no `sinceId`
 * filter, so we page from offset=0 and stop as soon as we see a part id
 * less than or equal to our current local max. Anything before that boundary
 * is new (or recently updated) and gets upserted.
 *
 * This script is intentionally bounded: it processes at most MAX_PAGES pages
 * (default 50 = 25k newest parts) so a misconfigured upstream cannot make it
 * walk the entire 500k catalog.
 *
 * Exits 0 on success (even if nothing new was found), non-zero on hard error.
 */
import pg from "pg";
import fs from "fs";
import path from "path";

const BASE = (process.env.PARTS_CATALOG_API_URL || "https://engineroom.gearswap.ai").replace(/\/+$/, "");
const TOKEN = process.env.PARTS_CATALOG_API_TOKEN || process.env.SCRAPER_API_KEY || "";
const PAGE_SIZE = Math.min(parseInt(process.env.DELTA_PAGE_SIZE || "500", 10), 1000);
const MAX_PAGES = parseInt(process.env.DELTA_MAX_PAGES || "50", 10);
const LOG_FILE = path.join(process.cwd(), "logs", "external_catalog_delta.log");

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

function clean(pn) { return String(pn || "").replace(/\s+/g, ""); }

async function fetchPage(offset, limit) {
  const url = `${BASE}/api/catalog-parts?brand=BMW&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for offset=${offset}`);
  return res.json();
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
  const values = []; const placeholders = []; let p = 1;
  for (const part of parts) {
    const pn = part.partNumber || "";
    const row = [
      part.id, part.brand || "BMW", part.modelSeries ?? null, part.model ?? null,
      part.partGroup ?? null, part.subgroup ?? null, pn, clean(pn),
      part.description ?? null, part.price ?? null, part.currency ?? null,
      part.supersessionPartNumber ?? null, part.supersessionInfo ?? null,
      part.quantity ?? null, part.diagramImagePath ?? null, part.diagramRefNumber ?? null,
      part.compatibility ? JSON.stringify(part.compatibility) : null,
      part.hierarchyPath ?? null, part.sourceUrl ?? null,
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
      brand = EXCLUDED.brand, model_series = EXCLUDED.model_series, model = EXCLUDED.model,
      part_group = EXCLUDED.part_group, subgroup = EXCLUDED.subgroup,
      part_number = EXCLUDED.part_number, part_number_clean = EXCLUDED.part_number_clean,
      description = EXCLUDED.description, price = EXCLUDED.price, currency = EXCLUDED.currency,
      supersession_part_number = EXCLUDED.supersession_part_number,
      supersession_info = EXCLUDED.supersession_info, quantity = EXCLUDED.quantity,
      diagram_image_path = EXCLUDED.diagram_image_path,
      diagram_ref_number = EXCLUDED.diagram_ref_number,
      compatibility = EXCLUDED.compatibility, hierarchy_path = EXCLUDED.hierarchy_path,
      source_url = EXCLUDED.source_url, metadata = EXCLUDED.metadata,
      catalog_last_scraped_at = EXCLUDED.catalog_last_scraped_at,
      imported_at = now()
  `;
  await pool.query(sql, values);
  return parts.length;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const { rows: maxRows } = await pool.query("SELECT COALESCE(MAX(external_id), 0) AS max_id FROM external_catalog_parts");
  const localMaxId = Number(maxRows[0].max_id);
  log(`Delta starting. localMaxId=${localMaxId}, pageSize=${PAGE_SIZE}, maxPages=${MAX_PAGES}`);

  let offset = 0;
  let totalNew = 0;
  let pagesScanned = 0;
  let upstreamTotal = null;
  let hitBoundary = false;

  while (pagesScanned < MAX_PAGES) {
    let resp;
    try {
      resp = await fetchPage(offset, PAGE_SIZE);
    } catch (e) {
      log(`fetch error @offset=${offset}: ${e.message}`);
      await pool.end();
      process.exit(1);
    }
    pagesScanned++;
    upstreamTotal = resp.total ?? upstreamTotal;
    const parts = resp.parts || [];
    if (parts.length === 0) { log(`empty page at offset=${offset}; done`); break; }

    // Verify descending order assumption — if violated, fall back to upserting everything.
    const isDescending = parts.length < 2 || parts[0].id >= parts[parts.length - 1].id;
    if (!isDescending) {
      log(`WARN: upstream not descending at offset=${offset} (first=${parts[0].id}, last=${parts[parts.length - 1].id}); upserting full page`);
      totalNew += await upsertChunk(pool, parts);
      offset += parts.length;
      continue;
    }

    // Find boundary: first part whose id <= localMaxId — everything before it is new.
    const boundaryIdx = parts.findIndex(p => Number(p.id) <= localMaxId);
    if (boundaryIdx === -1) {
      // Whole page is new → upsert all and continue.
      const n = await upsertChunk(pool, parts);
      totalNew += n;
      offset += parts.length;
      log(`page offset=${offset - parts.length}: all ${n} new (ids ${parts[0].id}..${parts[parts.length - 1].id})`);
      continue;
    }
    // Upsert the new prefix and stop.
    const newPrefix = parts.slice(0, boundaryIdx);
    if (newPrefix.length > 0) {
      const n = await upsertChunk(pool, newPrefix);
      totalNew += n;
      log(`page offset=${offset}: ${n} new before boundary id=${parts[boundaryIdx].id}`);
    } else {
      log(`page offset=${offset}: 0 new (boundary at index 0, id=${parts[boundaryIdx].id})`);
    }
    hitBoundary = true;
    break;
  }

  if (!hitBoundary && pagesScanned >= MAX_PAGES) {
    log(`stopped after MAX_PAGES=${MAX_PAGES} without reaching boundary; consider raising DELTA_MAX_PAGES or running full importer`);
  }
  log(`Delta done. new=${totalNew}, pagesScanned=${pagesScanned}, upstreamTotal=${upstreamTotal}, localMaxId=${localMaxId}`);
  await pool.end();
  process.exit(0);
}

main().catch(err => { log(`FATAL: ${err.stack || err.message}`); process.exit(1); });
