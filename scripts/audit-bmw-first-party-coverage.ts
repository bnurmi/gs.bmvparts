#!/usr/bin/env tsx
// Task #61 — Verify BMW configurator and manuals endpoints actually
// serve our model years.
//
// Walks every cached VIN in `vin_cache`, actively probes BMW's public
// configurator + manuals portal for each one, and reports per-source
// hit / miss rates. Read-only: never writes to the database. Useful
// for answering questions like "are pre-2010 manuals reachable from
// owners-manuals.bmw.com or are we structurally stuck on bimmer.work
// for those years?".
//
// Run with:
//   npx tsx scripts/audit-bmw-first-party-coverage.ts
//
// Optional flags:
//   --limit N         Only audit the first N VINs (debug runs).
//   --concurrency N   Parallel probes per tab (default 4, keep small).
//   --out PATH        Save the full JSON report to PATH.
//   --no-images       Skip the BMW configurator probe.
//   --no-manuals      Skip the BMW manuals portal probe.
//
// Companion to GET /api/admin/vin-enrichment-stats: that endpoint
// reports historical persisted provenance, this script reports what
// BMW would serve right now if we re-enriched every VIN today.

import { writeFileSync } from "node:fs";
import { db } from "../server/storage";
import { sql } from "drizzle-orm";
import { decodeVin } from "../server/vin-decoder";
import { fetchConfiguratorImages } from "../server/bmw-configurator-images";
import { fetchManualsForModel } from "../server/bmw-manuals";
import {
  ensureEtkLoaded,
  getEtkVehicleByTypeCode,
  buildEtkModelName,
} from "../server/etk-vehicle";

type Args = {
  limit: number | null;
  concurrency: number;
  out: string | null;
  probeImages: boolean;
  probeManuals: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { limit: null, concurrency: 4, out: null, probeImages: true, probeManuals: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--limit" && v) { a.limit = parseInt(v, 10); i++; }
    else if (k === "--concurrency" && v) { a.concurrency = Math.max(1, parseInt(v, 10)); i++; }
    else if (k === "--out" && v) { a.out = v; i++; }
    else if (k === "--no-images") a.probeImages = false;
    else if (k === "--no-manuals") a.probeManuals = false;
  }
  return a;
}

interface CachedVinRow {
  vin: string;
  cacheSource: string | null;
  codeType: string | null;
  paintCode: string | null;
  upholsteryCode: string | null;
  modelName: string | null;
  startOfProduction: string | null;
  enrichmentSource: any;
}

interface VinResolved {
  vin: string;
  typeCode: string | null;
  paintCode: string | null;
  upholsteryCode: string | null;
  modelName: string | null;
  modelYear: number | null;
  chassis: string | null;
  cachedConfiguratorSource: string | null; // historical
  cachedManualsSource: string | null;       // historical
}

interface ProbeOutcome {
  vin: string;
  modelYear: number | null;
  chassis: string | null;
  // images probe
  imagesAttempted: boolean;
  imagesHit: boolean | null; // null = couldn't attempt (no inputs)
  imagesReason: string | null;
  // manuals probe
  manualsAttempted: boolean;
  manualsHit: boolean | null;
  manualsCount: number;
  manualsReason: string | null;
}

const ARGS = parseArgs(process.argv.slice(2));

// Year buckets used in the summary tables. Chosen to surface the
// "pre-2010 manuals are structurally unavailable" hypothesis from the
// task description in a single glance.
const YEAR_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "<2005",     min: 0,    max: 2004 },
  { label: "2005–2009", min: 2005, max: 2009 },
  { label: "2010–2014", min: 2010, max: 2014 },
  { label: "2015–2019", min: 2015, max: 2019 },
  { label: "2020–2024", min: 2020, max: 2024 },
  { label: "2025+",     min: 2025, max: 9999 },
  { label: "(unknown)", min: -1,   max: -1   },
];
function bucketFor(year: number | null): string {
  if (year == null) return "(unknown)";
  const b = YEAR_BUCKETS.find(b => year >= b.min && year <= b.max);
  return b ? b.label : "(unknown)";
}

