#!/usr/bin/env node
// One-off: discover, insert, and scrape E63/E63N/E64/E64N car catalogs
// from bmw-etk.info to fill the parts-catalog gap for 6-Series Coupé/Cabrio.
//
// Pipeline:
//   1. For each chassis, fetch /sm/VT/<chassis>/ and extract body styles.
//   2. For each (chassis, body), fetch /sm/VT/<chassis>/<body>/ and extract models.
//   3. For each (chassis, body, model), fetch /sm/VT/<chassis>/<body>/<model>/
//      and extract one representative catalog URL with catalogId.
//   4. Insert a `cars` row (skip if catalogId already exists).
//   5. Trigger /api/scrape/:id on the local server to populate parts.
//
// Env: EVOMI_PROXY_HOST/PORT/USERNAME/PASSWORD (preferred), DATABASE_URL.
// Falls back to direct fetch if Evomi isn't configured.

import pg from "pg";
import nodeFetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";

const BASE = "https://www.bmw-etk.info";
const CHASSIS_LIST = ["E63", "E63N", "E64", "E64N"];
const APP = process.env.APP || "http://localhost:5000";

function evomiAgent() {
  const host = (process.env.EVOMI_PROXY_HOST || "").trim();
  const port = (process.env.EVOMI_PROXY_PORT || "").trim();
  const user = (process.env.EVOMI_PROXY_USERNAME || "").trim();
  const pass = process.env.EVOMI_PROXY_PASSWORD || "";
  if (!host || !port || !user || !pass) return null;
  const scheme = (process.env.EVOMI_PROXY_SCHEME || "https").trim().toLowerCase() === "http" ? "http" : "https";
  const url = `${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  return new HttpsProxyAgent(url, { keepAlive: true });
}

const PROXY_AGENT = evomiAgent();
if (!PROXY_AGENT) {
  console.warn("[import-e63] Evomi proxy NOT configured — falling back to direct fetches");
}

async function fetchHtmlOnce(url, useProxy) {
  const res = await nodeFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    agent: useProxy && PROXY_AGENT ? PROXY_AGENT : undefined,
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  if (!html) throw new Error(`empty response for ${url}`);
  return html;
}

async function fetchHtml(url) {
  // Evomi-first when configured; on per-request failure, fall back to a
  // direct fetch (so a transient proxy hiccup doesn't abort the whole
  // chassis-discovery sweep).
  if (PROXY_AGENT) {
    try {
      return await fetchHtmlOnce(url, true);
    } catch (err) {
      console.warn(`[import-e63] Evomi failed for ${url}: ${err.message}; retrying direct`);
    }
  }
  return await fetchHtmlOnce(url, false);
}

function extractHrefs(html, regex) {
  const out = new Set();
  for (const m of html.matchAll(/href=['"]([^'"]+)['"]/g)) {
    if (regex.test(m[1])) out.add(m[1]);
  }
  return Array.from(out);
}

async function discoverBodies(chassis) {
  const html = await fetchHtml(`${BASE}/parts-catalog/BMW/A/sm/VT/${chassis}/`);
  // Body links look like: /parts-catalog/BMW/A/sm/VT/E64/Cab/
  const re = new RegExp(`/parts-catalog/BMW/A/sm/VT/${chassis}/([^/]+)/$`);
  const bodies = new Set();
  for (const href of extractHrefs(html, re)) {
    const m = href.match(re);
    if (m) bodies.add(m[1]);
  }
  return Array.from(bodies);
}

async function discoverModels(chassis, body) {
  const html = await fetchHtml(`${BASE}/parts-catalog/BMW/A/sm/VT/${chassis}/${body}/`);
  const re = new RegExp(`/parts-catalog/BMW/A/sm/VT/${chassis}/${body}/([^/]+)/$`);
  const models = new Set();
  for (const href of extractHrefs(html, re)) {
    const m = href.match(re);
    if (m) models.add(m[1]);
  }
  return Array.from(models);
}

async function discoverCatalog(chassis, body, model) {
  // Page /sm/VT/<c>/<b>/<m>/ lists individual catalog entries
  const html = await fetchHtml(`${BASE}/parts-catalog/BMW/A/sm/VT/${chassis}/${body}/${model}/`);
  // Catalog URLs: /parts-catalog/BMW/A/cat/VT/<c>/<b>/<m>/<MARKET>/<L|R>/<N|S>/<YYYY>/<MM>/<catalogId>/
  const re = new RegExp(
    `/parts-catalog/BMW/A/cat/VT/${chassis}/${body}/${model}/([A-Z]+)/([LR])/([NS])/(\\d{4})/(\\d{2})/(\\d+)/`,
  );
  const candidates = new Set();
  for (const href of extractHrefs(html, re)) {
    candidates.add(href);
  }
  if (candidates.size === 0) return null;
  // Pick the earliest year so we cover the broadest production span.
  let best = null;
  for (const url of candidates) {
    const m = url.match(re);
    if (!m) continue;
    const year = parseInt(m[4], 10);
    if (!best || year < best.year) {
      best = { url: url.startsWith("http") ? url : BASE + url, year, market: m[1], hand: m[2], lci: m[3], month: m[5], catalogId: m[6] };
    }
  }
  return best;
}

async function main() {
  // Oxylabs credentials no longer required — bmw-etk.info now goes
  // through the Evomi residential proxy (or direct fetch as fallback).
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const inserted = [];
  const skipped = [];

  for (const chassis of CHASSIS_LIST) {
    console.log(`\n=== ${chassis} ===`);
    const bodies = await discoverBodies(chassis);
    console.log(`  bodies: ${bodies.join(", ")}`);
    for (const body of bodies) {
      const models = await discoverModels(chassis, body);
      console.log(`  ${body}: ${models.length} models`);
      for (const model of models) {
        const decoded = decodeURIComponent(model);
        try {
          const cat = await discoverCatalog(chassis, body, model);
          if (!cat) {
            console.log(`    - ${body}/${decoded}: no catalog found`);
            continue;
          }
          // Skip if catalog already imported
          const exists = await pool.query("SELECT id FROM cars WHERE catalog_id = $1 LIMIT 1", [cat.catalogId]);
          if (exists.rowCount > 0) {
            console.log(`    = ${body}/${decoded}: catalog ${cat.catalogId} already present (carId=${exists.rows[0].id})`);
            skipped.push({ chassis, body, model: decoded, catalogId: cat.catalogId, carId: exists.rows[0].id });
            continue;
          }
          const generation = chassis[0];
          const series = "6";
          const bodyType = body === "Cab" ? "Convertible" : body === "Cou" ? "Coupé" : body;
          const isLci = chassis.endsWith("N");
          const displayName = `${chassis} ${decoded}${isLci ? " LCI" : ""}`;
          const insert = await pool.query(
            `INSERT INTO cars (chassis, generation, series, body_type, model_name, display_name, year_start, catalog_url, catalog_id, scrape_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'idle') RETURNING id`,
            [chassis, generation, series, bodyType, decoded, displayName, cat.year, cat.url, cat.catalogId],
          );
          const carId = insert.rows[0].id;
          console.log(`    + ${body}/${decoded}: carId=${carId} catalogId=${cat.catalogId} year=${cat.year}`);
          inserted.push({ carId, chassis, body, model: decoded, catalogId: cat.catalogId, url: cat.url });
        } catch (e) {
          console.log(`    ! ${body}/${decoded}: ${e?.message || e}`);
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Inserted: ${inserted.length} new cars`);
  console.log(`Skipped (already present): ${skipped.length}`);
  await pool.end();

  if (inserted.length === 0) {
    console.log("\nNothing new to scrape.");
    return;
  }

  console.log(`\n=== Triggering scrapes for ${inserted.length} new cars ===`);
  for (const car of inserted) {
    try {
      const res = await fetch(`${APP}/api/cars/${car.carId}/scrape`, { method: "POST" });
      const body = await res.text();
      console.log(`  carId=${car.carId} ${car.chassis}/${car.model.padEnd(10)} -> HTTP ${res.status} ${body.slice(0, 80)}`);
    } catch (e) {
      console.log(`  carId=${car.carId}: failed to start scrape: ${e?.message || e}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`\nScrapes started. Watch /api/cars or workflow logs for progress.`);
}

main().catch(e => { console.error(e); process.exit(1); });
