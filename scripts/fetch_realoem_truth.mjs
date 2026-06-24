#!/usr/bin/env node
// Fetches realoem.com VIN-lookup pages via the Oxylabs realtime API for every
// VIN listed in scripts/fixtures/realoem-vin-truth.json, saves the raw HTML
// response to scripts/fixtures/realoem-responses/<vin>.html, and writes a
// machine-readable summary (extracted chassis identifier, page title, errors)
// to scripts/fixtures/realoem-responses/_summary.json.
//
// The fixture file is updated in place: each case gets a `realoem` field
// containing { fetchedAt, status, extractedChassis, sourceUrl }. Cases where
// realoem returns useful data become the new ground truth; cases where the
// synthetic VIN is rejected by realoem retain the curated chassis but are
// flagged with status="curated_only" so reviewers see which baseline lines
// were not externally confirmed.
//
// Requires OXYLABS_USERNAME / OXYLABS_PASSWORD in the environment.
//
// Usage:
//   node scripts/fetch_realoem_truth.mjs           # fetch all
//   node scripts/fetch_realoem_truth.mjs --limit 5 # fetch first N
//   node scripts/fetch_realoem_truth.mjs --vin WBS73AK000PV12345

import { readFile, writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }
const limit = parseInt(arg("--limit", "0"), 10) || 0;
const onlyVin = arg("--vin", null);

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "fixtures", "realoem-vin-truth.json");
const responsesDir = path.join(here, "fixtures", "realoem-responses");

const OXYLABS_ENDPOINT = "https://realtime.oxylabs.io/v1/queries";
function getAuth() {
  const u = process.env.OXYLABS_USERNAME;
  const p = process.env.OXYLABS_PASSWORD;
  if (!u || !p) throw new Error("OXYLABS_USERNAME / OXYLABS_PASSWORD not set");
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

async function fetchVia(url) {
  const res = await fetch(OXYLABS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: getAuth() },
    body: JSON.stringify({ source: "universal", url, user_agent_type: "desktop_chrome" }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Oxylabs HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r?.content) throw new Error("No content from Oxylabs");
  return { html: String(r.content), targetStatus: r.status_code || null };
}

// Heuristic extractor: realoem's VIN lookup page either redirects to a
// /partgrp/series=<TYPE>&group=... URL (success) or shows a "VIN not found"
// message. The series= parameter encodes the chassis-resolved type code; the
// preceding breadcrumb text usually contains the chassis identifier.
function extractRealoemChassis(html) {
  if (!html) return { extractedChassis: null, partType: null, notFound: false, title: null };
  const lower = html.toLowerCase();
  const notFound = lower.includes("not a valid bmw vin")
    || lower.includes("vin not found")
    || lower.includes("invalid vin")
    || lower.includes("no vehicle found");
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  const seriesMatch = html.match(/series=([A-Z0-9]+)/);
  const partType = seriesMatch ? seriesMatch[1] : null;
  // Chassis usually appears in the page header like "G80 M3 Sedan" or
  // "F30 LCI 340i" — pull a leading [A-Z]\d+N? token from common headings.
  const headerMatch = html.match(/<h\d[^>]*>\s*([A-Z]\d{1,3}N?)\b[^<]*<\/h\d>/i)
    || html.match(/breadcrumbs?[^>]*>[\s\S]{0,200}?>\s*([A-Z]\d{1,3}N?)\b/i)
    || html.match(/\b([EFGI]\d{2,3}N?)\b\s+(?:M\d|\d{3,4}[a-z]|X\d|Z\d)/);
  const extractedChassis = headerMatch ? headerMatch[1].toUpperCase() : null;
  return { extractedChassis, partType, notFound, title };
}

async function main() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf-8"));
  await mkdir(responsesDir, { recursive: true });
  const summary = { fetchedAt: new Date().toISOString(), entries: [] };

  let cases = fixture.cases || [];
  if (onlyVin) cases = cases.filter((c) => c.vin === onlyVin);
  if (limit > 0) cases = cases.slice(0, limit);

  const CONCURRENCY = 6;
  let i = 0;
  async function fetchOne(c) {
    const url = `https://www.realoem.com/bmw/enUS/vinlookup?vin=${encodeURIComponent(c.vin)}`;
    const t0 = Date.now();
    try {
      const { html, targetStatus } = await fetchVia(url);
      const elapsed = Date.now() - t0;
      const responsePath = path.join(responsesDir, `${c.vin}.html`);
      await writeFile(responsePath, html);
      const extracted = extractRealoemChassis(html);
      const status = extracted.notFound
        ? "vin_not_found"
        : extracted.extractedChassis
          ? "confirmed"
          : "no_chassis_in_response";
      const entry = {
        vin: c.vin,
        url,
        targetStatus,
        elapsedMs: elapsed,
        responseFile: path.relative(path.dirname(fixturePath), responsePath),
        ...extracted,
        status,
      };
      summary.entries.push(entry);
      c.realoem = {
        fetchedAt: new Date().toISOString(),
        status,
        extractedChassis: extracted.extractedChassis,
        partType: extracted.partType,
        responseFile: entry.responseFile,
        sourceUrl: url,
      };
      console.log(`[${++i}/${cases.length}] ${c.vin} ${status} chassis=${extracted.extractedChassis || "-"} ${elapsed}ms`);
    } catch (e) {
      const elapsed = Date.now() - t0;
      console.log(`[${++i}/${cases.length}] ${c.vin} ERROR ${e.message} (${elapsed}ms)`);
      summary.entries.push({ vin: c.vin, url, error: e.message, elapsedMs: elapsed });
      c.realoem = {
        fetchedAt: new Date().toISOString(),
        status: "fetch_error",
        error: e.message,
        sourceUrl: url,
      };
    }
  }
  for (let k = 0; k < cases.length; k += CONCURRENCY) {
    const batch = cases.slice(k, k + CONCURRENCY);
    await Promise.all(batch.map(fetchOne));
  }

  const summaryPath = path.join(responsesDir, "_summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  await writeFile(fixturePath, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`\nWrote ${summary.entries.length} responses → ${responsesDir}`);
  console.log(`Summary → ${summaryPath}`);
  console.log(`Updated fixture → ${fixturePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
