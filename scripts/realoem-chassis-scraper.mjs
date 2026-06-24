#!/usr/bin/env node
// Tier 2 RealOEM scraper — admin-triggered backfill for a single chassis.
//
// Walks RealOEM partgrp pages via Oxylabs and upserts parts into
// external_catalog_parts with a source='realoem_fallback' marker. Updates the
// realoem_chassis_scrape_jobs row as it progresses.
//
// CLI:
//   node scripts/realoem-chassis-scraper.mjs --job-id N --chassis G70 [--part-type RP] [--max-pages 50]
//
// Hard cap of 200 pages per run to keep call volume bounded. Caller is
// expected to honor "least calls" — never call this for chassis we already
// carry in external_catalog_parts.

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, sql, and } from "drizzle-orm";
import { realoemChassisScrapeJobs, externalCatalogParts } from "../shared/schema.ts";
import { createHash } from "crypto";

const args = parseArgs(process.argv.slice(2));
const JOB_ID = parseInt(args["job-id"] || "0", 10);
const CHASSIS = String(args["chassis"] || "").toUpperCase();
const PART_TYPE = args["part-type"] || null;
const MAX_PAGES = Math.min(parseInt(args["max-pages"] || "50", 10), 200);

if (!JOB_ID || !CHASSIS) { console.error("Missing --job-id or --chassis"); process.exit(2); }
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(2); }
if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
  console.error("OXYLABS credentials missing"); process.exit(2);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const OXY_AUTH = "Basic " + Buffer.from(`${process.env.OXYLABS_USERNAME}:${process.env.OXYLABS_PASSWORD}`).toString("base64");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    }
  }
  return out;
}

async function updateJob(patch) {
  await db.update(realoemChassisScrapeJobs).set(patch).where(eq(realoemChassisScrapeJobs.id, JOB_ID));
}