function parseProductionYear(sop: string | null): number | null {
  if (!sop) return null;
  // Common shapes: "2021-12-07", "01/2018", "2018", "12/2017"
  const m1 = sop.match(/^(\d{4})/);
  if (m1) return parseInt(m1[1], 10);
  const m2 = sop.match(/(\d{4})$/);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

async function loadCachedVins(): Promise<CachedVinRow[]> {
  // `enrichment_source` was added in a boot-time migration; tolerate
  // its absence so this script is runnable against fresh databases.
  const hasEsCol = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vin_cache' AND column_name = 'enrichment_source' LIMIT 1
  `);
  const includeEs = (hasEsCol.rows?.length ?? 0) > 0;
  const baseSelect = `
    SELECT
      vin,
      source AS cache_source,
      enriched_data->'vehicle'->>'codeType'           AS code_type,
      enriched_data->'vehicle'->>'colorCode'          AS paint_code,
      enriched_data->'vehicle'->>'upholsteryCode'     AS upholstery_code,
      enriched_data->'vehicle'->>'modelName'          AS model_name,
      enriched_data->'vehicle'->>'startOfProduction'  AS sop
      ${includeEs ? ", enrichment_source AS enrichment_source" : ""}
    FROM vin_cache
    ORDER BY updated_at DESC NULLS LAST
    ${ARGS.limit ? `LIMIT ${ARGS.limit}` : ""}
  `;
  const r = await db.execute(sql.raw(baseSelect));
  return (r.rows as any[]).map((row) => ({
    vin: String(row.vin),
    cacheSource: row.cache_source ?? null,
    codeType: row.code_type ?? null,
    paintCode: row.paint_code ?? null,
    upholsteryCode: row.upholstery_code ?? null,
    modelName: row.model_name ?? null,
    startOfProduction: row.sop ?? null,
    enrichmentSource: includeEs ? (row.enrichment_source ?? null) : null,
  }));
}

// Fill in any missing typeCode / modelName / modelYear by re-running
// `decodeVin()`. This matches what the real enrichment orchestrator
// would do for a fresh VIN, so the probe results reflect production
// behaviour rather than whatever stale data the cache happens to have.
async function resolveVin(row: CachedVinRow): Promise<VinResolved> {
  let typeCode = row.codeType;
  let modelYear = parseProductionYear(row.startOfProduction);
  let modelName = row.modelName;
  let chassis: string | null = null;

  // Always run decodeVin once so we get chassis (used for the per-
  // chassis breakdown) and so we have a model name for VINs whose
  // cached row has none — e.g. unenriched VINs and modern VINs that
  // missed ETK. Without this, manuals probing under-reports because
  // we'd skip them as "no modelName" even when decodeVin would have
  // resolved a perfectly good name.
  try {
    const decoded = await decodeVin(row.vin);
    if (!typeCode) typeCode = decoded.typeCode ?? null;
    if (!modelYear) modelYear = decoded.modelYear ?? null;
    if (!modelName) modelName = decoded.modelName ?? null;
    chassis = decoded.chassis ?? null;
    // Final fallback: synthesize a model name from the ETK row when
    // decodeVin didn't have one but typeCode resolved.
    if (!modelName && typeCode) {
      const etk = await getEtkVehicleByTypeCode(typeCode);
      if (etk) modelName = buildEtkModelName(etk);
    }
  } catch {
    /* leave fields null */
  }

  const es = row.enrichmentSource as
    | { images?: { source?: string }; manuals?: { source?: string } }
    | null;
  return {
    vin: row.vin,
    typeCode,
    paintCode: row.paintCode,
    upholsteryCode: row.upholsteryCode,
    modelName,
    modelYear,
    chassis,
    cachedConfiguratorSource: es?.images?.source ?? null,
    cachedManualsSource: es?.manuals?.source ?? null,
  };
}

async function probeOne(v: VinResolved): Promise<ProbeOutcome> {
  const out: ProbeOutcome = {
    vin: v.vin,
    modelYear: v.modelYear,
    chassis: v.chassis,
    imagesAttempted: false,
    imagesHit: null,
    imagesReason: null,
    manualsAttempted: false,
    manualsHit: null,
    manualsCount: 0,
    manualsReason: null,
  };

  // BMW configurator probe — needs a model code + paint code at minimum.
  if (ARGS.probeImages) {
    if (!v.typeCode || !v.paintCode) {
      out.imagesReason = !v.typeCode ? "no typeCode" : "no paintCode";
    } else {
      out.imagesAttempted = true;
      try {
        const r = await fetchConfiguratorImages({
          modelTypeCode: v.typeCode,
          paintCode: v.paintCode,
          upholsteryCode: v.upholsteryCode,
        });
        out.imagesHit = r != null && !!r.exteriorUrl;
        if (!out.imagesHit) out.imagesReason = "configurator returned null";
      } catch (e: any) {
        out.imagesHit = false;
        out.imagesReason = `error: ${e?.message ?? e}`;
      }
    }
  }

  // BMW manuals probe — only needs modelName + year.
  if (ARGS.probeManuals) {
    if (!v.modelName) {
      out.manualsReason = "no modelName";
    } else {
      out.manualsAttempted = true;
      try {
        const m = await fetchManualsForModel(v.modelName, v.modelYear);
        out.manualsCount = m.length;
        out.manualsHit = m.length > 0;
        // fetchManualsForModel returns [] for both "BMW responded but
        // had no manuals" AND "fetch failed" — both equally mean the
        // BMW portal is not serving this (model, year) today.
        if (!out.manualsHit) out.manualsReason = "portal returned 0 rows (or unreachable)";
      } catch (e: any) {
        out.manualsHit = false;
        out.manualsReason = `error: ${e?.message ?? e}`;
      }
    }
  }

  return out;
}

// Tiny promise pool so we don't spam BMW's CDN. Keep this small (4)
// because BMW's edge will rate-limit aggressive HEAD bursts.
async function runPool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

interface BucketCounters {
  attempted: number;
  hit: number;
  miss: number;
  noInputs: number;
}
function emptyBucket(): BucketCounters { return { attempted: 0, hit: 0, miss: 0, noInputs: 0 }; }

function tally(outcomes: ProbeOutcome[], picker: (o: ProbeOutcome) => { attempted: boolean; hit: boolean | null }): BucketCounters {
  const b = emptyBucket();
  for (const o of outcomes) {
    const { attempted, hit } = picker(o);
    if (!attempted && hit == null) { b.noInputs++; continue; }
    b.attempted++;
    if (hit) b.hit++; else b.miss++;
  }
  return b;
}

function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k) || [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}

function pct(n: number, d: number): string {
  if (d === 0) return "  —  ";
  return `${Math.round((n / d) * 100).toString().padStart(3, " ")}%`;
}

function printBucketTable(title: string, rows: Array<[string, BucketCounters]>) {
  console.log(`\n${title}`);
  console.log("  bucket          total  attempted   hit   miss  no-inputs   hit%");
  for (const [label, b] of rows) {
    const total = b.attempted + b.noInputs;
    console.log(
      `  ${label.padEnd(13)}  ${String(total).padStart(5)}  ${String(b.attempted).padStart(9)}  ${String(b.hit).padStart(4)}  ${String(b.miss).padStart(5)}  ${String(b.noInputs).padStart(9)}  ${pct(b.hit, b.attempted)}`,
    );
  }
}

async function main() {
  console.log(`[audit-bmw-coverage] starting; ${JSON.stringify(ARGS)}`);
  await ensureEtkLoaded();
  const rows = await loadCachedVins();
  console.log(`[audit-bmw-coverage] loaded ${rows.length} cached VIN(s)`);
  if (rows.length === 0) {
    console.log("[audit-bmw-coverage] no cached VINs to audit — exiting");
    process.exit(0);
  }

  console.log("[audit-bmw-coverage] resolving typeCode + modelYear for each VIN…");
  const resolved = await runPool(rows, ARGS.concurrency, resolveVin);

  console.log(`[audit-bmw-coverage] probing BMW endpoints (concurrency=${ARGS.concurrency})…`);
  const t0 = Date.now();
  const outcomes = await runPool(resolved, ARGS.concurrency, probeOne);
  const elapsedMs = Date.now() - t0;
  console.log(`[audit-bmw-coverage] probes complete in ${(elapsedMs / 1000).toFixed(1)}s`);

  // ---- Summary tables ----
  const total = outcomes.length;
  const imagesOverall = tally(outcomes, (o) => ({ attempted: o.imagesAttempted, hit: o.imagesHit }));
  const manualsOverall = tally(outcomes, (o) => ({ attempted: o.manualsAttempted, hit: o.manualsHit }));

  console.log("\n=== Overall ===");
  console.log(`  total VINs:                  ${total}`);
  console.log(`  images attempted:            ${imagesOverall.attempted} (hit ${imagesOverall.hit}, miss ${imagesOverall.miss})`);
  console.log(`  images skipped (no inputs):  ${imagesOverall.noInputs}`);
  console.log(`  manuals attempted:           ${manualsOverall.attempted} (hit ${manualsOverall.hit}, miss ${manualsOverall.miss})`);
  console.log(`  manuals skipped (no inputs): ${manualsOverall.noInputs}`);
  if (imagesOverall.attempted > 0) {
    console.log(`  → BMW configurator hit rate: ${pct(imagesOverall.hit, imagesOverall.attempted)} of attempted, ${pct(imagesOverall.hit, total)} of all cached VINs`);
  }
  if (manualsOverall.attempted > 0) {
    console.log(`  → BMW manuals portal hit rate: ${pct(manualsOverall.hit, manualsOverall.attempted)} of attempted, ${pct(manualsOverall.hit, total)} of all cached VINs`);
  }

  // Per-year-bucket
  const byYear = groupBy(outcomes, (o) => bucketFor(o.modelYear) as any);
  const yearOrder = YEAR_BUCKETS.map((b) => b.label);
  const imagesByYear: Array<[string, BucketCounters]> = yearOrder.map((label) => [
    label,
    tally(byYear.get(label as any) || [], (o) => ({ attempted: o.imagesAttempted, hit: o.imagesHit })),
  ]);
  const manualsByYear: Array<[string, BucketCounters]> = yearOrder.map((label) => [
    label,
    tally(byYear.get(label as any) || [], (o) => ({ attempted: o.manualsAttempted, hit: o.manualsHit })),
  ]);
  printBucketTable("=== BMW configurator hit rate by model year ===", imagesByYear);
  printBucketTable("=== BMW manuals portal hit rate by model year ===", manualsByYear);

  // Per-chassis (top 15 by VIN count)
  const byChassis = groupBy(outcomes, (o) => (o.chassis || "(unknown)") as any);
  const chassisRows = Array.from(byChassis.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 15);
  const imagesByChassis: Array<[string, BucketCounters]> = chassisRows.map(([c, items]) => [
    c, tally(items, (o) => ({ attempted: o.imagesAttempted, hit: o.imagesHit })),
  ]);
  const manualsByChassis: Array<[string, BucketCounters]> = chassisRows.map(([c, items]) => [
    c, tally(items, (o) => ({ attempted: o.manualsAttempted, hit: o.manualsHit })),
  ]);
  printBucketTable("=== BMW configurator hit rate by chassis (top 15) ===", imagesByChassis);
  printBucketTable("=== BMW manuals portal hit rate by chassis (top 15) ===", manualsByChassis);

  // Structural gaps — buckets where hit rate is 0% across >= 3 attempts
  console.log("\n=== Structural gaps (0% hit, ≥3 attempts) ===");
  const gaps: string[] = [];
  for (const [label, b] of imagesByYear) {
    if (b.attempted >= 3 && b.hit === 0) gaps.push(`  configurator: ${label} (${b.attempted} attempted, all 404)`);
  }
  for (const [label, b] of manualsByYear) {
    if (b.attempted >= 3 && b.hit === 0) gaps.push(`  manuals:      ${label} (${b.attempted} attempted, none indexed)`);
  }
  if (gaps.length === 0) {
    console.log("  (none — every year bucket with >=3 attempts has at least one hit)");
  } else {
    for (const line of gaps) console.log(line);
    console.log("\n  → bimmer.work fallback is structurally required for the year buckets above.");
  }

  // Sample misses for ops debugging
  const sampleImageMisses = outcomes.filter((o) => o.imagesAttempted && o.imagesHit === false).slice(0, 5);
  const sampleManualMisses = outcomes.filter((o) => o.manualsAttempted && o.manualsHit === false).slice(0, 5);
  if (sampleImageMisses.length) {
    console.log("\nSample configurator misses:");
    for (const o of sampleImageMisses) {
      const v = resolved.find((r) => r.vin === o.vin)!;
      console.log(`  ${o.vin}  type=${v.typeCode}  paint=${v.paintCode}  year=${o.modelYear}  reason=${o.imagesReason}`);
    }
  }
  if (sampleManualMisses.length) {
    console.log("\nSample manuals misses:");
    for (const o of sampleManualMisses) {
      const v = resolved.find((r) => r.vin === o.vin)!;
      console.log(`  ${o.vin}  model="${v.modelName}"  year=${o.modelYear}  reason=${o.manualsReason}`);
    }
  }

  // Optional JSON dump for the admin dashboard / future trending.
  if (ARGS.out) {
    const report = {
      generatedAt: new Date().toISOString(),
      args: ARGS,
      totals: { total, images: imagesOverall, manuals: manualsOverall },
      byYear: {
        images: Object.fromEntries(imagesByYear),
        manuals: Object.fromEntries(manualsByYear),
      },
      byChassis: {
        images: Object.fromEntries(imagesByChassis),
        manuals: Object.fromEntries(manualsByChassis),
      },
      gaps,
      outcomes,
    };
    writeFileSync(ARGS.out, JSON.stringify(report, null, 2));
    console.log(`\n[audit-bmw-coverage] full JSON report saved to ${ARGS.out}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[audit-bmw-coverage] FAILED:", err);
  process.exit(1);
});