async function fetchOxy(url) {
  const res = await fetch("https://realtime.oxylabs.io/v1/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: OXY_AUTH },
    body: JSON.stringify({ source: "universal", url, user_agent_type: "desktop_chrome" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Oxylabs HTTP ${res.status}`);
  const data = await res.json();
  const html = data?.results?.[0]?.content;
  if (!html) throw new Error("Oxylabs returned no content");
  return String(html);
}

// Extract subgroup links from a chassis landing page.
// RealOEM URLs look like /bmw/enUS/showparts?id=XXXX-YYYY&mospid=NNNN&hg=GG&fg=FF
function extractSubgroupLinks(html) {
  const links = new Set();
  const re = /href="(\/bmw\/enUS\/showparts\?[^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) links.add(m[1]);
  return [...links];
}

// Parse a subgroup parts table. RealOEM renders rows with reference number,
// part number, qty, description, price spread across <td> cells. We accept
// any row that has something resembling a BMW PN (11 digits, sometimes spaced).
function extractParts(html) {
  const out = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => stripHtml(c[1]).trim());
    if (cells.length < 2) continue;
    const pn = cells.map(c => c.replace(/\s+/g, "")).find(c => /^\d{11}$/.test(c));
    if (!pn) continue;
    const qtyCell = cells.find(c => /^\d{1,3}$/.test(c.trim()));
    const priceCell = cells.find(c => /[\$€£]\s*\d/.test(c)) || null;
    const descCell = cells.filter(c => c && !/^\d+$/.test(c) && !/[\$€£]/.test(c) && c.replace(/\s/g,"") !== pn).sort((a, b) => b.length - a.length)[0] || null;
    const refCell = cells.find(c => /^\d{1,3}$/.test(c.trim()) && c.trim() !== qtyCell) || null;
    out.push({
      partNumber: pn,
      description: descCell,
      price: priceCell ? priceCell.replace(/[^\d.,]/g, "") : null,
      currency: priceCell ? (priceCell.match(/[\$€£]/)?.[0] || null) : null,
      quantity: qtyCell ? parseInt(qtyCell, 10) : null,
      diagramRefNumber: refCell || null,
    });
  }
  return out;
}

function stripHtml(s) { return s.replace(/<[^>]+>/g, ""); }

// Stable synthetic external_id for fallback-imported parts. Negative integers
// distinguish them from the real importer (which uses positives).
function syntheticExternalId(chassis, pn, ref) {
  const h = createHash("sha1").update(`${chassis}|${pn}|${ref || ""}`).digest();
  // Take first 4 bytes as unsigned int, mask to 31 bits, negate.
  const n = h.readUInt32BE(0) & 0x7fffffff;
  return -n;
}

async function main() {
  await updateJob({ status: "running" });
  console.log(`[Tier2] Starting scrape for chassis=${CHASSIS} job=${JOB_ID} max=${MAX_PAGES}`);

  // Step 1: chassis landing page → enumerate subgroups
  // RealOEM convention: /bmw/enUS/select?series=<chassis>
  const landingUrl = `https://www.realoem.com/bmw/enUS/select?series=${encodeURIComponent(CHASSIS)}`;
  let landingHtml;
  try {
    landingHtml = await fetchOxy(landingUrl);
  } catch (e) {
    await updateJob({ status: "failed", error: `landing: ${e.message}`, finishedAt: new Date() });
    console.error(`[Tier2] Landing fetch failed: ${e.message}`);
    process.exit(1);
  }

  const subLinks = extractSubgroupLinks(landingHtml).slice(0, MAX_PAGES);
  await updateJob({ totalPages: subLinks.length });
  console.log(`[Tier2] Found ${subLinks.length} subgroup pages`);

  if (subLinks.length === 0) {
    await updateJob({ status: "completed", finishedAt: new Date(), error: "no subgroup links found on landing page" });
    console.warn(`[Tier2] No subgroup links — chassis page format may have changed.`);
    process.exit(0);
  }

  let imported = 0;
  let completed = 0;
  for (const path of subLinks) {
    try {
      const url = `https://www.realoem.com${path}`;
      const html = await fetchOxy(url);
      const parts = extractParts(html);
      for (const p of parts) {
        const extId = syntheticExternalId(CHASSIS, p.partNumber, p.diagramRefNumber);
        const row = {
          externalId: extId,
          brand: "BMW",
          modelSeries: CHASSIS,
          model: CHASSIS,
          partNumber: p.partNumber,
          partNumberClean: p.partNumber.replace(/\s/g, ""),
          description: p.description,
          price: p.price,
          currency: p.currency,
          quantity: p.quantity,
          diagramRefNumber: p.diagramRefNumber,
          sourceUrl: url,
          metadata: { source: "realoem_fallback", chassis: CHASSIS, jobId: JOB_ID },
          catalogLastScrapedAt: new Date(),
        };
        try {
          await db.insert(externalCatalogParts).values(row).onConflictDoUpdate({
            target: externalCatalogParts.externalId,
            set: { ...row, importedAt: new Date() },
          });
          imported++;
        } catch (e) {
          console.warn(`[Tier2] upsert failed pn=${p.partNumber}: ${e.message}`);
        }
      }
      completed++;
      await updateJob({ completedPages: completed, partsImported: imported });
      console.log(`[Tier2] page ${completed}/${subLinks.length} → +${parts.length} parts (total ${imported})`);
    } catch (e) {
      console.warn(`[Tier2] page failed (${path}): ${e.message}`);
      completed++;
      await updateJob({ completedPages: completed });
    }
  }

  await updateJob({ status: "completed", finishedAt: new Date(), partsImported: imported });
  console.log(`[Tier2] Done. Imported ${imported} parts across ${completed} pages.`);
  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(`[Tier2] Fatal: ${e.message}`);
  try { await updateJob({ status: "failed", error: e.message, finishedAt: new Date() }); } catch {}
  process.exit(1);
});
